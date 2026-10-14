# Reset Clock V1 / R2.6 · 真实 Mac 本地验收

日期：2026-10-14。范围：现有 Go Collector/Bridge、AppKit 桌面客户端和 Windows 交叉编译；不包含后续多表面设计、公共服务部署或签名发行。

**结论：V1 MAC LOCAL READY。** 本机真实 AppKit 开发应用已加载本轮生产代码，接通唯一 Go Bridge，显示三条真实来源动态。桌面层级、解锁物理拖动、锁定点击穿透、隐藏后台轮询、缓存恢复、退出重启和单实例均有实测证据。这个结论仅覆盖下列本机范围，不表示 Windows 真机、系统通知、长期运行或全平台发行已经通过，也不证明九项质量均达到 95 分。

## 运行身份与加载证明

- 工作区：`/Users/shopme/Documents/workspace/opendesk`，仅使用既有 `master`。
- macOS 26.5.1（25F80），一个 Built-in Retina Display，1728×1117 逻辑像素，scale 2；可用区域 `{{0,90},{1728,994}}`。
- Go 1.25.13；本机 Go 工具链为 darwin/amd64，开发 `.app` 使用 `GOARCH=arm64`、CGO/AppKit 构建。
- 唯一客户端当前验收 PID **17781**，启动时间 2026-10-14 17:56:44 CST。最终合并版本 PID 17605 已从菜单正常退出，独立 `ps` 确认消失后才重启；早期非 C3 版本证据保留为历史。
- 可执行文件：仓库根 `.runtime/tests/desktop-reset-clock/v1/Reset Clock.app/Contents/MacOS/reset-clock`；bundle ID `com.opendesk.resetclock`，版本 1.0.0 / 1，`LSUIElement=true`。这是现有未签名开发入口，不是公证发行包。
- 构建时间 `2026-10-14T09:52:27.184522Z`；Go VCS 基线 `56b176800f06b42b46a2fb3c0651c3d06bb9cdad`、`vcs.modified=true`。可执行 SHA-256：`24625edf473f490ea4e9b9e821986bac233f95babacb6ab95d4d6b240d077373`。
- 推送时发现远端并发更新 `5db62b0cdee40533b57f047047468959b1d33450`，保留其 C3 内嵌图像和布局，合并本轮生命周期修复。`r26-c3-build-provenance.json` 保存最终构建 55 个输入哈希（含图像、go.mod/go.sum）；生产输入与最终提交树逐个核对，不把带未提交修改的构建基线冒充最终 SHA。早期 `r26-build-provenance.json` 属于非 C3 旧 bundle。
- 最终生产代码构建完成后只更新文档/验收证据；合并提交、远端 SHA 和对应 CI 见本轮交付消息及 `r26-git-delivery.json`。
- 唯一 Bridge PID **6071**，监听 `127.0.0.1:8789`。原默认 8788 实际被其他服务占用；保留该服务，未终止无关进程。Collector 的持久状态及域级冷却仍共享同一 `.runtime/desktop-reset-clock/bridge-state.json`。

本机证据统一位于仓库根 `.runtime/tests/desktop-reset-clock/v1/`。日志、截图、Swift 验收探针和二进制不进入版本控制。正式源码与一行运行入口见 [README](../../examples/desktop-reset-clock/README.md)。

## 公网与 Bridge 验收

现有 `go run ./cmd/reset-clock-bridge probe` 在 `examples/desktop-reset-clock/` 原样执行。修复后的 `live-probe-fixed.json/.log` 显示 forecast、timeline、feed、status-history 四接口均 HTTP 200，`live_api_verified=true`，实际来源检查时间 `2026-10-14T08:45:16.295Z`。没有使用浏览器 Cookie/Token、HTML 抓取或合成数据代替公网结果。

Serve 使用同一 Collector 和持久冷却，顺序请求，同域间隔至少 60 秒；没有并行 Probe。最终进程的 `r26-serve-final.log` 在 17:28:33 CST 记录四项实际 HTTP 200。17:20:32 那轮 status-history 的 `http=0` 是复用缓存，不能表述为网络 200。合并日志中的时间是整轮完成时间，不是四次请求同时发生；域级冷却由 Provider 实现和隔离回归覆盖。

本机 HTTP：`/feed` 200 + ETag 条件 304；`/archive` 200 + 条件 304；`/healthz` 200；非法 archive cursor 返回 400。证据 `r26-bridge-http-results.json`、对应 JSON 和 headers。实际快照为 feed_version 2、24 个事件、46 条资讯；归档 50 条，`next_cursor=null`、`complete=false`。**公网多页没有发生**，多页与版本变化仅隔离测试通过。覆盖不足的 30 天/本月统计显示“数据不足”，没有把缺数据写成 0。

实际卡片三条最新有效 HTTPS 来源：

1. `https://x.com/thsottiaux/status/2109892247580000595`
2. `https://x.com/thsottiaux/status/2109873307722121591`
3. `https://x.com/thsottiaux/status/2109873287853707513`

来源未给出符合条件的精确未来时间，卡片显示“下一次时间待公布”。最近一次第三方重置 10-13 13:03 只作历史信息；服务故障、全员重置、储备重置分开呈现。任何一项都不能推断个人 Codex 额度恢复。

## 实窗与物理交互

CUA 能读取卡片，却对桌面 NSPanel 的物理 drag 返回 `noWindowsAvailable`。这不是产品故障。本轮在用户明确授权后使用仅针对 Reset Clock 的 Swift AX/CGEvent 验收；每次输入前校验 PID、bundle ID、可执行路径、卡片边界及实际 AX 命中。CGWindow 列表中的 Dock 透明矩形覆盖不能当作真实鼠标命中；先用实屏和 AX 确认，再发送输入。普通应用遮挡时控制器拒绝输入。

| 项目 | 独立观察结果 | 本机证据 |
|---|---|---|
| 桌面背景层 | 卡片层级 -2147483602，即 desktop-icon + 1；普通窗为 0，实际被普通应用覆盖；桌面视图可见 | `r26-c3-after-restart.json`、`native-occluded-by-codex.png`、桌面截图 |
| 解锁拖动/位置 | 一次物理拖动合并版本从 CG `(250,565)` 到 `(430,485)`；保存 AppKit 配置 `(430,367)`；坐标系不同 | `r26-c3-physical-drag.log`、`r26-c3-before-quit.json` |
| 解锁点击 | 点击卡片“记录与动态”打开真实普通详情窗 | `r26-c3-physical-click.log`、`r26-c3-physical-click-windows.json` |
| 锁定穿透 | 相同按钮区域实际 AX 命中 Finder 桌面 group；物理点击没有打开详情；物理拖动后卡片坐标未变 | `r26-c3-locked-click.log`、`r26-c3-locked-drag.log`、`r26-c3-after-locked-drag.json` |
| 隐藏仍刷新 | `show=false`；早期版 09:10:32 → 09:15:32；最终 C3 版隐藏期间也独立观察到 300 秒自动轮询，期间未手动刷新 | `r26-hidden-poll-before.json` / `r26-hidden-poll-after.json`；最终 `r26-c3-hidden-before.json` / `r26-c3-hidden-after.json` |
| 关闭普通窗口 | 详情/设置 `orderOut`，不结束应用；CG 可能保留隐藏窗口记录，应看 onscreen 状态 | 窗口观察记录、同 PID 后续轮询 |
| 菜单和设置 | 显示/隐藏、锁定、免打扰、记录、设置、立即刷新、退出已操作；URL 初值正确，未保存编辑不会被 tick 覆盖 | AX 记录、`native-settings.png`、高级诊断截图 |
| 单实例 | 同状态目录第二个客户端退出码 1，`already running`，未出现第二套 UI | `r26-c3-single-instance.json` |
| 退出/重启 | 17605 正常退出，17781 重启；配置完全相同，资讯 46、归档 50；稳定窗口尺寸和位置恢复 | `r26-c3-quit-restart.json`、`r26-c3-after-restart.json` |

来源导航的 HTTPS 校验与选择器已由隔离测试及实窗内容核对；本轮未逐一在外部浏览器点击所有来源按钮，不声称浏览器导航全通过。没有真实未来事件，因此未实测到时系统通知。

七张核心截图来自最终同一开发 bundle 的 PID 17605/17781，卡片在最终重启后刷新。卡片逻辑尺寸 386×333（截图 772×666）；详情窗 560×620，设置 520×566。C3 图像、深青卡片、三条常显动态、同屏来源、短日期、文本省略和英文换行均已观察；详情/设置未出现裁切、按钮错位或异常拉宽。高级诊断另有展开截图。概览保留统计区与底部说明之间的留白；没有据此宣称与 HTML 原型逐像素一致。内嵌的既有参考图带“ChatGPT 账号会员 / 购买 / 开通”等宣传字样；这些是图片内容，应用没有对应账户购买功能，不能当作官方背书。

| 截图 | 内容 |
|---|---|
| `native-card-desktop.png` | 实际桌面区域截图，含壁纸；已独立目视确认 |
| `native-card-three-news.png` | 真实三条最新动态 |
| `native-card-locked.png` | 配置 locked=true 的真实卡片 |
| `native-details-overview.png` | 概览、覆盖不足统计与三条动态 |
| `native-details-history.png` | 历史、事件类别、修订、来源选择器 |
| `native-details-news.png` | 完整正文、第三方标识及 HTTPS 来源 |
| `native-settings.png` | 正确 Feed 初值、显示/锁定及健康时间 |

## 故障范围、缓存和恢复

只受控停止经身份/监听核验的本任务 Bridge，没有修改 Mac 网络或其他服务。客户端菜单刷新后实际出现连接失败，记录 `last_failure_at=09:18:01Z`、`next_retry_at=09:18:31Z`；46 条资讯、50 条历史仍保留。卡片明确显示“来源待核验”“缓存”，无精确未来倒计时。证据 `r26-outage-client-state.json`、`native-card-disconnected-cache.png`。

恢复最终源码 Bridge 后刷新成功，HTTP 成功时间推进，当前错误和 next_retry 清除，缓存仍完整。证据 `r26-recovery-client-state.json`；历史 LastFailure 时间保留，不表示当前仍故障。**全局断网、上游真实宕机和 24 小时 stale 未实测**；429/Retry-After、304、失效来源、撤回/更正与过期提醒只有隔离回归证据。

## 本轮实际修复

1. 公网合法 timeline 的 missing/null `announcement_state` 和 null `announced_at` 不再使整个接口失败。未明确 announced 的重置保持 pending；缺时间不制造时间，也不以 `confirmed:true` 替代明确公告状态。
2. 撤回记录没有 URL、feed 已滚出该条时，复用已验证存档 HTTPS 来源，更新 Event/Archive 撤回修订；未知来源保持 pending。公网没有观察到撤回事件，修复以隔离回归证明。
3. `App.Run` 追踪 tick/poll/手动刷新并在退出时取消、等待；刷新 Add 与退出闸门在同一锁内，防止 Wait 后新增任务。macOS activeMac 指针同步，C action 字符串先复制，退出 watcher 正常收口。
4. 设置窗先填入当前 Feed，再成为 key window；后续 tick 保留正在编辑的内容。实窗已验证初值与未保存编辑。
5. 菜单和系统退出交由 Go cancel/等待后停止 AppKit loop，避免直接 terminate 绕过清理；stop 后投递事件唤醒主循环。[Apple stop 文档](https://developer.apple.com/documentation/appkit/nsapplication/stop%28_%3A%29?language=objc)说明停止并不立即中断当前事件处理。本轮真实菜单退出及重启已通过。
6. 合并 C3 后实际发现 49pt 日期列填入完整日期时间而被截断，改为只呈现短日期，详情保留完整时间；底栏填充改用 SourceOver，修复灰色半透明覆盖与参考深青色不符。已重新构建和实窗复验。
7. 独立审查发现退出测试对服务端调度时序的假设；改为独立断言客户端取消状态，并带超时等待服务端取消 channel。race 下连续 50 次通过。

改动限于 `internal/app/app.go`、`app_test.go`，`internal/desktop/native_darwin.go`、`native_darwin.m`，`internal/bridge/bridge.go`、`bridge_test.go`，`internal/provider/codexreset/provider.go`、`provider_test.go`，本 README、本报告及测试分类账中的唯一 C3 增量行。另保留远端 C3 的 hero_art.go/test、go.mod/go.sum 和内嵌资产引用。本轮修复未另选依赖；远端 C3 已引入的 golang.org/x/image v0.23.0 随合并保留。未引入第二套 UI/Collector 或生产后台。共享工作区其他任务修改保留，不纳入本次提交。

## Go 验证与九项独立评价

在 `examples/desktop-reset-clock/`：`go test ./... -count=1`、`go test -race ./... -count=1`、`go vet ./...` 全部通过；测试时序修正后重跑全套，见 `r26-suite-recheck.json`；合并 C3 后全套重跑见 `r26-c3-final-tests.json`，日期/底栏修正后完整 race 再通过 `r26-c3-layout-race.log`。稳定性定向命令 `go test -race ./internal/app -run '^TestQuitCancelsAndWaitsForInFlightRefresh$' -count=50` 通过。

Bridge build、CGO client build、Windows amd64 non-CGO cross-build，以及现有 `GOARCH=arm64 bash scripts/build-macos-app.sh` 均通过，最终 C3 详见 `r26-c3-final-tests.json` / `r26-c3-app-build.log`。产物全部位于 `.runtime/`。Mac linker 的 LC_DYSYMTAB 警告没有使构建或测试失败。CI 中旧 Chromium 原型任务只能证明原型，不能替代本报告 AppKit 截图。补跑仓库 `node scripts/audit_test_architecture.js` **失败**：54 个既有 Go 测试未被现有分类格式识别/登记，包含此前 Reset Clock 旧行及其他域；当前新增 hero_art_test.go 已按解析器七列格式登记并被识别。此仓库级历史台账问题没有静默改写；日志 `r26-test-architecture.log`，不声称仓库所有 gate 通过。

评价按各自成功条件判断，不从总测试数量推导分数，也不把源码存在当作实测。

| 维度 | 本轮独立结论 | 直接证据与剩余边界 |
|---|---|---|
| 1 数据准确性 | 本机真实链路通过 | 四 API、pending 语义、未知未来时间、第三方历史；未实测公网撤回 |
| 2 原生视觉 | 当前实窗通过 | 七张最终截图、真实 AppKit/桌面层；未证明像素一致或多屏 |
| 3 排版可读性 | 当前真实数据通过，完整矩阵不足 | 三条英文长文、资讯换行、设置诊断；0/1/2 条及长中文仅 fixture，未逐一 Mac 实窗 |
| 4 桌面常驻 | 单屏本机通过 | 普通窗遮挡、物理拖动/穿透、重启位置；Spaces、多屏、休眠未测 |
| 5 后台可靠性 | 本轮场景通过，长期不足 | 隐藏 300 秒轮询、取消等待、单实例、断连恢复；无 24h endurance/睡眠证据 |
| 6 来源安全合规 | 当前技术边界通过 | 公开 JSON 无认证、来源署名、HTTPS、域级冷却；公共 Bridge 分发条款和部署仍待独立复核 |
| 7 历史资讯 | 实际单页及隔离协议通过 | 50 条归档、46 条资讯、统计不足；真实多页/撤回未发生 |
| 8 Go 质量 | 当前测试/静态审查通过 | test/race/vet/build、退出测试连续 50 次、只读审查；不代表不存在其他缺陷 |
| 9 真实测试充分性 | Mac 本地目标通过，全平台不足 | 原生实窗/物理输入/故障证据；Windows live、通知、浏览器来源全点击、DPI/长期矩阵未测 |

**≥95 的数字评分未建立。** 当前没有预先定义权重和覆盖率分母，且上述缺口确实存在；用主观 95+ 分替代证据会误导。Windows 真机、多屏/Spaces、休眠、通知和正式分发应作为后续独立验收，不阻塞本轮诚实的 Mac 本地挂件可用性结论。

## Git / CI 交付边界

本报告与对应源码仅提交并推送既有 master，使用 Lore 决策记录，不创建分支/PR，不强推或清理共享工作区。最终本地/远端 SHA、暂存范围、GitHub Actions 的精确 head_sha、结果及 URL 在提交完成后写入本机 `r26-git-delivery.json` 并在交付消息报告。旧 HEAD 的成功/失败均不能当作本次 CI；无对应运行或失败时必须原样报告，不能写成通过。
