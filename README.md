# YCE Prompt Enhance for DeepSeek Harness (`dsh-yce`)

参照 [dsh-bce](https://github.com/linqiu919/dsh-bce) 实现的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`dsh`）输入框提示词增强插件：

- **零密钥驻留**：`YCE_RELAY_TOKEN` 等凭证只保留在宿主 `cordis.patch.yml` 的 `yce-mcp` MCP 配置中，插件端不存储、不读取任何密钥。
- **输入框一键增强**：在 `conversation.input.left` 插槽挂载 `26px` 圆形 `Y✨` 按钮，通过 Host RPC `/api/dsh-yce.enhance` 调用宿主已配置的 `mcp__*__yce_enhance` 与 `mcp__*__yce_read_result` 分页收据协议，将模糊草稿改写为结构化提示词，支持连续增强后一键 **撤回** 到最初原文，自动附带 `no_task: true` 防止污染 `.yce/tasks/` 任务卡。
- **未配置 MCP 时内置引导**：若宿主尚未注册或启用 `yce-mcp`，按钮旁状态胶囊会给出 `~/.dsh/cordis.patch.yml` 配置指引，并提供一键 **复制 MCP 配置** 按钮。
- **多版本兼容**：同时兼容 DSH `0.1.x` – `0.2.2+`（Legacy 与 Batch `ctx.tools.execute`、`/api` RPC 拦截与精确 Fetch 路由）。

---

## 1. 在 `cordis.patch.yml` 注册 `yce-mcp`

编辑目标 profile 对应的 `~/.dsh/cordis.patch.yml`（注：`web` 与 `desktop` profile 相互独立；Desktop / Electron 建议将 `command` 写成 `npx` 或 `node` 的绝对路径；如需获取 `YCE_RELAY_TOKEN` 可前往 [YCE 控制台](https://yce.aigy.de/console)）：

```yaml
- insert:
    - id: yce-mcp
      name: '@deepseek-ai/dsh-mcp'
      config:
        servers:
          yce:
            type: stdio
            command: npx
            args: ['--yes', 'yce-mcp@latest']
            toolCallTimeoutMs: 120000
            env:
              YCE_RELAY_TOKEN: '你的 YCE Key'
              YCE_TIMEOUT_NETWORK_MS: '90000'
              YCE_TIMEOUT_SEARCH_MS: '90000'
              YCE_TIMEOUT_ENHANCE_MS: '120000'
              YCE_TIMEOUT_AUTO_ENHANCE_MS: '120000'
              YCE_TIMEOUT_PLAN_MS: '300000'
```

（若本机已克隆 [`YCE-enhance`](https://github.com/xiamuwnagwang/YCE-enhance)，也可直接设置 `command: node`、`args: ['/abs/path/to/YCE-enhance/mcp/src/index.mjs']`。）

---

## 2. 安装与更新插件

### 方式 A：通过 GitHub Release 预构建包安装 / 更新（免本地构建授权）

```sh
# web profile
dsh plugin --profile web add https://github.com/xiamuwnagwang/dsh-yce/releases/latest/download/dsh-yce.tgz

# 官方 Desktop（先完全退出 Desktop 后再执行）
dsh plugin --profile desktop add https://github.com/xiamuwnagwang/dsh-yce/releases/latest/download/dsh-yce.tgz
```

（也可使用镜像地址 `https://yce.aigy.de/downloads/dsh-yce.tgz`。）

### 方式 B：直接通过 GitHub 仓库安装

```sh
dsh plugin --profile web add github:xiamuwnagwang/dsh-yce
dsh plugin --profile desktop add github:xiamuwnagwang/dsh-yce
```

### 方式 C：从本地克隆构建与测试

```sh
git clone https://github.com/xiamuwnagwang/dsh-yce.git
cd dsh-yce
npm install
npm run build
npm test
dsh plugin --profile web add "$(pwd)"
```

安装或更新完成后，**完全退出 DeepSeek Harness 并重新启动**即可生效。

## License

MIT
