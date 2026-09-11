---
title: Mouse API
description: OpenDesk JavaScript Runtime 的全局鼠标移动、点击、拖拽、位置读取与滚轮接口。
order: 60
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
| `options.steps` | `number` | 否 | `1`，指定 `durationMs` 时自动采样 | 大于 1 时使用明确的采样步数；与 `durationMs` 同用时必须是 `2..2000` 的整数；steps-only 保留旧行为。 |
| `options.durationMs` | `number` | 否 | 无 | 整个调用的时间预算，必须是 `1..30000` 的整数毫秒。 |
| `options.curve` | `'linear' \| 'easeInOut'` | 否 | `'linear'` | 插值曲线；`easeInOut` 使用起止速度均为 0 的平滑曲线。 |

**返回值**

`Promise<void>`。

**行为与错误**

未指定 `durationMs` 时保持兼容行为：`steps <= 1` 直接移动，大于 1 时按旧有的每步约 1ms 采样；`curve` 只改变这些采样点的位置。指定 `durationMs` 时，native automation owner 在该总预算内按单调时间表发出采样点；未指定 `steps` 时使用约 16ms 的自动采样间隔并设内部上限。`easeInOut` 使用 `3t² - 2t³`，起点和终点速度连续且为 0，最后一个采样点固定为目标坐标。

`durationMs` 包含 macOS 必需的有界 Quartz 稳定间隔，因此可与外部 `sleep` 预算相加；实际墙钟时间仍可能受系统调度产生小幅正向误差。Windows、Linux 与 macOS 共用相同的曲线、取整和采样规则；macOS 在按钮保持按下时发送对应拖拽事件。execution 取消会中止剩余等待和后续采样，Promise 拒绝并把指针留在最后一个已提交的点。非法 duration、curve 或坐标会拒绝。

**示例**
```js
await mouse.move(900, 300, { durationMs: 420, curve: 'easeInOut' });
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

仅发送 down 事件，不自动释放。macOS 返回前的有界稳定间隔只保证同一 Runtime 的后续输入不会立即越过已提交的按钮转换，不证明目标业务状态已经变化。调用方应使用 `try/finally` 与 `mouse.up()` 成对使用。

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

仅发送 up 事件。macOS 返回前同样保留有界 native 事件稳定间隔；它不是业务结果检查。应与同一脚本中的对应 `down()` 使用相同按钮。

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
