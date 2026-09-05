---
title: Desktop UI API
description: 使用 OCR、模板匹配与实际截图比例查找、点击和等待外部桌面应用的可见 UI。
order: 11
---

# UI

大写 `UI` 用于查找和操作**外部桌面应用**的可见文本和图片。它每次操作都会使用新的截图，并把
OCR/模板匹配的 image-pixel bbox 投影为可供 `mouse` 使用的 screen logical coordinate。

```js
const win = await window.getActiveWindow();
const footer = Geometry.regionPercent(win, {
  left: 0,
  top: 70,
  width: 100,
  height: 30,
});

await UI.tapText('确定', { within: footer });
await UI.waitText('操作成功', { within: win, timeout: 10000 });
```

`UI` 与小写 [`ui`](custom-ui.md) 完全不同，JavaScript 大小写敏感：

| 对象 | 作用 | 不做什么 |
| --- | --- | --- |
| `UI` | 查找、等待、激活外部应用可见目标 | 不创建 OpenDesk 窗口，不提供 Accessibility provider |
| `ui` | 创建和管理 OpenDesk 自己的 Custom UI | 不查询或点击外部桌面应用 |

没有 `UI = ui`、`ui = UI` 或 `DesktopUI` 别名。

## 快速接口

| 方法 | 用途 |
| --- | --- |
| `UI.getCapabilities()` | 返回当前 P0 高层能力摘要 |
| `UI.findTexts(text, options?)` | 返回全部匹配文本候选 |
| `UI.findText(text, options?)` | 返回唯一候选、无结果为 `null`、歧义时报错 |
| `UI.hasText(text, options?)` | 是否有至少一个匹配文本 |
| `UI.tapText(text, options?)` | 找到唯一可见文本并以鼠标点击激活 |
| `UI.tapTexts(texts, options?)` | 按顺序点击 `string[]` 中的文字；每一步重新截图/OCR |
| `UI.waitText(text, options?)` | 轮询到文字出现，返回唯一候选 |
| `UI.waitTextGone(text, options?)` | 轮询到文字消失，返回 `true` |
| `UI.findImages(template, options?)` | 返回全部模板匹配候选 |
| `UI.findImage(template, options?)` | 返回唯一图片候选、无结果为 `null`、歧义时报错 |
| `UI.tapImage(template, options?)` | 找到唯一模板匹配并点击中心 |

`tapText` 的 P0 定义是“查找并激活一个可见文本目标”，实现使用现有 `mouse.click`。它成功只代表
目标已找到且已调用点击，不代表业务已完成；后续仍应 `waitText`、`hasText`、`ImageColor.diff` 或使用
业务状态验证。未来可在不改变调用方式的情况下增加 Accessibility action，但当前
`accessibility.available` 始终为 `false`。

## scope：`within`

所有方法都可指定：

```ts
within?: OpenDeskWindowInfo | OpenDeskDisplayInfo | OpenDeskScreenRegion
```

未指定时，UI 读取当前活动窗口并只在其范围内查找。提供 `within` 时可传当前 window、display 或
`Geometry.regionPercent()` / `Geometry.regionOffset()` 产生的已标记 screen region。不要传裸 bbox。

UI 会先计算 `Geometry.rect(within)`，再和 `Screen.getVirtualBounds()` 求交。完全不可见时报
`TARGET_SCOPE_NOT_VISIBLE`；部分可见时只截取可见交集，后续坐标映射也以这个实际 capture scope 为准。

如果 scope 跨多个显示器且这些显示器的 `scale` 明显不同，P0 会 fail closed 并抛
`UNSUPPORTED_MIXED_DPI_SCOPE`。同 scale 的多显示器 scope 可继续使用本次截图的真实比例。P1 才会
实现 mixed-DPI split capture；不会假装一个全局比例能准确覆盖不同 DPI 显示器。

## 文本接口

```js
const matches = await UI.findTexts('编辑', {
  within: win,
  match: 'exact',
  minConfidence: 0.5,
  provider: 'apple',
  lang: 'ch',
});

if (matches.length === 1) {
  await mouse.clickPoint(matches[0].center);
}
```

文本 options：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `within` | 当前活动窗口 | window、display 或已标记 screen region |
| `match` | `"exact"` | `"exact"` 或 `"contains"` |
| `caseSensitive` | `false` | 是否区分大小写 |
| `normalizeWhitespace` | `true` | trim 并将连续空白折叠为一个空格 |
| `minConfidence` | 未设置 | OCR 最低置信度 |
| `provider` / `providerChain` / `lang` | Vision 默认 | 转发给 `Vision.runOCR` |
| `index` | 未设置 | 零基、显式消歧 index |
| `timeout` / `polling` | 10000 / 200 ms | `waitText` 与 `waitTextGone` 的有限轮询控制 |
| `click` | 未设置 | 转发给 `mouse.clickPoint` 的既有鼠标选项 |
| `intervalMs` | 0 | `tapTexts` 两步间的显式间隔 |

`findTexts` 以 screen reading order 返回所有匹配：先 y，同行再 x。候选的稳定形状为：

```js
{
  source: 'ocr',
  text: '确定',
  confidence: 0.98,
  provider: 'apple',
  imageBounds: { x: 125, y: 125, width: 250, height: 50, coordinateSpace: 'image' },
  bounds: { x: 200, y: 300, width: 200, height: 40, coordinateSpace: 'screen' },
  center: { x: 300, y: 320, coordinateSpace: 'screen' },
}
```

`findText` / `tapText` 不会默认选择 `elements[0]`：

- 0 个候选：`findText` 返回 `null`；`tapText` 抛 `TARGET_NOT_FOUND`。
- 1 个候选：返回或点击该候选。
- 多个候选且没有 `index`：抛 `AMBIGUOUS_TARGET`，错误含 `candidateCount`、`candidates` 与
  `operation`。
- `index` 越界：抛 `TARGET_NOT_FOUND`，不会退回第一个。

优先用 `within` 缩小范围；`index` 仅是明确的消歧方式。`tapTexts` 只接受动作序列 `string[]`：

```js
await UI.tapTexts(['1', '6', '×', '3', '='], {
  within: Geometry.regionPercent(win, { left: 0, top: 35, width: 100, height: 65 }),
  match: 'exact',
});
```

它不会按空格拆分字符串，也不会把数组解释为 aliases。任何一步失败即停止；错误含
`failedIndex`、`failedText`、`completed` 和原始 `cause`。

`waitText` 与 `waitTextGone` 都是 predicate polling：每次轮询重新截图并重新 OCR，不使用固定
`page.waitFor(1000)` 伪造业务成功。超时抛 `TIMEOUT`，含 timeout、text、lastObservation 和
lastError 摘要。

## 图片接口

`UI` 复用 `ImageColor.findImages`，不重写模板匹配：

```js
const icon = await UI.findImage('./assets/save-icon.png', {
  within: win,
  threshold: 0.95,
  scales: [1, 1.25, 1.5],
});

if (icon) await mouse.clickPoint(icon.center);
```

图片 options 为 `within`、`threshold`、`scales`、`maxResults`、`index`、`timeout`、`polling`、`click`。
歧义和 index 规则与文本接口相同。图片候选含 `source: 'image'`、template、confidence、可选 scale、
`imageBounds`、screen-space `bounds` 与 tagged `center`。

## Capture mapping 与 DPI

UI 始终严格区分三种坐标：

1. **screen logical coordinate**：window/display bounds 和 `mouse.click` 使用的虚拟桌面坐标。
2. **screenshot image pixel**：OCR 与 ImageColor bbox 使用的图片像素。
3. **scope-local coordinate**：本次 screenshot clip 内部的局部坐标。

每次查找都使用已有截图接口：

```js
const image = await page.screenshot({
  target: 'screen',
  clip: { x, y, width, height },
  returnType: 'base64',
});
const [imageWidth, imageHeight] = ImageColor.getSize(image);
const scaleX = imageWidth / width;
const scaleY = imageHeight / height;
```

因此不会假定 screenshot pixel 等于 screen logical coordinate、不会写死 Retina 2× 或 Windows
125%/150%，也不要求 `scaleX === scaleY`。`Display.scale` 只用于 mixed-DPI 安全检查与诊断；本次
真实图片尺寸才是坐标投影依据。

对于图片 bbox `{ x, y, width, height }`，UI 使用：

```text
screenLeft   = logicalScope.x + bbox.x / scaleX
screenTop    = logicalScope.y + bbox.y / scaleY
screenRight  = logicalScope.x + (bbox.x + bbox.width) / scaleX
screenBottom = logicalScope.y + (bbox.y + bbox.height) / scaleY
```

返回 screen bounds 的左/上取 `floor`，右/下取 `ceil`；center 由最终完整 bounds 计算并 clamp 在
bounds 内。不要直接使用旧 OCR/ImageColor result 的 `centerX` / `centerY` 点击。

点击前，如果 scope 是 window，UI 会重新读取活动窗口：身份（id、pid、handle 如可用、title）变化时
抛 `STALE_TARGET`；同一个窗口若移动或 resize，则最多执行一次完整的重新 capture → recognition →
projection，绝不点击旧 point 或无限重试。

## 错误与能力

新 API 的错误至少含 `code`、`operation`、`message`。P0 code 为：

```text
INVALID_ARGUMENT
TARGET_NOT_FOUND
AMBIGUOUS_TARGET
STALE_TARGET
TARGET_SCOPE_NOT_VISIBLE
SCREENSHOT_FAILED
OCR_FAILED
IMAGE_MATCH_FAILED
UNSUPPORTED_MIXED_DPI_SCOPE
UNSUPPORTED_COORDINATE_MAPPING
TIMEOUT
```

```js
console.log(UI.getCapabilities());
// {
//   text: { find: true, tap: true, wait: true, backend: 'Vision.runOCR' },
//   image: { find: true, tap: true, backend: 'ImageColor.findImages' },
//   accessibility: { available: false, status: 'notImplemented' },
//   coordinateMapping: { actualCaptureScale: true, mixedDPIScope: false }
// }
```

P1 candidates (not implemented here) are Accessibility.find/hitTest, role/name lookup, aliases, image waits,
anchored regions, and mixed-DPI split capture. Recorder, replay, UIMap/scene and automatic repair are outside
this API.
