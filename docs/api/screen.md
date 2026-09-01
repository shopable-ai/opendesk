---
title: Screen API
description: 屏幕信息、显示器枚举、像素读取、截图，以及实验性的 macOS 区域选择与录屏。
order: 5
---

# Screen

Screen 用于读取显示器信息、虚拟桌面范围，以及按坐标取色。现有显示器、像素和截图能力保持
Stable；display mode 读取使用 macOS CoreGraphics，mode mutation、`selectRegion()`、
`startRecording()` 是 macOS Experimental，不会替代现有截图 API、Recorder 或 Audio。

没有另建 `Display` global：`Display.list()` / `Display.getPrimary()` 会与现有 Screen API 重复。
亮度没有同时覆盖 macOS 内置屏和外接屏的统一硬件契约，因此明确为 Unsupported；DDC/CI 或特定
硬件控制应使用 Native Extension。

运行时额外绑定
- `Screen.screenshot = page.screenshot`
- 所以截图能力请优先查看 page.md 中的 `page.screenshot()`

## Screen：方法总表

| 方法 | 用途 |
| --- | --- |
| Screen.getWidth() | 主显示器宽度 |
| Screen.getHeight() | 主显示器高度 |
| Screen.getDisplays() | 列出所有显示器 |
| Screen.getPrimaryDisplay() | 获取主显示器 |
| Screen.getDisplay(index) | 获取指定 index 的显示器 |
| Screen.getVirtualBounds() | 获取整个虚拟桌面边界 |
| Screen.getDisplayCapabilities() | 查询 identity、brightness 和 mode capability |
| Screen.getDisplayMode(displayId) | 读取当前 display mode（macOS） |
| Screen.listDisplayModes(displayId) | 枚举 desktop-usable 标记和 mode metadata（macOS） |
| Screen.setDisplayMode(displayId, modeId) | 同步设置并 readback 验证 mode（macOS Experimental） |
| Screen.pixel(x, y) | 获取单个像素颜色 |
| Screen.pixels(points, scaled) | 批量取色 |
| Screen.screenshot(options) | 等同 page.screenshot |
| Screen.selectRegion(options?) | 打开多显示器原生区域选择器（macOS Experimental） |
| Screen.startRecording(options) | 录制显示器或区域到 `.mov`（macOS Experimental） |
| Screen.getCaptureCapabilities() | 查询录屏、音频和帧流边界 |

## Screen.getWidth()

```js
const width = Screen.getWidth();
```

返回值
- number

## Screen.getHeight()

```js
const height = Screen.getHeight();
```

返回值
- number

## Screen.getDisplays()

签名

```js
const displays = Screen.getDisplays()
```

作用
- 返回所有物理显示器
- 顺序与 `page.screenshot({ displayIndex })` 对齐
- index 为 1-based

返回项示例

```js
{
  index: 1,
  id: '1104977161',
  hardwareId: 'darwin:1970170734:1986622068:0:9',
  isPrimary: true,
  isBuiltin: true,
  vendor: 1970170734,
  model: 1986622068,
  serial: 0,
  unit: 9,
  x: 0,
  y: 0,
  width: 1512,
  height: 982,
  pixelWidth: 3024,
  pixelHeight: 1964,
  scale: 2
}
```

`id` 是当前 WindowServer session 的 `CGDirectDisplayID`；Apple 说明它通常维持到重启。
`hardwareId` 组合公开的 vendor/model/serial/unit，其中显示器没有编码 serial 时可能为 `0`，所以它
是比数组 index 更好的硬件线索，但不是跨机器全局 UUID。`index` 仅表示当前 1-based 顺序。

示例

```js
console.log(JSON.stringify(Screen.getDisplays(), null, 2));
```

## Screen.getPrimaryDisplay()

```js
const display = Screen.getPrimaryDisplay();
console.log(display);
```

## Screen.getDisplay(index)

签名

```js
const display = Screen.getDisplay(index)
```

**参数**

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| index | number | 1-based 显示器编号 |

**注意**
- index <= 0 时返回 null
- 找不到指定编号也返回 null

## Screen.getVirtualBounds()

签名

```js
const bounds = Screen.getVirtualBounds()
```

**返回值**

```js
{ x, y, width, height }
```

**用途**
- 适合多显示器下做全局坐标计算

## Screen.pixel(x, y)

签名

```js
const color = Screen.pixel(x, y)
```

返回值
- 十六进制颜色字符串，例如 `#ffffff`
- 取不到时返回空字符串

示例

```js
console.log(Screen.pixel(100, 100));
```

## Screen.pixels(points, scaled)

签名

```js
const colors = Screen.pixels(points, scaled)
```

**参数**

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| points | array | 点列表，支持 `[x, y]` 或 `{ x, y }` |
| scaled | boolean | 当前保留参数，false 尚未实现特殊换算 |

**返回值**
- `string[]`

**示例**

```js
const colors = Screen.pixels([
  [100, 100],
  { x: 200, y: 200 },
  { x: 300, y: 300 }
], true);

console.log(colors);
```

## Display control 与 mode

```js
const capabilities = Screen.getDisplayCapabilities();
const display = Screen.getPrimaryDisplay();

if (capabilities.modes.read) {
  const current = Screen.getDisplayMode(display.id);
  const modes = Screen.listDisplayModes(display.id);
  console.log({ current, modes });
}
```

`getDisplayMode()` / `listDisplayModes()` 返回：

```js
{
  id: '0:1920x1080:1920x1080:60.000',
  ioModeId: 0,
  width: 1920,
  height: 1080,
  pixelWidth: 1920,
  pixelHeight: 1080,
  refreshRate: 60,
  usableForDesktopGUI: true,
  isCurrent: true
}
```

设置只能使用刚由同一 display 的 `listDisplayModes()` 返回的 `mode.id`。CoreGraphics 调用是同步的，
OpenDesk 随后重新读取 mode；readback 不一致会失败，不返回伪成功。调用方仍必须保存并恢复原 mode：

```js
const display = Screen.getPrimaryDisplay();
const original = Screen.getDisplayMode(display.id);
const alternative = Screen.listDisplayModes(display.id)
  .find((mode) => mode.usableForDesktopGUI && mode.id !== original.id);

if (alternative) {
  try {
    const receipt = Screen.setDisplayMode(display.id, alternative.id);
    console.log(receipt.current);
  } finally {
    Screen.setDisplayMode(display.id, original.id);
  }
}
```

Apple 的公开 [CGDisplaySetDisplayMode](https://developer.apple.com/documentation/coregraphics/cgdisplaysetdisplaymode%28_%3A_%3A_%3A%29)
契约说明进程退出会恢复 Displays 设置中的永久 mode；这不是跳过 `finally` restore 的理由。mirroring
set 可能连带改变其他显示器，自动化必须先检查拓扑并保留原状态。本轮不实现 rotation、sleep、
color profile 或 brightness。

非 macOS 上 mode capability 为 Unsupported；不会执行 shell fallback 或 silent no-op。结构化错误：
`INVALID_ARGUMENT`、`NOT_SUPPORTED`、`NOT_FOUND`、`BACKEND_FAILED`、`READBACK_FAILED`。

## Screen.screenshot(options)

**说明**
- 运行时通过 `Screen.screenshot = page.screenshot` 绑定
- 参数、返回值、错误行为与 `page.screenshot()` 完全一致

**示例**

```js
await Screen.screenshot({
  target: 'screen',
  path: './.runtime/examples/screen.png'
});
```

## Screen.selectRegion(options?) — Experimental

```js
const region = await Screen.selectRegion({
  dimOutside: true,
  movable: true,
  resizable: true,
  minWidth: 24,
  minHeight: 24,
});
```

macOS 会打开真正的 AppKit 多显示器遮罩。拖动创建区域；已有区域可移动并通过 8 个手柄缩放；
`Enter` 确认，`Esc` 取消。一次选择被限制在一个显示器内，避免把一个区域伪装成跨屏统一像素面。

返回的是全局虚拟桌面的逻辑坐标和对应像素尺寸：

```js
{
  x: 120,
  y: 120,
  width: 320,
  height: 240,
  displayId: '1104977161',
  displayIndex: 1,
  scaleFactor: 2,
  pixelWidth: 640,
  pixelHeight: 480
}
```

`minWidth` / `minHeight` 必须是 `24..4096` 的整数。取消会以 `CANCELED` 拒绝 Promise；
不会返回一个看似有效的空区域。

## Screen.startRecording(options) — Experimental

```js
const recording = await Screen.startRecording({
  target: {
    type: 'region',
    displayIndex: region.displayIndex,
    displayId: region.displayId,
    x: region.x,
    y: region.y,
    width: region.width,
    height: region.height,
  },
  fps: 30,
  output: '/absolute/path/to/capture.mov',
  showCursor: true,
});

await sleep(1500);
const result = await recording.stop();
```

当前 macOS backend 是对系统原生 video capture 命令的薄会话 adapter，输出 QuickTime/H.264；
不把连续 PNG 截图拼成视频。当前契约：

- `target.type` 支持 `display` 和 `region`，不宣称 window recording。
- `fps` 只接受 `30`。
- `output` 必须是干净的绝对 `.mov` 路径；父目录已存在且目标文件尚不存在。
- `displayId` 可用于防止选择后显示器拓扑变化造成错录；不匹配时返回 `TARGET_UNAVAILABLE`。
- `stop()` 可重复安全调用；成功结果含 `finalized: true`、时长、字节数和像素尺寸。
- execution teardown 会停止并 finalize 尚未结束的录制，不留下后台录制进程。

录制可能包含敏感屏幕内容。文件只写入调用者指定的本地路径；错误和 Runtime Evidence 不含捕获像素
或系统 helper 输出。macOS 必须已有 Screen Recording 权限，可先使用
`page.checkScreenshotPermissions()` 检查。

## Screen.getCaptureCapabilities()

```js
const capabilities = Screen.getCaptureCapabilities();
```

该方法无 UI 和录制副作用。必须以返回值判断当前平台；不支持时不会 silent no-op。当前明确边界：

- 录屏音频为 `false`。它不复制 `Audio`，也不把未实现的 microphone/system audio 说成可用。
- `frameStream.supported` 为 `false`，状态为 `notImplemented`。低频帧流要等可复用的有界帧 backend，
  不使用截图轮询冒充 streaming。
- Windows/Linux 当前 selector/recording 为 unsupported；原有 Screen 信息、像素和截图契约不变。

## 直接运行区域录屏示例

工作目录必须是仓库根目录。先用当前源码构建根程序，然后运行公开示例：

```bash
go build -o ./opendesk ./cmd/opendesk
./opendesk -script examples/screen-record-region.js -console-mode script
```

普通体验保持为一条启动命令：第二行启动后，用户只需在真实遮罩中拖动区域并按 `Enter`。示例录制
约 1.5 秒，文件写入 `.runtime/tests/platform-primitives/task-006-screen-capture/`，终端仅打印媒体元数据。

## 直接运行 display mode 只读示例

工作目录必须是仓库根目录；先用当前源码构建根程序，然后原样运行：

```bash
go build -o ./opendesk ./cmd/opendesk
./opendesk -script examples/display-modes.js -console-mode script
```

示例只读取 capability、identity、current mode 和 mode count，不改变显示器配置。

## 录屏错误代码

| code | 含义 |
| --- | --- |
| `INVALID_ARGUMENT` | options、区域、fps 或路径不符合契约 |
| `NOT_SUPPORTED` | 当前平台/backend 不支持 |
| `PERMISSION_DENIED` | macOS 拒绝 Screen Recording 权限 |
| `CANCELED` | 用户取消选择或 execution teardown 取消待处理操作 |
| `TARGET_UNAVAILABLE` | 显示器不存在或 identity 已变化 |
| `OUTPUT_FAILED` | 输出存在、父目录无效或媒体文件没有完成 |
| `BACKEND_FAILED` | 原生 helper 或录制进程失败 |
| `TIMEOUT` | 录制未在 teardown/stop 时限内 finalize |

## Screen：实战示例

**示例 1：打印所有显示器并截图第二屏**

```js
const displays = Screen.getDisplays();
console.log(JSON.stringify(displays, null, 2));

await page.screenshot({
  target: 'screen',
  displayIndex: 2,
  path: './.runtime/examples/display-2.png'
});
```

**示例 2：获取某区域关键点颜色**

```js
const points = [
  { x: 100, y: 100 },
  { x: 120, y: 100 },
  { x: 140, y: 100 }
];
console.log(Screen.pixels(points, true));
```
