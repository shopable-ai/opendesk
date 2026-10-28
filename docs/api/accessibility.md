---
docType: reference
title: Accessibility API
description: 通过 execution-owned 的 macOS AX / Windows UI Automation 后端观察并操作外部桌面应用的语义元素。
order: 100
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

### Scope：within

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

常用规范化 role 包括：`application`、`window`、`menuBar`、`menu`、`menuItem`、`button`、`checkbox`、`radioButton`、`textField`、`popUpButton`、`staticText`、`group`、`list`、`listItem`、`table`、`row`、`cell`。无法安全映射时返回 `unknown` 并保留 `nativeRole`。

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
| `maxDepth` | 8 | 64 |
| `maxNodes` | 1000 | 5000 |
| 当前 execution 活跃 ref | — | 256 |
| 当前 execution 排队请求 | — | 32 |
| selector/path 单段 | — | 1024 Unicode code points |
| `setValue` 内容 / `prepareTextAppend.value` 预期完整草稿（UTF-8） | — | 1 MiB |

`timeout` 是包含排队和原生工作的总 deadline。in-flight 原生调用不能保证强制撤回，因此 `getCapabilities().cancellation.hardCancel` 为 `false`。

深层原生应用可显式申请大于 32 的 `maxDepth`；默认仍为 8，节点数与总 deadline 限制同时生效。达到任一限制仍不能把部分树视为完整搜索。

### 可读属性

`read()` / `snapshot()` 的公开白名单包括：`role`、`nativeRole`、`nativeSubrole`、`name`、`identifier`、`enabled`、`focused`、`selected`、`checked`、`expanded`、`actions`、`nativeBounds`、`bounds` 与 `value`。

`textInputState` 是额外的 **read-only property**：只允许 `read(ref, { properties: ['textInputState'] })` 显式读取；`snapshot` 请求该属性会抛 `INVALID_ARGUMENT`。默认观察、snapshot 和 find 不查询 selection/marked range。

省略 `properties` 时使用不含 `value` 和 `textInputState` 的基本属性集合。`nativeSubrole` 是平台原生、可空的诊断属性：macOS 来自 AXSubrole，Windows UIA 当前返回 `null`；它不是新的 selector 字段。macOS 的规范化 `name` 优先来自非空 AXTitle，AXTitle 缺失或为空时使用 AXDescription；二者均无名称时保留实际空 AXTitle 或 `null`。V1 不另行复制一个 `title` 字段。任何原生字段不可用时保留 `null`，不能根据常见界面补值。

受保护或密码字段拒绝读取 `value` 和 `textInputState`。受限 execution 的 `DenyValue` 同时禁止这两个属性以及 `prepareTextAppend`，以防泄露草稿长度；`ReadOnly` 禁止所有 perform 动作。无法可靠转换坐标时 `bounds` 为 `null`，不得把 `nativeBounds` 直接交给 `mouse`。

macOS 的 `coordinateMapping: true` 表示**条件支持**：仅明确 `WindowInfo` scope，在同一 native window ID 的 AX root 与当前精确 CG 窗口的 x、y、width、height 逐项相差不超过 1 point 时，按该窗口 anchor 转换子节点，返回 `coordinateSpace: 'screen'` 的 bounds。未通过校准则保留 `nativeBounds`，`bounds` 为 `null`；application/menu scope 不校准。由成功校准的窗口搜索取得的 ref（及其后续子 ref）保留校准，read 前后重验窗口 identity、元素所属窗口与 anchor 几何；窗口移动、resize、重建或 anchor 改变会拒绝为 `STALE_TARGET`，需以新 `WindowInfo` 重新 find，不沿用旧坐标。这些逐次检查不是原子事务，也不锁定后续鼠标动作。

### 动作

```ts
type OpenDeskAccessibilityAction =
  | { action: 'invoke' }
  | { action: 'setValue'; value: string }
  | { action: 'prepareTextAppend'; value: string }
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

## Accessibility.getCapabilities()

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

## Accessibility.snapshot(options)

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
  properties: ['role', 'nativeSubrole', 'name', 'enabled', 'actions'],
});
console.log(result.complete, result.stats.nodes);
```

## Accessibility.find(selector, options)

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

## Accessibility.read(ref, options?)

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

显式读取 `textInputState` 返回 `null` 或下列对象（位于结果的 `properties.textInputState`）：

```ts
{
  unit: 'utf16';
  selection: { location: number; length: number } | null;
  composition: 'inactive' | 'active' | 'unknown';
  markedRange: { location: number; length: number } | null;
  source: 'AXTextInputMarkedRange';
  reason: 'attribute_unsupported' | 'no_value' | 'null_value' |
    'not_cf_range' | 'invalid_range' | 'provider_unqualified' | null;
}
```

macOS 非安全 `textField`（含规范化为此 role 的 AXTextArea）读取真实 `AXSelectedTextRange` 与 AppKit 的 `NSAccessibilityTextInputMarkedRangeAttribute`。selection 只有实际取得合法 CFRange 才非空；若 `AXSelectedTextRanges` 暴露多个范围、空数组、错误类型或与单一范围不一致，selection 为 `null`。未暴露 plural attribute 时仍必须实际读到 singular range，不从缺失信息推断 caret。

`markedRange` 保留实际 AXValue CFRange 的原始 location/length；缺失、类型错误或超出 JavaScript 精确整数范围时为 `null`。selection 与 markedRange 的单位都是 UTF-16 code units，不是 Unicode code points 或 UTF-8 bytes。

**当前没有已资格化的 provider，composition 始终为 `unknown`。** 读到合法范围（包括零长度及 `{-1, 0}`）时 reason 为 `provider_unqualified`；不支持、NoValue、null、非 CFRange 或非法范围分别保留原因。SDK 没有规定该 AX 属性的无组合态 sentinel，不能套用另一协议 NSTextInputClient.markedRange 的约定。将来只有独立实窗验证过的特定 provider 才能映射 `active` / `inactive`；当前没有配置或参数可绕过此限制。Windows 返回 `null`，macOS 非 textField 返回 `null`；受保护字段拒绝读取。

**示例**

```js
const details = await Accessibility.read(button, {
  properties: ['role', 'name', 'enabled', 'actions'],
  timeout: 1000,
});
```

## Accessibility.perform(ref, action, options?)

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

执行前重新验证 ref、identity、enabled/readonly 状态和实际原生能力。macOS 的标准可写 `AXTextArea` 可能不提供 `AXEnabled`；对 `setValue`，此时以非安全元素且 `AXValue` 可写作为能力证明，显式 `AXEnabled: false` 仍抛 `ELEMENT_DISABLED`，只读值仍抛 `ACTION_NOT_SUPPORTED`。`setValue` 也适用于明确暴露可写字符串 `AXValue` 的 `popUpButton`，调用方仍须独立回读所选值。`setChecked` 已满足目标值时可返回 `not_needed`。其他动作无法可靠读取必需状态时可抛 `STATE_UNKNOWN`。一旦动作可能已经提交，错误必须通过 `actionState: 'unknown'` 表达，调用方不得自动重做。

`prepareTextAppend` 是 macOS 非 secure `textField` 的受限动作。**当前没有已资格化的组合态 provider，动作会拒绝，且 capability 为 false；不会移动选区。** `value` 表示 **expected 完整草稿**，不是待插入的内容；允许空字符串，最大 1 MiB UTF-8，参数校验沿用 `setValue`，错误和日志不包含正文。原生执行门要求以下条件全部成立：

1. ref/目标 identity 有效，当前元素已 focused，未显式 disabled，AXValue 和 AXSelectedTextRange 均可写。
2. 当前字符串 AXValue 与 expected 逐 UTF-16 单元精确相等，composition 为 `inactive`，实际单一 selection 可读且位于完整草稿范围内。
3. 把 AXSelectedTextRange 设置为 `{location: CFStringGetLength(expected), length: 0}`，最多调用一次 setter；若原本满足可返回 `not_needed`。
4. 再读完整 value、focus、selection 和 composition 并核对；不满足则拒绝。setter 尝试之前设置 attempted，此后任何失败（包括超时、取消、identity 或回读失败）均为 `actionState: 'unknown'`，禁止自动重试。

该动作不输入文本、不激活应用、不发按键、不写 AXValue。缺少 selection/IME/可写能力时保持阻塞，以 `STATE_UNKNOWN` 或 `ACTION_NOT_SUPPORTED` 拒绝；Windows 为 `ACTION_NOT_SUPPORTED`。`implementation.actions.prepareTextAppend` 当前在所有平台均为 false；源码中的后续选区设置路径不是已可用能力。

这是非事务操作：AX 逐次观测与 setter 不形成原子事务，也不锁定后续输入。即使将来准备动作通过，也只证明该次 caret 准备，不能据此授权全局粘贴或声称定向插入可用。没有目标 live 证据不得宣称业务可用；unknown/unsupported 不可降级为盲目重试。

**定向追加的限制**：当前没有公开的 directed append 动作。macOS SDK 的 `AXSelectedText` 合同标明只读，`AXSelectedTextRange` / `AXSelectedTextRanges` 可写仅代表选区可改，不代表可以插入文本；`AXInsertionPointLineNumber` 是 caret 所在行号，不是 insertion action。标准 AX actions 未定义携带文本的插入动作。AppKit 的 `NSTextInputClient.insertText:replacementRange:` 和 `markedRange` 属于应用内部输入协议，不能当作外部 AX 元素的可调用方法或组合态证明。若特定 provider 另行暴露可写 selected-text 或插入扩展，仍须独立证明其替换语义、组合态和目标 identity；属性存在或 settable 为 true 本身不足以资格化。

因此，仅有唯一、空名的 WebKit `AXTextArea`、可写 `AXValue` 与可写选区，不能证明可以安全完成“非空草稿 D 后追加 `\n\n` 和正文，空稿写入正文”。当前应报告定向追加不可用；不得通过全框 `setValue`、全选重填、全局粘贴、Return/Enter 或把 `unknown` 改成 `inactive` 绕过。此限制不代表已经在特定应用实测出 selected-text 不可写，而是当前公开合同及 provider 证据尚不能支持安全插入。

**示例**

```js
const result = await Accessibility.perform(button, { action: 'invoke' });
console.log(result.actionState);
```

## Accessibility.release(ref)

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
