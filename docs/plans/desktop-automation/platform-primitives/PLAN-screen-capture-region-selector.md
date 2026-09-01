# OpenDesk Minimal Screen Capture / Region Selector Plan

Status: ACTIVE PLAN
Execution task: `TASK-006-screen-recording-stream.md`
Related task: `TASK-004-audio.md`

## 1. Objective

为 OpenDesk 补齐自动化框架层真正有复用价值的最小屏幕媒体能力，而不是开发独立录屏软件。

本计划只覆盖：

1. 交互式区域选择；
2. 最小 screen / region recording；
3. 低频 frame stream；
4. 与已有 Audio capture 的组合；
5. 可复用于截图、Vision、OCR、Evidence、Debug 的 Overlay/Region 基础原语。

不建设完整 Drawing、视频编辑、直播、时间轴或录屏产品 UI。

## 2. Why this belongs in OpenDesk

OpenDesk 已经拥有单帧 screenshot、Vision/OCR、Recorder、FloatingWindow/Custom UI 等能力，但自动化框架仍需要两个基础缺口：

- 从用户屏幕上可靠取得一个可调整的矩形区域；
- 对 display / region 做连续采集并生成简单视频或帧流。

区域选择不仅服务录屏，还可复用于：

```text
Screenshot
OCR
Vision
Image/Color
Evidence
Recorder target selection
Agent manual bounding box
Debug highlight
```

因此 `RegionSelector` 是独立的平台 primitive，而不是录屏软件专用 UI。

## 3. Scope boundary

### In scope

```text
Screen.selectRegion()
Screen.startRecording()
Recording.stop()
Screen.watch()
```

可选组合：

```text
system audio
microphone
```

但 Audio capture 必须复用 `TASK-004-audio.md` 的实现，不能在 Screen 模块再造一套。

### Out of scope

```text
完整录屏软件
视频编辑器
直播
摄像头画中画
时间轴
滤镜/转场
鼠标特效
自由画笔
箭头/椭圆/文字编辑器
马赛克
undo/redo drawing document
完整 Canvas engine
```

## 4. Architecture

推荐结构：

```text
JS API
│
├── Screen.selectRegion()
│       ↓
│   RegionSelector / Overlay
│       ↓
│   Custom UI / FloatingWindow
│       ↓ fallback when insufficient
│   thin native AppKit overlay
│
├── Screen.startRecording()
│       ↓
│   Recording Session
│       ↓
│   Capture Backend
│       ↓
│   macOS ScreenCaptureKit
│
└── Screen.watch()
        ↓
    shared capture backend
        ↓
    bounded frame queue
```

Audio：

```text
TASK-004 Audio Capture
        ↓
Recording Session composition
```

禁止：

```text
Screen module -> second microphone implementation
Screen module -> second system-audio implementation
Screen module -> second automation Recorder
```

## 5. Backend strategy

### macOS default

优先 Apple `ScreenCaptureKit`。

正式实现不要采用：

```text
high-frequency screenshot
→ PNG files
→ ffmpeg stitch
```

作为默认录屏 backend。

### Reuse / integration order

```text
Existing OpenDesk primitive
→ Apple native API
→ small MIT backend / adapter
→ custom implementation only when necessary
```

编码前重新核验候选项目最新版本与 License：

- `wulkano/Aperture`：MIT，优先审计 thin backend / reference；
- `wulkano/Kap`：MIT，只参考完整产品交互和 Aperture 使用方式，不集成整个 Electron app；
- `pmarais/screenrecorder`：MIT，小型原生 ScreenCaptureKit 示例，可参考区域选择、sourceRect、音频组合；
- `lihaoyun6/QuickRecorder`：AGPL-3.0，默认只作架构/交互参考，不复制代码；
- Flameshot 等截图工具：只参考 selection UX，不为此引入 Qt 等重依赖。

## 6. Phase 0 — Existing capability audit

实现前必须重新读取最新 `master`，检查：

- `Screen.screenshot` / `page.screenshot`；
- display / virtual bounds / scale factor；
- FloatingWindow / Custom UI；
- macOS permission helpers；
- Recorder Evidence；
- TASK-004 Audio；
- `third_party` / integrations；
- 最近 commits。

决策：

```text
IMPLEMENT
EXTEND
INTEGRATE
SKIP_EXISTING
```

发现已有能力时优先复用，不创建同义系统。

## 7. Phase 1 — RegionSelector MVP

### API

```js
const region = await Screen.selectRegion({
  dimOutside: true,
  movable: true,
  resizable: true,
});
```

返回统一逻辑坐标：

```js
{
  x,
  y,
  width,
  height,
  displayId,
  scaleFactor
}
```

### Interaction

最小体验：

1. 调用后显示透明多屏 overlay；
2. 选区外半透明变暗；
3. 鼠标 drag 创建矩形；
4. 可拖动矩形整体移动；
5. 四角 + 四边共 8 个 resize handles；
6. 实时显示 `width × height`；
7. `Esc` 取消；
8. `Enter` 或确认动作提交；
9. 最小宽高限制；
10. 返回前隐藏/销毁 overlay。

### Coordinate requirements

必须正确处理：

```text
Retina scale factor
multiple displays
negative virtual coordinates
display boundaries
logical coordinate vs pixel coordinate
```

### Implementation decision

优先复用 Custom UI / FloatingWindow。

只有在现有窗口基础设施无法可靠支持：

```text
multi-display transparent overlay
high window level
pointer capture
resize handles
keyboard cancel/confirm
```

时，才新增最薄 AppKit native overlay。

不要因此创建通用 Canvas/2D drawing engine。

## 8. Phase 2 — Minimal Recording MVP

### API

```js
const recording = await Screen.startRecording({
  target: {
    type: 'region',
    x: region.x,
    y: region.y,
    width: region.width,
    height: region.height,
    displayId: region.displayId,
  },
  fps: 30,
  output: '/tmp/opendesk-recording.mp4',
});

const result = await recording.stop();
```

### Required target support

MVP：

```text
display
region
```

`window` 如果 ScreenCaptureKit backend 很容易支持则一起实现，否则不阻塞 MVP。

### Required recording behavior

至少：

```text
start
stop
output path
fps
final duration
file size
video dimensions
execution teardown finalize
```

输出优先：

```text
H.264 + MP4
```

或平台上稳定度更高的等价组合。

MVP 不要求 pause/resume。

## 9. Phase 3 — Audio composition

如果 `TASK-004` 已实现：

```text
system audio capture
microphone capture
level meter
```

则 Recording 只做组合配置：

```js
audio: {
  system: true,
  microphone: false,
}
```

如果 TASK-004 尚未提供稳定 Audio capture：

第一版 Recording 可以只支持 video。

不要为了 TASK-006 完成度而复制 Audio backend。

## 10. Phase 4 — Low-frequency frame stream

用于 Automation / Vision，而不是直播。

```js
const stream = Screen.watch({
  target: { type: 'display', index: 0 },
  fps: 2,
});

stream.onFrame(frame => {});
stream.stop();
```

必须：

```text
bounded queue
backpressure
drop policy
CPU limit
memory limit
execution teardown
```

默认 FPS 应保守。

## 11. Optional future Overlay primitive

不要在本阶段建设 Drawing。

如果 RegionSelector 证明 Overlay 基础设施对自动化调试非常有价值，未来可以单独评估：

```js
Overlay.highlightRect(bounds)
Overlay.highlightPoint(point)
Overlay.showLabel(bounds, text)
Overlay.clear()
```

其目标是 Agent / OCR / Accessibility / Recorder 调试可视化，不是绘画软件。

## 12. Failure model

至少提供结构化错误：

```text
SCREEN_PERMISSION_DENIED
REGION_SELECTION_CANCELLED
INVALID_REGION
TARGET_NOT_FOUND
TARGET_DISAPPEARED
OUTPUT_PATH_INVALID
OUTPUT_NOT_WRITABLE
DISK_FULL
RECORDING_START_FAILED
RECORDING_FINALIZE_FAILED
FRAME_STREAM_OVERFLOW
UNSUPPORTED_PLATFORM
```

不能 silent fallback。

## 13. Testing matrix

### Region selector

- 创建 selection；
- move；
- 8-direction resize；
- Esc cancel；
- confirm；
- 最小尺寸；
- Retina；
- 多显示器；
- 负坐标；
- overlay 不进入 capture。

### Recording

- region recording；
- display recording；
- start/stop；
- output file readable；
- video dimensions 与 region 对应；
- execution teardown；
- permission denied；
- invalid output path；
- disk/write error；
- long-running memory stability。

### Frame stream

- low FPS stream；
- stop；
- backpressure；
- target disappeared；
- long-running bounded memory。

### Regression

- screenshot 无回归；
- Recorder 无回归；
- Audio 无重复实现；
- `go test ./...` 不产生新增失败。

## 14. Evidence

至少一份真实 macOS Evidence：

```text
OS / display
selected logical bounds
pixel bounds
scale factor
record target
fps
start/stop result
duration
output path
file size
video width/height
playback/readback success
```

使用专门测试页面或测试应用，避免保存用户敏感屏幕内容。

## 15. Definition of Done

本计划第一阶段完成条件：

- `Screen.selectRegion()` 真实可用；
- 选区可以创建、移动、resize、取消、确认；
- 至少 region 或 display recording 可稳定输出可播放视频，优先 region；
- Recording 正确处理 teardown/finalize；
- screenshot 无回归；
- 没有新增第二套 Recorder / Audio / Drawing 系统；
- macOS 有真实 Evidence；
- 公共 API 同步 docs、types、`runtime-api.ai.json`；
- 不成熟能力明确保持 Experimental。

## 16. Execution order

```text
Audit existing implementation
→ RegionSelector
→ region screenshot reuse validation
→ ScreenCaptureKit backend
→ region recording
→ display recording
→ optional Audio composition
→ low-frequency frame stream
→ regression
→ Evidence
→ docs/types
```

不要反过来先开发完整录屏 backend，再补区域选择。

## 17. Execution source of truth

本文件负责范围与架构规划。

真正执行和状态维护使用：

`TASK-006-screen-recording-stream.md`

Codex 连续执行时仍按照：

`CODEX-EXECUTION-GOAL.md`

的 Existing Capability First / Evidence First / 单任务独立 commit 规则执行。
