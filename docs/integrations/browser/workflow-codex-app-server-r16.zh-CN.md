# OpenDesk R16：本机 Codex App Server 作为 Browser 工作流 AI Provider 的实施准备

> 日期 2026-10-10。状态：DESIGN_ONLY。本文件补充 Browser main 的 docs/architecture/browser-framework/workflow-ai-provider-routing-r16.zh-CN.md。未实现或验证本机 Codex 真正连接，不改变 OpenDesk Go Native Host 默认安装、既有 MCP、Desktop、Browser Authority。

## 目标和职责边界

本机用户已安装并登录 Codex CLI 的情况下，OpenDesk Browser 工作流可以明确选择 **本机 Codex（通过已登录 CLI，通常使用在线推理）** 进行多轮步骤规划，而不强制另填 OpenAI API Key。

Chrome 扩展本身不能直接执行本机进程。已有 Browser Native Messaging 通道由 Chrome 在用户授权后启动 Go Host，Go Host 已有严格的 60KiB 帧、认证私有 Socket、10 个 Browser RPC、旧 Node 双向兼容、项目只读 Provider。**这些 Browser RPC 只暴露原 Controller/RunHost 的操作；没有模型推理能力。**

OpenDesk Go 的 internal/aicli 只提供桌面工具命令，cmd/opendesk-mcp 也是工具桥，不可把它们冒充聊天模型或 Codex harness。

首批 Agent 适配必须使用 Codex 官方的 App Server（需本机版本/OS 实测确认）管理 thread/turn/events/approval，或者在明确限定的一次性批处理场景用 codex exec --json。优先在独立、受限子进程调用 App Server；不要新建本地 HTTP 监听端口或将 Codex OAuth 凭据复制到 Chrome、Go response、日志或云端。Codex app-server 本身不是 MCP Server，未来的 Codex Tool Registry 可作为 MCP 客户端调用 Browser Bridge 的受限工具。

## Go 所有者建议

建议新增 internal/browserai/（名称须按当前 Go 包结构调整），而非在 browserbridge/host_unix.go 内直接内嵌全部 AI 业务。

- Probe：在实际 Chrome Native Host 的进程账号与 PATH 下发现 Codex executable、版本与官方授权状态，只读，不访问任何凭据正文、不读取无关 HOME。
- Session Owner：使用严格限制的工作区启动/停止可追踪的 codex app-server 子进程；每一连接绑定 sessionId、owner instance、generation 和已批准的能力集合；关闭 Side Panel 按现有生命周期停止活动创作。
- Protocol Adapter：按 App Server 官方协议初始化、thread/start、turn/start、显示 delta/progress 和 turn terminal、thread/resume，并处理会话取消和人工 approvalId。
- Tool Registry：复用现有 browserbridge 私有 IPC 和 opendesk-browser 的 Original Authority。先只开放只读 observe；不能让本机 Codex 自己直接调用 Chrome debugger、桌面鼠标或任意 shell 来绕开网站许可。
- Transport：Chrome ↔ Go 仍用原可信 Native Messaging channel；为 Browser→Go 的 AI 创建独立版本化子协议和 request correlation，不覆盖十个原 Client.Call 方法，不用旧 requestId 作为额外文件/网络权限。
- Security：subprocess environment 最小化、stdout JSON-RPC 与 native framing 分离、工具调用预算/超时/CPU、令牌只保留原 Codex credential store、审计敏感字段遮罩；跨用户及未经配对的扩展请求拒绝。

## 严格区分的就绪状态

- HOST_MISSING：用户没有安装注册受信 Go Native Host
- HOST_PERMISSION_REQUIRED：Chrome 未明确批准 nativeMessaging
- HOST_CONNECTED：只表示 Native hello 成功，**不表示 Codex 可用**
- CODEX_NOT_FOUND：当前 Go 进程用户未发现 Codex CLI
- CODEX_AUTH_REQUIRED：CLI 可用但需要用户自己在 Codex 官方流程登录
- CODEX_INCOMPATIBLE：CLI 版本/协议不支持所需 App Server
- CODEX_INITIALIZING：正在启动真实子进程与协议握手
- CODEX_READY：App Server thread/turn 能按合同请求；不代表任意模型或用量可用
- CODEX_LIMITED：本次实际 turn 失败，例如订阅额度、策略或网络限制
- APPROVAL_REQUIRED：本次工具/敏感操作需要用户确认，不接受 Go 代答
- DISCONNECTED/UNKNOWN：进程或 transport 断开，已有不确定 side effect 只读核对，禁止盲重试

## 推荐分阶段落地

1. 与 Browser Owner 对齐能力 Schema。先做 Go Probe read-only 与 Browser trusted configuration UI，确保不能未获许可自动执行 codex。真实诊断使用当前系统用户而非隔离测试上的另一个 HOME。
2. 可实际启动 codex app-server 的一个只读 Agent turn，保留事件序号、取消、超时、登录失败、进程退出、恢复和敏感日志的组件证据。
3. 通过现有 Native / MCP Browser 工具代理受限页面 observe；用户批准 model data upload，模型只返回 Schema 合法的步骤建议。禁止直接操作网页。
4. 保存建议并复用 Browser 现有 Workflow Compiler/RunHost，实现真实单 origin 编译与重复运行，Codex 离线时不影响已安装任务。
5. 最后才考虑多轮自动修复、跨站/多标签、官方 SaaS。多 origin 的 Browser Task v1 单站限制不因增加 Codex 而取消。

## 独立安全与产品验收

- Native 准入：仅允许真实获批准的扩展 ID 和 Host，未知网页/其他扩展/本机进程不得冒充 Browser owner。
- Process safety：不读取/发送任何 Codex auth/token，不能在任意项目工作目录下启动拥有广泛写权限的 App Server。
- Codex protocol：真实 thread、turn、progress、approval 和 cancel，MCP 错误/cli 版本差异不伪装 READY。
- Browser Controller：每个产生 DOM 副作用的工具都交回 Chrome Autority、document fence、request ledger 和 Durable Result。
- 旧 Native 兼容：Node/Go 原十个 RPC、Socket/manifest 安装 owner、60KiB budget、UNKNOWN 不重放。
- 无模型退化：Codex 不存在/没登录/已限额时，Side Panel 仍可手工编辑与运行已保存 JS。
- 用户体验：不要求普通用户配置新 API Key、手动执行 Node、查看 extensionId、在大量技术表单中排障；必要连接步骤只在设置里按需出现。

每项独立百分制 95 分门槛；没有相同候选的真实 Chrome + Codex 和 Go/native/权限证据记 NOT_TESTED。本文文档提交 ≠ SOURCE_IMPLEMENTED ≠ NATIVE_VERIFIED。

官方参考：
- https://developers.openai.com/blog/codex-as-a-platform
- https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server
- https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan
- https://developers.openai.com/api/docs/guides/agents/sandboxes
