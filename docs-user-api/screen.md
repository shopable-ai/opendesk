---
title: Screen API
description: 屏幕信息、显示器枚举、虚拟桌面边界与像素颜色读取。
order: 5
---

# Screen

Screen 用于读取显示器信息、虚拟桌面范围，以及按坐标取色。

运行时额外绑定
- `Screen.screenshot = page.screenshot`
- 所以截图能力请优先查看 page.md 中的 `page.screenshot()`

## 方法总表

| 方法 | 用途 |
| --- | --- |
| Screen.getWidth() | 主显示器宽度 |
| Screen.getHeight() | 主显示器高度 |
| Screen.getDisplays() | 列出所有显示器 |
| Screen.getPrimaryDisplay() | 获取主显示器 |
| Screen.getDisplay(index) | 获取指定 index 的显示器 |
| Screen.getVirtualBounds() | 获取整个虚拟桌面边界 |
| Screen.pixel(x, y) | 获取单个像素颜色 |
| Screen.pixels(points, scaled) | 批量取色 |
| Screen.screenshot(options) | 等同 page.screenshot |

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
  id: 'primary',
  isPrimary: true,
  x: 0,
  y: 0,
  width: 1512,
  height: 982,
  pixelWidth: 3024,
  pixelHeight: 1964,
  scale: 2
}
```

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

## Screen.screenshot(options)

**说明**
- 运行时通过 `Screen.screenshot = page.screenshot` 绑定
- 参数、返回值、错误行为与 `page.screenshot()` 完全一致

**示例**

```js
await Screen.screenshot({
  target: 'screen',
  path: './artifacts/screen.png'
});
```

## 实战示例

**示例 1：打印所有显示器并截图第二屏**

```js
const displays = Screen.getDisplays();
console.log(JSON.stringify(displays, null, 2));

await page.screenshot({
  target: 'screen',
  displayIndex: 2,
  path: './artifacts/display-2.png'
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
