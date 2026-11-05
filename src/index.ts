/**
 * dsh-yce host half: discover the configured yce-mcp tools (`yce_enhance` +
 * `yce_read_result`) and proxy prompt enhancement for the composer enhance button.
 */

import type { Context } from '@deepseek-ai/cordis'
import { registerEnhanceRpc } from './rpc.ts'

/** Must match package.json name and cordis.patch.yml id. */
export const name = 'dsh-yce'

/** Wait until the tool registry exists; connection is optional (headless). */
export const inject = ['tools']

export function apply(ctx: Context): void {
  registerEnhanceRpc(ctx)
}
