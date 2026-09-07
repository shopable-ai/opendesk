---
title: Geometry API
description: 将窗口、显示器与明确标记的屏幕区域转换为虚拟桌面逻辑坐标。
order: 4
---

# Geometry

`Geometry` 是纯 JavaScript 坐标工具，只处理 **screen logical coordinate**。它不截图、不做 OCR，也不改变桌面状态。

## API 一览

| 方法 | 用途 |
| --- | --- |
| `Geometry.rect(target)` | 正规化为 screen region。 |
| `Geometry.center(target)` | 返回内部中心点。 |
| `Geometry.pointOffset(target, x, y)` | 按逻辑坐标偏移得到点。 |
| `Geometry.pointPercent(target, xPercent, yPercent)` | 按百分比得到点。 |
| `Geometry.regionOffset(target, region)` | 按逻辑坐标偏移得到子区域。 |
| `Geometry.regionPercent(target, region)` | 按百分比得到子区域。 |
| `Geometry.regionByEdges(target, options)` | 用边距和尺寸确定子区域。 |
| `Geometry.inset(target, margins)` | 将区域向内缩。 |
| `Geometry.anchorPoint(target, position, options?)` | 返回标准锚点。 |
| `Geometry.contains(region, point)` | 判断点是否在区域内。 |
| `Geometry.intersect(regionA, regionB)` | 返回区域交集。 |

## 公共约定

### 坐标空间

`Geometry` 只接受 `OpenDeskWindowInfo`、`OpenDeskDisplayInfo` 或 tagged `OpenDeskScreenRegion`。裸 `{x,y,width,height}` 和 image-pixel bbox 会被拒绝。返回点/区域始终带 `coordinateSpace: 'screen'`。

所有数字必须为有限 `number`；区域宽高必须大于 `0`。虚拟桌面坐标允许负数。

### 百分比与快照

`pointPercent()` / `regionPercent()` 使用 `0..100`，不是 `0..1`。Geometry 只做当前快照计算；窗口移动或 resize 后应重新读取窗口并重新计算。

## Geometry.rect(target)

将目标正规化为 tagged screen region。

**签名**
```ts
Geometry.rect(target: OpenDeskGeometryTarget): OpenDeskScreenRegion;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `OpenDeskGeometryTarget` | 是 | 无 | WindowInfo、DisplayInfo 或 tagged ScreenRegion。 |

**返回值**

`OpenDeskScreenRegion`。

**行为与错误**

无效坐标空间、裸 bbox 或非法尺寸抛 `INVALID_ARGUMENT`。

**示例**
```js
const bounds = Geometry.rect(await window.getActiveWindow());
```

## Geometry.center(target)

返回目标内部中心点击点。

**签名**
```ts
Geometry.center(target: OpenDeskGeometryTarget): OpenDeskScreenPoint;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `OpenDeskGeometryTarget` | 是 | 无 | 目标区域。 |

**返回值**

`OpenDeskScreenPoint`。

**行为与错误**

结果会保持在右/下排他边界以内；非法 target 抛 `INVALID_ARGUMENT`。

**示例**
```js
await mouse.clickPoint(Geometry.center(win));
```

## Geometry.pointOffset(target, x, y)

从目标左上角按逻辑坐标偏移得到点。

**签名**
```ts
Geometry.pointOffset(target: OpenDeskGeometryTarget, x: number, y: number): OpenDeskScreenPoint;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `OpenDeskGeometryTarget` | 是 | 无 | 父目标。 |
| `x` | `number` | 是 | 无 | X 偏移。 |
| `y` | `number` | 是 | 无 | Y 偏移。 |

**返回值**

`OpenDeskScreenPoint`。

**行为与错误**

偏移按 screen logical unit 解释，不按比例解释。非法参数抛 `INVALID_ARGUMENT`。

**示例**
```js
const point = Geometry.pointOffset(win, 24, 18);
```

## Geometry.pointPercent(target, xPercent, yPercent)

按目标宽高百分比得到点。

**签名**
```ts
Geometry.pointPercent(target: OpenDeskGeometryTarget, xPercent: number, yPercent: number): OpenDeskScreenPoint;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `OpenDeskGeometryTarget` | 是 | 无 | 父目标。 |
| `xPercent` | `number` | 是 | 无 | `0..100`。 |
| `yPercent` | `number` | 是 | 无 | `0..100`。 |

**返回值**

`OpenDeskScreenPoint`。

**行为与错误**

`100` 合法，但最终点仍位于半开区域内部。范围外值抛 `INVALID_ARGUMENT`。

**示例**
```js
const middle = Geometry.pointPercent(win, 50, 50);
```

## Geometry.regionOffset(target, region)

按逻辑坐标定义子区域。

**签名**
```ts
Geometry.regionOffset(target: OpenDeskGeometryTarget, region: OpenDeskGeometryOffsetRegion): OpenDeskScreenRegion;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `OpenDeskGeometryTarget` | 是 | 无 | 父目标。 |
| `region` | `OpenDeskGeometryOffsetRegion` | 是 | 无 | `left/top/width/height` 逻辑坐标。 |

**返回值**

`OpenDeskScreenRegion`。

**行为与错误**

不把偏移解释成百分比；非法尺寸或区域抛 `INVALID_ARGUMENT`。

**示例**
```js
const content = Geometry.regionOffset(win, { left: 0, top: 48, width: win.width, height: win.height - 48 });
```

## Geometry.regionPercent(target, region)

按 `0..100` 百分比定义子区域。

**签名**
```ts
Geometry.regionPercent(target: OpenDeskGeometryTarget, region: OpenDeskGeometryPercentRegion): OpenDeskScreenRegion;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `OpenDeskGeometryTarget` | 是 | 无 | 父目标。 |
| `region` | `OpenDeskGeometryPercentRegion` | 是 | 无 | 百分比 `left/top/width/height`。 |

**返回值**

`OpenDeskScreenRegion`。

**行为与错误**

`left + width`、`top + height` 不能超过 100。范围无效抛 `INVALID_ARGUMENT`。

**示例**
```js
const keypad = Geometry.regionPercent(win, { left: 0, top: 35, width: 100, height: 65 });
```

## Geometry.regionByEdges(target, options)

用边距和固定/拉伸尺寸确定子区域。

**签名**
```ts
Geometry.regionByEdges(target: OpenDeskGeometryTarget, options: OpenDeskGeometryEdgeRegionOptions): OpenDeskScreenRegion;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `OpenDeskGeometryTarget` | 是 | 无 | 父目标。 |
| `options.left` | `number` | 条件 | 未设置 | 左边距。 |
| `options.right` | `number` | 条件 | 未设置 | 右边距。 |
| `options.top` | `number` | 条件 | 未设置 | 上边距。 |
| `options.bottom` | `number` | 条件 | 未设置 | 下边距。 |
| `options.width` | `number` | 条件 | 未设置 | 固定宽度。 |
| `options.height` | `number` | 条件 | 未设置 | 固定高度。 |

**返回值**

`OpenDeskScreenRegion`。

**行为与错误**

水平方向必须恰好提供 `left/right/width` 中两个，垂直方向同理。结果必须完整位于父区域内；不自动裁剪或缩小。

**示例**
```js
const footer = Geometry.regionByEdges(win, { left: 16, right: 16, bottom: 12, height: 60 });
```

## Geometry.inset(target, margins)

向内缩目标并返回新区域。

**签名**
```ts
Geometry.inset(target: OpenDeskGeometryTarget, margins: number | OpenDeskGeometryMargins): OpenDeskScreenRegion;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `OpenDeskGeometryTarget` | 是 | 无 | 父目标。 |
| `margins` | `number \| OpenDeskGeometryMargins` | 是 | 无 | 单值四边相同，或逐边指定。 |

**返回值**

`OpenDeskScreenRegion`。

**行为与错误**

对象中未提供的边按 `0` 处理；内缩后必须仍有正面积。

**示例**
```js
const inner = Geometry.inset(footer, { left: 12, right: 12, top: 4, bottom: 8 });
```

## Geometry.anchorPoint(target, position, options?)

返回九宫格标准锚点。

**签名**
```ts
Geometry.anchorPoint(target: OpenDeskGeometryTarget, position: OpenDeskGeometryAnchorPosition, options?: { inset?: number | OpenDeskGeometryMargins }): OpenDeskScreenPoint;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `OpenDeskGeometryTarget` | 是 | 无 | 父目标。 |
| `position` | `OpenDeskGeometryAnchorPosition` | 是 | 无 | `top-left` 到 `bottom-right`。 |
| `options.inset` | `number \| OpenDeskGeometryMargins` | 否 | `0` | 选锚点前的内缩。 |

**返回值**

`OpenDeskScreenPoint`。

**行为与错误**

无法得到有效内部整数点时抛 `INVALID_ARGUMENT`。

**示例**
```js
const point = Geometry.anchorPoint(win, 'bottom-right', { inset: { right: 16, bottom: 12 } });
```

## Geometry.contains(region, point)

判断点是否位于区域内。

**签名**
```ts
Geometry.contains(region: OpenDeskScreenRegion, point: OpenDeskScreenPoint): boolean;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `region` | `OpenDeskScreenRegion` | 是 | 无 | tagged screen region。 |
| `point` | `OpenDeskScreenPoint` | 是 | 无 | tagged screen point。 |

**返回值**

`boolean`。

**行为与错误**

右边界和下边界排他；非法坐标空间抛 `INVALID_ARGUMENT`。

**示例**
```js
console.log(Geometry.contains(footer, Geometry.center(footer)));
```

## Geometry.intersect(regionA, regionB)

返回两个 screen region 的交集。

**签名**
```ts
Geometry.intersect(regionA: OpenDeskScreenRegion, regionB: OpenDeskScreenRegion): OpenDeskScreenRegion | null;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `regionA` | `OpenDeskScreenRegion` | 是 | 无 | 第一个区域。 |
| `regionB` | `OpenDeskScreenRegion` | 是 | 无 | 第二个区域。 |

**返回值**

`OpenDeskScreenRegion | null`。

**行为与错误**

无正面积交集返回 `null`；非法 region 抛 `INVALID_ARGUMENT`。

**示例**
```js
const visible = Geometry.intersect(footer, Screen.getVirtualBounds());
```

## 错误

Geometry 参数错误使用结构化 `Error`，`code` 为 `INVALID_ARGUMENT`，并带具体 `operation`。不会猜测单位、坐标空间或过度约束时的优先级。
