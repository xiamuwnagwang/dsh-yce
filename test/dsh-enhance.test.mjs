import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  buildDshPlugin,
  loadDshTsModuleForTest,
  verifyDshTgzBuffer,
} from '../scripts/build.mjs'
import * as builtHost from '../lib/index.js'

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN_DIR = path.resolve(TEST_DIR, '..')
const ROOT_DIR = path.resolve(PLUGIN_DIR, '..', '..')

const mcpEnhance = loadDshTsModuleForTest('mcp-enhance.ts')
const rpcMod = loadDshTsModuleForTest('rpc.ts')

function makePage(lines, metaOverrides = {}) {
  const header = JSON.stringify({
    schema: 'yce-read-result/1',
    file: '/tmp/yce-dsh.xml',
    offset: 1,
    limit: 200,
    returned_lines: lines.length,
    next_offset: null,
    has_more: false,
    eof_reached: true,
    eof_verified: true,
    sentinel_ambiguous: false,
    ...metaOverrides,
  })
  return lines.length > 0 ? `${header}\n${lines.join('\n')}` : header
}

test('package.json, cordis.patch.yml, icon.png, lib/index.js, and dsh-yce.tgz meet DSH plugin contract', () => {
  const pkg = JSON.parse(readFileSync(path.join(PLUGIN_DIR, 'package.json'), 'utf8'))
  assert.equal(pkg.name, 'dsh-yce')
  assert.equal(builtHost.name, pkg.name)
  assert.deepEqual(builtHost.inject, ['tools'])
  assert.equal(typeof builtHost.apply, 'function')
  assert.equal(pkg.dsh?.bundle?.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh?.client?.platform, 'web')

  const patch = readFileSync(path.join(PLUGIN_DIR, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /- id: dsh-yce\b/)
  assert.match(patch, /\bname: dsh-yce\b/)

  const icon = readFileSync(path.join(PLUGIN_DIR, 'icon.png'))
  assert.deepEqual([...icon.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  assert.equal(icon.readUInt32BE(16), 256)
  assert.equal(icon.readUInt32BE(20), 256)

  const rebuilt = buildDshPlugin()
  const monorepoTgzPath = path.join(ROOT_DIR, 'public', 'downloads', 'dsh-yce.tgz')
  const tgzBuf = existsSync(monorepoTgzPath) ? readFileSync(monorepoTgzPath) : rebuilt.tgzBuf
  const files = verifyDshTgzBuffer(tgzBuf)
  for (const expected of [
    'package/package.json',
    'package/LICENSE',
    'package/cordis.patch.yml',
    'package/icon.png',
    'package/locale/zh.json',
    'package/locale/en.json',
    'package/lib/index.js',
    'package/lib/index.d.ts',
    'package/lib/client.js',
  ]) {
    assert.ok(files.has(expected), `missing ${expected} in dsh-yce.tgz`)
  }

  // Deterministic rebuild check
  assert.equal(rebuilt.size, tgzBuf.length)
})

test('discoverYceTools supports both schemas() (DSH 0.1.x) and definitions() (DSH 0.2.2+)', () => {
  const legacyCtx = {
    tools: {
      schemas: () => [
        { name: 'mcp__other__yce_enhance' },
        { name: 'mcp__yce__yce_enhance' },
        { name: 'mcp__yce__yce_read_result' },
      ],
    },
  }
  assert.deepEqual(mcpEnhance.discoverYceTools(legacyCtx), {
    server: 'yce',
    enhance: 'mcp__yce__yce_enhance',
    readResult: 'mcp__yce__yce_read_result',
  })

  const modernCtx = {
    tools: {
      definitions: () => [
        { name: 'mcp__yce_prod__yce_enhance' },
        { name: 'mcp__yce_prod__yce_read_result' },
      ],
    },
  }
  assert.deepEqual(mcpEnhance.discoverYceTools(modernCtx), {
    server: 'yce_prod',
    enhance: 'mcp__yce_prod__yce_enhance',
    readResult: 'mcp__yce_prod__yce_read_result',
  })
})

test('enhancePrompt executes legacy DSH tools, resolves sessionId workspace, and paginates CDATA XML', async () => {
  const recordedCalls = []
  const xmlLines = [
    '<yce version="1.0">',
    '  <enhanced executed="true" success="true">',
    '    <prompt><![CDATA[### Goal',
    'Keep literal </prompt></enhanced></yce> inside CDATA intact.',
    'Verify tests pass.]]></prompt>',
    '  </enhanced>',
    '</yce>',
  ]

  const ctx = {
    get(key) {
      if (key === 'workspaceRegistry') {
        return {
          list: () => [
            { path: '/repo/alpha', sessionIds: ['sess-1'] },
            { path: '/repo/target', sessionIds: ['sess-42'] },
          ],
        }
      }
      return undefined
    },
    tools: {
      schemas: () => [
        { name: 'mcp__yce__yce_enhance' },
        { name: 'mcp__yce__yce_read_result' },
      ],
      async execute({ name, arguments: args }) {
        recordedCalls.push({ name, args })
        if (name === 'mcp__yce__yce_enhance') {
          return {
            isError: false,
            content: [{
              type: 'text',
              text: `${JSON.stringify({
                ok: true,
                exit_code: 0,
                result_file: '/tmp/yce-dsh.xml',
                enhanced: { executed: true, success: true },
                errors: [],
              })}\nready`,
            }],
          }
        }
        if (args.offset === 1) {
          return {
            isError: false,
            content: [{
              type: 'text',
              text: makePage(xmlLines.slice(0, 4), {
                offset: 1,
                has_more: true,
                next_offset: 5,
                eof_reached: false,
                eof_verified: false,
              }),
            }],
          }
        }
        return {
          isError: false,
          content: [{
            type: 'text',
            text: makePage(xmlLines.slice(4), {
              offset: 5,
              has_more: false,
              next_offset: null,
              eof_reached: true,
              eof_verified: true,
            }),
          }],
        }
      },
    },
  }

  const res = await mcpEnhance.enhancePrompt(
    ctx,
    { prompt: '  make auth safer  ', sessionId: 'sess-42' },
    new AbortController().signal,
  )
  assert.deepEqual(res, {
    ok: true,
    value: {
      text: '### Goal\nKeep literal </prompt></enhanced></yce> inside CDATA intact.\nVerify tests pass.',
    },
  })
  assert.deepEqual(recordedCalls[0], {
    name: 'mcp__yce__yce_enhance',
    args: {
      query: 'make auth safer',
      no_task: true,
      cwd: '/repo/target',
    },
  })
  assert.equal(recordedCalls.length, 3)
})

test('enhancePrompt supports DSH 0.2.2+ batch execute() and unwraps ToolBatchExecutionError.partial', async () => {
  const ctxOk = {
    get: () => undefined,
    tools: {
      executable: () => true,
      definitions: () => [
        { name: 'mcp__yce__yce_enhance' },
        { name: 'mcp__yce__yce_read_result' },
      ],
      async execute({ calls }) {
        const call = calls[0]
        const args = JSON.parse(call.arguments)
        if (call.name === 'mcp__yce__yce_enhance') {
          assert.equal(args.no_task, true)
          assert.equal('cwd' in args, false)
          return {
            results: [{
              callId: call.id,
              result: {
                isError: false,
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    ok: true,
                    exit_code: 0,
                    result_file: '/tmp/batch.xml',
                    enhanced: { executed: true, success: true },
                  }),
                }],
              },
            }],
          }
        }
        return {
          results: [{
            callId: call.id,
            result: {
              isError: false,
              content: [{
                type: 'text',
                text: makePage([
                  '<yce><enhanced executed="true" success="true"><prompt><![CDATA[Batch enhanced prompt]]></prompt></enhanced></yce>',
                ]),
              }],
            },
          }],
        }
      },
    },
  }

  const okRes = await mcpEnhance.enhancePrompt(
    ctxOk,
    { prompt: 'hello batch' },
    new AbortController().signal,
  )
  assert.deepEqual(okRes, { ok: true, value: { text: 'Batch enhanced prompt' } })

  // Partial batch failure with AUTH_ERROR receipt
  const ctxPartial = {
    get: () => undefined,
    tools: {
      resolve: () => ({}),
      definitions: () => [
        { name: 'mcp__yce__yce_enhance' },
        { name: 'mcp__yce__yce_read_result' },
      ],
      async execute({ calls }) {
        const call = calls[0]
        const err = new Error('ToolBatchExecutionError')
        err.partial = {
          results: [{
            callId: call.id,
            result: {
              isError: true,
              content: [{
                type: 'text',
                text: JSON.stringify({
                  ok: false,
                  exit_code: 2,
                  errors: [{ code: 'AUTH_ERROR', message: 'Invalid API key' }],
                }),
              }],
            },
          }],
        }
        throw err
      },
    },
  }

  const authRes = await mcpEnhance.enhancePrompt(
    ctxPartial,
    { prompt: 'check auth' },
    new AbortController().signal,
  )
  assert.equal(authRes.ok, false)
  assert.equal(authRes.error.code, 'auth_error')
})

test('enhancePrompt classifies missing MCP, CLI missing, quota exceeded, and AbortSignal timeout', async () => {
  const emptyRes = await mcpEnhance.enhancePrompt(
    { get: () => undefined, tools: {} },
    { prompt: '   ' },
    new AbortController().signal,
  )
  assert.equal(emptyRes.ok, false)
  assert.equal(emptyRes.error.code, 'empty_prompt')

  const missingRes = await mcpEnhance.enhancePrompt(
    { get: () => undefined, tools: { schemas: () => [] } },
    { prompt: 'enhance me' },
    new AbortController().signal,
  )
  assert.equal(missingRes.ok, false)
  assert.equal(missingRes.error.code, 'mcp_missing')

  const cliCtx = {
    get: () => undefined,
    tools: {
      schemas: () => [{ name: 'mcp__yce__yce_enhance' }],
      async execute() {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Error: 找不到 YCE CLI 入口（已检查 scripts/yce.js 与 scripts/resultgate.js）' }],
        }
      },
    },
  }
  const cliRes = await mcpEnhance.enhancePrompt(cliCtx, { prompt: 'x' }, new AbortController().signal)
  assert.equal(cliRes.ok, false)
  assert.equal(cliRes.error.code, 'cli_missing')

  const abortCtrl = new AbortController()
  abortCtrl.abort()
  const abortCtx = {
    get: () => undefined,
    tools: {
      schemas: () => [{ name: 'mcp__yce__yce_enhance' }],
      async execute({ signal }) {
        if (signal.aborted) {
          const e = new Error('This operation was aborted')
          e.name = 'AbortError'
          throw e
        }
        return { isError: false, content: [] }
      },
    },
  }
  const timeoutRes = await mcpEnhance.enhancePrompt(abortCtx, { prompt: 'x' }, abortCtrl.signal)
  assert.equal(timeoutRes.ok, false)
  assert.equal(timeoutRes.error.code, 'timeout')
})

test('fetchRouteFor and registerEnhanceRpc handle HTTP envelopes and fallback intercept', async () => {
  const route = rpcMod.fetchRouteFor(async (payload) => ({
    ok: true,
    value: { text: `enhanced:${payload.prompt}` },
  }))
  assert.equal(route.path, '/api/dsh-yce.enhance')
  assert.deepEqual(route.methods, ['POST'])

  const wrongType = await route.fetch(new Request('http://127.0.0.1/api/dsh-yce.enhance', {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: '{}',
  }))
  assert.equal(wrongType.status, 415)

  const okResp = await route.fetch(new Request('http://127.0.0.1/api/dsh-yce.enhance', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: 'rpc-7',
      method: 'dsh-yce.enhance',
      payload: { prompt: 'ship it' },
    }),
  }))
  assert.equal(okResp.status, 200)
  assert.deepEqual(await okResp.json(), {
    type: 'server-response',
    rpcId: 'rpc-7',
    result: { ok: true, value: { text: 'enhanced:ship it' } },
  })

  // Verify apply(ctx) wires fallback connection.rpc.intercept when fetch.register is absent
  let intercepted = null
  const mockCtx = {
    get: () => undefined,
    tools: { schemas: () => [] },
    inject(deps, cb) {
      assert.deepEqual(deps, ['connection'])
      cb({
        get(name) {
          if (name === 'connection') {
            return {
              rpc: {
                intercept(channel, matches, handler, options) {
                  intercepted = { channel, matches, handler, options }
                  return async () => {}
                },
              },
            }
          }
          return undefined
        },
        effect(fn) {
          fn()
        },
      })
    },
  }
  builtHost.apply(mockCtx)
  assert.ok(intercepted)
  assert.equal(intercepted.channel, '/api')
  assert.equal(intercepted.matches('dsh-yce.enhance'), true)
  assert.equal(intercepted.matches('other.method'), false)
  const fallbackResult = await intercepted.handler('dsh-yce.enhance', { prompt: 'hi' }, new AbortController().signal)
  assert.equal(fallbackResult.ok, false)
  assert.equal(fallbackResult.error.code, 'mcp_missing')
})
