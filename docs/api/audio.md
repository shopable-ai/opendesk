---
title: Audio API
description: Inspect and control the default audio device without replacing the existing Sound player.
order: 14
---

# Audio API

**状态：Audio controls 为 Native；patternWatch 为 Experimental，默认产品 backend Unsupported**

`Audio` 是系统音频控制 primitive。它负责默认输出音量、mute 和设备发现；旧 `Sound` 继续负责
MP3/WAV 播放，两者没有重复实现播放器。`Audio` 还提供独立的固定声音模式监听：它只在内存中
匹配用户提供的参考音频，不生成录音文件，也不把 PCM 暴露给 JavaScript。

> 当前产品默认构建尚未注册可用的系统音频 capture backend：
> `Audio.getCapabilities().patternWatch` 会报告 `supported: false`、`status: 'unsupported'`，
> `Audio.watchSound()` / `Audio.waitForSound()` 会以 `NOT_SUPPORTED` 拒绝。仓库中已有的 matcher、
> backend seam 和注入测试基础不等于 macOS、Windows 或 Linux 的真实系统声音监听已经可用。

```js
const capabilities = Audio.getCapabilities();
if (capabilities.controls.volume.write) {
  const previous = Audio.getVolume();
  try {
    const readback = Audio.setVolume(0.5);
    console.log(readback);
  } finally {
    Audio.setVolume(previous);
  }
}
```

## API

| 方法 | 返回 | 说明 |
| --- | --- | --- |
| `Audio.getVolume()` | `number` | 默认输出设备 virtual-main volume；标量范围 `0..1` |
| `Audio.setVolume(value)` | `number` | 设置标量并返回硬件 readback；硬件可以量化请求值 |
| `Audio.isMuted()` | `boolean` | 读取默认输出 mute |
| `Audio.mute()` / `Audio.unmute()` | `boolean` | 设置并返回 mute readback |
| `Audio.toggleMute()` | `boolean` | 翻转并返回新状态 |
| `Audio.getOutputDevices()` | `AudioDevice[]` | 当前有输出 channel 的设备 |
| `Audio.getInputDevices()` | `AudioDevice[]` | 当前有输入 channel 的设备 |
| `Audio.getDefaultOutput()` | `AudioDevice \| null` | 当前默认输出；不存在时为 `null` |
| `Audio.getDefaultInput()` | `AudioDevice \| null` | 当前默认输入；不存在时为 `null` |
| `Audio.watchSound(options, callback)` | `Promise<AudioSoundWatcher>` | 持续匹配本地固定声音；仅在 capability 支持的 source 上启动 |
| `Audio.waitForSound(options)` | `Promise<AudioPatternMatch>` | 等待首个命中并释放内部 watcher；超时为 `TIMEOUT` |
| `Audio.getCapabilities()` | capability | backend、控制读写、设备发现、pattern watcher 与 capture 边界 |

设备对象包含 `id`、`uid`、`name`、`manufacturer`、`transport`、输入/输出 channel 数、alive、
default 标记，以及逐设备 `volume.read/write` 和 `mute.read/write`。设备名和 UID 可能来自用户或
硬件，不应未经审查写入公开日志或 Evidence。

macOS backend 使用 CoreAudio HAL 的默认输入/输出与 device-list 属性。音量使用
`kAudioHardwareServiceDeviceProperty_VirtualMainVolume`，范围固定为 `0..1`；部分 HDMI、数字或
外部设备没有软件 volume/mute property，此时对应 capability 为 false，调用会明确抛出
`NOT_SUPPORTED`，不会模拟音量键或假装写入成功。

## 固定声音模式监听

这是一个 capability-gated 的 Experimental API，适合把独特的短提示音用作自动化的唤醒线索。
它不能证明业务事实：例如命中电商客户端的订单提示音后，脚本仍须通过业务接口、窗口、UI 或 OCR
确认订单确实存在，不能把 `audio.pattern.matched` 直接解释成 `order.created`。

启动前先检查总 capability 和选定 source：

```js
const patternWatch = Audio.getCapabilities().patternWatch;
if (!patternWatch.supported || !patternWatch.sources.system.supported) {
  console.log('system known-sound watching is unavailable on this host');
} else {
  const watcher = await Audio.watchSound({
    source: { type: 'system' },
    references: [{ id: 'new-order', path: './sounds/new-order.wav' }],
    threshold: 0.88,
    cooldownMs: 3000,
  }, async event => {
    console.log(event.data.patternId, event.data.confidence);
    // 声音只负责唤醒；这里继续核对订单窗口或业务接口。
  });

  console.log(watcher.id, watcher.startedAt, watcher.status());
  // 到这里 watcher 已进入监听。本小段只演示 handle 的停止/等待生命周期；
  // 实际持续监听脚本应在自己的外部停止条件满足后再调用 stop()。
  watcher.stop();
  await watcher.wait();
}
```

`verified` 表示当前进程已完成 backend/source availability probe；它为 false 时所有 source 都必须
保持 unsupported。它不是测试报告或跨机器的 live-evidence 声明。

`source` 必填且不会自动降级：`{type:'system'}` 监听 capability 明确支持的系统输出；
`{type:'process', pid}` 只在 `patternWatch.sources.process.supported` 为 true 时使用。process target
不可用时不会扩大为 system mix，当前平台或 source 不支持则抛出 `NOT_SUPPORTED`。

`references` 是非空数组，每项包含唯一非空 `id` 和本地 `.wav` / `.mp3` 路径。相对路径只按本次
`Execution.workdir` 解析；它不会像 `Sound` 播放路径那样继续搜索可执行文件旁的资源目录。reference 数量、
文件大小、最短/最长时长与并发 watcher 上限必须从 `patternWatch` capability 读取，不应写死到脚本中。
首版 WAV decoder 只接受 1–2 声道、8kHz–384kHz 的 PCM/PCM extensible 8/16/24-bit 文件；MP3
必须通过完整连续的 Layer III frame-chain 预校验，并能由当前内置 decoder 完整解码；不承诺支持每种
MPEG version 或 codec 变体。扩展名命中不代表文件一定可解码。
去除首尾静音后，第一帧到最后一帧可用声音还必须覆盖至少 100ms；极短 click 外包一段静音不会成为
可靠 reference。
`threshold` 是 `(0,1]` 的有限 matcher 相似度阈值，默认 `0.88`；`cooldownMs` 是
`0..600000` 的整数，按 reference 抑制短时间重复命中，默认 3000ms。`startupTimeoutMs` 是
`1..60000` 的整数，默认为 10000，是覆盖 reference 文件读取/解码、
matcher 准备、权限和 native backend 启动的协作式 setup deadline；阻塞中的 OS 文件 I/O 可能延迟
deadline 的观察，Promise 也要等有界 Stop/Wait 清理尝试后才 settle，因此它不是严格的墙钟完成上限。
所有参数和 reference 文件在开始 capture 或触发权限提示前验证。

`patternWatch` capability 还公开 `platform`、`backend`、`verified`、`permission`、逐 source 支持状态、
格式与资源上限、`matcherVersion`、`selfPlaybackExclusion`，以及固定为 false 的
`rawAudioExposed` / `rawAudioPersisted`。成功创建的 watcher 句柄包含只读的 `id`、`backend`、
`startedAt`、`sourceScope` 和 `sourceVerified`，并提供 `status()`、`stop()`、`wait()`。
成功启动的 watcher 中 `sourceVerified` 固定为 true：它只证明本次 stream 保留了请求的 system-mix
或 process scope；system-mix 仍不能证明声音来自某个特定应用。

只等待一次时使用：

```js
const match = await Audio.waitForSound({
  source: { type: 'system' },
  references: [{ id: 'new-order', path: './sounds/new-order.wav' }],
  timeoutMs: 30000,
});
console.log(match.data.patternId, match.data.confidence);
```

`waitForSound()` 命中后自动回收 watcher；只有“首个命中 + capture 成功停止并释放”才 resolve，
停止失败会以稳定的 backend error reject，不能把仍未确认释放的采集会话当作成功。`timeoutMs` 默认为
30000，允许 1..600000，从 setup 成功、进入 listening 后开始计时；它不是整次调用（setup + listen）
的总时限。超时 reject 的错误 `code` 为 `TIMEOUT`。match、backend error 与 timeout
由各自 producer 首次成功写入的原子 one-shot signal 仲裁；真正并发时不按 `CapturedAt` 或 EventLoop
callback 的执行顺序事后改判。

持续 watcher 的 `status()` 为 `listening`、`stopping`、`stopped` 或
`failed`。`stop()` 仅在本次调用接受停止状态转换时返回 true；`wait()` 在有界 Stop/Wait 尝试结束、
matcher worker 停止且不再投递新 callback 后 resolve。只有 `status:'stopped'` 确认 session 已释放；
`status:'failed'` 可能把最终 native cleanup 留给 execution teardown。它不会等待或取消调用 `stop()`
前已经进入执行的 callback Promise，因此 callback 可以在 `wait()` resolve 后才 settle：

```json
{
  "id": "audio-watch-1",
  "status": "stopped",
  "stoppedAt": "2026-09-05T10:01:00Z",
  "matches": 1
}
```

正常的 `status:'stopped'` 表示该 session 的 native handle 与 worker 已完成 join；若 Stop/Wait 无法在
内部清理期限内确认释放，结果为 `status:'failed'` 并包含稳定错误，backend 仍由 execution teardown
负责最终 Close/Wait，不能把该结果当成释放成功。

callback 保持 single-flight；callback 未完成时只做有界合并，不建立无界队列。watcher 仍在监听时，
callback throw/reject 会以 `CALLBACK_FAILED` 终止 watcher，并进入 execution async-error 路径。若
`stop()` 已接受停止，先前已经进入执行的 callback Promise 随后 reject，在 execution 尚未 teardown
时仍进入 async-error 路径，但不会把 watcher 的 `stopped` 终态改为 `failed`，也不会延迟
`wait()`。watcher 归创建它的 execution 所有，脚本正常结束、异常、取消或 deadline 到达时都会
自动 teardown。

### Match envelope

```json
{
  "schemaVersion": 1,
  "type": "audio.pattern.matched",
  "backend": "platform-backend",
  "timestamp": "2026-09-05T10:00:00Z",
  "sequence": 1,
  "coalesced": 0,
  "data": {
    "watchId": "audio-watch-1",
    "patternId": "new-order",
    "confidence": 0.93,
    "startOffsetMs": 4200,
    "endOffsetMs": 5100,
    "referenceDigest": "sha256:example",
    "sourceScope": "system-mix",
    "sourceVerified": true,
    "contentIncluded": false
  }
}
```

`confidence` 是 `patternWatch.matcherVersion` 对应 matcher 的相似度，不是订单概率。事件不含 PCM、
频谱、reference 路径、设备名或进程名；`referenceDigest` 只标识已验证的 reference，
`contentIncluded` 固定为 false。采集 PCM 只在有界内存中进入 matcher，停止或失败后立即释放，
不落盘、不上传，也没有 raw-frame callback。`patternWatch.rawAudioExposed` 与
`rawAudioPersisted` 固定为 false。

`startOffsetMs` / `endOffsetMs` 从该 watcher 接收的第一帧 PCM 起单调累计。backend 报告 drop 或
discontinuity 时 matcher 会在下一段音频前 reset，避免跨缺口误报，但 offset 不回退；backend 未交付的
dropped samples 不计入 offset。`timestamp` 采用包含命中的 PCM chunk 的 `CapturedAt`（backend 必须把它
定义为 chunk 首样本时间），缺失时才使用 Runtime 当前时间。

系统输出监听还可能捕获 OpenDesk 自己播放的提示音。当前 Runtime 尚未实现 suppression window，
因此只有 capability 的 `selfPlaybackExclusion` 为 `native` 时，system source 才可报告 supported；
`runtime-guard` 是为未来经测试的实现保留的契约值，在实现前会被降为 `unavailable`。
更稳妥的做法是使用真正受支持的 process source，并避免把 callback 中播放的声音选作 reference。

## 错误

错误是普通 JavaScript `Error`，并带稳定 `code` 与 `operation`：

capture backend 的原始系统错误文本不会透传到 JavaScript，避免泄露用户命名的设备、路径、PID 或
进程元数据；公开消息由 Runtime 按稳定 code 生成。

| code | 含义 |
| --- | --- |
| `INVALID_ARGUMENT` | 参数类型、字段或范围无效；例如 volume 不在 `0..1`、source/reference/options 不合法 |
| `NOT_SUPPORTED` | 当前平台/设备不支持对应控制，或所选 pattern capture backend/source 不可用 |
| `DEVICE_UNAVAILABLE` | 当前没有默认设备，或默认设备在枚举中消失 |
| `BACKEND_FAILED` | 平台音频控制、capture session 或 backend lifecycle 调用失败 |
| `READBACK_FAILED` | 写后状态与契约不一致 |
| `NOT_FOUND` | reference 文件不存在 |
| `UNSUPPORTED_FORMAT` | reference 不是 `.wav` 或 `.mp3` |
| `INVALID_REFERENCE` | reference 无法解码、时长越界或不适合匹配 |
| `PERMISSION_DENIED` | 用户拒绝所选 source 需要的平台权限 |
| `TARGET_GONE` | process source 在启动或监听中消失 |
| `RESOURCE_LIMIT` | reference、watcher 或有界处理队列超过 capability 上限 |
| `CALLBACK_FAILED` | watcher callback throw 或 Promise reject；监听中会使 watcher failed，stop 后的 late rejection 只进入 async-error |
| `TIMEOUT` | watcher startup 或 `waitForSound()` 超时 |
| `CANCELED` | execution teardown 取消 watcher 或等待 |

## Sound compatibility

`Sound.playSuccess()`、`Sound.playFail()`、`Sound.playWarning()`、`Sound.playError()`、
`Sound.playCaptcha()`、`Sound.playSound(path)` 和 `Sound.play(path)` 原样保留。它们仍是同步、
等待播放结束的 Secondary API。长音频的非阻塞控制由 `Sound.start(path, options)` /
`Sound.playAsync(path, options)` 及其 `SoundPlayback` 句柄提供；`Audio` 不复制这套播放器。
因此 `Audio.getCapabilities().playback.blocking` 只描述旧兼容方法，`nonBlocking` 和
`controllable` 描述新的 Sound 会话接口。

## Capture 与默认设备切换

- `Audio.recordMicrophone()` / `recordSystemAudio()` / `stopRecording()` 尚未公开；capability 明确为
  `supported=false, status=notImplemented`。
- `patternWatch` 是独立的只检测 capability。即使它 supported，也不改变上述 recording capability，
  不表示 JavaScript 可以读取或保存系统音频。
- 麦克风 capture 需要 app-owned usage description、授权与 execution teardown；不能从 plain CLI
  假装安全支持。
- system audio capture 属于 ScreenCaptureKit 录屏权限、stream 与输出 artifact 生命周期，应由
  TASK-006 的 recording backend 组合，不在 Audio control 内再造第二套录制会话。
- 本轮不提供 `setDefaultOutput()`。设备切换是单独的系统副作用，需要跨平台 policy、热插拔与
  rollback 设计；不能只为接口对称强行暴露。
- `Audio` global 在 macOS、Windows 与 Linux 均存在；不支持的控制或 pattern source 必须通过
  capability 与稳定 `NOT_SUPPORTED` fail closed，不能通过隐藏 namespace 制造平台差异。

## 可复制真实 smoke

工作目录必须是仓库根目录。脚本会短暂改变音量与 mute、逐项 readback，并在所有路径恢复原始
状态；Evidence 不含设备 name/UID：

```bash
go run ./cmd/opendesk -script examples/audio/control-smoke.js -console-mode script
```

Evidence：

```text
.runtime/tests/platform-primitives/task-004-audio/control-smoke.json
```

## 可复制固定声音监听示例

工作目录必须是仓库根目录。示例先检查 `patternWatch` 与 source capability；支持时监听
`OPENDESK_AUDIO_REFERENCE` 指定的本地参考音频，未设置时使用 `./public/ding.mp3`。请从另一个应用
触发相同的短提示音；示例不会自行播放 reference，以免制造自触发循环：

```bash
OPENDESK_AUDIO_REFERENCE=/absolute/path/to/new-order.wav ./dist/opendesk -script examples/audio/watch-known-sound.js -console-mode script
```

若 backend 支持 process source，可额外设置正整数 `OPENDESK_AUDIO_PROCESS_PID`；不设置则显式选择
system source。当前默认产品 backend 尚未实现，因此该示例会在 capability 检查处明确 skip；它仅
验证 fail-closed 的公开运行方式，不能作为真实监听通过的证据。未来平台 backend 接入后，实际支持
状态仍以运行时 capability 与对应平台 live evidence 为准。

面向用户的可复制 smoke 版本会写入脱敏 Evidence，并在当前 source 不支持时明确 skip；它同样不会播放
reference：

```bash
OPENDESK_AUDIO_REFERENCE=/absolute/path/to/new-order.wav ./dist/opendesk -script examples/audio/pattern-watch-smoke.js -console-mode script
```

Evidence：

```text
.runtime/tests/platform-primitives/task-016-audio-pattern-watcher/pattern-watch-smoke.json
```

这个 `examples/` 脚本是平台用户侧 smoke，不注入 memory backend；注入式 deterministic fixture 仍由
`tests/runtime-api/seams/` 与 Go execution harness 验证。

## 平台矩阵

| 平台 | control / device discovery | Pattern watch | Recording capture |
| --- | --- | --- | --- |
| macOS CGO build | CoreAudio；本轮实机验证 | 默认产品 backend 未实现；Unsupported | Not Implemented |
| macOS non-CGO | Unsupported，明确报错 | Unsupported，明确报错 | Not Implemented |
| Windows / Linux | Unsupported / Not verified；不 silent no-op | 默认产品 backend 未实现；未经平台 live evidence 不得标记支持 | Not Implemented |
