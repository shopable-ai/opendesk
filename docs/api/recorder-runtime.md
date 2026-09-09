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

`capture` 分别给出 `supported`、当前 execution 的 `hostAuthorized`、无提示权限探测 `permission`、`available`、平台、固定 libuiohook 版本、坐标空间、`evidenceModes` 和限制。`evidenceModes` 当前包含 `"none"` 与 `"target-semantics"`。`actions.available` 与 `basicGeneration.available` 描述文件制作能力；它们不因 hook 不可用或未授权而变为 `false`。

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
| `options.evidence` | `"target-semantics" \| "none"` | 否 | `"target-semantics"` | 前者在鼠标释放后采集点击处控件的标签级语义；后者显式关闭控件语义。两者都不采集截图、OCR、AX 值或整棵 AX 树 |
| `options.outputDir` | `string` | 否 | `.runtime/recordings` | 只能位于 `Execution.workdir/.runtime/recordings` 内的父目录 |
| `options.maxDurationMs` | `number` | 否 | `900000` | 录制上限，范围 1000–1800000 毫秒；由 native owner 强制停止 |
| `options.controlKeycodes` | `number[]` | 否 | `[]` | 最多 16 个 libuiohook 控制键码；对应按键事件在入队前排除 |

**返回值**

Promise resolve 为当前 execution 专有的 `OpenDeskRecorderSession`。session 不能跨 execution 使用。

**行为与错误**

采集入口必须使用 `-allow-recorder-capture`；普通本地脚本、HTTP、MCP 和 Scheduler 默认不能从 JavaScript 参数或环境变量取得该权限。`within` 记录启动时由调用方选择的前台窗口上下文，不是输入过滤范围或重放门槛。Runtime 会尽力再次读取启动时的前台窗口；无法读取或与 `within` 不一致时记录 `initial-window-unverified` 或 `initial-window-changed` warning，但不拒绝启动。listener 就绪后采集是桌面级的，切换窗口、改变标题或切换应用不会过滤输入、终止 session 或阻塞 actions。

每次权威 `MOUSE_RELEASED` 和每个文本段的首个 `KEY_TYPED` 都会在 callback 之外解析当时的前台应用、具体窗口和 bounds；解析必须在 750ms 新鲜度边界内完成。`target-semantics` 还在 macOS 通过点命中读取单个 Accessibility 元素；若命中的是按钮内文字等非操作节点，最多沿 6 层父链选择最近的可执行祖先。它保存所选目标的 `role`、native role、名称／描述、identifier、原生动作、bounds、元素内点击点，以及原始 hit 和有界 ancestors。它不会保存 `AXValue`、选择文本、密码字段内容或整棵子树；安全元素明确跳过。语义不可用时保存 `semanticStatus: "unavailable"` 及原因，窗口上下文仍可独立使用；`none` 保存 `semanticStatus: "not-requested"`，而不是伪装成探测成功。

键盘默认不保存；显式开启后键盘采集会跟随前台应用，因此调用方必须确保整个录制过程均为非敏感测试。Recorder 不读取剪贴板、不上传材料。OCR 需要截图裁剪、隐私声明和独立证据文件，当前不会作为 AX 失败时的静默降级；需要 OCR 的后续语义制作必须显式读取独立现场材料。

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

开始按钮是本次即时采集授权；点击后控制台留出 3 秒供用户聚焦起始窗口，再读取并保存该窗口上下文，
用于聚焦的点击发生在 listener 启动前，不会进入录制。暂停／继续按钮按
`status().captureState` 分派到明确的 `pause()`／`resume()`；继续时可以位于任意窗口。录制中可切换窗口和应用。停止后界面显示保存摘要并调用同一个
`Recorder.buildActions()`；只有 actions 为 `ready` 时，用户才能另点“生成脚本”调用
`Recorder.generateScript()`。生成后详情页读取并显示真实脚本内容，但不会自动回放。只有再次明确点击
“试运行”后控制台先留出 3 秒供用户恢复起始桌面和窗口，再通过 [Command.run()](command.md#commandruncommand-args-options) 启动新的
`./dist/opendesk -script <scriptFile>` execution；取消或关闭使用 `AbortSignal` 清理该受管子进程。
进程退出结果与 candidate 分开显示，生成结果仍保持 `verification: "not-run"`。生成成功后可再次明确点击
“重新生成”，从同一份 ready actions 重走生成和读取并清理旧的内存候选／运行结果。重置只清理内存中的
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
| `event` | `OpenDeskRecorderControlClickEvent` | 是 | 无 | `FloatingWindow` 或 Custom UI 的原始 `click` 事件；必须包含有效的 `windowId`、`targetId` 和 `timestamp`，不得重建或延迟转交。 |

**返回值**

返回 `changed`、控制边界的 `transitionSequence` 和被该边界引用的 native `eventIds`。在 `recording` 状态写入边界时，`changed` 为 `true`；`eventIds` 是与事件时间相邻的最近一次完整左键 press/release（可含 `CLICKED` 或有界 drag jitter）包络。`paused` 状态没有保存 native 输入，返回 `changed: false` 和空 `eventIds`。

**行为与错误**

调用方应在每个可能发生于录制期间的 Custom UI `click` 回调中先 `await session.excludeControlClick(event)`，再执行按钮业务；这不只适用于暂停和停止按钮。Runtime 只关联 native 输入尾部完整、有界且与该 UI 时间戳相差不超过 1.5 秒的左键点击包络，并把 `RECORDER_CONTROL_CLICK` 写入 raw；`buildActions()` 根据边界中的事件 ID 排除控制输入，不按坐标、窗口标题或按钮位置猜测。空引用、过期引用或被修改的元数据会明确产生 blocked issue，不会静默删除 raw 输入。

事件不是实时 click、身份或时间戳无效、session 不在 `recording`／`paused` 状态时返回 `INVALID_ARGUMENT` 或 `RECORDER_INVALID_STATE`。若控制台未能建立边界，仍应允许用户停止监听，但必须阻止自动制作或生成脚本，避免把控制按钮静默重放为目标点击。

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

执行取消、Ctrl+C、脚本异常和宿主退出由 native owner 触发同一有限清理。若 backend 在期限内不能确认退出，结果明确失败并保留 residual resource 计数，不把 Promise 超时称作监听已回收。

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

首版把完整的单次左键 `CLICKED` 与对应 `PRESSED`／`RELEASED` 制作为 click。libuiohook 在指针发生极小移动后会把中间事件报告为 `MOUSE_DRAGGED`、`button: "none"` 并省略 `CLICKED`；当完整 press/drag/release 在 2 秒内、同一显示器且所有点距按下点不超过 4 logical points 时，builder 确定性归一化为一个 click，并在 action source 保存独立 basis。超过该边界的真实拖动仍明确 blocked，绝不降级为 click。

可靠的 Basic Latin `KEY_TYPED` 制作为当前焦点插入文本。物理键只作证据，避免与 `keyboard.type` 双重消费。pause/resume 控制边界被明确排除但会切断动作归组；`RECORDER_CONTROL_CLICK` 只排除其显式引用的 Custom UI 点击包络。输入按下状态跨越 pause、双击、非左键、真实拖动、滚轮、Control/Meta/Alt click、composition／死键、不配对边界、未验证坐标和事件丢失会保留问题并阻塞生成。

`recording/v2` 在鼠标释放和文本输入段起点异步记录动作级窗口上下文。窗口快照把可复用的应用身份（可执行文件路径，缺失时为可执行文件名）与仅能说明本次录制来源的 PID、窗口 ID、窗口序号和原生 handle 分开；点击同时保存录制时的屏幕事实、窗口左上角偏移和归一化比例。macOS 在权限和可用性允许时还保存不含值内容的 Accessibility 元素标签证据，包括按钮文字、role、identifier、原生动作、控件 bounds、控件内点击点、原始命中节点和最多 6 层祖先路径；非操作叶节点会“冒泡”到最近的可执行祖先。`semanticStatus`／`semanticReason` 明确区分已验证、不可用和未请求。元素语义不可用不会退回到“固定起始窗口”或终止录制。起始窗口读取失败也只留下 warning，只要具体动作具有可验证上下文，actions 仍可为 `ready`。

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

**返回值**

返回 `scriptFile`、`candidateFile`、actions 与脚本 hash、约束、实际采用的完整 `timing`，以及固定的 `verification: "not-run"`。candidate 固定 actions 版本、映射、timing 和环境限制。

**行为与错误**

该方法重新读取并严格校验实际 actions 字节及其固定 raw hash/byte reference，不信任上次调用的内存对象。它重新解析 raw，要求 eventDisposition 完整且唯一，并验证 click/text、source basis、timing 与 raw 事件的确定性归组一致。未知字段、未知动作、非法数值、悬空引用、unsafe ID、空文本、非 `ready` 资格和非 basic mode 均拒绝。输出使用 exclusive create；已存在脚本或 candidate 返回 `WOULD_OVERWRITE`，不会覆盖人工代码。

生成脚本先检查 OS，然后仅发出白名单 `window.list`、`window.getActiveWindow`、`mouse.click`、`keyboard.type`，以及相邻动作间固定的 `sleep` 调用。每个动作在运行时都按录制的可执行文件路径／名称和标题重新解析当前窗口：标题精确匹配可唯一定位时优先采用，否则仅在该应用当前只有一个候选窗口时采用它。录制时的 PID、窗口 ID、窗口序号和原生 handle 永远只作 provenance，不与当前 execution 比较；窗口标题也不是单独的硬门槛。无法唯一解析当前目标才明确拒绝该动作，避免把输入发送给任意同应用窗口。

点击使用当前窗口的新鲜 bounds 加录制时的窗口内偏移，因此允许窗口平移；窗口缩放不会用比例坐标猜测。文本动作会确认刚刚重新解析出的当前窗口确实处于前台，但比较的是本次解析得到的当前窗口身份，不是录制时的 PID 或编号。调用方应在执行前恢复预期的起始桌面和应用状态，不必恢复录制时 PID、窗口编号或屏幕位置。

脚本不导入 Node、不 `eval` actions、不循环解释 actions、不调用 OCR／模型／Skill，也不自动运行。每个非暂停动作间隔都以“前一动作最后事件到后一动作首个事件”的 raw 毫秒差为基准，先除以 `speedMultiplier`，再限制到 `minimumDelayMs..maximumDelayMs`；默认因此保留用户节奏，同时给快速操作至少 500ms 的稳定间隔，并把异常长等待限制为 30 秒。显式 pause/resume 之间的墙钟时间不重放。生成代码在每个 `sleep` 后以内联注释保留原始间隔，resolved timing 同时写入返回值和 `basic-candidate/v3` 元数据，调用方或后续 AI 可在生成时调整策略，也可审核后修改普通 JS。这些 sleep 是可检查的录制时间事实与重放节奏策略，不是目标就绪、加载完成或业务成功条件。

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

raw 使用字符串保存 session sequence 和 native timestamp，避免 JavaScript safe-integer 损失；同时保存 native clock/unit、接收时间、modifier、库事件、坐标验证、输入来源和已知 gap。`manifest.json` 保存可选的起始窗口快照以及与权威 `MOUSE_RELEASED`／文本段起始 `KEY_TYPED` 事件关联的 `inputContexts`；窗口和可选元素语义是动作当时的事实，不写入 raw 事件本身。Recorder 自身的暂停／恢复与 Custom UI 控制点击边界使用 `source: "recorder"`；控制点击边界的 metadata 固定保存 `windowId`、`targetId`、`uiTimestamp` 和 `triggerEventIds`。暂停区间的输入内容不写入 raw。普通 hover `MOUSE_MOVED` 不保存；只在鼠标键按住期间保留 motion／drag 路径供动作判定。默认事件队列 4096、窗口上下文队列 128、上下文新鲜度上限 750ms、writer flush 250ms、backend start/stop deadline 8s、默认 session 15 分钟、最大 30 分钟；这些是有限设计默认值，不是性能实测结论。

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
| `GENERATION_BLOCKED` | actions 仍有关键问题或未知动作 |
| `WOULD_OVERWRITE` | 目标脚本或 candidate 已存在 |
