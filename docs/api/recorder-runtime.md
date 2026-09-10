---
title: Recorder Runtime API
description: 本地人工输入采集、动作制作与最简普通 JavaScript 生成。
order: 33
---

# Recorder

`Recorder` 是本地 OpenDesk JavaScript Runtime 的人工录制与基础制作对象。采集必须由可信本地脚本入口显式开启；已保存文件的 `buildActions()` 和 `generateScript()` 不需要监听权限，也不会启动监听、调用模型或自动回放。

本页描述 JavaScript Runtime 全局对象。Agent-first MCP 会话仍使用独立的 [Recorder MCP 协议](recorder.md)，两者不共享数据模型或生命周期。

## API 一览

| 方法 | 用途 |
| --- | --- |
| `Recorder.getCapabilities()` | 无副作用地查询采集、actions 和 basic 生成能力 |
| `Recorder.start(options)` | 在明确授权下记录起始窗口上下文并开始桌面级人工输入采集 |
| `RecorderSession.status()` | 读取当前采集和保存状态快照 |
| `RecorderSession.pause()` | 在保留 session 和 native lease 的同时暂停接受输入并写入明确边界 |
| `RecorderSession.resume()` | 在当前前台窗口继续接受输入并写入明确边界 |
| `RecorderSession.excludeControlClick(event)` | 为 Custom UI 控制点击写入可审计排除边界，避免生成目标动作 |
| `RecorderSession.stop()` | 固定截止边界、停止监听、排空 writer 并终结录制包 |
| `Recorder.buildActions(recordingDir)` | 从终结包或可校验的未终结 raw 前缀确定性制作固定版本 actions |
| `Recorder.generateScript(actionsFile, options?)` | 从固定 actions 文件生成不覆盖旧文件的 basic 普通 JS |

## 暂停与恢复约定

Runtime 使用两个目标明确且可幂等重试的方法 `pause()` 和 `resume()`，不提供依赖当前状态的 `toggle()`。快捷键、按钮等 UI 可以先读取 `status().captureState`，在自己的串行操作队列中把一次 toggle 意图分派成明确的 `pause()` 或 `resume()`；异步 API、Agent 和跨进程控制面不应使用含糊的 toggle，否则重复点击、超时重试或状态过期可能得到相反结果。

```text
starting → recording ⇄ paused → stopping → stopped
                    ↘                ↘ failed
```

`pause()` 是输入接受边界，不是资源释放或操作系统隐私边界。暂停后 session、writer、动作上下文解析器和进程级 libuiohook lease 仍然存在；native callback 收到的输入在规范化和入队前丢弃，只累计 `counts.paused`，不保存键码、字符、坐标或其他输入内容。需要处理敏感内容、长期离开或释放监听资源时应调用 `stop()`，之后开始新的 session。

每次实际状态变化都会在 raw 流中写入 `RECORDER_PAUSED` 或 `RECORDER_RESUMED` 控制边界。制作 actions 时这些边界本身不生成业务动作，并阻止文本、按键或鼠标配对跨越暂停区间；暂停期间的墙钟时间不被误判为业务等待。`resume()` 不要求回到初始窗口，可从用户当前选择的任意窗口继续桌面级录制。

## Recorder.getCapabilities()

同步查询三个相互独立的能力面，不安装监听、不请求权限、不创建录制目录。

**签名**

```ts
Recorder.getCapabilities(): OpenDeskRecorderCapabilities
```

**参数**

无。

**返回值**

`capture` 分别给出 `supported`、当前 execution 的 `hostAuthorized`、无提示权限探测 `permission`、`available`、平台、固定 libuiohook 版本、坐标空间、`evidenceModes` 和限制。`evidenceModes` 当前包含 `"none"` 与 `"target-semantics"`。`actions.available` 与 `basicGeneration.available` 描述文件制作能力；它们不因 hook 不可用或未授权而变为 `false`。`actions.actionSubset` 固定为 `click.left.single`、`drag.left.straight`、`wheel.xy.burst`、`text.focused-value-patch`、`text.basic-latin-fallback`、`keyboard.shortcut` 和 `keyboard.special-key` 的并集；需要 verified 双端点输入框语义的自然文字选择仍属于严格 `drag.left.straight` 能力面，不会因轨迹形状单独取得资格。

**行为与错误**

该方法同步返回，不打开 macOS 权限提示，不检查当前桌面内容。Wayland 全桌面采集返回不支持；Linux X11 单独报告。

**示例**

从仓库根目录运行：

```bash
./dist/opendesk -script-text 'console.log(JSON.stringify(Recorder.getCapabilities()))' -console-mode script
```

## Recorder.start(options)

为当前 execution 获取唯一受管 capture lease，并在 native backend 确认真实就绪后返回 session。

**签名**

```ts
Recorder.start(options: OpenDeskRecorderStartOptions): Promise<OpenDeskRecorderSession>
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options.within.processId` | `number` | 是 | 无 | 起始前台窗口 PID，仅作为录制来源与生成候选的 provenance |
| `options.within.title` | `string` | 是 | 无 | 起始前台窗口标题，仅作为录制来源与生成候选的 provenance |
| `options.captureKeyboard` | `boolean` | 否 | `false` | 是否保存键盘事件；仅限明确的非敏感测试场景 |
| `options.keyboardContent` | `"non-sensitive-test"` | 条件必填 | 无 | `captureKeyboard: true` 时必须提供；它不是宿主授权 |
| `options.evidence` | `"target-semantics" \| "none"` | 否 | `"target-semantics"` | 前者在鼠标释放后采集点击处控件的标签级语义；后者显式关闭鼠标控件语义。两者都不采集截图、OCR 或整棵 AX 树；该开关不覆盖显式开启的键盘文本结果采集 |
| `options.outputDir` | `string` | 否 | `.runtime/recordings` | 只能位于 `Execution.workdir/.runtime/recordings` 内的父目录 |
| `options.maxDurationMs` | `number` | 否 | `900000` | 录制上限，范围 1000–1800000 毫秒；由 native owner 强制停止 |
| `options.controlKeycodes` | `number[]` | 否 | `[]` | 最多 16 个 libuiohook 控制键码；对应按键事件在入队前排除 |

**返回值**

Promise resolve 为当前 execution 专有的 `OpenDeskRecorderSession`。session 不能跨 execution 使用。

**行为与错误**

采集入口必须使用 `-allow-recorder-capture`；普通本地脚本、HTTP、MCP 和 Scheduler 默认不能从 JavaScript 参数或环境变量取得该权限。`within` 记录启动时由调用方选择的前台窗口上下文，不是输入过滤范围或重放门槛。Runtime 会尽力再次读取启动时的前台窗口；无法读取或与 `within` 不一致时记录 `initial-window-unverified` 或 `initial-window-changed` warning，但不拒绝启动。listener 就绪后采集是桌面级的，切换窗口、改变标题或切换应用不会过滤输入、终止 session 或阻塞 actions。

每次权威 `MOUSE_PRESSED`／`MOUSE_RELEASED` 和相关 keyboard 边界都会在 callback 之外解析当时的前台应用、具体窗口和 bounds；pointer context 用 `phase: "pressed"`／`"released"` 明确区分两个端点，解析必须在 750ms 新鲜度边界内完成。`target-semantics` 还在 macOS 通过点命中读取单个 Accessibility 元素；若命中的是按钮内文字等非操作节点，最多沿 6 层父链选择最近的可执行祖先。它保存所选目标的 `role`、native role、`subrole`、名称／描述、identifier、`enabled`、`focused`、`valueSettable`、原生动作、bounds、元素内点击点，以及原始 hit 和有界 ancestors。

pointer 端点探测始终使用不读取值的 Accessibility 请求，不保存 `AXValue`、选择文本、密码字段内容或整棵子树；安全元素明确跳过。若 point-hit 没有可用 bounds，macOS 只允许回退到同一 PID、已聚焦、可写、非安全且覆盖该点的 `textField`，并标记 `resolution: "focused-input-fallback"`，仍不读取字段值。语义不可用时保存 `semanticStatus: "unavailable"` 及原因，窗口上下文仍可独立使用；`none` 保存 `semanticStatus: "not-requested"`，而不是伪装成探测成功。

键盘默认不保存；macOS native event tap 在 `captureKeyboard: false` 时也不订阅键盘事件，避免已禁用内容进入按键翻译和 Runtime callback。显式开启后，Recorder 使用两个分离通道：libuiohook 的物理 press/release 保存快捷键和特殊键事实；callback 之外的 macOS Accessibility 焦点文本框采样保存最终值变化，用来覆盖普通输入、删除、选择替换以及输入法候选提交。macOS 的低层字符通道直接读取当前 `CGEvent` 携带的 Unicode，不同步切换到应用主队列；它只保留可打印 Basic Latin，Control／Meta／Alt chord 的 layout-dependent typed payload 会在持久化前过滤。低层 `KEY_TYPED` 不是 IME commit 合同，而且 event-tap 所在 Recorder 进程的输入源不能证明前台应用实际采用的输入源，因此新的 macOS live 录制把 `textInputSource` 保存为 `unknown` 并标记 `key-typed-is-not-an-ime-commit`。制作文本动作优先使用已聚焦输入框的最终值变化；目标应用不暴露该值时，只要 Basic Latin 低层内容、物理证据和动作窗口完整，仍制作 `text` fallback，而不是以 `text-outcome-unverified` 阻断整份录制。生成器把 fallback 写成可编辑命名变量，并在 candidate constraints 标明它可能是输入法拼音、尚未证明是最终提交内容；已有包中的合法 `keyboard-layout`／`input-method`／`unknown` 分类都保留原始证据，不会被升级成已验证结果。

文本结果采集只在同时声明 `captureKeyboard: true` 和 `keyboardContent: "non-sensitive-test"` 时启用，并且不受鼠标 `evidence` 模式关闭影响。它会读取当前可写、已聚焦、非安全 `textField` 的值，但 manifest 不保存完整 before/after 值：只保存两端 UTF-16LE SHA-256、UTF-16 code-unit 长度，以及 `{start, deleteCount, insertText}` 差异；`insertText` 就是用户实际输入内容，因此该声明必须覆盖整个录制过程。焦点编辑控件没有可用指针 bounds 时，只要仍有 name 或 identifier 可供窗口内唯一解析，最终值证据仍可保存；既无几何也无稳定定位字段时省略该局部 text-edit 并返回 `needs-review`。安全/密码字段拒绝读取，Recorder 不读取剪贴板、不上传材料。OCR 需要截图裁剪、隐私声明和独立证据文件，当前不会作为 AX 失败时的静默降级。

一次进程只允许一个 libuiohook dispatcher lease。writer、参数、权限、backend 和 `HOOK_ENABLED` 就绪任一失败都会拒绝 Promise；部分启动会回滚。常见 `RecorderError.code` 包括 `INVALID_ARGUMENT`、`RECORDER_CAPTURE_DENIED`、`RECORDER_CAPTURE_UNAVAILABLE` 和 `RECORDER_CAPTURE_OCCUPIED`。

macOS 使用静态编入的 libuiohook 并需要 Input Monitoring/Accessibility 能力；Windows 使用同一 adapter 和数据合同。Linux 只支持具备 X11／Xtst／RECORD／Xinerama 依赖的 X11；Wayland 全桌面采集明确拒绝。

**示例**

正常交互示例从仓库根目录运行，F8 开始、F9 在 UI 层暂停／继续、F10 停止并制作 actions、F11 显式生成、F12 不生成直接结束：

```bash
./dist/opendesk -allow-recorder-capture -script examples/human-to-recipe/record.js -console-mode script
```

该命令不会自动回放生成脚本。

需要可见按钮和阶段反馈时，使用同一 Runtime 对象的 Custom UI 入口：

```bash
./dist/opendesk -ui -allow-recorder-capture -script examples/custom-ui/recording-console.js -console-mode script -log-dir .runtime/examples/custom-ui/recording-console
```

简化控制台从仓库根目录运行：

```bash
./dist/opendesk -ui -allow-recorder-capture -script examples/custom-ui/recording-console-simple.js -console-mode script -log-dir .runtime/examples/custom-ui/recording-console-simple
```

开始控制是本次即时采集授权；点击后控制台留出 3 秒供用户聚焦起始窗口，再读取并保存该窗口上下文，
用于聚焦的点击发生在 listener 启动前，不会进入录制。简化工具条把 Play 与 Pause 合并在首个按钮：录制中原位显示 Pause，暂停后原位恢复 Play；该按钮按
`status().captureState` 分派到明确的 `pause()`／`resume()`，继续时可以位于任意窗口。录制中可切换窗口和应用。停止后界面显示保存摘要并调用同一个
`Recorder.buildActions()`；actions 为 `ready` 或 `needs-review` 时立即调用 `Recorder.generateScript()` 生成文件，后者显示省略项并保留 warning；生成失败时原“重放”位置切换为显式重试入口，不增加常驻按钮。生成后详情页读取并显示真实脚本内容，但不会自动回放。只有再次明确点击
“重放”后控制台先留出 3 秒供用户恢复起始桌面和窗口，再通过 [Command.run()](command.md#commandruncommand-args-options) 启动新的
`./dist/opendesk -script <scriptFile>` execution；取消或关闭使用 `AbortSignal` 清理该受管子进程。
进程退出结果与 candidate 分开显示，生成结果仍保持 `verification: "not-run"`。生成成功后可再次明确点击
“重新生成”，从同一份 generatable actions 重走生成和读取并清理旧的内存候选／运行结果。重置只清理内存中的
候选、actions 和 UI 状态，不删除录制目录，也不重复终结 Recorder session。录制阶段的关闭和取消
不会生成或回放。
倒计时内必须聚焦隔离、非敏感、可恢复的目标；仅查看窗口或运行合成 UI 测试不会启动 listener。

## RecorderSession.status()

同步读取 session 的只读状态快照。

**签名**

```ts
session.status(): OpenDeskRecorderStatus
```

**参数**

无。

**返回值**

返回 `captureState`、`storageState`、`recordingId`、`recordingDir`、截止序号、最大时长和已知问题。`captureState` 为 `starting`、`recording`、`paused`、`stopping`、`stopped` 或 `failed`。

计数位于 `counts`：`observed` 是当前 session 已排序的 native callback 与 Recorder 控制边界总数；`accepted` 是进入 writer 队列的输入和控制边界数；`persisted` 是已完整 flush 的 raw 记录数；`filtered` 是按采集策略排除的输入数；`paused` 是暂停期间在保存输入内容前丢弃的 native callback 数；`dropped` 是队列溢出数；`late` 是 stop 截止后的 callback 数。

时间字段包含 `startedAt`、当前暂停起点 `pausedAt`、`elapsedDurationMs`、`activeDurationMs`、`pausedDurationMs` 和 `pauseCount`。`maxDurationMs` 是 native lease 的总墙钟上限，暂停时间也计入其中。

**行为与错误**

不扫描桌面、不临时判断脚本生成资格，也不改变监听或 writer。序号表示 libuiohook 回调在当前 session 的观察顺序，不承诺操作系统范围的绝对全局顺序或零丢失。

**示例**

```js
console.log(JSON.stringify(session.status()));
```

## RecorderSession.pause()

暂停当前 session 接受输入，保留 native hook、writer 和 session 句柄。

**签名**

```ts
session.pause(): Promise<OpenDeskRecorderControlResult>
```

**参数**

无。

**返回值**

返回 `changed`、固定为 `"paused"` 的 `captureState`、控制边界的 `transitionSequence` 和 `transitionedAt`。第一次从 `recording` 暂停时 `changed` 为 `true`；已是 `paused` 时幂等返回 `changed: false`，不会写入重复边界。

**行为与错误**

方法先关闭输入接受门，再按 session sequence 写入 `RECORDER_PAUSED`。已经排队的早期输入仍由 writer 保存；方法返回后到达的 native 输入只增加 `counts.observed` 和 `counts.paused`，不进入 raw。若 session 正在停止或已经终结，返回 `RECORDER_INVALID_STATE`；控制边界无法入队时 fail closed 并终止 session。

暂停不会卸载 libuiohook，也不会延长 `maxDurationMs`。暂停时可以离开目标窗口；若用户将开始敏感操作，不应把 pause 当作 stop 使用。

**示例**

```js
const result = await session.pause();
console.log(result.captureState, result.changed);
```

## RecorderSession.excludeControlClick(event)

在 Custom UI 按钮回调中登记本次控制点击，使它保留可审计 raw 边界但不成为目标 action。

**签名**

```ts
session.excludeControlClick(event: OpenDeskRecorderControlClickEvent): Promise<OpenDeskRecorderControlClickResult>
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `event` | `OpenDeskRecorderControlClickEvent` | 是 | 无 | `FloatingWindow` 或 Custom UI 的原始 `click` 事件；必须包含有效的 `windowId`、`targetId`、`timestamp` 和宿主生成的控件屏幕 `bounds`，不得重建或延迟转交。 |

**返回值**

返回 `changed`、控制边界的 `transitionSequence`、被该边界引用的 native `eventIds` 和 `matchStatus`。在 `recording` 状态写入边界时，`changed` 为 `true`；`eventIds` 只引用时间相邻、全部坐标位于宿主控件 `bounds` 内的最近一次完整左键 press/release（可含 `CLICKED` 或有界 drag jitter）包络。`matchStatus` 为 `matched`、`not-observed` 或 `unmatched`。`paused` 状态没有保存 native 输入，返回 `changed: false`、`not-observed` 和空 `eventIds`。

**行为与错误**

调用方应在每个可能发生于录制期间的 Custom UI `click` 回调中先 `await session.excludeControlClick(event)`，再执行按钮业务；这不只适用于暂停和停止按钮。Runtime 只关联 native 输入尾部完整、有界、与该 UI 时间戳相差不超过 1.5 秒且落在宿主所报控件屏幕范围内的左键点击包络，并把范围、匹配状态和 `RECORDER_CONTROL_CLICK` 写入 raw；`buildActions()` 根据边界中的事件 ID 排除控制输入，不会把快速切换应用前的最近业务点击误认成工具条点击。

若控件范围内没有任何相邻 native 指针输入，边界使用 `matchStatus: "not-observed"` 和空引用；raw 中没有可排除的控制输入，因此不会单独阻塞制作。若范围内出现了输入但无法组成完整包络，则使用 `unmatched` 并产生 blocked issue。过期引用、范围不符或被修改的元数据同样会阻塞，不会静默删除 raw 输入。

事件不是实时 click、身份、时间戳或控件范围无效，或者 session 不在 `recording`／`paused` 状态时返回 `INVALID_ARGUMENT` 或 `RECORDER_INVALID_STATE`。若控制台未能建立边界，仍应允许用户停止监听，但必须阻止自动制作或生成脚本，避免把控制按钮静默重放为目标点击。

**示例**

```js
toolbar.addButton('stop', '停止录制', 'stop.fill', async event => {
  await session.excludeControlClick(event);
  const saved = await session.stop();
  console.log(saved.recordingDir);
});
```

## RecorderSession.resume()

从用户当前选择的前台窗口继续当前 session 接受桌面输入。

**签名**

```ts
session.resume(): Promise<OpenDeskRecorderControlResult>
```

**参数**

无。

**返回值**

返回 `changed`、固定为 `"recording"` 的 `captureState`、控制边界的 `transitionSequence` 和 `transitionedAt`。从 `paused` 恢复时 `changed` 为 `true`；已是 `recording` 时幂等返回 `changed: false`，不会写入重复边界。

**行为与错误**

恢复不校验或重写初始 `within.processId` 和 `within.title`。从 `paused` 恢复时先写入 `RECORDER_RESUMED`，再重新打开输入接受门，因此 resume 快捷键自身不会成为业务动作；后续输入属于恢复时位于前台的窗口或应用。

若 session 正在停止或已经终结，返回 `RECORDER_INVALID_STATE`；控制边界无法入队时 fail closed 并终止 session。

**示例**

```js
const result = await session.resume();
console.log(result.captureState, result.changed);
```

## RecorderSession.stop()

终结采集并只保存录制事实，不制作 actions、代码或回放。

**签名**

```ts
session.stop(): Promise<OpenDeskRecorderStopResult>
```

**参数**

无。

**返回值**

返回 `recordingId`、`recordingDir`、实际存在的 `rawFile`／`manifestFile`、采集与保存状态、计数和问题。保存失败时 Promise 以结构化错误拒绝，并在 `error.partial` 提供同一份部分摘要；不存在的文件返回 `null`。

**行为与错误**

`stop()` 可从 `recording` 或 `paused` 调用。并发和重复调用共享一次终结：先冻结截止序号和时间，再解除监听并等待 callback 退出，之后关闭队列、排空已接收事件、Flush／Sync／Close raw 文件并写终结 manifest。晚于截止的 callback 只计入 `late`。stop 不发送抬键事件，不改变真人当前按键状态。

执行取消、Ctrl+C、脚本异常和宿主退出由 native owner 触发同一有限清理。若 backend 在期限内不能确认退出，结果明确失败并保留 residual resource 计数，不把 Promise 超时称作监听已回收。底层线程未退出时，进程级 lease 保持 quarantine 并禁止新的 owner；后台有限重试和后续 `Recorder.start()` 都可再次请求同一个 backend 停止，只有 `hook_run()` 实际返回才释放 lease。

达到 `maxDurationMs` 会以 `RECORDER_CANCELED` 终结 session。若 raw 和 terminal manifest 已完整保存、没有事件丢失或其他 package-integrity error，该受控截止允许 `buildActions()` 返回 `needs-review`，并可生成包含截止 warning 的 partial candidate；它不表示用户原本意图的流程已经完成。若同时存在 backend、storage、manifest、drop 或未知 error，仍保持 `blocked`。

若 raw 末尾存在没有匹配 release 的物理按键，macOS 在冻结 stop 边界后读取 combined-session key state，并在 manifest 的 `keyStatesAtStop` 中区分 `released`（release 未被 event tap 观察到）和 `pressed`（真人在边界时仍按住）；不可查询的平台写 `unavailable`。两种已知状态都保留 issue，Recorder 不补写 `KEY_RELEASED`、不猜 release 时间，也不改变真人键盘状态；对应局部输入被 omitted，actions 为 `needs-review`，其余安全动作仍可生成。

**示例**

```js
const saved = await session.stop();
console.log(saved.recordingDir, saved.storageState);
```

## Recorder.buildActions(recordingDir)

重新读取录制包的实际 manifest 和 raw 字节，确定性制作 actions；未终结包只恢复可校验前缀并强制阻塞生成。

**签名**

```ts
Recorder.buildActions(recordingDir: string): Promise<OpenDeskRecorderActionsResult>
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `recordingDir` | `string` | 是 | 无 | `Execution.workdir/.runtime/recordings` 内的录制目录 |

**返回值**

返回 `actionsFile`、`revision`、`actionCount`、`readiness` 和 `issues`。`readiness` 只表示基础转换的数据资格，不表示用户审批或业务成功。

**行为与错误**

该方法不要求 active session、hook、桌面权限或原 execution 句柄。它从同一份 raw 字节计算 hash 并解析，限制 regular file、路径、大小、行长、事件数、结构和引用，并交叉检查 manifest 的状态、计数、截止、显示器与已验证坐标。终结 manifest 缺失或 storage 非 `saved` 时，只允许从完整 NDJSON 行恢复可验证前缀；最后一条未终结损坏行被排除并记录 error，readiness 固定为 `blocked`。首次保存 `actions.json`；已有内容完全相同时复用，已有文件被人工修改时写 `actions.rNNN.json`，不覆盖旧内容。每个 revision 都保存 `revisionReason` 与固定制作 `revisionBasis`；每个 action 另保存其 source basis。

native listener ready 是采集起点，不保证用户在该瞬间已经松开鼠标。若 press 发生在 ready 前，而对应 drag/release 落入 raw，builder 仅在 raw 首段识别可证明属于单一 held button、并由对应 release 明确回到无鼠标键按下状态的 partial pointer envelope；只观察到起点 release 或其紧邻 click 尾部也属于同一边界情况。这些原始事件逐条保留并以 `capture-start partial pointer envelope` 标成 `excluded`，不会补造 press、生成 action 或阻断后续完整录制。相同的不完整形状若出现在首个完整输入之后、无法确定单一按钮、未观察到 neutral release 或跨 pause，会被明确 omitted 并形成 `needs-review`；只有 manifest 报告 dropped/unpersisted 才是 package-level blocked。

首版把每个完整的单次物理左键 `CLICKED` 包络与对应 `PRESSED`／`RELEASED` 制作为 click。libuiohook 的 `clicks` 是同一按钮的时间序列计数，并不会比较前后坐标；因此快速点击两个不同控件时，第二个完整包络也可能携带 `clicks: 2`。builder 在三条事件计数一致、且前一个 `CLICKED` 不在同一 4 logical points 范围内时仍保留为一次物理 click；录制起点只有 `clicks > 1` 的序列后缀时同理。同一点范围内连续递增的包络会被 omitted，不会拆成受默认最小延迟影响的独立点击，也不会阻断其他安全动作。

libuiohook 在指针发生极小移动后还会把中间事件报告为 `MOUSE_DRAGGED`、`button: "none"` 并省略 `CLICKED`；当完整 press/drag/release 在 2 秒内、同一显示器且所有点距按下点不超过 4 logical points 时，builder 确定性归一化为一个 click，并在 action source 保存独立 basis。它不会把超过该边界的真实拖动伪装成 click。

basic 动作子集另支持可审计的单次直线左键 drag：完整 press/motion/release 必须在 30 秒内、全部坐标已验证且位于同一显示器，起终点距离大于 4 logical points；普通 drag 的每个路径点到起终点线段仍不得超过 8 logical points，投影进度不得越出线段或明显回退。macOS 的非 click drag release 可合法省略 click-series count，因此只接受 press `clicks > 0` 且 release `clicks` 与 press 相同或为缺省 `0`；正数冲突会省略该 drag。action 保存起点、`destination`、有界 `steps`、全部 source event IDs，以及 press/release 各自的窗口、phase、解析状态和不含内容的 Accessibility traits。

只有两个端点都属于同一 verified 录制窗口、同一个 verified 可写 `textField` 时，真人文字选择才可进入独立的自然近直线子集并分类为 `text-selection`。该子集仍要求同屏、≤30 秒、全路径坐标 verified、投影不越界且无明显回退；横向偏差上限是 `min(16, max(8, 起终点距离 × 8%))` logical points，采样路径总长不得超过起终点直线距离的 1.08 倍，并使用独立 source basis。普通 drag 的全局 8 points 容差不变；非输入控件、双端点窗口不一致、只有 release context、`semanticStatus` 为 `unavailable`／`not-requested`、明显曲线、回退、跨显示器、非左键、超时和未验证坐标都不能使用该语义子集，对应 `drag-unsupported` action-local issue 会省略该段。Recorder 不会根据应用名、窗口位置或轨迹形状补造 `text-selection` 证据。

未带修饰键的滚轮输入会制作为 `wheel`。同一显示器、同一轴、同一方向且相邻 native 时间不超过 250ms 的连续事件合并为一个最多 100 步的 burst；action 固化首事件的 `x/y`，同时保存 window/display 相对投影，把各事件的 `wheelAmount * wheelRotation` 累加为 `deltaX` 或 `deltaY`，并从 burst 时长确定 `delayMs`。正值与 [mouse.wheel()](mouse.md#mousewheeloptions) 一致，表示向右／向下。换轴、反向、较长停顿或步数上限会切断 burst；缺少原生滚轮字段、零 delta、未验证坐标以及按住键盘修饰键或鼠标键的滚轮会被 omitted 并留下 issue。

键盘制作遵循“最终结果优先、低层内容兜底、物理事实补充”：已验证的焦点文本框值变化制作 `text-edit`，其源按键只作证据，避免再发一次物理键；未取得最终值时，可打印 Basic Latin 制作 `text` fallback，不因 `textInputSource: "input-method"`／`"unknown"` 或 `key-typed-is-not-an-ime-commit` 单独阻断。该 fallback 保留的是低层输入内容，不能被表述成 verified final text。没有文本变化的 Control/Meta/Alt 组合制作 `shortcut`，Enter、Escape、Tab、Backspace/Delete、方向/导航键和 F 键制作 `key`；同一键多个 press 加一个 release会折叠为上限 100 的 `repeatCount`，避免长按退格留下 unresolved events。非 ASCII 差异若与 Enter/Tab 共用源事件仍记录 `ime-boundary-ambiguous`；不可表示的 composition/dead key、未知物理键、无配对边界、跨 pause 以及未关联 modifier 同样被明确 omitted。它们都形成 `needs-review`，不阻止其他安全动作生成。

pause/resume 控制边界被明确排除但会切断动作归组；`RECORDER_CONTROL_CLICK` 只排除其显式引用的 Custom UI 点击包络。除上述 capture 起点 partial pointer envelope 外，输入按下状态跨越 pause、会话内 missing pair、同一点连续双击／多击、非左键、带修饰键的滚轮、Control/Meta/Alt click 和未验证动作 target 会保留 action-local issue，对应事件或 action 标成 `omitted`，actions 为 `needs-review`，但不会阻止其余安全动作生成 partial candidate。事件真实丢失或控制点击边界不可验证仍是包级错误。

`recording/v2` 在鼠标按下／释放、每个滚轮 burst 起点和文本输入段起点异步记录动作级窗口上下文。滚轮上下文只解析前台窗口和 bounds，不执行无意义的控件点击语义探测。窗口快照把可复用的应用身份（可执行文件路径，缺失时为可执行文件名）与仅能说明本次录制来源的 PID、窗口 ID、窗口序号和原生 handle 分开；点击和滚轮同时保存录制时的屏幕事实、窗口左上角偏移和归一化比例。坐标已由录制时 display provenance 验证、但落在当时活动窗口之外的点击（例如 Dock、菜单栏或桌面）不会伪装成窗口动作；builder 把它保存为带 display identity、显示器内偏移和比例的明确 display-relative click。滚轮接收者本来就由指针位置和系统命中测试决定，因此窗口上下文缺失／过期时，只要录制坐标及 display provenance 已验证，也会明确降级为 display-relative wheel；这同时允许早期未采集 wheel context 的 v2 录制包生成候选。其他窗口上下文缺失或过期会省略对应动作，形成 `needs-review`。

macOS 在权限和可用性允许时还保存不含值内容的 Accessibility 元素标签证据，包括按钮文字、role、subrole、identifier、enabled/focused/valueSettable traits、原生动作、控件 bounds、控件内点击点、原始命中节点和最多 6 层祖先路径；非操作叶节点会“冒泡”到最近的可执行祖先。`semanticStatus`／`semanticReason` 明确区分已验证、不可用和未请求。元素语义不可用不会退回到“固定起始窗口”或终止录制。起始窗口读取失败也只留下 warning，只要具体动作具有可验证上下文，actions 仍可为 `ready`。

窗口或应用切换本身是正常桌面序列，不产生 blocked issue。完整非暂停动作间隔不作为 readiness 错误；其 raw 时长由 basic 生成器按 timing 策略显式转换为脚本中的固定等待。

**示例**

```js
const actions = await Recorder.buildActions(saved.recordingDir);
console.log(actions.actionsFile, actions.readiness, actions.issues);
```

## Recorder.generateScript(actionsFile, options?)

独立读取固定 actions 文件并生成普通 OpenDesk JavaScript 与不可执行 candidate 元数据。

**签名**

```ts
Recorder.generateScript(
  actionsFile: string,
  options?: {
    mode?: "basic";
    outputFile?: string;
    timing?: {
      minimumDelayMs?: number;
      maximumDelayMs?: number;
      speedMultiplier?: number;
    };
    pointerMotion?: "instant" | "smooth";
  }
): Promise<OpenDeskRecorderScriptResult>
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `actionsFile` | `string` | 是 | 无 | 录制目录直属的 `actions.json` 或 `actions.rNNN.json` |
| `options.mode` | `"basic"` | 否 | `"basic"` | 首版唯一生成模式 |
| `options.outputFile` | `string` | 否 | `generated/basic.recipe.js` | 只能是本录制 `generated` 目录内的新 `.js` 文件 |
| `options.timing` | `object` | 否 | 见下列 timing 字段 | 生成相邻动作间 `sleep` 的可审计策略；显式 pause/resume 边界不应用该策略 |
| `options.timing.minimumDelayMs` | `number` | 否 | `500` | 每个非暂停动作间隔的下限；整数，范围 `0..1800000` |
| `options.timing.maximumDelayMs` | `number` | 否 | `30000` | 每个非暂停动作间隔的上限；整数，范围 `0..1800000`，不得小于 `minimumDelayMs` |
| `options.timing.speedMultiplier` | `number` | 否 | `1` | 先用录制间隔除以该倍率，再应用上下限；有限数值，范围 `0.1..100`，大于 `1` 会加快重放 |
| `options.pointerMotion` | `"instant" \| "smooth"` | 否 | `"instant"` | 指针动作前的定位策略；`smooth` 生成带明确时长、`easeInOut` 曲线和 residual sleep 的合成移动，`instant` 保留直接定位。该策略不恢复未录制的真实 hover 轨迹 |

**返回值**

返回 `scriptFile`、`candidateFile`、actions 与脚本 hash、约束、实际采用的完整 `timing`、`pointerMotion`，以及固定的 `verification: "not-run"`。candidate 固定 actions 版本、映射、timing、指针定位策略和环境限制。

**行为与错误**

该方法重新读取并严格校验实际 actions 字节及其固定 raw hash/byte reference，不信任上次调用的内存对象。它重新解析 raw 和终结 manifest，要求 eventDisposition 完整且唯一，并验证 click/drag/wheel/text/text-edit/shortcut/key、source basis、timing、issues、readiness 与固定输入事实的确定性归组一致。未知字段、未知动作、非法数值、悬空引用、unsafe ID、空文本、`blocked` 资格和非 basic mode 均拒绝。`ready` 生成完整 basic candidate；`needs-review` 生成 runnable partial candidate，并在源码和 constraints 明示 omitted raw event 数量。零安全动作时仍生成 no-op candidate，不能据此声称录制行为或业务目标完成。输出使用 exclusive create；已存在脚本或 candidate 返回 `WOULD_OVERWRITE`，不会覆盖人工代码。

生成脚本先检查 OS，然后仅发出白名单窗口、显示器、Geometry、mouse、keyboard 与 Accessibility 调用，以及相邻动作间固定的 `sleep`。快捷键和特殊键先证明重新解析的窗口正在前台，再分别调用 `keyboard.combination()` 和 `keyboard.press()`；自动重复按 `repeatCount` 逐次调用。低层 `text` 的内容先写入显式 `const __recorderTextN`，供用户或下游流程确认、改名或参数化，再传给 `keyboard.type()`。`text-edit` 先在该窗口内用录制的 role 加 identifier（缺失时 name）执行完整唯一性搜索，同时读取当前 `focused` 和 `value`；只有目标仍聚焦，且 value 的 UTF-16 code-unit 长度与 UTF-16LE SHA-256 精确匹配 precondition，才在内存应用差异、核对 after hash、最多一次调用 `Accessibility.perform(...setValue...)`。调用后再次读取同一引用，要求它仍聚焦且值匹配 postcondition。安全字段、歧义、焦点或前置状态漂移、动作未确认、回读不一致均停止，绝不重试或退回键盘猜测。执行这类候选必须显式启用 Accessibility Runtime 能力并具备系统权限。

窗口动作在运行时先用录制的可执行文件路径／名称加精确标题调用 `window.get`；只有该调用明确返回无底层 cause 的 `NOT_FOUND` 时，才退回仅按可执行文件身份调用 `window.get`，而该查询本身仍要求唯一匹配。歧义、后端失败和带 cause 的错误原样拒绝，不触发放宽条件。录制时的 PID、窗口 ID、窗口序号和原生 handle 永远只作 provenance，不与当前 execution 比较；窗口标题也不是单独的硬门槛。无法唯一解析当前目标才明确拒绝该动作，避免把输入发送给任意同应用窗口。

窗口点击把当前窗口快照和录制时的窗口内偏移交给 `Geometry.pointOffset()`，再用 `Geometry.contains()` 明确拒绝越界点，因此允许窗口平移；窗口缩放不会用比例坐标猜测。桌面级点击按录制 display ID 解析，ID 不能唯一匹配时才使用唯一的 hardware identity，并以同一 Geometry 路径把显示器内偏移投影到当前 bounds。`pointerMotion: "instant"` 直接通过 tagged screen point 调用 `mouse.clickPoint()`；`"smooth"` 先用显式 `mouse.move(..., {durationMs, curve: "easeInOut"})` 合成可见移动并以 `mouse.getPos()` 确认落点，再调用相同的 `mouse.clickPoint()`。该选择只改变生成代码和重放定位表现，不伪装成 Recorder 已保存普通 hover 轨迹。两种方式都不会把窗口解析、投影和输入提交合并成原子操作。调用方必须恢复预期的 Dock／菜单栏／桌面状态。

drag 使用同样的新鲜窗口／显示器解析分别投影起点和终点；脚本按 `pointerMotion` 瞬时或按显式时长与 `easeInOut` 曲线移到起点，并用 `mouse.getPos()` 在 2 logical points 内确认实际起点，再 `mouse.down({button: "left"})`。窗口目标在 down 返回后、motion 前确认刚刚解析的当前窗口已经处于前台；不匹配时进入 `finally` 释放按钮并拒绝继续拖动。`try` 中使用录制动作自身的受限 `steps` 移到终点并再次确认实际指针位置；这段按键按下后的拖动语义不受定位开关或新时长预算影响。`finally` 中无条件 `mouse.up({button: "left"})`，避免移动、窗口验证或终点检查失败后留下按键按下状态。生成脚本为起点、down 返回、前台确认、终点和 up 返回写入结构化 trace；这些 trace 只证明输入调用边界和指针观察，不是业务成功。键盘和文本动作也会确认刚刚重新解析出的当前窗口确实处于前台；两类比较都使用本次解析得到的当前窗口身份，不是录制时的 PID 或编号。调用方应在执行前恢复预期的起始桌面和应用状态，不必恢复录制时 PID、窗口编号或屏幕位置。

wheel 同样先解析新鲜窗口或显示器，把录制的首事件坐标投影到当前 bounds 并拒绝越界；生成脚本按 `pointerMotion` 瞬时或按显式时长与 `easeInOut` 曲线移动到该点后才调用 `mouse.wheel({deltaX, deltaY, steps, delay})`，平滑模式还会在滚动前确认指针落点。因此滚动目标坐标不会被省略，窗口平移时使用窗口内偏移，旧录制的 display-relative 降级则要求恢复对应桌面布局。

脚本不导入 Node、不 `eval` actions、不循环解释 actions、不调用 OCR／模型／Skill，也不自动运行。每个非暂停动作间隔都以“前一动作最后事件到后一动作首个事件”的 raw 毫秒差为基准，先计算 `effectiveGap = clamp(round(recordedGap / speedMultiplier), minimumDelayMs, maximumDelayMs)`。instant 或非指针动作仍把完整 `effectiveGap` 生成为 `sleep`；smooth 的 click、wheel 和 drag start 则用录制 screen-logical 点间距离 `d` 计算 `desiredMotion = clamp(round(180 + d / 1.2), 300, 1200)`，再取 `motionDuration = min(desiredMotion, effectiveGap)` 与 `residualSleep = effectiveGap - motionDuration`。residual sleep 先发生，随后移动在动作前结束，所以目标解析仍尽量新鲜；短 gap 可以全部用于移动，长停顿不会被伪造成不自然的慢速 hover。没有可用前序指针点（首个指针动作或 pause boundary 后）使用明确的 320ms synthetic duration；若可用 gap 为 0，则使用 1ms 以满足公开 API 的正时长边界。所有数值和公式都以生成注释、`durationMs`、`curve` 与 residual `sleep` 明示。

默认 timing 因此继续保留用户总节奏，同时给快速操作至少 500ms 的稳定间隔，并把异常长等待限制为 30 秒；`mouse.move.durationMs` 已包含平台稳定间隔，除系统调度误差外，budgeted gap 的 `residualSleep + motionDuration` 等于 `effectiveGap`。显式 pause/resume 之间的墙钟时间不重放。resolved timing 与 pointer motion 同时写入返回值和 `basic-candidate/v4` 元数据，调用方或后续 AI 可在生成时调整策略，也可审核后修改普通 JS。这些 duration 和 sleep 是可检查的录制时间事实与重放节奏策略，不是目标就绪、加载完成或业务成功条件。

**示例**

POSIX shell 从仓库根目录独立生成：

```bash
OPENDESK_RECORDER_ACTIONS_FILE=.runtime/recordings/<ID>/actions.json ./dist/opendesk -script examples/human-to-recipe/generate.js -console-mode script
```

PowerShell 从仓库根目录独立生成：

```powershell
$env:OPENDESK_RECORDER_ACTIONS_FILE='.runtime\recordings\<ID>\actions.json'; .\dist\opendesk.exe -script examples\human-to-recipe\generate.js -console-mode script
```

生成后只有在重新建立获准测试起点并明确授权回放时，才从仓库根目录单独执行：

```bash
./dist/opendesk -script .runtime/recordings/<ID>/generated/basic.recipe.js -console-mode script
```

Promise resolve 只证明生成或输入 API 返回，不证明目标应用的业务结果；结果必须由 fixture 状态、实际画面或预先约定的独立检查确认。

## 文件格式与限制

Recorder v2 目录为：

```text
.runtime/recordings/<recording-id>/
  manifest.json
  raw/events.ndjson
  actions.json
  generated/basic.recipe.js
  generated/basic.candidate.json
```

raw 使用字符串保存 session sequence 和 native timestamp，避免 JavaScript safe-integer 损失；同时保存 native clock/unit、接收时间、modifier、库事件、坐标验证、输入来源和已知 gap；新的 macOS live `KEY_TYPED` 将不能代表目标应用最终输入结果的 `textInputSource` 明确保存为 `unknown`。`manifest.json` 保存可选的起始窗口快照、与权威 pointer/keyboard 事件关联的 `inputContexts`、显式键盘授权下的 `textEdits`，以及只针对 raw 未配对按键的 `keyStatesAtStop`。新录制的 pointer press/release/wheel context 分别带 `pressed`／`released`／`wheel` phase；旧 v2 release-only context 的空 phase 仍可读取，但不能补造缺失的 press traits。窗口和标签语义是动作当时事实；`textEdits` 只含 before/after 指纹、差异插入内容、精确可写文本框 descriptor 和源事件引用，不保存未变化上下文、完整字段值、选择文本或安全字段内容。Recorder 自身的暂停／恢复与 Custom UI 控制点击边界使用 `source: "recorder"`；控制点击边界的 metadata 固定保存 `windowId`、`targetId`、`uiTimestamp`、`triggerEventIds`、`controlBounds` 和 `matchStatus`。暂停区间的输入内容不写入 raw。普通 hover `MOUSE_MOVED` 不保存；只在鼠标键按住期间保留 motion／drag 路径供动作判定。默认事件队列 4096、窗口上下文队列 128、文本采样 40ms、文本静默归组 750ms、上下文新鲜度上限 750ms、writer flush 250ms、backend start/stop deadline 8s、默认 session 15 分钟、最大 30 分钟；Meta／Control／Alt chord 和非编辑导航键会立即切断文本归组，以保留独立快捷键或特殊键事实。这些是有限设计默认值，不是性能实测结论。

basic 模式不创建 `observations/`。Accessibility 标签直接作为动作上下文中的结构化事实保存，不等于 OCR，也不被当作已证明的业务意图。只有未来在明确启用屏幕证据后实际取得有界目标裁剪时才能创建并引用 `observations/`；不得把后来截图、OCR 文本或模型描述伪装成录制时事实。

## 错误

Recorder Promise 使用 `RecorderError`，至少包含 `name`、`code`、`operation` 和安全消息。主要 code：

| code | 含义 |
| --- | --- |
| `INVALID_ARGUMENT` | 参数、未知字段、路径或 mode 不合法 |
| `RECORDER_CAPTURE_DENIED` | 宿主授权或 OS 权限不满足 |
| `RECORDER_CAPTURE_UNAVAILABLE` | 平台、backend、库启动／停止或显示能力不可用 |
| `RECORDER_CAPTURE_OCCUPIED` | 当前 execution 或进程级 dispatcher 已被占用 |
| `RECORDER_INVALID_STATE` | pause／resume／控制点击边界与当前 session 状态不兼容 |
| `RECORDER_STORAGE_FAILED` | raw、Flush／Sync／Close、manifest 或输出保存失败 |
| `RECORDER_CANCELED` | execution 或最大时长终止录制 |
| `RECORDER_FILE_NOT_FOUND` | 必需录制文件不存在 |
| `INVALID_RECORDING` | manifest、raw、actions、顺序、hash 或引用不合法 |
| `GENERATION_BLOCKED` | actions 为 package-integrity `blocked`；raw／manifest、事件保存或 Custom UI 控制边界不足以安全生成 |
| `WOULD_OVERWRITE` | 目标脚本或 candidate 已存在 |
