---
title: Desktop UI API
description: 使用 OCR、模板匹配与实际截图比例查找、点击和等待外部桌面应用的可见 UI。
order: 11
---

# UI

大写 `UI` 用于查找和操作**外部桌面应用**的可见文本和图片。它每次操作都会使用新的截图，并把
OCR/模板匹配的 image-pixel bbox 投影为可供 `mouse` 使用的 screen logical coordinate。

对于会移动或调整尺寸的窗口，保存窗口身份和**定位规则**，不要保存一次 OCR 得到的旧坐标。文字相对定位
按以下顺序工作：

```text
指定窗口
→ 读取同一窗口的最新位置与尺寸
→ 根据规则计算搜索区域
→ 新截图与一次 OCR
→ 定位唯一文字参照物并筛选目标
→ 复核窗口
→ 返回目标或执行一次点击
```

```js
const win = await window.getActiveWindow();

await UI.tapText('编辑', {
  within: win,
  region: currentWin => Geometry.inset(currentWin, 12),
  relativeTo: {
    text: '联系人 A',
    direction: 'right',
    maxGap: 240,
  },
});
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
| `UI.findTexts(text, options?)` | 返回全部匹配文本候选；支持 `region` / `relativeTo` |
| `UI.findText(text, options?)` | 返回唯一候选、无结果为 `null`、歧义时报错；支持 `region` / `relativeTo` |
| `UI.hasText(text, options?)` | 是否有至少一个匹配文本；支持 `region` / `relativeTo` |
| `UI.tapText(text, options?)` | 找到唯一可见文本并以鼠标点击激活；支持 `region` / `relativeTo` |
| `UI.tapTexts(texts, options?)` | 按顺序点击 `string[]` 中的文字；每一步重新截图/OCR/定位 |
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

`region` 和 `relativeTo` 是更严格的文字定位选项：当前只由 `findTexts`、`findText`、`hasText`、
`tapText` 和 `tapTexts` 支持，而且必须同时显式传入 `within: OpenDeskWindowInfo`。这样 UI 才能在窗口
移动后保留身份并重新读取其 bounds。未使用这两个选项的旧调用继续接受原有 window、display、screen
region scope，并保持原有默认行为。

## 可重算文字定位

### 外层搜索区域：`region`

`region` 可以是同步计算规则，也可以是静态 screen region。动态规则适合需要跟随窗口位置和尺寸变化的
布局：

```js
const win = await window.getActiveWindow();
const footerRule = {
  left: 16,
  right: 16,
  bottom: 12,
  height: 60,
};

await UI.tapText('确定', {
  within: win,
  region: currentWin => Geometry.regionByEdges(currentWin, footerRule),
});
```

每次完整观察前，UI 先确认仍是 `within` 指定的窗口，再把该窗口的最新快照作为 `currentWin` 调用规则。
一次观察只调用规则一次，不会为每个 OCR 候选重复执行，也不会缓存上一次结果。规则必须同步返回宽高为
正数、数值有限并带 `coordinateSpace: "screen"` 的 region；`Promise`、`null`、裸 bbox、image-space
region 和字符串表达式均报 `INVALID_ARGUMENT`。规则应只执行 `Geometry` 等纯计算，不要在其中截图、
等待或执行输入；这是回调的使用合同，Runtime 不会声称能证明任意 JavaScript 回调没有副作用。UI 不会
修改传入的窗口对象，也不会向回调暴露内部可变状态。

静态形式是一个已经标记的 `OpenDeskScreenRegion`：

```js
const fixedRegion = Geometry.regionOffset(win, {
  left: 16,
  top: 300,
  width: 320,
  height: 60,
});

await UI.findText('确定', { within: win, region: fixedRegion });
```

静态 region 始终是坐标快照。UI 不推断它来自哪次截图，不会随窗口自动平移，也不会给 Geometry 返回对象
附加隐藏跟踪行为。在使用新定位选项时，如果 `within` 的窗口 bounds 已改变，静态 region 会导致
`STALE_TARGET`，调用方应重新计算；窗口快照检查也不能证明任意手写 region 的历史来源。

外层有效搜索范围依次与当前窗口 bounds、现有可见屏幕范围求交。没有有效范围时抛
`TARGET_SCOPE_NOT_VISIBLE`。这仍是可见屏幕截图：不假定窗口未被遮挡，也不支持最小化窗口的后台内容捕获。

### 文字参照物：`relativeTo`

`relativeTo.text` 是非空字符串，仅按 exact 匹配。大小写、空白归一化和最低置信度沿用顶层对应选项；
顶层 `match: "contains"` 只控制目标文字，不会隐式改成 contains 参照物。provider、语言和 OCR 来源也
复用本次观察。参照物和目标来自同一次 capture、同一次 `Vision.runOCR`；不会递归调用 `UI.findText`
拼接两个画面。

参照物必须唯一。没有参照物时，`findTexts` 返回 `[]`、未指定 `index` 的 `findText` 返回 `null`、
`hasText` 返回 `false`；点击时报 `TARGET_NOT_FOUND` 且 `stage: "anchor"`。参照物超过一个时，所有启用
`relativeTo` 的方法都抛 `AMBIGUOUS_TARGET` 且 `stage: "anchor"`。顶层 `index` 不能挑选参照物。
作为参照物的 OCR 行本身不会再次充当相邻目标。

OCR provider 如果把标签和按钮合并为一条文本行，UI 不会根据字符长度猜测按钮 bbox；应改进实际画面、
OCR provider 或搜索规则，让参照物和目标产生独立识别结果。

#### 方向模式

方向模式支持 `right`、`left`、`above` 和 `below`。`maxGap` 必须是有限且不小于 0 的屏幕逻辑坐标
距离；`minOverlap` 必须在 `(0, 1]`，默认 `0.5`。阈值边界均包含在内。

```js
await UI.tapText('编辑', {
  within: win,
  relativeTo: {
    text: '联系人 A',
    direction: 'right',
    maxGap: 240,
    minOverlap: 0.5,
  },
});
```

以 `right` 为例，目标左边界必须不小于参照物右边界，水平边缘间隔必须不大于 `maxGap`，纵向重叠
长度除以两者较小高度必须不小于 `minOverlap`。`left` 使用反向水平边缘关系；`above` / `below`
使用垂直边缘间隔，并以横向重叠长度除以两者较小宽度。方向只做空间筛选，不证明业务关联，也不会自动
选择最近、最高置信度或第一个候选。

#### 矩形模式

矩形模式由同帧参照物计算一个候选筛选范围：

```js
await UI.tapText('编辑', {
  within: win,
  relativeTo: {
    text: '联系人 A',
    region: anchor => Geometry.regionOffset(anchor.bounds, {
      left: anchor.bounds.width + 8,
      top: -6,
      width: 240,
      height: anchor.bounds.height + 12,
    }),
  },
});
```

`anchor` 使用 `OpenDeskUITextTarget` 的既有形状，`anchor.bounds` 是本次观察得到的 screen region。
唯一参照物确认后只调用回调一次，不会为每个目标候选重复执行。回调必须同步返回有效、带 screen 标记的
region；`Promise`、`null`、裸 bbox、非法数字和非正尺寸均报 `INVALID_ARGUMENT`。它可以超出参照物，
但最终会与外层有效搜索范围求交，不能扩大外层范围。目标 bbox 必须**完整位于**最终矩形内；仅中心落入、
边缘相交或部分重叠均不通过。交集为空表示没有符合条件的目标，不会点击矩形中心，也不会自动扩大范围。

方向距离、重叠和矩形全部使用 Geometry 既有的桌面逻辑坐标单位，不按 `Display.scale` 乘除。空间筛选使用
OCR bbox 连续投影后的逻辑边界，避免非整数截图比例下由取整造成边界误判；公开返回的 `bounds` 仍保持
既有的左/上 `floor`、右/下 `ceil` 形状，`relativeTo.region` 回调看到的也是这个公开形状。

方向模式与矩形模式二选一。同时提供 `direction` 和 `relativeTo.region` 报 `INVALID_ARGUMENT`；矩形模式
也不接受 `maxGap` / `minOverlap`。这些定位结构中的未知字段会被拒绝，而不是静默忽略。

### 消歧与窗口新鲜度

关系筛选后的目标继续沿用既有结果和消歧合同：

- `findTexts` 返回过滤后的全部候选，`hasText` 表示是否至少有一个。
- `findText` 没有目标且未指定 `index` 时返回 `null`；`tapText` 则抛 `TARGET_NOT_FOUND`。
- 多个目标不会自动取最近或第一个；`findText` / `tapText` 要求唯一目标或显式 `index`。
- `index` 是零基索引，只作用于关系筛选后的目标候选。

启用新定位选项后，每次调用会在截图前重新读取窗口并确认身份，在识别后、返回或点击前再次复核身份和
bounds。身份 unresolved、原窗口失效或无法可靠确认时会停止；不会凭标题、PID 或坐标相似自动换成另一个
窗口。当前身份复核复用 `window.getActiveWindow()`，因此指定窗口必须继续是活动窗口；切换到其他窗口会
按身份变化停止。即使旧位置已没有任何候选，也会执行窗口复核，不会等找到目标后才首次检查窗口移动。

同一窗口在识别期间移动或 resize 时，动态 `region`（以及未指定外层 `region`）最多进行一次完整的
重新读取、重算、截图和 OCR；静态 `region` 立即停止而不猜测新位置。重试观察期间再次变化则抛
`STALE_TARGET`，不会无限重试。重试仅发生在输入前；一旦鼠标输入已被调用，无论调用结果是否确定，
都不会自动再次点击。最后一次检查与系统接收点击之间仍可能发生界面变化，UI 不声称能原子消除这段竞态。

`tapTexts` 的每一步都会重新识别参照物和目标，并始终保留指定窗口身份；步骤失败即停止，错误继续包含
`failedIndex`、`failedText`、`completed` 和原始 `cause`，已完成步骤不会重做。

### 暂不支持新定位选项的方法

`UI.waitText`、`UI.waitTextGone`、`UI.findImages`、`UI.findImage` 和 `UI.tapImage` 当前不支持
`region` / `relativeTo`。这些方法收到任一新选项时，会在截图、OCR、模板匹配或输入之前明确抛
`INVALID_ARGUMENT`；不会静默忽略。图片相对定位、图片或 Accessibility 参照物也不在本批范围内。

### 受控示例

先在不含业务数据的临时测试窗口中准备两条独立文字行：`OpenDesk 测试行 A    编辑` 和
`OpenDesk 测试行 B    编辑`，并聚焦该窗口。然后从 **OpenDesk 仓库根目录**原样运行：

```bash
./opendesk -script examples/ui-relative-target.js
```

该示例只会尝试一次相对点击，不创建截图或上传内容。请勿在真实联系人、订单或支付页面运行。移动或调整
同一个测试窗口后再次执行同一条命令，动态 `region` 会从最新窗口 bounds 重算；示例不会复用上次点击
坐标。这个手动前置条件意味着命令不能安全地在任意当前活动窗口上自动验收。

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

以下定位 options 仅用于 `findTexts`、`findText`、`hasText`、`tapText` 和 `tapTexts`，并要求显式
`within: OpenDeskWindowInfo`：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `region` | 当前窗口 bounds | tagged screen region 快照，或 `(currentWin) => screenRegion` 同步规则 |
| `relativeTo` | 未设置 | 相对于唯一 exact 文字参照物的方向或矩形筛选规则 |

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

`UI` 默认只在内存中使用本次截图，不新增截图文件、上传内容或记录 OCR 正文日志。

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

如果 scope 是 window，UI 会在点击前重新读取窗口：身份（包括可用的稳定 id / handle）变化时抛
`STALE_TARGET`。未使用静态 `region` 时，同一个窗口若移动或 resize，最多执行一次完整的重新
capture → recognition → projection；静态 `region` 不会随窗口移动。两种情况都不会点击旧 point 或
无限重试。启用新定位选项时还会在无候选和读取返回前复核，完整顺序见“消歧与窗口新鲜度”。

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

尚未实现的候选能力包括 Accessibility.find/hitTest、role/name lookup、aliases、image waits、图片或
Accessibility 参照物，以及 mixed-DPI split capture。Recorder、replay、UIMap/scene 和 automatic
repair 不属于此 API。
