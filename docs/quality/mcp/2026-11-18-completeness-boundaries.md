# MCP 异常边界与完整待办（2026-11-18）

本轮 owner：对话 `01a1edce-211f-7751-a74e-04863d109d11`。原生 goal 独立建立；分阶段验收规格位于
`.omx/plans/mcp-completeness-20261118.md`。证据根目录为 `.runtime/tests/mcp-completeness/`。
保持 master、HEAD `975f7f111c6ffe6b18002c08574b762eb1aa06c1`，不提交、不推送；大量并行修改保留。
本记录不建立第二份 API 方法数据库，不用结构完整或代表性测试冒充全接口通过。

上一阶段安装路径复验为 11/11；两处 CLI 当时安装版本为
`e127bb9803bc91defe095be82ba889ab77b8733bff7d810ab928fc817c484da7`，peer 代表性安装 gate 为 74/74。
用户随后要求重新建立目标继续修复，当前增量计划为 `.omx/plans/mcp-descendants-20261118.md`。
新一轮已复现并修复文档孙进程继承管道导致超时失效、Git provenance 无输出预算，
以及独立复核发现的清理编号复用竞态。最终安装版为
`c8028eba7750249b5bb7ad93df3d1d2e170259a2f75ebab370ebab0c4620c0cb`。
本对话从实际用户安装路径独立复验 51/51，含三项实际进程所有权观察；fresh MCP PID19577 的磁盘身份、
测试前后两处 hash 和三份生产源码均对账。peer 新 owner `01a1ee3c-ab35-7712-9de0-3d1867edf119`
已修复其两个 Custom UI finding，并完成候选与 dist/PATH 两路径各 80+29 项回归及串行安装。
这是本轮可独占异常边界的闭环，不代表 499 个公开成员、真实桌面或条件项全部通过。

## 合并复核增量

合并证据根为 `.runtime/tests/mcp-merged-20261118/`。以前的 c8028eba 安装回执和 51/51 复验保留为历史。
合并审查以 499 个既有 `(doc, method)` 和 56 条历史 finding 为基线。
候选、dist、用户 PATH 各通过 85/85 项 MCP 和 29/29 项兼容回归，候选另以只读真 stdio 核验 499/499 带类型阅读包。工程检查为文档 54/54、MCP/CLI/执行相关 Go 与 vet 通过、定向 race 通过。两个 CLI 的 SHA-256 为 `e383188a4ca9bd91a3432bfeedee6e682922b75a20ff718eacec174ca3eebe04`。本次可交付的本地修复与每项残余边界见下表及 [Runtime 深度记录](2026-11-18-runtime-depth.md)。

## 历史实现与问题

- A1：旧安装版在可信故障 checkout 返回 JSON `null` 时真实 panic，退出码 2。
  失败证据 `20261118/docs-null-before.log`，原始 stderr 位于 `docs-faults/null-mOkMvH/stderr.log`。
  `pkg/mcpserver/api_docs.go` 在 JSON 解码后同时拒绝 nil map，返回明确工具错误。
- B1：新增 `tests/mcp/api-docs-faults.test.js`，仅在本任务可信 checkout 注入故障。
  覆盖 null、数组、字符串、数字、布尔、非法 JSON、非零退出、10 秒超时、stdout 超过 768 KiB、
  stderr 超过 16 KiB；每项要求整包拒绝、子进程消失、ping、下一次目录/完整阅读和正常 EOF。
  真正运行后发现两条预算都失效：嵌入 `bytes.Buffer` 提升了 `ReadFrom`，`io.Copy` 绕过 `Write`。
  已改用命名 buffer 字段。修复前 `docs-faults-candidate-after.log` 为 8/10，两个超限均误返回成功；
  修复后 `docs-faults-budgets-after.log` 为 10/10，无跳过，超时案例约 10 秒。
  初次在构建尚未完成时过早启动测试而得到 ENOENT 的运行保留在 `docs-faults-candidate.log`，不计产品失败。
- B2：新增 `tests/mcp/script-initialization.test.js`，真实 stdio 将自有 session artifact 根临时变为文件，
  拒绝后目录为空、ping 可用；恢复后正式 `tests/runtime-api/mcp-advanced.js` 完成，ID 后缀仍为 `-1`，
  MCP summary 与独立磁盘 summary 对账成功。`script-init-candidate.log` 为 1/1。
  内部 snapshot/emitter 的确定性故障用私有 `start(args, prepare)` seam 补充；公开请求无路径或依赖注入。
- 构建期间发现并行 WindowManager.List 可选参数增量与 MCP 内部无参接口不兼容。
  writer 范围经只读核对后，在 `pkg/mcpserver/window.go` 增加无参委派，保持私有接口。
  初次构建失败保留于 `20261118/build.log`；不修改 native owner。

本轮源码与稳定测试归属：

| 文件 | 改动目的 |
|---|---|
| `pkg/mcpserver/api_docs.go` | 拒绝 nil JSON map；命名 buffer 防止 ReadFrom 绕过输出预算；Node/Git 手动拥有双流管道，在首次 Wait 前处理 deadline/预算失败，Git 加双流预算。 |
| `pkg/mcpserver/api_docs_process_{unix,other}.go` | darwin/linux 在 leader 尚未回收时清理持有管道的进程组；其他平台仅有界 drain，后代 ownership 待实现。 |
| `pkg/mcpserver/script_execution.go` | 私有 prepare seam，确定性验证受理前初始化失败；公开请求未增加注入点。 |
| `pkg/mcpserver/window.go` | 显式无参 List 委派，兼容 native 可选 selector 增量。 |
| `pkg/mcpserver/script_lifecycle_test.go` | JS 无法安全控制的内部初始化、清理屏障、取消竞态与关闭超时测试。 |
| `tests/mcp/api-docs-faults.test.js` | 20 类真实 stdio 故障，含继承管道、双流交叉失败、Git 超时/预算、启动失败和提前关闭输出；检查未回收 leader、恢复、子孙进程消失与 EOF。 |
| `tests/mcp/script-initialization.test.js` | 初始化拒绝后真实 Runtime 恢复、磁盘摘要与进程身份对账。 |
| `docs/quality/go-test-file-classification.md` | 仅追加上述内部测试的增量登记；其他并行行保留。 |
| 本质量记录 | 23 类状态、边界、owner 与实际证据。 |

## 23 类状态台账

状态区分已知缺陷、缺测、条件未就绪和可选项。下表记录合并复核状态，保留各历史证据的适用范围。
peer 原指对话 `01a1edc8-635f-7042-89c5-c238ab5a9d4b`，其新工作/安装 owner 已交接至
`01a1ee3c-ab35-7712-9de0-3d1867edf119`；现场项的未来 owner 尚未分配。

| 项 | 类别 / owner | 当前状态与关键证据 / 后续条件 |
|---|---|---|
| A1 | 缺陷已修复 / 本轮 | 已复现 panic，最小修复；候选及正式安装路径均通过，无崩溃，后续请求恢复。 |
| A2 | 历史未通过 / 本轮本地检查，云端未分配 | 既有本地 relay 10 项、丢响应 21 项新鲜通过；云端 `auditComplete:false/E_RELAY_STOPPED` 历史保留，需限定云端现场复验。 |
| A3 | 离线识别失败 / 通用资格 owner 未分配 | 本地 OCR 71 次有回包。盲测 69 张精确 24、错读 42、漏检 3，45 个失败中 22 个 confidence ≥0.80。历史表达式仍为 142 / 0.37767986、结果 3 / 0.96817154。缺少 chi_sim 数据文件，英文回退影响资格。保留原始输出并停止，无输入、无远端 provider、无全局字符替换。证据 `.runtime/tests/mcp-merged-ocr-20261118-XgLc5R/`。 |
| B1 | macOS 已修复并再次安装复验 / MCP 生命周期 owner | 历史继承管道、双流预算与 Git 进程组问题均有 red→green。最终三路径兼容回归各 29/29。用户 PATH 首次并行观察错过瞬时 ps 样本，同 SHA 独立串行复验通过。失败保留在 first-installed-local-compatibility/。非 Unix 后代 ownership 保留在 C8。 |
| B2 | 已补测 / 本轮 | 候选及安装路径真实 stdio 失败→成功均 1/1；内部 snapshot/stdout/stderr/events 失败均不占计数/slot、无 phantom、可恢复受理，lsof 无打开 artifact 句柄；partial 文件保留，未引入清理策略。 |
| B3 | 内部 seam 已补测 / 本轮 | 11 顶层 / 14 叶子，含十秒关闭、重复取消/自然完成 64 轮竞态，race/vet 通过；合成 Manager barrier 不能证明真实 native teardown 阻塞或硬中断。 |
| B4 | 代表性资源 gate 已安装复验 / 合并复核 | 候选、dist、用户 PATH 各 85/85 MCP 和 29/29 兼容。覆盖下载、Webhook、SQLite、Stream、FIFO、File.copy 同 inode、FileHandle.truncate 与 HTTP 边界。Custom UI 合成 driver 的历史普通/race 证据保留。现行资源矩阵与 native 硬中断仍有缺测。 |
| B5 | 阅读包闭合，方法语义部分核验 / 合并复核 | 固定 499 个公开成员，全量带类型阅读包通过候选真 stdio。499 逐项附 owner/覆盖等级/未核验说明，56 条历史 finding 保留。Keyboard、Screen、FileHandle、HTTP、ImageColor、Events、BrowserDOM、Mouse 与 UI 修复见深度记录。全局 C10/P1 仍开放。 |
| B6 | 候选及双安装路径来源已核对 / 合并复核 | 保守构建快照在 build 前后、安装前及交付稳定，aggregate 8bffe4c…69fe0。三路径实际 stdio 进程、checkout、reader/map/adapter 和外部 JS 加载事件/哈希对账。provenance 的错误来源与变更 fixture 通过。runtimeMatchVerified 保持 false。 |
| B7 | 代表性安装路径已测 / 合并复核 | 三路径各 85 MCP 和 29 兼容，包含文件、网络、数据、持久化与条件停止，多个场景有磁盘或 loopback 独立 oracle。受控 Agent CLI 不调用外部模型。合成输入、事件和浏览桥未访问设备。历史 Runtime 逐方法下界保持 98/499。 |
| C1 | 条件未就绪 / 未分配 | ensureMacPermissions 未现场申请；waitForNavigation 仅兼容超时/参数验证，不能证明浏览器导航。 |
| C2 | 条件未就绪 / 未分配 | 无本轮受控播放现场；isPlaying/startedAt、结束/取消/清理未实测，不录音。 |
| C3 | 条件未就绪 / 未分配 | Custom UI 需配套 host、握手、窗口交互与视觉分别验收；CLI 或 id 不证明窗口可用。 |
| C4 | 条件未就绪 / 未分配 | Native Extension 需受控 bundle 与真实方法调用；未启用 unsafe call、License/entitlement。 |
| C5 | 条件未就绪 / 未分配 | provider、预算和具体授权不足；无外部模型请求、无凭证读取/路由改变。 |
| C6 | 现场条件未就绪 / 对应原入口 owner | BrowserDOM 边界由惰性 Core fixture 和 Go adapter 替身核对，覆盖后验不可信及关联 ID 缺失。真实 Core、Recorder、App Mode、Flow 的专有入口仍未执行。 |
| C7 | 条件未就绪 / 限定部署 owner 待分配 | 独立运行一致性任务已结束：其新 Tunnel 43 工具保持旧 surface，刻意未启用 scripts/docs；fresh WEB 最终结果未通过。新六工具需独立限定部署与授权，本轮不启用或重启。 |
| C8 | 跨平台构建受阻与实现缺口 / 平台和 MCP 生命周期 owner | CGO-off 离线探针 Linux 缺 7 个缓存依赖、Windows 缺 4 个。目标 C 头分别缺 ALSA 和 Windows SDK 或交叉 sysroot。Windows 产品分发要求 Windows x64 builder，现行清单未列 MCP CLI。没有目标二进制、包或 live。Windows 文档/Git runner 只清理直属进程，需验证继承管道的后代所有权。命令、缺失依赖及复验条件在 `.runtime/tests/mcp-merged-engineering-20261118-NxCNAY/verification.json`。 |
| D1 | 既有债务 / 各域 owner | 工程基线 68 项架构诊断，MCP Server/CLI 直接归属为 0。补齐 FloatingWindow 公共类型后按同口径由 12 降至 8，余项来自 tapTargets 重复声明。逐条归属见 `.runtime/tests/mcp-merged-engineering-20261118-NxCNAY/architecture-owner-map.json`。最终对照见合并证据根。 |
| D2 | 可选 / 未分配 | 未做 RSS/磁盘留存预算测量，不新增策略或清理用户产物。 |
| D3 | 可选，局部已测 / 本轮及独立效率任务 | 固定 17:00 候选＋冻结 checkout，20 次重复目录 p50/p95 43.98/47.63 ms、完整阅读 107.35/118.92 ms；5 次新进程与故障恢复另记。未测真实 execution 轮询、OS 冷缓存或全局性能；未新增缓存。独立任务另测 window.list。 |
| D4 | 可选 / 独立运行一致性任务及本轮 | 进程身份诊断由其 owner 实施；本轮只保留受控错误和协议证据，无 WEB→云端→业务完整 join 结论。 |
| E1 | 已原子替换并分别复验 / 合并交付 owner | 两处 CLI 均为 e383188a…ebe04，各自备份旧 c8028eba 版本。限定安装候选、dist、用户 PATH 各通过 85＋29，证据根内 install-receipt.json 和 external-assets.json 明确 PID、路径与来源。单文件交付依赖现有外部 JS。其他进程及配套宿主未重启。 |

## 本地 relay 新鲜证据

`20261118/relay.log`：10 项通过，含 EOF、child-first、错误输入/输出、取消、输入/输出背压与延迟错误；
各 case 的最终审计只生成一次，退出码一致，预期异常不被改写为 auditComplete，子进程消失。
报告 `tunnel/relay-regression/run-l5kd48ja/result.json`。

`20261118/drop-response-retry.log`：21 项通过，受控 request/response 和一次性 fault，含在途请求排序与未受理请求；
该既有工具要求 `.runtime/tests/mcp-files-core/<unique-run>/`，故其产物例外使用正式工具要求的
`.runtime/tests/mcp-files-core/completeness-20261118/drop-evidence/drop-response-v1sqtgfo/`。
首次将该工具输出放入 completeness 根目录被工具拒绝，保留 `drop-response.log`，未改工具边界。
这些都是本地 synthetic relay 测试，不是云端、Native 文件服务或 WEB 验收。

跨平台条件只读核对见 `20261118/cross-platform-conditions.json`：正式 Windows 分发入口和平台约束来自
`docs/architecture/windows-build-distribution.md` / `scripts/build_windows_distribution.ps1`；未执行该发布构建，
未修改其输出路径或绕过 Windows/x64 校验，也未把工具存在性当 cross-compile/package 通过。
后续只读核对 `.github/workflows/app-mode-payload.yml` / `windows-core.yml`，分别已有 Ubuntu 原生
Runtime 和 Windows `go build ./...` 入口；Linux 入口显式安装 ALSA、X11/XKB/XTst/Xinerama 开发依赖。
这些是 CI 源码事实，不是本次 MCP 编译/打包结果，亦未触发远端 CI。来源 hash 与限定见
`20261118/cross-platform-pipeline-observation.json`。

## OCR 历史样例离线复核

独立查看原 `calculator-web-capture.png` 确认图中表达式为 `1+2`、结果为 `3`，之后只把原图片路径
与 `provider:local` 交给真实 stdio `tm_ocr` 一次，未把参考文字传给 OCR，未重拍、点击或切换 provider。
`20261118/ocr-offline-final.log` / `ocr-offline-LEo7VM/response.json` 保存新鲜原始返回：
表达式 `142`，confidence `0.37767986`；结果 `3`，confidence `0.96817154`。
因此表达式识别仍未通过；低可信结果没有驱动输入，原文没有替换或补齐。
该受控样例没有完成符号、小数、近似字符语料的通用资格；没有修复 locator 或新增公共置信度阈值。
图片及候选 hash、PNG 尺寸、全量行/置信度、ping、正常 EOF 与纯协议输出见该目录。
一次性 evidence harness 位于 `20261118/recheck-ocr.cjs`；前两次 harness 路径/参数错误均发生于启动 MCP 前，
原始日志保留为 `ocr-offline.log` / `ocr-offline-after.log`，不计产品失败。

## 内部生命周期、复核与工程基线

`pkg/mcpserver/script_lifecycle_test.go`：11 顶层、14 叶子场景；定向测试通过，race 通过（15.035 秒），
vet 通过，十秒关闭测试实等 10 秒。四个初始化阶段由真实 artifact 创建后仅阻断对应目标；
尚未受理的失败留有部分诊断文件，未发现打开的 artifact fd。详见
`.runtime/tests/mcp-completeness/script-lifecycle-report.md`、`script-lifecycle-test.log` 和 `script-lifecycle-race.log`。
清理延迟由合成 Manager/Emitter barrier 控制，不证明真实 native 硬中断；孙进程回收未覆盖。
父任务随后补充十秒超时后的恢复：延迟 cleanup 完成后再次 Close 成功，但 admission 仍关闭；
该用例单独 race 复验通过（10.01 秒），见 `20261118/close-timeout-recovery-race.log`。

相关 Go 三包新鲜通过（mcpserver、MCP CLI、execution），`20261118/go-tests.log`；
MCP/CLI vet 通过，`go-vet-final.log`。全仓架构检查仍失败：68 项，新增/移除均 0，
见 `architecture-comparison.json`；仅归一化汇总行的实际/期望文件数，保留全部诊断。
新增 Go 内部测试已在唯一增量登记追加。本轮 owner 未改类型声明；peer 的
`.runtime/tests/mcp-depth/20261118/types-comparison.json` 已新鲜核对 TS 5.9.3、ES2022/no DOM、
skipLibCheck:false，基线/当前均为 12 条诊断，新增/移除均 0；这是基线不变，仍非全量通过。
peer 在 17:24 阶段的相关 Go 三包通过，文档回归 51/51 通过，分别见其 `go-final.log` / `docs-final.log`。
其后文档最终回归 53/53 通过，`docs-suite-final.log`；11 组/46 文档，正文结构缺口为零，
`docs-check-final.json`。最新架构比较仍为 68 项，仅汇总计数从已登记测试增量变化，
`architecture-comparison.json` 的 normalizedAdded/normalizedRemoved 均空；不删除或隐藏原始诊断。

可选延迟测量见 `20261118/docs-latency.log` / `docs-latency-R4AeVw/measurement.json`。
固定候选 `9445f6f1…`，复制既有受控 checkout 后独占使用；顺序真实 stdio 往返，nearest-rank 百分位，
完整 packet 校验在计时区间之外。20 次重复目录 p50/p95 为 43.98/47.63 ms，File.readJSON 完整阅读为
107.35/118.92 ms。5 次新进程首次目录 43.73/48.97 ms、首次阅读 104.86/109.01 ms；
5 次 null 拒绝后恢复阅读 109.99/113.41 ms。n=5 的 p95 只是样本最大值，新 MCP 进程不等于 OS/磁盘冷缓存；
每次阅读仍创建 reader 子进程，不能称缓存命中。所有响应/完整性和正常 EOF 均验证，未修改缓存、预算或实现。
这些是阶段候选的局部观察，不是最终安装版性能保证，亦未测 execution 轮询、RSS 或磁盘留存预算。

独立只读复核发现一处测试自身的资源保护问题：fixture 恢复抛错可跳过 detached MCP 关闭。
已改为独立 finally 保证关闭，跟踪实际 rename/placeholder 状态，保留业务与清理错误；
新增 tm_status 断言核对本任务 child PID 与初始化时磁盘文件 hash，不能把磁盘观测称为内存映像哈希。
复核未发现本轮生产修复的具体回归；不等于全仓或全接口批准。

17:00 阶段的 peer 候选固定副本见 `20261118/candidate-receipt.json`，SHA-256
`9445f6f15a55f9bd20e4ec12fd44d397d4b1c629f1e31307c13048b12d18ec2a`。
本轮两个新 gate 合计 11/11 通过，无跳过，见 `owned-final-candidate.log`；
其真实 child 身份与 summary 独立对账见 `script-initialization/stdio-nusAl8/`。
peer 在 17:00 阶段六组候选 gate 54/54，见 `.runtime/tests/mcp-depth/20261118/candidate-final.log`；
覆盖本轮要求保持的两组兼容 gate 与下载、网络回调、持久化和来源四组，不重复宣称全 Runtime 通过。

## 构建、安装和运行状态

初始 `dist/opendesk-mcp` 与 `~/.local/bin/opendesk-mcp` SHA-256 均为
`abdedc20e7cfd865f6e42eb80e8779d743e37b55769b69261aafc983269b309b`。
基线/源码快照见 `20261118/baseline.json`、`api_docs.before.go` 和 `status-before.txt`。
本对话未更新 GUI、UI host、插件或共享进程。
只读观察到旧 capability-first MCP PID 785、OpenDesk GUI PID 50465 / UI host PID 50486；
其路径与交接一致，未操作。PID 只表示本次观察，后续须重查。
16:45:19 另一运行一致性任务在其授权下安装过 CLI；本轮 16:51 观察两处哈希变为
`98c04c22d946c1b47f07fb8e2627ac77671f2698ca9dda7256d2cc21930cc426`。
此为他方安装观察，不是本轮最终交付，也不从该文件 hash 推断其 Tunnel 已包含本轮预算修复。
该运行一致性任务随后已结束；其正式记录 `2026-11-18-capability-efficiency.md` 表明新 client/MCP
为 14384/14385，旧 784/785 已由其 owner 受控退出；43 工具 surface 保持不变，未启用可选 scripts/docs。
其 Tunnel status/read/permissions 与本轮 fresh WEB 最终未返回的结果分别记账，不替代新增六工具云端验收。
这是他方现场证据的只读消费，不是本对话对 Tunnel 的操作；本轮 17:31 再查两处 CLI 文件仍为 `98c04c22…`。

从仓库根目录复验本轮两组新 gate：

```sh
OPENDESK_MCP_BINARY="$HOME/.local/bin/opendesk-mcp" node --test tests/mcp/api-docs-faults.test.js tests/mcp/script-initialization.test.js
```

上述命令已从仓库根目录原样执行，`20261118/owned-installed.log` 为 11/11、零失败/跳过，17.943 秒。

peer 在 17:48:28 原子安装两处 CLI，均由 `98c04c22…` 更新为
`e127bb9803bc91defe095be82ba889ab77b8733bff7d810ab928fc817c484da7`。
旧文件分别保存在其 `installed-before-depth/dist-opendesk-mcp` / `local-bin-opendesk-mcp`；
正式回执 `.runtime/tests/mcp-depth/20261118/install-receipt.json`，候选和安装八组 gate 均 74/74、零跳过。
其 `build-inputs-final.json` 记录 1,095 个源码/资源文件构建前后稳定，changed 为空；
该观察不取消 `runtimeMatchVerified:false` 的来源边界。

本轮独立记录 `20261118/installed-before-owned-tests.json` / `installed-verification.json`：
两处文件在 11 项复验前后 hash 相同。正式安装路径启动的 fresh child PID349，
`script-initialization/stdio-P2EsQ1/process-identity.json` 的实例 PID 与实际 child 相同，
初始化时磁盘可执行 hash 同为上述值；这是磁盘文件观察，不是加载内存映像摘要。
该 child 正常退出 0，无协议污染或强制终止；全部 docs 故障 child 均被回收。
本轮资源均为自有 fixture/进程，未重启或更新现有 Tunnel、GUI 或 helper。

peer 安装后新发现的 Agent allowedCwd 问题及其后续源码/候选/安装归该 owner；上述版本仅代表本轮实际
验证的时点，不承诺其后文件不会再更新。后续若替换 CLI，应保留新回执并从新安装路径重新验收。

## 继续目标：继承管道与 Git provenance

新证据独立写入 `.runtime/tests/mcp-completeness/20261118-descendants/`，不覆盖前轮回执。
基线 `baseline.json` 再查 master/HEAD 不变，两处 CLI 仍为 e127bb98…484da7。
可信隔离 checkout 的 reader 派生一个自然 15 秒退出的 Node，仅继承 stderr，自身写 `{}` 后退出。
真实安装路径 `inherited-before.log` 失败；原始 `docs-faults/inherited-stderr-OyLaZQ/failure.json`
表明 15,076ms 后误成功，MCP 与 fixture 最终正常退出，未操作共享进程。
`provenance-budget-before.log` 另证实旧 Git 输出无预算：257 字符内容被直接发布为 checkoutRevision。

第一阶段使用 WaitDelay 加 Run 返回后进程组清理，虽通过 19 项测试，但独立 reviewer 指出 post-Wait
数字 PGID 可复用的安全竞态；阶段候选 020c…d0ea 从未安装，不能作为最终修复。
最终实现手动拥有 stdout/stderr 四个管道端点，构建失败/启动失败均自行关闭；只在首次 Wait 前、
直属 leader 尚未回收保留 PID/PGID 时清理组。双流 EOF 后只允许 stdlib os.Process.Kill 处理直属 child
的 deadline，不再根据保存的数字组 ID 发信号。保留 WaitDelay 250ms 仅约束 Cmd 自己的 stdin copier。
文档读取 10 秒、Git 2 秒 context 分别限制继承管道的等待；超时返回错误，不发布部分 contract。
测试取消历史 PID 强杀，夹具自身寿命上限 20 秒，并要求生产清理后 child/descendant 均已消失。
Git stdout 限 256B，
stderr 限 16KiB；失败时 revision 留空，runtimeMatchVerified 仍为 false，能力查询不伪造来源验证。
未引入公开参数、缓存、依赖、调用重试或新全局进程管理器。

最新候选 SHA-256 为 `d52ddcd3c5c7f787ceba41e67d2e357dfed7506a5b30c5f65d5309244ec63123`，
`owned-wait-candidate.log` 为 51/51、零跳过：20 类文档故障、正式 `tests/runtime-api/mcp-advanced.js`
初始化恢复以及 advanced/runtime-contracts/provenance 兼容回归。继承 stdout/stderr 约 10,002–10,003ms
返回，另一流预算失败约 35–37ms；活跃 reader＋孙进程约 10,004ms，Git 约 2,003ms。
提前关闭两个输出但保持运行的 reader 约 10,005ms 停止，Node 启动失败 2ms 后可恢复。
`owned-wait-verification.json` 汇总全部文档 fixture 与清理结果；没有通过夹具强杀伪造生产清理成功。
追加 `owned-wait-identity.log` 三项定向复验通过，`ownership-observations.json` 证明等待时三个 leader
均为自有 MCP 的直属子进程、状态 Z 未回收、PGID 等于其 PID。最终独立源码复核无剩余具体 finding，
限于四个审查文件；记录 `review.txt`，不等于 reviewer 运行了测试或全仓批准。

新增 Git shim 初次测试因独立 packet verifier 未使用同一受控 Git PATH 而失败，保留
`provenance-candidate.log`；统一夹具环境后全量 19/19，上述失败不记为产品回归。
最终修订的 Go 三包 `go-owned-wait.log` 通过，`vet-owned-wait.log` exit 0；新鲜架构审计仍 68 条，
`architecture-comparison.json` 仅归一化汇总计数后新增/移除为空，原始诊断保留。
这不是全仓 clean；本轮未修改类型声明，也不重新宣称历史 TS 债务已清零。

新 owner `01a1ee3c-ab35-7712-9de0-3d1867edf119` 已完成其 Session.Create 失败清理与聚合错误传播修复，
正式 Runner 普通/race 各 14 场景、Node 15 tests，独立 reviewer 无新增重要 finding。
本轮没有争用其安装入口；最终版本和安装证据见下节。Windows/其他平台的后代清理缺口明确留在 C8；
Linux 的同源实现未做目标系统 live 验证，逃离本组的进程也没有 sandbox 保证。

## 本轮最终安装闭环

peer 新 owner 于 2026-11-18 18:49:55 CST 串行原子替换 `dist/opendesk-mcp` 与
`/Users/shopme/.local/bin/opendesk-mcp`，两处 SHA-256 均为
`c8028eba7750249b5bb7ad93df3d1d2e170259a2f75ebab370ebab0c4620c0cb`。
回执 `.runtime/tests/mcp-depth/customui-final/install-receipt.json`，旧 e127 版本分别保存在同目录
`installed-before/dist-opendesk-mcp` / `local-bin-opendesk-mcp`；旧阶段回执没有覆盖。
其候选、dist、用户 PATH 路径均分别通过 80 项 MCP 与 29 项兼容 gate、零跳过，
日志为 customui-final 下 `candidate-{mcp,compat}.log`、`dist-{mcp,compat}.log`、`local-{mcp,compat}.log`。
对应 command JSON 的实际 cwd/environment/退出码与路径分别记账，不将候选日志当安装通过。

本对话先独立核对最终 `build-before.json` / `build-after.json`：1,342 条保守来源快照稳定，
本轮 `api_docs.go` 与两个平台 helper 的 before/after/current hash 全同，安装候选 hash 与两处文件一致；
记录 `20261118-descendants/final-candidate-source-observation.json`。随后从仓库根目录原样执行：

```sh
OPENDESK_MCP_BINARY="$HOME/.local/bin/opendesk-mcp" node --test tests/mcp/api-docs-faults.test.js tests/mcp/script-initialization.test.js tests/mcp/advanced-runtime.test.js tests/mcp/runtime-contracts.test.js tests/mcp/runtime-provenance.test.js
```

`20261118-descendants/installed-independent.log` 为 51/51、零失败/跳过，65.65 秒。
其中 20 项 docs 故障全都正常关闭 MCP、无协议污染、无夹具强杀、所有被观察的子孙进程均消失；
三项继承管道 case 再次证明等待时 leader 为自有 MCP 直属子进程、未回收且 PGID 自有。
正式 Runtime 初始化拒绝后恢复、摘要落盘及 fresh child PID19577 的 tm_status 磁盘身份已对账。
测试前后两处文件 hash 与本轮三份生产源码保持不变。
详见 `installed-before-independent-tests.json` / `installed-independent-verification.json`；
这里的可执行摘要仍是实例初始化时的磁盘文件观测，不是运行内存哈希或全 API 兼容证明。

本轮仅改可独占 MCP host、正式测试与本台账；master/HEAD 保持不变，未提交、未推送，
未接管共享 GUI、helper、Native 插件、Tunnel、权限、凭证或他人运行进程。
23 类逐项状态全部保留；A2 云端历史失败、A3 OCR 识别、C1–C8 条件/平台缺口以及 D 类既有/可选项
没有被代表性 gate 转成通过，也没有因本轮收口擅自执行设备或外部 provider 验收。
