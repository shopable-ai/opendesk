---
title: Audio API
description: Inspect and control the default audio device without replacing the existing Sound player.
order: 14
---

# Audio API

**状态：Experimental / capability-gated native backends**

`Audio` 是系统音频控制 primitive。它负责默认输出音量、mute 和设备发现；旧 `Sound` 继续负责
MP3/WAV 播放，两者没有重复实现播放器。`Audio` 还提供独立的固定声音模式监听：它只在内存中
匹配用户提供的参考音频，不生成录音文件，也不把 PCM 暴露给 JavaScript。

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
  watcher.stop();
  await watcher.wait();
}
```

`source` 必填且不会自动降级：`{type:'system'}` 监听 capability 明确支持的系统输出；
`{type:'process', pid}` 只在 `patternWatch.sources.process.supported` 为 true 时使用。process target
不可用时不会扩大为 system mix，当前平台或 source 不支持则抛出 `NOT_SUPPORTED`。

`references` 是非空数组，每项包含唯一非空 `id` 和本地 `.wav` / `.mp3` 路径。reference 数量、
文件大小、最短/最长时长与并发 watcher 上限必须从 `patternWatch` capability 读取，不应写死到脚本中。
`threshold` 是 `(0,1]` 的有限 matcher 相似度阈值，默认 `0.88`；`cooldownMs` 按 reference 抑制
短时间重复命中，默认 3000ms。所有参数和 reference 文件在开始 capture 或触发权限提示前验证。

只等待一次时使用：

```js
const match = await Audio.waitForSound({
  source: { type: 'system' },
  references: [{ id: 'new-order', path: './sounds/new-order.wav' }],
  timeoutMs: 30000,
});
console.log(match.data.patternId, match.data.confidence);
```

`waitForSound()` 命中后自动回收 watcher；`timeoutMs` 默认为 30000，允许 1..600000，超时 reject
的错误 `code` 为 `TIMEOUT`。持续 watcher 的 `status()` 为 `listening`、`stopping`、`stopped` 或
`failed`。`stop()` 仅在本次调用接受停止状态转换时返回 true；`wait()` 在 native capture、matcher、
callback 和缓冲区全部释放后 resolve：

```json
{
  "id": "audio-watch-1",
  "status": "stopped",
  "stoppedAt": "2026-09-05T10:01:00Z",
  "matches": 1
}
```

callback 保持 single-flight；callback 未完成时只做有界合并，不建立无界队列。callback throw/reject
会以 `CALLBACK_FAILED` 终止 watcher，并进入 execution async-error 路径。watcher 归创建它的
execution 所有，脚本正常结束、异常、取消或 deadline 到达时都会自动 teardown。

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
    "sourceVerified": false,
    "contentIncluded": false
  }
}
```

`confidence` 是 `patternWatch.matcherVersion` 对应 matcher 的相似度，不是订单概率。事件不含 PCM、
频谱、reference 路径、设备名或进程名；`referenceDigest` 只标识已验证的 reference，
`contentIncluded` 固定为 false。采集 PCM 只在有界内存中进入 matcher，停止或失败后立即释放，
不落盘、不上传，也没有 raw-frame callback。`patternWatch.rawAudioExposed` 与
`rawAudioPersisted` 固定为 false。

系统输出监听还可能捕获 OpenDesk 自己播放的提示音。只有 capability 的
`selfPlaybackExclusion` 为 `native` 或经验证的 `runtime-guard` 时，system source 才可报告 supported；
更稳妥的做法是使用真正受支持的 process source，并避免把 callback 中播放的声音选作 reference。

## 错误

错误是普通 JavaScript `Error`，并带稳定 `code` 与 `operation`：

| code | 含义 |
| --- | --- |
| `INVALID_ARGUMENT` | volume 不是有限 `0..1` 数值 |
| `NOT_SUPPORTED` | 当前平台/设备没有对应 property 或 property 不可写 |
| `DEVICE_UNAVAILABLE` | 当前没有默认设备，或默认设备在枚举中消失 |
| `BACKEND_FAILED` | CoreAudio HAL 调用或设备元数据解码失败 |
| `READBACK_FAILED` | 写后状态与契约不一致 |
| `NOT_FOUND` | reference 文件不存在 |
| `UNSUPPORTED_FORMAT` | reference 不是 `.wav` 或 `.mp3` |
| `INVALID_REFERENCE` | reference 无法解码、时长越界或不适合匹配 |
| `PERMISSION_DENIED` | 用户拒绝所选 source 需要的平台权限 |
| `TARGET_GONE` | process source 在启动或监听中消失 |
| `RESOURCE_LIMIT` | reference、watcher 或有界处理队列超过 capability 上限 |
| `CALLBACK_FAILED` | watcher callback throw 或返回的 Promise reject |
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
system source。该命令只是公开运行方式，不代表每台主机或 source 已做实机验证；实际支持状态以
运行时 capability 为准。

## 平台矩阵

| 平台 | control / device discovery | Pattern watch | Recording capture |
| --- | --- | --- | --- |
| macOS CGO build | CoreAudio；本轮实机验证 | 以 `patternWatch.sources` runtime probe 为准 | Not Implemented |
| macOS non-CGO | Unsupported，明确报错 | Unsupported，明确报错 | Not Implemented |
| Windows / Linux | Unsupported / Not verified；不 silent no-op | 未经 capability 声明与平台验证不得使用 | Not Implemented |
