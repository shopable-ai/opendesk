# TASK-004 — Audio / Sound Completion

Status: TODO
Priority: P0/P1
Depends on: none

## Goal

把当前仅负责 MP3/WAV 播放和提示音的 `Sound` 能力重新审计并补齐为适合桌面自动化的最小 Audio Primitive，同时保持旧 `Sound.playSuccess()` 等接口兼容。

## 当前已知

当前 `Sound` 已存在并支持：

```text
playSuccess
playFail
playWarning
playError
playCaptcha
playSound(path)
play(path)
```

因此本任务禁止重新实现一个重复的播放器。

## 第一阶段：P0 Audio Control

优先评估并实现：

```js
Audio.getVolume()
Audio.setVolume(value)
Audio.isMuted()
Audio.mute()
Audio.unmute()
Audio.toggleMute()
Audio.getOutputDevices()
Audio.getInputDevices()
Audio.getDefaultOutput()
Audio.getDefaultInput()
```

是否支持 `setDefaultOutput()` 必须根据平台 API、权限和稳定性审计后决定，不能为了接口完整度强行实现。

## 第二阶段：P1 Capture

在不引入过重依赖的前提下评估：

```js
Audio.recordMicrophone(options)
Audio.recordSystemAudio(options)
Audio.stopRecording(id)
```

必须分别处理麦克风权限和系统音频捕获权限/平台限制。

## Sound 兼容策略

- 旧 `Sound.*` 保留为 Secondary convenience API。
- 新能力不要全部硬塞进旧 `Sound`，优先形成职责更明确的 `Audio`。
- 如果最终决定仍使用 `Sound`，必须在 ADR/任务报告中解释原因。

## 必须解决

- 非阻塞播放与当前阻塞播放的兼容策略。
- volume 范围与单位统一。
- 默认设备不存在/设备热插拔。
- 权限、timeout、取消。
- 音频 capture 文件格式与输出路径。
- execution teardown 自动停止录制。

## 非目标

- 不做音乐播放器。
- 不做复杂音频编辑、混音、转码工作站。
- 不在 Core 内构建 Speech-to-Text；STT 可作为上层 provider。

## 测试

至少覆盖：

1. 原有 Sound 回归。
2. volume read/write/readback。
3. mute/unmute。
4. device enumeration。
5. 无设备/权限异常。
6. 如实现 capture：开始、停止、超时、execution teardown、输出文件验证。

## Done

- 不破坏旧 Sound API。
- macOS 真实 evidence 可证明 control 生效。
- Capture 若尚不成熟，应明确保持 Experimental/Not Implemented，禁止文档夸大。
- 文档、类型、机器索引同步。
