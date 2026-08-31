---
title: Input APIs
description: mouse、keyboard、touchscreen 的用户文档。
order: 3
---

# mouse / keyboard / touchscreen

这三个对象默认都会注入：
- mouse
- keyboard
- touchscreen

同时也会挂在 page 上：
- page.mouse
- page.keyboard
- page.touchscreen

适用场景
- 鼠标移动、点击、滚轮
- 键盘输入、按键、组合键
- 简单触屏 tap

## mouse

**方法总表**

| 方法 | 用途 |
| --- | --- |
| mouse.click(x, y, options) | 在指定坐标点击 |
| mouse.clickForPID(processID, x, y) | macOS 向指定 PID 的可见窗口定向投递左键点击 |
| mouse.move(x, y, options) | 移动鼠标，可分步平滑移动 |
| mouse.down(options) | 按下鼠标键 |
| mouse.up(options) | 释放鼠标键 |
| mouse.getPos() | 获取当前鼠标坐标 |
| mouse.wheel(options) | 滚轮滚动 |

## mouse.click(x, y, options)

**签名**

```js
await mouse.click(x, y, options)
```

**参数**

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| x | number | - | 屏幕 x 坐标 |
| y | number | - | 屏幕 y 坐标 |
| options.button | string | left | left / right / middle |
| options.clickCount | number | 1 | 点击次数 |
| options.delay | number | 0 | 按下与抬起间延迟，毫秒 |

**行为规则**

- 默认情况下，macOS 使用 robotgo 的原生 `MoveClick` 完成移动和成对按下/抬起；`await` 在宿主调用返回后继续。
- 显式设置 `options.delay > 0` 时，保留 `mouse.move` 后按 `clickCount` 次数执行 down / 等待 / up 的语义，`delay` 是每次按下与抬起之间的毫秒数。
- 这是全局鼠标操作，接收者由点击时桌面的命中测试决定，不绑定进程；button 非法会直接报错。

**错误条件**
- `invalid button type: ...`

**示例**

```js
await mouse.click(400, 300);
await mouse.click(400, 300, { button: 'right' });
await mouse.click(600, 420, { clickCount: 2, delay: 80 });
```

## mouse.clickForPID(processID, x, y)

**签名**

```js
await mouse.clickForPID(processID, x, y)
```

**行为规则**

- 仅支持启用 cgo 的 macOS 构建，且只激活支持 Accessibility `AXPress` 的控件。
- `processID` 必须是正的 32 位整数；`x` / `y` 必须是有限的全局虚拟桌面坐标。目标点可以位于负坐标显示器，但必须落在当前活动显示器和该 PID 的当前可见窗口内。
- 宿主在指定 PID 的 Accessibility 树中按全局点命中控件，复核命中元素仍属于该 PID 且支持 `AXPress`，移动可见指针后只执行一次 `AXPress`。接收者不由动作期间的前台应用决定。
- `await` 会等待 Accessibility 接受这次 press 调用，但没有业务状态回执；调用方仍应短暂等待并读取应用状态或截图验证结果。
- 该方法不会投递 CoreGraphics down/up 原始鼠标事件，因此不适用于画布、拖拽或只监听原始鼠标事件的区域。此时它会返回“控件不支持 press”，不会退回全局点击。
- 该方法不自动重试或补点。参数、权限、进程、显示器、窗口、命中元素、指针移动或 press 失败都会直接返回错误。
- `mouse.click()` 保持全局鼠标语义，**不绑定 PID**；两者不可互换。

**权限**

- 实际运行 runtime 的宿主需要 macOS“辅助功能”权限；权限绑定宿主身份。屏幕截图验证还需要“屏幕录制”权限。
- 安全脚本应在动作前后重新读取 PID、应用身份、窗口边界和显示器，并从当前窗口原点加已审查的相对坐标计算目标点。

**示例**

```js
const active = await window.getActiveWindow();
if (!active || active.exeName !== 'Calculator' || active.pid <= 0) {
  throw new Error('Calculator is not active');
}
await mouse.clickForPID(active.pid, clickPoint.x, clickPoint.y);
```

## mouse.move(x, y, options)

**签名**

```js
await mouse.move(x, y, options)
```

**参数**

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| x | number | - | 目标 x |
| y | number | - | 目标 y |
| options.steps | number | 1 | 大于 1 时分步平滑移动 |

**示例**

```js
await mouse.move(300, 200);
await mouse.move(900, 500, { steps: 20 });
```

## mouse.down(options)

**签名**

```js
await mouse.down(options)
```

**参数**

| 参数 | 类型 | 默认值 |
| --- | --- | --- |
| options.button | string | left |

**示例**

```js
await mouse.down({ button: 'left' });
await mouse.move(800, 500, { steps: 10 });
await mouse.up({ button: 'left' });
```

## mouse.up(options)

**签名**

```js
await mouse.up(options)
```

**参数**

| 参数 | 类型 | 默认值 |
| --- | --- | --- |
| options.button | string | left |

## mouse.getPos()

**签名**

```js
const pos = mouse.getPos()
```

**返回值**

```js
{ x: number, y: number }
```

**示例**

```js
console.log(mouse.getPos());
```

## mouse.wheel(options)

**签名**

```js
await mouse.wheel(options)
```

**参数**

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| options.deltaX | number | 0 | 水平滚动量 |
| options.deltaY | number | 0 | 垂直滚动量 |
| options.steps | number | 1 | 分几步滚动 |
| options.delay | number | 0 | 每步间延迟毫秒 |

**示例**

```js
await mouse.wheel({ deltaY: -300 });
await mouse.wheel({ deltaY: 500, steps: 10, delay: 20 });
```

## keyboard

**方法总表**

| 方法 | 用途 |
| --- | --- |
| keyboard.type(text) | 输入文本 |
| keyboard.press(key) | 点击单个按键 |
| keyboard.down(key) | 按住按键 |
| keyboard.up(key) | 释放按键 |
| keyboard.combination(...keys) | 组合键 |

## keyboard.type(text)

**签名**

```js
await keyboard.type(text)
```

**参数**

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| text | string | 要输入的文本 |

**错误条件**
- 空字符串会报错：`input text cannot be empty`

**示例**

```js
await keyboard.type('hello world');
await keyboard.type('https://example.com');
```

## keyboard.press(key)

**签名**

```js
await keyboard.press(key)
```

**说明**
- 按下并释放单个键
- 会做常见键名规范化

**常见映射示例**
- Enter -> enter
- Return -> enter
- Escape -> escape
- ArrowUp -> up
- ArrowDown -> down
- ArrowLeft -> left
- ArrowRight -> right
- Meta -> command
- Control -> ctrl

**示例**

```js
await keyboard.press('Enter');
await keyboard.press('Escape');
await keyboard.press('ArrowDown');
```

## keyboard.down(key)

**签名**

```js
await keyboard.down(key)
```

**示例**

```js
await keyboard.down('Shift');
await keyboard.press('ArrowRight');
await keyboard.up('Shift');
```

## keyboard.up(key)

**签名**

```js
await keyboard.up(key)
```

## keyboard.combination(...keys)

**签名**

```js
await keyboard.combination(...keys)
```

**作用**
- 依次按下所有键，再逆序释放

**示例**

```js
await keyboard.combination('Meta', 'C');
await keyboard.combination('Control', 'Shift', 'Escape');
```

**注意**
- 当前实现按顺序执行 down/up，并非系统级原子快捷键 API
- 但对大多数复制、粘贴、关闭窗口等场景足够实用

## touchscreen

**方法总表**

| 方法 | 用途 |
| --- | --- |
| touchscreen.tap(x, y) | 在指定坐标做一次 tap |

## touchscreen.tap(x, y)

**签名**

```js
await touchscreen.tap(x, y)
```

**作用**
- 用鼠标左键 down/up 模拟一次触摸
- 适合简单点按，不适合复杂手势

**示例**

```js
await touchscreen.tap(500, 600);
```

## 实战示例

**示例 1：拖拽窗口中的元素**

```js
await mouse.move(300, 300);
await mouse.down({ button: 'left' });
await mouse.move(900, 300, { steps: 30 });
await mouse.up({ button: 'left' });
```

**示例 2：打开地址后输入并确认**

```js
await page.openApp('Safari');
await page.waitForTimeout(1000);
await keyboard.type('https://example.com');
await keyboard.press('Enter');
```

**示例 3：滚动并截图**

```js
await mouse.wheel({ deltaY: 600, steps: 8, delay: 10 });
await page.waitForTimeout(500);
await page.screenshot({ path: './.runtime/examples/after-scroll.png' });
```

## 与旧文档的差异

旧文档倾向把交互动作写到 page.click(selector) / page.type(selector, text) 下面。

当前项目更适合按对象分层理解：
- page：截图、打开、权限、等待
- mouse：坐标点击与移动
- keyboard：文本与按键
- touchscreen：轻量 tap

这样更符合当前源码，也更接近桌面自动化实际用法。
