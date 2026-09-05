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
const footer = Geometry.regionPercent(win, {
  left: 0,
  top: 70,
  width: 100,
  height: 30,
});

await mouse.clickPoint(Geometry.center(footer));
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

窗口移动或 resize 后，应重新读取窗口并重新计算 Geometry；不要缓存已计算的点跨窗口生命周期使用。

## 错误

Geometry 的参数错误为结构化 `Error`：

```js
try {
  Geometry.pointPercent(win, 101, 50);
} catch (error) {
  console.log(error.code);      // INVALID_ARGUMENT
  console.log(error.operation); // Geometry.pointPercent
}
```

`0.5` 在这里表示 0.5%，不是 50%。50% 必须明确写成 `Geometry.pointPercent(win, 50, 50)`。
