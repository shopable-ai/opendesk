# OpenDesk Browser Native Host：Mac 安装、Codex 直接调用及真实验收 R5

更新：2026-10-10。**当前源码已实现 Go Native Host；在用户 Mac 上完成正式 App 安装、真实 Chrome 授权、Codex 运行和 Node→Go 安全迁移仍需本机证据。**

## 关键理解

OpenDesk Desktop GUI 和 Chrome Native Host 是同一个 OpenDesk.app 内**不同进程模式**。必须先重新构建并把包含 Go browser 子命令的程序安装到长期可用的固定路径；之后 Chrome 通过 Native Host manifest 启动 browser native-host。**不需要把 OpenDesk GUI 一直打开，不需要单独启动 Node Native Host 或固定 HTTP 服务。**

本轮范围只有 Chrome Native Messaging 宿主接管与相关 CLI/IPC/浏览器连接。禁止删除 Browser JavaScript、Vite/WXT/npm、Desktop/MCP/Flow、Codex 的独立高级 Node 解析功能。保留旧 Node Host 迁移回滚，直到全部安全门槛实测通过。

## 当前增量诊断与下一步 Gate（2026-10-10）

已核验的 Browser `main` 候选 `e1d10b241ef77e5328abf917781b48d336db1042` 的 Native Agent CI [#38038526216](https://github.com/shopable-ai/opendesk-browser/actions/runs/38038526216) 和依赖 CI [#38038526380](https://github.com/shopable-ai/opendesk-browser/actions/runs/38038526380) 存在三个前置问题：固定入口数预期 14、实际 15；打包的内置 page-core 触发未授权动态 `Function`；部分用户脚本预览 `E_BUILTIN_RESOURCE`。macOS Native Chrome 诊断被**包验证阶段**拦下，本候选真正 Chrome connectNative 的结果应为 `NOT_TESTED`，而不是“实测连接失败”。

完整前置问题、各 Agent 模块 Owner 与 Gate A（CI 绿灯）→ B（Go App）→ C（真 Chrome）→ D（Codex CLI 执行）→ E（首装零配置）→ F（迁移回滚）→ G（独立 R16 Codex Agent）见 [Browser Native Go R5.1 交付清单](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/framework/workstreams/native-go-host-r5-1-delivery-gates-20261010.zh-CN.md)。本页以下运行命令仍有效，但必须在 Gate A 的**当前同候选有效扩展包**修复后用于真实端到端验收。

## Mac 最短操作路径

在真实 OpenDesk 源码仓库、无冲突时运行：

    go test -count=1 ./internal/browserbridge ./internal/browsercli
    go test ./cmd/opendesk
    ./scripts/build_macos_app.sh

默认完整 App 位于 dist/OpenDesk.app/Contents/MacOS/opendesk。先核对签名、hash、Info.plist；将**完整 App bundle**安装到系统长期固定路径，并且先备份旧版本，绝不要让正在使用的 /Applications/OpenDesk.app 被覆盖。官方用户级 CLI 安装器：

    bash scripts/install_macos_cli.sh --app-bundle /实际固定路径/OpenDesk.app

它管理 ~/.local/bin/opendesk，拒绝覆盖未知原有命令。联调阶段可始终调用已安装 App 内绝对路径，不依赖 PATH。OpenDesk GUI 可以 open /实际固定路径/OpenDesk.app 验证，但非 Native 必需。

浏览器先用受控 Chrome for Testing Profile，扩展从 Browser 仓库真实 dist/development 或 dist/production 安装，读取本次 chrome.runtime.id；**当前并无已核验的 CWS 官方 ID**，全新开发环境不能无参数猜 ID。Go 宿主显式注册示例：

    /实际固定路径/OpenDesk.app/Contents/MacOS/opendesk browser setup --extension-id 实际扩展ID --browser cft --user-data-dir 已存在CFT独立Profile绝对路径

此命令只应在隔离的安装实例执行，不能覆盖现有 Node Host Socket/manifest。检查安装清单的精确 allowed_origins、路径和权限，并保护私有凭据。然后在真实 Chrome 扩展选项页点击「授权并连接 OpenDesk」，完成必要的浏览器 Native 权限提示；打开有独立网站权限的安全测试网页及其 Sidebar。

## Codex 最短测试

Codex 可以通过 shell 调用同一 App 中的 Go CLI，无需先配置 MCP：

    opendesk browser doctor
    opendesk browser bridge.status
    opendesk browser target.current

如 opendesk 命令尚未正确安装，请替换成当前实际 App 下 Contents/MacOS/opendesk 的绝对路径。doctor 的 connected:true 只能证明 Native 通信；target.current 还要求唯一 live Sidebar Host。没有真实注册的 Host 不会自动为你打开网页或执行代码。

安全示例脚本请使用 Browser src/native-agent/host-adapter.js 的 run.start 合同。Codex 从 target.current 获得真实 registrationId 和完整 document 目标，冻结源代码，生成 JSON 请求文件后运行：

    opendesk browser run.start --file /私有目录/run-start.json --request-id 新且唯一的请求ID
    opendesk browser run.get --file /私有目录/run-get.json --request-id 只读查询ID

run.get 请求文件必须包含原 runId 和注册 Host 身份。run.start 只返回 admission；需要检查最终 run/resultId/revision/sourceHash、workerRetired、retirementState。请求可能已分发但 ACK 丢失时必须使用原身份 request.get 只读查询，绝不可自动重放原动作。

## MCP 说明与验收界限

默认走 Go CLI。现有 Browser native-agent/local-dev/mcp.mjs 是独立 Node 高级 Codex 开发工具；Go 内置的单文件 Provider 是一个可选 Native 兼容增强。OpenDesk 当前 cmd/opendesk-mcp 面向桌面自动化与另一 Browser Core 绑定，**不等同于**这里的 Go Native Messaging CLI。本轮不应为了开发和测试临时伪造统一 Browser MCP 或把 Native Host 再改回 Node。

模拟 Chrome 帧的真实 Go 二进制 CI 已有通过记录，例如 OpenDesk Actions #38035362786；它不能替代**真实 Chrome**的许可、真实 Side Panel、网页 Run/Result/Stop、系统安装及旧 Node→Go 备份/回滚。未经这些证据不能写完整交付 95+。

## 本地 Codex 的完整执行提示词

[OpenDesk Mac Native Host R5 Codex GOAL](../../../prompts/automation/native-messaging-host-mac-codex-r5.zh-CN.md)

直接把上面的 GOAL 内容复制到 Mac 本地 Codex 对话。该任务需要 Mac 上的源码、已安装程序和真实 Chrome，因此云端 GitHub CI 无法替代本机验收。
