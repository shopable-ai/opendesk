# R16 Go 验证证据（2026-10-10）

**最终候选请先读 [进程启动加固后的证据](remote-control-final/README.md)**。下列顶层日志是先前冻结候选，已全部保留；最终生产集合改为 `1e96b15cfaaa304408c71edb52ea021e00334df77a75a180f43c638beb6bb22c`。

本目录保留该轮实际执行的原始文字日志、合成输入/模型输出，以及冻结候选 manifest。它们对应 `master` 基线 `a02fe4810393b334526e1692b9d1d872b0956888` 之上的本轮 Go 实现。最终提交可由包含本目录的 git commit 精确定位；`r16-evidence.json` 中 `candidateCommit:null` 是提交前的原始值，不改写原始证据制造提交身份。

冻结生产源码集合 SHA256：`b4e7620f5f0d88ccbaf4446400a84ad6e54229c7ca3fc6177f1430fce7422584`。manifest 的生产源码及测试文件哈希在归档前全部复核一致。归档后仅实施说明追加了本目录链接；原始 manifest 的该文档哈希保留为冻结时版本，不代表归档后的文档字节。

## 如何判读

- `real-final-candidate.log` 是最后生产源码候选的真实 CLI 运行：实际 Probe、同线程 17→21 两轮、活动流式取消、MCP canary 及合成 Workflow JSON。冷恢复明确跳过，不记通过。
- `component-tests.jsonl`、`native-contract-tests.jsonl` 为定向 race 组件证据。默认真实测试 opt-in 跳过与另一次已 opt-in 实测分别统计。
- `go-vet.log` 与两份 `cross-*.log` 是空 stdout；成功依据是 manifest 记录的命令/exit code，而不是文件为空。两份 Darwin/arm64 Mach-O 仅交叉编译，未执行；为避免在文档提交测试二进制，本目录仅保留它们在 manifest 中的 SHA256、大小与目标信息。
- `test-architecture-audit.log` **FAIL** 的 24 个条目均已存在于实施基线；本轮三个新测试全部登记。既有失败没有抹除或改写为通过。
- `real-continuous-proxy.log`、`real-continuous-resume-diagnostic.log`、`real-cancel-workflow.log` 保留先前失败；`real-final.log` 和 `real-mcp-canary-final.log` 是收敛过程记录，不与最终候选混同。
- `workflow-input.json` 与 `real-workflow-proposal.json` 只含公开合成页面/workflow。模型输入取自当时 Browser 暂存 helper 的明确快照；不是一次实际 Sidebar / Chrome 操作。Browser 侧的原编译器消费验证单独记证据。

**NOT_TESTED：**macOS App/Native 安装、真实 Chrome、旧 Node 与 Go 实际互通、真实 Browser 工具往返、RunHost 持久结果及关闭 AI 后保存工作流重复执行。Linux 组件、真实 Codex 和 Darwin 编译不得升级为上述原生验收。

详见 [Go 实施与验证记录](../../workflow-codex-app-server-r16-implementation.zh-CN.md)。
