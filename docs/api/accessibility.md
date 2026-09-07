---
title: Accessibility API
description: 通过 execution-owned 的 macOS AX / Windows UI Automation 后端观察并操作外部桌面应用的语义元素。
order: 12
---

# Accessibility

`Accessibility` 是 OpenDesk 的第一方原生桌面语义接口。它统一 macOS Accessibility（AX）和 Windows UI Automation（UIA），提供有界观察、受管元素引用和原生动作；不读取浏览器 DOM，不使用 OCR 或鼠标坐标。

本接口为 **Experimental**。可信本地 `-script`、`-script-text`、stdin 与 `opendesk ai run` execution 可启用；HTTP、MCP 与 Scheduler 当前关闭。关闭时仍可调用 `Accessibility.getCapabilities()`，其他方法以 `CAPABILITY_DISABLED` 拒绝。

## API 一览

| 方法 | 用途 |
| --- | --- |
| `Accessibility.getCapabilities()` | 同步读取 backend、授权、权限、限制与动作能力摘要。 |
| `Accessibility.snapshot(options)` | 在明确 scope 内读取普通数据树。 |
| `Accessibility.find(selector, options)` | 在完整有界搜索中返回唯一受管元素引用。 |
| `Accessibility.read(ref, options?)` | 读取受管引用的白名单属性。 |
| `Accessibility.perform(ref, action, options?)` | 对受管引用最多提交一次原生动作。 |
| `Accessibility.release(ref)` | 释放当前 execution 创建的元素引用。 |

## 公共约定

### Scope：`within`

`snapshot()` 与 `find()` 必须显式提供 `within`：

```ts
type OpenDeskAccessibilityScope =
  | OpenDeskWindowInfo
  | OpenDeskAccessibilityElementRef
  | { app: OpenDeskAppTarget; root: 'application' | 'menuBar' };
```

- `OpenDeskWindowInfo` 必须仍能解析为原窗口；关闭、重建或 unresolved identity 会安全失败。
- `OpenDeskAccessibilityElementRef` 只能来自当前 execution 的 `Accessibility.find()`。
- `{ app, root }` 复用 [App](app.md) identity 解析；多实例必须由调用方消歧。
- 不提供全桌面默认 scope，也不接受 ScreenRegion、Display、裸坐标、快照节点或用户拼接的 ref ID。

### Selector

V1 selector 至少包含一个有效字段：

```ts
interface OpenDeskAccessibilitySelector {
  role?: string;
  name?: string;
  identifier?: string;
}
```

所有给出的字段按 AND 精确匹配。`name` / `identifier` 不做模糊匹配、翻译或忽略大小写。

常用规范化 role 包括：`application`、`window`、`menuBar`、`menu`、`menuItem`、`button`、`checkbox`、`radioButton`、`textField`、`staticText`、`group`、`list`、`listItem`、`table`、`row`、`cell`。无法安全映射时返回 `unknown` 并保留 `nativeRole`。

### ElementRef

`OpenDeskAccessibilityElementRef` 是当前 execution 内的 opaque capability：

```ts
interface OpenDeskAccessibilityElementRef {
  readonly kind: 'AccessibilityElementRef';
  readonly id: string;
  readonly role: string;
  readonly nativeRole: string;
}
```

公开字段只用于诊断，不构成可伪造 authority。跨 execution、释放后、目标重建后或通过 JSON 自行重建的 ref 均无效。

### 观察限制

| 选项/资源 | 默认值 | 最大值 |
| --- | ---: | ---: |
| `timeout` | 3000 ms | 30000 ms |
| `maxDepth` | 8 | 32 |
| `maxNodes` | 1000 | 5000 |
| 当前 execution 活跃 ref | — | 256 |
| 当前 execution 排队请求 | — | 32 |
| selector/path 单段 | — | 1024 Unicode code points |
| `setValue` UTF-8 内容 | — | 1 MiB |

`timeout` 是包含排队和原生工作的总 deadline。in-flight 原生调用不能保证强制撤回，因此 `getCapabilities().cancellation.hardCancel` 为 `false`。

### 可读属性

`read()` / `snapshot()` 的公开白名单包括：`role`、`nativeRole`、`name`、`identifier`、`enabled`、`focused`、`selected`、`checked`、`expanded`、`actions`、`nativeBounds`、`bounds` 与 `value`。

省略 `properties` 时使用不含 `value` 的基本属性集合。受保护或密码字段拒绝读取 `value`。无法可靠转换坐标时 `bounds` 为 `null`，不得把 `nativeBounds` 直接交给 `mouse`。

### 动作

```ts
type OpenDeskAccessibilityAction =
  | { action: 'invoke' }
  | { action: 'setValue'; value: string }
  | { action: 'expand' }
  | { action: 'collapse' }
  | { action: 'select' }
  | { action: 'setChecked'; checked: boolean };
```

`perform()` 会重新检查 ref、目标 identity、状态和实际原生 action/pattern。动作不会在失败后自动重试，也不会降级为 OCR 或鼠标。

`actionState`：

| 值 | 含义 |
| --- | --- |
| `not_started` | 已确认最终动作未尝试。 |
| `not_needed` | 目标状态已经满足，没有提交输入。 |
| `acknowledged` | 原生调用返回成功，但未证明业务完成。 |
| `unknown` | 动作可能已提交，不能自动重做。 |

## `Accessibility.getCapabilities()`

同步读取 Accessibility 能力摘要，不扫描桌面也不触发系统授权提示。

**签名**

```ts
Accessibility.getCapabilities(): OpenDeskAccessibilityCapabilities;
```

**参数**

无。

**返回值**

`OpenDeskAccessibilityCapabilities`，包含 `schemaVersion`、`platform`、`backend`、`hostAuthorization`、`implementation`、`permission`、`limits` 与 `cancellation` 等字段。

**行为与错误**

即使当前 execution 没有授权 Accessibility，也可以调用本方法检查状态。摘要中的全局 action capability 不是某个具体元素一定支持该动作的保证。

**示例**

```js
const capabilities = Accessibility.getCapabilities();
if (!capabilities.hostAuthorization.enabled ||
    !capabilities.implementation.available ||
    !capabilities.permission.granted) {
  console.log(capabilities);
}
```

## `Accessibility.snapshot(options)`

在明确 scope 内读取普通、可序列化的语义元素树。

**签名**

```ts
Accessibility.snapshot(
  options: OpenDeskAccessibilitySnapshotOptions,
): Promise<OpenDeskAccessibilitySnapshotResult>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options` | `OpenDeskAccessibilitySnapshotOptions` | 是 | 无 | snapshot 选项。 |
| `options.within` | `OpenDeskAccessibilityScope` | 是 | 无 | 明确观察 scope。 |
| `options.timeout` | `number` | 否 | `3000` ms | 总 deadline。 |
| `options.maxDepth` | `number` | 否 | `8` | 最大深度。 |
| `options.maxNodes` | `number` | 否 | `1000` | 最大节点数。 |
| `options.properties` | `string[]` | 否 | 基本属性 | 要读取的白名单属性。 |

**返回值**

`Promise<OpenDeskAccessibilitySnapshotResult>`。结果包含 `requestId`、`operation`、`backend`、`root`、`complete`、`truncated`、`reason` 与 `stats`。

**行为与错误**

snapshot 不为每个节点创建长期原生 ref。未物化、不可读取或超过限制的子树必须通过 `complete: false`、`truncated` 与 `reason` 表达，不能伪造成空且完整。

**示例**

```js
const result = await Accessibility.snapshot({
  within: win,
  maxDepth: 4,
  maxNodes: 300,
  properties: ['role', 'name', 'enabled', 'actions'],
});
console.log(result.complete, result.stats.nodes);
```

## `Accessibility.find(selector, options)`

完整搜索明确 scope，并且只在能证明唯一时返回受管元素引用。

**签名**

```ts
Accessibility.find(
  selector: OpenDeskAccessibilitySelector,
  options: OpenDeskAccessibilityFindOptions,
): Promise<OpenDeskAccessibilityElementRef | null>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `selector` | `OpenDeskAccessibilitySelector` | 是 | 无 | 至少包含 `role`、`name`、`identifier` 之一。 |
| `options` | `OpenDeskAccessibilityFindOptions` | 是 | 无 | 搜索选项。 |
| `options.within` | `OpenDeskAccessibilityScope` | 是 | 无 | 明确搜索 scope。 |
| `options.timeout` | `number` | 否 | `3000` ms | 总 deadline；不是等待元素出现。 |
| `options.maxDepth` | `number` | 否 | `8` | 最大深度。 |
| `options.maxNodes` | `number` | 否 | `1000` | 最大节点数。 |

**返回值**

`Promise<OpenDeskAccessibilityElementRef | null>`。完整搜索且无候选返回 `null`；唯一候选返回当前 execution 所有的 opaque ref。

**行为与错误**

多个候选抛 `AMBIGUOUS_TARGET`；达到限制而无法证明唯一性时抛 `SEARCH_INCOMPLETE`；deadline 到达抛 `TIMEOUT`。不会看到第一个候选就提前宣称唯一。

**示例**

```js
const button = await Accessibility.find(
  { role: 'button', name: 'Apply' },
  { within: win },
);
```

## `Accessibility.read(ref, options?)`

读取受管元素引用的白名单属性。

**签名**

```ts
Accessibility.read(
  ref: OpenDeskAccessibilityElementRef,
  options?: OpenDeskAccessibilityReadOptions,
): Promise<OpenDeskAccessibilityReadResult>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `ref` | `OpenDeskAccessibilityElementRef` | 是 | 无 | 当前 execution 创建且尚未释放的元素引用。 |
| `options` | `OpenDeskAccessibilityReadOptions` | 否 | `{}` | 读取选项。 |
| `options.properties` | `string[]` | 否 | 基本属性 | 要读取的白名单属性。 |
| `options.timeout` | `number` | 否 | `3000` ms | 总 deadline。 |

**返回值**

`Promise<OpenDeskAccessibilityReadResult>`。

**行为与错误**

读取前重新验证 ref 与目标。受保护 value、失效 ref、释放后的 ref 或 backend 失败会以结构化错误拒绝。不会自动按同名元素重新定位失效 ref。

**示例**

```js
const details = await Accessibility.read(button, {
  properties: ['role', 'name', 'enabled', 'actions'],
  timeout: 1000,
});
```

## `Accessibility.perform(ref, action, options?)`

对受管元素最多提交一次原生动作。

**签名**

```ts
Accessibility.perform(
  ref: OpenDeskAccessibilityElementRef,
  action: OpenDeskAccessibilityAction,
  options?: OpenDeskAccessibilityPerformOptions,
): Promise<OpenDeskAccessibilityPerformResult>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `ref` | `OpenDeskAccessibilityElementRef` | 是 | 无 | 当前 execution 创建且尚未释放的元素引用。 |
| `action` | `OpenDeskAccessibilityAction` | 是 | 无 | 要执行的明确原生动作。 |
| `options` | `OpenDeskAccessibilityPerformOptions` | 否 | `{}` | 动作选项。 |
| `options.timeout` | `number` | 否 | `3000` ms | 包含排队和原生工作的总 deadline。 |

**返回值**

`Promise<OpenDeskAccessibilityPerformResult>`，至少包含 `requestId`、`operation`、`action`、`backend` 与 `actionState`。

**行为与错误**

执行前重新验证 ref、identity、enabled/readonly 状态和实际原生能力。`setChecked` 已满足目标值时可返回 `not_needed`。不支持动作时抛 `ACTION_NOT_SUPPORTED`；无法可靠读取当前状态时可抛 `STATE_UNKNOWN`。一旦动作可能已经提交，错误必须通过 `actionState: 'unknown'` 表达，调用方不得自动重做。

**示例**

```js
const result = await Accessibility.perform(button, { action: 'invoke' });
console.log(result.actionState);
```

## `Accessibility.release(ref)`

显式释放当前 execution 创建的元素引用。

**签名**

```ts
Accessibility.release(
  ref: OpenDeskAccessibilityElementRef,
): Promise<boolean>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `ref` | `OpenDeskAccessibilityElementRef` | 是 | 无 | 要释放的合法元素引用。 |

**返回值**

`Promise<boolean>`。首次释放合法 ref 返回 `true`；再次释放同一合法 ref 返回 `false`。

**行为与错误**

伪造或其他 execution 的对象不是正常重复释放，会拒绝。Runtime teardown 会释放遗留 ref，但长期脚本仍应在不再使用时主动释放。

**示例**

```js
if (button) {
  try {
    await Accessibility.perform(button, { action: 'invoke' });
  } finally {
    await Accessibility.release(button);
  }
}
```

## 错误

rejection 为 `Error`，并至少包含：

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

稳定错误码包括：

```text
INVALID_ARGUMENT
CAPABILITY_DISABLED
NOT_SUPPORTED
PERMISSION_DENIED
TARGET_NOT_FOUND
AMBIGUOUS_TARGET
SEARCH_INCOMPLETE
STALE_TARGET
ELEMENT_DISABLED
ACTION_NOT_SUPPORTED
STATE_UNKNOWN
TIMEOUT
CANCELED
QUEUE_FULL
RESOURCE_LIMIT
BACKEND_FAILED
```

不要解析 `message` 判断错误类型。错误默认不包含 selector、输入 value、完整控件正文、原生地址或完整菜单路径。

## 平台与能力

| 平台 | 后端 | 说明 |
| --- | --- | --- |
| macOS + cgo | AXUIElement client | 需要系统 Accessibility 权限；方法本身不自动弹授权窗口。 |
| macOS without cgo | Unsupported | `implementation.available: false`，不降级为 AppleScript。 |
| Windows | UI Automation client | 元素实际 pattern/action 决定动作支持。 |
| 其他平台 | Unsupported | capability 摘要可读，观察和动作拒绝为 `NOT_SUPPORTED`。 |

需要主动处理系统权限时使用 [`page.ensurePermissions()`](page.md)。高层原生菜单组合操作见 [`UI.getMenuItems()` / `UI.findMenuItem()` / `UI.tapMenuItem()`](desktop-ui.md)。
