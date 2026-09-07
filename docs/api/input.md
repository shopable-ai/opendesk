---
title: Input APIs
description: OpenDesk JavaScript Runtime 的键盘和轻量触屏输入接口。
order: 3
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
| `keyboard.combination(...keys)` | 顺序按下并逆序释放组合键。 |
| `touchscreen.tap(x, y)` | 在全局坐标执行一次轻量 tap。 |

## 公共约定

### 键名

`keyboard` 会规范化常见键名，例如 `Enter` / `Return` → `enter`、`Escape` → `escape`、`ArrowUp` → `up`、`Meta` → `command`、`Control` → `ctrl`。

### 输入边界

这些方法向真实桌面发送输入，不注册系统级快捷键。需要系统快捷键回调时使用 [`globalShortcut`](global-shortcut.md)。Promise resolve 只表示输入调用完成，不证明目标应用业务状态已完成。

**Keyboard APIs**

## keyboard.type(text)

向当前输入目标输入文本。

**签名**
```ts
keyboard.type(text: string): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `text` | `string` | 是 | 无 | 要输入的非空文本。 |

**返回值**

`Promise<void>`。

**行为与错误**

空字符串会拒绝；方法不负责聚焦目标控件，也不验证文本是否被应用接受。

**示例**
```js
await keyboard.type('hello world');
```

## keyboard.press(key)

按下并释放单个键。

**签名**
```ts
keyboard.press(key: string): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `key` | `string` | 是 | 无 | 支持的键名。 |

**返回值**

`Promise<void>`。

**行为与错误**

常见键名会按公共映射规范化；未知或无效键名会拒绝。

**示例**
```js
await keyboard.press('Enter');
await keyboard.press('ArrowDown');
```

## keyboard.down(key)

发送一个键的按下事件并保持按下状态。

**签名**
```ts
keyboard.down(key: string): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `key` | `string` | 是 | 无 | 要按下的键名。 |

**返回值**

`Promise<void>`。

**行为与错误**

不会自动释放；调用方应使用 `try/finally` 与 `keyboard.up()` 成对清理。

**示例**
```js
await keyboard.down('Shift');
try {
  await keyboard.press('ArrowRight');
} finally {
  await keyboard.up('Shift');
}
```

## keyboard.up(key)

释放一个按下的键。

**签名**
```ts
keyboard.up(key: string): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `key` | `string` | 是 | 无 | 要释放的键名。 |

**返回值**

`Promise<void>`。

**行为与错误**

发送对应 key-up 事件；无效键名会拒绝。

**示例**
```js
await keyboard.up('Shift');
```

## keyboard.combination(...keys)

按顺序按下所有键，再逆序释放，形成常用组合键。

**签名**
```ts
keyboard.combination(...keys: string[]): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `keys` | `string[]` | 是 | 无 | 非空键名序列。 |

**返回值**

`Promise<void>`。

**行为与错误**

组合按顺序执行 down/up，并非系统级原子快捷键 API。无效键名会使调用拒绝。

**示例**
```js
await keyboard.combination('Meta', 'C');
```

**Touchscreen API**

## touchscreen.tap(x, y)

在全局坐标模拟一次简单 tap。

**签名**
```ts
touchscreen.tap(x: number, y: number): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `x` | `number` | 是 | 无 | 全局 X 坐标。 |
| `y` | `number` | 是 | 无 | 全局 Y 坐标。 |

**返回值**

`Promise<void>`。

**行为与错误**

使用一次左键 down/up 模拟轻量点按；不提供多指、长按或复杂手势。非法坐标会拒绝。

**示例**
```js
await touchscreen.tap(500, 600);
```

## 平台与能力

输入是否真正可达目标应用取决于当前平台后端、系统权限、前台窗口和命中测试。需要可重算坐标时使用 [`Geometry`](geometry.md)，需要语义定位时优先使用 [`UI`](desktop-ui.md)。
