---
title: Input APIs
description: OpenDesk JavaScript Runtime 的键盘和触屏输入接口；鼠标见独立 Mouse API。
order: 3
---

# keyboard / touchscreen

这两个对象默认都会注入：
- keyboard
- touchscreen

同时也会挂在 page 上：
- page.keyboard
- page.touchscreen

适用场景
- 键盘输入、按键、组合键
- 简单触屏 tap

`keyboard` 只负责 OpenDesk 向操作系统发送输入；需要由系统级按键反向触发当前
JavaScript Runtime 时，使用独立的 [globalShortcut](global-shortcut.md)，不要把注册能力加到
`keyboard`。

鼠标移动、点击、拖拽、位置读取与滚轮请查看独立的 [Mouse API](mouse.md)。`mouse` 和
`page.mouse` 均可使用，坐标、平台限制与安全边界均以该页面为准。

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

## mouse / keyboard / touchscreen：实战示例

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

## mouse / keyboard / touchscreen：兼容说明

旧文档倾向把交互动作写到 page.click(selector) / page.type(selector, text) 下面。

当前项目更适合按对象分层理解：
- page：截图、打开、权限、等待
- mouse：坐标点击与移动
- keyboard：文本与按键
- touchscreen：轻量 tap

这样更符合当前源码，也更接近桌面自动化实际用法。
