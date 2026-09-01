# TASK-004 — Audio / Sound Completion

Status: DONE
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

## Execution record — 2026-09-02

Decision: EXTEND

Base HEAD: `2bffdbecdae5a80de6710fc925c019c59258322e`

Final Commit: this task-closing commit

### Audit

- `automation/sound.go` 与 JS `Sound` 已完整提供同步 MP3/WAV 和预置提示音播放；本任务没有修改、
  包装或复制该播放器。
- 仓库此前没有公共 `Audio`、CoreAudio backend、精确音量 read/write/readback、mute state 或输入/
  输出/default 设备枚举。robotgo 只有音量键模拟，无法读取标量、辨认设备或证明 postcondition，
  因此不作为 backend。
- MCP、HTTP、Recorder、Scheduler、FloatingWindow、Native Extension 与 third_party 没有可复用的
  音频控制/capture 会话。公开 Audio 只进入 JavaScript Runtime，没有为接口数量增加 MCP/HTTP。
- 当前 `OpenDesk.app` / CLI 构建没有 microphone usage description / entitlement；system audio 又与
  ScreenCaptureKit 的 screen-recording permission、stream、artifact 和 TASK-006 生命周期耦合。

### Implementation

- 新增实验性 JS 全局 `Audio`：`getVolume`、`setVolume`、`isMuted`、`mute`、`unmute`、
  `toggleMute`、输入/输出/default 设备查询与 `getCapabilities`。
- macOS CGO backend 直接使用 CoreAudio HAL；默认输出音量使用 virtual-main scalar，公共范围固定
  `0..1`，所有写操作返回真实硬件 readback。设备没有软件 property 或 property 不可写时明确
  `NOT_SUPPORTED`，不模拟媒体键、不 silent no-op。
- 每次调用重新解析当前 device/default property，不缓存会被热插拔淘汰的设备引用。默认设备
  不存在时查询返回 `null`；设备枚举返回 channel、alive、default 与逐设备 control capability。
- 错误带稳定 `code` / `operation`：`INVALID_ARGUMENT`、`NOT_SUPPORTED`、
  `DEVICE_UNAVAILABLE`、`BACKEND_FAILED`、`READBACK_FAILED`；诊断不含设备 name/UID。
- `Audio` 加入 Native Extension reserved namespace，避免插件 manifest 覆盖新的 Runtime global。
- macOS non-CGO 与非 macOS backend 明确 unavailable；没有制造假的跨平台支持。
- 旧 `Sound` 继续同步等待播放完成。本任务不改变其 blocking 兼容语义，也不再造非阻塞播放器。

### Capture and default-device decision

- `recordMicrophone`、`recordSystemAudio`、`stopRecording` 不公开；capability 为
  `supported=false, status=notImplemented`，没有把未授权/未实现路径写成 Experimental success。
- microphone capture 等 app-owned usage description、permission、timeout、output artifact 与
  execution teardown 具备后再独立进入；system audio 由 TASK-006 recording backend 通过
  ScreenCaptureKit 组合，避免第二套 capture session。
- 不增加 `setDefaultOutput()`：系统默认设备切换需要跨平台 policy、热插拔和 rollback 设计，当前
  没有足够产品依据为 API 对称而扩大副作用 surface。

### Tests

- `go test ./automation -run '^TestAudio' -count=1` -> PASS；覆盖 scalar 边界、写后 readback、
  mute/unmute/toggle、device/default projection、默认设备缺失、capability、结构化 JS error 和
  backend error code。
- `go test ./automation -run '^TestDarwinAudioDeviceEnumerationMetadataDecodes$' -count=1` -> PASS；
  真实 CoreAudio device JSON boolean/channel metadata 可解码。
- `go test ./automation ./pkg/nativeextension` -> PASS；包含原有 Sound 回归和 `Audio` namespace
  collision gate。
- `./scripts/test_runtime_apis.sh unit` -> PASS；11 个 Audio contract、capability behavior、非法音量
  fail-before-side-effect，以及旧 Sound unit 全部通过。证据位于
  `.runtime/tests/runtime-api/20260901T184707Z-19959/`。
- `go test ./...` -> Audio 相关 package PASS；`pkg/visionrun` 仍是本 Goal 审计前已有的 4 个
  非本任务失败：两个缺 real validation input、一个缺 `capture_contract.json`、一个缺当前
  preflight report。本任务未修改该 package，未新增全仓失败。
- `CGO_ENABLED=0 go test ./automation -run '^TestAudio'` 无法进入 Audio test：仓库既有
  `oto` 与 robotgo 包在 macOS non-CGO 下本身缺 driver/symbol。Audio 已提供明确 non-CGO stub，
  但本轮不把修复整个 automation 非 CGO 构建扩成 Audio 任务范围。

### Evidence

- 从仓库根目录原样执行：
  `go run ./cmd/opendesk -script examples/audio/control-smoke.js -console-mode script` -> PASS。
- 平台：macOS 12.7.6 / amd64；backend：`coreaudio`；枚举到 2 个输出和 2 个输入设备。
- volume：`0.1875503808259964` -> 请求 `0.2875503808259964` -> 硬件 readback
  `0.28668856620788574` -> 恢复 `0.1875503808259964`。
- mute：`false` -> `true` readback -> 恢复 `false`。
- Evidence：`.runtime/tests/platform-primitives/task-004-audio/control-smoke.json`；只记录数值、数量、
  transport/channel/capability，明确 `deviceNamesOrUIDsRecorded=false`。
- 第一次 smoke 在任何控制写入前发现 Objective-C boolean 被序列化成 `0/1`；修正为显式
  `numberWithBool` 并增加原生枚举回归后，同一公开命令通过。

### API and documentation

- 类型：`types/Audio.d.ts`；旧 `types/Sound.d.ts` 不变。
- 文档：`docs/api/audio.md`、`docs/api/sound.md` 链接，以及 API README/index。
- 机器索引：`docs/api/runtime-api.ai.json` 与 `tests/runtime-api/manifest.js`。
- 可复制示例：`examples/audio/control-smoke.js`。

### Remaining

- Audio 状态保持 Experimental；本轮 live evidence 仅证明当前 macOS/CoreAudio 宿主，Windows、
  Linux 和 macOS non-CGO 没有声称 live verified。
- 部分数字/HDMI/外部设备合法地没有 software volume/mute；调用者必须先看 capability。
- 设备 UID/name 是用户/硬件元数据；公共 API 为设备选择可返回，但日志与 Evidence 必须审查。
- Capture 和默认设备切换按上述边界留给独立后续任务，不影响 P0 control 完成。
