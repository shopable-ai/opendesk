---
title: Desktop UI API
description: 使用 OCR、模板匹配、屏幕坐标与原生 Accessibility 查找和操作外部桌面应用 UI。
order: 11
---

# UI

`UI` 是 OpenDesk 操作**外部桌面应用界面**的高层 API。文本和图片方法基于截图、OCR 或模板匹配；菜单方法复用第一方 [Accessibility](accessibility.md) 原生语义能力。

`UI` 与小写 [ui](custom-ui.md) 不同：`UI` 操作外部应用，`ui` 创建 OpenDesk 自己的 Custom UI。二者没有别名。

## API 一览

| 方法 | 状态 | 用途 |
| --- | --- | --- |
| `UI.getCapabilities()` | Stable | 查询当前高层 UI 能力。 |
| `UI.getValue(target, options)` | Experimental · Local | 读取唯一原生文本框的字符串值。 |
| `UI.setValue(target, value, options)` | Experimental · Local | 设置唯一原生文本框的完整字符串值并用同一引用回读。 |
| `UI.findTexts(text, options?)` | Stable | 返回全部匹配文本。 |
| `UI.findText(text, options?)` | Stable | 返回唯一匹配文本。 |
| `UI.hasText(text, options?)` | Stable | 判断是否存在匹配文本。 |
| `UI.tapText(text, options?)` | Stable | 查找并点击唯一文本。 |
| `UI.tapTexts(texts, options?)` | Stable；序列等待为 Experimental | 按顺序等待、重新定位并点击多个文本，默认步间隔 300 ms。 |
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

首版只接受原生 role 为 `textField` 且 `value` 实际为字符串的目标。checkbox、range、selection、name、文档正文和 OCR 文本不属于本合同；数字、布尔值、对象与 `null` 不做隐式字符串转换。`UI.setValue()` 的空字符串是合法完整值，可用于清空非受保护、enabled、明确支持 `setValue` 的可编辑文本框。

每次调用都执行完整有界唯一查找。目标不存在、多个目标或搜索不完整分别保留 `TARGET_NOT_FOUND`、`AMBIGUOUS_TARGET` 与 `SEARCH_INCOMPLETE`。当前 flat selector 不能在一次调用中表达父容器／祖先 selector；若 Recorder 或手写 locator 的唯一性依赖该约束，调用方必须先用 `Accessibility.find()` 取得并管理容器 ref，再作为 `within` 使用，或停止并保留该依赖，不能静默丢弃结构约束。

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

内部顺序是 `find → 同 ref 读取 role/enabled/actions/value 前置 → perform(setValue) → 同 ref 回读 value → finally release`。目标必须是非受保护、enabled、公开 `setValue` action 的 `textField`；readonly、disabled、不支持和受保护分别明确失败。整个定位、前置、动作和回读只使用一个 `timeout` 预算。

原生动作至多调用一次。动作返回后超时、ref 失效、回读失败或值不匹配时，方法拒绝并保留已知 `actionState` 与 `verified: false`；不会再次设值，也不会切换 OCR、鼠标或键盘。释放失败不覆盖已有主错误；如果动作和回读已经完成但释放失败，cleanup 错误仍携带动作状态与验证状态。Runtime teardown 继续作为遗留 ref 的最终兜底。

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

按顺序等待目标出现、重新观察并点击多个文本；同一窗口内的一般流程可以省略第二个参数。

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
  completed: Array<OpenDeskUITapResult<OpenDeskUITextTarget>>;
}
```

**行为与错误**

实际顺序为“观察/等待第一个目标 → 输入返回 → 额外间隔 → 观察/等待下一个目标 → 输入返回”。截图、OCR 和输入调用自身耗时不包含在固定间隔值里；这不是固定点击频率。总时长受步骤数和外层 Execution 期限约束。

默认等待模式固定首次解析窗口的 id、PID、标题和可用 handle；后续只接受同一活动窗口的新 bounds。关闭、换窗或身份变化时抛 `STALE_TARGET`，不按应用名重新选择另一个窗口。静态 region 仍是快照，失效后不会自动迁移。

只有成功观察且无候选时才继续轮询；明确的索引越界、目标歧义、截图/OCR、窗口身份等错误立即停止。`relativeTo` 的参照物缺失可继续等，参照物歧义必须停止。目标文字可见并不证明控件 enabled 或业务界面已经完全就绪。保存/发送/提交等业务后置条件由调用方另行验证，失败或结果不确定不得自动重做输入。

取消在延时和各观察阶段之间检查，输入前再次检查。同步 native 调用无法被 JS timer 或 signal 强制撤回；已经调用的输入不会自动撤销或重试。输入成功返回后才观察到取消时，该项仍保留在完成前缀。

任一步失败立即拒绝，错误包含 `code`、`operation: 'UI.tapTexts'`、零基 `failedIndex`、`failedText`、`failedPhase`（`interval`、`locate`、`input`）、`completed` 和原始 `cause`。`completed` 只记录成功返回的输入，不证明失败项没有产生副作用；不要仅按 `failedIndex` 自动恢复执行。调用前参数错误在任何输入前拒绝，不保证附带步骤字段。未知 option、symbol 字段、稀疏文本数组和非法时序值提前拒绝。

默认间隔由旧版 `0` 改为 `300`，目标等待默认开启。需要旧版 fail-fast / Display / ScreenRegion 行为时显式设置 `{ waitForEach: false, intervalMs: 0 }`。其他 UI 方法的等待规则不随本方法变化。

**示例**

前置：目标应用已在前台，“下一步”和“确认”属于同一窗口内的流程；本调用不会自行打开应用。

```js
const result = await UI.tapTexts(['下一步', '确认']);
console.log('已完成输入步骤：', result.completed.length);
```

固定已确认窗口，只覆盖需要的选项：

```js
const win = await window.getActiveWindow();
await UI.tapTexts(['下一步', '确认'], { within: win, intervalMs: 500 });
```

计算器等确定快速界面的显式旧行为：

```js
await UI.tapTexts(['1', '6', '×', '3', '='], {
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

需要进入另一个窗口时拆成独立调用，明确选择和验证新窗口；不要通过默认序列等待自动跨窗口提交。

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

`tapTexts()` 的序列错误还包含步骤和完成前缀。原生文本值与菜单可能出现 [Accessibility](accessibility.md) 的结构化错误，包括 `CAPABILITY_DISABLED`、`NOT_SUPPORTED`、`PERMISSION_DENIED`、`SEARCH_INCOMPLETE`、`ELEMENT_DISABLED`、`ACTION_NOT_SUPPORTED`、`STATE_UNKNOWN`、`QUEUE_FULL` 与 `RESOURCE_LIMIT`。`UI.setValue()` 在动作可能已经提交后保留 `actionState` 和 `verified`，cleanup 失败可另带不含字段内容的 `cleanupError`。不要通过解析 `error.message` 判断错误类型。

## 平台与能力

文本和图片能力依赖当前截图、Vision、ImageColor 与输入后端。菜单能力为 Experimental，并要求当前 execution 显式启用 Accessibility；HTTP、MCP 与 Scheduler 当前不提供菜单操作。

当前明确不提供：

- `UI.inputValue()`、`UI.fill()`、`UI.type()` 或其他 `UI.setValue()` 同义写入别名；
- `UI.invoke()`；
- 原生 value 的 OCR/name fallback、非字符串转换或 checkbox/range/selection/document 泛化；
- `UI.getValue()` / `UI.setValue()` 的 `signal`，以及包含父／祖先 selector 的第二套 locator schema；
- `UI.waitImage()`；
- 图片 `region` / `relativeTo`；
- `waitText()` / `waitTextGone()` 的 `region` / `relativeTo`；
- visual → Accessibility 或 menu → OCR/mouse 的自动降级；
- 菜单 aliases、翻译或自动 repair；
- mixed-DPI split capture。

相关底层接口：[Geometry](geometry.md)、[Vision](vision.md)、[ImageColor](image-color.md)、[Accessibility](accessibility.md)、[mouse](mouse.md)。
