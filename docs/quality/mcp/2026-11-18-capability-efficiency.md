# Capability-first 小步提效与活动构建核验

2026-11-18，macOS；基于现有 Calculator CLI recipe、`tm_window` 与官方 Secure MCP Tunnel。
源码基线 HEAD 为 `975f7f111c6ffe6b18002c08574b762eb1aa06c1`，共享 checkout 有未提交修改。
本轮未提交、切换分支或推送。旧能力、29 项 canonical 修复和之前的网页输入验收沿用各自证据，未重新实现。

## P0：先测量，再限定窗口枚举范围

成功基线和候选使用相同输入：`21*2`，独立读到 `42`，再以实际结果生成 `42+8`，独立读到 `50`。
计时包装只记录 API 名称、起止时间和失败标记，保留同步/异步行为；两份包装脚本的业务差异仅是
recipe 两处 `window.list()` 改为遍历已解析 PID group 的 `window.list({pid})`。

| 指标 | 成功基线 | 候选 |
| --- | ---: | ---: |
| execution | `ai-20261118-163747-637000` | `ai-20261118-164544-797000` |
| 总耗时 | 133,232 ms | 45,285 ms |
| `window.list` 次数 | 63 | 63 |
| `window.list` 累计耗时 | 117,005 ms | 27,386 ms |
| AX snapshot 次数 | 18 | 18 |
| AX snapshot 累计耗时 | 2,190 ms | 2,583 ms |
| native invoke 次数 | 14 | 14 |
| 实际结果 | 42 → 50 | 42 → 50 |

这次完整样本总耗时减少约 **66.0%（2.94 倍）**，枚举累计耗时减少约 76.6%。
这是同机单次完整对照，不能视为所有桌面状态的性能保证。`UI.tapTargets` 包含子调用，不能将所有计时行相加。
旧 CLI 和候选 CLI 均为 Go 1.25.13、darwin/amd64、CGO，避免把架构切换计作收益。

没有删减窗口、前台、geometry、唯一性、输入前预检或独立稳定 Display 检查。
没有修改 AX 查找策略。耗时证据表明先优化全桌面枚举更有价值。
macOS native owner 仅向 System Events 请求指定 PID 的窗口，并合并同 PID 的 CoreGraphics 窗口；
PID/窗口枚举、bounds 或归一化失败均报错，不丢弃候选、不降级为活动窗口。
无 selector 保留原有路径；其他平台保留原枚举后过滤。

主要源码：`automation/window_manager_core.go`、`automation/window_manager_darwin.go`、
`polyfills/003-window.js`、`examples/ai-cli/macos-calculator-recipe.js`。

## P1：安装文件、Tunnel 进程和实际调用共同核对

新增 `tm_status.buildIdentity`，提供 PID、OS/架构、Go 版本、VCS revision/modified，及 Runtime 初始化时
磁盘可执行文件的 basename、SHA256、观测时间。只采集一次，不返回完整路径、argv、环境或凭据；
哈希失败不会使 status 失败。该哈希**不是加载内存的证明**。
实现位于 `pkg/mcpserver/build_identity.go` 与 `runtime.go`，使用内部 seam 测试覆盖隐私、缓存和失败行为。

默认 tools/list 的 43 个工具名称、说明及 schema 与旧 v3 完全一致；未打开可选 scripts/docs 工具。
旧 client PID 784 经现有 helper 再核对 UID、执行文件、argv、profile 和 3001 listener 后仅发送 SIGTERM，
确认退出且释放端口。旧 profile 和二进制保留，另已准备 rollback profile；未执行回滚启动测试。
新 client PID 14384 → MCP PID 14385；现场进程路径与固定 profile 指向候选二进制。

| 产物/现场 | SHA256 / 状态 |
| --- | --- |
| CLI 候选、`dist/opendesk` | `4d06b59d006e668a2cbe6c42450b7a30214d961baf3600578155da2bcfe4d4ac` |
| MCP 候选、`dist/opendesk-mcp`、`~/.local/bin/opendesk-mcp` | `98c04c22d946c1b47f07fb8e2627ac77671f2698ca9dda7256d2cc21930cc426` |
| 活动 Tunnel 的 `tm_status` | 同一 MCP 哈希，PID 14385，darwin/arm64，HEAD 同上，modified=true |
| 官方 client health | healthz live、readyz ready、control-plane poll 正常 |
| fresh Tunnel `tm_window.read` | 精确 Calculator windowId，实际 `42+8` / `50` |
| fresh `tm_permissions` | accessibility、screenCapture、inputMonitoring=true；Automation 仍标 requires runtime AppleEvents trigger |

MCP 使用 arm64，与本轮前已安装 MCP 的架构一致；其架构变化未计入 CLI 提速。
所有替换均先备份再原子替换；未替换稳定签名 App、UI host、`dist/development` 或其他 Native 服务。
原配对、key 文件引用、控制面代理和管理端口保持原配置。新 Tunnel 保持运行供后续使用。

本轮 ChatGPT 网页请求位于 <https://chatgpt.com/c/6afd6715-e9c8-83ee-855a-aa48ee63f79b>，
使用 ego TaskSpace 150、GPT-6.2 Sol 轻度与现有 Desktop 插件。网页显示依次列窗、检查状态、读取窗口文本，
但停留在工具状态，重新加载后仍未给出结果，4 分 47 秒后停止该只读请求。
后续较窄草稿未成功发送，已清理。**本轮 fresh 网页最终结果未通过**，不借用此前网页成功记录冒充。
同一新 Tunnel 的 Codex 端 fresh status/read/permissions 已成功，停止网页请求前又成功返回同一身份；
现场进程采样为空闲等待，尚不能判定网页未完成的根因。未因此更换模型、代理、权限或重启 Native。
`/health/mcp` 仍报告 initialized、tools_list 未记录完整列表；这是诊断局限，不替代独立 tools/list 与业务调用证据。

## 验证与证据

- Host JS 回归 34/34，通过 PID 透传、跨 group 歧义、生命周期改变、错误不降级和 JXA 边界检查。
- 定向 native 内部 seam 测试通过；未以 Go 白盒代替公共 Runtime 契约。
- `go test -count=1 ./pkg/mcpserver ./internal/aicli` 通过；编译仍有已有 native deprecation / duplicate library warnings。
- 公共 JS `tests/runtime-api/window-list-pid.js` 已用候选 Runtime 与已知 Calculator PID 97887 直接执行通过，
  覆盖无效 PID、缺席 PID、真实 native bridge 与 PID+title 组合。该运行使用 task binary，不冒称文档中的 dist 命令已运行。
- CLI 同步后，从仓库根目录原样运行 recipe 注释的公开命令：
  `./dist/opendesk ai run examples/ai-cli/macos-calculator-recipe.js --input '{"expression":"16*3","expected":"48"}'`。
  execution `ai-20261118-165734-911000` 成功，25,192 ms、7 次 native invoke，独立读到 `48`，
  对应窗口截图已目视确认。此项与前面的包装脚本性能对照分别记录。
- 基线和候选的真实窗口截图已目视检查：完整计算器、表达式 `42+8`、结果 `50`；按钮、文字与窗口尺寸正常。
- 定向 gofmt、JS 语法与 `git diff --check` 通过。未运行完整 CI、全仓 typecheck 或无关桌面回归。

运行证据统一位于仓库根目录下 `.runtime/tests/mcp-efficiency/20261118/`：
`measurement.json`、`baseline-timings-summary.json`、`candidate-timings-summary.json`、
`mcp-old.json`、`mcp-candidate.json`、`source-build-manifest.json`、`tunnel-live.json` 和定向测试日志。
原始 business result、计时、script snapshot 与图片分别位于上表两个 `.runtime/ai/<execution>/`。
网页未完成的 UI 证据为 `web-incomplete.txt` / `web-incomplete.png`。
当前 profile 为 `tunnel-current/`，回滚 profile 为 `tunnel-rollback/`；均仅引用已有 key 文件。
如需回滚 Tunnel，应先用 `desktop-tunnel.py stop --run-dir <tunnel-current绝对路径>` 完成归属检查并退出，
再用 `desktop-tunnel.py run --run-dir <tunnel-rollback绝对路径>` 启动旧 v3；仍须 fresh 核验实际加载与业务结果。
同步前的磁盘文件保留为 `previous-dist-opendesk`、`previous-dist-mcp`、`previous-installed-mcp`，
这些备份不代表源码或签名发行包的完整回滚。

另有一次初始包装入口未 await，未产生业务结果；一次因前台切换至 ChatGPT 而安全失败于 STALE_TARGET。
两者均保留，未计入成功基线；失败 execution 未重放已完成输入前缀，之后使用全新 execution。

## P2 与当前边界

本机 Tesseract 仅安装 `eng`、`osd`、`snum`。本轮 Calculator 原生语义路径无需 OCR，未证明中文 OCR
是当前任务缺口，因此未下载语言包、添加新 OCR backend 或扩大默认权限。`tm_window` 的边界仍是
精确当前窗口的 activate/read/ocr，不授予 Accessibility refs/actions 或任意脚本执行。

建议自然语言入口：

> 用 OpenDesk 操作 macOS 计算器计算 21×2，读取真实结果，再用读到的结果加 8 并验证。
> 先使用当前可发现的原生能力；需要视觉时只读取目标窗口。结果不明确或输入状态未知时停止，不重放输入。

本轮源码、构建、安装和 CLI/Tunnel 运行已分别核验；正式签名发行包未重打包，Linux/Windows live 未测试。
共享 checkout 中其他修改和服务继续由原任务管理。本轮全部运行产物留在 `.runtime/`，不进入版本控制。
