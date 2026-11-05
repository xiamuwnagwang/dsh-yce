export type YceLocaleKey =
  | 'wand.label'
  | 'wand.enhancing'
  | 'wand.empty'
  | 'wand.mcpMissing'
  | 'wand.cliMissing'
  | 'wand.authError'
  | 'wand.quotaExceeded'
  | 'wand.notDeployed'
  | 'wand.timeout'
  | 'wand.draftChanged'
  | 'wand.upstream'
  | 'wand.done'
  | 'wand.noRpc'
  | 'wand.restore'
  | 'wand.copyMcp'
  | 'wand.copiedMcp'
  | 'wand.copyFailed'

export const en: Record<YceLocaleKey, string> = {
  'wand.label': 'Enhance prompt with YCE',
  'wand.enhancing': 'Enhancing prompt…',
  'wand.empty': 'Enter a prompt first.',
  'wand.mcpMissing': 'yce-mcp is not configured: click "Copy MCP config", add it to ~/.dsh/cordis.patch.yml, and restart dsh web (get your YCE Key at yce.aigy.de/console).',
  'wand.cliMissing': 'yce-mcp could not locate the YCE CLI: set YCE_MCP_SKILL_ROOT to your YCE-enhance directory in ~/.dsh/cordis.patch.yml env.',
  'wand.authError': 'YCE_RELAY_TOKEN is missing or invalid: check yce-mcp in ~/.dsh/cordis.patch.yml (get your key at yce.aigy.de/console), or click "Copy MCP config".',
  'wand.quotaExceeded': 'YCE prompt enhancement quota is exhausted.',
  'wand.notDeployed': 'YCE skill is not initialized yet. Check YCE_MCP_SKILL_ROOT in ~/.dsh/cordis.patch.yml.',
  'wand.timeout': 'Enhancement timed out (120s). Check network connectivity or raise toolCallTimeoutMs / YCE_TIMEOUT_ENHANCE_MS.',
  'wand.draftChanged': 'The draft changed while enhancing, so it was not replaced.',
  'wand.upstream': 'Enhancement failed. Check MCP tool permissions and yce-mcp logs.',
  'wand.done': 'Prompt enhanced.',
  'wand.noRpc': 'Enhancement is not available. Confirm dsh-yce is installed in this profile and restart.',
  'wand.restore': 'Restore original',
  'wand.copyMcp': 'Copy MCP config',
  'wand.copiedMcp': 'Copied DSH MCP config! Paste into ~/.dsh/cordis.patch.yml with your YCE Key (yce.aigy.de/console) and restart dsh web.',
  'wand.copyFailed': 'Could not copy to the clipboard.',
}

export const zh: Record<YceLocaleKey, string> = {
  'wand.label': '用 YCE 增强提示词',
  'wand.enhancing': '提示词增强中…',
  'wand.empty': '请先输入提示词。',
  'wand.mcpMissing': '未配置 yce-mcp：点击右侧「复制 MCP 配置」写入 ~/.dsh/cordis.patch.yml 并重启 dsh web（到 yce.aigy.de/console 获取密钥）。',
  'wand.cliMissing': 'yce-mcp 未找到本地 YCE CLI：请在 ~/.dsh/cordis.patch.yml 环境变量中设置 YCE_MCP_SKILL_ROOT 指向 YCE-enhance 目录。',
  'wand.authError': 'YCE_RELAY_TOKEN 缺失或无效：请检查 ~/.dsh/cordis.patch.yml（到 yce.aigy.de/console 获取密钥），或点击右侧复制配置。',
  'wand.quotaExceeded': 'YCE 提示词增强额度已用尽。',
  'wand.notDeployed': 'YCE 尚未完成部署初始化，请在 ~/.dsh/cordis.patch.yml 中检查 YCE_MCP_SKILL_ROOT。',
  'wand.timeout': '增强超时（120 秒）。请检查网络，或在 MCP 配置中调大 toolCallTimeoutMs / YCE_TIMEOUT_ENHANCE_MS。',
  'wand.draftChanged': '增强期间草稿已修改，未覆盖当前内容。',
  'wand.upstream': '增强失败。请检查 MCP 工具权限与 yce-mcp 日志。',
  'wand.done': '提示词已增强。',
  'wand.noRpc': '增强服务未就绪。请确认当前 profile 已安装 dsh-yce 并完全退出重启。',
  'wand.restore': '还原',
  'wand.copyMcp': '复制 MCP 配置',
  'wand.copiedMcp': '已复制 DSH MCP 配置！请粘贴到 ~/.dsh/cordis.patch.yml 填入密钥（yce.aigy.de/console），随后重启 dsh web。',
  'wand.copyFailed': '无法写入剪贴板。',
}

export function buildDshMcpSnippet(isZh = true): string {
  const comment = isZh
    ? '# 粘贴到 ~/.dsh/cordis.patch.yml，前往 https://yce.aigy.de/console 获取 YCE Key 后重启 dsh web'
    : '# Add to ~/.dsh/cordis.patch.yml, fill in your YCE Key from https://yce.aigy.de/console, then restart dsh web'
  const tokenPlaceholder = isZh
    ? '替换为 https://yce.aigy.de/console 生成的 YCE Key'
    : 'Replace with your YCE Key from https://yce.aigy.de/console'
  return [
    comment,
    '- insert:',
    '    - id: yce-mcp',
    "      name: '@deepseek-ai/dsh-mcp'",
    '      config:',
    '        servers:',
    '          yce:',
    '            type: stdio',
    '            command: npx',
    "            args: ['--yes', 'yce-mcp@latest']",
    '            toolCallTimeoutMs: 120000',
    '            env:',
    `              YCE_RELAY_TOKEN: ${JSON.stringify(tokenPlaceholder)}`,
    "              YCE_TIMEOUT_NETWORK_MS: '90000'",
    "              YCE_TIMEOUT_SEARCH_MS: '90000'",
    "              YCE_TIMEOUT_ENHANCE_MS: '120000'",
    "              YCE_TIMEOUT_AUTO_ENHANCE_MS: '120000'",
    "              YCE_TIMEOUT_PLAN_MS: '300000'",
  ].join('\n')
}
