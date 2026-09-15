---
title: Desktop UI API
description: 使用 OCR、模板匹配、屏幕坐标与原生 Accessibility 查找和操作外部桌面应用 UI。
docType: reference
order: 50
---

# UI

`UI` 是 OpenDesk 操作**外部桌面应用界面**的高层 API。文本和图片方法基于截图、OCR 或模板匹配；`tapTargets()` 的轻量 semantic form 由 Runtime 自动协调 OCR 与第一方 [Accessibility](accessibility.md)，菜单与 advanced legacy locator form 则复用原生语义能力。

`UI` 与小写 [ui](ui.md) 不同：`UI` 操作外部应用，`ui` 创建 OpenDesk 自己的 Custom UI。二者没有别名。

## API 一览

| 方法 | 状态 | 用途 |
| --- | --- | --- |
| `UI.within(win)` | Experimental · Local | 同步绑定一个已解析窗口，返回可复用的轻量 UI Scope。 |
| `UI.getCapabilities()` | Stable | 查询当前高层 UI 能力。 |
| `UI.getValue(target, options)` | Experimental · Local | 读取唯一原生文本框的字符串值。 |
| `UI.setValue(target, value, options)` | Experimental · Local | 设置唯一原生文本框的完整字符串值并用同一引用回读。 |
| `UI.findTexts(text, options?)` | Stable | 返回全部匹配文本。 |
| `UI.findTextMatches(queries, options?)` | Stable | 用一次截图和 OCR 批量计算多组字符串或正则匹配。 |
| `UI.findText(text, options?)` | Stable | 返回唯一匹配文本。 |
| `UI.hasText(text, options?)` | Stable | 判断是否存在匹配文本。 |
| `UI.tapText(text, options?)` | Stable | 查找并点击唯一文本。 |
| `UI.tapTexts(texts, options?)` | Stable；序列等待为 Experimental | 按顺序等待、重新定位并点击多个文本，默认步间隔 300 ms。 |
| `UI.tapTargets(targets, options?)` | Experimental · Local | 逐步骤文字或扁平语义目标；由 Runtime 负责定位、执行和清理。 |
| `UI.waitText(text, options?)` | Stable | 等待唯一文本出现。 |
| `UI.waitTextGone(text, options?)` | Stable | 等待文本消失。 |
| `UI.findImages(template, options?)` | Stable | 返回全部模板匹配。 |
| `UI.findImage(template, options?)` | Stable | 返回唯一模板匹配。 |
| `UI.tapImage(template, options?)` | Stable | 查找并点击唯一图片。 |
| `UI.getMenuItems(options)` | Experimental | 只读观察当前已物化的原生菜单。 |
| `UI.findMenuItem(path, options)` | Experimental | 只读查找完整原生菜单路径。 |
| `UI.tapMenuItem(path, options)` | Experimental | 逐层展开并执行完整原生菜单路径。 |

视觉或原生动作成功只表示目标已读取或输入已提交，不证明保存、提交、导出等业务结果已经完成。自动化脚本仍应验证业务后置条件。

本页示例用于从仓库根目录运行的普通 OpenDesk JavaScript。引用 `win` 的示例要求先取得并核对目标窗口，例如 `const win = await window.getActiveWindow();`；目标必须可见且具备当前平台所需权限。菜单和素材示例还需对应应用菜单与实际模板文件，不能直接对未知业务窗口尝试。

## UI.within(win)

同步创建一个绑定到已解析 `WindowInfo` identity 的轻量 UI Scope。构造只复制并校验窗口描述：不截图、不扫描 Accessibility tree、不激活窗口、不发送输入，也不创建长期 native ref。

**签名**

```ts
UI.within(win: OpenDeskWindowInfo): OpenDeskUIWindowScope;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `win` | `OpenDeskWindowInfo` | 是 | 无 | 由 `window.get()`、`window.wait()` 或等价已解析 API 返回的实际窗口；不是按标题查询条件。 |

**返回值**

`OpenDeskUIWindowScope`。Scope 保存调用时的 identity snapshot，而不是对调用方对象的引用。

**行为与错误**

每个 Scope 或 Locator 方法都会先用 `window.current()` 刷新同一 `id`、PID 与 native handle 的 geometry。移动或 resize 保持 Scope 有效；窗口关闭、重建或同名新窗口不会重新绑定，后续操作以 `STALE_TARGET` 失败。Scope-bound 调用不接受 `options.within`，以免替换已经绑定的窗口。

Scope 复用下列既有函数式 API；它只自动补入当前新鲜 `within`，不改变底层 OCR、image、Accessibility、cancellation、actionState 或 cleanup 合同。

| Scope 方法 | 对应函数式 API |
| --- | --- |
| `findText`、`findTexts`、`findTextMatches`、`hasText` | `UI.findText`、`UI.findTexts`、`UI.findTextMatches`、`UI.hasText` |
| `tapText`、`tapTexts`、`tapTargets` | `UI.tapText`、`UI.tapTexts`、`UI.tapTargets` |
| `findImage`、`findImages`、`tapImage` | `UI.findImage`、`UI.findImages`、`UI.tapImage` |
| `getValue`、`setValue` | `UI.getValue`、`UI.setValue` |

**示例**

```js
const win = await window.wait({ title: '目标窗口' });
const app = UI.within(win);

await app.tapText('保存');
```

## UI Scope locator(target)

同步创建一个 lightweight Locator。Locator 只保存 Scope identity 与复制后的 target description；它不是 `ElementHandle`，不保存 OCR 坐标、截图结果、Accessibility ref 或任何旧观察。

**签名**

```ts
scope.locator(target: OpenDeskUILocatorTarget): OpenDeskUILocator;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `OpenDeskUILocatorTarget` | 是 | 无 | 一种文字、图片或 native semantic target；所有给出的 semantic 字段按精确 AND 条件解释。 |

**返回值**

`OpenDeskUILocator`。构造不保证目标当前存在。

**行为与错误**

P0 target 形式是 `{ text: '保存' }`、`{ image: './assets/save.png' }` 和 `{ role: 'button', name: '保存' }`；semantic target 也可提供 `identifier` 及现有 `UI.tapTargets()` 支持的扁平约束。图片不能与其他字段混用。没有 UI tree 时，text/image Locator 仍直接使用原有 visual capability；semantic target 则明确报告 native capability failure。

**示例**

```js
const save = app.locator({ text: '保存' });
```

## Locator.find(options?)

对当前 Scope 做一次有界、只读观察。

**签名**

```ts
locator.find(options?: OpenDeskUILocatorFindOptions): Promise<OpenDeskUITargetMatch | null>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options` | `OpenDeskUILocatorFindOptions` | 否 | `{}` | `timeout` 默认 `3000` ms；`signal` 在观察阶段之间检查；`maxDepth`/`maxNodes` 只影响 semantic traversal。 |

**返回值**

完整且可靠的零匹配返回 `null`。唯一匹配返回普通、冻结的 `OpenDeskUITargetMatch` snapshot，不是可执行对象。snapshot 只包含本次真实读取的 source、window identity、bounds、时间和可靠属性；未确认的 native state/value 不会填充猜测值。

**行为与错误**

多匹配为 `AMBIGUOUS_TARGET`；无法证明搜索完整为 `SEARCH_INCOMPLETE`；截图/OCR/图片/权限/backend 失败保持原错误，不能转换为 `null`。semantic observation 在返回前释放本次 `Accessibility` ref。

**示例**

```js
const observed = await save.find();
if (observed === null) console.log('当前可见范围没有保存按钮');
```

## Locator.waitFor(options?)

只读等待 Locator 的 `exists` 或 `visible` 状态。

**签名**

```ts
locator.waitFor(options?: OpenDeskUILocatorWaitOptions): Promise<void>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options` | `OpenDeskUILocatorWaitOptions` | 否 | `{}` | `state` 默认为 `exists`；`timeout` 是默认 `10000` ms 的单一总 deadline；可传 `signal`。 |

**返回值**

条件被可靠证明时返回 `Promise<void>`。

**行为与错误**

每轮都是一次新只读观察，且不会重置总 deadline。暂时零匹配会在剩余预算内重试；`STALE_TARGET`、权限/backend failure、`AMBIGUOUS_TARGET`、`SEARCH_INCOMPLETE`、取消和明确不支持立即结束。视觉 target 的存在即为当前可见证据；semantic `visible` 仅在 native backend 能可靠证明时支持，否则为 `NOT_SUPPORTED`。

**示例**

```js
await save.waitFor({ state: 'visible', timeout: 5000 });
```

## Locator.tap(options?)

通过现有 target-specific action owner 对当前 Locator 最多提交一次动作。

**签名**

```ts
locator.tap(options?: OpenDeskUILocatorTapOptions): Promise<
  OpenDeskUITapResult<OpenDeskUITextTarget>
  | OpenDeskUITapResult<OpenDeskUIImageTarget>
  | OpenDeskUISemanticTapResult
>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options` | `OpenDeskUILocatorTapOptions` | 否 | `{}` | 可传现有 action timeout；semantic action 也把 `signal` 交给 `UI.tapTargets()`。 |

**返回值**

对应原 action owner 的真实 result。

**行为与错误**

semantic target 委托 `UI.tapTargets()`；text target 委托 `UI.tapText()`；image target 委托 `UI.tapImage()`。image Locator 在不要求调用方公开 strategy 参数的前提下，向既有 image owner 传入高置信度阈值 `0.95`，避免近似视觉结果变成任意点击。Locator 不建立第二套点击器，也不会在 submitted/unknown 动作后改用 OCR、image 或其它 backend 再点一次。既有 `actionState`、completed prefix、diagnostics、cancellation 和 cleanup 语义原样保留。

**示例**

```js
await save.tap();
```

## Locator.getValue(options?)

读取当前 Locator 指向的严格 native `textField` 字符串值。

**签名**

```ts
locator.getValue(options?: OpenDeskUILocatorValueOptions): Promise<string>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options` | `OpenDeskUILocatorValueOptions` | 否 | `{}` | 复用 `UI.getValue()` 的 timeout、maxDepth 和 maxNodes；Scope 提供 `within`。 |

**返回值**

目标原生 owner 实际读取的完整字符串，包含空字符串、Unicode 和空白。

**行为与错误**

仅 semantic target 支持此方法，且目标必须是可读取的 native `textField`。OCR 可见文字、图片、accessible name 和猜测值不会充当 value；没有可靠原生证据时为 `NOT_SUPPORTED`。

**示例**

```js
const actual = await app.locator({ role: 'textField', identifier: 'messageInput' }).getValue();
```

## Locator.setValue(value, options?)

用原生 `setValue` action 设置完整字符串，并复用现有严格回读验证。

**签名**

```ts
locator.setValue(value: string, options?: OpenDeskUILocatorValueOptions): Promise<OpenDeskUISetValueResult>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `value` | `string` | 是 | 无 | 要设置的完整 native value；空字符串合法。 |
| `options` | `OpenDeskUILocatorValueOptions` | 否 | `{}` | 复用 `UI.setValue()` 的 timeout、maxDepth 和 maxNodes；Scope 提供 `within`。 |

**返回值**

`OpenDeskUISetValueResult`，其中 `verified: true` 表示同一 native ref 的读回与输入字符串完全相等。

**行为与错误**

只调用已有原生 owner；不会 click、全选、键盘输入或 OCR fallback。若 actionState 变成 `unknown` 或验证不能可靠完成，调用失败且不自动重放输入。

**示例**

```js
const input = app.locator({ role: 'textField', identifier: 'messageInput' });
await input.setValue('你好');
console.log(await input.getValue());
```

## 公共约定

### 原生文本值选项

`UI.getValue()` 与 `UI.setValue()` 是现有 [Accessibility](accessibility.md) owner 上的无 ref 高层组合，不创建另一套定位器、原生资源或动作 Runtime。`target` 直接使用 `OpenDeskAccessibilitySelector`；`role`、`name`、`identifier` 仍按 V1 的 AND 精确匹配解释。`name` 只是 selector 证据，不会在 `value` 不可读时替代字段值。

```ts
interface OpenDeskUIValueOptions {
  within: OpenDeskAccessibilityScope;
  timeout?: number;
  maxDepth?: number;
  maxNodes?: number;
}
```

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `within` | `OpenDeskAccessibilityScope` | 是 | 无 | 明确窗口、当前 execution 的容器 ref 或 App application root；不默认全桌面或活动窗口。 |
| `timeout` | `number` | 否 | `3000` ms | `1..30000` 的整数；覆盖定位、读取、动作与回读的单一总 deadline，不按阶段重置。 |
| `maxDepth` | `number` | 否 | `8` | 有界唯一查找深度；最大 `32`。 |
| `maxNodes` | `number` | 否 | `1000` | 有界唯一查找节点数；最大 `5000`。 |

调用不会启动、聚焦或切换窗口，不等待控件将来出现，也不从原生语义降级到 OCR、鼠标或键盘。当前底层没有 per-call `AbortSignal` owner，因此这两个方法不接受 `signal`；外层 `Promise.race` 也不能取消正在执行的原生调用。

首版只接受原生 role 为 `textField` 且 `value` 实际为字符串的目标。checkbox、range、selection、name、文档正文和 OCR 文本不属于本合同；数字、布尔值、对象与 `null` 不做隐式字符串转换。`UI.setValue()` 的空字符串是合法完整值，可用于清空非受保护、未明确 disabled、由同一 Accessibility owner 公开 `setValue` action 的可编辑文本框。

每次调用都执行完整有界唯一查找。目标不存在、多个目标或搜索不完整分别保留 `TARGET_NOT_FOUND`、`AMBIGUOUS_TARGET` 与 `SEARCH_INCOMPLETE`。当前 flat selector 不能在一次调用中表达父容器／祖先 selector；若 Recorder 或手写 locator 的唯一性依赖该约束，调用方必须先用 `Accessibility.find()` 取得并管理容器 ref，再作为 `within` 使用，或停止并保留该依赖，不能静默丢弃结构约束。

值方法拒绝时符合 `OpenDeskUIValueError` 声明。`phase` 固定表达高层生命周期：`arguments`、`capability`、`locate`、`read`、`precondition`、`action`、`verification` 或 `cleanup`；底层 backend phase 可用时保留在 `nativePhase`，即使名称相同也不会覆盖高层 phase。错误始终包含 `code`、`operation`、`phase` 与 `actionState`，并在确实可用时保留 `verified`、`backend`、`requestId`、`cause` 和脱敏的 `cleanupError`。该声明只是错误对象形状，不新增 Runtime 全局构造器。

### 原生 target 序列选项

本小节只适用于兼容的 `[{locator: ...}]` 形式；新代码使用下方 `UI.tapTargets` 的字符串／扁平 target 形式，不暴露遍历与 refocus 配置。

`UI.tapTargets()` 是现有 `Accessibility.find/read/perform/release` owner 上的 Experimental 顺序组合。每步必须显式提供一个 V1 exact selector；本方法只提交 `invoke`，不推断控件类型、坐标、应用、按钮别名或业务结果。

```ts
interface OpenDeskUITapTargetStep {
  locator: OpenDeskAccessibilitySelector;
}

interface OpenDeskUITapTargetsOptions {
  within: OpenDeskWindowInfo;
  timeout?: number;
  maxDepth?: number;
  maxNodes?: number;
  refocus?: 'if-needed';
  refocusTimeout?: number;
  signal?: AbortSignal | null;
}
```

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `targets` | `OpenDeskUITapTargetStep[]` | 是 | 无 | `1..256` 个步骤；每项只允许 `locator`。序列、步骤与 locator 在首个 await 前复制并校验。 |
| `options.within` | `OpenDeskWindowInfo` | 是 | 无 | 已解析窗口；必须包含稳定 id、正 PID、title、非零 native handle 与正 bounds。 |
| `options.timeout` | `number` | 否 | `3000` ms | 每次原生 find/read/perform 的有界整数预算，范围 `1..30000`。 |
| `options.maxDepth` | `number` | 否 | `8` | 每个 distinct locator 的唯一查找深度，范围 `1..32`。 |
| `options.maxNodes` | `number` | 否 | `1000` | 每个 distinct locator 的唯一查找节点数，范围 `1..5000`。 |
| `options.signal` | `AbortSignal \| null` | 否 | 未设置 | 在原生请求之间阻止后续观察或动作；不能撤回已经开始的同步 native 调用。 |

本方法不接受视觉 fallback、OCR provider、坐标、重试、等待未来控件或每步不同 scope。若 Accessibility 不可用、权限未授予或 invoke backend 未实现，会在 target observation 前失败。

### 文本选项

文本方法共享 `OpenDeskUITextOptions` 中的基础选项。`findTexts()`、`findText()`、`hasText()` 和 `tapText()` 使用允许定位规则的 `OpenDeskUITextLocateOptions`；`tapTexts()` 使用 `OpenDeskUITapTextsOptions`，其默认等待和时序见独立方法条目。`waitText()` 与 `waitTextGone()` 仍使用 `OpenDeskUITextOptions`。

```ts
interface OpenDeskUITextOptions {
  within?: OpenDeskWindowInfo | OpenDeskDisplayInfo | OpenDeskScreenRegion;
  match?: 'exact' | 'contains';
  caseSensitive?: boolean;
  normalizeWhitespace?: boolean;
  minConfidence?: number;
  provider?: string;
  providerChain?: string[];
  lang?: string;
  index?: number;
  timeout?: number;
  polling?: number;
  click?: OpenDeskMouseClickOptions;
  intervalMs?: number;
}
```

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `within` | `OpenDeskWindowInfo \| OpenDeskDisplayInfo \| OpenDeskScreenRegion` | 否 | 当前活动窗口 | 限定截图和识别范围；`tapTexts()` 默认等待模式只接受明确 WindowInfo 或省略值。 |
| `match` | `'exact' \| 'contains'` | 否 | `'exact'` | 文本匹配方式。 |
| `caseSensitive` | `boolean` | 否 | `false` | 是否区分大小写。 |
| `normalizeWhitespace` | `boolean` | 否 | `true` | 是否 trim 并折叠连续空白。 |
| `minConfidence` | `number` | 否 | Vision 默认 | OCR 最低置信度。 |
| `provider` | `string` | 否 | Vision 默认 | 指定单个 OCR provider。 |
| `providerChain` | `string[]` | 否 | Vision 默认 | 指定 OCR provider 尝试顺序。 |
| `lang` | `string` | 否 | Vision 默认 | OCR 语言。 |
| `index` | `number` | 否 | 未设置 | 多候选时使用的零基显式索引；越界明确失败，不自动挑选另一项。 |
| `timeout` | `number` | 否 | `10000` ms | `waitText()` / `waitTextGone()` 的总等待时间；`tapTexts()` 默认等待模式中是每步预算。 |
| `polling` | `number` | 否 | `200` ms | 等待时的轮询间隔。 |
| `click` | `OpenDeskMouseClickOptions` | 否 | 未设置 | 点击方法转发给 `mouse.clickPoint()` 的选项。 |
| `intervalMs` | `number` | 否 | `300` ms（tapTexts） | `tapTexts()` 两步之间额外等待；其他文本方法不执行序列间隔。 |
| `region` | `OpenDeskScreenRegion \| ((currentWin) => OpenDeskScreenRegion)` | 否 | 未设置 | 定位选项，在明确窗口内进一步限定搜索范围。 |
| `relativeTo` | `OpenDeskUIRelativeText` | 否 | 未设置 | 定位选项，基于同次 OCR 中唯一文本参照物筛选目标。 |

`region` 与 `relativeTo` 只支持 `findTexts()`、`findText()`、`hasText()`、`tapText()` 和 `tapTexts()`，并要求 `within` 是明确的 `OpenDeskWindowInfo`。`waitText()`、`waitTextGone()` 或图片方法收到这两个字段时会在观察或输入前抛 `INVALID_ARGUMENT`。

### Scope：within

未指定 `within` 时，视觉 API 使用当前活动窗口。`tapTexts()` 默认在首步观察时绑定该窗口，并在整段序列中保持同一身份；其他方法不会因为这个默认值变化而获得新的跨调用绑定合同。

显式 scope 可为：

```ts
OpenDeskWindowInfo | OpenDeskDisplayInfo | OpenDeskScreenRegion
```

`tapTexts()` 的 `waitForEach: true` 只接受已解析的 WindowInfo 或省略 scope。Display、ScreenRegion 需要显式 `waitForEach: false`。WindowTarget 查询条件不是 WindowInfo，不能直接作为 `within`；先使用 `window.get()` 查询。

视觉 API 会将 scope 转换为 screen logical region，再与 `Screen.getVirtualBounds()` 求交。完全不可见时抛 `TARGET_SCOPE_NOT_VISIBLE`；部分可见时只截取可见交集。

如果 scope 横跨有效 scale 不同的显示器，当前版本抛 `UNSUPPORTED_MIXED_DPI_SCOPE`。不要传裸 `{x, y, width, height}` bbox。

### region

`region` 是显式窗口内的更严格搜索范围。

静态 region 是坐标快照，不会跟随窗口移动或 resize：

```js
const fixedRegion = Geometry.regionOffset(win, {
  left: 16,
  top: 300,
  width: 320,
  height: 60,
});
```

动态 region 在每次新观察前用最新的同一窗口快照重算：

```js
currentWin => Geometry.regionByEdges(currentWin, {
  left: 16,
  right: 16,
  bottom: 12,
  height: 60,
})
```

动态规则必须同步返回 tagged `OpenDeskScreenRegion`。`Promise`、`null`、裸 bbox、image-space region 或非法数字均为 `INVALID_ARGUMENT`。

### relativeTo

`relativeTo` 使用**同一次截图、同一次 OCR** 中唯一的 exact 文本作为参照物。

方向模式：

```ts
interface OpenDeskUIRelativeTextDirection {
  text: string;
  direction: 'right' | 'left' | 'above' | 'below';
  maxGap: number;
  minOverlap?: number;
}
```

`maxGap` 必须是非负有限 screen logical distance；`minOverlap` 取 `(0, 1]`，默认 `0.5`。方向模式只筛选候选，不自动选择最近项。

矩形模式：

```ts
interface OpenDeskUIRelativeTextRegion {
  text: string;
  region: (anchor: OpenDeskUITextTarget) => OpenDeskScreenRegion;
}
```

回调仅在参照物唯一时调用一次，必须同步返回 tagged screen region。目标 bbox 必须完整包含在最终矩形内。方向模式与矩形模式互斥。

参照物不存在时，读取方法沿用各自“无结果”合同，单次点击方法抛 `TARGET_NOT_FOUND` 且 `stage: 'anchor'`；参照物不唯一时抛 `AMBIGUOUS_TARGET` 且 `stage: 'anchor'`。`tapTexts()` 默认等待模式可继续等待缺失参照物，但不会吞掉参照物歧义。

### 图片选项

`UI.findImages()`、`UI.findImage()` 和 `UI.tapImage()` 使用 `OpenDeskUIImageOptions`：

```ts
interface OpenDeskUIImageOptions {
  within?: OpenDeskWindowInfo | OpenDeskDisplayInfo | OpenDeskScreenRegion;
  threshold?: number;
  scales?: number[];
  maxResults?: number;
  index?: number;
  timeout?: number;
  polling?: number;
  click?: OpenDeskMouseClickOptions;
}
```

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `within` | `OpenDeskWindowInfo \| OpenDeskDisplayInfo \| OpenDeskScreenRegion` | 否 | 当前活动窗口 | 限定截图和模板匹配范围。 |
| `threshold` | `number` | 否 | ImageColor 默认 | `0..1` 的有限匹配阈值。 |
| `scales` | `number[]` | 否 | ImageColor 默认 | 非空正数缩放数组。 |
| `maxResults` | `number` | 否 | `20` | 最大候选数；必须为正整数。 |
| `index` | `number` | 否 | 未设置 | 多候选时使用的零基索引。 |
| `timeout` | `number` | 否 | `10000` ms | 统一 options 合同字段；图片查找/点击当前不轮询。 |
| `polling` | `number` | 否 | `200` ms | 统一 options 合同字段；图片查找/点击当前不轮询。 |
| `click` | `OpenDeskMouseClickOptions` | 否 | 未设置 | `tapImage()` 的鼠标点击选项。 |

图片方法当前不支持 `region` / `relativeTo`，也没有 `UI.waitImage()`。

### 原生菜单选项

原生菜单方法为 **Experimental**，复用 [Accessibility](accessibility.md) 的 execution-owned runtime、元素表、deadline、取消和资源清理。可信本地 `-script` / `ai run` execution 可启用；HTTP、MCP 与 Scheduler 当前关闭。

```ts
interface OpenDeskUIMenuOptions {
  within:
    | OpenDeskWindowInfo
    | { app: OpenDeskAppTarget; root: 'menuBar' };
  timeout?: number;
  maxDepth?: number;
  maxNodes?: number;
}
```

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `within` | `OpenDeskWindowInfo \| { app: OpenDeskAppTarget; root: 'menuBar' }` | 是 | 无 | 明确菜单 owner/scope。 |
| `timeout` | `number` | 否 | `3000` ms | 单次请求总 deadline；最大 `30000` ms。 |
| `maxDepth` | `number` | 否 | `8` | 最大遍历深度；最大 `32`。 |
| `maxNodes` | `number` | 否 | `1000` | 最大节点数；最大 `5000`。 |

菜单 scope 不接受 Display、ScreenRegion、裸坐标或 Accessibility ref。App target 匹配多个实例时必须消歧；unresolved、关闭重建或前后身份不一致时安全失败。

### 原生菜单 path

```ts
type OpenDeskUIMenuPathSegment =
  | string
  | { name: string; identifier?: string }
  | { name?: string; identifier: string };

type OpenDeskUIMenuPath = [
  OpenDeskUIMenuPathSegment,
  ...OpenDeskUIMenuPathSegment[],
];
```

数组不能为空。字符串段必须非空；对象段至少包含非空 `name` 或 `identifier`。对象中多个字段按 AND 精确匹配，不翻译、不忽略大小写、不把数组解释为 aliases。

### Capture mapping 与 DPI

视觉 API 区分三种坐标：screen logical coordinate、screenshot image pixel、scope-local coordinate。每次观察都使用真实截图尺寸计算：

```text
scaleX = imageWidth / logicalScope.width
scaleY = imageHeight / logicalScope.height
```

投影规则：

```text
screenLeft   = logicalScope.x + bbox.x / scaleX
screenTop    = logicalScope.y + bbox.y / scaleY
screenRight  = logicalScope.x + (bbox.x + bbox.width) / scaleX
screenBottom = logicalScope.y + (bbox.y + bbox.height) / scaleY
```

公开 screen bounds 左/上取 `floor`，右/下取 `ceil`；center 从最终 bounds 计算并 clamp 在范围内。Runtime 不假定 Retina 固定 2×，也不把 `Display.scale` 当作本次截图的真实投影比例。

### 新鲜度与副作用

定位规则路径会在截图前和返回/输入前核对同一活动窗口；普通单次点击路径也会在输入前核对窗口并至多重新观察一次。`tapTexts()` 默认等待模式每次观察前核对绑定窗口。静态定位区域失效时直接抛 `STALE_TARGET`。这些检查不等于对任意遮挡情况或业务控件启用状态的保证。一旦鼠标或原生最终动作已经提交，Runtime 不会自动重复输入。

## UI.getCapabilities()

返回当前 execution 的文本、图片、Accessibility 菜单与坐标映射能力摘要。

**签名**

```ts
UI.getCapabilities(): OpenDeskUICapabilities;
```

**参数**

无。

**返回值**

`OpenDeskUICapabilities`。实际字段值以当前 execution、平台、后端和系统权限为准。

**行为与错误**

同步读取能力摘要，不执行截图、OCR、菜单遍历或输入。Accessibility 的完整 host/backend/权限状态见 [Accessibility.getCapabilities()](accessibility.md#accessibilitygetcapabilities)。

**示例**

```js
const capabilities = UI.getCapabilities();
console.log(capabilities.text, capabilities.image, capabilities.accessibility);
```

**Native Text Value APIs · Experimental Local**

## UI.getValue(target, options)

读取一个唯一原生文本框的字符串值。

**签名**

```ts
UI.getValue(
  target: OpenDeskAccessibilitySelector,
  options: OpenDeskUIValueOptions,
): Promise<string>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `OpenDeskAccessibilitySelector` | 是 | 无 | 与 `Accessibility.find()` 相同的 flat selector 字段和精确 AND 语义。 |
| `options` | `OpenDeskUIValueOptions` | 是 | 无 | 明确 scope、总 deadline 和有界搜索限制，见[原生文本值选项](#原生文本值选项)。 |

**返回值**

`Promise<string>`。空字符串、中文和多行字符串原样返回；看起来像数字的文本仍是字符串。

**行为与错误**

内部顺序是 `Accessibility.find → Accessibility.read(role,value) → finally release`。只读取同一 execution 创建的目标 ref，不使用 `name`、OCR 或文档正文补值。目标不是 `textField`、value 不是字符串或受保护时明确拒绝；无目标、歧义、搜索不完整、失效 ref、权限和 timeout 保留对应结构化错误。释放失败时不把已读取值写入错误或日志。

**示例**

前置：从仓库根目录运行，目标应用已打开；调用本身不会启动或聚焦它。

```js
const win = await window.get({ exeName: 'ExampleEditor', title: 'Draft' });
const value = await UI.getValue(
  { role: 'textField', identifier: 'document-title' },
  { within: win, timeout: 3000 },
);
console.log(value.length);
```

## UI.setValue(target, value, options)

最多提交一次原生动作，将一个唯一可编辑文本框设置为完整字符串，并用同一 ref 严格回读。

**签名**

```ts
UI.setValue(
  target: OpenDeskAccessibilitySelector,
  value: string,
  options: OpenDeskUIValueOptions,
): Promise<OpenDeskUISetValueResult>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `target` | `OpenDeskAccessibilitySelector` | 是 | 无 | 与 `Accessibility.find()` 相同的 flat selector 字段和精确 AND 语义。 |
| `value` | `string` | 是 | 无 | 要设置的完整文本；`''` 是有效清空值，不接受隐式数字或布尔转换。 |
| `options` | `OpenDeskUIValueOptions` | 是 | 无 | 明确 scope、总 deadline 和有界搜索限制，见[原生文本值选项](#原生文本值选项)。 |

**返回值**

`Promise<OpenDeskUISetValueResult>`：

```ts
interface OpenDeskUISetValueResult {
  requestId: string;
  operation: 'UI.setValue';
  backend: string;
  action: 'setValue';
  actionState: OpenDeskAccessibilityActionState;
  verified: true;
}
```

回执不包含旧值、新值或 selector。`actionState` 只说明原生提交状态；`verified` 来自其后的严格回读，二者不合并。`acknowledged` 本身不证明业务保存、提交或其他应用级结果。

**行为与错误**

内部顺序是 `find → 同 ref 读取 role/enabled/actions/value 前置 → perform(setValue) → 同 ref 回读 value → finally release`。目标必须是非受保护、未明确 disabled、公开 `setValue` action 的 `textField`；readonly、disabled、不支持和受保护分别明确失败。某些标准原生文本区不提供 enabled 状态，此时只以同一 Accessibility owner 返回的 `setValue` action 作为可写能力证明，facade 不另造平台判断；`Accessibility.perform()` 仍会在提交前重新验证原生状态。整个定位、前置、动作和回读只使用一个 `timeout` 预算；cleanup 由 `Accessibility.release()` 的 execution owner 独立限界，不重置或伪装业务 deadline。

原生动作至多调用一次。前置检查完成后，如果准备动作参数和剩余预算时 deadline 恰好到期，`perform` 不会被调用，错误保持 `actionState: 'not_started'`；只有进入可能执行 native action 的调用边界后，缺少可靠原生状态才使用 `unknown`。动作返回后超时、ref 失效、回读失败或值不匹配时，方法拒绝并保留已知 `actionState` 与 `verified: false`；不会再次设值，也不会切换 OCR、鼠标或键盘。`unknown` 加匹配回读也不会改写为 `acknowledged`。释放失败不覆盖已有主错误；如果动作和回读已经完成但释放失败，cleanup 错误仍携带动作状态与验证状态。Runtime teardown 继续作为遗留 ref 的最终兜底。

Recorder 的增量文本补丁不应被本方法替换：需要 UTF-16 长度/hash 前置、patch 边界、结果 hash 和专用后置验证的生成脚本，继续使用其现有同-ref `Accessibility` 组合。键盘输入、完整原生设值和增量文本补丁是三种不同动作策略。

**示例**

```js
const win = await window.get({ exeName: 'ExampleEditor', title: 'Draft' });
const receipt = await UI.setValue(
  { role: 'textField', identifier: 'document-title' },
  '',
  { within: win, timeout: 3000 },
);
console.log(receipt.actionState, receipt.verified);
```

若要在仓库自有非敏感 fixture 上直观看到原值、只读值、动作状态、严格回读和独立提交次数，可从仓库根目录运行[UI 原生文本值可读示例](../../examples/accessibility/value-roundtrip.js)：

```bash
./dist/opendesk -script examples/accessibility/value-roundtrip.js -console-mode script -log-dir .runtime/tests/accessibility/public-value-roundtrip
```

**Text APIs**

## UI.findTexts(text, options?)

返回当前观察中全部匹配文本。

**签名**

```ts
UI.findTexts(text: string, options?: OpenDeskUITextLocateOptions): Promise<OpenDeskUITextTarget[]>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `text` | `string` | 是 | 无 | 非空目标文本。 |
| `options` | `OpenDeskUITextLocateOptions` | 否 | `{}` | 文本和定位选项，见 [文本选项](#文本选项)。 |

**返回值**

`Promise<OpenDeskUITextTarget[]>`。返回按 screen reading order 排序的全部候选；没有候选时返回 `[]`。

**行为与错误**

使用新的截图和 OCR，不默认选择某个候选。使用 `relativeTo` 时，参照物不存在返回空数组，参照物不唯一抛 `AMBIGUOUS_TARGET`。观察错误不会被当作无结果。

**示例**

```js
const targets = await UI.findTexts('保存', { within: win });
console.log(targets.length);
```

## UI.findTextMatches(queries, options?)

对同一次截图和 OCR 观察批量计算 `1..32` 个字符串或 `RegExp` 查询；本方法只读，不发送输入。

**签名**

```ts
UI.findTextMatches(
  queries: Array<string | RegExp>,
  options?: OpenDeskUITextMatchOptions,
): Promise<OpenDeskUITextMatchGroup[]>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `queries` | `Array<string \| RegExp>` | 是 | 无 | `1..32` 个非空查询；正则拒绝有状态的 `g` / `y` flag。 |
| `options` | `OpenDeskUITextMatchOptions` | 否 | `{}` | 支持 `within`、OCR 选项和 `region`；不接受点击、索引、轮询或 `relativeTo`。 |

**返回值**

`Promise<OpenDeskUITextMatchGroup[]>`。结果与输入顺序一一对应；每项包含 `queryIndex` 和按 reading order 排列的 `matches`，无匹配时该数组为空。同一 OCR 文本可以进入多个查询组。

**行为与错误**

所有查询共享一次观察，观察失败整体拒绝，不返回部分结果。省略 `within` 时会在返回前复核同一活动窗口；窗口身份或边界变化抛 `STALE_TARGET`。字符串查询支持 `exact`、`contains`、`startsWith`、`endsWith`；为正则查询传入字符串专用匹配选项会抛 `INVALID_ARGUMENT`。

**示例**

```js
const groups = await UI.findTextMatches([
  '订单号：12345678',
  /^订单号：\d{8,20}$/u,
  /已完成$/u,
], { within: win });
console.log(groups.map(group => group.matches.length));
```

## UI.findText(text, options?)

返回当前观察中的唯一文本候选。

**签名**

```ts
UI.findText(text: string, options?: OpenDeskUITextLocateOptions): Promise<OpenDeskUITextTarget | null>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `text` | `string` | 是 | 无 | 目标文本。 |
| `options` | `OpenDeskUITextLocateOptions` | 否 | `{}` | 文本选项，见 [文本选项](#文本选项)。 |

**返回值**

`Promise<OpenDeskUITextTarget | null>`。完整观察中没有候选时返回 `null`。

**行为与错误**

唯一候选直接返回；多个候选且未设置 `index` 时抛 `AMBIGUOUS_TARGET`；`index` 越界抛 `TARGET_NOT_FOUND`。不会默认选择第一项、最近项或最高置信度项。

**示例**

```js
const target = await UI.findText('保存', { within: win });
if (target) console.log(target.center);
```

## UI.hasText(text, options?)

判断当前观察中是否存在匹配文本。

**签名**

```ts
UI.hasText(text: string, options?: OpenDeskUITextLocateOptions): Promise<boolean>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `text` | `string` | 是 | 无 | 目标文本。 |
| `options` | `OpenDeskUITextLocateOptions` | 否 | `{}` | 文本选项，见 [文本选项](#文本选项)。 |

**返回值**

`Promise<boolean>`。至少一个候选返回 `true`，否则返回 `false`。

**行为与错误**

使用 `relativeTo` 时参照物不存在返回 `false`；参照物不唯一仍抛 `AMBIGUOUS_TARGET`。其他观察错误不会被吞掉为 `false`。

**示例**

```js
if (await UI.hasText('完成', { within: win })) {
  console.log('visible');
}
```

## UI.tapText(text, options?)

查找唯一文本并最多提交一次鼠标点击。

**签名**

```ts
UI.tapText(text: string, options?: OpenDeskUITextLocateOptions): Promise<OpenDeskUITapResult<OpenDeskUITextTarget>>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `text` | `string` | 是 | 无 | 要点击的目标文本。 |
| `options` | `OpenDeskUITextLocateOptions` | 否 | `{}` | 文本选项；`options.click` 转发给 `mouse.clickPoint()`。 |

**返回值**

`Promise<OpenDeskUITapResult<OpenDeskUITextTarget>>`，包含已定位 target 和实际点击点。

**行为与错误**

找不到目标或索引越界抛 `TARGET_NOT_FOUND`；多候选未消歧抛 `AMBIGUOUS_TARGET`。本方法不自动等待未来出现的文本。输入已提交后，即使后续结果不确定也不会自动重复点击。

**示例**

```js
await UI.tapText('确定', { within: win, match: 'exact' });
```

## UI.tapTexts(texts, options?)

按顺序等待目标出现、重新观察并激活多个文本目标。普通 exact 文本激活由 Runtime 自动选择安全的定位协作策略；调用者不传 `strategy`、fallback 顺序或 backend 配置。第一个参数 `texts` 是必填的主要动作序列；`options.within` 只是已解析 `OpenDeskWindowInfo` 的可选 scope，同一窗口内的一般流程可以省略整个第二个参数。

**签名**

```ts
UI.tapTexts(texts: string[], options?: OpenDeskUITapTextsOptions): Promise<OpenDeskUITapTextsResult>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `texts` | `string[]` | 是 | 无 | 非空字符串动作序列，调用开始时复制；不是 aliases，不会按空格拆分或展开数字。 |
| `options` | `OpenDeskUITapTextsOptions` | 否 | `{}` | 继承文本定位选项并提供下面的序列控制。 |
| `options.within` | `OpenDeskWindowInfo` | 否 | 首次观察的活动窗口 | 默认等待模式绑定此窗口；不启动或聚焦应用，不自动换窗。 |
| `options.intervalMs` | `number` | 否 | `300` | 毫秒，有限数 `0..86400000`。上一步输入返回后、下一步观察前额外等待。首步前和末步后不额外等待；显式 `0` 关闭间隔。 |
| `options.waitForEach` | `boolean` | 否 | `true` | Experimental。等待每步目标出现；只重试成功的空观察，不重试输入。显式 `false` 使用原来的立即查找/失败行为，也允许 Display/ScreenRegion scope。 |
| `options.timeout` | `number` | 否 | `10000` | 默认等待模式的每步毫秒预算，有限数 `0 < timeout <= 300000`。每步间隔结束后开始，包含观察和输入前核对；不是整个批次预算。 |
| `options.polling` | `number` | 否 | `200` | 默认等待模式的毫秒观察间隔，有限数 `0 < polling <= 10000`；最后一次间隔不超过剩余预算。 |
| `options.signal` | `AbortSignal \| null` | 否 | 未设置 | Experimental。取消间隔/轮询，并阻止后续阶段或输入；`null` 表示没有单次取消信号。 |

**返回值**

`Promise<OpenDeskUITapTextsResult>`，不是数组：

```ts
interface OpenDeskUITapTextsResult {
  ok: true;
  action: 'tapTexts';
  completed: Array<OpenDeskUISequenceCompletion>;
}
```

**行为与错误**

实际顺序为“观察/等待第一个目标 → 输入返回 → 额外间隔 → 观察/等待下一个目标 → 输入返回”。截图、OCR 和输入调用自身耗时不包含在固定间隔值里；这不是固定点击频率。总时长受步骤数和外层 Execution 期限约束。

默认等待模式固定首次解析窗口的 id、PID、标题和可用 handle；后续只接受同一活动窗口的新 bounds。关闭、换窗或身份变化时抛 `STALE_TARGET`，不按应用名重新选择另一个窗口。静态 region 仍是快照，失效后不会自动迁移。

OCR 唯一匹配直接点击。普通 exact、无定位区域／锚点、无 index、无自定义 click、waitForEach 为 true 的步骤，OCR 零候选或多候选时，Runtime 可在已经授权的同一窗口里请求完整、有界 Accessibility snapshot。只有一个名称匹配且支持 invoke 的控件才继续：用该观察的实际 role/name/identifier 重新 find、read、核对 enabled 与 invoke，然后至多提交一次并释放引用。不猜测 `×` 的本地化名称，不复用上一动作的 ref，不要求未来步骤提前存在。

原生能力未授权／未实现时不请求权限，保留视觉失败或等待语义。原生歧义、不完整搜索、禁用、状态漂移立即停止。只有成功观察且无候选时才继续轮询；明确索引越界、截图/OCR backend 错误、窗口身份错误立即停止，不把基础设施错误当成可重试的漏字。`relativeTo` 的参照物缺失可继续等，参照物歧义必须停止。目标文字可见并不证明控件 enabled 或业务界面已经完全就绪。保存/发送/提交等业务后置条件由调用方另行验证，失败或结果不确定不得自动重做输入。

取消在延时和各观察阶段之间检查，输入前再次检查。同步 native 调用无法被 JS timer 或 signal 强制撤回；已经调用的输入不会自动撤销或重试。输入成功返回后才观察到取消时，该项仍保留在完成前缀。

任一步失败立即拒绝，错误包含 `code`、`operation: 'UI.tapTexts'`、零基 `failedIndex`、`failedText`、`failedPhase`（`interval`、`locate`、`input`）、`completed` 和原始 `cause`。`completed` 保留视觉点击或原生激活；原生项包含 `target.source: "accessibility"`、实际 locator、backend 和 actionState。错误增加 `actionState` 及可用的 `resolution` 摘要；确认成功后发生取消、超时或清理错误仍保留该输入。`completed` 只记录成功返回的输入，不证明失败项没有产生副作用；不要仅按 `failedIndex` 自动恢复执行。调用前参数错误在任何输入前拒绝，不保证附带步骤字段。未知 option、symbol 字段、稀疏文本数组和非法时序值提前拒绝。

默认间隔由旧版 `0` 改为 `300`，目标等待默认开启。需要旧版 fail-fast / Display / ScreenRegion 行为时显式设置 `{ waitForEach: false, intervalMs: 0 }`。其他 UI 方法的等待规则不随本方法变化。

**示例**

前置：目标应用已在前台，“下一步”和“确认”属于同一窗口内的流程；本调用不会自行打开应用。

```js
const result = await UI.tapTexts(['下一步', '确认']);
console.log('已完成输入步骤：', result.completed.length);
```

固定由 `window.get()` / `window.wait()` 返回的已确认窗口，只覆盖需要的文本选项：

```js
const win = await window.wait({ app: { bundleId: "com.apple.calculator" } });
await UI.tapTexts(["2", "5", "×", "4", "="], { within: win, match: "exact" });
```

无需等待的显式旧时序：

```js
await UI.tapTexts(['开始', '确认'], {
  within: win,
  match: 'exact',
  intervalMs: 50,
  waitForEach: false,
});
```

取消和错误前缀：

```js
const controller = new AbortController();
const cancelTimer = setTimeout(() => controller.abort(), 15000);
try {
  await UI.tapTexts(['下一步', '确认'], {
    within: win,
    timeout: 5000,
    signal: controller.signal,
  });
} catch (error) {
  console.error(error.code, error.failedIndex, error.failedPhase);
  console.log('已返回的输入数：', (error.completed || []).length);
  throw error;
} finally {
  clearTimeout(cancelTimer);
}
```

## UI.tapTargets(targets, options?)

逐步骤表达待激活目标，不是可配置的 Locator Framework。文字足以描述整段操作时直接使用 `UI.tapTexts`；只有部分步骤需要语义约束时使用本方法。

**签名**

```ts
UI.tapTargets(targets: OpenDeskUISemanticTapTarget[],
  options?: OpenDeskUISemanticTapOptions): Promise<OpenDeskUISemanticTapResult>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `targets` | 字符串／扁平 selector 数组 | 是 | 无 | 1..256 项；selector 仅 role/name/identifier，至少一项，多个字段 exact AND，不得任意放宽 |
| `options.within` | `OpenDeskWindowInfo` | 否 | 当前活动窗口 | 首步前固定，后续重新核对相同 id、PID、title、native handle；生成器显式传入录制目标的新鲜 WindowInfo |
| `options.timeout` | `number` | 否 | `10000` | 每步预算，整数毫秒 1..30000；额外间隔结束后开始 |
| `options.polling` | `number` | 否 | `200` | 成功零候选观察的轮询间隔，整数毫秒 1..10000 |
| `options.intervalMs` | `number` | 否 | `300` | 相邻步骤额外等待，整数毫秒 0..86400000 |
| `options.signal` | `AbortSignal \| null` | 否 | 未设置 | 在阶段之间取消；不能撤回已经提交的输入 |

不接受 OCR/accessibility 嵌套对象、fallback/fallbackOrder、confidence、fuzzy 或 regex 字段。需要模糊文字或正则的观察仍使用已存在的文本匹配 API；不得猜出唯一输入目标。字符串沿用 `tapTexts` 的 exact 文本语义；扁平 selector 的原生约束不能降级为 OCR 字符串而丢失 role/identifier。

**返回值**

返回 `{ok: true, action: "tapTargets", completed}`。每一项是实际视觉点击结果或原生激活结果，与 `UI.tapTexts` 的完成项相同；原生结果的 `actionState: "acknowledged" | "not_needed"` 不是业务成功。最终读值／保存／发送结果必须独立验证。

**行为与错误**

输入数组、全部 target、options 和窗口身份在首次输入前复制校验。未知字段、稀疏数组、非法 selector 提前拒绝。每一步重新观察当前活动窗口并保留相同 id/PID/title/handle；允许同一窗口移动，不能自动切换或重建目标窗口。

字符串委托 `tapTexts`，扁平原生 target 复用现有 Accessibility find/read/perform/release。动态流程按步骤解析；不要求后续步骤在第一步之前存在。每次动作都获取新 ref，动作前核对真实语义、enabled、invoke 能力；不跨步骤缓存 ref。无需 Agent／Generator 编写另一套 fallback。

任一步失败停止并保留 `failedIndex`、`failedPhase`、`actionState`、`completed`、`cause`；错误码沿用 Accessibility／UI，取消为 `CANCELED`，窗口漂移为 `STALE_TARGET`。动作可能已经发生的 unknown 永不重试或切换 backend。原生引用在成功、失败、取消路径均释放；清理失败不能抹掉已确认动作。

**示例**

```js
await UI.tapTexts(["2", "5", "×", "4", "="], {within: win});
await UI.tapTargets([
  "打开",
  {role: "button", name: "保存", identifier: "document-save"}
], {within: win});
```

上面的 identifier 必须来自该应用真实证据，不是给所有控件编造 ID。录制证据和定位维修信息保存在 actions/candidate，不机械展开进调用参数。

**旧形式兼容**

已有 `UI.tapTargets([{locator: {role: "button", name: "保存"}}], options)` 仍保留原来的 Accessibility-only 协议：预检全部 distinct locator、复用固定 refs、冻结 bounds，支持原有 maxDepth/maxNodes 和显式 refocus。返回原有 `backend: "accessibility"` 与带 index 的原生完成项。旧形式与新形式不能混用；新生成器不再生成此包装。旧选项见[原生 target 序列选项](#原生-target-序列选项)，不能把旧预检／固定坐标语义误套到新动态序列。

**轻量 target 写法与单一 Runtime owner**

`UI.tapTargets` 也接受 `{ text: "保存" }`；它与字符串 `"保存"` 含义相同。`{ text: "确认", role: "button" }` 等价于 `{ name: "确认", role: "button" }`；显式 `name` 优先作为 native identity。`within` 省略时，在首步前固定当前活动窗口，后续仍逐步重新验证。`polyfills/011-ui-targets.js` 只转换这些输入写法，定位、取消、已完成前缀与清理全部由核心 UI owner 负责。

## UI.waitText(text, options?)

轮询等待唯一文本出现。

**签名**

```ts
UI.waitText(text: string, options?: OpenDeskUITextOptions): Promise<OpenDeskUITextTarget>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `text` | `string` | 是 | 无 | 等待出现的文本。 |
| `options` | `OpenDeskUITextOptions` | 否 | `{}` | 文本选项；使用 `timeout` 与 `polling`，不支持 `region` / `relativeTo`。 |

**返回值**

`Promise<OpenDeskUITextTarget>`，找到唯一候选时返回。

**行为与错误**

每轮重新截图和 OCR。超时抛 `TIMEOUT`；多个候选仍按唯一性规则处理。传入 `region` 或 `relativeTo` 抛 `INVALID_ARGUMENT`。本方法未扩展为 `tapTexts()` 的序列等待或单次 signal 合同。

**示例**

```js
const target = await UI.waitText('完成', { within: win, timeout: 5000, polling: 200 });
```

## UI.waitTextGone(text, options?)

轮询等待匹配文本消失。

**签名**

```ts
UI.waitTextGone(text: string, options?: OpenDeskUITextOptions): Promise<true>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `text` | `string` | 是 | 无 | 等待消失的文本。 |
| `options` | `OpenDeskUITextOptions` | 否 | `{}` | 文本选项；使用 `timeout` 与 `polling`，不支持 `region` / `relativeTo`。 |

**返回值**

`Promise<true>`。目标不再存在时 resolve `true`。

**行为与错误**

每轮重新截图和 OCR。超时抛 `TIMEOUT`。传入 `region` 或 `relativeTo` 抛 `INVALID_ARGUMENT`。本方法没有新增序列等待或 signal 合同。

**示例**

```js
await UI.waitTextGone('加载中', { within: win, timeout: 10000 });
```

**Image APIs**

## UI.findImages(template, options?)

返回当前观察中的全部图片模板候选。

**签名**

```ts
UI.findImages(template: string | string[], options?: OpenDeskUIImageOptions): Promise<OpenDeskUIImageTarget[]>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `template` | `string \| string[]` | 是 | 无 | 单个模板，或同一控件的非空状态模板数组。 |
| `options` | `OpenDeskUIImageOptions` | 否 | `{}` | 图片选项，见 [图片选项](#图片选项)。 |

**返回值**

`Promise<OpenDeskUIImageTarget[]>`。候选按 screen reading order 排序；没有结果返回 `[]`。

**行为与错误**

每次调用使用新的截图并复用 `ImageColor.findImages()`。模板数组表示同一控件的多个状态，不表示“多个不同按钮任选一个”。参数、截图或模板匹配失败以结构化错误拒绝。

**示例**

```js
const targets = await UI.findImages('./assets/save.png', { within: win, threshold: 0.9 });
```

## UI.findImage(template, options?)

返回唯一图片模板候选。

**签名**

```ts
UI.findImage(template: string | string[], options?: OpenDeskUIImageOptions): Promise<OpenDeskUIImageTarget | null>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `template` | `string \| string[]` | 是 | 无 | 单个模板或同一控件的状态模板数组。 |
| `options` | `OpenDeskUIImageOptions` | 否 | `{}` | 图片选项，见 [图片选项](#图片选项)。 |

**返回值**

`Promise<OpenDeskUIImageTarget | null>`。没有候选返回 `null`。

**行为与错误**

唯一候选直接返回；多个候选且未设置 `index` 时抛 `AMBIGUOUS_TARGET`；`index` 越界抛 `TARGET_NOT_FOUND`。

**示例**

```js
const target = await UI.findImage('./assets/save.png', { within: win });
```

## UI.tapImage(template, options?)

查找唯一图片并最多提交一次鼠标点击。

**签名**

```ts
UI.tapImage(template: string | string[], options?: OpenDeskUIImageOptions): Promise<OpenDeskUITapResult<OpenDeskUIImageTarget>>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `template` | `string \| string[]` | 是 | 无 | 要点击的模板或同一控件状态模板数组。 |
| `options` | `OpenDeskUIImageOptions` | 否 | `{}` | 图片选项；`options.click` 转发给 `mouse.clickPoint()`。 |

**返回值**

`Promise<OpenDeskUITapResult<OpenDeskUIImageTarget>>`。

**行为与错误**

当前不会因 `timeout` / `polling` 隐式等待或重复匹配。找不到目标抛 `TARGET_NOT_FOUND`；多候选未消歧抛 `AMBIGUOUS_TARGET`。输入前 scope 变化时最多重新观察一次；鼠标输入已经调用后不会自动重试。

**示例**

```js
await UI.tapImage('./assets/save.png', { within: win, threshold: 0.9 });
```

**Native Menu APIs · Experimental**

## UI.getMenuItems(options)

只读观察当前已经物化的原生菜单数据。

**签名**

```ts
UI.getMenuItems(options: OpenDeskUIMenuOptions): Promise<OpenDeskUIGetMenuItemsResult>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `options` | `OpenDeskUIMenuOptions` | 是 | 无 | 菜单 scope 和遍历限制，见 [原生菜单选项](#原生菜单选项)。 |

**返回值**

`Promise<OpenDeskUIGetMenuItemsResult>`，包含 `requestId`、`operation`、`backend`、`items`、`complete`、`truncated`、`reason` 与 `stats`。

**行为与错误**

只观察已经物化的菜单；不展开菜单、不激活应用、不抢焦点。未物化、不可读或超过限制的子树必须通过 `complete` / `truncated` / `reason` 表达，不能伪装成空且完整。禁用能力时抛 `CAPABILITY_DISABLED`。

**示例**

```js
const observed = await UI.getMenuItems({ within: win, maxDepth: 3 });
console.log(observed.complete, observed.items);
```

## UI.findMenuItem(path, options)

在完整只读观察中查找唯一原生菜单路径。

**签名**

```ts
UI.findMenuItem(path: OpenDeskUIMenuPath, options: OpenDeskUIMenuOptions): Promise<OpenDeskUIMenuItem | null>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `path` | `OpenDeskUIMenuPath` | 是 | 无 | 非空完整菜单层级路径，见 [原生菜单 path](#原生菜单-path)。 |
| `options` | `OpenDeskUIMenuOptions` | 是 | 无 | 菜单 scope 和遍历限制。 |

**返回值**

`Promise<OpenDeskUIMenuItem | null>`。完整观察中没有候选返回 `null`。

**行为与错误**

不展开菜单、不激活应用、不抢焦点。多个候选抛 `AMBIGUOUS_TARGET`；尚未物化的子菜单或遍历限制导致无法证明 0/1 时抛 `SEARCH_INCOMPLETE`，不会伪装成 `null`。

**示例**

```js
const item = await UI.findMenuItem(['File', 'Export', 'PDF'], {
  within: { app: { bundleId: 'com.example.app' }, root: 'menuBar' },
});
```

## UI.tapMenuItem(path, options)

逐层重新观察菜单并对最终唯一目标最多提交一次原生动作。

**签名**

```ts
UI.tapMenuItem(path: OpenDeskUIMenuPath, options: OpenDeskUITapMenuItemOptions): Promise<OpenDeskUITapMenuItemResult>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `path` | `OpenDeskUIMenuPath` | 是 | 无 | 非空完整菜单层级路径。 |
| `options` | `OpenDeskUITapMenuItemOptions` | 是 | 无 | 菜单 scope、遍历限制和最终动作。 |
| `options.finalAction` | `{action:'invoke'} \| {action:'select'} \| {action:'setChecked', checked:boolean}` | 否 | `{ action: 'invoke' }` | 最终目标动作。 |

**返回值**

`Promise<OpenDeskUITapMenuItemResult>`，包含最终 `action`、`actionState`、`completedLevels` 和 `expansionOccurred` 等字段。

**行为与错误**

每展开一层后都重新观察，不缓存旧坐标或旧 ref；整个路径共享一个从入队开始计算的 deadline。最终动作最多提交一次，不在失败或超时后自动重做。`setChecked` 已满足目标状态时返回 `not_needed`。失败可能附带 `failedLevel`、`completedLevels`、`expansionOccurred`；已经发生的菜单展开属于可见副作用，取消不会撤回已提交的原生动作。

**示例**

```js
const result = await UI.tapMenuItem(['File', 'Export', 'PDF'], {
  within: { app: { bundleId: 'com.example.app' }, root: 'menuBar' },
  timeout: 3000,
});
console.log(result.actionState);
```

## 错误

视觉 API 常见错误：

```text
INVALID_ARGUMENT
TARGET_NOT_FOUND
AMBIGUOUS_TARGET
STALE_TARGET
TARGET_SCOPE_NOT_VISIBLE
SCREENSHOT_FAILED
OCR_FAILED
IMAGE_MATCH_FAILED
UNSUPPORTED_MIXED_DPI_SCOPE
UNSUPPORTED_COORDINATE_MAPPING
TIMEOUT
CANCELED
BACKEND_FAILED
```

`tapTexts()` 与 `tapTargets()` 的序列错误还包含步骤和完成前缀。原生 target 序列、文本值与菜单可能出现 [Accessibility](accessibility.md) 的结构化错误，包括 `CAPABILITY_DISABLED`、`NOT_SUPPORTED`、`PERMISSION_DENIED`、`SEARCH_INCOMPLETE`、`ELEMENT_DISABLED`、`ACTION_NOT_SUPPORTED`、`STATE_UNKNOWN`、`QUEUE_FULL` 与 `RESOURCE_LIMIT`。值方法使用 `OpenDeskUIValueError` 的高层 `phase`，底层 phase 另存为 `nativePhase`；`UI.setValue()` 在动作可能已经提交后保留 `actionState` 和 `verified`，cleanup 失败可另带不含字段内容的 `cleanupError`。错误、cause、cleanupError、日志和回执都不附带旧值、新值或受保护内容。不要通过解析 `error.message` 判断错误类型。

## 平台与能力

文本和图片能力依赖当前截图、Vision、ImageColor 与输入后端。原生 target 序列与菜单能力为 Experimental，并要求当前 execution 显式启用 Accessibility；HTTP、MCP 与 Scheduler 当前不提供这些操作。

当前明确不提供：

- `UI.inputValue()`、`UI.fill()`、`UI.type()` 或其他 `UI.setValue()` 同义写入别名；
- `UI.invoke()`；
- semantic `UI.tapTargets()` 的坐标或鼠标 fallback；text-only targets 仅能在确定 OCR 尚未输入时内部转为 exact Accessibility lookup，legacy locator overload 不提供 visual fallback；
- 原生 value 的 OCR/name fallback、非字符串转换或 checkbox/range/selection/document 泛化；
- `UI.getValue()` / `UI.setValue()` 的 `signal`，以及包含父／祖先 selector 的第二套 locator schema；
- `UI.waitImage()`；
- 图片 `region` / `relativeTo`；
- `waitText()` / `waitTextGone()` 的 `region` / `relativeTo`；
- visual → Accessibility 或 menu → OCR/mouse 的自动降级；
- 菜单 aliases、翻译或自动 repair；
- mixed-DPI split capture。

相关底层接口：[Geometry](geometry.md)、[Vision](vision.md)、[ImageColor](image-color.md)、[Accessibility](accessibility.md)、[mouse](mouse.md)。
