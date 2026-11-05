import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import {
  ENHANCE_TIMEOUT_MS,
  MAX_READ_PAGES,
  READ_PAGE_LIMIT,
  type EnhanceErrorCode,
  type EnhanceOk,
  type EnhanceRequest,
  type RpcResult,
} from './protocol.ts'

const ENHANCE_SUFFIX = '__yce_enhance'
const READ_SUFFIX = '__yce_read_result'
const MCP_PREFIX = 'mcp__'

export interface DiscoveredYceTools {
  server: string
  enhance: string
  readResult?: string
}

interface StructuredError {
  code?: string
  source?: string
  message?: string
}

interface ParsedReceiptOutput {
  receipt: Record<string, unknown> | null
  notes: string
  inlineXml: string | null
  invalidReceipt?: boolean
}

interface ReadResultPage {
  meta: {
    schema: string
    returned_lines: number
    has_more?: boolean
    next_offset?: number | null
    eof_reached?: boolean
    eof_verified?: boolean
    sentinel_ambiguous?: boolean
  }
  lines: string[]
}

interface ParsedEnhancedXml {
  present: boolean
  executed: boolean
  success: boolean
  prompt: string
  errors: StructuredError[]
}

const ENHANCE_TIMEOUT_MESSAGE = `Enhancement timed out (${ENHANCE_TIMEOUT_MS / 1000}s). Check YCE_TIMEOUT_ENHANCE_MS or toolCallTimeoutMs on the yce-mcp entry.`

function fail(code: EnhanceErrorCode, message: string): RpcResult<EnhanceOk> {
  return { ok: false, error: { code, message, details: {} } }
}

function ok(value: EnhanceOk): RpcResult<EnhanceOk> {
  return { ok: true, value }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === 'object') return value as Record<string, unknown>
  return undefined
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function toolNames(ctx: Context): string[] {
  const names = new Set<string>()
  const runtime = ctx.tools as {
    schemas?: () => readonly { name?: string }[]
    definitions?: (scope?: unknown, toolSet?: unknown) => readonly { name?: string }[]
  }
  try {
    for (const schema of runtime.schemas?.() ?? []) {
      if (typeof schema?.name === 'string' && schema.name.length > 0) names.add(schema.name)
    }
  } catch { /* older runtimes */ }
  try {
    for (const definition of runtime.definitions?.() ?? []) {
      if (typeof definition?.name === 'string' && definition.name.length > 0) names.add(definition.name)
    }
  } catch { /* 0.1.1 has no definitions() */ }
  return [...names]
}

function serverOf(name: string, suffix: string): string | undefined {
  if (!name.endsWith(suffix)) return undefined
  const index = name.length - suffix.length
  if (index <= 0) return undefined
  if (name.startsWith(MCP_PREFIX)) {
    return name.slice(MCP_PREFIX.length, index) || undefined
  }
  return name.slice(0, index).replace(/_+$/g, '') || undefined
}

export function discoverYceTools(ctx: Context): DiscoveredYceTools | undefined {
  const names = toolNames(ctx)
  const enhanceByServer = new Map<string, string>()
  const readByServer = new Map<string, string>()

  for (const name of names) {
    const enhanceServer = serverOf(name, ENHANCE_SUFFIX)
    if (enhanceServer !== undefined && !enhanceByServer.has(enhanceServer)) {
      enhanceByServer.set(enhanceServer, name)
    }
    const readServer = serverOf(name, READ_SUFFIX)
    if (readServer !== undefined && !readByServer.has(readServer)) {
      readByServer.set(readServer, name)
    }
  }

  const servers = [...enhanceByServer.keys()]
  if (servers.length === 0) return undefined
  const isYce = (item: string) => item.toLowerCase().includes('yce')
  const server = servers.find((item) => isYce(item) && readByServer.has(item))
    ?? servers.find(isYce)
    ?? servers.find((item) => readByServer.has(item))
    ?? servers[0]
  if (server === undefined) return undefined
  const enhance = enhanceByServer.get(server)
  if (enhance === undefined) return undefined
  const readResult = readByServer.get(server)
  return {
    server,
    enhance,
    ...(readResult === undefined ? {} : { readResult }),
  }
}

/** Join text blocks without trimming so `yce_read_result` line counts remain exact. */
function rawContentText(result: ToolExecutionResult): string {
  const parts: string[] = []
  for (const block of result.content) {
    if (
      block
      && typeof block === 'object'
      && 'type' in block
      && block.type === 'text'
      && 'text' in block
      && typeof block.text === 'string'
    ) {
      parts.push(block.text)
    }
  }
  return parts.join('\n')
}

function workspacePathFromRegistry(ctx: Context, sessionId: string): string | undefined {
  const registry = ctx.get('workspaceRegistry') as { list?: () => unknown } | undefined
  const listed = typeof registry?.list === 'function' ? registry.list() : undefined
  const rows = Array.isArray(listed) ? listed : []
  for (const row of rows) {
    const rec = asRecord(row)
    if (rec === undefined) continue
    const ids = rec.sessionIds
    if (!Array.isArray(ids) || !ids.includes(sessionId)) continue
    const path = nonEmpty(rec.path)
    if (path !== undefined) return path
  }
  return undefined
}

function resolveWorkspacePath(ctx: Context, record: EnhanceRequest): string | undefined {
  const direct = nonEmpty(record.workspacePath)
  if (direct !== undefined) return direct
  const sessionId = nonEmpty(record.sessionId)
  if (sessionId === undefined) return undefined
  return workspacePathFromRegistry(ctx, sessionId)
}

function isFailure(result: ToolExecutionResult, text: string): boolean {
  return result.isError || text.trimStart().startsWith('Error:')
}

function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'AbortError') return true
  if (
    typeof error === 'object'
    && error !== null
    && 'name' in error
    && (error as { name: unknown }).name === 'AbortError'
  ) {
    return true
  }
  const message = error instanceof Error ? error.message : String(error)
  return /abort|timeout/i.test(message)
}

export function extractLeadingJsonObject(
  text: string,
): { json: Record<string, unknown>; endIndex: number } | null {
  let start = 0
  while (start < text.length && /\s/.test(text[start] ?? '')) start += 1
  if (text[start] !== '{') return null

  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === '{') {
      depth += 1
    } else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          const parsed: unknown = JSON.parse(text.slice(start, i + 1))
          const rec = asRecord(parsed)
          return rec ? { json: rec, endIndex: i + 1 } : null
        } catch {
          return null
        }
      }
    }
  }
  return null
}

export function parseReceiptOutput(content: string): ParsedReceiptOutput {
  const leading = extractLeadingJsonObject(content)
  if (leading !== null) {
    return {
      receipt: leading.json,
      notes: content.slice(leading.endIndex).trim(),
      inlineXml: null,
    }
  }
  const tagMatch = /<yce-receipt>\s*([\s\S]*?)\s*<\/yce-receipt>/.exec(content)
  if (tagMatch?.[1] !== undefined) {
    try {
      const parsed: unknown = JSON.parse(tagMatch[1])
      return { receipt: asRecord(parsed) ?? null, notes: content, inlineXml: null }
    } catch {
      return { receipt: null, notes: content, inlineXml: null, invalidReceipt: true }
    }
  }
  if (content.includes('<yce')) {
    return { receipt: null, notes: content, inlineXml: content }
  }
  return { receipt: null, notes: content, inlineXml: null }
}

export function parseReadResultPage(content: string): ReadResultPage | null {
  const leading = extractLeadingJsonObject(content)
  if (!leading || leading.json.schema !== 'yce-read-result/1') return null
  const rawCount = leading.json.returned_lines
  if (typeof rawCount !== 'number' || !Number.isInteger(rawCount) || rawCount < 0) return null

  const meta = leading.json as unknown as ReadResultPage['meta']
  if (rawCount === 0) return { meta, lines: [] }

  let remainder = content.slice(leading.endIndex)
  if (remainder.startsWith('\r\n')) remainder = remainder.slice(2)
  else if (remainder.startsWith('\n')) remainder = remainder.slice(1)

  const allLines = remainder.split('\n')
  if (allLines.length < rawCount) return null
  return {
    meta,
    lines: allLines.slice(allLines.length - rawCount),
  }
}

function decodeXmlEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g,
    (full, entity: string) => {
      switch (entity) {
        case 'lt': return '<'
        case 'gt': return '>'
        case 'amp': return '&'
        case 'quot': return '"'
        case 'apos': return "'"
        default: {
          const code = entity.startsWith('#x')
            ? Number.parseInt(entity.slice(2), 16)
            : Number.parseInt(entity.slice(1), 10)
          return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : full
        }
      }
    },
  )
}

function parseAttributes(attrText: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const re = /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
  let match: RegExpExecArray | null
  while ((match = re.exec(attrText)) !== null) {
    const key = match[1]
    if (key) attrs[key] = decodeXmlEntities(match[2] ?? match[3] ?? '')
  }
  return attrs
}

interface XmlOpenTag {
  start: number
  end: number
  selfClosing: boolean
  attrs: Record<string, string>
}

function findTagOutsideCdata(xml: string, tagName: string, fromIndex = 0): XmlOpenTag | null {
  let i = fromIndex
  const needle = `<${tagName}`
  while (i < xml.length) {
    if (xml.startsWith('<![CDATA[', i)) {
      const end = xml.indexOf(']]>', i + 9)
      if (end < 0) return null
      i = end + 3
      continue
    }
    if (xml.startsWith('<!--', i)) {
      const end = xml.indexOf('-->', i + 4)
      if (end < 0) return null
      i = end + 3
      continue
    }
    if (xml.startsWith(needle, i)) {
      const boundary = xml[i + needle.length]
      if (boundary === undefined || /[\s>/]/.test(boundary)) {
        let j = i + needle.length
        let quote = ''
        while (j < xml.length) {
          const ch = xml[j]
          if (quote) {
            if (ch === quote) quote = ''
          } else if (ch === '"' || ch === "'") {
            quote = ch
          } else if (ch === '>') {
            const rawInside = xml.slice(i + needle.length, j)
            const selfClosing = rawInside.trimEnd().endsWith('/')
            const attrSource = selfClosing ? rawInside.replace(/\/\s*$/, '') : rawInside
            return {
              start: i,
              end: j + 1,
              selfClosing,
              attrs: parseAttributes(attrSource),
            }
          }
          j += 1
        }
        return null
      }
    }
    i += 1
  }
  return null
}

function readTextElementContent(
  xml: string,
  tag: XmlOpenTag,
  tagName: string,
): { text: string; end: number } | null {
  if (tag.selfClosing) return { text: '', end: tag.end }
  const closeNeedle = `</${tagName}`
  let i = tag.end
  let out = ''
  while (i < xml.length) {
    if (xml.startsWith('<![CDATA[', i)) {
      const end = xml.indexOf(']]>', i + 9)
      if (end < 0) return null
      out += xml.slice(i + 9, end)
      i = end + 3
      continue
    }
    if (xml.startsWith('<!--', i)) {
      const end = xml.indexOf('-->', i + 4)
      if (end < 0) return null
      i = end + 3
      continue
    }
    if (xml.startsWith(closeNeedle, i)) {
      const after = xml[i + closeNeedle.length]
      if (after === '>' || /\s/.test(after ?? '')) {
        const closeEnd = xml.indexOf('>', i + closeNeedle.length)
        if (closeEnd < 0) return null
        return { text: out, end: closeEnd + 1 }
      }
    }
    const nextSpecial = xml.indexOf('<', i + 1)
    const sliceEnd = nextSpecial < 0 ? xml.length : nextSpecial
    out += decodeXmlEntities(xml.slice(i, sliceEnd))
    i = sliceEnd
  }
  return null
}

function findClosingTagOutsideCdata(xml: string, tagName: string, fromIndex: number): number {
  const closeNeedle = `</${tagName}`
  let i = fromIndex
  while (i < xml.length) {
    if (xml.startsWith('<![CDATA[', i)) {
      const end = xml.indexOf(']]>', i + 9)
      if (end < 0) return -1
      i = end + 3
      continue
    }
    if (xml.startsWith('<!--', i)) {
      const end = xml.indexOf('-->', i + 4)
      if (end < 0) return -1
      i = end + 3
      continue
    }
    if (xml.startsWith(closeNeedle, i)) {
      const after = xml[i + closeNeedle.length]
      if (after === '>' || /\s/.test(after ?? '')) {
        const closeEnd = xml.indexOf('>', i + closeNeedle.length)
        return closeEnd < 0 ? -1 : closeEnd + 1
      }
    }
    i += 1
  }
  return -1
}

export function parseEnhancedXml(xml: string): ParsedEnhancedXml | null {
  if (!xml.includes('<yce')) return null
  const yceRoot = findTagOutsideCdata(xml, 'yce', 0)
  if (!yceRoot) return null
  const yceClose = yceRoot.selfClosing
    ? yceRoot.end
    : findClosingTagOutsideCdata(xml, 'yce', yceRoot.end)
  if (yceClose < 0) return null

  const errors: StructuredError[] = []
  const errorsTag = findTagOutsideCdata(xml, 'errors', yceRoot.end)
  if (errorsTag && !errorsTag.selfClosing && errorsTag.start < yceClose) {
    const errorsEnd = findClosingTagOutsideCdata(xml, 'errors', errorsTag.end)
    let cursor = errorsTag.end
    const limit = errorsEnd > 0 ? errorsEnd : yceClose
    while (cursor < limit) {
      const errTag = findTagOutsideCdata(xml, 'error', cursor)
      if (!errTag || errTag.start >= limit) break
      const read = readTextElementContent(xml, errTag, 'error')
      if (!read) break
      errors.push({
        code: errTag.attrs.code ?? '',
        source: errTag.attrs.source ?? '',
        message: read.text.trim(),
      })
      cursor = read.end
    }
  }

  const enhancedTag = findTagOutsideCdata(xml, 'enhanced', yceRoot.end)
  if (!enhancedTag || enhancedTag.start >= yceClose) {
    return { present: false, executed: false, success: false, prompt: '', errors }
  }
  if (enhancedTag.selfClosing) {
    return {
      present: true,
      executed: enhancedTag.attrs.executed === 'true',
      success: enhancedTag.attrs.success === 'true',
      prompt: '',
      errors,
    }
  }
  const enhancedEnd = findClosingTagOutsideCdata(xml, 'enhanced', enhancedTag.end)
  if (enhancedEnd < 0) return null

  let prompt = ''
  const promptTag = findTagOutsideCdata(xml, 'prompt', enhancedTag.end)
  if (promptTag && promptTag.start < enhancedEnd) {
    const read = readTextElementContent(xml, promptTag, 'prompt')
    if (!read) return null
    prompt = read.text
  }

  return {
    present: true,
    executed: enhancedTag.attrs.executed === 'true',
    success: enhancedTag.attrs.success === 'true',
    prompt,
    errors,
  }
}

export function classifyFailure(
  text: string,
  structuredErrors: readonly unknown[] = [],
): EnhanceErrorCode | undefined {
  const codes: string[] = []
  const messages: string[] = [text]
  for (const item of structuredErrors) {
    if (!item) continue
    if (typeof item === 'string') {
      messages.push(item)
    } else if (typeof item === 'object') {
      const rec = item as Record<string, unknown>
      if (typeof rec.code === 'string') codes.push(rec.code.toUpperCase())
      if (typeof rec.message === 'string') messages.push(rec.message)
    }
  }

  for (const code of codes) {
    if (code === 'AUTH_ERROR' || code === 'UNAUTHORIZED' || code === 'INVALID_TOKEN' || code === 'MISSING_TOKEN') {
      return 'auth_error'
    }
    if (code.includes('QUOTA') || code === 'RATE_LIMITED') {
      return 'quota_exceeded'
    }
    if (code === 'NOT_DEPLOYED') {
      return 'not_deployed'
    }
    if (code === 'DEPENDENCY_NOT_FOUND') {
      return 'cli_missing'
    }
    if (code === 'TIMEOUT' || code === 'ABORTED') {
      return 'timeout'
    }
  }

  const combined = messages.join('\n')
  const lower = combined.toLowerCase()
  if (
    combined.includes('找不到 YCE CLI')
    || lower.includes('yce_mcp_skill_root')
    || (lower.includes('scripts/yce.js') && lower.includes('resultgate.js'))
  ) {
    return 'cli_missing'
  }
  if (
    lower.includes('yce_relay_token')
    || lower.includes('invalid api key')
    || lower.includes('unauthorized')
    || /\bhttp\s*401\b/.test(lower)
    || combined.includes('未配置检索凭证')
    || combined.includes('凭证无效')
  ) {
    return 'auth_error'
  }
  if (
    lower.includes('quota')
    || combined.includes('额度')
    || combined.includes('次数已用')
    || /\bhttp\s*402\b/.test(lower)
  ) {
    return 'quota_exceeded'
  }
  if (lower.includes('not_deployed') || combined.includes('尚未部署')) {
    return 'not_deployed'
  }
  if (
    lower.includes('timed out')
    || lower.includes('timeout')
    || lower.includes('tool call aborted')
    || combined.includes('超时杀掉')
    || combined.includes('请求超时')
  ) {
    return 'timeout'
  }
  return undefined
}

function failFromYce(
  notes: string,
  structuredErrors: readonly unknown[],
  fallbackMessage: string,
): RpcResult<EnhanceOk> {
  const firstMsg = structuredErrors
    .map((item) => (typeof item === 'object' && item !== null ? (item as { message?: unknown }).message : undefined))
    .find((msg): msg is string => typeof msg === 'string' && msg.trim().length > 0)
  const detail = firstMsg ?? (notes.trim() || fallbackMessage)
  const code = classifyFailure(notes, structuredErrors)
  if (code === 'timeout') return fail('timeout', ENHANCE_TIMEOUT_MESSAGE)
  return fail(code ?? 'upstream', detail)
}

interface LegacyToolRuntime {
  execute(exec: {
    callId: string
    name: string
    arguments: Record<string, unknown>
    signal: AbortSignal
  }): Promise<ToolExecutionResult>
}

interface BatchToolRuntime {
  execute(input: {
    calls: readonly { type: 'tool-call'; id: string; name: string; arguments: string }[]
    signal: AbortSignal
  }): Promise<unknown>
}

function usesBatchExecute(tools: unknown): boolean {
  const runtime = tools as { executable?: unknown; resolve?: unknown }
  return typeof runtime.executable === 'function' || typeof runtime.resolve === 'function'
}

function batchResultFor(batch: unknown, callId: string): ToolExecutionResult | undefined {
  const results = asRecord(batch)?.results
  if (!Array.isArray(results)) return undefined
  const row = results.find((entry) => asRecord(entry)?.callId === callId)
    ?? (results.length === 1 ? results[0] : undefined)
  const result = asRecord(row)?.result
  return asRecord(result) === undefined ? undefined : (result as unknown as ToolExecutionResult)
}

async function callTool(
  ctx: Context,
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<ToolExecutionResult> {
  const callId = `dsh-yce-${Date.now()}-${Math.random().toString(16).slice(2)}`
  if (!usesBatchExecute(ctx.tools)) {
    return (ctx.tools as unknown as LegacyToolRuntime).execute({
      callId,
      name,
      arguments: args,
      signal,
    })
  }
  let batch: unknown
  try {
    batch = await (ctx.tools as unknown as BatchToolRuntime).execute({
      calls: [{ type: 'tool-call', id: callId, name, arguments: JSON.stringify(args) }],
      signal,
    })
  } catch (error) {
    const partial = batchResultFor(asRecord(error)?.partial, callId)
    if (partial !== undefined) return partial
    throw error
  }
  const result = batchResultFor(batch, callId)
  if (result === undefined) throw new Error(`${name}: tool batch returned no result`)
  return result
}

export async function enhancePrompt(
  ctx: Context,
  payload: unknown,
  signal: AbortSignal,
): Promise<RpcResult<EnhanceOk>> {
  if (typeof payload !== 'object' || payload === null) {
    return fail('empty_prompt', 'payload must be an object')
  }
  const record = payload as EnhanceRequest
  const prompt = typeof record.prompt === 'string' ? record.prompt.trim() : ''
  if (prompt.length === 0) return fail('empty_prompt', 'prompt is empty')

  const tools = discoverYceTools(ctx)
  if (tools === undefined) {
    return fail(
      'mcp_missing',
      'YCE MCP tool yce_enhance was not found. Configure yce-mcp in this profile.',
    )
  }

  const workspacePath = resolveWorkspacePath(ctx, record)
  const callArgs: Record<string, unknown> = {
    query: prompt,
    no_task: true,
    ...(workspacePath !== undefined ? { cwd: workspacePath } : {}),
  }

  const enhanceAbort = new AbortController()
  const onParentAbort = () => enhanceAbort.abort()
  if (signal.aborted) enhanceAbort.abort()
  else signal.addEventListener('abort', onParentAbort, { once: true })
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    enhanceAbort.abort()
  }, ENHANCE_TIMEOUT_MS)

  try {
    let enhanceResult: ToolExecutionResult
    try {
      enhanceResult = await callTool(ctx, tools.enhance, callArgs, enhanceAbort.signal)
    } catch (error) {
      if (timedOut || isAbortError(error)) return fail('timeout', ENHANCE_TIMEOUT_MESSAGE)
      const message = error instanceof Error ? error.message : String(error)
      return fail(classifyFailure(message) ?? 'upstream', message)
    }

    if (timedOut) return fail('timeout', ENHANCE_TIMEOUT_MESSAGE)
    const rawEnhance = rawContentText(enhanceResult)
    const parsedReceipt = parseReceiptOutput(rawEnhance)
    if (parsedReceipt.invalidReceipt) {
      return fail('upstream', 'yce_enhance returned malformed <yce-receipt> JSON')
    }

    const receipt = parsedReceipt.receipt
    if (receipt !== null) {
      const receiptErrors = Array.isArray(receipt.errors) ? receipt.errors : []
      const enhancedMeta = asRecord(receipt.enhanced)
      if (
        isFailure(enhanceResult, rawEnhance)
        || receipt.ok === false
        || (typeof receipt.exit_code === 'number' && receipt.exit_code !== 0)
        || enhancedMeta?.success === false
      ) {
        return failFromYce(parsedReceipt.notes || rawEnhance, receiptErrors, 'yce_enhance failed')
      }

      const resultFile = nonEmpty(receipt.result_file)
      if (resultFile === undefined) {
        return fail('upstream', 'yce_enhance receipt did not include result_file')
      }
      if (tools.readResult === undefined) {
        return fail('mcp_missing', 'yce_read_result tool was not found on the configured yce-mcp server.')
      }

      const xmlLines: string[] = []
      let offset = 1
      let pages = 0
      while (pages < MAX_READ_PAGES) {
        let pageResult: ToolExecutionResult
        try {
          pageResult = await callTool(
            ctx,
            tools.readResult,
            { result_file: resultFile, offset, limit: READ_PAGE_LIMIT },
            enhanceAbort.signal,
          )
        } catch (error) {
          if (timedOut || isAbortError(error)) return fail('timeout', ENHANCE_TIMEOUT_MESSAGE)
          const message = error instanceof Error ? error.message : String(error)
          return fail('upstream', message)
        }

        if (timedOut) return fail('timeout', ENHANCE_TIMEOUT_MESSAGE)
        const rawPage = rawContentText(pageResult)
        if (isFailure(pageResult, rawPage)) {
          return failFromYce(rawPage, receiptErrors, 'yce_read_result failed')
        }

        const page = parseReadResultPage(rawPage)
        if (page === null) {
          return fail('upstream', 'yce_read_result returned an unexpected page format')
        }
        xmlLines.push(...page.lines)
        pages += 1

        if (!page.meta.has_more) {
          if (page.meta.eof_reached !== true) {
            return fail('upstream', 'yce_read_result stopped before reaching EOF')
          }
          if (!page.meta.eof_verified && !page.meta.sentinel_ambiguous) {
            return fail('upstream', 'YCE result file failed EOF sentinel verification')
          }
          break
        }

        if (
          typeof page.meta.next_offset !== 'number'
          || !Number.isInteger(page.meta.next_offset)
          || page.meta.next_offset <= offset
        ) {
          return fail('upstream', 'yce_read_result returned an invalid next_offset')
        }
        offset = page.meta.next_offset
      }

      if (pages >= MAX_READ_PAGES) {
        return fail('upstream', 'YCE result file exceeded maximum pagination limit')
      }

      const parsedXml = parseEnhancedXml(xmlLines.join('\n'))
      if (parsedXml === null) return fail('upstream', 'Failed to parse YCE XML result')
      const mergedErrors = [...receiptErrors, ...parsedXml.errors]
      if (!parsedXml.present || !parsedXml.executed || !parsedXml.success) {
        return failFromYce(parsedReceipt.notes, mergedErrors, 'YCE enhancement did not succeed')
      }
      const enhancedText = parsedXml.prompt.trim()
      if (enhancedText.length === 0) {
        return failFromYce(parsedReceipt.notes, mergedErrors, 'yce_enhance returned an empty prompt')
      }
      return ok({ text: enhancedText })
    }

    if (parsedReceipt.inlineXml !== null) {
      const parsedXml = parseEnhancedXml(parsedReceipt.inlineXml)
      if (parsedXml !== null && parsedXml.present && parsedXml.executed && parsedXml.success) {
        const enhancedText = parsedXml.prompt.trim()
        if (enhancedText.length > 0 && !isFailure(enhanceResult, rawEnhance)) {
          return ok({ text: enhancedText })
        }
      }
      return failFromYce(rawEnhance, parsedXml?.errors ?? [], 'yce_enhance failed')
    }

    if (isFailure(enhanceResult, rawEnhance)) {
      return failFromYce(rawEnhance, [], 'yce_enhance failed')
    }
    return fail('upstream', rawEnhance.trim() || 'yce_enhance returned an unrecognized response')
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onParentAbort)
  }
}
