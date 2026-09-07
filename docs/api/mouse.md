---
title: Mouse API
description: OpenDesk JavaScript Runtime 的全局鼠标移动、点击、拖拽、位置读取与滚轮接口。
order: 3
---

# mouse

`mouse` 向真实桌面发送全局鼠标输入；`page.mouse` 是同一能力的兼容入口。坐标使用虚拟桌面 screen logical coordinate。

## API 一览

| 方法 | 用途 |
| --- | --- |
| `mouse.click(x, y, options?)` | 移动到屏幕点并点击。 |
| `mouse.clickPoint(point, options?)` | 点击 tagged screen point。 |
| `mouse.clickForPID(processID, x, y)` | macOS 对指定 PID 的可按压 Accessibility 控件执行 `AXPress`。 |
| `mouse.move(x, y, options?)` | 移动指针。 |
| `mouse.down(options?)` | 按下鼠标键。 |
| `mouse.up(options?)` | 释放鼠标键。 |
| `mouse.getPos()` | 读取当前指针坐标。 |
| `mouse.wheel(options?)` | 在当前指针位置滚动。 |

## 公共约定

### 坐标与按钮

`click()` / `move()` 使用全局虚拟桌面逻辑坐标。优先使用 [`Geometry`](geometry.md) 或 [`UI`](desktop-ui.md) 生成的 tagged point，并在输入前确认目标窗口。

`button` 只支持 `left`、`right`、`middle`。鼠标输入调用成功不等于目标应用业务状态已完成，输入后仍应读取状态或截图验证。

### 权限与平台

macOS 发送全局输入通常需要 Accessibility 权限；截图验证另需 Screen Recording。`mouse.clickForPID()` 仅在启用 cgo 的 macOS 构建中可用，并且不会降级为普通全局点击。

## mouse.click(x, y, options?)

移动到全局屏幕点并执行一次或多次点击。

**签名**
```ts
mouse.click(x: number, y: number, options?: OpenDeskMouseClickOptions): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `x` | `number` | 是 | 无 | 全局 X 坐标。 |
| `y` | `number` | 是 | 无 | 全局 Y 坐标。 |
| `options.button` | `'left' \| 'right' \| 'middle'` | 否 | `'left'` | 鼠标键。 |
| `options.clickCount` | `number` | 否 | `1` | 顺序点击次数。 |
| `options.delay` | `number` | 否 | `0` | 每次 down/up 之间的毫秒延迟。 |

**返回值**

`Promise<void>`，成功 resolve `undefined`。

**行为与错误**

默认路径移动后成对 down/up。`clickCount <= 0` 当前不发送点击。非法按钮或坐标会拒绝；不会保证命中指定进程。

**示例**
```js
await mouse.click(400, 300, { button: 'left', clickCount: 2, delay: 80 });
```

## mouse.clickPoint(point, options?)

点击明确标记为 screen logical coordinate 的点。

**签名**
```ts
mouse.clickPoint(point: OpenDeskScreenPoint, options?: OpenDeskMouseClickOptions): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `point` | `OpenDeskScreenPoint` | 是 | 无 | 必须带 `coordinateSpace: 'screen'`。 |
| `options` | `OpenDeskMouseClickOptions` | 否 | `{}` | 与 `mouse.click()` 相同的点击选项。 |

**返回值**

`Promise<void>`。

**行为与错误**

裸 `{x,y}`、OCR image bbox 或其他坐标空间抛 `INVALID_ARGUMENT`。内部复用 `mouse.click(point.x, point.y, options)`。

**示例**
```js
const win = await window.getActiveWindow();
await mouse.clickPoint(Geometry.center(win));
```

## mouse.clickForPID(processID, x, y)

在 macOS 上对指定 PID 的可按压 Accessibility 元素执行一次 `AXPress`。

**签名**
```ts
mouse.clickForPID(processID: number, x: number, y: number): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `processID` | `number` | 是 | 无 | 正的 32 位整数 PID。 |
| `x` | `number` | 是 | 无 | 有限全局 X 坐标。 |
| `y` | `number` | 是 | 无 | 有限全局 Y 坐标。 |

**返回值**

`Promise<void>`。

**行为与错误**

调用会验证权限、PID、显示器、窗口 owner、命中元素及其 `AXPress` 支持；任一步失败都拒绝，不重试、不补点、不降级为 `mouse.click()`。非 macOS / 无 cgo 明确不支持。

**示例**
```js
const active = await window.getActiveWindow();
await mouse.clickForPID(active.pid, point.x, point.y);
```

## mouse.move(x, y, options?)

移动鼠标指针到全局坐标。

**签名**
```ts
mouse.move(x: number, y: number, options?: OpenDeskMouseMoveOptions): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `x` | `number` | 是 | 无 | 目标 X 坐标。 |
| `y` | `number` | 是 | 无 | 目标 Y 坐标。 |
| `options.steps` | `number` | 否 | `1` | 大于 1 时分步移动。 |

**返回值**

`Promise<void>`。

**行为与错误**

`steps <= 1` 直接移动；大于 1 时分步。按钮保持按下时，macOS 会发送对应拖拽事件。非法坐标拒绝。

**示例**
```js
await mouse.move(900, 300, { steps: 30 });
```

## mouse.down(options?)

按下指定鼠标键。

**签名**
```ts
mouse.down(options?: OpenDeskMouseButtonOptions): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options.button` | `'left' \| 'right' \| 'middle'` | 否 | `'left'` | 要按下的按钮。 |

**返回值**

`Promise<void>`。

**行为与错误**

仅发送 down 事件，不自动释放。调用方应使用 `try/finally` 与 `mouse.up()` 成对使用。

**示例**
```js
await mouse.down({ button: 'left' });
```

## mouse.up(options?)

释放指定鼠标键。

**签名**
```ts
mouse.up(options?: OpenDeskMouseButtonOptions): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options.button` | `'left' \| 'right' \| 'middle'` | 否 | `'left'` | 要释放的按钮。 |

**返回值**

`Promise<void>`。

**行为与错误**

仅发送 up 事件。应与同一脚本中的对应 `down()` 使用相同按钮。

**示例**
```js
await mouse.up({ button: 'left' });
```

## mouse.getPos()

读取当前指针的全局虚拟桌面坐标。

**签名**
```ts
mouse.getPos(): { x: number; y: number };
```

**参数**

无。

**返回值**

`{ x: number, y: number }`。

**行为与错误**

同步读取，不移动指针，也不要求目标窗口位于前台。

**示例**
```js
const position = mouse.getPos();
console.log(position.x, position.y);
```

## mouse.wheel(options?)

在当前指针位置发送滚轮输入。

**签名**
```ts
mouse.wheel(options?: OpenDeskMouseWheelOptions): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options.deltaX` | `number` | 否 | `0` | 水平总滚动量；正值向右。 |
| `options.deltaY` | `number` | 否 | `0` | 垂直总滚动量；正值向下。 |
| `options.steps` | `number` | 否 | `1` | 分步次数；`<=0` 按 1 处理。 |
| `options.delay` | `number` | 否 | `0` | 每一步后的毫秒等待。 |

**返回值**

`Promise<void>`。

**行为与错误**

`deltaX` / `deltaY` 是总量，Runtime 尽量均分到各步并把整数余量放到最后一步。滚轮接收者由当前指针位置和系统命中测试决定。

**示例**
```js
await mouse.wheel({ deltaY: 300, steps: 3, delay: 20 });
```

## 错误

全局鼠标方法会对非法坐标、按钮和选项明确失败。`clickPoint()` 使用结构化 `INVALID_ARGUMENT`。真实输入完成后不要把 Promise resolve 解释为业务成功。
