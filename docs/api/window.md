---
docType: reference
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
| `window.getAppWindow(target)` | 仅观察指定 PID 与 executable 的前台 AX 焦点窗口（macOS）。 |
| `window.watchAppWindow(target, callback)` | 监听精确进程的窗口失效提示（macOS）。 |
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
| `window.current(target)` | 快速刷新同一 PID/native handle 的窗口。 |
| `window.activate(target, options?)` | 有界激活同一精确窗口并验证前台状态。 |
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

`WindowTarget` 是查询条件，`WindowInfo` 是一次观察快照。快照不是永久句柄，也不代表后续输入目标仍然有效。兼容动作接口保持原来的标题/PID 参数；只有 Experimental 的 `current/activate` 明确消费完整 WindowInfo，并且只重验或激活其中已经解析的同一 PID/native handle，不重新按标题选窗。

### 单目标执行边界

`OpenDeskWindowTarget` 只描述**当前这次 Execution / Recipe 要解析的一个实际目标**，不是跨平台配置表、目标集合或 Runtime dispatcher。平台差异应在部署/Recipe 配置边界选择完成，再把一个普通 `WindowTarget` 交给 `window.get()` / `window.wait()`。

Runtime 不提供 `byPlatform`、`PlatformWindowTarget`、`window.forPlatform()`、`window.resolvePlatformTarget()` 或其他平台路由 API。业务脚本也不应为了目标解析维护 `darwin/windows/linux` 三套分支；同一 Recipe 部署到另一系统时，只替换部署侧的单一目标配置。

推荐链路保持唯一：

```text
Recipe / 部署参数
→ 一个 OpenDeskWindowTarget
→ window.wait()
→ 一个 OpenDeskWindowInfo
→ UI.tapTexts(texts, { within: win, ...textOptions })
```

这里的 `texts` 是必填的主要动作序列；`within` 只是由 `window.get()` / `window.wait()` 返回的 `OpenDeskWindowInfo` scope。完整调用例如：

```js
await UI.tapTexts(["2", "5", "×", "4", "="], { within: win, match: "exact" });
```

`UI.tapText()` / `UI.tapTexts()` 不重复承担窗口身份解析，因此不增加 `appName`、`windowName`、`platform`、`bundleId`、`exeName` 等窗口选择参数。

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

## window.getAppWindow(target)

只读观察明确指定进程的 AX 焦点窗口；目标 PID 不是当前前台进程时，在访问目标 UI 前返回 `null`。

**签名**

```ts
window.getAppWindow(target: OpenDeskAppWindowTarget): Promise<OpenDeskWindowInfo | null>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `OpenDeskAppWindowTarget` | 是 | 无 | 恰好一个普通对象，仅含自有 data properties `pid` 与 `exePath`；不接受 accessor、symbol 或其他字段。 |
| `target.pid` | `number` | 是 | 无 | 正 int32 整数，范围 1..2147483647。 |
| `target.exePath` | `string` | 是 | 无 | 不含 NUL 的绝对 executable 文件路径，按进程信息精确匹配；不自动修剪、解析别名或转换应用包路径。 |

**返回值**

`Promise<OpenDeskWindowInfo | null>`。非目标前台 PID、观察期间切换到其他前台 PID，或目标没有 AX 焦点窗口时返回 `null`。成功结果含实际 native window ID、目标 PID、精确 executable、全局窗口 bounds，以及 `isForeground: true`、`hasFocus: true`。窗口标题允许为空；快照不保证随后仍聚焦该窗口。

**行为与错误**

- 仅 macOS 支持；其他平台合法参数明确拒绝为 `NOT_SUPPORTED`。参数校验优先，非法参数拒绝为 `INVALID_ARGUMENT`。
- 前台 PID 的前后校验均使用全新的 macOS `/usr/bin/lsappinfo` 进程，仅查询 front ASN 及该 ASN 的 pid；不读取应用名称、路径、标题、列表或 UI 树。每次 PID 查询总期限 800ms，不能确认时拒绝，不使用缓存值或其他来源回退。确认目标前台 PID 后，通过进程信息验证 executable，随后只读取目标 PID 的 AX focused window。只读操作不激活、不输入、不启动应用。
- 不调用 `App.list/get`、全局窗口枚举、System Events/JXA，也没有标题、bounds 或其他后备选窗。实际 ID 优先来自 AXWindowNumber；必要时使用动态可用、消息超时受限的原生 AX window ID 查询。仅允许以已解析 ID 进行精确 CG 查询并验证 owner 与 bounds。
- executable 不匹配或窗口 owner/ID/bounds 验证失败：`VERIFICATION_FAILED`；进程身份不可读取：`STALE_TARGET`；AX 权限禁用：`PERMISSION_DENIED`；AX 消息无法完成：`TIMEOUT`；所需原生 ID 能力不可用：`NOT_SUPPORTED`；其他原生失败：`BACKEND_FAILED`。错误含 `operation: 'window.getAppWindow'`、`platform`、`capability: 'window.appScoped'`。
- 目标应用与窗口 AX element 的消息超时为 200ms，不是整个 Promise 的总超时；PID 查询不创建系统 AX element，也不修改全局 AX 超时。没有自动重试或全局回退。调用开始时复制参数。
- native 查询在当前 Execution 的后台串行通道执行，不阻塞 JS EventLoop 的 timer 或变化提示。最多一个 native query 执行，最多保留 32 个未结算请求；每个请求独立重新观察，不丢弃不同 scope，也不复用旧快照。队列满时拒绝为 `BACKEND_FAILED`。需要 EventLoop，无此宿主能力时拒绝为 `NOT_SUPPORTED`。Execution 取消时待处理 Promise 拒绝为 `CANCELED`，迟到结果不会兑现；已进入操作系统的同步查询不能强制中断，worker 由生命周期 join 等待。

**示例**

前提：在仓库根目录、OpenDesk JavaScript Runtime 中，`target` 已由调用方提供并获准观察，且包含真实 PID 和 executable 路径；本接口不负责发现进程。

```js
async function observePromptWindow(target) {
  const current = await window.getAppWindow(target);
  if (current === null) return null;
  return { id: current.id, x: current.x, y: current.y, width: current.width, height: current.height };
}
```

## window.watchAppWindow(target, callback)

监听一个精确进程的变化，仅提供失效提示（Experimental，macOS）。

**签名**

```ts
window.watchAppWindow(
  target: OpenDeskAppWindowTarget,
  callback: (hint: OpenDeskAppWindowHint) => void | Promise<void>,
): OpenDeskAppWindowSubscription;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target.pid` | `number` | 是 | 无 | 正 int32 PID，1..2147483647。 |
| `target.exePath` | `string` | 是 | 无 | executable 文件的绝对路径，无 NUL，最多 4095 UTF-8 字节；逐字节匹配，不接受应用别名或 bundle 目录。 |
| `callback` | `(hint) => void \| Promise<void>` | 是 | 无 | 仅在当前 Execution 的 JS loop 上调用；Promise 未结算时合并后续提示。 |

`target` 必须为普通对象或 null-prototype 对象，恰有自有数据字段 `pid`、`exePath`；未知字段、symbol、accessor 与额外位置参数均拒绝。开始订阅时复制身份，并捕获进程启动标识；PID 重用不会转订阅到新进程。

**返回值**

同步返回 `{ unsubscribe(), capabilities }` 对象；`unsubscribe()` 幂等，只读 `capabilities` 属性为初始注册快照。调用后不再开始 JS callback；已经开始的异步业务本身不能被强制取消。Execution 取消/关闭自动停止并清理原生监听，生命周期 join 等待原生线程退出。

回调参数仅包含：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `reason` | `string` | `subscribed`、`app-active-changed`、`app-terminated-changed`、`focused-window-changed`、`window-moved`、`window-resized`、`window-destroyed`、`target-invalidated`、`capabilities-changed` 、`app-activated`、`app-deactivated`、`focused-ui-element-changed`、`layout-changed`、`window-created`、`main-window-changed` 或 `coalesced`。 |
| `reasons` | `string[]` | 原生 mailbox 与 JS pending 中所有未交付原因的去重并集，合并不丢失失活/换窗；数组顺序不表示发生顺序。 |
| `active` | `boolean \| null` | 最近限定 PID 的 KVO/AX activation active 提示；未知时 null，仅作 hint。即使最后为 true，`reasons` 中失活仍保留。 |
| `sequence` | `number` | 每订阅递增序号；合并允许跳号，不用于统计原生事件次数。 |
| `monotonicMs` | `number` | 距订阅开始的单调时钟毫秒，不是 wall-clock 时间。 |
| `capabilities` | `OpenDeskAppWindowWatchCapabilities` | 本次提示对应的注册结果快照。 |

`capabilities` 包含 `platform: 'darwin'`、`backend: 'per-pid-kvo-ax'`、`verified: false`、`fallback`、`fallbackMode: 'caller-revalidation'` 与 `registrations`。后者逐项报告 `appActive`、`appTerminated`、`axObserver`、`focusedWindow`、`windowCreated`、`mainWindow`、`focusedUIElement`、`layoutChanged`、`windowMoved`、`windowResized`、`windowDestroyed`、`axAppActivated`、`axAppDeactivated` 的 `{supported, status, state}`：0 / `registered` 为注册成功，-1 / `not_registered` 为未注册（例如 inactive、尚未绑定或未找到 focused window），其他值 / `failed` 为原生 AXError。任一项未注册时 `fallback: true`；初始 focused window 尚未绑定时也如此，后续能力变化通过提示报告。注册成功不证明实测通知送达、权限持续有效或应用完整实现通知。

**行为与错误**

仅对指定 PID 使用 `NSRunningApplication` KVO 与 AXObserver 专用 RunLoop；inactive/unknown 时只保留 KVO、进程身份存活检查与该 PID 的 activation-only AXObserver，不读取 focused window/tree，也不注册 focus/layout/window 通知；仅 active 时接入这些详细通知，失活后拆除详细监听。per-PID `AXApplicationActivated` / `AXApplicationDeactivated` 作为 KVO 的轻量备份，按实际 AXError 报告注册结果；不支持时保留显式 fallback，不使用全局通知替代。窗口级通知只绑定该进程当时的 focused window，在焦点/创建/销毁提示后重新绑定。不使用全局应用通知、事件 tap 或全桌面窗口枚举，不返回标题、bounds 或前台资格；`active` 只是最近 KVO/AX 激活提示的限定 app 状态。AX 回调仅记录 hint，不同步查询窗口或调用 JS。

提示可能延迟、合并或缺失，既不是窗口资格，也不是前台授权。`app-active-changed` 不能证明当前 active；每次业务操作前必须独立重新核验精确目标。`fallbackMode` 表示由调用者决定重新观察策略，API 不自动改为全局监听或轮询窗口。app 级 `AXFocusedUIElementChanged` 与 `AXLayoutChanged` 按实际注册结果报告，不能保证 Code/Cowork 等应用可靠送达；消费方应保留 1000ms 完整结构重新核验兜底。目标退出、身份失效后停止原生监听，若尚未取消则可交付最后的 `target-invalidated`；该终止提示开始交付后自动移除订阅。若已有 callback 的 Promise 一直未结算，终止提示仍等待 single-flight 槽位，调用者可以随时幂等取消，Execution 关闭也会清理。原生 worker 计数直到真正退出才归零。

每 Execution 最多 32 个订阅，每订阅只有一个 native mailbox、一个合并所有 reasons 的待交付 hint 与一个执行中的 callback；Promise 未完成时不重入。回调抛错或 Promise 拒绝停止该订阅并进入当前 Execution 的异步错误通道。取消后迟到 hint 和 Promise 结算不再派发回调。

参数错误同步抛 `INVALID_ARGUMENT`；非 macOS/cgo 或无 EventLoop 为 `NOT_SUPPORTED`；进程不存在/身份不可读为 `STALE_TARGET`；路径不匹配为 `VERIFICATION_FAILED`；注册或资源上限失败为 `BACKEND_FAILED`；注册等待超过 1000ms 为 `TIMEOUT`。JS loop 的同步注册等待有此上限，AX 的创建、查询和通知注册均在专用 RunLoop；AX 元素消息 timeout 为 0.2 秒，失活/关闭在后续操作前检查。操作系统原生调用不可被 Go 强制打断，超时启动和拆除仍由后台 worker 持有并由 lifecycle join 等待，不冒称超时即已释放。错误携带 `operation: 'window.watchAppWindow'`、`capability: 'window.appWatch'`。AX 权限不足、目标不支持部分通知时通过实际 registration 状态报告降级，不冒称完整支持。

**示例**

在仓库根目录启动的 OpenDesk 脚本中使用；前置为调用方已独立确认目标 PID 与 executable，macOS 已授权所需 Accessibility 权限。以下函数不发现应用或执行桌面动作。

```js
function watchConfirmedTarget(target) {
  const subscription = window.watchAppWindow(target, hint => {
    console.log(hint.reasons, hint.active, hint.sequence, hint.capabilities.fallback);
    // 仅标记本地观察过期；业务操作前另行重新核验。
  });
  return subscription;
}
```

仅参数验证测试可从仓库根目录运行：`./dist/opendesk -script tests/runtime-api/window-app-watch.js -console-mode script`。此测试不建立真实订阅，不证明通知送达或桌面验收。

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

## window.current(target)

刷新一个已经解析的精确窗口，不做全桌面标题枚举，也不改变前台窗口。本方法为 **Experimental**。

**签名**

```ts
window.current(target: OpenDeskWindowInfo): Promise<OpenDeskWindowInfo>;
```

**参数**

`target` 必须是包含 resolved id、正 PID、非零 native handle、title 与正 bounds 的完整 WindowInfo。调用开始时复制参数；未知字段、symbol 字段、unresolved id 或不完整 identity 在 native observation 前抛 `INVALID_ARGUMENT`。

**返回值**

`Promise<OpenDeskWindowInfo>`，返回相同 id/PID/native handle 的新观察。窗口允许在两次观察间改变 title、bounds 或前台状态；需要冻结这些字段的上层动作必须自行比较返回值。

**行为与错误**

macOS 使用 PID + CGWindowID 的 CoreGraphics 直接刷新，不先等待 System Events/JXA 全窗口枚举；Windows 使用 PID + HWND。窗口关闭、重建、换 owner 或 native handle 失效为 `STALE_TARGET`。本方法不按标题 fallback，不启动、聚焦、恢复或替换窗口。

```js
const resolved = await window.get({ app: { bundleId: 'com.apple.calculator' } });
const current = await window.current(resolved);
console.log(current.id === resolved.id, current.isForeground);
```

## window.activate(target, options?)

在需要时激活同一精确窗口，并只在 native read-back 证明相同 id/PID/native handle 为前台后返回。本方法为 **Experimental**。

**签名**

```ts
window.activate(
  target: OpenDeskWindowInfo,
  options?: { timeout?: number },
): Promise<OpenDeskWindowInfo>;
```

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `OpenDeskWindowInfo` | 是 | 无 | 已解析的精确窗口；校验规则与 `current()` 相同。 |
| `options.timeout` | `number` | 否 | `1000` | 整数毫秒，范围 `1..10000`；包含一次 activation 与 read-back。 |

已经是精确前台窗口时只返回新观察，不提交 activation。否则 native owner 最多提交一次 activation，再在同一 deadline 内只轮询验证；不会重复 raise、改用标题窗口、接受同 PID 的另一窗口或切换到 OCR/鼠标。macOS 的 activation 先以 PID、title 和 bounds 唯一限定 AX window，返回时再以 PID + CGWindowID 复核；Windows 始终使用原 HWND。

目标消失或替换为 `STALE_TARGET`；权限不足为 `PERMISSION_DENIED`；超时或前台策略拒绝由 `TIMEOUT` / `VERIFICATION_FAILED` 区分。同步 native activation 不能由 JavaScript signal 强制中断，因此本合同不接受 `signal`。

```js
const resolved = await window.get({ app: { bundleId: 'com.apple.calculator' } });
const active = await window.activate(resolved, { timeout: 1000 });
if (active.id !== resolved.id) throw new Error('window identity changed');
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
