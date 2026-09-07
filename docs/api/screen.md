---
title: Screen API
description: 屏幕信息、显示器枚举、像素读取、截图，以及实验性的 macOS 区域选择与录屏。
order: 5
---

# Screen

`Screen` 提供显示器信息、虚拟桌面范围、像素读取与截图。Display mode mutation、`selectRegion()`、`startRecording()` 为 **Experimental**；不会替代 Recorder、Audio 或现有截图 API。

`Screen.screenshot` 是 `page.screenshot` 的 alias。

## API 一览

| 方法 | 状态 | 用途 |
| --- | --- | --- |
| `Screen.getWidth()` | Stable | 主显示器宽度。 |
| `Screen.getHeight()` | Stable | 主显示器高度。 |
| `Screen.getDisplays()` | Stable | 列出所有显示器。 |
| `Screen.getPrimaryDisplay()` | Stable | 返回主显示器。 |
| `Screen.getDisplay(index)` | Stable | 按 1-based index 返回显示器。 |
| `Screen.getVirtualBounds()` | Stable | 返回虚拟桌面边界。 |
| `Screen.getDisplayCapabilities()` | Stable | 查询 display identity/mode/brightness 能力。 |
| `Screen.getDisplayMode(displayId)` | Stable/平台限定 | 读取当前 display mode。 |
| `Screen.listDisplayModes(displayId)` | Stable/平台限定 | 枚举可用 display modes。 |
| `Screen.setDisplayMode(displayId, modeId)` | Experimental | 设置并 readback 验证 display mode。 |
| `Screen.pixel(x, y)` | Stable | 读取单个屏幕像素。 |
| `Screen.pixels(points, scaled?)` | Stable | 批量读取屏幕像素。 |
| `Screen.screenshot(options?)` | Alias | `page.screenshot()` 的 alias。 |
| `Screen.selectRegion(options?)` | Experimental | 原生选择一个显示器内的区域。 |
| `Screen.startRecording(options)` | Experimental | 录制显示器/区域到 `.mov`。 |
| `Screen.getCaptureCapabilities()` | Stable | 查询 selector/recording/frameStream 能力。 |

## 公共约定

### Display identity

`getDisplays()` 的 `index` 为当前 1-based 顺序；`id` 是当前系统会话的 display ID；`hardwareId` 是 vendor/model/serial/unit 组合线索，不是跨机器全局 UUID。显示器拓扑变化后应重新读取。

### 坐标

显示器和虚拟桌面使用全局 screen logical coordinate；副显示器可出现负坐标。`pixelWidth/pixelHeight` 与 `scale` 描述像素维度，不应把 logical bounds 当作 screenshot pixel。

### Display mode

`setDisplayMode()` 只接受同一 display 的 `listDisplayModes()` 返回的 mode ID，并在系统调用后重新读取当前 mode 验证。调用方修改显示模式时应保存原值并在 `finally` 恢复。

### Recording

当前 recording target 支持 `display` / `region`，输出必须是不存在的绝对 `.mov` 路径，父目录已存在；当前 `fps` 只支持 `30`。execution teardown 会停止并 finalize 未结束录制。

## Screen.getWidth()

返回主显示器逻辑宽度。

**签名**
```ts
Screen.getWidth(): number;
```

**参数**

无。

**返回值**

`number`。

**行为与错误**

同步读取；backend 不可用时明确失败。

**示例**
```js
console.log(Screen.getWidth());
```

## Screen.getHeight()

返回主显示器逻辑高度。

**签名**
```ts
Screen.getHeight(): number;
```

**参数**

无。

**返回值**

`number`。

**行为与错误**

同步读取当前主显示器。

**示例**
```js
console.log(Screen.getHeight());
```

## Screen.getDisplays()

列出当前显示器 snapshot。

**签名**
```ts
Screen.getDisplays(): OpenDeskDisplayInfo[];
```

**参数**

无。

**返回值**

`OpenDeskDisplayInfo[]`，包含 index/id/hardwareId、logical bounds、pixel size、scale 与平台可提供的硬件 metadata。

**行为与错误**

顺序与 `page.screenshot({displayIndex})` 对齐。只读取 snapshot，不监听后续拓扑变化。

**示例**
```js
console.log(Screen.getDisplays());
```

## Screen.getPrimaryDisplay()

返回当前主显示器。

**签名**
```ts
Screen.getPrimaryDisplay(): OpenDeskDisplayInfo;
```

**参数**

无。

**返回值**

`OpenDeskDisplayInfo`。

**行为与错误**

无法读取主显示器时明确失败。

**示例**
```js
const display = Screen.getPrimaryDisplay();
```

## Screen.getDisplay(index)

按 1-based index 返回当前显示器。

**签名**
```ts
Screen.getDisplay(index: number): OpenDeskDisplayInfo | null;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `index` | `number` | 是 | 无 | 1-based 显示器编号。 |

**返回值**

`OpenDeskDisplayInfo | null`；`index <= 0` 或不存在时返回 `null`。

**行为与错误**

只读取当前 snapshot。

**示例**
```js
const second = Screen.getDisplay(2);
```

## Screen.getVirtualBounds()

返回全部显示器联合形成的虚拟桌面边界。

**签名**
```ts
Screen.getVirtualBounds(): OpenDeskScreenRegion;
```

**参数**

无。

**返回值**

`OpenDeskScreenRegion` / `{x,y,width,height}` 逻辑边界。

**行为与错误**

只读 snapshot，适合全局坐标验证。

**示例**
```js
console.log(Screen.getVirtualBounds());
```

## Screen.getDisplayCapabilities()

查询 display identity、brightness 与 mode 能力。

**签名**
```ts
Screen.getDisplayCapabilities(): OpenDeskDisplayCapabilities;
```

**参数**

无。

**返回值**

`OpenDeskDisplayCapabilities`。

**行为与错误**

只读 capability。亮度当前没有统一硬件合同时会明确报告 unsupported。

**示例**
```js
console.log(Screen.getDisplayCapabilities());
```

## Screen.getDisplayMode(displayId)

读取指定 display 当前 mode。

**签名**
```ts
Screen.getDisplayMode(displayId: string): OpenDeskDisplayMode;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `displayId` | `string` | 是 | 无 | 当前 `getDisplays()` 返回的 display ID。 |

**返回值**

`OpenDeskDisplayMode`，包含 mode id、logical/pixel size、refreshRate、desktop-usable/current flags。

**行为与错误**

当前主要由 macOS CoreGraphics 提供；其他平台明确 `NOT_SUPPORTED`。

**示例**
```js
const mode = Screen.getDisplayMode(Screen.getPrimaryDisplay().id);
```

## Screen.listDisplayModes(displayId)

枚举指定 display 的 mode metadata。

**签名**
```ts
Screen.listDisplayModes(displayId: string): OpenDeskDisplayMode[];
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `displayId` | `string` | 是 | 无 | 当前 display ID。 |

**返回值**

`OpenDeskDisplayMode[]`。

**行为与错误**

返回 mode ID 供 `setDisplayMode()` 使用；平台不支持时明确失败。

**示例**
```js
console.log(Screen.listDisplayModes(display.id));
```

## Screen.setDisplayMode(displayId, modeId)

设置 display mode 并 readback 验证。

**签名**
```ts
Screen.setDisplayMode(displayId: string, modeId: string): OpenDeskSetDisplayModeResult;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `displayId` | `string` | 是 | 无 | 目标 display。 |
| `modeId` | `string` | 是 | 无 | 同一 display 的 `listDisplayModes()` 返回值。 |

**返回值**

`OpenDeskSetDisplayModeResult`，包含 readback 后的 current mode。

**行为与错误**

**Experimental**。readback 不一致抛 `READBACK_FAILED`；平台不支持、display/mode 不存在、backend 失败均明确报错。不会 silent no-op。

**示例**
```js
const original = Screen.getDisplayMode(display.id);
try {
  Screen.setDisplayMode(display.id, alternative.id);
} finally {
  Screen.setDisplayMode(display.id, original.id);
}
```

## Screen.pixel(x, y)

读取一个全局屏幕像素颜色。

**签名**
```ts
Screen.pixel(x: number, y: number): string;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `x` | `number` | 是 | 无 | 全局逻辑 X。 |
| `y` | `number` | 是 | 无 | 全局逻辑 Y。 |

**返回值**

十六进制颜色 string；当前 backend 取不到时可能返回空字符串。

**行为与错误**

同步读取，不移动鼠标。

**示例**
```js
console.log(Screen.pixel(100, 100));
```

## Screen.pixels(points, scaled?)

批量读取多个屏幕点颜色。

**签名**
```ts
Screen.pixels(points: Array<[number, number] | {x:number;y:number}>, scaled?: boolean): string[];
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `points` | `Array<[number,number] \| {x:number;y:number}>` | 是 | 无 | 点列表。 |
| `scaled` | `boolean` | 否 | backend 默认 | 保留的 scale 行为参数。 |

**返回值**

`string[]`，与输入顺序对应。

**行为与错误**

非法点列表明确失败；当前 `scaled:false` 不承诺额外特殊换算。

**示例**
```js
console.log(Screen.pixels([[100, 100], { x: 200, y: 200 }], true));
```

## Screen.screenshot(options?)

`page.screenshot()` 的 alias。

**签名**
```ts
Screen.screenshot(options?: OpenDeskScreenshotOptions): Promise<OpenDeskScreenshotResult>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options` | `OpenDeskScreenshotOptions` | 否 | `{}` | 参数见 [`page.screenshot()`](page.md#pagescreenshotoptions)。 |

**返回值**

与 `page.screenshot()` 完全一致。

**行为与错误**

Canonical method：`page.screenshot()`；没有第二套截图 backend/合同。

**示例**
```js
await Screen.screenshot({ target: 'screen', returnType: 'base64' });
```

## Screen.selectRegion(options?)

打开原生区域选择器并返回一个显示器内的逻辑区域。

**签名**
```ts
Screen.selectRegion(options?: OpenDeskSelectRegionOptions): Promise<OpenDeskSelectedRegion>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options.dimOutside` | `boolean` | 否 | `true` | 是否 dim 区域外。 |
| `options.movable` | `boolean` | 否 | `true` | 选区是否可移动。 |
| `options.resizable` | `boolean` | 否 | `true` | 选区是否可 resize。 |
| `options.minWidth` | `number` | 否 | backend 默认 | `24..4096` 整数。 |
| `options.minHeight` | `number` | 否 | backend 默认 | `24..4096` 整数。 |

**返回值**

`OpenDeskSelectedRegion`，包含 logical bounds、displayId/index、scaleFactor 与 pixel size。

**行为与错误**

**Experimental / macOS**。选区限制在单个 display；用户取消以 `CANCELED` reject，不返回空区域。

**示例**
```js
const region = await Screen.selectRegion({ movable: true, resizable: true });
```

## Screen.startRecording(options)

录制显示器或区域到本地 `.mov`。

**签名**
```ts
Screen.startRecording(options: OpenDeskScreenRecordingOptions): Promise<OpenDeskScreenRecordingHandle>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options.target` | `{type:'display'| 'region', ...}` | 是 | 无 | 录制 target。 |
| `options.fps` | `number` | 否 | `30` | 当前只支持 30。 |
| `options.output` | `string` | 是 | 无 | 不存在的绝对 `.mov` 路径。 |
| `options.showCursor` | `boolean` | 否 | backend 默认 | 是否录制鼠标指针。 |

**返回值**

`Promise<OpenDeskScreenRecordingHandle>`；handle 提供 `stop()`，成功结果包含 `finalized`、时长、字节和像素尺寸。

**行为与错误**

**Experimental / macOS**。需要 Screen Recording 权限。display identity 变化可抛 `TARGET_UNAVAILABLE`。`stop()` 可重复安全调用；teardown 会 finalize 活动录制。

**示例**
```js
const recording = await Screen.startRecording({
  target: { type: 'display', displayIndex: 1 },
  fps: 30,
  output: '/tmp/opendesk-capture.mov',
});
await page.waitForTimeout(1000);
await recording.stop();
```

## Screen.getCaptureCapabilities()

查询区域选择、录屏、音频和帧流能力。

**签名**
```ts
Screen.getCaptureCapabilities(): OpenDeskScreenCaptureCapabilities;
```

**参数**

无。

**返回值**

`OpenDeskScreenCaptureCapabilities`。

**行为与错误**

无 UI/录制副作用。当前 `audio` 为 false，`frameStream.supported` 为 false / `notImplemented` 时不得解释为可用。

**示例**
```js
console.log(Screen.getCaptureCapabilities());
```

## 错误

Display mode 常见：`INVALID_ARGUMENT`、`NOT_SUPPORTED`、`NOT_FOUND`、`BACKEND_FAILED`、`READBACK_FAILED`。录屏/选区还包括 `PERMISSION_DENIED`、`CANCELED`、`TARGET_UNAVAILABLE`、`OUTPUT_FAILED`、`TIMEOUT`。

## 平台与能力

显示器枚举、虚拟桌面、像素和截图按当前平台 backend 提供。Display mode mutation、原生选区和录屏当前主要为 macOS Experimental；Windows/Linux 不支持时明确报告 capability，而不是 shell fallback 或 silent no-op。
