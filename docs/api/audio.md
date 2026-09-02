---
title: OpenDesk Audio API
description: Inspect and control the default audio device without replacing the existing Sound player.
order: 14
---

# Audio API

**状态：Experimental / macOS CoreAudio**

`Audio` 是系统音频控制 primitive。它负责默认输出音量、mute 和设备发现；旧 `Sound` 继续负责
同步 MP3/WAV 播放，两者没有重复实现播放器。

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
| `Audio.getCapabilities()` | capability | backend、控制读写、设备发现、capture 边界 |

设备对象包含 `id`、`uid`、`name`、`manufacturer`、`transport`、输入/输出 channel 数、alive、
default 标记，以及逐设备 `volume.read/write` 和 `mute.read/write`。设备名和 UID 可能来自用户或
硬件，不应未经审查写入公开日志或 Evidence。

macOS backend 使用 CoreAudio HAL 的默认输入/输出与 device-list 属性。音量使用
`kAudioHardwareServiceDeviceProperty_VirtualMainVolume`，范围固定为 `0..1`；部分 HDMI、数字或
外部设备没有软件 volume/mute property，此时对应 capability 为 false，调用会明确抛出
`NOT_SUPPORTED`，不会模拟音量键或假装写入成功。

## 错误

错误是普通 JavaScript `Error`，并带稳定 `code` 与 `operation`：

| code | 含义 |
| --- | --- |
| `INVALID_ARGUMENT` | volume 不是有限 `0..1` 数值 |
| `NOT_SUPPORTED` | 当前平台/设备没有对应 property 或 property 不可写 |
| `DEVICE_UNAVAILABLE` | 当前没有默认设备，或默认设备在枚举中消失 |
| `BACKEND_FAILED` | CoreAudio HAL 调用或设备元数据解码失败 |
| `READBACK_FAILED` | 写后状态与契约不一致 |

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

## 平台矩阵

| 平台 | control / device discovery | Capture |
| --- | --- | --- |
| macOS CGO build | CoreAudio；本轮实机验证 | Not Implemented |
| macOS non-CGO | Unsupported，明确报错 | Not Implemented |
| Windows / Linux | Unsupported / Not verified；不 silent no-op | Not Implemented |
