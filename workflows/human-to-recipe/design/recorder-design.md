---
title: "Recorder 工程设计"
description: "人工输入采集、原始保存、actions 制作、basic JS 生成及下游交接的唯一实现方案。"
order: 20
---

# Recorder 工程设计

状态：Recorder 数据合同 v2，2026-09-09。本文是 human-to-recipe 的唯一 Recorder 工程方案；公开调用以 [Recorder Runtime API](../../../docs/api/recorder-runtime.md) 为准，实际完成／未运行证据以 [实施与验收计划](implementation-plan.md) 为准。Agent-first MCP Recorder 继续由 `pkg/recorder` 与 `pkg/mcpserver/recorder.go` 拥有，不合并模型、协议或行为。

## 1. 文档驱动变更合同

Recorder v2 的实现必须逐项追溯到下列需求；代码、API、类型、示例或测试改变其中任一行为时，先更新本表和对应章节，再修改实现，最后把实际运行证据写入实施与验收计划。

| ID | 需求 | 规范性决定 | 验收入口 |
| --- | --- | --- | --- |
| DQ-01 | 删除无意义移动噪声 | 未按鼠标键的 `MOUSE_MOVED` 只计入 `observed/filtered`，不写 raw；button-held motion/drag 保留 | Go session 测试；manifest counts |
| DQ-02 | 不因降噪掩盖遗漏 | raw 事件、过滤／暂停／丢弃／晚到计数、action source 和每事件唯一 disposition 可交叉审计 | Runtime Recorder gate |
| DQ-03 | 动作绑定真实目标层级 | 窗口内权威 pointer press/release／keyboard 边界关联 `application → window → optional element`；活动窗口外但 display 已验证的桌面级端点关联 display-relative target；不把起始 `within` 当持续范围 | manifest `inputContexts`；Calculator live；desktop target unit |
| DQ-04 | 同应用多窗口可区分 | 可执行路径／名称是应用稳定身份；标题用于窗口消歧；PID、ID、index、handle 只作 provenance；多候选不发送输入 | coordinate recipe ambiguity case |
| DQ-05 | 窗口移动后仍可执行 | 保存 screen fact、window offset/ratio 和 element offset/ratio；basic 以当前 window bounds＋offset 重算；resize 不猜测 | translated-window substitute |
| DQ-06 | 指针端点具有可审核语义 | 默认 `target-semantics` 分别解析 press/release；点命中非操作叶节点时最多向上 6 层选择最近 actionable ancestor；保存窗口、phase、标签、角色、subrole、enabled/focused/valueSettable、标识、动作、bounds、hit/ancestors | Go endpoint test；Runtime straight-drag fixture；macOS Calculator 按钮 |
| DQ-07 | 隐私和失败状态明确 | pointer 证据不读取／保存 AXValue、选择文本、密码内容、剪贴板、默认截图/OCR或整树；显式键盘文本结果只保存指纹、补丁及插入正文；`verified/unavailable/not-requested` 不互相冒充 | strict schema 与 live manifest |
| DQ-08 | 旧包和生成 fail closed | v1 可读但 screen-only action 为 `needs-review`；v2 缺窗口上下文、目标歧义或不支持动作时 blocked | legacy/negative fixtures |
| DQ-09 | 文本输入按最终编辑结果录制 | 显式非敏感键盘录制在 macOS 观察 focused editable 的起止值；只持久化起始/结果 SHA-256、UTF-16 单一范围补丁及插入正文，不把输入法的物理按键或 marked 中间态当作 committed text | Go text tracker；TextEdit Unicode live |
| DQ-10 | 物理键、快捷键和文本不得互相冒充 | Command/Control/Option chord 与独立特殊键由成对 key press/release 生成；macOS callback 直接读取 CGEvent 的 Basic Latin payload，不同步等待进程主队列；已被 verified text edit 覆盖的键只作 evidence；无法区分 IME 确认键与随后业务提交时 blocked。stop 时 raw 未配对按键另用 combined-session key state 区分 release 丢失与真人仍按住，但两者都不补造 release 且保持 blocked | Go grouping/key-state；Runtime 生成替身；macOS shortcut/stop live |
| DQ-11 | 合法直线拖动和真人文本选择的自然近直线采样不得被当成 jitter 或一律拒绝 | `>4` points 的完整单次左键路径默认仍只在同显示器、≤30s、≤8 points 端点弦线偏差且无明显回退时形成普通 drag；macOS 非 click drag 的 release `clicks` 可为与 press 相同的值或缺省 0，正数冲突仍拒绝。只有 press/release 同属一个 verified 录制窗口、同一个 verified 可写 `textField` 时，才允许独立的 natural text-selection 子集：偏差上限为 `min(16, max(8, 距离×8%))`、采样路径长／端点距离≤1.08，且沿弦线投影不得越界或明显回退。该子集使用独立 source basis 并分类为 text-selection；缺少双端点 traits、非 textField、跨窗口、曲线、回退、跨屏和未验证坐标继续 blocked | Go grouping/endpoint/natural-selection negative matrix；Runtime latest-shape fixture；固定失败录制重建；真人文本选择 |
| DQ-12 | 原始点击事实与后到原生观察不得混同 | raw event 保留自己的 sequence／native time／receivedAt；每条 input context 另存 observation start/end、source、completeness 和 `post-event-correlated` 关联。超过 freshness、窗口变化、队列溢出、provider 失败或弹层消失都保存 unavailable/unverified 原因，不把点击后重新命中写成点击时句柄 | Go context timing/overflow/late-window matrix；terminal manifest strict validation |
| DQ-13 | 单左键按钮证据必须形成可重新解析且经完整搜索验证的 locator | 只接受精确窗口内、role=`button`、enabled=true、具有与单击等价的 `invoke`／`AXPress` 证据；selector 使用实际 role 加可用 name/identifier，identifier 仅作为本候选的录制来源并在制作与每次运行重新核对。可用时先唯一查找有限父容器再在其内唯一查按钮；截断、超时、同名、多窗口或部分读取不产生 verified locator | semantic generation fake backend matrix；macOS moving-control fixture；Windows cross-build |
| DQ-14 | native-semantic 生成与执行保持普通 JS 和单次动作语义 | 调用方显式选择 `Recorder.generateScript(..., {mode: "native-semantic"})`；制作阶段用当前窗口和原生 backend 只读验证 locator，并把来源、范围、唯一性、状态、动作能力和环境写入 candidate。生成 JS 在新 execution 用 `window.get`、`Accessibility.find/read/perform/release` 重新解析；`invoke` 只提交一次，`unknown` 禁止重试且无坐标 fallback；业务结果仍由独立 Gate/oracle 负责 | Runtime composition；fresh-run/reopen/stale-ref negative；独立 fixture oracle |

问题基线来自 `.runtime/recordings/rec-20260909T102712.649528000Z-a299028412fa`：70 条 raw 中 67 条是普通 `MOUSE_MOVED`，只有一组 press/release/click；因此“一个 action”并非漏记，低质量来自 hover 噪声、仅有 screen 坐标，以及旧版 `scope-changed` 导致的 `failed/blocked`。v2 不原地改写该历史事实，新录制使用新合同。

## 2. 已实现调用链

```text
仓库根目录的 record.js，或 recording-console.js Custom UI
  → 用户按 F8，或点击“开始录制”明确开始
  → window.getActiveWindow() 记录 within PID＋title 作为起始 provenance
  → Recorder.start(options)
  → automation.RecorderRuntime（当前 execution owner）
  → recorderSession（进程级 desktop capture lease、截止和资源计数）
  → uiohookBackend
  → recorder_uiohook_bridge.c
  → 静态编入的 libuiohook 1.2.2
  → 回调只复制标量、分配 session sequence、按策略过滤／入 4096 有界队列
  → recorderWriter 唯一顺序写 raw/events.ndjson
  → 鼠标按下、释放／文本段起点另入 128 容量的上下文队列
  → callback 线程之外解析动作当时的 application → window → optional element 层级

录制中的 F9 UI toggle（仅交互层）
  → 读取 session.status().captureState
  → recording 时显式调用 session.pause()
  → 原子关闭输入接受门并写 RECORDER_PAUSED 边界
  → paused 时可从任意当前窗口显式调用 session.resume()
  → 写 RECORDER_RESUMED 边界后开放桌面输入接受门

用户 F10 明确停止
  → session.stop()
  → 固定 sequence/time 截止，拒收晚事件
  → hook_stop，确认 hook_run/callback 退出
  → 关闭队列并排空已接收事件
  → Flush → Sync → Close → 终结 manifest.json
  → 只返回保存摘要，不自动制作或回放

示例中的 F10 停止后制作 actions；F11 生成 basic JS

Custom UI 中“停止并保存”沿同一 session.stop() → buildActions() 链；
只有 actions ready 后另点“生成脚本”才调用 generateScript()。
窗口关闭／取消是用户显式停止路径：保留已录制事实，不制作 actions、不生成、不回放。

Recorder.buildActions(recordingDir)
  → 重新读取 manifest 与同一份 raw 字节
  → 大小／regular-file／schema／顺序／hash／引用检查
  → 终结包验证 raw hash；未终结包只恢复完整 NDJSON 前缀并固定 blocked
  → 唯一动作归组器
  → 每个动作绑定自己的窗口／应用上下文；桌面 chrome 点击绑定 display；点击转换为对应目标左上角相对偏移
  → actions.json；人工修改存在时 actions.rNNN.json

Recorder.generateScript(actionsFile, {mode: "basic"})
  → 重新读取同一份 actions 字节并计算 hash
  → strict schema、ready、固定 raw bytes/hash/revision 检查
  → 每个动作重新解析当前应用窗口或显示器，再生成白名单普通 JS 文本
  → exclusive-create generated/basic.recipe.js
  → generated/basic.candidate.json（verification: not-run）

Recorder.generateScript(actionsFile, {mode: "native-semantic"})
  → 重新读取并严格核对同一 actions／raw／manifest
  → 只接受普通单左键、verified press 关联、精确窗口和可证明 invoke 等价的 button
  → 在当前新解析窗口执行有界完整查找；必要时先唯一查有限父容器再唯一查目标
  → 保存 verified locator、当前 enabled/actions、观察环境和 sourceActionId/sourceEventId
  → exclusive-create generated/native-semantic.recipe.js 与 candidate；不执行动作
  → 后续独立 OpenDesk execution 再次解析窗口和元素并最多提交一次 invoke

默认 timing 以每对非暂停动作的 raw 间隔为基础，按 1× 速度限制到 500ms..30s；
调用方可用 minimumDelayMs、maximumDelayMs、speedMultiplier 生成新的、不覆盖旧文件的候选版本。

另一次明确授权的正常 OpenDesk invocation
  → 重新建立测试起点
  → 单独执行 basic.recipe.js
  → fixture 状态／画面／约定 oracle 独立核对
```

生成动作、生成代码和回放是三个独立操作。`stop()` 不调用后两者；`generateScript()` 不执行生成文件。脚本日常运行不读取或循环解释 actions。

## 3. 实际模块和符号

| 文件 | 实际符号 | 责任 |
| --- | --- | --- |
| `automation/recorder.go` | `RecorderRuntime`、`recorderSession`、`registerRecorder`、`RecorderInputBackend` | 同一全局对象、host authorization、within、Promise、队列、pause/resume 边界、截止、stop、execution teardown 和资源统计 |
| `automation/recorder_store.go` | `recorderWriter`、`recorderFile`、`newRecorderWriter` | 唯一 raw writer、周期 flush、Sync／Close、raw hash 和 terminal manifest |
| `automation/recorder_actions.go` | `recorderBuildActionList`、`buildActionsFile`、`generateBasicScript` | 唯一事件归组、strict actions、版本保存、普通 JS 文本与 candidate |
| `automation/recorder_uiohook.go` | `uiohookBackend`、`activeUIOHookBackend` | macOS／Windows／Linux-X11 共用 adapter、真实 `HOOK_ENABLED` readiness、process lease、stop／run exit |
| `automation/recorder_target_darwin.go` | `newRecorderTargetProbe` | callback 外按屏幕点命中 AX 元素并有界上溯最近 actionable ancestor；校验进程归属，仅保存标签／角色／标识／动作／bounds/hit/ancestors，不读取 AXValue |
| `automation/recorder_uiohook_bridge.c/.h` | `opendesk_recorder_uiohook_*`、`opendeskRecorderDispatch` | libuiohook union 到无 C 指针标量的薄桥 |
| `automation/recorder_uiohook_vendor_darwin.c` | 固定 vendor translation unit | 在 package-wide Objective-C ARC 构建下关闭上游手工 `NSAutoreleasePool` 分支，使用 libuiohook 的 CoreGraphics system-key fallback，避免 native listener 启动崩溃 |
| `automation/recorder_unavailable.go` | `unavailableRecorderBackend` | 无 CGO／不支持平台时明确拒绝 capture，保留文件制作 |
| `third_party/libuiohook/` | vendored 1.2.2 | 固定上游源码、头文件、license 和 checksum；不从 PATH 加载 |
| `polyfills/008-recorder.js` | 同一对象上的 facade | 固定制作方法默认值并冻结 native `Recorder`；不创建第二个 owner |
| `automation/utils.go` | `RuntimeLifecycle.Recorder` | 与 Timer、FileJSON 等 owner 一起 Wait／CancelAsync／ResourceCounts |
| `pkg/execution/runner.go` | `Request.EnableRecorderCapture` | execution 权限、context、异步 drain 和 residual 诊断 |
| `cmd/opendesk/main.go` | `Config.AllowRecorderCapture` | 只有 direct local CLI 的 `-allow-recorder-capture` 可启用 capture |
| `types/recorder.d.ts` | `OpenDeskRecorderRuntime` 等 | 在已有小写文件保留 Agent-first exports，并增加 Runtime global；不建大小写副本 |
| `examples/custom-ui/recording-console.js` | `OpenDeskRecordingConsole.createApp(...)` | 正常原生窗口入口；把同一个 Runtime、前台范围探测和 UI host 接在一起 |
| `examples/custom-ui/recording-console/controller.js` | `createFlow`、`createApp` | 两个窗口的单一串行状态、按钮路由、错误／部分保存显示和关闭清理；不拥有 listener、builder、generator 或 replay |
| `tests/runtime-api/custom-ui/recording-console.test.js` | formal synthetic Recorder fixture | 通过真实 Custom UI 控件点击覆盖准备、暂停／继续、停止、actions、显式生成、single-flight、部分保存和关闭中启动回收；不启动真人 listener |

`pkg/recorder`、`pkg/mcpserver/recorder.go`、`docs/api/recorder.md` 的 Agent-first 行为未修改。基础实现也不反向依赖 `workflows/` 或 Skill。

## 4. 原生资源与时序

### 4.1 开始

`Recorder.start` 先在 Goja owner 读取并拒绝未知参数。host gate 不读 JS 自填授权；`within` 是调用方提供的起始 provenance，不是采集许可或持续匹配条件。Runtime 尽力二次读取起始窗口；读取失败或前台已改变只写 warning，不阻断建目录或启动。键盘敏感场景声明、路径和显示器等结构条件通过后，writer 创建 initial manifest 和 raw regular file；随后 backend 获取进程级 atomic lease，在固定线程运行 `hook_run()`，只有收到 `EVENT_HOOK_ENABLED` 才让 Promise resolve。

backend 在 ready 前失败、启动中 context 取消或 manifest 无法写为 recording 时，session 走同一 finalizer，停止自身 hook、排空／关闭 writer 并留下真实终结状态。不会用固定 sleep 假装就绪。

### 4.2 回调与队列

libuiohook callback 不写文件、不截图、不扫 AX、不调用模型或 JavaScript。C bridge 在 callback 生命周期内读取 union，传给 Go 的只有值拷贝。Go callback 分配 sequence、保存 native timestamp/clock/unit 和接收时间，依据已冻结显示器检查 screen-logical 点，然后 non-blocking 写入容量 4096 的事件队列。

普通 hover `MOUSE_MOVED` 不保存；只有鼠标键按住期间的 motion／dragged 与 press、release、clicked、wheel 和启用后的 keyboard 进入事件队列。权威 pointer press/release/wheel 以 `pressed`／`released`／`wheel` phase 另投递到容量 128 的上下文队列；独立 resolver 读取动作当时的前台窗口、应用身份和 bounds，macOS 条件允许时只为 press/release 读取不含值内容的 AX 元素标签，wheel 不做控件点击语义探测。相关 keyboard 边界同样在 callback 外解析。上下文读取失败保留为动作级 unverified 事实，不停止 listener；wheel 可在坐标和 display provenance 已验证时降级为 display-relative，其他动作只有无法形成可验证目标时才阻塞 basic 生成。满事件队列在独立 atomic counter 记录 drop，并在队列外触发 session stop；不会把唯一 overflow 通知塞回已经满的队列。

`observed` 是已排序的 native callback 与 Recorder 控制边界总数，`accepted` 是进入 writer 队列的输入和控制边界数，`persisted` 是成功写出并 flush 的完整记录数，`filtered` 是按公开策略不保存的数目，`paused` 是暂停期间在规范化前丢弃内容的 native callback 数，`dropped` 是队列拒收，`late` 是 stop 截止后仍到达的 callback。它们不能互相替代。

### 4.3 动作上下文、窗口层级与语义

动作上下文按 `application → window → element` 分层，类似 DOM 事件从最具体节点向稳定祖先补充上下文，但不伪装成 DOM：

- application 保存跨 execution 可解析的 executable path，缺失时退到 executable name；录制 PID 只作 provenance。
- window 保存 title、bounds、ID、index、handle 和 popup 标志；ID／handle 不跨 execution 复用。一个应用有多个窗口时优先以应用身份＋精确标题唯一匹配；标题变化时仅允许该应用当前恰好一个窗口的无歧义回退。
- element 是 `target-semantics` 的可选标签证据，先记录 point-hit；对本轮单击只把 role=`button` 且具有 `invoke`／`AXPress` 的节点或最近祖先视为等价操作目标，不能用“存在任意 native action”代替动作类型匹配。保存所选节点的 role、native role、subrole、name／description、identifier、enabled/focused/valueSettable、native actions、bounds 和元素内点，并分别保留原始 hit、从 hit 到操作目标的有界 ancestors，以及操作目标之上的少量 container context；即使 hit 自身就是按钮也可取得容器用于消歧。point-hit 缺少可用 bounds 时只允许同 PID、已聚焦、可写、非安全且覆盖该点的 textField fallback。basic click/drag replay 不变；只有显式 native-semantic 制作通过完整唯一性和状态验证后才把这些事实提升为 locator。
- position 同时保存原始 screen-logical 点、窗口左上角偏移、窗口比例和元素内偏移／比例。basic replay 使用重新解析窗口的新 bounds＋像素偏移，支持窗口平移；比例留作审核，窗口缩放不自动猜测。

pointer 上下文在 press 和 release 后分别解析，双端点各保留自己的窗口与 phase；观察另存 start/end/source/completeness，并明确属于 `post-event-correlated`，不是点击前快照或可跨运行 ref。解析必须在 750ms 内开始并验证点仍位于同一精确窗口；PID 相同不足以确认窗口归属。press locator 观察与 release 结果分开，release 后重新命中的节点不能覆盖 press 事实；若弹层已经消失或前台窗口改变就保留 unavailable/unverified。text-selection 只有在两个端点属于同一录制窗口和同一 verified 可写 textField 时成立；只有该事实才能启用比普通 drag 的 8 points 端点弦线更宽、但仍受 16 points、8% 比例、1.08 路径长度比和无明显回退共同约束的 natural text-selection 子集。旧包、`unavailable` 或 `not-requested` 端点不得从窗口位置、应用名称或轨迹形状补造输入框证据。每个失败都有 `status`／`reason`，语义另有 `semanticStatus`／`semanticReason`，因此“没获取到”与“用户明确关闭”不会混为一谈。

native-semantic candidate 中的 locator 是 actions 证据的派生物，不反向改写 raw、manifest 或 actions。每条 locator 固定 sourceActionId、press sourceEventId、窗口范围、可选父容器 selector、目标 selector、制作时完整唯一搜索结果、enabled/actions 状态、backend/platform 和验证时间。新 execution 再做同样的完整唯一搜索；目标 identity 或状态不符即停止。只读查找可以按候选明确的有限策略重新发起；`Accessibility.perform(...invoke...)` 本身及 `actionState: unknown` 都不重试，也不改用录制坐标。

### 4.4 桌面范围与隐私

`within` 保存开始时的 PID＋title 作为起始 provenance，不是 OS hook filter、持续范围或重放门槛。Runtime 对启动时前台窗口的二次读取只产生 warning；开始后不会因标题变化、切窗或切换应用停止 session。采集覆盖桌面级全局输入，因此只允许明确的非敏感测试流程；键盘默认关闭，开启时必须写 `keyboardContent: "non-sensitive-test"`，并假定整个跨应用序列均不含敏感输入。Recorder 不读剪贴板、不保留未启用的键盘内容、不上传材料；lib logger 被静音。

macOS 键盘开启后同时存在两条互斥消费通道。native hook 保存物理按下／释放、modifier mask，并直接从 callback 当前 `CGEvent` 读取可打印 Basic Latin，不同步 dispatch 到不保证泵送的进程主队列；Control／Meta／Alt 的 layout-dependent typed payload 在持久化前过滤。该通道只负责证明键、chord 和无最终值时的 ASCII fallback，callback 不读取 AX。独立的有界 text tracker 在 callback 外采样当前前台窗口的 focused、非 secure、可写 text field。一个编辑段只保留内存中的起止值并确定性计算最长公共前后缀；manifest 持久化字段身份、source event IDs、起始／结果 UTF-16LE SHA-256、起始长度，以及 `start/deleteCount/insertText` 补丁，不保存未改变的前后文。采样迟到、secure、焦点/字段漂移、字段不可唯一重定位或补丁哈希不闭合都显式阻塞 semantic text action。

actions 制作优先消费 verified text edit：该段内的 printable、dead-key、IME 候选和删除键只作同一动作 evidence，不再从 `KEY_TYPED` 生成第二份文字。没有 verified edit 时，Basic Latin `KEY_TYPED` 仍是兼容 fallback；Command/Control/Option chord 及 Enter、Tab、Escape、方向键等可映射特殊键由完整 press/release 生成 `shortcut`／`key`。若 Enter/Tab 等边界键是否属于 IME 提交仍有歧义，制作结果必须 blocked，不能既丢掉业务提交，也不能把确认键重复回放。

默认 `target-semantics` 对 pointer press/release 都以 `include_value=0` 检查；安全元素跳过，不保存 AXValue、选中文本或整棵树。focused-input fallback 也只保存 descriptor/traits，不读取字段内容。OCR 不是 AX 失败时的静默降级，因为它需要截图裁剪、额外隐私声明、证据文件及识别置信度。未来如启用，只允许显式模式对控件附近有界裁剪生成独立 observation，并同时保留原图 hash、裁剪坐标、引擎版本和置信度；不能只把 OCR 字符串写成事实。

example 的 F8/F9/F10/F11/F12 keycode 在 native 入队前过滤。控制快捷键本身不成为业务 action；stop 不合成缺失 release，也不向系统发送抬键。

### 4.5 暂停、恢复与 toggle 边界

公开 session API 使用可幂等重试的 `pause()` 和 `resume()`，不提供状态相关的 `toggle()`。示例快捷键可以在单一串行队列中读取 `captureState`，再把 UI toggle 意图分派到两个明确方法；Agent、脚本和远程控制面不得发送含糊 toggle。

pause 保留 native hook、writer、session 和进程级 lease，只关闭输入接受门。暂停后的 callback 不规范化、不入队、不保留键盘或鼠标内容，只增加 `paused` 计数。它不是卸载监听的隐私边界；敏感操作、长时间离开或资源释放必须 stop 后另开 session。`maxDurationMs` 按 lease 墙钟计算，包含暂停时间。

实际状态变化写入 raw 的 `RECORDER_PAUSED`／`RECORDER_RESUMED` 控制边界，重复 pause/resume 不重复写。actions 制作显式排除控制边界、切断文本和指针配对，并忽略由暂停造成的动作间墙钟 gap；任何按下状态跨过暂停边界均阻塞 basic 生成。

paused 状态不保存输入内容。resume 不验证初始 PID＋title，可从用户当前选择的任意窗口继续；stop 可从 recording 或 paused 进入同一唯一 finalizer。状态机固定为：

```text
starting → recording ⇄ paused → stopping → stopped
                    ↘                ↘ failed
```

### 4.6 停止与 execution 生命周期

第一次 stop 固定截止，立即令 callback 只累计 late，再取消 deadline/execution monitor。`hook_stop()` 在 8s deadline 内必须让 `hook_run()` 和 callback 退出；generic run-loop stop failure 可在同一 deadline 内重试，成功后才 join。失败时仍关闭自身 writer、返回部分摘要并保留 backend residual 资源计数，不做无期限 join；底层 `hook_run()` 未返回时进程 lease 保持 quarantine，后台一分钟有限恢复和后续 start 都可重试同一 stop，但任何新 owner 必须等到旧线程真实退出后才可取得 lease。不得用清除 singleton 伪装底层资源已释放。

stop 截止冻结后、native stop 前，session 只对 raw 末尾尚未配对的按键查询 combined-session 物理状态。manifest 的 `keyStatesAtStop` 保存 press event、keycode/rawcode、查询来源、时间和 `pressed`／`released`／`unavailable`；`released` 表示 event tap 未观察到 release，`pressed` 表示真人确实仍按住。两种已知状态写不同 error issue，但 builder 都继续要求真实 raw release，因此不合成时间、不生成动作，也不向系统发送抬键。

所有已 accepted 的事件在 producer 退出后由同一 writer 排空；然后依次 Flush、Sync、Close，实际文件重新读取计算 SHA-256，再原子写 terminal manifest。并发／重复 stop 共享 `sync.Once` 和同一 `done/result`。writer 任一失败使 storage 为 partial/failed；不存在的文件不返回路径。

活动 session 和 Recorder Promise worker 进入 execution `AsyncCounts`。JS 返回但快捷键／session 尚活跃时 Runtime 不提前退出。Ctrl+C、timeout、JS 异常和 host teardown 通过 context/`CancelAsync` 触发有限 stop；晚 worker 不直接接触已销毁 Goja。

## 5. libuiohook 与平台

固定上游为 `kwhat/libuiohook` tag 1.2.2、commit `23acecfe207f8a8b5161bec97a8a6fd6ad0aea88`。canonical `git archive` SHA-256 为 `ef564f09730af0bc30e4d965dac82c536bca837fcba78ddbca7744368d7b233a`，public header SHA-256 为 `61f3039ccf6c49e894c4ef326c38165eb422d868429e328f3cccaad9abc74651`。license 材料与 provenance 位于 `third_party/libuiohook/`。

macOS `automation` package 同时包含启用 ARC 的 Objective-C owners。上游 `USE_OBJC` 分支用手工 retain/release 管理全局 `NSAutoreleasePool`，不能在该 package-wide ARC 编译模型下启用；Darwin vendor translation unit 因此显式选择上游已有的 CoreGraphics 序列化 fallback 读取 `NX_SYSDEFINED` metadata。普通键盘、鼠标、runloop 和 event tap 路径保持同一 libuiohook 实现，live gate 必须实际启动 listener 验证这一边界。

### 5.1 源码选择与产品交付

`recorder_uiohook_vendor_*.c` 是供 Go／CGO 构建消费的源码 translation unit，不是可执行程序、运行时插件或用户脚本。Go tool 在调用 C 编译器之前按文件首行的 build constraint 选择唯一平台文件；因此构建 Windows 时不会编译、链接或执行 `recorder_uiohook_vendor_darwin.c`，构建 macOS 时也不会带入 Windows/X11 实现。

| 构建目标 | 被选择的 vendor 源码 | 平台依赖 | 不会被选择的源码 |
| --- | --- | --- | --- |
| `darwin`＋CGO | `recorder_uiohook_vendor_darwin.c` | Carbon、ApplicationServices、IOKit、AppKit | Windows、Linux vendor unit |
| `windows`＋CGO | `recorder_uiohook_vendor_windows.c` | Advapi32、User32、Win32 low-level hook | Darwin、Linux vendor unit |
| `linux`＋CGO | `recorder_uiohook_vendor_linux.c` | X11、Xtst、Xinerama、pthread | Darwin、Windows vendor unit |
| 无 CGO或不支持平台 | `recorder_unavailable.go` | 无 native capture | 所有 vendor C unit |

发布产物中，选中的 libuiohook 源码已经编译进 OpenDesk 可执行文件；用户不需要 C 编译器、不需要单独安装 `libuiohook` DLL/dylib/so，也不应直接运行或复制这些 `.c` 文件。该 native code 的存在不会自动开始监听：只有可信本地入口带 `-allow-recorder-capture`，JavaScript 再显式调用 `Recorder.start()`，且平台权限与结构参数校验通过后才安装 hook。起始窗口 PID／title 不一致不会阻断。未使用 Recorder 的普通运行不会获取 capture lease；`Recorder.getCapabilities()` 也只做无提示能力探测。

这不是“对产品完全零影响”：发布流程仍须保留 `third_party/libuiohook/` 中的 LGPL-3.0-or-later license/provenance，验证最终二进制依赖和签名，并将全局输入监听能力纳入隐私说明与安全软件兼容测试。产品行为上必须保持用户显式启动、键盘默认关闭、可见停止以及结构化拒绝，不得因平台差异绕过这些边界。

### 5.2 Windows 构建与验收注意事项

- 要在 Windows 产品中启用真人 capture，必须使用 `CGO_ENABLED=1` 和能编译目标 Windows C 代码的工具链；链接需要系统 `Advapi32`、`User32`。`CGO_ENABLED=0` 会有意选择 unavailable backend：`Recorder.start()` 拒绝，但已有录制包的 `buildActions()`／`generateScript()` 仍可用。
- Windows 使用自己的 `recorder_uiohook_vendor_windows.c`；Darwin 文件中的 Objective-C ARC、`NSAutoreleasePool`、ApplicationServices 和 macOS Input Monitoring 权限问题均不会进入 Windows 构建。
- Windows 不应仅以 cross-compile 成功宣称功能可用。目标系统还要分别验证普通权限应用上的 hook start/ready、跨窗口／跨应用 capture、pause/resume、stop/join、actions 内容和进程退出后零残留；管理员权限窗口、企业安全策略或安全软件造成的 hook 安装失败必须显示结构化错误，不能自动提权或静默降级。
- 发布包应对最终 `.exe` 做依赖清单、代码签名和安全软件兼容检查，并随产品提供第三方许可材料。当前仓库静态编入 libuiohook，不要求用户另外部署同名 DLL。

Windows 真机/VM Runtime evidence 是目标系统具备后单独执行的后续验收；当前 macOS Calculator live test 不能替代它，也不能用 macOS 的截图和录制结果宣称 Windows 已通过。

| 平台 | 同一 adapter | 运行条件 | 当前资格 |
| --- | --- | --- | --- |
| macOS | 是 | CGO、ApplicationServices／IOKit／AppKit、Input Monitoring/Accessibility | 当前源码 app build 与 Calculator capture/pause/resume live 已通过；独立 replay 未运行 |
| Windows | 是 | CGO、Win32 low-level hook、Advapi32/User32 | 提供源码和 build 接线；本轮未执行目标 CGO build/package 或目标系统 live |
| Linux/X11 | 是 | CGO、X11／Xtst／RECORD／Xinerama、`DISPLAY` | 单列；当前环境未运行 |
| Linux/Wayland | 否 | 需要未来可信全桌面采集底座 | 当前显式 unsupported，不以本进程窗口事件替代 |

源码静态编入 OpenDesk；普通用户不安装编译器、不 `go get`、不运行时下载，也不从可写 cwd/PATH 找同名库。架构／链接缺失在 build 阶段失败；运行权限和 DISPLAY 问题返回结构化 start 错误。

## 6. 文件和事实边界

```text
.runtime/recordings/<recording-id>/
  manifest.json
  raw/events.ndjson
  actions.json
  actions.r002.json                 # 仅修订时
  generated/basic.recipe.js
  generated/basic.candidate.json
  runs/<run-id>/result.json         # 未来真人独立验收或引用 Execution artifact
```

`observations/` 只有实际产生截图／OCR 等现场材料时创建；v2 的标签级 Accessibility 上下文直接进入 manifest/actions，不创建空目录。raw 的 sequence 和 native timestamp 为十进制字符串，避免 JS safe integer 损失；原始事实不由 actions 或后来修订覆盖。

`recording/v2` manifest 除 raw、显示器和计数事实外，还保存可选起始窗口与动作事件对应的 `inputContexts`。窗口快照把应用可执行文件身份与录制时 PID、窗口 ID／index／handle 分层保存；后者只作 provenance。actions 固定 raw 相对路径/hash/bytes、环境、revision reason/basis、动作级 window/display target、source event IDs/basis、timing、绝对及窗口／显示器相对位置、args/strategy、review、每个事件唯一 disposition、readiness 和 issues。`ready` 表示基础生成支持子集完整，不表示人工审批。已有 revision 字节不同时由 `buildActions` 写新 revision，并注明从固定 raw 重建且不覆盖旧文件；不改 raw。

candidate 固定 actions 绝对文件、hash、revision、脚本路径/hash、action-line mapping、约束和 `verification: not-run`。新 candidate 不继承旧资格，人工代码不覆盖。

## 7. 唯一动作归组和 basic 生成

| 输入 | actions 处理 | basic 生成 |
| --- | --- | --- |
| 左键单次 CLICKED＋匹配 press/release＋已验证窗口上下文 | 一个 click；press/release 为 evidence；保存动作窗口和窗口内偏移 | 重新解析当前应用窗口，以新 bounds＋窗口内偏移调用 `mouse.click` |
| macOS verified focused editable value diff | 一个 text-edit；物理 key/KEY_TYPED 为 evidence | 唯一定位字段，核对 before hash，应用 UTF-16 patch，核对 after hash，再 `Accessibility.perform(...setValue)` |
| Basic Latin KEY_TYPED、无 Ctrl/Meta/Alt＋已验证窗口上下文 | 无 value diff 时的兼容 text fallback；物理 key 为 evidence | 重新解析并确认当前窗口后 `keyboard.type(text)` |
| Command/Control/Option chord | 完整 primary press/release 形成 shortcut；modifier transition 为 evidence | 确认动作窗口前台后 `keyboard.combination(...keys)` |
| Enter/Tab/Escape/方向键等独立特殊键 | 完整 press/release 形成 key；与 IME 提交歧义时 blocked | 确认动作窗口前台后 `keyboard.press(key)` |
| 未按鼠标键的 hover move | filtered，不进入 raw | 不生成 |
| button-held motion／dragged | ≤4 points 的完整短路径归一化为 click jitter；`>4` points 的普通左键路径仍要求同显示器、≤30s、≤8 points 端点弦线偏差且无明显回退。press `clicks` 必须大于 0，release 只允许相同值或 macOS 非 click drag 的缺省 0。同窗口同一 verified 可写 `textField` 的双端点可启用独立 natural text-selection predicate：偏差≤`min(16, max(8, 距离×8%))`、路径长／端点距离≤1.08、投影不越界且无明显回退；使用独立 source basis。双端点窗口和 label-only AX traits 写入 pointer evidence；缺 traits、非 textField 或端点窗口不一致不能启用该放宽 | 重新投影 start/destination，`move → down → try move → finally up`；普通 drag 的 8 points 全局容差不变，正数 click-count 冲突、曲线、明显回退、跨屏、非左键、未验证路径及不满足语义门槛的自然偏移仍 blocked |
| 未修改的 vertical/horizontal wheel | 同显示器、同轴同向、相邻 ≤250ms 的事件归为最多 100 步的 burst；保存首事件坐标及 window/display 相对投影、累加 delta 和 burst delay | bounds-check 后先 `mouse.move(point)`，再 `mouse.wheel({deltaX, deltaY, steps, delay})`；旧无 wheel context 的 v2 包可按已验证 display 坐标降级 |
| 同一点连续 double/multi-click、right/middle/modified click 或带修饰键 wheel | pending，issue | blocked；不同坐标间沿用的 native 时间序列计数仍按各自单次物理 click 处理 |
| missing pair、long press、drop、unverified point | 保留事实与 issue | blocked |
| composition、dead key、IME | verified field diff 覆盖时归入 text-edit；缺 diff 或确认键归属不明时 pending | patch 闭环时可生成，否则 blocked；不从物理键猜 finalText |

同 native timestamp 始终按 session sequence，native time 回退视为损坏，不能逆序。文本 source 只允许可转义 ASCII 字符；ID、路径和描述不进入代码注释或结构。generator 重新解析固定 raw，并严格拒绝未知字段、任意 args、非法数值、缺失／重复 disposition、source/basis/timing 不一致和悬空引用；只发出固定白名单调用。

生成脚本检查 OS。窗口动作按可执行文件路径／名称与窗口标题解析当前候选；标题无法精确命中时，仅允许“该应用当前只有一个窗口”的无歧义回退。桌面级指针动作按录制 display ID、唯一 hardware identity 和显示器内偏移解析。录制时 PID、窗口 ID、index 和 handle 从不参与跨 execution 比较，标题也不是单独硬门槛。窗口 click/drag 以新鲜 bounds 加录制偏移计算屏幕点，支持窗口平移但不猜测 resize；drag 在按下后用 `try/finally` 保证抬键。文本比较的是本次解析出的当前活动窗口，不是旧编号。只有当前候选无法唯一确定时才拒绝发送输入。每个非暂停 raw gap 都转换成显式 `sleep`：先除以 `speedMultiplier`，再限制到 `minimumDelayMs..maximumDelayMs`；默认值为 1×、500ms、30s，原始间隔保留在行内注释和 candidate timing 中。该等待只表达录制节奏，不冒充页面 readiness。高级条件等待、重新定位、参数化与后置条件属于下游语义工作流。

## 8. 下游交接

本轮不创建或迁移 Skill。实际存在并可只读复用的是：

| 现有入口 | 可直接复用 | human 来源需要适配 | 当前缺失／不得声称 |
| --- | --- | --- | --- |
| `workflows/agent-to-recipe/skills/application-engineer/SKILL.md` | discover／harden／repair 的应用认识、定位、等待和验证方法 | 把固定 Recorder actions/raw/candidate 作为 human provenance，不伪装 Agent demonstration | 宿主安装、模型实际消费图片和真人资格尚未因此成立 |
| `workflows/agent-to-recipe/design/application-operations.md` | 唯一 AppProfile、对象归属、关系、状态和操作规则 | 仅引用真实 AppProfile version；基础 candidate 没有时保持 null | 不新建 Recorder UI 模型或图标 Agent |
| `docs/frameworks/agent-to-recipe-skill-contract.md` | procedure-synthesize、recipe-build、recipe-qualify 的职责和版本化 candidate/qualification 思路 | 新增 human lineage adapter 时保留原始 source，不套成 Agent Dossier 事实 | 当前合同正文明确不拥有人工全局录制；本轮未修改共享合同，也没有自动 handoff validator |

固定交接表：

| 项目 | 内容 |
| --- | --- |
| 输入 | 固定 actions 文件＋revision/hash、raw ref/hash、basic candidate/hash、环境、用户给出的目标／预期、实际 evidence 或缺失原因；AppProfile 只有实际存在时带精确 ref |
| 下游任务 | 目标与业务对象理解、重新定位、必要等待／验证、参数、普通函数和代码质量；不再次实现 native listener |
| 输出 | 独立 semantic candidate JS、所引规则和 evidence、每项修改依据、适用条件、独立验证结果；不覆盖 basic candidate 或 raw |
| 失败返回 | 事实不足回 H2；归组错误回 H3；意图／文本歧义回 H4；目标／定位回 H5；代码问题回 H6；授权或成功标准变化回 H1 |

下游改变坐标、参数、等待、调用或重试时必须留下 change reason/basis，并对新 candidate 重新验收。basic candidate 的通过证据不能转移为 semantic candidate 资格，模型偏好也不能删除必要动作。

## 9. 不在本轮基础 owner 内

- OCR、Layout、LLM、AppProfile 建模和业务参数提取；
- 语义函数、对象关系、重新定位和业务 postcondition；
- 复杂／曲线／跨显示器 drag、scroll、double-click、无法以最终文本差异闭环的 IME／composition 和剪贴板正文回放；
- class Recipe、Registry、可执行 IR、Compiler、专用 Replay Runtime 或 `calc.tapButton`；
- 自动回放刚完成的用户操作；
- HTTP／MCP／Scheduler 继承 capture 权限；
- Wayland 全桌面监听；
- 未获准的真人桌面录制、秘密采集或外发。
