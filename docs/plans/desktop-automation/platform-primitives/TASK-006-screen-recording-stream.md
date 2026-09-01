# TASK-006 — Minimal Screen Recording / Region Selector / Frame Stream

Status: DONE
Priority: P1
Depends on: none; audio capture must reuse TASK-004 if present
Plan: `PLAN-screen-capture-region-selector.md`

## Goal

在现有 `Screen` / `page.screenshot` 截图能力之上，补齐自动化框架真正有复用价值的最小连续采集能力：

1. 可交互区域选择 `RegionSelector`；
2. 基础 screen/region recording；
3. 低频 frame stream（用于视觉循环、调试和 Evidence）。

本任务不是开发录屏软件。禁止扩展成视频编辑、直播、完整录屏产品 UI 或第二套 Recorder。

现有自动化 `Recorder` 继续负责 click/type/window/AX 等操作录制与回放；本任务只负责屏幕媒体采集。

## Existing capability first

开始前必须重新审计最新 `master`：

- `Screen.screenshot` / `page.screenshot` 当前实现和权限模型；
- display / window / region 坐标模型；
- FloatingWindow / Custom UI 是否已经能提供透明、无边框、多显示器 overlay；
- Recorder 是否已有视频或帧序列 Evidence；
- macOS Screen Recording 权限；
- TASK-004 是否已提供系统音频/麦克风 capture；
- third_party / integrations 是否已有 ScreenCaptureKit backend。

发现已有能力时必须 EXTEND / INTEGRATE，不创建平行实现。

## macOS backend strategy

macOS 优先使用 Apple `ScreenCaptureKit`，不要通过高频 `screenshot -> PNG -> ffmpeg` 作为正式实现。

开源项目只作为候选 backend / 参考实现，开始编码前重新核验最新版本、License 和集成成本：

- `wulkano/Aperture` — MIT，专门的 macOS recording library，当前版本使用 ScreenCaptureKit；优先评估是否适合作为 thin backend / reference。
- `wulkano/Kap` — MIT，完整录屏应用；适合参考交互和 Aperture 用法，不建议把整个 Electron app 集成进 OpenDesk。
- `pmarais/screenrecorder` — MIT，极简原生 macOS 示例，包含区域拖选、ScreenCaptureKit `sourceRect`、系统音频和麦克风；适合作为小实现参考，但成熟度需自行审计。
- `lihaoyun6/QuickRecorder` — 功能成熟但为 AGPL-3.0；默认仅作架构/行为参考，不复制代码进入 OpenDesk，除非项目明确接受相应 License 影响。
- Flameshot 等截图工具可以参考区域选择交互，但不应为了一个 RegionSelector 引入 Qt 等重依赖。

优先级：

`existing OpenDesk primitive -> Apple native API -> small MIT backend/adapter -> only then custom reimplementation`

## A. Region Selector — 必做

这不是通用“绘画功能”，而是一个小型交互式 Overlay 原语。

推荐公共 API：

```js
const region = await Screen.selectRegion({
  dimOutside: true,
  resizable: true,
  movable: true,
});

// region
// {
//   x, y, width, height,
//   displayId,
//   scaleFactor
// }
```

最小交互：

- 点击后进入全屏/多屏透明 overlay；
- 非选区半透明变暗；
- 鼠标拖动创建矩形；
- 选中后可拖动矩形整体位置；
- 四边/四角 resize handles 可调整宽高；
- 显示当前 `width × height`；
- `Esc` 取消；
- `Enter` 或明确确认动作返回 region；
- 最小宽高限制；
- Retina、多显示器、负坐标正确；
- overlay 在开始录制前隐藏/销毁，不能录进输出视频。

实现上优先复用现有 Custom UI / FloatingWindow 基础设施；如果现有窗口层无法可靠支持多显示器透明 overlay、pointer capture 或高层级输入，再增加最薄的 native AppKit overlay，不要为了这个功能创建通用 Canvas 引擎。

### RegionSelector 的复用场景

该原语不仅服务录屏，还应能复用于：

- `Screen.screenshot({ region })`；
- OCR / Vision 指定区域；
- Image/Color 区域分析；
- Automation Evidence；
- Debug target highlight / manual bounding box selection。

因此 RegionSelector 应保持独立于 recording session，不把它写死在录屏 UI 中。

## B. Minimal Recording — 必做

MVP 只追求“框架可调用、输出可靠”。

候选 API：

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

第一阶段至少支持：

- display recording；
- region recording；
- H.264 + MP4 或平台最稳定等价组合；
- start / stop；
- output path；
- duration / final file metadata；
- execution teardown 自动 stop/finalize；
- 权限拒绝、磁盘错误、target 消失等结构化错误。

`window` target 如果 ScreenCaptureKit / 已有 backend 很容易支持可以一起加入；否则不阻塞 MVP。

## C. Audio — 只复用，不重复

如果 TASK-004 已经提供 system audio / microphone capture，本任务只做组合。

禁止在 TASK-006 再维护第二套公共 Audio capture API。

MVP 录屏允许先只录 video；如果加入 audio，优先支持：

```text
system audio: optional
microphone: optional
```

音量 meter / audio level 如由 TASK-004 提供，Region/Recording UI 可以订阅，不在这里重新实现音频采集系统。

## D. Low-frequency Frame Stream — 自动化价值高，可与录制共享 backend

```js
const stream = Screen.watch({
  target: { type: 'display', index: 0 },
  fps: 2,
});

stream.onFrame(frame => {});
stream.stop();
```

目标是 Vision loop、状态观察和 Evidence，不追求直播级 throughput。

必须有限制：buffer ownership、backpressure、drop policy、CPU/内存上限和 execution teardown。

## Overlay / Drawing 边界

当前不要建立完整 Drawing / Canvas / Annotation API。

如果后续自动化调试确有需要，可以在独立任务中评估非常小的 `Overlay` 能力：

```text
highlightRect(bounds)
highlightPoint(point)
showLabel(bounds, text)
```

但以下均不属于 TASK-006：

- 自由画笔；
- 箭头/椭圆/文字编辑器；
- 截图标注工作台；
- 视频实时涂鸦；
- undo/redo drawing document；
- 完整 Canvas engine。

## 非目标

- 不开发 `apps/screen-recorder` 产品；
- 不做视频编辑器；
- 不做直播平台；
- 不做摄像头画中画；
- 不做滤镜、转场、鼠标特效；
- 不做时间轴；
- MVP 不要求 pause/resume；
- 不重复 screenshot；
- 不重复 automation Recorder；
- 不重复 TASK-004 Audio；
- 不引入完整 Kap / QuickRecorder 应用作为运行时依赖。

## 必须解决

- Retina / scale factor / 多显示器 / 负坐标；
- Screen coordinate 与 ScreenCaptureKit `sourceRect` 的转换；
- overlay 自身不进入 capture；
- window/display/region target 的稳定 identity；
- frame buffer ownership、内存上限和 backpressure；
- FPS 上限和 drop policy；
- execution teardown；
- Screen Recording 权限；
- output finalize；
- 磁盘满/路径不可写；
- target 消失；
- Evidence 文件大小和敏感信息。

## 测试

至少覆盖：

1. `Screen.selectRegion()` 创建矩形；
2. region move；
3. 8-direction resize handles；
4. Esc cancel / confirm；
5. Retina 坐标 readback；
6. 多显示器和负坐标；
7. region recording 输出可播放文件；
8. display recording；
9. stop / execution teardown；
10. 权限拒绝；
11. 输出路径错误；
12. 长时间运行内存不持续增长；
13. screenshot API 无回归；
14. 如实现 stream：低 FPS frame stream + stop/backpressure。

## Evidence

至少保存一条真实 macOS Evidence：

```text
selected region
logical bounds
pixel bounds / scale factor
record target
fps
duration
output path
output file size
video dimensions
playback/readback success
```

不得记录用户屏幕中的敏感文本内容；Evidence 可以使用专门测试页面/测试应用。

## Done

- `Screen.selectRegion()` 可真实交互使用；
- display 或 region recording 至少一种达到可稳定使用，region 为推荐验收路径；
- 输出视频能被系统播放器/探测工具读取；
- 单帧 screenshot 无回归；
- 没有引入第二套 Audio / Recorder / Drawing 系统；
- macOS 有真实 Evidence；
- 不成熟部分明确标记 Experimental；
- 公共 API 变化时同步 docs、types、`runtime-api.ai.json` 和必要 example。

## Execution record — 2026-09-02

Decision: EXTEND

Base HEAD: `7e757fe748392ab6fc794f7e61a5a86e31632765`

Final Commit: this task-closing commit

### Audit

- 现有 `Screen` / `page.screenshot` 已有显示器枚举、logical/pixel 坐标、clip 截图与权限入口；
  Recorder 只录制 action/screenshot Evidence，没有视频 session。没有修改或复制这些能力。
- FloatingWindow 和当前 Custom UI 没有稳定的多显示器全屏透明 overlay、pointer capture 与 8 向 resize
  契约，因此 selector 使用独立的最薄 AppKit helper，而不是扩展 Drawing/Canvas 或第二套 UI runtime。
- TASK-004 只有 CoreAudio volume/mute/device discovery，capture 明确 `notImplemented`；本任务没有创建第二套
  Audio API。MCP、HTTP、Native Extensions、integrations 与 `third_party` 没有现成 recording backend。
- 集成审计：Aperture 当前要求 macOS 13 / Xcode 15，`pmarais/screenrecorder` 当前要求 macOS 14，
  QuickRecorder 为 AGPL-3.0；它们不能作为 macOS 12.7.6 / Xcode CLT 13.1 当前宿主的薄依赖。
  系统 `/usr/sbin/screencapture` 已在本机提供 video/display/region/stop/finalize，因此录制采用该原生
  能力的 session adapter；没有高频 PNG → ffmpeg，也没有复制第三方源码。

### Implementation

- 在既有 `Screen` 对象上新增 Experimental `selectRegion()`、`startRecording()`、
  `getCaptureCapabilities()`；没有新增 Screen/Recorder/Audio 同义公共对象，也没有 MCP/HTTP surface。
- `selectRegion()` 由当前 executable 的隐藏 AppKit helper 承载；main package 在 `init` 阶段锁定
  primordial thread。每个显示器一个 borderless screen-saver-level window，支持 dim outside、创建、
  移动、最小尺寸、8 向 handles、尺寸标签、Enter/Esc 与 logical/pixel/display identity 回传。
- 实窗测试发现完全透明选区会被 WindowServer click-through；选区现绘制不可察觉的 `alpha=0.01`
  hit surface，修复 move/resize 实际落到下层窗口的问题。
- 录制 backend 支持 display/region、30 FPS、cursor option、QuickTime/H.264、显式 output、重复安全 stop、
  header/file metadata 校验与 execution teardown finalize。公共返回值显式 lowerCamel 投影，避免 Go struct
  字段名泄露到 JavaScript。
- EventLoop worker 只传 Go data；Promise settle、session 注册/移除和 state 更新在 Goja loop。Runtime cleanup
  新增 capture worker/pending/session 计数并要求全部归零。
- 输入在触碰 native backend 前严格验证：显示器 identity、单屏 region、绝对 clean non-existing `.mov`、
  已存在父目录、固定 FPS 与结构化错误。错误不包含像素或 helper 输出。

### Tests

- `go test ./automation ./cmd/opendesk ./pkg/execution -run 'ScreenCapture|RegionSelector|RuntimeResourceCounts' -count=1`
  -> PASS；覆盖 options、lowerCamel JS projection、Promise stop、teardown、资源归零、稳定 error code、helper
  路由与 bounded helper output。
- `./scripts/test_runtime_apis.sh unit` -> PASS，387/387；证据：
  `.runtime/tests/runtime-api/20260901T194433Z-97360/`。
- 从仓库根目录按文档构建并原样执行：
  `./opendesk -script examples/screen-record-region.js -console-mode script` -> PASS；在专用 Runtime API Test
  Lab 上选择 600×420 区域，系统 metadata 读回 QuickTime/H.264、600×420、1.7167 秒、106,763 bytes。
- 原生 selector：create、move、bottom-right resize 与 8 个 handles 逐一 drag -> PASS；最终 readback
  `(90,90,380,300)`。安全 fixture 视觉截图确认遮罩、清晰选区、8 handles、尺寸标签、无裁切；Esc ->
  `CANCELED`。
- region recording、display 1920×1080 recording、显式 stop、execution teardown 自动 finalize、12.345 秒
  bounded run、旧 `Screen.screenshot` 64×48 clip 回归 -> PASS。bounded run 的 helper RSS 六次采样为
  21,328..21,508 KiB，没有观察到持续无界增长。
- 单独运行 `./scripts/test_runtime_apis.sh coverage` 会按设计因同一 run-id 缺 contract/live/custom-ui 前序产物
  报全目录 missing；不作为验收结果。正式 unit 自身通过。
- `go test ./...` -> TASK-006 相关 package PASS；`pkg/visionrun` 保持此前同样 4 个无关失败：两个缺 real
  validation input、一个缺 `capture_contract.json`、一个缺当前 preflight report。

### Evidence

- 汇总：`.runtime/tests/platform-primitives/task-006-screen-capture/evidence.json`。
- 安全视觉 fixture：`.runtime/tests/platform-primitives/task-006-screen-capture/selector-safe-fixture.png`。
- 媒体、截图、Runtime logs 与 metadata 全部位于 `.runtime/`，不进入版本控制；汇总不包含捕获像素、
  操作者文本或 helper output。

### API and documentation

- 用户契约：`docs/api/screen.md`；API 地图：`docs/api/index.md`。
- 类型与机器索引：`types/Screen.d.ts`、`docs/api/runtime-api.ai.json`。
- 正式 conformance：`tests/runtime-api/manifest.js`、`tests/runtime-api/unit/screen.test.js`。
- 可复制示例：`examples/screen-record-region.js`。

### Remaining

- `frameStream` 保持 `supported=false / notImplemented`：当前稳定 adapter 不提供可复用 frame buffer；
  使用截图轮询会违反本任务 backend 共享、ownership/backpressure 与禁止高频 PNG pipeline 的约束。
- audio、window target、pause/resume 均不宣称支持；音频未来只能组合 TASK-004 的正式 capture session。
- macOS 当前完成真实 installed-host Runtime Evidence；Windows/Linux selector/recording 明确 unsupported，
  不 silent no-op。多显示器窗口与负坐标/Retina conversion 已在实现和 deterministic tests 覆盖，但当前
  单显示器宿主没有伪装成多屏/Retina live evidence。
