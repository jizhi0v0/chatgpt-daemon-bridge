# ChatGPT Daemon Bridge

[简体中文](README.md) | [English](README.en.md)

让 macOS ChatGPT Desktop 通过本地转接器接入已有的 Codex Managed Daemon，与使用同一 Daemon 的 CLI、iPhone 共用会话服务。

这是实验性的连接层绕行方案，不是 OpenAI 官方修复。**目前不保留完整的 `codex_app` 桌面控制工具功能。**

## 背景

某些 Desktop 版本只有在 `configOverrides` 为空时，才会响应 `CODEX_APP_SERVER_USE_LOCAL_DAEMON=1`。但 Desktop 又自动添加 `codex_app` 插件覆盖项，导致它仍启动独立的 stdio App Server。两个服务尝试恢复同一个会话时，可能出现 `already has an active writer`。

- [openai/codex#41014：自动覆盖项阻断 Daemon 连接](https://github.com/openai/codex/issues/41014)
- [openai/codex#40134：支持 Desktop 连接外部 App Server](https://github.com/openai/codex/issues/40134)

本项目没有修改上述判断，而是用 `CODEX_CLI_PATH` 替换 Desktop 启动的 CLI 入口，将已知的 app-server 启动命令转换为连接现有 Daemon：

```text
ChatGPT Desktop
    ↕ stdio JSON lines
codex-desktop → bridge.cjs
    ↕ WebSocket over Unix socket
Existing Codex Managed Daemon
    ↕
CLI / iPhone
```

## 使用

前提：

- macOS，ChatGPT 安装在 `/Applications/ChatGPT.app`。
- 已安装 Codex Managed Daemon，且它正在运行。
- Managed CLI 位于 `$CODEX_HOME/packages/standalone/current/bin/codex`；`CODEX_HOME` 默认是 `~/.codex`。
- 安装依赖和运行测试需要 Node.js 20 或以上、npm。实际转接优先使用 ChatGPT 内置 Node，找不到时使用 PATH 中的 Node。

在克隆后的仓库目录执行：

```sh
npm ci --ignore-scripts
npm test
codex app-server daemon version
```

需要 Desktop、CLI、iPhone 三端共用时，启动顺序为：

```sh
# 启动 Managed Daemon，并启用远程控制；已经运行且已启用时无需重复执行。
codex remote-control start
```

确认 `codex app-server daemon version` 返回 `status: running` 后，
**完全退出 ChatGPT**，再运行：

```sh
./launch-chatgpt.command
```

只需要本机 Desktop 与 CLI 共享时，可以用 `codex app-server daemon start`
启动 Daemon，不必开启远程控制。CLI 也应连接同一 Daemon，避免使用
`--no-daemon` 启动另一套服务。

也可以在 Finder 中双击 `launch-chatgpt.command`。如果 ChatGPT 已在运行，`open` 不会替换它现有的启动环境。

启动器只给这次 ChatGPT 启动设置 `CODEX_CLI_PATH`，不会修改全局 `config.toml`、launchctl 环境或应用包。请保留仓库目录和 `node_modules`。

## 工作方式

- `codex-desktop` 只拦截已知的 Desktop app-server 启动命令。
- 版本查询、Daemon 管理和 `--print-startup-config` 组织设置预检透传到真实 CLI。
- 两个已知启动覆盖项不传给已运行的 Daemon；未知启动覆盖项会报错，避免静默丢掉其他配置。
- `bridge.cjs` 连接 `$CODEX_HOME/app-server-control/app-server-control.sock`，在 JSON 行与 WebSocket 消息之间转换，并处理 ping/pong。
- 不启动新的 App Server，也不开放 TCP 端口；退出转接器不会停止 Daemon。

## 验证范围与限制

实测：ChatGPT `26.1029.61003`（build `24614`），Managed Daemon `0.166.0`。

- `initialize`、`thread/list` 和组织设置预检通过。
- Desktop 真实启动后报告 `initialized=true`、`connected`。
- 已在界面确认原会话正常打开，最新消息一致。
- 三端同时收发消息尚未单独验证。
- `codex_app` 桌面工具没有随启动参数加载；共用会话服务不等于完整桌面工具兼容。
- 不会给现有 Daemon 补设功能开关或转移旧独立服务持有的写入锁。
- 转接器不自行重连；断线后的行为取决于 Desktop 的连接生命周期。
- 未来 Desktop 的启动参数、协议或路径发生变化时，可能需要更新本项目。

测试使用临时 Unix socket，不连接真实 Daemon，也不创建真实会话。

## 恢复默认

完全退出 ChatGPT，再从原来的 ChatGPT.app / Dock 启动即可。无需退出账号、停止 Managed Daemon，或删除任何会话锁。
