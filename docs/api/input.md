---
docType: reference
title: Input APIs
description: OpenDesk JavaScript Runtime 的键盘和轻量触屏输入接口。
order: 70
---

# Input APIs

OpenDesk 默认注入 `keyboard` 与 `touchscreen`，并提供 `page.keyboard` / `page.touchscreen` 兼容入口。鼠标能力见 [`mouse`](mouse.md)。

## API 一览

| 方法 | 用途 |
| --- | --- |
| `keyboard.type(text)` | 输入文本。 |
| `keyboard.press(key)` | 按下并释放单个键。 |
| `keyboard.down(key)` | 按住一个键。 |
| `keyboard.up(key)` | 释放一个键。 |
| `keyboard.combination(...keys)` | 以前缀修饰键触发最后一个主键。 |
| `touchscreen.tap(x, y)` | 在全局坐标执行一次轻量 tap。 |

## 公共约定

### 键名

`keyboard` 会规范化常见键名，例如 `Enter` / `Return` → `enter`、`Escape` → `escape`、`ArrowUp` → `up`、`Meta` → `cmd`、`Control` → `ctrl`。

### 输入边界

这些方法向真实桌面发送输入，不注册系统级快捷键。需要系统快捷键回调时使用 [`globalShortcut`](global-shortcut.md)。本页方法同步执行，成功返回 `undefined`，已报告的错误同步抛出；没有 Promise 返回。调用完成不证明目标应用业务状态已完成。

**Keyboard APIs**

## keyboard.type(text)

向当前输入目标输入文本。

**签名**
```ts
keyboard.type(text: string): void;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `text` | `string` | 是 | 无 | 要输入的非空文本。 |

**返回值**

`undefined`，同步返回。

**行为与错误**

空字符串会同步抛错；方法不负责聚焦目标控件，也不验证文本是否被应用接受。

**示例**
```js
keyboard.type('hello world');
```

## keyboard.press(key)

按下并释放单个键。

**签名**
```ts
keyboard.press(key: string): void;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `key` | `string` | 是 | 无 | 支持的键名。 |

**返回值**

`undefined`，同步返回。

**行为与错误**

常见键名会按公共映射规范化。非字符串、空键名或不识别的键名在提交输入前同步抛错。键盘后端报告的错误也同步抛出。有效键名的可用性取决于操作系统与键盘布局。

**示例**
```js
keyboard.press('Enter');
keyboard.press('ArrowDown');
```

## keyboard.down(key)

发送一个键的按下事件并保持按下状态。

**签名**
```ts
keyboard.down(key: string): void;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `key` | `string` | 是 | 无 | 要按下的键名。 |

**返回值**

`undefined`，同步返回。

**行为与错误**

不会自动释放；调用方应使用 `try/finally` 与 `keyboard.up()` 成对清理。键名校验和后端错误处理与 `keyboard.press()` 相同。

**示例**
```js
keyboard.down('Shift');
try {
  keyboard.press('ArrowRight');
} finally {
  keyboard.up('Shift');
}
```

## keyboard.up(key)

释放一个按下的键。

**签名**
```ts
keyboard.up(key: string): void;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `key` | `string` | 是 | 无 | 要释放的键名。 |

**返回值**

`undefined`，同步返回。

**行为与错误**

发送对应 key-up 事件。键名校验和后端错误处理与 `keyboard.press()` 相同。

**示例**
```js
keyboard.up('Shift');
```

## keyboard.combination(...keys)

将最后一个键作为主键，前面的键作为修饰键，发送一次成对的组合键输入。

**签名**
```ts
keyboard.combination(...keys: string[]): void;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `keys` | `string[]` | 是 | 无 | 至少一个键名；最后一项是主键，前缀只能使用修饰键，如 `Meta`、`Control`、`Alt`、`Shift`。 |

**返回值**

`undefined`，同步返回。

**行为与错误**

先按公共映射规范化键名，再把前缀合并为修饰键标志，用最后一项执行一次按下/释放；不会依次对所有键调用 `down()` / `up()`。只有一个键时等同 `keyboard.press()`。

无参数、非字符串、空或纯空白键名、不识别的主键，以及任一无效修饰键前缀，都会在提交输入前同步抛错。键盘后端报告的错误也同步抛出。

**示例**
```js
keyboard.combination('Meta', 'C');
```

**Touchscreen API**

## touchscreen.tap(x, y)

在全局坐标模拟一次简单 tap。

**签名**
```ts
touchscreen.tap(x: number, y: number): void;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `x` | `number` | 是 | 无 | 全局 X 坐标。 |
| `y` | `number` | 是 | 无 | 全局 Y 坐标。 |

**返回值**

`undefined`，同步返回。

**行为与错误**

使用一次左键 down/up 模拟轻量点按；不提供多指、长按或复杂手势。调用方须预先验证坐标；当前实现不提供完整的坐标有效性或范围检查。

**示例**
```js
touchscreen.tap(500, 600);
```

## 平台与能力

输入是否真正可达目标应用取决于当前平台后端、系统权限、前台窗口和命中测试。需要可重算坐标时使用 [`Geometry`](geometry.md)，需要语义定位时优先使用 [`UI`](desktop-ui.md)。
