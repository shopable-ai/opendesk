---
title: Desktop UI API
description: 使用 OCR、模板匹配、屏幕坐标与原生 Accessibility 查找和操作外部桌面应用 UI。
order: 11
---

# UI

`UI` 是 OpenDesk 操作**外部桌面应用界面**的高层 API。文本和图片方法基于截图、OCR 或模板匹配；菜单方法复用第一方 [`Accessibility`](accessibility.md) 原生语义能力。

`UI` 与小写 [`ui`](custom-ui.md) 不同：`UI` 操作外部应用，`ui` 创建 OpenDesk 自己的 Custom UI。二者没有别名。

## API 一览

| 方法 | 状态 | 用途 |
| --- | --- | --- |
| `UI.getCapabilities()` | Stable | 查询当前高层 UI 能力。 |
| `UI.findTexts(text, options?)` | Stable | 返回全部匹配文本。 |
| `UI.findText(text, options?)` | Stable | 返回唯一匹配文本。 |
| `UI.hasText(text, options?)` | Stable | 判断是否存在匹配文本。 |
| `UI.tapText(text, options?)` | Stable | 查找并点击唯一文本。 |
| `UI.tapTexts(texts, options?)` | Stable | 按顺序重新定位并点击多个文本。 |
| `UI.waitText(text, options?)` | Stable | 等待唯一文本出现。 |
| `UI.waitTextGone(text, options?)` | Stable | 等待文本消失。 |
| `UI.findImages(template, options?)` | Stable | 返回全部模板匹配。 |
| `UI.findImage(template, options?)` | Stable | 返回唯一模板匹配。 |
| `UI.tapImage(template, options?)` | Stable | 查找并点击唯一图片。 |
| `UI.getMenuItems(options)` | Experimental | 只读观察当前已物化的原生菜单。 |
| `UI.findMenuItem(path, options)` | Experimental | 只读查找完整原生菜单路径。 |
| `UI.tapMenuItem(path, options)` | Experimental | 逐层展开并执行完整原生菜单路径。 |

视觉或原生动作成功只表示目标已读取或输入已提交，不证明保存、提交、导出等业务结果已经完成。自动化脚本仍应验证业务后置条件。

## 公共约定

### 文本选项

`UI.findTexts()`、`UI.findText()`、`UI.hasText()`、`UI.tapText()`、`UI.tapTexts()`、`UI.waitText()` 与 `UI.waitTextGone()` 使用 `OpenDeskUITextOptions`：

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
  region?: OpenDeskScreenRegion | ((currentWin: OpenDeskWindowInfo) => OpenDeskScreenRegion);
  relativeTo?: OpenDeskUIRelativeTextRule;
}
```

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `within` | `OpenDeskWindowInfo \| OpenDeskDisplayInfo \| OpenDeskScreenRegion` | 否 | 当前活动窗口 | 限定本次截图和识别范围。 |
| `match` | `'exact' \| 'contains'` | 否 | `'exact'` | 文本匹配方式。 |
| `caseSensitive` | `boolean` | 否 | `false` | 是否区分大小写。 |
| `normalizeWhitespace` | `boolean` | 否 | `true` | 是否 trim 并折叠连续空白。 |
| `minConfidence` | `number` | 否 | Vision 默认 | OCR 最低置信度。 |
| `provider` | `string` | 否 | Vision 默认 | 指定单个 OCR provider。 |
| `providerChain` | `string[]` | 否 | Vision 默认 | 指定 OCR provider 尝试顺序。 |
| `lang` | `string` | 否 | Vision 默认 | OCR 语言。 |
| `index` | `number` | 否 | 未设置 | 多候选时使用的零基显式索引。 |
| `timeout` | `number` | 否 | `10000` ms | `waitText()` / `waitTextGone()` 的总等待时间。 |
| `polling` | `number` | 否 | `200` ms | `waitText()` / `waitTextGone()` 的轮询间隔。 |
| `click` | `OpenDeskMouseClickOptions` | 否 | 未设置 | 点击方法转发给 `mouse.clickPoint()` 的选项。 |
| `intervalMs` | `number` | 否 | `0` | `tapTexts()` 两步之间的显式间隔。 |
| `region` | `OpenDeskScreenRegion \| ((currentWin) => OpenDeskScreenRegion)` | 否 | 未设置 | 在 `within` 内进一步限定搜索范围。 |
| `relativeTo` | `OpenDeskUIRelativeTextRule` | 否 | 未设置 | 基于同次 OCR 中唯一文本参照物筛选目标。 |

`region` 与 `relativeTo` 只支持 `findTexts()`、`findText()`、`hasText()`、`tapText()` 和 `tapTexts()`，并要求 `within` 是明确的 `OpenDeskWindowInfo`。`waitText()`、`waitTextGone()` 或图片方法收到这两个字段时会在观察或输入前抛 `INVALID_ARGUMENT`。

### Scope：within

未指定 `within` 时，视觉 API 使用当前活动窗口。显式 scope 可为：

```ts
OpenDeskWindowInfo | OpenDeskDisplayInfo | OpenDeskScreenRegion
```

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
{
  text: string;
  direction: 'right' | 'left' | 'above' | 'below';
  maxGap?: number;
  minOverlap?: number;
}
```

`maxGap` 必须是非负有限 screen logical distance；`minOverlap` 取 `(0, 1]`，默认 `0.5`。方向模式只筛选候选，不自动选择最近项。

矩形模式：

```ts
{
  text: string;
  region: (anchor: OpenDeskUITextTarget) => OpenDeskScreenRegion;
}
```

回调仅在参照物唯一时调用一次，必须同步返回 tagged screen region。目标 bbox 必须完整包含在最终矩形内。方向模式与矩形模式互斥。

参照物不存在时，读取方法沿用各自“无结果”合同，点击方法抛 `TARGET_NOT_FOUND` 且 `stage: 'anchor'`；参照物不唯一时抛 `AMBIGUOUS_TARGET` 且 `stage: 'anchor'`。

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
| `maxResults` | `number` | 否 | ImageColor 默认 | 最大候选数；必须为正整数。 |
| `index` | `number` | 否 | 未设置 | 多候选时使用的零基索引。 |
| `timeout` | `number` | 否 | `10000` ms | 统一 options 合同字段；图片查找/点击当前不轮询。 |
| `polling` | `number` | 否 | `200` ms | 统一 options 合同字段；图片查找/点击当前不轮询。 |
| `click` | `OpenDeskMouseClickOptions` | 否 | 未设置 | `tapImage()` 的鼠标点击选项。 |

图片方法当前不支持 `region` / `relativeTo`，也没有 `UI.waitImage()`。

### 原生菜单选项

原生菜单方法为 **Experimental**，复用 [`Accessibility`](accessibility.md) 的 execution-owned runtime、元素表、deadline、取消和资源清理。可信本地 `-script` / `ai run` execution 可启用；HTTP、MCP 与 Scheduler 当前关闭。

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

使用窗口 scope 时，视觉 API 在截图前和返回/输入前重新验证窗口身份。动态范围允许在输入前最多完整重新观察一次；静态失效范围直接抛 `STALE_TARGET`。一旦鼠标或原生最终动作已经提交，Runtime 不会自动重复输入。

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

同步读取能力摘要，不执行截图、OCR、菜单遍历或输入。Accessibility 的完整 host/backend/权限状态见 [`Accessibility.getCapabilities()`](accessibility.md#accessibilitygetcapabilities)。

**示例**

```js
const capabilities = UI.getCapabilities();
console.log(capabilities.text, capabilities.image, capabilities.accessibility);
```

**Text APIs**

## UI.findTexts(text, options?)

返回当前观察中全部匹配文本。

**签名**

```ts
UI.findTexts(
  text: string,
  options?: OpenDeskUITextOptions,
): Promise<OpenDeskUITextTarget[]>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `text` | `string` | 是 | 无 | 目标文本。 |
| `options` | `OpenDeskUITextOptions` | 否 | `{}` | 文本选项，见 [文本选项](#文本选项)。 |

**返回值**

`Promise<OpenDeskUITextTarget[]>`。候选按 screen reading order 排序：先 y，同行再 x；没有结果返回 `[]`。

**行为与错误**

每次调用进行新的截图与 OCR。使用 `relativeTo` 时参照物不存在返回 `[]`。参数错误、截图失败、OCR 失败、scope 不可见或窗口失效时以结构化错误拒绝。

**示例**

```js
const win = await window.getActiveWindow();
const matches = await UI.findTexts('编辑', {
  within: win,
  match: 'exact',
  minConfidence: 0.5,
});
```

## UI.findText(text, options?)

返回唯一匹配文本，拒绝未经显式消歧的多候选结果。

**签名**

```ts
UI.findText(
  text: string,
  options?: OpenDeskUITextOptions,
): Promise<OpenDeskUITextTarget | null>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `text` | `string` | 是 | 无 | 目标文本。 |
| `options` | `OpenDeskUITextOptions` | 否 | `{}` | 文本选项，见 [文本选项](#文本选项)。 |

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
UI.hasText(
  text: string,
  options?: OpenDeskUITextOptions,
): Promise<boolean>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `text` | `string` | 是 | 无 | 目标文本。 |
| `options` | `OpenDeskUITextOptions` | 否 | `{}` | 文本选项，见 [文本选项](#文本选项)。 |

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
UI.tapText(
  text: string,
  options?: OpenDeskUITextOptions,
): Promise<OpenDeskUITapResult<OpenDeskUITextTarget>>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `text` | `string` | 是 | 无 | 要点击的目标文本。 |
| `options` | `OpenDeskUITextOptions` | 否 | `{}` | 文本选项；`options.click` 转发给 `mouse.clickPoint()`。 |

**返回值**

`Promise<OpenDeskUITapResult<OpenDeskUITextTarget>>`，包含已定位 target 和实际点击点。

**行为与错误**

找不到目标或索引越界抛 `TARGET_NOT_FOUND`；多候选未消歧抛 `AMBIGUOUS_TARGET`。输入已提交后，即使后续结果不确定也不会自动重复点击。

**示例**

```js
await UI.tapText('确定', {
  within: win,
  match: 'exact',
});
```

## UI.tapTexts(texts, options?)

按顺序重新观察并点击多个文本。

**签名**

```ts
UI.tapTexts(
  texts: string[],
  options?: OpenDeskUITextOptions,
): Promise<OpenDeskUITapResult[]>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `texts` | `string[]` | 是 | 无 | 非空动作序列；不会按空格拆分字符串，也不表示 aliases。 |
| `options` | `OpenDeskUITextOptions` | 否 | `{}` | 文本选项；`intervalMs` 控制步骤间隔。 |

**返回值**

`Promise<OpenDeskUITapResult[]>`，按输入顺序返回已完成步骤。

**行为与错误**

每一步都重新截图、OCR 和定位，不复用上一步坐标。任一步失败立即停止；错误包含 `failedIndex`、`failedText`、`completed` 和原始 `cause`。已经完成的步骤不会自动重做。

**示例**

```js
await UI.tapTexts(['1', '6', '×', '3', '='], {
  within: win,
  match: 'exact',
  intervalMs: 50,
});
```

## UI.waitText(text, options?)

轮询等待唯一文本出现。

**签名**

```ts
UI.waitText(
  text: string,
  options?: OpenDeskUITextOptions,
): Promise<OpenDeskUITextTarget>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `text` | `string` | 是 | 无 | 等待出现的文本。 |
| `options` | `OpenDeskUITextOptions` | 否 | `{}` | 文本选项；使用 `timeout` 与 `polling`，不支持 `region` / `relativeTo`。 |

**返回值**

`Promise<OpenDeskUITextTarget>`，找到唯一候选时返回。

**行为与错误**

每轮重新截图和 OCR。超时抛 `TIMEOUT`；多个候选仍按唯一性规则处理。传入 `region` 或 `relativeTo` 抛 `INVALID_ARGUMENT`。

**示例**

```js
const target = await UI.waitText('完成', {
  within: win,
  timeout: 5000,
  polling: 200,
});
```

## UI.waitTextGone(text, options?)

轮询等待匹配文本消失。

**签名**

```ts
UI.waitTextGone(
  text: string,
  options?: OpenDeskUITextOptions,
): Promise<true>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `text` | `string` | 是 | 无 | 等待消失的文本。 |
| `options` | `OpenDeskUITextOptions` | 否 | `{}` | 文本选项；使用 `timeout` 与 `polling`，不支持 `region` / `relativeTo`。 |

**返回值**

`Promise<true>`。目标不再存在时 resolve `true`。

**行为与错误**

每轮重新截图和 OCR。超时抛 `TIMEOUT`。传入 `region` 或 `relativeTo` 抛 `INVALID_ARGUMENT`。

**示例**

```js
await UI.waitTextGone('加载中', {
  within: win,
  timeout: 10000,
});
```

**Image APIs**

## UI.findImages(template, options?)

返回当前观察中的全部图片模板候选。

**签名**

```ts
UI.findImages(
  template: string | string[],
  options?: OpenDeskUIImageOptions,
): Promise<OpenDeskUIImageTarget[]>;
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
const targets = await UI.findImages('./assets/save.png', {
  within: win,
  threshold: 0.9,
});
```

## UI.findImage(template, options?)

返回唯一图片模板候选。

**签名**

```ts
UI.findImage(
  template: string | string[],
  options?: OpenDeskUIImageOptions,
): Promise<OpenDeskUIImageTarget | null>;
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
UI.tapImage(
  template: string | string[],
  options?: OpenDeskUIImageOptions,
): Promise<OpenDeskUITapResult<OpenDeskUIImageTarget>>;
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
await UI.tapImage('./assets/save.png', {
  within: win,
  threshold: 0.9,
});
```

**Native Menu APIs · Experimental**

## UI.getMenuItems(options)

只读观察当前已经物化的原生菜单数据。

**签名**

```ts
UI.getMenuItems(
  options: OpenDeskUIMenuOptions,
): Promise<OpenDeskUIGetMenuItemsResult>;
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
const observed = await UI.getMenuItems({
  within: win,
  maxDepth: 3,
});
console.log(observed.complete, observed.items);
```

## UI.findMenuItem(path, options)

在完整只读观察中查找唯一原生菜单路径。

**签名**

```ts
UI.findMenuItem(
  path: OpenDeskUIMenuPath,
  options: OpenDeskUIMenuOptions,
): Promise<OpenDeskUIMenuItem | null>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `path` | `OpenDeskUIMenuPath` | 是 | 无 | 非空完整菜单层级路径，见 [原生菜单 `path`](#原生菜单-path)。 |
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
UI.tapMenuItem(
  path: OpenDeskUIMenuPath,
  options: OpenDeskUIMenuOptions & {
    finalAction?:
      | { action: 'invoke' }
      | { action: 'select' }
      | { action: 'setChecked'; checked: boolean };
  },
): Promise<OpenDeskUITapMenuItemResult>;
```

**参数**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `path` | `OpenDeskUIMenuPath` | 是 | 无 | 非空完整菜单层级路径。 |
| `options` | `OpenDeskUIMenuOptions & { finalAction? }` | 是 | 无 | 菜单 scope、遍历限制和最终动作。 |
| `options.finalAction` | `{action:'invoke'} \| {action:'select'} \| {action:'setChecked', checked:boolean}` | 否 | `{ action: 'invoke' }` | 最终目标动作。 |

**返回值**

`Promise<OpenDeskUITapMenuItemResult>`，包含最终 `action`、`actionState`、`completedLevels` 和 `expansionOccurred` 等字段。

**行为与错误**

每展开一层后都重新观察，不缓存旧坐标或旧 ref；整个路径共享一个从入队开始计算的 deadline。最终动作最多提交一次，不在失败或超时后自动重做。`setChecked` 已满足目标状态时返回 `not_needed`。失败可能附带 `failedLevel`、`completedLevels`、`expansionOccurred`；已经发生的菜单展开属于可见副作用，取消不会撤回已提交的原生动作。

**示例**

```js
const result = await UI.tapMenuItem(
  ['File', 'Export', 'PDF'],
  {
    within: {
      app: { bundleId: 'com.example.app' },
      root: 'menuBar',
    },
    timeout: 3000,
  },
);
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
```

原生菜单还可能出现 [`Accessibility`](accessibility.md) 的结构化错误、`CAPABILITY_DISABLED` 与 `SEARCH_INCOMPLETE`。不要通过解析 `error.message` 判断错误类型。

## 平台与能力

文本和图片能力依赖当前截图、Vision、ImageColor 与输入后端。菜单能力为 Experimental，并要求当前 execution 显式启用 Accessibility；HTTP、MCP 与 Scheduler 当前不提供菜单操作。

当前明确不提供：

- `UI.waitImage()`；
- 图片 `region` / `relativeTo`；
- `waitText()` / `waitTextGone()` 的 `region` / `relativeTo`；
- visual → Accessibility 或 menu → OCR/mouse 的自动降级；
- 菜单 aliases、翻译或自动 repair；
- mixed-DPI split capture。

相关底层接口：[`Geometry`](geometry.md)、[`Vision`](vision.md)、[`ImageColor`](image-color.md)、[`Accessibility`](accessibility.md)、[`mouse`](mouse.md)。
