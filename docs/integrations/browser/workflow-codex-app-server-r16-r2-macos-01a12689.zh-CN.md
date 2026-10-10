# R16 R2 本机 macOS · 01a12689

日期：2026-10-11。**R16 R2 尚未完成最终验收；NOT_ACCEPTED。** 完整账本位于 Browser 仓库 `docs/framework/workstreams/r16-r2-macos-01a12689.md`，原始 Go 证据在 `.runtime/tests/r16-r2-macos/01a12689/`，不进 Git。

本轮只在 master 工作。源码候选 `cb35e574760daa390803740f6e3803d6621f2825`：`internal/browserai/manager.go` 本地失败/超量事件标记 OUTCOME_UNKNOWN，保留真实 App Server terminal 的独立路径；`manager_test.go` 补本地超时未知状态回归。未放宽已审 0.159.2 白名单、配置/指令来源、MCP、readOnly/no-network、审批和 no-replay 门禁。

验证：绝对路径 `~/.local/opt/go1.25.13-amd64/bin/go`（go1.25.13 darwin/amd64）；`go test -count=1` / `go test -race -count=1` / `go vet` 均针对 `./internal/browserai ./internal/browserbridge ./internal/browsercli`，退出 0。日志分别 go-components-final.log / go-race-final.log / go-vet-final.log。

App 从该提交的 git archive 独立树编译，`CGO_ENABLED=1 GOARCH=arm64 GO_BIN=<上述绝对路径> DIST_DIR=<本轮app-dist> ./scripts/build_macos_app.sh` 退出 0；首轮未启用 cgo 的失败保留。侧装 `/Users/shopme/Applications/OpenDesk-R16R2.app`，2.0.1/arm64/ad-hoc，codesign deep strict 通过。二进制 SHA256 `cb4bf080922fde9c0cfc797412a3979cc2d73cc1baae2873ff30b874a238b1ee`；导出树没有 .git，不伪造内嵌 vcs 信息。

现有 `/Applications/OpenDesk.app` 和其全局 launcher 未覆盖。现有 machost/custom-ui 修改、用户 PNG 和其它测试差异未纳入提交。默认 Node Native 实例未接管；未推送、未发布。

最终本轮 Native instance `r16-r2-safe-01a12689`，CFT profile `/Users/shopme/Library/Application Support/OpenDesk/R16R2-01a12689/cft-profile`，真实 ID `nglmdplfafjkjapdpjeinfgcikhcjjmd`。setup/doctor 原始证据有 installed=true / authenticated connected=true；正常关闭 Chrome 后 socket 自行释放、再连通。旧 Documents profile 的 manifest 读取阻塞栈与失败保留，未调整系统保护。最终 Chrome 启动显式 PATH 选择旁路官方 Codex 0.159.2 及 Node24；不永久修改个人环境。

官方 ChatGPT login status 有效；CLI schema/auth 可用，但真实 doctor `CODEX_UNSUPPORTED / E_CODEX_POLICY`：安全 thread/start 返回非程序所有的 AGENTS.md instructionSource。-overlay 诊断只输出策略布尔值和文件 basename，未读取凭据正文或更改个人配置。真实 ContinuousSession/Cancellation 两测试 session.open 拒绝；canary PASS 仅为合成 fixture 隔离，不是模型推理。保留 codex-real-probe.log / codex-real-turns.log / ai-doctor-final.json / policy-diagnostic*.log。

Aquinas 独立只读复核本轮补丁无剩余 P1/P2；真实模型闭环无证据，维持 NOT_ACCEPTED，不能给 95 分。Mac 现已锁屏，桌面工具无法解锁，已请求手动解锁。没有已接受真实 sessionId/threadId/turnId，也没有业务 runId/resultId/revision/sourceHash；保存及两次断开 AI 复跑、最终 Side Panel UX、全部旧 RPC/Node 高级能力真实现场仍未完成。完整 Gate A–F 状态及失败矩阵见 Browser 账本。
