import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Context } from '@deepseek-ai/cordis'
import React from 'react'
import { LOCALE_NAMESPACE, NAMESPACE } from './constants.ts'
import { buildDshMcpSnippet, type YceLocaleKey } from './locales.ts'
import { RPC_CHANNEL, RPC_ENDPOINT, type EnhanceOk, type RpcResult } from '../protocol.ts'
import { getRestore, setRestore, subscribeRestore } from './restore-store.ts'

type SessionListLike = {
  current?: string | undefined
  byId?: Readonly<Record<string, { cwd?: string | undefined } | undefined>> | undefined
}

type WorkspaceListLike = {
  items?: readonly {
    workspaceId?: string | undefined
    id?: string | undefined
    path?: string | undefined
    sessionIds?: readonly string[] | undefined
  }[] | undefined
  recentWorkspaceId?: string | undefined
}

type InputLike = {
  draft: string
  phase?: string
}

type SelectHook<S> = <T>(selector: (state: S) => T) => T

export type WandProps = PropsLocale<typeof LOCALE_NAMESPACE> & {
  sessionId?: string
  session?: unknown
  input?: InputLike
  inputActions?: { setDraft: (text: string) => void }
  useInput?: SelectHook<InputLike>
  useSession?: SelectHook<unknown>
  useSessions?: SelectHook<SessionListLike>
  useWorkspaces?: SelectHook<WorkspaceListLike>
}

type HookedPaths = {
  session: string | undefined
  sessions: string | undefined
  workspaces: string | undefined
}

type ListHolder = {
  list?: { getSnapshot?: () => unknown }
}

type WorkspaceRef = { path: string | undefined; sessionId: string | undefined }

type StatusLevel = 'idle' | 'busy' | 'ok' | 'error'

export const STATUS_CLEAR_MS: Partial<Record<StatusLevel, number>> = { ok: 3500, error: 5000 }
const SETUP_CLEAR_MS = 15000

export function needsMcpSetupHelp(code: string): boolean {
  return code === 'mcp_missing' || code === 'auth_error' || code === 'cli_missing'
}

async function writeBrowserClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fall back to execCommand below (e.g. non-HTTPS LAN dsh web)
    }
  }
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', 'true')
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body?.appendChild(area)
      area.select()
      const copied = typeof document.execCommand === 'function' && document.execCommand('copy')
      area.remove()
      return copied
    } catch {
      return false
    }
  }
  return false
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function cwdOf(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const rec = value as Record<string, unknown>
  return nonEmpty(rec.cwd) ?? cwdOf(rec.header)
}

function snapshotOf(holder: ListHolder | undefined): unknown {
  try {
    return holder?.list?.getSnapshot?.()
  } catch {
    return undefined
  }
}

function sessionsPath(
  sessions: SessionListLike | undefined,
  sessionId: string | undefined,
): string | undefined {
  const id = sessionId ?? nonEmpty(sessions?.current)
  return id === undefined ? undefined : cwdOf(sessions?.byId?.[id])
}

function workspacesPath(
  workspaces: WorkspaceListLike | undefined,
  sessionId: string | undefined,
): string | undefined {
  const items = workspaces?.items ?? []
  if (sessionId !== undefined) {
    const owned = nonEmpty(items.find((item) => item.sessionIds?.includes(sessionId))?.path)
    if (owned !== undefined) return owned
  }
  const recentId = nonEmpty(workspaces?.recentWorkspaceId)
  if (recentId === undefined) return undefined
  return nonEmpty(items.find((item) => item.workspaceId === recentId || item.id === recentId)?.path)
}

function resolveWorkspace(
  props: WandProps,
  hooked: HookedPaths,
  extras: { sessions: ListHolder | undefined; workspaces: ListHolder | undefined },
): WorkspaceRef {
  const sessions = snapshotOf(extras.sessions) as SessionListLike | undefined
  const workspaces = snapshotOf(extras.workspaces) as WorkspaceListLike | undefined
  const sessionId = nonEmpty(props.sessionId) ?? nonEmpty(sessions?.current)
  const path = hooked.session
    ?? cwdOf(props.session)
    ?? hooked.sessions
    ?? sessionsPath(sessions, sessionId)
    ?? hooked.workspaces
    ?? workspacesPath(workspaces, sessionId)
  return { path, sessionId }
}

export function messageFor(code: string, t: (key: YceLocaleKey) => string): string {
  switch (code) {
    case 'mcp_missing': return t('wand.mcpMissing')
    case 'cli_missing': return t('wand.cliMissing')
    case 'auth_error': return t('wand.authError')
    case 'quota_exceeded': return t('wand.quotaExceeded')
    case 'not_deployed': return t('wand.notDeployed')
    case 'empty_prompt': return t('wand.empty')
    case 'timeout': return t('wand.timeout')
    case 'no_rpc': return t('wand.noRpc')
    default: return t('wand.upstream')
  }
}

function readRpc(ctx: Context): ClientConnectionRpc | undefined {
  const connection = ctx.get('connection') as { rpc?: ClientConnectionRpc } | undefined
  return connection?.rpc
}

export function parseEnhanceResult(value: unknown): RpcResult<EnhanceOk> | undefined {
  let current: unknown = value
  if (typeof current === 'object' && current !== null && 'result' in current) {
    current = (current as { result: unknown }).result
  }
  if (typeof current !== 'object' || current === null) return undefined
  const rec = current as Record<string, unknown>
  if (rec.ok === true) {
    const payload = rec.value
    if (
      typeof payload === 'object'
      && payload !== null
      && typeof (payload as { text?: unknown }).text === 'string'
    ) {
      return { ok: true, value: payload as EnhanceOk }
    }
  }
  if (rec.ok === false && typeof rec.error === 'object' && rec.error !== null) {
    const error = rec.error as { code?: unknown; message?: unknown; details?: { code?: unknown } }
    const nested = error.details?.code
    const code = typeof error.code === 'string' && error.code !== 'internal'
      ? error.code
      : (typeof nested === 'string' ? nested : 'upstream')
    return {
      ok: false,
      error: {
        code,
        message: typeof error.message === 'string' ? error.message : code,
        details: {},
      },
    }
  }
  return undefined
}

/** YCE "Y" mark with a four-point sparkle: the composer enhance icon. */
function EnhanceIcon(): React.ReactElement {
  return (
    <svg
      className="dshyce-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4.5 5L10.5 12L16.5 5M10.5 12V19.5" />
      <path
        d="M19.5 1.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"
        fill="currentColor"
        strokeWidth="1"
      />
    </svg>
  )
}

function WandButton(props: WandProps & {
  ctx: Context
  sessionsStore?: ListHolder | undefined
  workspacesStore?: ListHolder | undefined
}): React.ReactElement {
  const { t, ctx, inputActions, sessionsStore, workspacesStore } = props
  const [busy, setBusy] = React.useState(false)
  const [status, setStatus] = React.useState('')
  const [level, setLevel] = React.useState<StatusLevel>('idle')
  const [mcpSnippet, setMcpSnippet] = React.useState('')
  const lock = React.useRef(false)

  const draftFromHook = props.useInput?.((state) => state.draft)
  const draft = typeof draftFromHook === 'string' ? draftFromHook : (props.input?.draft ?? '')
  const draftRef = React.useRef(draft)
  draftRef.current = draft
  const levelRef = React.useRef(level)
  levelRef.current = level
  const extras = { sessions: sessionsStore, workspaces: workspacesStore }
  const sessionId = nonEmpty(props.sessionId)
  const hooked: HookedPaths = {
    session: props.useSession?.((state) => cwdOf(state)),
    sessions: props.useSessions?.((state) => sessionsPath(state, sessionId)),
    workspaces: props.useWorkspaces?.((state) => workspacesPath(state, sessionId)),
  }

  const empty = draft.trim().length === 0
  const disabled = busy || empty
  const title = empty ? t('wand.empty') : (status.length > 0 ? status : t('wand.label'))

  const announce = (nextLevel: StatusLevel, text: string) => {
    setStatus(text)
    setLevel(nextLevel)
  }

  React.useEffect(() => {
    const delay = mcpSnippet.length > 0 ? SETUP_CLEAR_MS : STATUS_CLEAR_MS[level]
    if (delay === undefined) return
    const timer = window.setTimeout(() => {
      setStatus('')
      setLevel('idle')
      setMcpSnippet('')
    }, delay)
    return () => { window.clearTimeout(timer) }
  }, [level, status, mcpSnippet])

  React.useEffect(() => {
    if (levelRef.current !== 'error') return
    setStatus('')
    setLevel('idle')
    setMcpSnippet('')
  }, [draft])

  const onClick = async () => {
    if (lock.current || empty) return
    lock.current = true
    setBusy(true)
    setMcpSnippet('')
    announce('busy', t('wand.enhancing'))
    const prompt = draft.trim()
    const workspace = resolveWorkspace(props, hooked, extras)
    const resolvedSessionId = workspace.sessionId ?? sessionId
    try {
      const rpc = readRpc(ctx)
      if (rpc === undefined) {
        announce('error', t('wand.noRpc'))
        return
      }
      const result = await rpc.call(RPC_CHANNEL, RPC_ENDPOINT, {
        prompt,
        ...(workspace.path !== undefined ? { workspacePath: workspace.path } : {}),
        ...(resolvedSessionId !== undefined ? { sessionId: resolvedSessionId } : {}),
      })
      const parsed = parseEnhanceResult(result)
      if (parsed?.ok === true) {
        if (draftRef.current.trim() !== prompt) {
          announce('error', t('wand.draftChanged'))
          return
        }
        inputActions?.setDraft(parsed.value.text)
        const previous = getRestore()
        const sameSession = previous === undefined
          || previous.sessionId === undefined
          || previous.sessionId === resolvedSessionId
        const original = sameSession && previous !== undefined && prompt === previous.enhanced
          ? previous.original
          : prompt
        setRestore({ sessionId: resolvedSessionId, original, enhanced: parsed.value.text })
        announce('ok', t('wand.done'))
        return
      }
      const errorCode = parsed?.error.code ?? 'upstream'
      if (needsMcpSetupHelp(errorCode)) {
        const isZh = t('wand.copyMcp') === '复制 MCP 配置'
        setMcpSnippet(buildDshMcpSnippet(isZh))
      }
      announce('error', messageFor(errorCode, t))
    } catch {
      announce('error', t('wand.upstream'))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  const restore = React.useSyncExternalStore(subscribeRestore, getRestore, getRestore)
  const canRestore = restore !== undefined
    && (restore.sessionId === undefined || restore.sessionId === sessionId)
    && draft !== restore.original

  const onRestore = () => {
    if (restore === undefined || busy) return
    inputActions?.setDraft(restore.original)
    setRestore(undefined)
    announce('idle', '')
  }

  const onCopyMcp = async () => {
    if (mcpSnippet.length === 0 || busy) return
    const ok = await writeBrowserClipboard(mcpSnippet)
    if (ok) {
      setMcpSnippet('')
      announce('ok', t('wand.copiedMcp'))
      return
    }
    announce('error', t('wand.copyFailed'))
  }

  return (
    <span
      className="dshyce-wrap"
      data-empty={empty ? 'true' : 'false'}
      data-busy={busy ? 'true' : 'false'}
      title={title}
    >
      <span className="dshyce-control">
        <span className="dshyce-ring" aria-hidden="true" />
        <button
          type="button"
          className="dshyce-btn"
          data-busy={busy ? 'true' : 'false'}
          disabled={disabled}
          title={title}
          aria-label={title}
          aria-busy={busy}
          onMouseDown={(event) => { event.preventDefault() }}
          onClick={() => { void onClick() }}
        >
          <EnhanceIcon />
        </button>
      </span>
      {status.length > 0 ? (
        <span className="dshyce-status" data-level={level}>{status}</span>
      ) : null}
      {canRestore && !busy ? (
        <button
          type="button"
          className="dshyce-restore"
          title={t('wand.restore')}
          onMouseDown={(event) => { event.preventDefault() }}
          onClick={onRestore}
        >
          {t('wand.restore')}
        </button>
      ) : null}
      {mcpSnippet.length > 0 && !busy ? (
        <button
          type="button"
          className="dshyce-restore"
          data-accent="true"
          title={t('wand.mcpMissing')}
          onMouseDown={(event) => { event.preventDefault() }}
          onClick={() => { void onCopyMcp() }}
        >
          {t('wand.copyMcp')}
        </button>
      ) : null}
      <span className="dshyce-live" aria-live="polite">{status}</span>
    </span>
  )
}

export function registerWandButton(ctx: Context): void {
  const sessionsStore = ctx.get('sessions') as ListHolder | undefined
  const workspacesStore = ctx.get('workspaces') as ListHolder | undefined
  ctx.slots.inject('conversation.input.left', () =>
    ctx.slots.register(
      { name: 'conversation.input.left', id: NAMESPACE, order: -40, locale: LOCALE_NAMESPACE },
      (props: WandProps) => (
        <WandButton
          {...props}
          ctx={ctx}
          sessionsStore={sessionsStore}
          workspacesStore={workspacesStore}
        />
      ),
    ))
}
