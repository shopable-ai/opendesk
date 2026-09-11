---
title: Window API
description: window 对象用于读取当前窗口信息，并进行聚焦、移动、缩放、置顶等桌面窗口控制。
order: 80
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
| `window.list(target?)` | 同步返回全部或筛选后的窗口快照。 |
| `window.get(target)` | 取得唯一、身份与几何有效的窗口快照。 |
| `window.wait(target, options?)` | 等待唯一窗口出现，支持超时和取消。 |
| `window.getFocusWindow()` | 同步返回当前焦点窗口。 |
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

### WindowTarget

`window.get()`、`window.wait()` 和 `window.list(target)` 的目标查询为 **Experimental**。必须使用明确对象；裸字符串不会被猜测为应用名称或窗口标题。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `app` | `OpenDeskAppTarget` | 原样交给 App.get，使用现有应用名称、bundle ID、应用路径或 PID 规则。 |
| `id` | `string` | 当前窗口观察 ID；不能使用以 `:unresolved` 结尾的值。 |
| `pid` | `number` | 正 uint32；进程可能拥有多个窗口。 |
| `exePath` | `string` | 精确匹配 WindowInfo.exePath，不等同于 macOS 应用包路径。 |
| `exeName` | `string` | 精确匹配 WindowInfo.exeName，不按显示名称或别名解释。 |
| `title` | `string` | 精确窗口标题，可单独使用，或与一个身份字段共同使用。 |

`app/id/pid/exePath/exeName` 最多提供一个；至少提供一个身份字段或 `title`。条件按 AND 匹配。未知字段、symbol 字段、空对象、空字符串、无效 PID、多身份字段，以及字段值为 `undefined` 都是 `INVALID_ARGUMENT`。整个 target 省略仅适用于 `list()`。

`title/exePath/exeName/id` 不自动 trim、忽略大小写、翻译或模糊匹配。查询不自动放宽标题、取第一项、启动、聚焦、恢复或关闭应用。`app` 使用现有 [App](app.md) 解析；macOS native App backend 的“计算器”和“Calculator”别名不代表其他平台也支持相同映射。

`WindowTarget` 是查询条件，`WindowInfo` 是一次观察快照。快照不是永久句柄，也不代表后续输入目标仍然有效。旧动作接口保持原来的标题/PID 参数，本轮 target 对象不能直接传给 `focus/maximize/restore` 等方法。

### 标题消歧与 stale target

兼容 mutation API 以标题作为 target。多个匹配窗口抛 `AMBIGUOUS_TARGET`；不存在抛 `NOT_FOUND`；解析后窗口关闭、重建或改名导致 identity 失效时抛 `STALE_TARGET`。不会默认选择第一个同名窗口。

### 坐标

macOS/Windows 都使用平台提供的虚拟桌面逻辑坐标，副显示器可以出现负坐标。窗口位置不可跨机器缓存。Space / virtual desktop 管理不属于本 API。

## window.getCapabilities()

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

## window.getActiveWindow()

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

## window.getWindowByTitle(title)

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

## window.focus(title)

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

## window.setWindowBounds(title, x, y, width, height)

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

## window.setWidth(title, width)

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

## window.setHeight(title, height)

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

## window.maximize(title)

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

## window.minimize(title)

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

## window.restore(title)

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

## window.restoreByPID(pid)

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

## window.minimizeByPID(pid)

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

## window.maximizeByPID(pid)

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

## window.closeWindow(title)

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

## window.closeActiveWindow()

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

## window.kill(processId)

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

这是强副作用操作，可能造成未保存内容丢失。更完整的应用生命周期优先使用 [App.terminate()](app.md#appterminatetarget-options)。

**示例**
```js
const info = await window.getActiveWindow();
await window.kill(info.pid);
```

## window.title()

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

## window.getTitle(selector)

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

## window.content()

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

## window.getContent(selector)

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

## window.list(target?)

同步返回当前可枚举窗口快照，可按目标条件筛选。

**签名**
```ts
window.list(target?: OpenDeskWindowTarget): OpenDeskWindowInfo[];
```

**参数**

`target`：可选，字段见 [WindowTarget](#windowtarget)。省略时保持原来的无筛选枚举行为。

**返回值**

`OpenDeskWindowInfo[]`，0 到多项，无匹配返回 `[]`。方法保持同步，既有 `await window.list()` 同样有效。

**行为与错误**

参数或 backend 错误同步抛出，不伪装成空列表。`app` 保留 App group 全部 PID，不取首个进程。Partial backend 的枚举范围受权限、平台和桌面覆盖限制；列表唯一不证明不可枚举范围不存在其他窗口。

匹配行中的无效 bounds 或 unresolved identity 不会被偷偷过滤后再声称唯一。需要唯一有效快照时使用 `get()`。

**示例**

在仓库根目录的 OpenDesk 脚本中使用；前置为计算器已经运行，当前 App backend 支持该名称。

```js
const items = window.list({ app: 'Calculator' });
console.log(items.length);
```

## window.get(target)

读取当前唯一匹配且身份、几何有效的窗口快照，不等待或操作窗口。

**签名**
```ts
window.get(target: OpenDeskWindowTarget): Promise<OpenDeskWindowInfo>;
```

**参数**

`target`：必填，字段见 [WindowTarget](#windowtarget)。

**返回值**

`Promise<OpenDeskWindowInfo>`。

**行为与错误**

0 项为 `NOT_FOUND`，多项为 `AMBIGUOUS_TARGET`。唯一行的 ID 缺失或 unresolved 为 `STALE_TARGET`；坐标非有限数或宽高不为正为 `VERIFICATION_FAILED`。负 X/Y 合法。按 ID 查无匹配仍为 `NOT_FOUND`，不会凭空断言该 ID 曾经存在。

查询失败保留结构化错误 code，operation 为 `window.get`。原生/App 失败带 `cause`，不触发隐式放宽条件；成功枚举后的无匹配错误不带 cause。

**示例**

在仓库根目录的 OpenDesk 脚本中使用；macOS native App backend，计算器已运行且有唯一可枚举窗口。

```js
const win = await window.get({ app: '计算器' });
const precise = await window.get({ app: { bundleId: 'com.apple.calculator' } });
console.log(win.id, precise.width, precise.height);
```

## window.wait(target, options?)

等待唯一有效窗口出现，只重试成功枚举后没有匹配的观察。

**签名**
```ts
window.wait(target: OpenDeskWindowTarget, options?: OpenDeskWindowWaitOptions): Promise<OpenDeskWindowInfo>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `OpenDeskWindowTarget` | 是 | 无 | 等待开始时复制条件，后续修改原对象不改变本次等待。 |
| `options.timeout` | `number` | 否 | `10000` | 总毫秒数，整数 0..300000；0 只立即观察一次。 |
| `options.polling` | `number` | 否 | `200` | 观察间隔毫秒数，整数 1..10000。 |
| `options.signal` | `AbortSignal` | 否 | 未设置 | 取消本次等待；预先取消的信号不会触发枚举。 |

**返回值**

`Promise<OpenDeskWindowInfo>`，唯一性和有效性与 `get()` 相同。

**行为与错误**

只重试成功枚举后的 `NOT_FOUND`。歧义、无效身份/几何、参数、权限和 backend 错误立即拒绝，包括 backend 自己产生的 `NOT_FOUND`。总期限耗尽为 `TIMEOUT`，显式取消为 `CANCELED`。timeout 为 0 时有唯一窗口立即成功，否则为 TIMEOUT。

成功、失败和取消都逐项尝试清理本次等待的定时器及已注册监听器。清理依赖抛错时 Promise 仍会结算，错误包含 `cleanupError`；原操作已失败时保留其 code，并通过 cause 保留主错误，原本成功则改为 `BACKEND_FAILED`。清理依赖实际没有释放的资源不能被声称已经归零。

复用当前 Execution 受管 timer，不启动独立 Execution。signal 注册过程中同步取消后不再创建定时器。每次观察前后都检查期限；即使轮询回调被延迟调度，也不会在期限之后新启动枚举。宿主销毁后不承诺 JS Promise 仍有机会执行回调。同步原生调用不能被 JS 定时器或 AbortSignal 强制打断，原生返回后检查期限。

等待不等于启动、聚焦、恢复或业务界面就绪，不自动改变应用状态。

**示例**

在仓库根目录的 OpenDesk 脚本中使用；前置为当前平台 App backend 支持该应用启动方式。

```js
await App.launch('Calculator');
const win = await window.wait({ app: 'Calculator' }, { timeout: 10000, polling: 200 });
console.log(win.id);
```

## window.getFocusWindow()

同步返回当前拥有焦点的窗口。

**签名**
```ts
window.getFocusWindow(): OpenDeskWindowInfo | null;
```

**参数**

无。

**返回值**

`OpenDeskWindowInfo | null`，不是 Promise；具体无目标行为受 native backend 影响。

**行为与错误**

保留 native 的空结果；backend 失败同步抛出结构化错误，不会因为调用方写了 `await` 就变成异步接口。

**示例**
```js
const focused = window.getFocusWindow();
console.log(focused);
```

## window.setAlwaysOnTop(title, alwaysOnTop)

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

## window.unsetTopMost(title)

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

## window.bringToTop(title, pid?)

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

Window 结构化错误至少包含 `code`、`operation`、`platform`，适用时包含 `capability`。稳定 code：`INVALID_ARGUMENT`、`NOT_SUPPORTED`、`NOT_FOUND`、`AMBIGUOUS_TARGET`、`STALE_TARGET`、`PERMISSION_DENIED`、`VERIFICATION_FAILED`、`TIMEOUT`、`BACKEND_FAILED`。目标等待另支持 `CANCELED`；包装原生/App 错误时保留 `cause`。等待清理失败另带 `cleanupError`，不伪装成功或保持 Promise 悬挂。

## 平台与能力

macOS 的多项 mutation 为 Partial，依赖 Accessibility/System Events、目标应用和 Space；Windows 的多数 bounds/minimize/maximize/restore 为 Stable，focus/bring-to-top 受 foreground policy 影响；Linux/other 当前窗口 facade 能力有限或 Unsupported。实际能力以 `window.getCapabilities()` 为准。

目标查询复用现有 `window.list` capability；`app` 条件还依赖 App backend。接口存在不代表当前平台覆盖完整。实施边界与验证入口见 [Window target 交付记录](../quality/window-target-resolution.md)。
