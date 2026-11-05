window.__ModuleLoader__.load({ id: "dsh-yce", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
const __modules = {
  "protocol.ts": function (require, module, exports) {
"use strict";
/** Shared wire contract between the DeepSeek Harness Host RPC and the composer enhance icon. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_READ_PAGES = exports.READ_PAGE_LIMIT = exports.ENHANCE_TIMEOUT_MS = exports.RPC_ENDPOINT = exports.RPC_CHANNEL = void 0;
exports.RPC_CHANNEL = '/api';
exports.RPC_ENDPOINT = 'dsh-yce.enhance';
/** Shared abort budget (ms) for `yce_enhance` + `yce_read_result` pagination. */
exports.ENHANCE_TIMEOUT_MS = 120_000;
exports.READ_PAGE_LIMIT = 400;
exports.MAX_READ_PAGES = 64;

  },
  "client/constants.ts": function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOCALE_NAMESPACE = exports.NAMESPACE = void 0;
exports.NAMESPACE = 'dsh-yce';
exports.LOCALE_NAMESPACE = 'settings.dshYce';

  },
  "client/locales.ts": function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.zh = exports.en = void 0;
exports.buildDshMcpSnippet = buildDshMcpSnippet;
exports.en = {
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
};
exports.zh = {
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
};
function buildDshMcpSnippet(isZh = true) {
    const comment = isZh
        ? '# 粘贴到 ~/.dsh/cordis.patch.yml，前往 https://yce.aigy.de/console 获取 YCE Key 后重启 dsh web'
        : '# Add to ~/.dsh/cordis.patch.yml, fill in your YCE Key from https://yce.aigy.de/console, then restart dsh web';
    const tokenPlaceholder = isZh
        ? '替换为 https://yce.aigy.de/console 生成的 YCE Key'
        : 'Replace with your YCE Key from https://yce.aigy.de/console';
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
    ].join('\n');
}

  },
  "client/restore-store.ts": function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRestore = getRestore;
exports.subscribeRestore = subscribeRestore;
exports.setRestore = setRestore;
let snap;
const listeners = new Set();
function getRestore() {
    return snap;
}
function subscribeRestore(listener) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
function setRestore(next) {
    snap = next;
    for (const listener of listeners)
        listener();
}

  },
  "client/styles.ts": function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CSS = void 0;
exports.injectStyles = injectStyles;
const constants_ts_1 = require("./constants.ts");
exports.CSS = `
.dshyce-wrap {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  max-width: 380px;
}
.dshyce-control {
  position: relative;
  width: 26px;
  height: 26px;
  flex: none;
}
.dshyce-btn {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--dsw-alias-fill-secondary, var(--dsw-alias-bg-tertiary, rgba(15, 23, 42, 0.05)));
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  transition: background-color 0.12s cubic-bezier(0.16, 1, 0.3, 1), color 0.12s cubic-bezier(0.16, 1, 0.3, 1);
}
.dshyce-btn:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.08));
  color: var(--dsw-alias-label-primary);
}
.dshyce-btn:hover:active {
  transform: scale(0.96);
}
.dshyce-btn:disabled:not([data-busy='true']) {
  opacity: 0.45;
  cursor: not-allowed;
  color: var(--dsw-alias-label-tertiary, var(--dsw-alias-label-secondary));
}
.dshyce-btn:disabled:not([data-busy='true']):hover {
  background: var(--dsw-alias-fill-secondary, var(--dsw-alias-bg-tertiary, rgba(15, 23, 42, 0.05)));
}
.dshyce-icon {
  width: 13px;
  height: 13px;
  display: block;
}
.dshyce-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
  opacity: 0;
}
.dshyce-wrap[data-busy='true'] .dshyce-control {
  pointer-events: none;
}
.dshyce-wrap[data-busy='true'] .dshyce-ring {
  opacity: 0.85;
  animation: dshyce-spin 1.5s linear infinite;
  background: conic-gradient(
    from var(--dshyce-from, 0deg) at 50% 50%,
    transparent 0deg,
    rgba(247, 214, 186, 0) 205deg,
    rgba(247, 214, 186, 0.45) 255deg,
    rgba(232, 170, 120, 0.78) 305deg,
    rgba(201, 122, 69, 0.55) 340deg,
    transparent 360deg
  );
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 1.5px), #000 calc(100% - 1px));
          mask: radial-gradient(farthest-side, transparent calc(100% - 1.5px), #000 calc(100% - 1px));
}
.dshyce-btn[data-busy='true'] {
  opacity: 1;
  cursor: progress;
  pointer-events: none;
  color: #d9884e;
  background: var(--dsw-alias-fill-secondary, var(--dsw-alias-bg-tertiary, rgba(15, 23, 42, 0.05)));
}
.dshyce-btn[data-busy='true']:hover {
  color: #d9884e;
  background: var(--dsw-alias-fill-secondary, var(--dsw-alias-bg-tertiary, rgba(15, 23, 42, 0.05)));
}
@property --dshyce-from {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}
@keyframes dshyce-spin {
  to { --dshyce-from: 360deg; }
}
.dshyce-status {
  min-width: 0;
  max-width: 210px;
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--dsw-alias-label-tertiary, #8b8b8b);
  pointer-events: none;
}
.dshyce-status[data-level='busy'] {
  color: #d9884e;
}
.dshyce-status[data-level='error'] {
  color: var(--dsw-alias-state-error-primary, #e5484d);
}
.dshyce-status[data-level='ok'] {
  color: var(--dsw-alias-state-success-primary, #30a46c);
}
@media (prefers-reduced-motion: reduce) {
  .dshyce-wrap[data-busy='true'] .dshyce-ring {
    animation: none;
    opacity: 0.5;
  }
  .dshyce-btn,
  .dshyce-restore {
    transition: none;
    animation: none;
  }
}
.dshyce-restore {
  flex: none;
  height: 26px;
  padding: 0 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 26px;
  white-space: nowrap;
  cursor: pointer;
}
.dshyce-restore:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(15, 23, 42, 0.08));
  color: var(--dsw-alias-label-primary);
}
.dshyce-restore[data-accent='true'] {
  background: rgba(217, 136, 78, 0.14);
  color: #d9884e;
}
.dshyce-restore[data-accent='true']:hover {
  background: rgba(217, 136, 78, 0.22);
  color: #c57238;
}
.dshyce-live {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
`;
function injectStyles() {
    const tag = document.createElement('style');
    tag.dataset.plugin = constants_ts_1.NAMESPACE;
    tag.textContent = exports.CSS;
    document.head.appendChild(tag);
    return () => { tag.remove(); };
}

  },
  "client/wand-button.tsx": function (require, module, exports) {
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.STATUS_CLEAR_MS = void 0;
exports.needsMcpSetupHelp = needsMcpSetupHelp;
exports.messageFor = messageFor;
exports.parseEnhanceResult = parseEnhanceResult;
exports.registerWandButton = registerWandButton;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = __importDefault(require("react"));
const constants_ts_1 = require("./constants.ts");
const locales_ts_1 = require("./locales.ts");
const protocol_ts_1 = require("../protocol.ts");
const restore_store_ts_1 = require("./restore-store.ts");
exports.STATUS_CLEAR_MS = { ok: 3500, error: 5000 };
const SETUP_CLEAR_MS = 15000;
function needsMcpSetupHelp(code) {
    return code === 'mcp_missing' || code === 'auth_error' || code === 'cli_missing';
}
async function writeBrowserClipboard(text) {
    if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        }
        catch {
            // Fall back to execCommand below (e.g. non-HTTPS LAN dsh web)
        }
    }
    if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
        try {
            const area = document.createElement('textarea');
            area.value = text;
            area.setAttribute('readonly', 'true');
            area.style.position = 'fixed';
            area.style.opacity = '0';
            document.body?.appendChild(area);
            area.select();
            const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
            area.remove();
            return copied;
        }
        catch {
            return false;
        }
    }
    return false;
}
function nonEmpty(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
function cwdOf(value) {
    if (value === null || typeof value !== 'object')
        return undefined;
    const rec = value;
    return nonEmpty(rec.cwd) ?? cwdOf(rec.header);
}
function snapshotOf(holder) {
    try {
        return holder?.list?.getSnapshot?.();
    }
    catch {
        return undefined;
    }
}
function sessionsPath(sessions, sessionId) {
    const id = sessionId ?? nonEmpty(sessions?.current);
    return id === undefined ? undefined : cwdOf(sessions?.byId?.[id]);
}
function workspacesPath(workspaces, sessionId) {
    const items = workspaces?.items ?? [];
    if (sessionId !== undefined) {
        const owned = nonEmpty(items.find((item) => item.sessionIds?.includes(sessionId))?.path);
        if (owned !== undefined)
            return owned;
    }
    const recentId = nonEmpty(workspaces?.recentWorkspaceId);
    if (recentId === undefined)
        return undefined;
    return nonEmpty(items.find((item) => item.workspaceId === recentId || item.id === recentId)?.path);
}
function resolveWorkspace(props, hooked, extras) {
    const sessions = snapshotOf(extras.sessions);
    const workspaces = snapshotOf(extras.workspaces);
    const sessionId = nonEmpty(props.sessionId) ?? nonEmpty(sessions?.current);
    const path = hooked.session
        ?? cwdOf(props.session)
        ?? hooked.sessions
        ?? sessionsPath(sessions, sessionId)
        ?? hooked.workspaces
        ?? workspacesPath(workspaces, sessionId);
    return { path, sessionId };
}
function messageFor(code, t) {
    switch (code) {
        case 'mcp_missing': return t('wand.mcpMissing');
        case 'cli_missing': return t('wand.cliMissing');
        case 'auth_error': return t('wand.authError');
        case 'quota_exceeded': return t('wand.quotaExceeded');
        case 'not_deployed': return t('wand.notDeployed');
        case 'empty_prompt': return t('wand.empty');
        case 'timeout': return t('wand.timeout');
        case 'no_rpc': return t('wand.noRpc');
        default: return t('wand.upstream');
    }
}
function readRpc(ctx) {
    const connection = ctx.get('connection');
    return connection?.rpc;
}
function parseEnhanceResult(value) {
    let current = value;
    if (typeof current === 'object' && current !== null && 'result' in current) {
        current = current.result;
    }
    if (typeof current !== 'object' || current === null)
        return undefined;
    const rec = current;
    if (rec.ok === true) {
        const payload = rec.value;
        if (typeof payload === 'object'
            && payload !== null
            && typeof payload.text === 'string') {
            return { ok: true, value: payload };
        }
    }
    if (rec.ok === false && typeof rec.error === 'object' && rec.error !== null) {
        const error = rec.error;
        const nested = error.details?.code;
        const code = typeof error.code === 'string' && error.code !== 'internal'
            ? error.code
            : (typeof nested === 'string' ? nested : 'upstream');
        return {
            ok: false,
            error: {
                code,
                message: typeof error.message === 'string' ? error.message : code,
                details: {},
            },
        };
    }
    return undefined;
}
/** YCE "Y" mark with a four-point sparkle: the composer enhance icon. */
function EnhanceIcon() {
    return ((0, jsx_runtime_1.jsxs)("svg", { className: "dshyce-icon", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.1", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", focusable: "false", children: [(0, jsx_runtime_1.jsx)("path", { d: "M4.5 5L10.5 12L16.5 5M10.5 12V19.5" }), (0, jsx_runtime_1.jsx)("path", { d: "M19.5 1.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z", fill: "currentColor", strokeWidth: "1" })] }));
}
function WandButton(props) {
    const { t, ctx, inputActions, sessionsStore, workspacesStore } = props;
    const [busy, setBusy] = react_1.default.useState(false);
    const [status, setStatus] = react_1.default.useState('');
    const [level, setLevel] = react_1.default.useState('idle');
    const [mcpSnippet, setMcpSnippet] = react_1.default.useState('');
    const lock = react_1.default.useRef(false);
    const draftFromHook = props.useInput?.((state) => state.draft);
    const draft = typeof draftFromHook === 'string' ? draftFromHook : (props.input?.draft ?? '');
    const draftRef = react_1.default.useRef(draft);
    draftRef.current = draft;
    const levelRef = react_1.default.useRef(level);
    levelRef.current = level;
    const extras = { sessions: sessionsStore, workspaces: workspacesStore };
    const sessionId = nonEmpty(props.sessionId);
    const hooked = {
        session: props.useSession?.((state) => cwdOf(state)),
        sessions: props.useSessions?.((state) => sessionsPath(state, sessionId)),
        workspaces: props.useWorkspaces?.((state) => workspacesPath(state, sessionId)),
    };
    const empty = draft.trim().length === 0;
    const disabled = busy || empty;
    const title = empty ? t('wand.empty') : (status.length > 0 ? status : t('wand.label'));
    const announce = (nextLevel, text) => {
        setStatus(text);
        setLevel(nextLevel);
    };
    react_1.default.useEffect(() => {
        const delay = mcpSnippet.length > 0 ? SETUP_CLEAR_MS : exports.STATUS_CLEAR_MS[level];
        if (delay === undefined)
            return;
        const timer = window.setTimeout(() => {
            setStatus('');
            setLevel('idle');
            setMcpSnippet('');
        }, delay);
        return () => { window.clearTimeout(timer); };
    }, [level, status, mcpSnippet]);
    react_1.default.useEffect(() => {
        if (levelRef.current !== 'error')
            return;
        setStatus('');
        setLevel('idle');
        setMcpSnippet('');
    }, [draft]);
    const onClick = async () => {
        if (lock.current || empty)
            return;
        lock.current = true;
        setBusy(true);
        setMcpSnippet('');
        announce('busy', t('wand.enhancing'));
        const prompt = draft.trim();
        const workspace = resolveWorkspace(props, hooked, extras);
        const resolvedSessionId = workspace.sessionId ?? sessionId;
        try {
            const rpc = readRpc(ctx);
            if (rpc === undefined) {
                announce('error', t('wand.noRpc'));
                return;
            }
            const result = await rpc.call(protocol_ts_1.RPC_CHANNEL, protocol_ts_1.RPC_ENDPOINT, {
                prompt,
                ...(workspace.path !== undefined ? { workspacePath: workspace.path } : {}),
                ...(resolvedSessionId !== undefined ? { sessionId: resolvedSessionId } : {}),
            });
            const parsed = parseEnhanceResult(result);
            if (parsed?.ok === true) {
                if (draftRef.current.trim() !== prompt) {
                    announce('error', t('wand.draftChanged'));
                    return;
                }
                inputActions?.setDraft(parsed.value.text);
                const previous = (0, restore_store_ts_1.getRestore)();
                const sameSession = previous === undefined
                    || previous.sessionId === undefined
                    || previous.sessionId === resolvedSessionId;
                const original = sameSession && previous !== undefined && prompt === previous.enhanced
                    ? previous.original
                    : prompt;
                (0, restore_store_ts_1.setRestore)({ sessionId: resolvedSessionId, original, enhanced: parsed.value.text });
                announce('ok', t('wand.done'));
                return;
            }
            const errorCode = parsed?.error.code ?? 'upstream';
            if (needsMcpSetupHelp(errorCode)) {
                const isZh = t('wand.copyMcp') === '复制 MCP 配置';
                setMcpSnippet((0, locales_ts_1.buildDshMcpSnippet)(isZh));
            }
            announce('error', messageFor(errorCode, t));
        }
        catch {
            announce('error', t('wand.upstream'));
        }
        finally {
            lock.current = false;
            setBusy(false);
        }
    };
    const restore = react_1.default.useSyncExternalStore(restore_store_ts_1.subscribeRestore, restore_store_ts_1.getRestore, restore_store_ts_1.getRestore);
    const canRestore = restore !== undefined
        && (restore.sessionId === undefined || restore.sessionId === sessionId)
        && draft !== restore.original;
    const onRestore = () => {
        if (restore === undefined || busy)
            return;
        inputActions?.setDraft(restore.original);
        (0, restore_store_ts_1.setRestore)(undefined);
        announce('idle', '');
    };
    const onCopyMcp = async () => {
        if (mcpSnippet.length === 0 || busy)
            return;
        const ok = await writeBrowserClipboard(mcpSnippet);
        if (ok) {
            setMcpSnippet('');
            announce('ok', t('wand.copiedMcp'));
            return;
        }
        announce('error', t('wand.copyFailed'));
    };
    return ((0, jsx_runtime_1.jsxs)("span", { className: "dshyce-wrap", "data-empty": empty ? 'true' : 'false', "data-busy": busy ? 'true' : 'false', title: title, children: [(0, jsx_runtime_1.jsxs)("span", { className: "dshyce-control", children: [(0, jsx_runtime_1.jsx)("span", { className: "dshyce-ring", "aria-hidden": "true" }), (0, jsx_runtime_1.jsx)("button", { type: "button", className: "dshyce-btn", "data-busy": busy ? 'true' : 'false', disabled: disabled, title: title, "aria-label": title, "aria-busy": busy, onMouseDown: (event) => { event.preventDefault(); }, onClick: () => { void onClick(); }, children: (0, jsx_runtime_1.jsx)(EnhanceIcon, {}) })] }), status.length > 0 ? ((0, jsx_runtime_1.jsx)("span", { className: "dshyce-status", "data-level": level, children: status })) : null, canRestore && !busy ? ((0, jsx_runtime_1.jsx)("button", { type: "button", className: "dshyce-restore", title: t('wand.restore'), onMouseDown: (event) => { event.preventDefault(); }, onClick: onRestore, children: t('wand.restore') })) : null, mcpSnippet.length > 0 && !busy ? ((0, jsx_runtime_1.jsx)("button", { type: "button", className: "dshyce-restore", "data-accent": "true", title: t('wand.mcpMissing'), onMouseDown: (event) => { event.preventDefault(); }, onClick: () => { void onCopyMcp(); }, children: t('wand.copyMcp') })) : null, (0, jsx_runtime_1.jsx)("span", { className: "dshyce-live", "aria-live": "polite", children: status })] }));
}
function registerWandButton(ctx) {
    const sessionsStore = ctx.get('sessions');
    const workspacesStore = ctx.get('workspaces');
    ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: constants_ts_1.NAMESPACE, order: -40, locale: constants_ts_1.LOCALE_NAMESPACE }, (props) => ((0, jsx_runtime_1.jsx)(WandButton, { ...props, ctx: ctx, sessionsStore: sessionsStore, workspacesStore: workspacesStore }))));
}

  },
  "client/index.ts": function (require, module, exports) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inject = void 0;
exports.apply = apply;
const constants_ts_1 = require("./constants.ts");
const locales_ts_1 = require("./locales.ts");
const styles_ts_1 = require("./styles.ts");
const wand_button_tsx_1 = require("./wand-button.tsx");
exports.inject = ['slots', 'locale', 'connection'];
function apply(ctx) {
    ctx.effect(() => ctx.locale.register(constants_ts_1.LOCALE_NAMESPACE, { zh: locales_ts_1.zh, en: locales_ts_1.en }), 'dsh-yce: dictionaries');
    ctx.effect(() => (0, styles_ts_1.injectStyles)());
    (0, wand_button_tsx_1.registerWandButton)(ctx);
}

  }
};
const __cache = Object.create(null);
function __resolve(fromDir, specifier) {
  const parts = (fromDir ? fromDir.split("/") : []);
  for (const seg of specifier.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  const candidate = parts.join("/");
  if (__modules[candidate]) return candidate;
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    if (__modules[candidate + ext]) return candidate + ext;
  }
  throw new Error("Cannot resolve internal module " + specifier + " from " + fromDir);
}
function __load(id, outerRequire) {
  if (__cache[id]) return __cache[id].exports;
  const fn = __modules[id];
  if (!fn) throw new Error("Unknown internal module: " + id);
  const mod = { exports: {} };
  __cache[id] = mod;
  const slash = id.lastIndexOf("/");
  const dir = slash >= 0 ? id.slice(0, slash) : "";
  const localRequire = (specifier) => {
    if (specifier.startsWith("./") || specifier.startsWith("../")) {
      return __load(__resolve(dir, specifier), outerRequire);
    }
    if (typeof outerRequire === "function") return outerRequire(specifier);
    throw new Error("External require unavailable for " + specifier);
  };
  fn(localRequire, mod, mod.exports);
  return mod.exports;
}
module.exports = __load("client/index.ts", require);
return module.exports; } });
