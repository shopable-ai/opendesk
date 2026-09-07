---
title: Window API
description: window 对象用于读取当前窗口信息，并进行聚焦、移动、缩放、置顶等桌面窗口控制。
order: 4
---

# window

`window` 是 OpenDesk 的跨平台桌面窗口 facade。动作方法会先解析当前目标并 fail closed；不支持的能力不会 silent success。

## API 一览

| 方法 | 用途 |
| --- | --- |
| `window.getCapabilities()` | 返回当前平台的窗口能力矩阵。 |
| `window.getActiveWindow()` | 返回活动窗口信息。 |
| `window.getWindowByTitle(title)` | 按标题查找唯一窗口。 |
| `window.focus(title)` | 聚焦唯一标题窗口。 |
| `window.setWindowBounds(title, x, y, width, height)` | 设置位置与尺寸。 |
| `window.setWidth(title, width)` | 只设置宽度。 |
| `window.setHeight(title, height)` | 只设置高度。 |
| `window.maximize(title)` | 最大化窗口。 |
| `window.minimize(title)` | 最小化窗口。 |
| `window.restore(title)` | 恢复窗口。 |
| `window.restoreByPID(pid)` | 按 PID 恢复窗口。 |
| `window.minimizeByPID(pid)` | 按 PID 最小化窗口。 |
| `window.maximizeByPID(pid)` | 按 PID 最大化窗口。 |
| `window.closeWindow(title)` | 关闭唯一标题窗口。 |
| `window.closeActiveWindow()` | 关闭当前活动窗口。 |
| `window.kill(processId)` | 终止窗口所属进程。 |
| `window.title()` | 同步返回活动窗口标题。 |
| `window.getTitle(selector)` | 返回指定窗口标题。 |
| `window.content()` | 同步读取活动窗口可访问文本。 |
| `window.getContent(selector)` | 读取指定窗口可访问文本。 |
| `window.list()` | 返回当前窗口列表。 |
| `window.getFocusWindow()` | 返回当前焦点窗口。 |
| `window.setAlwaysOnTop(title, alwaysOnTop)` | 设置/取消置顶。 |
| `window.unsetTopMost(title)` | 取消置顶。 |
| `window.bringToTop(title, pid?)` | 将目标窗口提升到顶层。 |

## 公共约定

### WindowInfo

窗口信息使用 lowerCamelCase：

```ts
interface OpenDeskWindowInfo {
  id: string;
  title: string;
  pid: number;
  x: number;
  y: number;
  width: number;
  height: number;
  exeName?: string;
  exePath?: string;
  isForeground?: boolean;
  hasFocus?: boolean;
  handle?: number;
  isPopup?: boolean;
  index?: number;
}
```

`id` 只表示当前窗口生命周期的观察 identity，不是永久 ID。窗口关闭并重建后必须重新读取。

### 标题消歧与 stale target

兼容 mutation API 以标题作为 target。多个匹配窗口抛 `AMBIGUOUS_TARGET`；不存在抛 `NOT_FOUND`；解析后窗口关闭、重建或改名导致 identity 失效时抛 `STALE_TARGET`。不会默认选择第一个同名窗口。

### 坐标

macOS/Windows 都使用平台提供的虚拟桌面逻辑坐标，副显示器可以出现负坐标。窗口位置不可跨机器缓存。Space / virtual desktop 管理不属于本 API。

## `window.getCapabilities()`

返回当前平台机器可读窗口能力矩阵。

**签名**
```ts
window.getCapabilities(): OpenDeskWindowCapabilities;
```

**参数**

无。

**返回值**

`OpenDeskWindowCapabilities`，包含 platform/backend 与各 capability 的 Stable/Partial/Unsupported 状态。

**行为与错误**

只读取 capability，不操作窗口。

**示例**
```js
console.log(window.getCapabilities());
```

## `window.getActiveWindow()`

返回当前活动窗口信息。

**签名**
```ts
window.getActiveWindow(): Promise<OpenDeskWindowInfo>;
```

**参数**

无。

**返回值**

`Promise<OpenDeskWindowInfo>`。

**行为与错误**

无法解析当前活动窗口或 backend 不可用时 reject，不返回伪造 identity。

**示例**
```js
const info = await window.getActiveWindow();
console.log(info.title, info.pid);
```

## `window.getWindowByTitle(title)`

按当前标题解析唯一窗口。

**签名**
```ts
window.getWindowByTitle(title: string): Promise<OpenDeskWindowInfo>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `title` | `string` | 是 | 无 | 目标窗口标题。 |

**返回值**

`Promise<OpenDeskWindowInfo>`。

**行为与错误**

无匹配 `NOT_FOUND`；多匹配 `AMBIGUOUS_TARGET`。

**示例**
```js
const chrome = await window.getWindowByTitle('Google Chrome');
```

## `window.focus(title)`

聚焦唯一标题窗口。

**签名**
```ts
window.focus(title: string): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `title` | `string` | 是 | 无 | 目标窗口标题。 |

**返回值**

`Promise<void>`。

**行为与错误**

macOS 可能依赖 Accessibility/System Events；Windows 受 foreground-lock policy 约束。失败不会 silent success。

**示例**
```js
await window.focus('Safari');
```

## `window.setWindowBounds(title, x, y, width, height)`

一次设置窗口位置和大小。

**签名**
```ts
window.setWindowBounds(title: string, x: number, y: number, width: number, height: number): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `title` | `string` | 是 | 无 | 目标标题。 |
| `x` | `number` | 是 | 无 | 全局 X。 |
| `y` | `number` | 是 | 无 | 全局 Y。 |
| `width` | `number` | 是 | 无 | 正宽度。 |
| `height` | `number` | 是 | 无 | 正高度。 |

**返回值**

`Promise<void>`。

**行为与错误**

目标不唯一、stale、不支持或 readback/verification 失败时 reject。

**示例**
```js
await window.setWindowBounds('Safari', 100, 80, 1280, 900);
```

## `window.setWidth(title, width)`

只修改目标窗口宽度。

**签名**
```ts
window.setWidth(title: string, width: number): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `title` | `string` | 是 | 无 | 目标标题。 |
| `width` | `number` | 是 | 无 | 新宽度。 |

**返回值**

`Promise<void>`。

**行为与错误**

保留其他 bounds；平台/目标/参数失败明确 reject。

**示例**
```js
await window.setWidth('Safari', 1200);
```

## `window.setHeight(title, height)`

只修改目标窗口高度。

**签名**
```ts
window.setHeight(title: string, height: number): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `title` | `string` | 是 | 无 | 目标标题。 |
| `height` | `number` | 是 | 无 | 新高度。 |

**返回值**

`Promise<void>`。

**行为与错误**

保留其他 bounds；失败明确 reject。

**示例**
```js
await window.setHeight('Safari', 900);
```

## `window.maximize(title)`

最大化唯一标题窗口。

**签名**
```ts
window.maximize(title: string): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `title` | `string` | 是 | 无 | 目标标题。 |

**返回值**

`Promise<void>`。

**行为与错误**

依赖平台窗口 backend；Partial/Unsupported 以 capability 和结构化错误表达。

**示例**
```js
await window.maximize('Safari');
```

## `window.minimize(title)`

最小化唯一标题窗口。

**签名**
```ts
window.minimize(title: string): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `title` | `string` | 是 | 无 | 目标标题。 |

**返回值**

`Promise<void>`。

**行为与错误**

目标解析和平台限制与其他 mutation 一致。

**示例**
```js
await window.minimize('Safari');
```

## `window.restore(title)`

恢复唯一标题窗口。

**签名**
```ts
window.restore(title: string): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `title` | `string` | 是 | 无 | 目标标题。 |

**返回值**

`Promise<void>`。

**行为与错误**

恢复平台支持的最小化/最大化状态；不支持时明确失败。

**示例**
```js
await window.restore('Safari');
```

## `window.restoreByPID(pid)`

按 PID 恢复目标进程窗口。

**签名**
```ts
window.restoreByPID(pid: number): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `pid` | `number` | 是 | 无 | 正 PID。 |

**返回值**

`Promise<void>`。

**行为与错误**

PID 不存在、平台不支持或 backend 失败时 reject。

**示例**
```js
await window.restoreByPID(12345);
```

## `window.minimizeByPID(pid)`

按 PID 最小化目标进程窗口。

**签名**
```ts
window.minimizeByPID(pid: number): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `pid` | `number` | 是 | 无 | 正 PID。 |

**返回值**

`Promise<void>`。

**行为与错误**

不支持/目标不存在明确失败。

**示例**
```js
await window.minimizeByPID(12345);
```

## `window.maximizeByPID(pid)`

按 PID 最大化目标进程窗口。

**签名**
```ts
window.maximizeByPID(pid: number): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `pid` | `number` | 是 | 无 | 正 PID。 |

**返回值**

`Promise<void>`。

**行为与错误**

不支持/目标不存在明确失败。

**示例**
```js
await window.maximizeByPID(12345);
```

## `window.closeWindow(title)`

关闭唯一标题窗口。

**签名**
```ts
window.closeWindow(title: string): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `title` | `string` | 是 | 无 | 目标标题。 |

**返回值**

`Promise<void>`。

**行为与错误**

只提交窗口关闭动作，不保证目标应用业务数据已保存。多匹配/失效/平台失败会 reject。

**示例**
```js
await window.closeWindow('Untitled - TextEdit');
```

## `window.closeActiveWindow()`

关闭当前活动窗口。

**签名**
```ts
window.closeActiveWindow(): Promise<void>;
```

**参数**

无。

**返回值**

`Promise<void>`。

**行为与错误**

活动窗口不可解析或 backend 不支持时 reject。

**示例**
```js
await window.closeActiveWindow();
```

## `window.kill(processId)`

直接终止指定 PID 的进程。

**签名**
```ts
window.kill(processId: number): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `processId` | `number` | 是 | 无 | 要终止的进程 PID。 |

**返回值**

`Promise<void>`。

**行为与错误**

这是强副作用操作，可能造成未保存内容丢失。更完整的应用生命周期优先使用 [`App.terminate()`](app.md#appterminatetarget-options)。

**示例**
```js
const info = await window.getActiveWindow();
await window.kill(info.pid);
```

## `window.title()`

同步返回当前活动窗口标题。

**签名**
```ts
window.title(): string;
```

**参数**

无。

**返回值**

`string`。

**行为与错误**

只读当前 snapshot。

**示例**
```js
console.log(window.title());
```

## `window.getTitle(selector)`

读取指定窗口标题。

**签名**
```ts
window.getTitle(selector: string): Promise<string>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `selector` | `string` | 是 | 无 | 当前兼容窗口选择字符串。 |

**返回值**

`Promise<string>`。

**行为与错误**

无法唯一解析时使用窗口结构化错误。

**示例**
```js
console.log(await window.getTitle('Notes'));
```

## `window.content()`

同步读取当前聚焦窗口可访问文本内容。

**签名**
```ts
window.content(): string;
```

**参数**

无。

**返回值**

`string`。

**行为与错误**

内容完整度强依赖平台与目标应用可访问性；不应假定等价于 DOM/text tree。

**示例**
```js
console.log(window.content());
```

## `window.getContent(selector)`

读取指定窗口可访问文本内容。

**签名**
```ts
window.getContent(selector: string): Promise<string>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `selector` | `string` | 是 | 无 | 当前兼容窗口选择字符串。 |

**返回值**

`Promise<string>`。

**行为与错误**

目标选择或内容 backend 不可用时 reject。

**示例**
```js
console.log(await window.getContent('Notes'));
```

## `window.list()`

返回当前可枚举窗口 snapshot。

**签名**
```ts
window.list(): Promise<OpenDeskWindowInfo[]>;
```

**参数**

无。

**返回值**

`Promise<OpenDeskWindowInfo[]>`。

**行为与错误**

平台 capability 为 Partial 时列表可能受系统权限或 backend 覆盖范围限制；失败不会伪装成完整空列表。

**示例**
```js
const items = await window.list();
console.log(items.length);
```

## `window.getFocusWindow()`

返回当前拥有焦点的窗口。

**签名**
```ts
window.getFocusWindow(): Promise<OpenDeskWindowInfo>;
```

**参数**

无。

**返回值**

`Promise<OpenDeskWindowInfo>`。

**行为与错误**

无法解析 focus window 时 reject。

**示例**
```js
console.log(await window.getFocusWindow());
```

## `window.setAlwaysOnTop(title, alwaysOnTop)`

设置或取消窗口置顶。

**签名**
```ts
window.setAlwaysOnTop(title: string, alwaysOnTop: boolean): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `title` | `string` | 是 | 无 | 目标标题。 |
| `alwaysOnTop` | `boolean` | 是 | 无 | `true` 置顶，`false` 取消。 |

**返回值**

`Promise<void>`。

**行为与错误**

当前 capability 主要在 Windows Stable；不支持平台明确 `NOT_SUPPORTED`。

**示例**
```js
await window.setAlwaysOnTop('Tool', true);
```

## `window.unsetTopMost(title)`

取消窗口置顶状态。

**签名**
```ts
window.unsetTopMost(title: string): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `title` | `string` | 是 | 无 | 目标标题。 |

**返回值**

`Promise<void>`。

**行为与错误**

平台不支持时明确失败。

**示例**
```js
await window.unsetTopMost('Tool');
```

## `window.bringToTop(title, pid?)`

将目标窗口请求提升到顶层。

**签名**
```ts
window.bringToTop(title: string, pid?: number): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `title` | `string` | 是 | 无 | 窗口标题。 |
| `pid` | `number` | 否 | 未设置 | 可选 PID 辅助消歧。 |

**返回值**

`Promise<void>`。

**行为与错误**

Windows 受 foreground-lock policy 约束，macOS 依赖当前 backend/权限；失败明确 reject。

**示例**
```js
await window.bringToTop(info.title, info.pid);
```

## 错误

Window 结构化错误至少包含 `code`、`operation`、`platform`，适用时包含 `capability`。稳定 code：`INVALID_ARGUMENT`、`NOT_SUPPORTED`、`NOT_FOUND`、`AMBIGUOUS_TARGET`、`STALE_TARGET`、`PERMISSION_DENIED`、`VERIFICATION_FAILED`、`TIMEOUT`、`BACKEND_FAILED`。

## 平台与能力

macOS 的多项 mutation 为 Partial，依赖 Accessibility/System Events、目标应用和 Space；Windows 的多数 bounds/minimize/maximize/restore 为 Stable，focus/bring-to-top 受 foreground policy 影响；Linux/other 当前窗口 facade 能力有限或 Unsupported。实际能力以 `window.getCapabilities()` 为准。
