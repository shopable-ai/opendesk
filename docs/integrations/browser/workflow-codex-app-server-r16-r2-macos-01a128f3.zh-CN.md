# R16 R2 macOS Go 本轮续接 · 01a128f3

日期：2026-10-11。完整合同及 Browser 本轮记录分别为 Browser `docs/framework/prompts/goal-r16-r2-local-macos-repair-acceptance.zh-CN.md`、`docs/framework/workstreams/r16-r2-macos-01a128f3.md`。旧 01a12689 记录和全部原始证据保留。

Go master HEAD `802fb009c8f0c9a6ce85b1b9e4320ffd0a65ae45`，生产候选 `cb35e574760daa390803740f6e3803d6621f2825`。本轮未修改 Go 生产源码或提交；用户 customui/macOS、runtime-api 和未跟踪图片/测试保留。远端只读 master 返回 `f87d240f7efd2a3cedb9eaf0f8f7cc44660ab14c`，不称本地同步，下次提交前重核。

本轮原始命令/日志统一在 Browser `.runtime/tests/r16-r2-macos/01a128f3/`，`go-workflow-proposal-snapshot/` 是已提交 Go HEAD 的独立导出，不含用户差异。Go `/Users/shopme/.local/opt/go1.25.13-amd64/bin/go`；Node `/Users/shopme/.nvm/versions/node/v24.16.0/bin/node`。

## 官方隔离与真实能力

官方 codex-cli **0.159.2**，入口 `/Users/shopme/.local/bin/codex`；实际二进制 `/Users/shopme/.local/opt/opendesk-codex-0.159.2/node_modules/@openai/codex-darwin-arm64/vendor/aarch64-apple-darwin/bin/codex`，SHA256 `16593cc2f422d5f398a8e40f550ebbaf1245392528957be342c295920a300704`。独立 CODEX_HOME `/Users/shopme/Library/Application Support/OpenDesk/R16R2-01a128f3/codex-home`，0700/auth0600，官方 login status `Logged in using ChatGPT`。

用户明确“可以读取或复制 ~/.codex/auth.json，你有权限”，覆盖原 Gate A 这一限制；已一次性复制到独立 Home，不打印/记录正文、不修改源 auth 或个人配置，元数据 `authorized-auth-isolation.json`。无需再开浏览器重复登录。个人 Home 全局 AGENTS 的 E_CODEX_POLICY 已用官方独立 Home 解决；不删除 instructionSources，不放宽精确版本、官方 openai、空 environments、MCP/shell/file/外网工具和沙箱门禁。project_doc_max_bytes=0 不能禁止全局 provider。官方精确源码及 hash：`upstream-exact-source-index.json` / `upstream-verified/`。0.162.1 只核对两个相关源文件，未安装或扩展兼容。

只对本轮子进程传现有 `HTTP_PROXY/HTTPS_PROXY=http://127.0.0.1:7897`（含小写），NO_PROXY localhost；不改系统/个人 provider。真实 opt-in：

- `go-real-codex-live-ready-command.json` / `go-real-codex-live-ready.log`：Probe READY_FOR_TURN，probe inferenceVerified:false 保留；实际连续两轮 17→21、流式、取消后 interrupted、ambient MCP canary PASS。安全拒绝的冷恢复分支有据，真实冷恢复仍 SKIP/NOT_TESTED。
- `go-workflow-proposal-live-command.json` / `go-workflow-proposal-live.log`：`TestInstalledCodexWorkflowProposal` PASS，51 events、模型 JSON **232 bytes**，文件含换行 233 bytes、SHA256 `ae2357e4ac927dd07ededdb1d422d94ab0c503384a39fba50a8ee641d809ea8c`。只证明合成 proposal，Browser Compiler/Chrome 另证。
- 旧 browserai/browserbridge/browsercli 普通/race/vet 在输入未变范围复用原 PASS，不称全仓通过、不因文档提交重跑。先前 PATH 缺 Go、网络未知、SKIP/失败均保留。

## App / Native 与剩余

侧装 `/Users/shopme/Applications/OpenDesk-R16R2.app`，实际 runtime `Contents/MacOS/OpenDesk` SHA256 `cb4bf080922fde9c0cfc797412a3979cc2d73cc1baae2873ff30b874a238b1ee`；不覆盖 `/Applications/OpenDesk.app` 或全局 CLI owner。

Native instance `r16-r2-ping-01a128f3`，wrapper/socket `/Users/shopme/.opendesk-browser/native-agent-instances/r16-r2-ping-01a128f3/`；CFT profile `/Users/shopme/Library/Application Support/OpenDesk/R16R2-01a128f3/cft-ping-profile`，其 `NativeMessagingHosts/com.shopable.opendesk_browser.agent.json` 只允许扩展 `deofeaadofkjjocgijngcjnbeamamjob`。`native-final-doctor.json` 真实认证 connected=true，requestId `35f76fbb-e0e4-455f-8d78-cc5eb8dcbce4`，hostRegistrations=[]；socket 本身不当认证证据。

正式 Browser 包 source `2cc6879a0b56c4bacf5ded2ada876a6ff9435792`，development packageHash `d9ca61feba925d810e6e89c0be06199bbdefa31a5d154cfeb91290ed18fdc811`。当前 Browser main 已 `51dc666c2f02e9cd99956700523429a84d2e9824`，有相关生产输入变化，需影响核对；正式 CFT PID 1091 尚未补真实 Side Panel 闭环。诊断包已有真实业务保存和两次断开 Native AI 复跑，不提升为正式包验收。

Gate A 受控范围 PASS；B/C/D/E/F 整体 NOT_TESTED。C 缺实际 welcome workflowAiVersion:1、旧十 RPC 与旧 Node AI 拒绝完整证据。十 RPC：bridge.status、target.current、script.save、run.start、run.get、run.stop、page.preview、page.get、page.dispose、request.get；Node CLI 仅七项，不能冒充十项全回归。Node 高级 ESM/npm/MCP、正式 UI/失败矩阵、完整离线窗口直接网络观察尚缺。HTTPS 保留与回归按合同，真实 HTTPS 推理无本轮 Key 单列 NOT_TESTED，不另造第二模型门槛。

独立反方 **NOT_ACCEPTED**；交接文档本地未提交，本轮无新生产 commit/push/release。完整续接提示词在 Browser `docs/framework/prompts/goal-r16-r2-macos-continue-01a128f3.zh-CN.md`。

**R16 R2 尚未完成最终验收。**


## 资源交接后的最新补充（2026-10-11）

此项晚于上文交接，续接时优先核对此状态：Browser main 最新实查为 `2a7bc0be1a71c23890c6fb54f740a16a2a234955`；Go master 实查仍为 `802fb009c8f0c9a6ce85b1b9e4320ffd0a65ae45`。正式已加载包仍绑定 `2cc6879a`/development `d9ca61fe…`，没有重新构建或升级其验收等级。

R22.1 已报告正常关闭自身 Chrome/Native 并释放 root dist 写入占用。本轮只读核对：PID44555 已不存在，旧 profile codex-cft-cye54vks 和 r22-final-01a1290f/agent.sock 不存在，65132/43119/43120 未发现监听。本轮 PID1091 仍运行，profile/加载路径仍属于 R16，r16-r2-ping-01a128f3 socket 存在。原同 bundle 冲突对象已经退出；新对话先重新选择并确认本轮 CUA 对象，不沿用旧绑定，不把已释放资源当当前 BLOCKED。精确 PID helper 的授权仍有效、尚未执行，正常 CUA 可正确选择时无需 helper。

R22.1 报告其4e候选七视口/200%及真实SidePanel五页通过，但这不等于本轮正式包布局 PASS，也不证明完整 Node/NativeMac 回归或最终评分已关闭。其修复提交 `4e0fc21642b68ae977c064a4b8972f7721c4b8b1` 已在本地主线；候选影响按实际生产输入重核。root dist 即使释放，续接仍优先本轮独立产物，启动写入前确认没有新 owner。

原始核对命令及结果：Browser `.runtime/tests/r16-r2-macos/01a128f3/continuation-resource-update.json`。本次没有 UI 操作、测试、构建、提交或推送。独立结论仍 NOT_ACCEPTED，**R16 R2 尚未完成最终验收。**
