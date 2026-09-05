---
title: Geometry API
description: 将窗口、显示器与明确标记的屏幕区域转换为虚拟桌面逻辑坐标。
order: 4
---

# Geometry

`Geometry` 是桌面 Recipe 的纯 JavaScript 坐标层。它以当前窗口、显示器或已标记的屏幕区域为
输入，输出可安全传给 `mouse.clickPoint()` 的 **screen logical coordinate**。它不截图、不做 OCR、
不改变桌面状态。

```js
const win = await window.getActiveWindow();
const footer = Geometry.regionByEdges(win, {
  left: 16,
  right: 16,
  bottom: 12,
  height: 60,
});

await UI.tapText('确定', { within: footer });
```

它解决窗口移动、窗口尺寸变化和负坐标显示器中的“相对位置”问题；它不处理 Retina 或 Windows
DPI 截图像素比例，那是 [`UI`](desktop-ui.md) 的 capture mapping 工作。

## 坐标空间与输入

- `screen` 是虚拟桌面的逻辑坐标，供 `window`、`Screen`、`mouse` 使用。第二显示器在主屏左方或
  上方时，`x` / `y` 可以为负数。
- `image` 是截图像素坐标，只供 OCR 与模板匹配结果使用，不能直接传给 Geometry 或 mouse。
- `Geometry` 只接受正式的 `OpenDeskWindowInfo`、`OpenDeskDisplayInfo` 或自身/`UI` 生成的
  `OpenDeskScreenRegion`。一个裸 `{ x, y, width, height }` 会被拒绝，避免把 OCR bbox 或裁剪局部
  bbox 误作全局坐标。

Geometry 产生的点和区域始终有不可省略的标记：

```js
{ x: 100, y: 200, coordinateSpace: 'screen' }
{ x: 100, y: 200, width: 800, height: 600, coordinateSpace: 'screen' }
```

全部数字必须是有限 `number`（不能为 `NaN` 或 `Infinity`）；所有区域的 `width`、`height` 必须
大于 `0`。

## 方法

| 方法 | 返回 | 用途 |
| --- | --- | --- |
| `Geometry.rect(target)` | `OpenDeskScreenRegion` | 将窗口、显示器或已标记 region 正规化为 screen region |
| `Geometry.center(target)` | `OpenDeskScreenPoint` | 目标内部的中心点击点 |
| `Geometry.pointOffset(target, x, y)` | `OpenDeskScreenPoint` | 从目标左上角偏移的逻辑坐标点 |
| `Geometry.pointPercent(target, xPercent, yPercent)` | `OpenDeskScreenPoint` | 目标宽高的百分比位置 |
| `Geometry.regionOffset(target, region)` | `OpenDeskScreenRegion` | 从目标左上角偏移的相对区域 |
| `Geometry.regionPercent(target, region)` | `OpenDeskScreenRegion` | 目标宽高的百分比区域 |
| `Geometry.regionByEdges(target, options)` | `OpenDeskScreenRegion` | 用父区域边距与固定/拉伸尺寸确定子区域 |
| `Geometry.inset(target, margins)` | `OpenDeskScreenRegion` | 将区域四边向内缩，得到新的搜索范围 |
| `Geometry.anchorPoint(target, position, options?)` | `OpenDeskScreenPoint` | 取得九个标准锚点之一，可先应用内部留白 |
| `Geometry.contains(region, point)` | `boolean` | point 是否位于 region 内（右、下边界为排他） |
| `Geometry.intersect(regionA, regionB)` | `OpenDeskScreenRegion \| null` | 两区域交集；不相交时为 `null` |

### `rect(target)`、`center(target)`

```js
const win = await window.getActiveWindow();
const bounds = Geometry.rect(win);
const point = Geometry.center(win);
```

中心点总会 clamp 在目标内部。对于 `100 × 40` 的目标，中心不会落在右或下的排他边界。

### `pointOffset(target, x, y)` 与 `regionOffset(target, region)`

`offset` 是相对目标左上角的**桌面逻辑坐标偏移**，不是 screenshot pixel：

```js
const titlePoint = Geometry.pointOffset(win, 24, 18);
const content = Geometry.regionOffset(win, {
  left: 0,
  top: 48,
  width: win.width,
  height: win.height - 48,
});
```

它不会把 offset 解释成比例，也不会把 `0.5` 猜成 50%。

### `pointPercent(target, xPercent, yPercent)`

百分比范围固定为 **0–100**，不是 0–1：

```js
const middle = Geometry.pointPercent(win, 50, 50);
const lowerRight = Geometry.pointPercent(win, 100, 100);
```

`100` 合法；返回的最终整数点击点会 clamp 在目标内部，因此 `lowerRight` 不会得到
`x + width` 或 `y + height` 的外部点。

### `regionPercent(target, region)`

`left`、`top`、`width`、`height` 都是 0–100 百分比，且 `left + width` 与 `top + height` 不能超过
100。左上边界使用 `floor`，右下边界使用 `ceil`，再计算返回的 width / height：

```js
const keypad = Geometry.regionPercent(win, {
  left: 0,
  top: 35,
  width: 100,
  height: 65,
});
```

### `regionByEdges(target, options)`

`left`、`right`、`top`、`bottom`、`width`、`height` 都使用 Geometry 既有的桌面逻辑坐标单位，
不是截图像素、百分比或应用内容区推测值。水平方向必须正好提供 `left` / `right` / `width` 中的
两个；垂直方向必须正好提供 `top` / `bottom` / `height` 中的两个。数值 `0` 是已提供的有效约束。

```js
// 底部栏：左右拉伸。
const footer = Geometry.regionByEdges(win, {
  left: 16,
  right: 16,
  bottom: 12,
  height: 60,
});

// 右侧栏：固定宽度，上下拉伸。
const sidebar = Geometry.regionByEdges(win, {
  top: 0,
  bottom: 0,
  right: 0,
  width: 300,
});

// 右下角固定操作区。
const actions = Geometry.regionByEdges(win, {
  right: 16,
  bottom: 12,
  width: 180,
  height: 64,
});
```

允许的水平组合只有 `left + width`、`right + width`、`left + right`；垂直方向同理。少于两个约束
无法确定区域，三个约束则属于过度约束，即使当前数值恰好一致也不会猜测优先级。边距必须为有限、
非负 `number`，`width` / `height` 必须为有限且大于 0 的 `number`。结果必须完整位于父区域内；
父区域过小时直接抛错，不移动、不裁切，也不自动缩小。

百分比定位继续使用 `regionPercent()`。`regionByEdges()` 不接受百分比字符串，也不会把 `0.5`
解释为 50%。

### `inset(target, margins)`

数字形式表示四边使用相同内边距；对象形式中未提供的边默认为 `0`：

```js
const innerFooter = Geometry.inset(footer, 12);

const safeSearch = Geometry.inset(footer, {
  left: 12,
  right: 12,
  top: 4,
  bottom: 8,
});
```

`margins` 必须明确提供。每条边距必须是有限、非负 `number`；`0` 合法。内缩后的宽和高必须仍然
大于 0。方法返回新区域，不修改 `target` 或 `margins`，也不会压缩过大的边距。

### `anchorPoint(target, position, options?)`

`position` 支持 `top-left`、`top-center`、`top-right`、`center-left`、`center`、
`center-right`、`bottom-left`、`bottom-center`、`bottom-right`。`options.inset` 与 `inset()` 的
参数形式相同，默认值为 `0`；Geometry 先取得内缩区域，再选择锚点：

```js
const point = Geometry.anchorPoint(win, 'bottom-right', {
  inset: {
    right: 16,
    bottom: 12,
  },
});

await mouse.clickPoint(point);
```

锚点沿用 Geometry 既有的整数点击点规则。右侧与下侧锚点会落在半开区域的最后一个有效整数点，
不会返回 `x + width` 或 `y + height`。如果内缩后的区域虽然有正面积、却不包含可寻址的整数点击点，
方法会明确抛错。仅需要中心点时继续使用 `Geometry.center(target)`。

## 窗口变化与快照语义

当前 Geometry 没有窗口监听或动态派生区域机制。三个布局方法与既有方法一样执行确定性的快照计算：
相同父区域与参数产生相同结果；普通返回对象不会自动跟随窗口。

保存布局规则，并在操作前重新读取窗口：

```js
const footerRule = { left: 16, right: 16, bottom: 12, height: 60 };

const currentWin = await window.getActiveWindow();
const footer = Geometry.regionByEdges(currentWin, footerRule);
await UI.tapText('确定', { within: footer });
```

窗口移动或 resize 后，再次读取更新后的窗口信息并应用同一规则。不要把旧坐标悄悄关联到另一个活动
窗口，也不要缓存已计算的点跨窗口生命周期使用。Geometry 不读取或乘除 `display.scale`，不猜测标题栏
高度，也不改变目标应用布局。

## 错误

Geometry 的参数错误为结构化 `Error`：

```js
try {
  Geometry.regionByEdges(win, { left: 16, bottom: 12, height: 60 });
} catch (error) {
  console.log(error.code);      // INVALID_ARGUMENT
  console.log(error.operation); // Geometry.regionByEdges
}
```

新增方法也保留 `INVALID_ARGUMENT` 与具体 `operation`。错误会区分约束不足、过度约束、非法数值、
父区域过小以及无法产生有效点击点。

`pointPercent()` / `regionPercent()` 中的 `0.5` 表示 0.5%，不是 50%。50% 必须明确写成
`Geometry.pointPercent(win, 50, 50)`。
