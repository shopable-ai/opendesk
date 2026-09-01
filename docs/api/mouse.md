---
title: Mouse API
description: OpenDesk JavaScript Runtime 的全局鼠标移动、点击、拖拽、位置读取与滚轮接口。
order: 3
---

# Mouse API

`mouse` 用于向当前桌面发送全局鼠标输入。`page.mouse` 是同一 Runtime 中的同一组能力，
两种写法可以互换。

```js
await mouse.move(640, 360);
await page.mouse.click(640, 360);
```

所有坐标均为全局虚拟桌面坐标，不是窗口或截图局部坐标。多显示器脚本应先读取
[`Screen.getVirtualBounds()`](screen.md#screengetvirtualbounds) 和
[`Screen.getDisplays()`](screen.md#screengetdisplays)；以窗口为目标时，先读取当前窗口边界，
再由已验证的窗口相对坐标计算全局点。

## 使用前的安全边界

- `click`、`move`、`down`、`up` 和 `wheel` 会影响真实桌面。接收者由当前指针位置、前台
  窗口和系统命中测试决定；执行前应聚焦并确认目标窗口，执行后应读取状态或截图验证。
- macOS 宿主通常需要“辅助功能”权限才能发送输入；截图验证还需要“屏幕录制”权限。权限
  绑定实际运行 OpenDesk 的宿主程序身份。
- `await` 表示 OpenDesk 已完成输入调用，不表示目标应用的业务操作已完成。状态会变化的操作
  必须显式等待并验证。
- `mouse.clickForPID()` 是例外：它仅在启用 cgo 的 macOS 上可用，使用 Accessibility 的
  `AXPress` 定向操作控件，绝不退回为全局鼠标点击。

## 方法总表

| 方法 | 用途 |
| --- | --- |
| `mouse.click(x, y, options?)` | 移动到屏幕点并点击 |
| `mouse.clickForPID(processID, x, y)` | macOS：对指定 PID 的可按压 Accessibility 控件执行一次 `AXPress` |
| `mouse.move(x, y, options?)` | 移动指针；可分步移动 |
| `mouse.down(options?)` | 按下鼠标键 |
| `mouse.up(options?)` | 释放鼠标键 |
| `mouse.getPos()` | 读取当前指针的全局坐标 |
| `mouse.wheel(options?)` | 在当前指针位置滚动 |

所有 `button` 参数只支持 `left`、`right` 或 `middle`。其他值会抛出
`invalid button type: ...`。

## `mouse.click(x, y, options?)`

```js
await mouse.click(x, y, options);
```

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `x` | number | — | 全局屏幕 X 坐标 |
| `y` | number | — | 全局屏幕 Y 坐标 |
| `options.button` | `left` \| `right` \| `middle` | `left` | 鼠标键 |
| `options.clickCount` | number | `1` | 顺序执行的点击次数 |
| `options.delay` | number | `0` | 每次按下与释放之间的延迟，单位为毫秒 |

默认路径会在目标点完成移动和成对的按下/释放。macOS 在 `delay` 为 `0` 时使用原生
`MoveClick` 路径；显式设置正的 `delay` 时，会执行“移动 → down → 等待 → up”，并按
`clickCount` 重复。`clickCount` 小于等于 `0` 时，当前实现不会发送点击。

```js
await mouse.click(400, 300);
await mouse.click(400, 300, { button: 'right' });
await mouse.click(600, 420, { clickCount: 2, delay: 80 });
```

这是全局点击，不能保证命中某个进程或窗口。需要 macOS 上 fail-closed 的进程定向控件操作时，
使用 [`mouse.clickForPID`](#mouseclickforpidprocessid-x-y)。

## `mouse.clickForPID(processID, x, y)`

```js
await mouse.clickForPID(processID, x, y);
```

此方法仅支持**启用 cgo 的 macOS 构建**。它只执行一次左键语义的 Accessibility `AXPress`，
而不发送 CoreGraphics `mouseDown` / `mouseUp` 事件。

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `processID` | number | 正的 32 位整数 PID |
| `x` | number | 有限的全局虚拟桌面 X 坐标 |
| `y` | number | 有限的全局虚拟桌面 Y 坐标 |

调用会依次确认：辅助功能权限、目标进程、点所属的活动显示器、该 PID 在该点的可见窗口、
Accessibility 命中元素、元素所属 PID，以及元素是否支持 `AXPress`。任何一项不成立都会
抛出错误；不会重试、补点或降级为 `mouse.click()`。

它适合标准原生控件，不适合画布、拖拽区或只监听原始鼠标事件的 UI。`AXPress` 调用成功也不
表示业务状态已经变化，仍须验证 UI。

```js
const active = await window.getActiveWindow();
if (!active || active.pid <= 0 || active.title !== 'Target window') {
  throw new Error('目标窗口不符合预期');
}

// point 必须来自刚读取并核验的窗口边界或当前屏幕识别结果。
await mouse.clickForPID(active.pid, point.x, point.y);
```

常见错误包括：`processID must be a positive 32-bit integer`、`click coordinates must be finite numbers`、
辅助功能权限不可用、点不在活动显示器中、PID 在该点没有可见窗口、命中元素不支持 press，或
运行在非 macOS / 未启用 cgo 的构建中。

## `mouse.move(x, y, options?)`

```js
await mouse.move(x, y, options);
```

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `x` | number | — | 目标全局屏幕 X 坐标 |
| `y` | number | — | 目标全局屏幕 Y 坐标 |
| `options.steps` | number | `1` | 大于 `1` 时在起点与终点之间分步移动 |

`steps` 为 `1` 或更小时直接移动；大于 `1` 时每步间隔约 1ms。macOS 中若已有
`mouse.down()` 尚未对应 `mouse.up()`，移动会发送相应按钮的拖拽事件。始终在 `finally`
中释放按钮，避免脚本出错后留下按下状态。

```js
await mouse.move(source.x, source.y);
let pressed = false;
try {
  await mouse.down({ button: 'left' });
  pressed = true;
  await mouse.move(destination.x, destination.y, { steps: 20 });
} finally {
  if (pressed) await mouse.up({ button: 'left' });
}
```

## `mouse.down(options?)` 与 `mouse.up(options?)`

```js
await mouse.down(options);
await mouse.up(options);
```

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `options.button` | `left` \| `right` \| `middle` | `left` | 要按下或释放的鼠标键 |

这两个方法分别发送单独的按钮事件。OpenDesk 会记录由该 Runtime 按下的按钮，用于 macOS
后续 `mouse.move()` 的拖拽事件选择；它不替你判断目标应用是否已收到事件，也不应作为跨脚本
共享的“鼠标锁”。同一段脚本应使用相同 `button` 成对调用。

```js
await mouse.down({ button: 'right' });
try {
  await mouse.move(800, 500, { steps: 10 });
} finally {
  await mouse.up({ button: 'right' });
}
```

## `mouse.getPos()`

```js
const position = mouse.getPos();
// { x: number, y: number }
```

返回当前指针的全局虚拟桌面坐标。它不移动指针，也不需要目标窗口处于前台。

```js
const position = mouse.getPos();
console.log(`pointer: ${position.x}, ${position.y}`);
```

## `mouse.wheel(options?)`

```js
await mouse.wheel(options);
```

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `options.deltaX` | number | `0` | 水平总滚动量；正值向右，负值向左 |
| `options.deltaY` | number | `0` | 垂直总滚动量；正值向下，负值向上 |
| `options.steps` | number | `1` | 将总量分为几次滚动；小于等于 `0` 时按 `1` 处理 |
| `options.delay` | number | `0` | 每一步后的等待，单位为毫秒（包括最后一步） |

`deltaX` 和 `deltaY` 是总量，不是每步量。OpenDesk 会尽量平均分配到每步，并将整数余量
放到最后一步，因此各步之和等于请求的总量。滚轮作用于调用时指针所在位置；通常先移动到
已聚焦、可滚动的目标区域，并在操作后验证实际滚动位置，而不只检查是否收到了 wheel 事件。

```js
await mouse.move(scrollRegion.x, scrollRegion.y);
await mouse.wheel({ deltaY: 300, steps: 3, delay: 20 });
await mouse.wheel({ deltaY: -300, steps: 3, delay: 20 });
```
