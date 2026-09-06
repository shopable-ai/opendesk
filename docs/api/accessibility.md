---
title: Accessibility API
description: 通过 execution-owned 的 macOS AX / Windows UI Automation 后端观察并操作外部桌面应用的语义元素。
order: 12
---

# Accessibility

`Accessibility` 是 OpenDesk 的第一方原生桌面语义接口。它在同一个 JavaScript execution 中统一
macOS Accessibility（AX）和 Windows UI Automation（UIA），提供有界观察、受管元素引用和原生动作。
它不读取浏览器 DOM，不使用 OCR 或鼠标坐标，也不会建立第二个脚本 Runtime。

本接口为 **Experimental**。可信本地 `-script`、`-script-text`、stdin 和 `opendesk ai run` execution
可显式启用；HTTP、MCP 与 Scheduler execution 当前关闭。关闭时仍可调用
`Accessibility.getCapabilities()`，其余方法拒绝为 `CAPABILITY_DISABLED`，且不会读取原生目标。
这个准入开关只是能力授权，不是完整 Runtime 沙箱，脚本不能通过选项、环境变量或 source label
自行升级授权。

## 快速开始

```js
const capabilities = Accessibility.getCapabilities();
if (!capabilities.hostAuthorization.enabled ||
    !capabilities.implementation.available ||
    !capabilities.permission.granted) {
  console.log(capabilities);
  return;
}

const win = await window.getActiveWindow();
const button = await Accessibility.find(
  { role: 'button', name: 'Apply' },
  { within: win }
);

if (button) {
  try {
    const result = await Accessibility.perform(button, { action: 'invoke' });
    console.log(result.actionState); // acknowledged，不等于业务完成
  } finally {
    await Accessibility.release(button);
  }
}
```

生产脚本还必须在动作后读取应用业务状态；`acknowledged` 只表示原生调用返回成功。

## 方法一览

| 方法 | 返回 | 行为 |
| --- | --- | --- |
| `Accessibility.getCapabilities()` | `OpenDeskAccessibilityCapabilities` | 同步返回摘要；不弹授权窗口、不扫描桌面。 |
| `Accessibility.snapshot(options)` | `Promise<OpenDeskAccessibilitySnapshotResult>` | 在显式 scope 内返回普通数据树，不为每个节点创建长期引用。 |
| `Accessibility.find(selector, options)` | `Promise<OpenDeskAccessibilityElementRef \| null>` | 完整、有界搜索；只在能证明唯一时返回受管引用。 |
| `Accessibility.read(ref, options?)` | `Promise<OpenDeskAccessibilityReadResult>` | 读取白名单属性；`value` 必须显式请求。 |
| `Accessibility.perform(ref, action, options?)` | `Promise<OpenDeskAccessibilityPerformResult>` | 复核身份、状态和原生能力后，最多提交一次动作。 |
| `Accessibility.release(ref)` | `Promise<boolean>` | 释放当前 execution 创建的合法引用。 |

除 `getCapabilities()` 外，所有方法都返回 Promise。未知字段、非法类型、非有限数字和超过上限的
选项都会明确拒绝；不会静默忽略，也不会返回假成功。

## `getCapabilities()`：能力不是元素保证

```js
const capabilities = Accessibility.getCapabilities();
// {
//   schemaVersion: 1,
//   platform: 'darwin',
//   backend: 'macos-ax',
//   hostAuthorization: { enabled: true },
//   available: true,
//   implementation: {
//     available: true,
//     status: 'available',
//     menus: true,
//     actions: {
//       invoke: true, setValue: true, expand: true,
//       collapse: true, select: true, setChecked: true
//     },
//     coordinateMapping: false,
//     notes: 'element actions remain conditional on current native support'
//   },
//   permission: {
//     required: true,
//     state: 'granted',
//     granted: true,
//     cached: false
//   },
//   limits: {
//     defaultTimeoutMs: 3000,
//     maxTimeoutMs: 30000,
//     defaultMaxDepth: 8,
//     maxMaxDepth: 32,
//     defaultMaxNodes: 1000,
//     maxMaxNodes: 5000,
//     maxActiveRefs: 256,
//     maxQueuedRequests: 32
//   },
//   cancellation: { hardCancel: false }
// }
```

上例只展示字段形状，不是任意机器的固定值。`hostAuthorization`、后端是否实现和 OS 权限是三个
独立事实；平台有后端也不代表某个元素支持某个动作。摘要中的权限状态可以标记为缓存，实际观察或
动作前仍会重新检查必要权限。需要由用户主动打开系统授权时，使用既有
[`page.ensurePermissions()` / `page.requestPermissions()`](page.md#权限方法)，Accessibility 方法本身
不触发授权提示。

## Scope：`within` 必填

`snapshot()` 和 `find()` 的 `within` 必须是以下三种之一：

```ts
type OpenDeskAccessibilityScope =
  | OpenDeskWindowInfo
  | OpenDeskAccessibilityElementRef
  | { app: OpenDeskAppTarget; root: 'application' | 'menuBar' };
```

- `OpenDeskWindowInfo` 复用 [Window API](window.md) 的当前窗口身份。`:unresolved` 身份、已关闭或重建的
  窗口会安全失败；标题、PID、handle 或旧 bounds 不能单独充当永久身份。
- 元素引用只能来自当前 execution 的 `Accessibility.find()`，并把搜索限制在该元素的子树。
- `{ app, root }` 复用 [App target](app.md) 的解析和实例消歧。多实例不能取第一个；调用方应提供足以
  唯一定位当前进程实例的 target。
- macOS `root: 'menuBar'` 是应用级语义根，不会被裁剪到应用窗口矩形。Windows 窗口菜单优先使用明确
  WindowInfo；弹出层仍须由后端验证 owner 关系。

不提供全桌面默认 scope，不接受裸坐标、ScreenRegion、Display、快照节点、用户拼接的 ref ID 或原生
AX/COM 地址。

## Selector 与唯一性

V1 selector 至少包含一个有效字段：

```ts
{ role?: string, name?: string, identifier?: string }
```

所有给出的字段按 AND 精确匹配。`name` / `identifier` 不做模糊匹配、翻译或忽略大小写；
`identifier` 只是在当前 scope 内的定位信号，不是永久 ID。

公开 `role` 使用规范化值。V1 的跨平台核心映射包括 `application`、`window`、`menuBar`、`menu`、
`menuItem`、`button`、`checkbox`、`radioButton`、`textField`、`staticText`、`list`、`listItem`、
`table`、`row`、`cell` 和 `group`。没有安全映射的角色返回 `role: 'unknown'` 并保留
`nativeRole`；不会把未知元素猜成 `button`。调用方应同时检查实际 `actions`，不能只根据 role 推断动作。

`find()` 会完成本次有界搜索后再判断：

- 完整搜索且没有候选：返回 `null`；
- 完整搜索且唯一：返回受管 ref；
- 多个候选：拒绝为 `AMBIGUOUS_TARGET`；
- 到达节点、深度或总 deadline，无法证明结果：拒绝为 `SEARCH_INCOMPLETE` 或 `TIMEOUT`。

找到第一个候选不会提前结束并宣称唯一。`timeout` 是单次有界定位 deadline，不是等待元素出现；V1
没有隐式 wait 行为。

## `snapshot()`：普通数据与完整性

```js
const result = await Accessibility.snapshot({
  within: win,
  maxDepth: 4,
  maxNodes: 300,
  properties: ['role', 'name', 'enabled', 'actions'],
});

console.log(result.complete, result.truncated, result.reason, result.stats.nodes);
```

结果包含 `requestId`、`operation`、`backend`、`root`、`complete`、`truncated`、`reason` 和
`stats: { nodes, maxDepth }`。节点可包含 `role`、`nativeRole`、`name`、`identifier`、状态、动作、
边界和 `children`。省略 `properties` 时读取除 value 外的上述白名单基本属性；只在
`properties` 明确含 `value` 时返回 `value`。

快照不会为每个节点保留原生 ref。未物化、不可读取或被限制截断的子树必须通过
`complete: false`、`truncated` 和 `reason` 表达，不能伪造成空且完整。不要把完整控件树或 value
写入常规日志。

## ElementRef、`read()` 与 `release()`

`OpenDeskAccessibilityElementRef` 是当前 execution 内的 opaque capability：

```ts
{
  readonly kind: 'AccessibilityElementRef';
  readonly id: string;
  readonly role: string;
  readonly nativeRole: string;
}
```

公开字段便于诊断，不构成可伪造的 authority。JSON 序列化再构造、跨 execution 使用、释放后使用、
目标关闭重建或进程实例变化都会失败；失效 ref 不会按同名元素自动重定位。

```js
const details = await Accessibility.read(ref, {
  properties: ['role', 'name', 'enabled', 'actions'],
  timeout: 1000,
});
```

可读属性白名单为 `role`、`nativeRole`、`name`、`identifier`、`enabled`、`focused`、`selected`、
`checked`、`expanded`、`actions`、`nativeBounds`、`bounds` 和 `value`。受保护或密码字段拒绝读取 value；
没有通用绕过参数。省略 `properties` 时使用不含 value 的基本属性集合。无法可靠把原生 bounds 转换为
OpenDesk screen logical coordinate 时，`bounds` 为 `null`；`nativeBounds.coordinateSpace` 明确保留
后端坐标空间，不能直接交给 `mouse`。

首次释放当前 execution 的合法 ref 返回 `true`；再次释放同一个合法 ref 返回 `false`。伪造或其他
execution 的对象不是正常重复释放，会拒绝。Runtime 会协调 release 与 in-flight 操作，并在 teardown
释放遗留 ref；必要清理不依赖 JavaScript GC。

## `perform()`：动作与状态

```ts
type OpenDeskAccessibilityAction =
  | { action: 'invoke' }
  | { action: 'setValue', value: string }
  | { action: 'expand' }
  | { action: 'collapse' }
  | { action: 'select' }
  | { action: 'setChecked', checked: boolean };
```

| 动作 | 语义 |
| --- | --- |
| `invoke` | 只调用当前元素明确支持的原生命令动作。 |
| `setValue` | 通过可写 value 修改，不模拟逐字键盘输入；只读/受保护字段拒绝。 |
| `expand` / `collapse` | 先读取当前展开状态和具体能力；不能用一次不定向 press 冒充。 |
| `select` | 使用明确的选择 pattern/action；不等同 toggle。 |
| `setChecked` | 已满足时不提交输入；状态未知或三态无法安全映射时停止。 |

每次动作前都会重新验证 ref、目标身份、enabled/readonly 状态和实际 pattern/action。原生动作最多提交
一次；超时或失败后不会自动重试，也不会改用 OCR/鼠标。平台或元素没有可证明的安全映射时返回
`ACTION_NOT_SUPPORTED` 或 `STATE_UNKNOWN`。

成功结果至少包含 `requestId`、`operation`、`action`、`backend` 和 `actionState`：

| `actionState` | 含义 |
| --- | --- |
| `not_started` | 已确认对应最终动作没有尝试。 |
| `not_needed` | 目标状态已满足，没有提交输入。 |
| `acknowledged` | 原生调用返回成功；尚未证明业务完成。 |
| `unknown` | 动作可能已经提交，不能自动重做。 |

## 限制、队列、取消与 teardown

| 限制 | 默认 | 最大 |
| --- | ---: | ---: |
| `timeout` | 3000 ms | 30000 ms |
| `maxDepth` | 8 | 32 |
| `maxNodes` | 1000 | 5000 |
| 当前 execution 活跃 ref | — | 256 |
| 当前 execution 排队请求 | — | 32 |
| selector/path 单段 | — | 1024 Unicode code points |
| `setValue` UTF-8 内容 | — | 1 MiB |

deadline 包含排队和全部原生工作。排队已取消的请求不会执行；in-flight 原生调用不能保证强制撤回，
所以 capability 明确报告 `hardCancel: false`。迟到结果不能 settlement 已关闭 Runtime，也不能污染新
execution。脚本即使没有 await 已提交的请求，execution 也会等待其受管生命周期；仅持有闲置 ref
不会让脚本永久不退出，teardown 会释放它。

## 结构化错误

rejection 是 `Error`，并至少带：

```ts
{
  code: OpenDeskAccessibilityErrorCode;
  operation: string;
  backend: string;
  phase: string;
  requestId: string;
  actionState: OpenDeskAccessibilityActionState;
}
```

错误 code：

```text
INVALID_ARGUMENT       CAPABILITY_DISABLED    NOT_SUPPORTED
PERMISSION_DENIED      TARGET_NOT_FOUND       AMBIGUOUS_TARGET
SEARCH_INCOMPLETE      STALE_TARGET           ELEMENT_DISABLED
ACTION_NOT_SUPPORTED   STATE_UNKNOWN          TIMEOUT
CANCELED               QUEUE_FULL             RESOURCE_LIMIT
BACKEND_FAILED
```

不要解析 `message` 判断错误。错误默认不包含 selector、输入 value、完整控件正文、原生地址或完整菜单
路径。动作已提交但结果不确定时必须是 `actionState: 'unknown'`，调用方不能自动重做。

## 平台边界

| 平台构建 | 第一方后端 | 边界 |
| --- | --- | --- |
| macOS + cgo | AXUIElement client | 需要系统 Accessibility 权限；不自动弹窗。每个实际调用对象使用有界 messaging timeout。 |
| macOS without cgo | unsupported | 明确 `implementation.available: false`；不会降级到 AppleScript。 |
| Windows | UI Automation client | 后端在专用、固定 OS 线程的 MTA 中调用并释放 COM；元素 pattern 决定动作支持。 |
| 其他平台 | unsupported | capability 摘要仍可读，观察和动作拒绝为 `NOT_SUPPORTED`。 |

表格说明后端合同，不是当前机器的验收结论。某个平台的 cross-compile、`go-ole` 依赖存在或
`implementation.available: true` 都不能替代原生真机测试；每次运行以 `getCapabilities()` 和实际
错误为准。

菜单组合操作见 [Desktop UI Menu API](desktop-ui-menu.md)，内部 owner、线程、身份和清理模型见
[Native Accessibility architecture](../architecture/desktop-automation/native-accessibility.md)。公开示例见
[examples/accessibility/README.md](../../examples/accessibility/README.md)。
