---
title: Go 测试逐文件分类清单
description: 2026-09-02 OpenDesk 测试架构审查中 145 个迁移前 *_test.go 资产的逐文件结论、实际处置与验收入口。
order: 21
---

# Go 测试逐文件分类清单

本清单以 2026-09-02 最终工作树为输入：迁移前口径共 145 个 `*_test.go` 资产；3 个伪测试工具迁移后，当前仍有 142 个。每个文件只取一个主处置标签，避免同一文件在评分时重复计数。

## 决策依据

| 依据 | 判定问题 | 主处置 |
| --- | --- | --- |
| P | 是否需要同包私有函数、状态、fake backend、并发/EventLoop 或 Go package 白盒断言 | `KEEP_PACKAGE` |
| B | 是否只通过 exported Go API 观察确定性领域、服务或模型行为，且不依赖同包 fixture/helper | `MOVE_GO_BLACKBOX` |
| J | 文件是否仍含必要 Go seam，但公开可观察行为必须另由 `tests/runtime-api/unit/*.test.js` 负责 | `SPLIT_JS_CONTRACT` |
| T | 是否以生成图片、可视化或手工分析为主而不提供 package 断言 | `MOVE_TOOL` |
| L | 是否直接读取真实设备、剪贴板、窗口或桌面状态 | `OPT_IN_LIVE` |
| V | 是否属于嵌套第三方模块且不进入根模块 gate | `VENDOR_ONLY` |
| A | 是否只是 `.archive/` 历史副本 | `ARCHIVE_ONLY` |

逐文件审查还核对 `externalInput`、写入路径与断言价值。`KEEP_PACKAGE` 不表示它可以替代 JS contract；`SPLIT_JS_CONTRACT` 表示 Go seam 与 JS 公共契约同时保留、分别计证据。`automation/window_manager_darwin_test.go` 的绝大部分是私有确定性 seam，文件内两个真实窗口 case 已有环境变量 gate，因此主标签仍为 P，而不是把整个文件误归为 live。

## 数量闭合

| 标签 | 文件数 |
| --- | ---: |
| `KEEP_PACKAGE` | 85 |
| `MOVE_GO_BLACKBOX` | 29 |
| `SPLIT_JS_CONTRACT` | 14 |
| `MOVE_TOOL` | 3 |
| `OPT_IN_LIVE` | 2 |
| `VENDOR_ONLY` | 4 |
| `ARCHIVE_ONLY` | 8 |
| 合计 | 145 |

## 执行账本：标签就是逐文件操作码

下面不是将来要做的建议，而是完整逐文件表中“处置”列的**已执行操作**。因此，某个
`*_test.go` 还在原 package 目录不等于遗漏：只有 `E-T` 应从旧路径消失；`E-K`、`E-J`、
`E-L` 和 `E-V` 都有意保留原文件以保持它们的 package、平台或上游边界。每个文件只有一个
处置标签，故也只有一个下面的执行码；14 个 `E-J` 的具体 JS 文件仍逐行写在它自己的“结论与
证据”列，不能由本表的汇总命令取代。

| 执行码 / 对应标签 | 已完成的文件调整 | 当前状态与保留位置 | 如何验收 |
| --- | --- | --- | --- |
| `E-K` / `KEEP_PACKAGE`（85） | 不移动；保留需要 private helper、fake backend、Goja EventLoop、并发/EventLoop 状态机或 native seam 的白盒测试。 | **已完成**。测试继续与实现同包；原路径就是正确位置。 | `go test ./... -count=1`；某行明确标有 build tag 时按该行限定命令运行。 |
| `E-B` / `MOVE_GO_BLACKBOX`（29） | 将只调用 exported Go API、没有同包 fixture/helper 依赖的领域或模型测试移至顶层 `tests/<domain>/`，并改为外部 `package <owner>_test`。 | **已完成**。测试不再与 `automation/` 或 `pkg/` 实现混放；每行记录迁移前路径。 | `go test ./tests/automation ./tests/container ./tests/custom-ui ./tests/custom-ui/core ./tests/desktopvision ./tests/execution ./tests/recorder ./tests/runtime ./tests/runtimeconfig ./tests/scheduler ./tests/semantic-exec -count=1`。 |
| `E-J` / `SPLIT_JS_CONTRACT`（14） | 保留 Go native/private seam，同时把可由用户观察的 Runtime 行为拆到该行引用的 `tests/runtime-api/unit/*.test.js`。 | **已完成**。Go 文件不移动，JS 契约已在逐行证据列存在。 | `go test ./... -count=1` 加 `./scripts/test_runtime_apis.sh unit`；每行列出的 JS 文件是公共行为的直接来源。 |
| `E-T` / `MOVE_TOOL`（3） | 删除旧的输出型 `*_test.go`，改为可执行工具；不再把生成图片或人工可视化计作 unit test。 | **已完成**。旧路径不存在；两个 layout 职责在 `tests/automation/tools/image-layout-lab/main.go`，WeChat 职责在 `tests/wechat/tools/visualize-layout/main.go`。 | `go run ./tests/automation/tools/image-layout-lab all .runtime/tests/test-architecture/tools/image-layout`；WeChat 工具仅在已有截图时以 `go run ./tests/wechat/tools/visualize-layout --image <input> --output .runtime/tests/wechat/visualize-layout` 运行。 |
| `E-L` / `OPT_IN_LIVE`（2） | 不移动真实主机读取代码；默认 skip，并把读取权限收紧为显式 opt-in。 | **已完成**。仍在 `automation/`，因为 platform backend 的 private seam 不能搬出 package。 | 音频：`OPENDESK_LIVE_AUDIO_TEST=1 go test ./automation -run '^TestDarwinAudioDeviceEnumerationMetadataDecodes$' -count=1`；剪贴板：`OPENDESK_LIVE_CLIPBOARD_TEST=1 go test ./automation -run '^TestDarwinRichClipboardMetadataCanBeReadWithoutContent$' -count=1`。 |
| `E-V` / `VENDOR_ONLY`（4） | 不移动或改写上游测试；从根模块成功率隔离，并为嵌套 module 建立单独 compile/live 边界。 | **已完成**。仍在 `third_party/kbinani-screenshot/` 与 `third_party/robotgo/`；RobotGo 的 compile 状态由 nested module gate 单独记录。 | compile-only：`(cd third_party/kbinani-screenshot && go test -run '^$' ./...)` 和 `(cd third_party/robotgo && go test -run '^$' ./...)`；不运行输入设备/剪贴板 live 用例。 |
| `E-A` / `ARCHIVE_ONLY`（8） | 不恢复历史同步副本，也不删除考古资料。 | **已完成**。只留在 `.archive/batch1-sync-blockers-20260608-191116/`，不进入当前 gate 或文件数。 | `node scripts/audit_test_architecture.js` 必须确认它们仍在 archive，且当前同名事实源另有对应测试。 |

执行顺序也固定为：先以 `E-A` / `E-V` 排除非根模块数量噪音，优先执行 `E-B` 外部黑盒迁移，
再保留 `E-K` 私有边界，随后以 `E-J` 补 JS 公共契约，最后把无断言输出职责改为 `E-T` 工具、把
真实主机读取收紧为 `E-L`。禁止
因为文件名带 `_test.go` 就移动所有文件；那会破坏 Go 同包白盒和 Runtime 的 JS-first 分工。

## 先看处置结论

- **继续与源码同包的 85 个文件**不是按路径批量保留。表中必须逐项列出直接访问的未导出实现、
  同包 test fixture、native seam 或 EventLoop/状态机边界；“只是 Go contract”不再是保留理由。
- **拆分公共契约的 14 个文件**继续保留必要的 native/private seam，同时在“结论与证据”列给出
  对应的 `tests/runtime-api/unit/*.test.js`。Go 断言不能替代这些 JS 文件，JS 文件也不能证明
  backend、取消、资源计数或 Goja owner EventLoop。
- **迁至顶层 tests 的 29 个文件**只依赖 exported Go API；已改为外部 test package，因此不能重新
  接触实现私有符号。它们是减少源码目录测试混放的物理迁移，而不是把 Runtime API 测试从 JS 改回 Go。
- **其余 17 个文件**已按实际职责处理：3 个输出型伪测试迁为 `tests/<domain>/tools/` 命令，
  2 个真实系统读取默认 skip 并显式 opt-in，4 个嵌套上游测试只进 vendor gate，8 个历史副本只
  留在 `.archive/`。

代表性判断如下；它们展示保留依据的差异，不拿一个理由套全部文件：

| 代表性文件 | 为什么不是机械保留 |
| --- | --- |
| `automation/image_layout_test.go` | 直接断言 cell/grid/flood-fill/boundary 私有算法；移出包会丢掉故障定位边界。 |
| `pkg/customui/process_driver_test.go` | 需要 helper subprocess、私有 protocol frame、global lease 和 cleanup；真实窗口视觉另验。 |
| `tests/runtimeconfig/config_test.go` | 只调用 exported config API，并在 `tests/runtimeconfig/` 以外部包运行；不再借同包位置测试配置策略。 |
| `automation/app_test.go` | Go 文件只保留 fake backend、分组、取消和 EventLoop seam；用户能观察的 `App` 调用另由 `tests/runtime-api/unit/app.test.js` 断言。 |
| `automation/image_layout_validation_test.go` | 只有 fixture/ground-truth 生成职责，没有产品行为 expected comparison，因此已迁成命令。 |
| `automation/audio_backend_darwin_test.go` | 读取当前 CoreAudio 设备，结果依赖机器且可能含敏感 metadata，所以必须默认 skip。 |
| `third_party/robotgo/robotgo_test.go` | 是嵌套上游的真实输入设备 smoke，既不由根模块收集，也不能拿来提高根模块成功率。 |

下表中的“外部依赖”描述默认 gate 实际会接触的资源；`t.TempDir()` 和仓库自带 fixture 也明确
写出，但不把它们误称为真实桌面 Evidence。“断言价值”写测试能稳定阻止哪类回归，而不只写
“有断言”。

## 完整逐文件审查

“处置”列是上面执行账本的逐文件操作码，最后一列记录了该文件的专属理由、JS 路径、工具目标
或 opt-in 条件。`MOVE_TOOL` 行保留的是迁移前源路径，用于证明已经处理：审计要求这些旧文件
不存在；其余标签行列出的路径则必须继续存在，审计同样会失败关闭。

| 文件 | 处置 | privateAccess | 测试边界 | 外部依赖 | 断言价值 | 结论与证据 |
| --- | --- | --- | --- | --- | --- | --- |
| `.archive/batch1-sync-blockers-20260608-191116/pkg/container/container_test.go` | `ARCHIVE_ONLY` | 历史：旧副本曾访问 container 生命周期 | 旧同步批次的 runtime 借还与并发 | 历史 fake、clock | 只可解释旧实现预期，不证明当前包 | 保持 `.archive/` 隔离；当前证据是 `tests/container/container_test.go`。 |
| `.archive/batch1-sync-blockers-20260608-191116/pkg/execution/runner_test.go` | `ARCHIVE_ONLY` | 历史：旧副本调用 execution 内部装配 | 旧 stack 与 summary 写入 | 临时文件 | 只用于追溯旧字段 | 不恢复进当前 gate；当前 runner 断言在 `pkg/execution/runner_test.go`。 |
| `.archive/batch1-sync-blockers-20260608-191116/pkg/mcpserver/runtime_test.go` | `ARCHIVE_ONLY` | 历史：旧副本访问 normalize、guard helper | MCP 参数适配与错误 envelope | fake runtime | 只用于对比旧 adapter 语义 | 归档保留；当前实现由 `pkg/mcpserver/runtime_test.go` 覆盖。 |
| `.archive/batch1-sync-blockers-20260608-191116/pkg/mcpserver/server_test.go` | `ARCHIVE_ONLY` | 历史：旧副本访问 server handler/helper | 旧 MCP tool/schema/stdio 行为 | 内存流与 fake runtime | 断言规模大但已被当前版本取代 | 不计当前通过率；使用 `pkg/mcpserver/server_test.go`。 |
| `.archive/batch1-sync-blockers-20260608-191116/pkg/runtime/pool_test.go` | `ARCHIVE_ONLY` | 历史：旧 runtime pool 实现已退役 | Goja pool 借还、关闭、benchmark | goroutine、clock | 可供历史性能对照，不能证明现行 gate | 只作考古资料；当前 execution gate 黑盒在 `tests/runtime/execution_gate_test.go`。 |
| `.archive/batch1-sync-blockers-20260608-191116/pkg/semanticexec/mock_runtime_test.go` | `ARCHIVE_ONLY` | 历史：旧副本使用同包 scenario helper | semantic scenario 状态流 | 固定 fixture | 旧 happy/block/partial 预期 | 归档隔离；当前黑盒测试在 `tests/semantic-exec/mock_runtime_test.go`。 |
| `.archive/batch1-sync-blockers-20260608-191116/pkg/semanticexec/status_test.go` | `ARCHIVE_ONLY` | 历史：旧副本验证状态派生 | terminal status 与 human gate | 无 | 旧状态优先级参考 | 归档隔离；当前黑盒测试在 `tests/semantic-exec/status_test.go`。 |
| `.archive/batch1-sync-blockers-20260608-191116/pkg/semanticexec/verify_test.go` | `ARCHIVE_ONLY` | 历史：旧副本验证 verifier helper | false-success 与 degraded/partial | 固定 fixture | 旧 verifier 规则参考 | 归档隔离；当前黑盒测试在 `tests/semantic-exec/verify_test.go`。 |
| `automation/appStorage_test.go` | `KEEP_PACKAGE` | 是：`normalizeAppStorageName`、`migrateLegacyStorage` | AppStorage 历史品牌名与迁移优先级 | `t.TempDir()` 文件树 | 防止迁移选错目录或覆盖现有数据 | 私有迁移算法只能同包白盒；不是 Runtime public contract。 |
| `automation/app_test.go` | `SPLIT_JS_CONTRACT` | 是：`parseAppTarget`、`registerApp`、wait owner | App target 投影、fake backend、取消与多进程分组 | fake backend、clock、Goja EventLoop | 防止结构化错误、取消后 worker 泄漏和分组丢 PID | Go seam 留同包；公共 `App` 契约由 `tests/runtime-api/unit/app.test.js`。 |
| `automation/audio_backend_darwin_test.go` | `OPT_IN_LIVE` | 是：`darwinAudioBackend` | CoreAudio 真实设备枚举与 metadata 解码 | 当前 macOS 音频设备，可能含私有名称/UID | 只证明本机 backend 能解码当前设备 | 默认 skip；仅 `OPENDESK_LIVE_AUDIO_TEST=1` 显式运行。 |
| `automation/audio_test.go` | `SPLIT_JS_CONTRACT` | 是：`newAudioWithBackend`、`registerAudio`、错误转换 | Audio fake backend、校验、readback、Goja shape | fake backend、Goja | 防止范围校验、lowerCamel 投影和稳定错误码回归 | native seam 留同包；公共 `Audio` 由 `tests/runtime-api/unit/audio.test.js`。 |
| `automation/browser_compat_test.go` | `SPLIT_JS_CONTRACT` | 是：同包 Browser/Context 容器状态并注入 raw handles | legacy/upgraded/playwright facade 路由与容器生命周期 | Goja，全部 fake page | 防止 context 隔离、close 状态、fallback method 和 locator owner 断裂 | Go 容器 seam 保留；公共 facade 由 `tests/runtime-api/unit/browser.test.js`、`tests/runtime-api/unit/context.test.js`、`tests/runtime-api/unit/page-compat.test.js`。 |
| `tests/automation/browser_lifecycle_test.go` | `MOVE_GO_BLACKBOX` | 否：只调用 exported Browser/Context 方法 | 默认 context 所有权、closed guard、幂等 close | 无，纯内存 | 防止关闭后复活或 page 跨 context 泄漏 | 已从 `automation/browser_lifecycle_test.go` 迁至外部 package；仍不是用户 JS 参数/返回契约。 |
| `automation/cgwindow_darwin_test.go` | `KEEP_PACKAGE` | 是：`cStringBytes`、`lsappinfoPIDPattern` | Darwin C string 与 lsappinfo 解析 helper | 无真实窗口 | 防止 NUL 截断和 PID 正则误匹配 | 确定性 Darwin 私有解析 seam，保留同包。 |
| `automation/clipboard_rich_darwin_test.go` | `OPT_IN_LIVE` | 是：`darwinClipboardBackend` | NSPasteboard 真实 metadata 读取 | 当前系统剪贴板，可能含私有格式标识 | 只验证本机读取且不抓正文 | 默认 skip；仅 `OPENDESK_LIVE_CLIPBOARD_TEST=1` 显式运行。 |
| `automation/clipboard_rich_test.go` | `SPLIT_JS_CONTRACT` | 是：`newClipboardWithBackend`、format 分类、重试与 watcher seam | 富剪贴板 canonicalization、churn retry、写后验证、Goja shape | fake pasteboard、临时文件、Goja | 防止正文泄漏、格式误分类、snapshot churn 假成功和重复 watcher | Go backend seam 保留；公共 `clipboard` 由 `tests/runtime-api/unit/clipboard.test.js`。 |
| `automation/desktop_events_test.go` | `SPLIT_JS_CONTRACT` | 是：polling state、subscription、coalescing 和 `registerDesktopEvents` | watcher diff、single-flight callback、once timeout、cleanup | fake snapshots、clock、Goja EventLoop | 防止无界队列、重复事件和取消后 worker 残留 | Go owner seam 保留；公共 `Events` 由 `tests/runtime-api/unit/events.test.js`。 |
| `automation/desktop_vision_test.go` | `KEEP_PACKAGE` | 是：`desktopVisionInvocation` 与 provider call seam | 截图 SHA 绑定、artifact JSON 与 provider 前置校验 | 生成 PNG、`t.TempDir()`、fake provider | 防止 screenshot provenance 不匹配仍调用模型 | 属于 native artifact/security seam，保留同包。 |
| `automation/dialog_test.go` | `SPLIT_JS_CONTRACT` | 是：`parseDialogOptions`、`buildDialogWindowSpec`、`dialogCSS` | Dialog 严格输入和 host 布局声明 | Goja values、无真实窗口 | 防止未知字段、敏感长度和 compact height 回归 | Go parser/layout seam 留同包；公共 `Dialog` Promise 由 `tests/runtime-api/unit/dialog.test.js`。 |
| `automation/display_control_test.go` | `KEEP_PACKAGE` | 是：`normalizeDisplayModes`、`sameDisplayMode`、capability/error helper | display mode 去重、write-readback 和 unsupported 顺序 | fake display backend | 防止 mode 写入未 readback 或错误能力宣称 | 平台 backend 决策 seam；真实显示器变更另属 live。 |
| `automation/drawing_test.go` | `KEEP_PACKAGE` | 是：直接检查 Drawer 像素缓冲与 fluent state | 纯 Go 绘图 primitive 和 benchmark | 内存 image | 对线、形状、裁切、线型做像素级回归断言 | 算法 package 测试，不是 Runtime API contract。 |
| `automation/floating_window_test.go` | `KEEP_PACKAGE` | 是：`floatingWindow`、button/layout declaration helper | FloatingWindow 到 Custom UI toolbar spec 的转换 | fake driver，无真实窗口 | 防止顺序、vertical 上限、wrap columns 和 tooltip fallback 回归 | 保留 native composition 白盒；真实 UI/JS 另由 Custom UI gate。 |
| `automation/global_shortcut_backend_darwin_test.go` | `KEEP_PACKAGE` | 是：`platformGlobalShortcutAccelerator`、Darwin keycode 常量 | accelerator 到 macOS flags/keycode 映射 | 无真实全局监听 | 防止 modifier/F-key 平台映射错误 | 确定性平台 backend seam，同包保留。 |
| `automation/global_shortcut_backend_windows_test.go` | `KEEP_PACKAGE` | 是：`platformGlobalShortcutAccelerator` | accelerator 到 Windows modifier/keycode 映射 | cross-platform build only | 防止 Windows VK 映射错误 | build-tag 平台 seam；不宣称 Windows live。 |
| `automation/global_shortcut_test.go` | `SPLIT_JS_CONTRACT` | 是：registry、native trigger、single-flight 与 callback cleanup | accelerator normalization、EventLoop callback、并发 close | fake backend、goroutine、Goja EventLoop | 防止外部冲突误判、callback 重入和 close 后 pending event | Go owner seam 留同包；公共 `globalShortcut` 由 `tests/runtime-api/unit/global-shortcut.test.js`。 |
| `automation/image_color_opencv_integration_test.go` | `KEEP_PACKAGE` | 是：`findTemplateMatchOpenCV`、`templateMatchBackend` | OpenCV backend identity 与匹配坐标 | 本机 CGO/OpenCV，生成内存 PNG | 防止 tagged build 偷换非 OpenCV backend 或坐标错误 | tagged native backend seam；JS 只断言公开结果，不能证明 backend identity。 |
| `automation/image_layout_progressive_test.go` | `KEEP_PACKAGE` | 是：`analyzeLayoutImage`、separator helper | 七级合成布局、span filter 与 benchmark | 确定性生成图片；失败输出进 `.runtime` | 对 separator 数量、位置和局部文本抑制有稳定断言 | 虽生成图片但不是输出型工具；算法断言留同包。 |
| `automation/image_layout_test.go` | `KEEP_PACKAGE` | 是：cell/grid/flood-fill/boundary 私有函数 | layout 核心纯函数和 option validation | 无，内存 image | 防止 median、span、threshold、越界和 uniform image 回归 | 典型私有算法白盒，不能搬到外部工具。 |
| `automation/image_layout_validation_test.go` | `MOVE_TOOL` | 是：旧文件借用同包 `fillRect`、`saveImage` helper | 只生成四组 PNG 与 ground truth JSON | 文件输出 | 除写入成功外没有产品行为断言 | 已移为 `tests/automation/tools/image-layout-lab/main.go` 的 `generate`；不再进入 `go test`。 |
| `automation/image_layout_visualize_test.go` | `MOVE_TOOL` | 是：旧文件借用 ImageColor 和同包绘图 helper | 读取 fixture 并生成 median/mean 标注图 | 文件输入输出 | 主要供人工看图，未比较 expected separator | 已并入 `tests/automation/tools/image-layout-lab/main.go` 的 `visualize`。 |
| `automation/js_binary_roundtrip_test.go` | `KEEP_PACKAGE` | 是：`createJSMethodWrapper` | `[]byte` 到 Goja ArrayBuffer 再落盘解码 | Goja、`t.TempDir()` | 防止 binary 被投影成错误 JS shape 或 PNG bytes 改变 | 反射 wrapper 私有 seam，留同包。 |
| `automation/layout_test_helpers_test.go` | `KEEP_PACKAGE` | 是：共享 `layoutSeparator`、region parse、断言与 `fillRect` fixture helper | 仅 test build 的 package-private fixture/helper | 无 | 自身无 Test，但被 layout progressive tests 调用并 fail-fast | helper 不能变成独立工具；保留 `_test.go` 且不单独计 pass。 |
| `automation/mouse_pid_click_test.go` | `KEEP_PACKAGE` | 是：`validatePIDClickArgs` | PID scoped click 参数验证 | 无 | 防止 NaN、负 PID、越界坐标和空参数穿透 backend | 私有输入门禁 seam；真实点击另属 live JS。 |
| `automation/mouse_state_test.go` | `KEEP_PACKAGE` | 是：`setButtonPressed`、`pressedButton`、`dragButtonForMove` | Darwin drag button state machine | 无真实鼠标 | 防止按键状态丢失导致 drag move 用错 button | 纯内存状态白盒，保留同包。 |
| `automation/native_extension_test.go` | `KEEP_PACKAGE` | 是：`optionsFromCall`、`nativeExtensionEvidenceMap` | 低层 Native Process V0 option 路由与 Evidence 脱敏 | `t.TempDir()`、Goja values | 防止 executable selector 歧义和 params/result 泄露 | 非 V1 公共 registry；同包保留安全 seam。 |
| `automation/native_extensions_test.go` | `SPLIT_JS_CONTRACT` | 是：`registerNativeExtensions`、artifact snapshot、deadline 和 helper process | V1 immutable binding、manifest route、replacement 检测、超时 | 临时 bundle、helper subprocess、Goja EventLoop | 防止 discovery 后换包、动态写 binding 或超时失效 | Go host/security seam 留同包；公共 `NativeExtensions` 由 `tests/runtime-api/unit/native-extension.test.js`。 |
| `automation/notification_icon_test.go` | `KEEP_PACKAGE` | 是：`repositoryNotificationIcon`、`findNotificationIcon` | packaged/repository icon resolution | `t.TempDir()` 文件树 | 防止发版资源优先级和缺图 fallback 回归 | 私有资源查找 seam，不是通知公共契约。 |
| `automation/notifications_test.go` | `SPLIT_JS_CONTRACT` | 是：poller、wait/dismiss parser、worker cleanup | own-app notification redaction、wait timeout、dismiss readback | fake backend、clock、Goja EventLoop | 防止默认暴露正文、取消泄漏和 unsupported 伪成功 | Go owner seam 留同包；公共 `Notifications` 由 `tests/runtime-api/unit/notifications.test.js`。 |
| `automation/notify_backend_darwin_test.go` | `KEEP_PACKAGE` | 是：helper request decoder、app-helper path、Darwin error mapping | macOS notification helper 私有 JSON stdin/protocol | `t.TempDir()` fake executable，无真实通知中心 | 防止 helper 参数泄露、stderr 污染和 malformed success | native helper protocol 白盒；可见横幅必须另验。 |
| `automation/notify_runtime_test.go` | `SPLIT_JS_CONTRACT` | 是：`notificationBackend` 注入和 `notify____Inject` 注册顺序 | notify option normalization、backend forwarding、bridge strictness | fake backend、Goja | 防止 caller map 被改、NUL/type 绕过和 polyfill 早于 bridge | Go bridge seam 留同包；公共 `notify()` 由 `tests/runtime-api/unit/notify.test.js`。 |
| `automation/page_permissions_test.go` | `KEEP_PACKAGE` | 是：permission section normalization/reservation 与 command timeout helper | macOS privacy status 聚合、缺项选择和设置页去重 | fake probe；一个可用性 skip | 防止 unknown 被当 granted、已满足权限重复打开设置 | 私有权限策略 seam；真实 TCC 不由本文件证明。 |
| `automation/page_screenshot_test.go` | `KEEP_PACKAGE` | 是：`parseScreenshotOptions`、`buildScreenshotResponse` | screenshot 参数和 path/object/bytes/none 投影 | `t.TempDir()`，不截真实屏 | 防止 clip/displayIndex/returnType 校验和临时路径错误 | native parser/response builder 白盒；真实截图在 live。 |
| `automation/runtime_hardening_test.go` | `KEEP_PACKAGE` | 是：`jsMethodAllowlist`、static bundle cache、HTTP limit、resource counts | Go→Goja 暴露白名单、资源缓存并发与 cleanup 计数 | fake FS/HTTP、goroutine、Goja | 防止隐式导出 diagnostics、并发重复读 polyfill 和 Notifications 漏计数 | 核心 private hardening seam；JS surface 另由 Runtime catalog。 |
| `automation/runtime_stack_test.go` | `SPLIT_JS_CONTRACT` | 是：`normalizeRuntimeStack`、`applyRuntimeStackMode` alias seam | legacy/upgraded/playwright global alias 选择 | Goja，无桌面 | 防止缺失 facade 时错误覆盖 global | Go alias seam 留同包；公共 stack 由 `tests/runtime-api/unit/page-compat.test.js`、`tests/runtime-api/unit/browser.test.js`、`tests/runtime-api/unit/context.test.js`。 |
| `automation/screen_capture_darwin_test.go` | `KEEP_PACKAGE` | 是：`boundedCaptureBuffer`、helper flag、error mapping | Darwin selector/helper 协议和有界诊断 | 无真实屏幕；合成 helper input | 防止 stdout/stderr 无界、路由串线和错误码漂移 | 平台 helper 私有 seam，保留同包。 |
| `automation/screen_capture_test.go` | `SPLIT_JS_CONTRACT` | 是：option parser、`registerScreenCapture`、session stop/finalize | selector/recording fake backend、handle 投影、teardown | fake displays/recorder、Goja EventLoop、`t.TempDir()` | 防止 invalid target 触发 backend、stop 非幂等和 teardown 不 finalize | Go session seam 留同包；公共 `Screen` 由 `tests/runtime-api/unit/screen.test.js`，真实捕获由 `tests/runtime-api/live/capture-screen.test.js`。 |
| `automation/screen_test.go` | `KEEP_PACKAGE` | 是：`computeVirtualBounds` | 多显示器虚拟坐标纯函数 | 无 | 防止负坐标、多屏 union 和空列表回归 | 纯算法白盒，不需要真实显示器。 |
| `automation/system_session_test.go` | `KEEP_PACKAGE` | 是：session action parser/backend 与 confirmation gate | lock/logout/restart/shutdown 的能力与确认策略 | fake backend；Darwin capability case 可 skip | 防止危险动作未确认、unsupported 仍执行 | 安全策略 seam 同包保留；默认不做真实 session mutation。 |
| `automation/test_output_test.go` | `KEEP_PACKAGE` | 是：为同包测试提供 `testOutputDir` 等 helper | test artifact 路径约束 | 环境变量、`.runtime` 文件路径 | 自身无 Test；调用时拒绝源码目录外持久输出 | 仅 test build helper，不是伪测试工具。 |
| `automation/utils_test.go` | `KEEP_PACKAGE` | 是：`createJSMethodWrapper` | Go method `[]byte` 返回的 ArrayBuffer projection | Goja | 防止通用 wrapper 把 bytes 暴露为普通 slice | 极小但必要的 private reflection seam。 |
| `automation/vision_js_integration_test.go` | `SPLIT_JS_CONTRACT` | 是：直接构造 `Vision{defaultProvider, defaultLang, providers}` 并注入 private provider state | typed array 输入穿过真实 Goja binding 的 integration seam | Goja、fake OCR provider | 防止 JS TypedArray 到 native bytes 的转换断裂 | 保留 bridge integration；公共 Vision 由 `tests/runtime-api/unit/vision.test.js`。 |
| `tests/automation/vision_layout_test.go` | `MOVE_GO_BLACKBOX` | 否：仅调用 exported Vision layout/annotation API，并按返回的公开 map shape 断言 | generic hints 到 layout algorithm 的 Go integration | 合成 PNG、`t.TempDir()` | 防止 hints 解析和 separator/region shape 丢失 | 已从 `automation/vision_layout_test.go` 迁至外部 package；不再借用 `layoutSeparator`/`visionParse*` 私有 helper。 |
| `automation/vision_test.go` | `SPLIT_JS_CONTRACT` | 是：`parseOCRResponse`、provider registry/fake 与 image extraction | OCR provider 选择、输入变体、capability 和 detectUI filter | fake provider、临时图片、Goja ArrayBuffer | 防止 provider/lang/profile 覆盖和 bbox/clickPoint 过滤回归 | Go provider seam 留同包；公共 `Vision` 由 `tests/runtime-api/unit/vision.test.js`。 |
| `automation/wechat_visualization_test.go` | `MOVE_TOOL` | 是：旧文件借用同包 ImageColor 与绘图 helper | 读取真实 WeChat 截图并输出 median/mean 标注和 JSON | 外部截图、文件输出；缺图即 skip | 只有格式检查和日志，没有业务 expected comparison | 已迁为 `tests/wechat/tools/visualize-layout/main.go`；显式命令、输入和 `.runtime` 输出。 |
| `automation/window_manager_core_test.go` | `KEEP_PACKAGE` | 是：window target identity、capability matrix 与 error helper | 跨平台 window facade 解析和 fail-closed 顺序 | fake backend | 防止 stale target/错误 PID 和未支持能力伪成功 | native window policy 白盒；真实窗口动作在 live JS。 |
| `automation/window_manager_darwin_test.go` | `KEEP_PACKAGE` | 是：`runJXAWithOptions`、fallback resolver、exact PID matcher | JXA timeout/error classification、fallback 与 titleless identity | helper subprocess、fake resolver；2 个 case 需 live env | 防止超时不 kill、权限错误误分类和同名窗口误操作 | 主体为确定性私有 seam；两个真实 CGWindow case 已各自 env gate，故文件仍 `KEEP_PACKAGE`。 |
| `cmd/opencv-healthcheck/main_test.go` | `KEEP_PACKAGE` | 是：`checkTemplateMatching` | healthcheck 命令的 OpenCV 探测 | tagged CGO/OpenCV，合成图 | 防止命令在 backend 不可用时仍报告健康 | `package main` 私有命令 seam；不等于 JS Runtime contract。 |
| `cmd/opendesk-visual-runner/main_test.go` | `KEEP_PACKAGE` | 是：`sameApp`、`matchingElements`、`requiredSuccesses`、artifact finalizer | visual runner 选择、95% 门槛和 provenance | `t.TempDir()`、合成 window/model records | 防止错误目标被算成功、截图 provenance 丢失 | CLI 内部决策与报告白盒，保留 `package main`。 |
| `cmd/opendesk/app_instance_test.go` | `KEEP_PACKAGE` | 是：`runningOpenDeskOnLocalPort`、`addressInUse` | 本机端口身份探测 | loopback HTTP fake | 防止把任意占端口服务误认作 OpenDesk | CLI 启动保护私有 seam。 |
| `cmd/opendesk/execution_signals_test.go` | `KEEP_PACKAGE` | 是：`newExecutionSignalController` | 首次信号取消、再次信号强退的状态机 | fake channel/clock | 防止 Ctrl-C 无法清理或外部取消误触发 force | 进程生命周期白盒，只能在 `package main` 精确测试。 |
| `cmd/opendesk/main_custom_ui_config_test.go` | `KEEP_PACKAGE` | 是：`resolveCustomUIActivation` | CLI flag 与项目 config 的 UI capability 优先级 | `t.TempDir()` config | 防止 project config 注入 host path 或覆盖 `-no-ui` | CLI 安全配置 parser seam。 |
| `cmd/opendesk/main_http_test.go` | `KEEP_PACKAGE` | 是：`parseVisionRequestPayload` | JSON/multipart/form/binary Vision HTTP payload 解析 | `httptest`、临时 multipart 文件 | 防止 body 类型误判和 cleanup 泄漏 | HTTP transport parser 属于命令内部，不是 Runtime JS API。 |
| `cmd/opendesk/main_native_extension_test.go` | `KEEP_PACKAGE` | 是：CLI request detection、param decode 与 execution envelope | Native Extension CLI one-shot transport | fake host，无子进程 | 防止非 object params 调 host、错误/证据 envelope 串线 | `package main` transport seam；V1 JS contract另测。 |
| `cmd/opendesk/main_notify_helper_test.go` | `KEEP_PACKAGE` | 是：私有 helper-mode 参数判定 | macOS 通知 helper 的不可公开入口 | 无 | 防止普通 CLI 参数意外进入 helper mode | 小型但高价值的 privilege-boundary 断言。 |
| `cmd/opendesk/main_script_source_test.go` | `KEEP_PACKAGE` | 是：source resolution、snapshot/hash、artifact/summary helper | file/text/stdin 互斥和 execution artifact | `t.TempDir()`、stdin | 防止多 source 静默覆盖、hash 不稳定和 summary 路径错误 | CLI execution 装配白盒。 |
| `cmd/opendesk/main_workdir_test.go` | `KEEP_PACKAGE` | 是：`applyWorkingDirectory` | CLI 工作目录切换和错误 | `t.TempDir()`；测试恢复 cwd | 防止缺失目录仍运行或污染后续测试 cwd | 进程级 helper 需同包且有 cleanup。 |
| `cmd/opendesk/script_instance_test.go` | `KEEP_PACKAGE` | 是：`acquireScriptInstance` | 同一 canonical script takeover 与不同脚本隔离 | Unix socket/临时目录、goroutine、clock | 防止误杀其他脚本或旧实例未释放 | CLI 单实例私有状态机。 |
| `internal/aicli/commands_test.go` | `KEEP_PACKAGE` | 是：route registry、envelope、recipe normalizer 和 rect parser | `opendesk ai` command/schema/JSON 边界 | 固定 JSON，无桌面动作 | 防止 registry 无 handler、输出多于一条 JSON 或 recipe 未 await | internal CLI contract，不是 Goja Runtime global。 |
| `tests/semantic-exec/benchmark_smoke_test.go` | `MOVE_GO_BLACKBOX` | 否：仅调用 exported `benchmark.RunSemanticSmokeSuite` | 语义 smoke 覆盖矩阵与报告稳定性 | 仓库 `tests/semantic-exec/fixtures` | 防止缺少 outcome 类别或 false-success case 仍通过 | 已从 `pkg/benchmark/semantic_smoke_test.go` 迁至外部 package；fixture 随顶层语义测试域放置。 |
| `tests/container/container_test.go` | `MOVE_GO_BLACKBOX` | 否：主要调用 exported Container API | container owner、close 与禁止 runtime borrowing | fake config/service | 防止重新暴露 raw Runtime 或 close 后资源仍可用 | 已从 `pkg/container/container_test.go` 迁至外部 package；Go container ownership contract，与 JS 用户 API 无关。 |
| `tests/custom-ui/core/icons_test.go` | `MOVE_GO_BLACKBOX` | 否：仅调用 exported icon registry/token API | SF Symbol allowlist 的完整性与 presentation metadata | 仓库受审图标表 | 防止重复、无 label 或未审核图标进入 toolbar | 已从 `pkg/customui/icons_test.go` 迁至外部 package；图标 policy 不再与 Custom UI 源码混放。 |
| `pkg/customui/process_driver_test.go` | `KEEP_PACKAGE` | 是：host candidate、protocol frame、event validator、lease | UI host subprocess handshake、stdout purity、global lease、cleanup | helper subprocess、临时 executable、clock | 防止 host 污染协议、早退卡死或多 session 抢占 | process driver 私有协议 seam；不声称真实窗口视觉。 |
| `tests/custom-ui/core/queue_test.go` | `MOVE_GO_BLACKBOX` | 否：仅通过 exported EventQueue/Event/Error API | UI event 顺序、允许的 coalescing、overflow/close | 纯内存 | 防止高频事件乱序或 overflow 静默丢失 | 已从 `pkg/customui/queue_test.go` 迁至外部 package；仍是 Go 并发 contract，但不留在源码目录。 |
| `tests/custom-ui/core/session_concurrency_test.go` | `MOVE_GO_BLACKBOX` | 否：仅用 exported Session/Driver/Window interfaces 和本地 fake | create/close 竞态、retryable host failure、terminal close | goroutine、fake driver | 防止 duplicate ID race、close 后复活和 host failure 半关闭 | 已从 `pkg/customui/session_concurrency_test.go` 迁至外部 package；test WindowSpec 已随外置 fake 内聚。 |
| `pkg/customui/session_test.go` | `KEEP_PACKAGE` | 是：测试内 fake driver 观察 `control` 状态和 calls | Window state machine、control updates、duplicate/unknown guards | fake driver | 防止非法 bounds 到达 driver、close 非幂等 | native model 白盒；JS public handle另测。 |
| `tests/custom-ui/toolbar_model_test.go` | `MOVE_GO_BLACKBOX` | 否：调用 toolbar model API | 生成 icon registry、orientation 与 wrapping policy | 无 | 防止 registry 非有序完整、vertical 超限、horizontal 计算溢出 | 已从 `pkg/customui/toolbar/model_test.go` 迁至外部 package；纯 Go policy 不再与源码混放。 |
| `pkg/customui/validate_test.go` | `KEEP_PACKAGE` | 是：通过同包 mutation/control state 检查 normalize 结果 | HTML/CSS/resource path、control order 与 image source 校验 | `t.TempDir()` fixture | 防止路径逃逸、derived 字段注入和不可信 icon | native declaration 安全边界白盒。 |
| `tests/desktopvision/annotate_test.go` | `MOVE_GO_BLACKBOX` | 否：仅调用 exported annotation API | bbox/center 绘制和 PNG artifact | 内存 image、`t.TempDir()` | 防止标注坐标和文件编码回归 | 已从 `pkg/desktopvision/annotate_test.go` 迁至外部 package；受控图像数据不构成同包保留理由。 |
| `tests/desktopvision/coordinates_test.go` | `MOVE_GO_BLACKBOX` | 否：调用 exported coordinate resolvers | normalized/image/window/screen 坐标转换 | 固定 geometry | 防止零尺寸、越界 bbox 和 scale 转换错误 | 已从 `pkg/desktopvision/coordinates_test.go` 迁至外部 package；纯 Go geometry contract。 |
| `tests/desktopvision/gates_test.go` | `MOVE_GO_BLACKBOX` | 否：仅调用 exported action gate/types | 唯一目标、风险、置信度与 stale fail-closed | 固定 target records | 防止 ambiguous/stale target 被执行 | 已从 `pkg/desktopvision/gates_test.go` 迁至外部 package；安全决策可由公开模型完整表达。 |
| `pkg/desktopvision/provider_test.go` | `KEEP_PACKAGE` | 是：`perceptionSchema` 私有 schema builder | provider JSON schema、provenance、timeout 与 coordinate resolve | fake model、clock、`t.TempDir()` | 防止 unknown fields、截图 SHA 不符或超时仍接受感知 | provider/security seam 保留包内；sample fixture 已内聚到此私有测试文件。 |
| `tests/desktopvision/script_test.go` | `MOVE_GO_BLACKBOX` | 否：仅调用 exported replay-script generator/types | deterministic replay script generation | 固定 Flow IR | 防止缺目标 action、遗漏 post-verification 或 dry-run 丢失 | 已从 `pkg/desktopvision/script_test.go` 迁至外部 package；生成字符串断言不需要实现目录访问。 |
| `tests/desktopvision/trace_test.go` | `MOVE_GO_BLACKBOX` | 否：仅调用 exported TraceRecorder/normalize API | NDJSON trace 与坐标 copy | `t.TempDir()` | 防止 trace 非结构化或 target pointer alias | 已从 `pkg/desktopvision/trace_test.go` 迁至外部 package；artifact writer 不再以同包位置作为默认。 |
| `tests/desktopvision/types_test.go` | `MOVE_GO_BLACKBOX` | 否：marshal exported domain types | perception JSON schema 与 Risk 排序 | 无 | 防止协议字段和安全等级顺序漂移 | 已从 `pkg/desktopvision/types_test.go` 迁至外部 package；Go domain schema contract。 |
| `tests/execution/desktop_events_test.go` | `MOVE_GO_BLACKBOX` | 否：仅用 exported Request/Run/artifact API 注入 public fake backend | Events 让 execution 存活、回调和结束 cleanup | fake desktop backend、goroutine、clock | 防止 runner 过早退出或 teardown 后 subscription 残留 | 已从 `pkg/execution/desktop_events_test.go` 迁至外部 package；公开 Event shape 仍由 `tests/runtime-api/unit/events.test.js`。 |
| `tests/execution/global_shortcut_test.go` | `MOVE_GO_BLACKBOX` | 否：仅用 exported Request/Run/artifact API 注入 public fake backend | shortcut callback、keepalive、failure cleanup | fake backend、goroutine、clock | 防止 callback failure 后注册残留或 execution 不结束 | 已从 `pkg/execution/global_shortcut_test.go` 迁至外部 package；公开 globalShortcut 语义仍由 `tests/runtime-api/unit/global-shortcut.test.js`。 |
| `tests/execution/manager_test.go` | `MOVE_GO_BLACKBOX` | 否：仅调用 exported Manager/ExecutionResult/AgentSummary | 并发 execution registry、CancelAll/WaitAll、shutdown admission | goroutine | 防止 shutdown 后仍接收任务或 WaitAll 提前返回 | 已从 `pkg/execution/manager_test.go` 迁至外部 package；manager 不再以同包测试为默认位置。 |
| `pkg/execution/native_extension_privacy_unix_test.go` | `KEEP_PACKAGE` | 是：helper-process 模式与 persistent artifact 检查 | extension remote error 的日志/summary 脱敏 | helper subprocess、`t.TempDir()` | 防止 extension stderr/secret 进入持久 Evidence | Unix execution privacy integration。 |
| `tests/execution/runner_lifecycle_test.go` | `MOVE_GO_BLACKBOX` | 否：仅经 exported Request/Run/artifact API 驱动 lifecycle | async HTTP、Abort、unhandled rejection、deadline 与 goroutine drain | loopback HTTP、clock、goroutine、临时 artifacts | 防止 Promise/cancel 后 worker 或 goroutine 累积 | 已从 `pkg/execution/runner_lifecycle_test.go` 迁至外部 package；用户 surface 仍由 Runtime JS catalog 负责。 |
| `tests/execution/runner_test.go` | `MOVE_GO_BLACKBOX` | 否：仅经 exported Request/Run/artifact API 与公开 Custom UI interfaces 注入 fake | Custom UI、Dialog、stack、Execution、Native Extension opt-in 与 timeout cleanup | fake UI、loopback、clock、`t.TempDir()` | 防止 capability 越权、unawaited resource 泄漏和 busy loop 不可中断 | 已从 `pkg/execution/runner_test.go` 迁至外部 package；Go integration 不替代 Runtime JS public contract。 |
| `tests/runtime/runtime_ownership_test.go` | `MOVE_GO_BLACKBOX` | 否：静态读取受审源码而不访问 execution 私有符号 | EventLoop ownership 和禁止跨 goroutine 直接触碰 Goja 的静态约束 | 仓库源码文件 | 防止关键 `RunOnLoop`/`Interrupt` 约束被移除 | 已从 `pkg/execution/runtime_ownership_test.go` 迁至外部 package；静态规则属于仓库级 runtime test，而非 execution 源码同包测试。 |
| `pkg/http/handler_test.go` | `KEEP_PACKAGE` | 是：读取 `Handler.manager` 及 `Server.handler`/`Server.server` 私有字段以检查取消、idle 和 listener state | HTTP routes、capability、cancel/shutdown、并发和 status | `httptest` loopback、fake UI、clock | 防止远程 UI 越权、shutdown 留资源和 stack 默认漂移 | transport/server 白盒必须同包；HTTP 用户入口仍可另行做黑盒 request smoke。 |
| `pkg/http/scheduler_handler_test.go` | `KEEP_PACKAGE` | 是：`schedulerRequestBodyLimit` | Scheduler HTTP CRUD、inline source privacy、origin/host gate | loopback HTTP、SQLite temp DB、clock | 防止超限正文泄露、跨域/远程请求和删除语义错误 | service transport 白盒，非 JavaScript Runtime global。 |
| `pkg/mcpserver/contract_adapter_test.go` | `KEEP_PACKAGE` | 是：tool registry、guard 和 revalidation helper | Runtime result 到 MCP schema、geometry 与 atomic focus guard | fake runtime/window | 防止 preview 执行动作、focus 后目标变化或 guard 缺 `executed:false` | MCP adapter/security seam。 |
| `pkg/mcpserver/recorder_test.go` | `KEEP_PACKAGE` | 是：复用同包 `fakeRuntime` 与 `callToolPayload` helper，检查内部 click call record | action trace、distill/compile 与 wrong-window stop | `t.TempDir()`、fake runtime | 防止记录越过 guard 或 deterministic compile 含 AI call | MCP Recorder adapter 白盒必须同包；它不是 Runtime JS API。 |
| `pkg/mcpserver/runtime_test.go` | `KEEP_PACKAGE` | 是：normalize、ack、guard、revalidation、error wrapper | MCP 参数/错误/active-window adapter | 固定 maps、fake errors | 防止 external field 丢失、错误前缀和 ambiguity remediation 漂移 | 私有 adapter 白盒。 |
| `pkg/mcpserver/server_test.go` | `KEEP_PACKAGE` | 是：tool handlers、strategy 和 action helper | JSON-RPC protocol、schemas、tool chaining、fail-closed action | in-memory streams、fake runtime、少量 `t.TempDir()` | 防止 notification 被响应、无效参数到达 runtime、ambiguous/stale target 被执行 | MCP server contract 应留服务包；不是 Goja surface。 |
| `pkg/nativeextension/discovery_fifo_unix_test.go` | `KEEP_PACKAGE` | 是：为同包提供 Unix FIFO fixture hook | build-tagged discovery file-type seam | 无运行 case | 让 `discovery_test.go` 在 Unix 断言 FIFO 被拒 | 仅 test build helper，有调用价值，不是伪工具。 |
| `pkg/nativeextension/discovery_fifo_windows_test.go` | `KEEP_PACKAGE` | 是：为同包提供 Windows 无 FIFO hook | Windows build compatibility seam | 无运行 case | 保证共享 discovery test 在 Windows 可编译且语义明确 | build-tag helper，保留同包。 |
| `pkg/nativeextension/discovery_test.go` | `KEEP_PACKAGE` | 是：manifest parser、publisher/user root helper 与 artifact snapshot | strict manifest、root/ACL/symlink/collision、inert discovery | `t.TempDir()` 文件树；平台 path branch | 防止 cwd/HOME 偷偷参与 discovery、包替换和可写祖先被接受 | Native Extension security 核心白盒。 |
| `pkg/nativeextension/host_test.go` | `KEEP_PACKAGE` | 是：`protocolRequest` 和 helper-process entry | one-shot process protocol、deadline、bounds、Evidence redaction | helper subprocess、clock、`t.TempDir()` | 防止 stdout/stderr 污染、超时不杀进程和 params/result 入 Evidence | native host process seam，保留同包。 |
| `pkg/nativeextension/path_acl_darwin_nocgo_test.go` | `KEEP_PACKAGE` | 是：`validatePlatformACL` | Darwin non-CGO 必须 fail closed | 无 | 防止缺 ACL backend 时默认为安全 | build-tag 安全 invariant。 |
| `pkg/nativeextension/path_acl_darwin_test.go` | `KEEP_PACKAGE` | 是：`validatePlatformACL` 与 discovery snapshot | Darwin extended ACL allow/deny 与 replacement | 本机 `chmod`/ACL subprocess、`t.TempDir()` | 防止 allow ACL 或后加 ACL 绕过信任检查 | 平台 filesystem security seam；不是普通 live UI。 |
| `pkg/nativeextension/process_unix_test.go` | `KEEP_PACKAGE` | 是：调用同包 `callHelperContext`、`requireCallError`、`assertFailureEvidence` 与 `TestMain` helper-process mode | timeout/cancel 杀整个 Unix extension process group | helper shell process、clock、`t.TempDir()` | 防止只杀父进程留下 child | Unix helper-process seam 必须留同包，不能由外置测试复用 private `TestMain` protocol。 |
| `pkg/nativeextension/resolver_test.go` | `KEEP_PACKAGE` | 是：`defaultExecutableDirectory` | program-relative executable 解析与 basename 安全 | 临时 executable path | 防止 cwd、`..`、NUL 或绝对 override 污染默认 discovery | 私有 resolver 安全 seam。 |
| `pkg/nativeextension/user_data_dir_darwin_test.go` | `KEEP_PACKAGE` | 是：`currentUserDiscoveryRoot` | Darwin user root path contract | fake HOME path | 防止相对/空 home 生成不安全 root | 平台路径 helper 白盒；默认 discovery 当前不扫描此 root。 |
| `pkg/nativeextension/user_data_dir_linux_test.go` | `KEEP_PACKAGE` | 是：`currentUserDiscoveryRoot` | Linux absolute XDG path contract | 注入环境值，无目标机 live | 防止绝对 XDG_DATA_HOME 被错误依赖 HOME | build-tag 路径纯函数；仅 compile/package evidence。 |
| `pkg/nativeextension/user_data_dir_windows_test.go` | `KEEP_PACKAGE` | 是：`currentUserDiscoveryRoot`、`localAppDataKnownFolder` hook | Windows Known Folder 成功/失败/非法路径 | fake system hook，无 Windows live | 防止失败 fallback 到不可信路径 | build-tag 安全白盒；不表述为目标机验证。 |
| `tests/semantic-exec/operator_maintenance_test.go` | `MOVE_GO_BLACKBOX` | 否：仅调用 exported `operator.AuditSemanticFixtures` | operator semantic fixtures 的维护约束 | 仓库 `tests/semantic-exec/fixtures` | 防止 fixture 缺关键 outcome 或 schema 漂移 | 已从 `pkg/operator/semantic_maintenance_test.go` 迁至外部 package；维护审计不再与 operator 源码混放。 |
| `tests/recorder/recorder_test.go` | `MOVE_GO_BLACKBOX` | 否：仅调用 exported Store/Manager/Flow/Replay APIs 与本地 replay fake | session 隔离、tail recovery、redaction、Flow IR、deterministic replay | `t.TempDir()`、goroutine | 防止 secret 泄漏、damaged tail 破坏恢复和 ambiguous target 被执行 | 已从 `pkg/recorder/recorder_test.go` 迁至外部 package；MCP wire 另测。 |
| `pkg/recorder/schema_test.go` | `KEEP_PACKAGE` | 是：包内 schema/fixture resolution | Recorder JSON schemas 可解析且接受 model-required fields | 仓库 schema 文件 | 防止 schema 不合法或与 model required 字段断裂 | schema package invariant。 |
| `tests/runtime/execution_gate_test.go` | `MOVE_GO_BLACKBOX` | 否：仅调用 exported ExecutionGate API | 并发容量、release 与 close admission | context/clock | 防止容量泄漏和 close 后新 acquire | 已从 `pkg/runtime/pool_test.go` 迁至外部 package；当前不是旧 Goja pool，且没有私有依赖可作为保留理由。 |
| `tests/runtimeconfig/config_test.go` | `MOVE_GO_BLACKBOX` | 否：仅通过 exported Load/ResolveUI/types/errors | strict config、UI 优先级、legacy fallback | `t.TempDir()` config 文件 | 防止未知字段、显式缺失被静默 fallback | 已从 `pkg/runtimeconfig/config_test.go` 迁至外部 package；本地 `writeConfig` 只是测试辅助，不需要同包访问。 |
| `pkg/scheduler/executor_test.go` | `KEEP_PACKAGE` | 是：`execute` hook 与 script path normalizer | file/inline JS 交给现有 execution 并写标准 Evidence | `t.TempDir()`、真实内嵌 Runtime 但无桌面 | 防止另造 JS executor、路径逃逸和 artifact 缺失 | Scheduler native service seam；不是新 Runtime global。 |
| `tests/scheduler/schedule_test.go` | `MOVE_GO_BLACKBOX` | 否：调用 schedule parser | every/cron next-run 与非法表达式 | 固定 clock | 防止接受非标准 cron 或负 interval | 已从 `pkg/scheduler/schedule_test.go` 迁至外部 package；纯 Go 时间算法 contract。 |
| `tests/scheduler/service_test.go` | `MOVE_GO_BLACKBOX` | 否：仅用 exported Service/Store/Job/Executor APIs 与本地 executor fake | file/inline CRUD、restart recovery、misfire、fixed delay、serialization | temp DB/files、fake clock、goroutine | 防止 restart 丢任务、misfire 重放多次和并发 RunNow | 已从 `pkg/scheduler/service_test.go` 迁至外部 package；test Job fixture 已随外置 fake 内聚。 |
| `pkg/scheduler/store_test.go` | `KEEP_PACKAGE` | 是：`formatTime` 和内部 schema migration fixture | SQLite lifecycle、inline source、history 与 legacy migration | temp SQLite DB | 防止删除任务误删 history、正文不持久或 migration 非幂等 | persistence 白盒留 store 包。 |
| `tests/semantic-exec/mock_runtime_test.go` | `MOVE_GO_BLACKBOX` | 否：通过 exported scenario runner/fakes | happy、permission blocked、partial、false-success、budget exhaustion | 固定内存 fixture | 防止 outcome 覆盖不闭合 | 已从 `pkg/semanticexec/mock_runtime_test.go` 迁至外部 package；domain state-machine contract。 |
| `tests/semantic-exec/status_test.go` | `MOVE_GO_BLACKBOX` | 否：调用 exported status helpers | status precedence、terminal 和 human gate | 无 | 防止 blocked/false-success 优先级回归 | 已从 `pkg/semanticexec/status_test.go` 迁至外部 package；纯 Go domain rule。 |
| `tests/semantic-exec/verify_test.go` | `MOVE_GO_BLACKBOX` | 否：调用 exported verifier helpers | business verifier、degraded/partial 与 false-success | 固定 fixture | 防止 action success 掩盖业务验证失败 | 已从 `pkg/semanticexec/verify_test.go` 迁至外部 package；纯 Go verification policy。 |
| `pkg/visionrun/atomic_step_plan_test.go` | `KEEP_PACKAGE` | 是：report map helper `schemaVersion`、`arrayOfMaps` | atomic step plan 与 bundle artifact | `t.TempDir()` | 防止多动作被错误合并或 schema/status 缺失 | visionrun pipeline artifact 白盒。 |
| `pkg/visionrun/bundle_test.go` | `KEEP_PACKAGE` | 是：report schema helper | run bundle skeleton 与 preflight blocker | `t.TempDir()` | 防止 preflight fail 后仍继续或缺 artifact 骨架 | package pipeline contract。 |
| `pkg/visionrun/capture_contract_test.go` | `KEEP_PACKAGE` | 是：report map/number helper | precise/coarse capture region contract | `t.TempDir()`、固定 window geometry | 防止区域粒度与 schema 漂移 | offline artifact assertion，不触碰真实屏幕。 |
| `pkg/visionrun/capture_template_audit_test.go` | `KEEP_PACKAGE` | 是：schema helper | 存储的 region template 与 capture contract 对照 | 仓库 fixture、`t.TempDir()` | 防止 template 过期或区域命名不一致 | fixture audit 有明确 fail，不是输出工具。 |
| `pkg/visionrun/compare_test.go` | `KEEP_PACKAGE` | 是：`decodeCompareReport` | screenshot compare report 与 diff image | 合成 PNG、`t.TempDir()` | 防止 score/report/diff 不一致 | 确定性图像算法/Artifact test。 |
| `pkg/visionrun/detect_test.go` | `KEEP_PACKAGE` | 是：`artifactPath`、schema helper | detect regions contract 与 slash-normalized path | 合成 PNG、`t.TempDir()` | 防止 artifact path 平台漂移和 region schema 缺失 | pipeline package 白盒。 |
| `pkg/visionrun/diagnose_repair_test.go` | `KEEP_PACKAGE` | 是：report map helper | validate failure 后 diagnose、repair、rerun 顺序 | `t.TempDir()`、固定 screenshot metadata | 防止失败后跳过诊断或错误标成功 | offline state pipeline test。 |
| `pkg/visionrun/infer_test.go` | `KEEP_PACKAGE` | 是：`zoneByID`、report map helper | structure-first infer artifacts 与 actionability | `t.TempDir()`、固定 detect input | 防止 zone/action target/OCR map 缺档 | pipeline artifact assertions。 |
| `pkg/visionrun/mirror_test.go` | `KEEP_PACKAGE` | 是：report map helper | HTML/CSS/meta mirror 与 auxiliary non-authority | `t.TempDir()` | 防止辅助模型覆盖主决定或缺 provenance | deterministic artifact test。 |
| `pkg/visionrun/probe_plan_capture_test.go` | `KEEP_PACKAGE` | 是：report map helper | probe plan capture preferences 与 candidates | `t.TempDir()` | 防止 probe 丢 allowed actions/capture 参数 | package planner contract。 |
| `pkg/visionrun/real_validation_test.go` | `KEEP_PACKAGE` | 是：`readJSONMap`、report helper | validate mode 消费一张 fixture screenshot 并产 report | 测试自建 screenshot、`t.TempDir()` | 防止 real-mode 代码路径缺 validation report | 名称含 real 但输入为受控 fixture，不是当前桌面 live。 |
| `pkg/visionrun/run_default_source_test.go` | `KEEP_PACKAGE` | 是：report helper | parse mode 默认 golden source 选择 | `t.TempDir()` fixture | 防止默认 source 解析回旧路径 | package orchestration 白盒。 |
| `pkg/visionrun/run_real_defaults_test.go` | `KEEP_PACKAGE` | 是：report helper | validate auto 选择 latest real report | `t.TempDir()` 内自建 report/screenshot | 防止按时间选择错误或读旧 `temp/` | 受控 filesystem test，不是实机 Evidence。 |
| `pkg/visionrun/run_test.go` | `KEEP_PACKAGE` | 是：report helper | parse mode unified run report | `t.TempDir()` | 防止 stage summary/status 不闭合 | package runner artifact test。 |
| `pkg/visionrun/runtime_preflight_test.go` | `KEEP_PACKAGE` | 是：`newRuntimePage`、`newRuntimeWindowManager`、`newRuntimeVision` hooks | offline warning 与 target-window/OCR readiness | injected fake Runtime owners、`t.TempDir()` | 防止 offline 模式硬失败或缺窗口仍 pass | private dependency injection seam，保留同包。 |
| `pkg/visionrun/send_mode_test.go` | `KEEP_PACKAGE` | 是：report helper | send mode 到 execute-send stage 的受控路径 | `t.TempDir()` 自建 screenshot/report | 防止允许发送时仍跳 stage，且不做真实发送 | 测试只到计划/记录边界，无外部消息副作用。 |
| `pkg/visionrun/send_safety_test.go` | `KEEP_PACKAGE` | 是：`candidateMatchScore`、report helpers | draft evidence gate 与 candidate matching | `t.TempDir()`、固定 candidates | 防止无 draft Evidence 仍发送或匹配错误联系人 | 保留为发送前 fail-closed 的高价值安全白盒。 |
| `pkg/visionrun/similarity_audit_test.go` | `KEEP_PACKAGE` | 是：`zoneDiff`、weighted/average score helper | golden/current 环境相似度和 zone 信号 | 主 case 缺当前 fixture时显式 skip；纯函数 case 无外部依赖 | 防止颜色/尺寸信号或权重计算失真 | 保留算法断言；skip 明确表示未提供 live-like fixture。 |
| `pkg/visionrun/worker_bridge_test.go` | `KEEP_PACKAGE` | 是：schema helper | Agent probe report 到 run bundle 的 bridge | `t.TempDir()`、固定 report | 防止 timestamp/window/screenshot fields 丢失 | package artifact integration。 |
| `tests/mcp/tools/stdio-smoke/main_test.go` | `KEEP_PACKAGE` | 是：`startChild`、`finish`、`validateTrailingOutput` | stdio-smoke 工具自身的 drain 与污染判定 | helper process、clock、`t.TempDir()` | 防止 Wait 前丢尾部 stdout 或尾随非 JSON 被忽略 | 位于工具 package 的真正单元测试，不是被测产品伪测试。 |
| `third_party/kbinani-screenshot/screenshot_test.go` | `VENDOR_ONLY` | 否：上游外部 package API | 第三方真实屏幕 capture 与 benchmark | 当前桌面和 Screen Recording | 上游 smoke 不证明 OpenDesk 根模块 | 留在嵌套 module；仅在 `third_party/kbinani-screenshot` 单独运行并标 compile/live 等级。 |
| `third_party/robotgo/clipboard/clipboard_test.go` | `VENDOR_ONLY` | 否：`clipboard_test` 外部包 | 上游系统剪贴板 copy/paste 与 benchmark | 当前系统剪贴板 | 会改用户剪贴板，不能进根 gate | 留在 RobotGo 嵌套 module；仅显式 vendor/live 运行。 |
| `third_party/robotgo/robot_info_test.go` | `VENDOR_ONLY` | 否：上游 RobotGo public API | version、screen size、scale、active title | 当前桌面；多处只打印无断言 | 断言价值弱且平台相关 | 不修改上游测试；单列 vendor 状态，不计根模块通过率。 |
| `third_party/robotgo/robotgo_test.go` | `VENDOR_ONLY` | 是：上游同包 mouse/key/image helpers | RobotGo 鼠标键盘剪贴板图像/进程 live smoke | 真实桌面与输入设备；多处只打印 | 可能产生系统副作用，稳定断言不足 | 保持嵌套上游位置；当前 macOS SDK 的 `SCScreenshotManager` compile failure 必须披露。 |

## 迁移与 live 入口

3 个 T 类文件已分别迁移到：

- `tests/automation/tools/image-layout-lab/main.go`（合并两个 image layout 生成/可视化伪测试）；
- `tests/wechat/tools/visualize-layout/main.go`（WeChat 离线可视化工具）。

两个 L 类 Darwin 测试默认 skip，只有显式设置下列环境变量才会读取真实系统状态：

```bash
OPENDESK_LIVE_AUDIO_TEST=1 go test ./automation -run '^TestDarwinAudioDeviceEnumerationMetadataDecodes$' -count=1
OPENDESK_LIVE_CLIPBOARD_TEST=1 go test ./automation -run '^TestDarwinRichClipboardMetadataCanBeReadWithoutContent$' -count=1
```

这些命令只证明对应设备/系统状态；它们不会替代 `tests/runtime-api/` 的 JavaScript 公共契约，也不自动计入普通 `go test ./...` 的 live 通过率。
