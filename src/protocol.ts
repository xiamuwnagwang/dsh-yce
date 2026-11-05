/** Shared wire contract between the DeepSeek Harness Host RPC and the composer enhance icon. */

export const RPC_CHANNEL = '/api'
export const RPC_ENDPOINT = 'dsh-yce.enhance'

/** Shared abort budget (ms) for `yce_enhance` + `yce_read_result` pagination. */
export const ENHANCE_TIMEOUT_MS = 120_000
export const READ_PAGE_LIMIT = 400
export const MAX_READ_PAGES = 64

export interface EnhanceRequest {
  prompt: string
  workspacePath?: string
  /** Latest DSH conversation snapshot may omit cwd; Host resolves via workspaceRegistry. */
  sessionId?: string
}

export type EnhanceErrorCode =
  | 'mcp_missing'
  | 'cli_missing'
  | 'auth_error'
  | 'quota_exceeded'
  | 'not_deployed'
  | 'empty_prompt'
  | 'timeout'
  | 'upstream'

export interface EnhanceOk {
  text: string
}

export interface RpcOk<T> {
  ok: true
  value: T
}

export interface RpcErr {
  ok: false
  error: {
    code: EnhanceErrorCode | string
    message: string
    details?: Record<string, unknown>
  }
}

export type RpcResult<T> = RpcOk<T> | RpcErr
