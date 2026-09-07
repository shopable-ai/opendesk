---
title: Desktop UI API
description: 使用 OCR、模板匹配、屏幕坐标与原生 Accessibility 查找和操作外部桌面应用 UI。
order: 11
---

# UI

大写 `UI` 是 OpenDesk 操作**外部桌面应用界面**的高层 API。它把同一个公开对象上的能力集中在本页：

- 文本：OCR 查找、判断、等待与点击；
- 图片：模板匹配、查找与点击；
- 菜单：通过第一方 `AccessibilityRuntime` 观察并执行完整原生菜单路径。

文本和图片方法使用新的截图，并把 OCR / 模板匹配得到的 image-pixel bbox 映射到 `mouse` 使用的 screen logical coordinate。菜单方法不使用 OCR 坐标，而是复用 [`Accessibility`](accessibility.md) 的原生语义树、owner、deadline、取消和资源清理。

`UI` 与小写 [`ui`](custom-ui.md) 完全不同，JavaScript 大小写敏感：

| 对象 | 作用 | 不做什么 |
| --- | --- | --- |
| `UI` | 查找、等待和操作外部桌面应用的文本、图片与原生菜单 | 不创建 OpenDesk 自己的窗口 |
| `ui` | 创建和管理 OpenDesk 自己的 Custom UI | 不查询或点击外部桌面应用 |

没有 `UI = ui`、`ui = UI` 或 `DesktopUI` 别名。

## API 总览

| 方法 | 状态 | 主要用途 |
| --- | --- | --- |
| `UI.getCapabilities()` | Stable / capability summary | 查询当前高层 UI 能力 |
| `UI.findTexts(text, options?)` | Stable | 返回全部匹配文本 |
| `UI.findText(text, options?)` | Stable | 返回唯一匹配文本 |
| `UI.hasText(text, options?)` | Stable | 判断是否存在匹配文本 |
| `UI.tapText(text, options?)` | Stable | 查找并点击唯一文本 |
| `UI.tapTexts(texts, options?)` | Stable | 按顺序点击多个文本 |
| `UI.waitText(text, options?)` | Stable | 等待唯一文本出现 |
| `UI.waitTextGone(text, options?)` | Stable | 等待文本消失 |
| `UI.findImages(template, options?)` | Stable | 返回全部模板匹配 |
| `UI.findImage(template, options?)` | Stable | 返回唯一模板匹配 |
| `UI.tapImage(template, options?)` | Stable | 查找并点击唯一图片 |
| `UI.getMenuItems(options)` | Experimental | 只读观察原生菜单 |
| `UI.findMenuItem(path, options)` | Experimental | 在完整观察中查找菜单路径 |
| `UI.tapMenuItem(path, options)` | Experimental | 逐层展开并执行完整菜单路径 |

视觉方法成功只证明目标已找到、读取或输入已提交，不证明业务已经完成。菜单动作中的 `acknowledged` 也不是保存、导出、提交等业务结果的证明。自动化脚本仍应验证业务后置条件。

## `UI.getCapabilities()`

```js
const capabilities = UI.getCapabilities();
console.log(capabilities);
```

返回当前 execution 可用的文本、图片、Accessibility 菜单与坐标映射能力摘要。示例字段形状：

```js
{
  text: { find: true, tap: true, wait: true, backend: 'Vision.runOCR' },
  image: { find: true, tap: true, backend: 'ImageColor.findImages' },
  accessibility: {
    available: true,
    implemented: true,
    status: 'available',
    enabled: true,
    backend: 'macos-ax',
    permission: 'granted',
    menus: true,
    actions: {
      invoke: true,
      setValue: true,
      expand: true,
      collapse: true,
      select: true,
      setChecked: true,
    },
    coordinateMapping: false,
  },
  coordinateMapping: {
    actualCaptureScale: true,
    mixedDPIScope: false,
  },
}
```

实际值以当前 execution 为准。完整 host/backend/OS 权限摘要见 [`Accessibility.getCapabilities()`](accessibility.md#getcapabilities能力不是元素保证)。

# 文本 API

文本方法复用 [`Vision.runOCR`](vision.md)，不建立第二套 OCR 后端。

## 文本公共 options

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

常用参数：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `within` | 当前活动窗口 | window、display 或已标记 screen region |
| `match` | `"exact"` | `"exact"` 或 `"contains"` |
| `caseSensitive` | `false` | 是否区分大小写 |
| `normalizeWhitespace` | `true` | trim 并把连续空白折叠为一个空格 |
| `minConfidence` | 未设置 | OCR 最低置信度 |
| `provider` / `providerChain` / `lang` | Vision 默认 | 转发给 `Vision.runOCR` |
| `index` | 未设置 | 零基显式消歧索引 |
| `timeout` / `polling` | `10000` / `200` ms | `waitText` / `waitTextGone` 的有限轮询控制 |
| `click` | 未设置 | 转发给 `mouse.clickPoint` |
| `intervalMs` | `0` | `tapTexts` 两步间的显式间隔 |

`region` 与 `relativeTo` 只支持 `findTexts`、`findText`、`hasText`、`tapText` 和 `tapTexts`，且必须显式传入 `within: OpenDeskWindowInfo`。`waitText`、`waitTextGone`、图片方法收到这些选项时会在截图或输入前抛 `INVALID_ARGUMENT`，不会静默忽略。

## `UI.findTexts()`

```ts
UI.findTexts(text: string, options?: OpenDeskUITextOptions): Promise<OpenDeskUITextTarget[]>;
```

返回全部匹配文本，按 screen reading order 排序：先 y，同行再 x。没有结果返回 `[]`。

```js
const matches = await UI.findTexts('编辑', {
  within: win,
  match: 'exact',
  minConfidence: 0.5,
  provider: 'apple',
  lang: 'ch',
});
```

候选形状：

```js
{
  source: 'ocr',
  text: '确定',
  confidence: 0.98,
  provider: 'apple',
  imageBounds: {
    x: 125, y: 125, width: 250, height: 50,
    coordinateSpace: 'image',
  },
  bounds: {
    x: 200, y: 300, width: 200, height: 40,
    coordinateSpace: 'screen',
  },
  center: { x: 300, y: 320, coordinateSpace: 'screen' },
}
```

## `UI.findText()`

```ts
UI.findText(text: string, options?: OpenDeskUITextOptions): Promise<OpenDeskUITextTarget | null>;
```

参数同 [`UI.findTexts()`](#uifindtexts)。结果规则：

- 0 个候选：返回 `null`；
- 1 个候选：返回该候选；
- 多个候选且没有 `index`：抛 `AMBIGUOUS_TARGET`；
- `index` 越界：抛 `TARGET_NOT_FOUND`。

不会默认取 `elements[0]`、最近项或最高置信度项。

## `UI.hasText()`

```ts
UI.hasText(text: string, options?: OpenDeskUITextOptions): Promise<boolean>;
```

参数同 [`UI.findTexts()`](#uifindtexts)。存在至少一个匹配候选返回 `true`，否则返回 `false`。使用 `relativeTo` 时，参照物不存在返回 `false`；参照物歧义仍抛 `AMBIGUOUS_TARGET`。

## `UI.tapText()`

```ts
UI.tapText(text: string, options?: OpenDeskUITextOptions): Promise<OpenDeskUITapResult<OpenDeskUITextTarget>>;
```

参数同 [`UI.findText()`](#uifindtext)，并可通过 `options.click` 传递既有鼠标点击选项。

0 个候选或 `index` 越界时抛 `TARGET_NOT_FOUND`；多个候选且未消歧时抛 `AMBIGUOUS_TARGET`。找到目标后最多调用一次 `mouse.clickPoint`。输入已提交后不会因超时或结果不确定自动重复点击。

## `UI.tapTexts()`

```ts
UI.tapTexts(texts: string[], options?: OpenDeskUITextOptions): Promise<OpenDeskUITapResult[]>;
```

只接受动作序列 `string[]`，不会按空格拆分字符串，也不会把数组解释为 aliases。

```js
await UI.tapTexts(['1', '6', '×', '3', '='], {
  within: Geometry.regionPercent(win, {
    left: 0,
    top: 35,
    width: 100,
    height: 65,
  }),
  match: 'exact',
});
```

每一步都会重新截图、OCR 和定位，不复用上一步坐标。任何一步失败立即停止；错误包含 `failedIndex`、`failedText`、`completed` 和原始 `cause`。已完成步骤不会自动重做。

## `UI.waitText()`

```ts
UI.waitText(text: string, options?: OpenDeskUITextOptions): Promise<OpenDeskUITextTarget>;
```

参数沿用文本公共 options，但不支持 `region` / `relativeTo`。按 `polling` 轮询，每次重新截图和 OCR；找到唯一候选时返回。超时抛 `TIMEOUT`，包含 `timeout`、`text`、`lastObservation` 和 `lastError` 摘要。

## `UI.waitTextGone()`

```ts
UI.waitTextGone(text: string, options?: OpenDeskUITextOptions): Promise<true>;
```

参数同 [`UI.waitText()`](#uiwaittext)。每次轮询重新截图和 OCR，直到文本消失。超时抛 `TIMEOUT`。它不会用固定 `page.waitFor(...)` 代替业务条件判断。

## 文本 `within`

未指定 `within` 时，视觉 API 读取当前活动窗口并只在其范围内查找。显式指定时可传：

```ts
OpenDeskWindowInfo | OpenDeskDisplayInfo | OpenDeskScreenRegion
```

UI 会先计算 `Geometry.rect(within)`，再与 `Screen.getVirtualBounds()` 求交。完全不可见时报 `TARGET_SCOPE_NOT_VISIBLE`；部分可见时只截取可见交集。

如果 scope 横跨多个 `scale` 明显不同的显示器，当前版本 fail closed 并抛 `UNSUPPORTED_MIXED_DPI_SCOPE`。同 scale 的多显示器 scope 可以继续使用本次截图的真实比例。不要传裸 bbox。

## 文本 `region`

`region` 是更严格的外层搜索范围，只在显式 `within: OpenDeskWindowInfo` 时可用。

动态形式适合随窗口移动或 resize 重新计算：

```js
await UI.tapText('确定', {
  within: win,
  region: currentWin => Geometry.regionByEdges(currentWin, {
    left: 16,
    right: 16,
    bottom: 12,
    height: 60,
  }),
});
```

每次完整观察前，UI 重新确认同一窗口，再把最新窗口快照传给同步规则。规则必须同步返回有效的 tagged screen region；`Promise`、`null`、裸 bbox、非法数字、image-space region 或字符串表达式均为 `INVALID_ARGUMENT`。

静态形式是坐标快照：

```js
const fixedRegion = Geometry.regionOffset(win, {
  left: 16,
  top: 300,
  width: 320,
  height: 60,
});

await UI.findText('确定', { within: win, region: fixedRegion });
```

静态 region 不会自动跟随窗口。启用新定位选项时，如果窗口 bounds 已变化，静态 region 会导致 `STALE_TARGET`，调用方应重新计算。

## 文本 `relativeTo`

`relativeTo` 使用**同一次截图、同一次 OCR** 中的唯一 exact 文本作为参照物，不递归调用 `UI.findText()` 拼接两个画面。

参照物不存在时：

- `findTexts` 返回 `[]`；
- 未指定 `index` 的 `findText` 返回 `null`；
- `hasText` 返回 `false`；
- 点击抛 `TARGET_NOT_FOUND`，`stage: "anchor"`。

参照物超过一个时，所有启用 `relativeTo` 的方法抛 `AMBIGUOUS_TARGET`，`stage: "anchor"`。顶层 `index` 不能用于挑选参照物。

### 方向模式

支持 `right`、`left`、`above`、`below`：

```js
await UI.tapText('编辑', {
  within: win,
  relativeTo: {
    text: '联系人 A',
    direction: 'right',
    maxGap: 240,
    minOverlap: 0.5,
  },
});
```

`maxGap` 必须是有限且不小于 0 的屏幕逻辑坐标距离；`minOverlap` 必须在 `(0, 1]`，默认 `0.5`。方向规则只做空间筛选，不证明业务关联，也不自动挑最近目标。

### 矩形模式

```js
await UI.tapText('编辑', {
  within: win,
  relativeTo: {
    text: '联系人 A',
    region: anchor => Geometry.regionOffset(anchor.bounds, {
      left: anchor.bounds.width + 8,
      top: -6,
      width: 240,
      height: anchor.bounds.height + 12,
    }),
  },
});
```

回调只在唯一参照物确认后调用一次，必须同步返回有效 tagged screen region。目标 bbox 必须完整位于最终矩形内；仅中心落入、边缘相交或部分重叠均不通过。矩形最终仍与外层有效搜索范围求交，不能扩大 `within`。

方向模式与矩形模式二选一。不能同时传 `direction` 和 `relativeTo.region`；矩形模式也不接受 `maxGap` / `minOverlap`。未知字段不会被静默忽略。

## 文本定位的新鲜度

启用 `region` / `relativeTo` 后，每次调用会在截图前确认窗口身份，并在识别后、返回或点击前再次复核。不会凭标题、PID 或坐标相似把失效窗口换成另一个窗口。

动态 `region` 或未指定外层 `region` 时，同一窗口在识别期间移动/resize，最多执行一次完整的重新读取 → 重算 → 截图 → OCR。静态 `region` 立即停止。重试观察期间再次变化则抛 `STALE_TARGET`，不会无限重试。

最后一次检查与系统实际接收点击之间仍存在竞态；UI 不声称能原子消除这段窗口。

# 图片 API

图片方法复用 [`ImageColor.findImages`](image-color.md)，不建立第二套模板匹配实现。

## 图片公共 options

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

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `within` | 当前活动窗口 | 限定截图和匹配范围；不能传裸 bbox |
| `threshold` | ImageColor 默认 | `0..1` 的有限数 |
| `scales` | ImageColor 默认 | 非空正数数组 |
| `maxResults` | ImageColor 默认 | 正整数 |
| `index` | 未设置 | 候选零基索引 |
| `timeout` | `10000` | 统一 options 合同校验；图片点击本身不轮询 |
| `polling` | `200` | 统一 options 合同校验；图片点击本身不轮询 |
| `click` | 未设置 | 转发给 `mouse.clickPoint` |

当前图片方法不支持 `region` / `relativeTo`。

## `UI.findImages()`

```ts
UI.findImages(
  template: string | string[],
  options?: OpenDeskUIImageOptions,
): Promise<OpenDeskUIImageTarget[]>;
```

返回当前 `within` 范围内按 screen reading order 排列的全部候选；没有结果返回 `[]`。`template` 可以是一张非空模板图片，也可以是**同一控件**的非空状态模板数组。

## `UI.findImage()`

```ts
UI.findImage(
  template: string | string[],
  options?: OpenDeskUIImageOptions,
): Promise<OpenDeskUIImageTarget | null>;
```

参数同 [`UI.findImages()`](#uifindimages)。0 个候选返回 `null`；唯一候选直接返回；多个候选且没有 `index` 时抛 `AMBIGUOUS_TARGET`；`index` 越界抛 `TARGET_NOT_FOUND`。

## `UI.tapImage()`

```ts
UI.tapImage(
  template: string | string[],
  options?: OpenDeskUIImageOptions,
): Promise<OpenDeskUITapResult<OpenDeskUIImageTarget>>;
```

查找唯一图片并点击中心。稳定 scope 中每次调用只截图、匹配一次，随后最多提交一次 `mouse.clickPoint`。找不到目标立即报错；不会因为传入 `timeout` / `polling` 而隐式等待或重复匹配。

返回示例：

```js
{
  ok: true,
  action: 'tapImage',
  target: {
    source: 'image',
    template: './assets/save-icon.png',
    confidence: 0.97,
    scale: 1,
    imageBounds: {
      x: 120, y: 80, width: 32, height: 32,
      coordinateSpace: 'image',
    },
    bounds: {
      x: 420, y: 260, width: 16, height: 16,
      coordinateSpace: 'screen',
    },
    center: { x: 428, y: 268, coordinateSpace: 'screen' },
  },
  point: { x: 428, y: 268, coordinateSpace: 'screen' },
}
```

输入前若窗口或目标范围变化，最多重新观察一次；鼠标输入已调用后绝不会自动重复点击。当前没有 `UI.waitImage()`。

## 图片状态模板

同一控件的多个状态模板会在同一次截图中逐一匹配。重叠候选按置信度去重，同分时按模板数组顺序选择。返回 target 的 `template` 是实际命中的状态模板。

数组不表示“多个不同按钮任选一个”。对于 toggle，不要直接写：

```js
await UI.tapImage([unselected, selected]);
```

如果当前已经 selected，这会再次点击并可能把状态切回去。正确流程是：

```text
状态数组分类
→ 如果已是目标状态则结束
→ 只点击允许改变状态的模板
→ 重新分类并验证后置条件
```

只搜索未选中模板可以作为 action gate，但“未命中未选中模板”不能单独证明已经选中，仍应重新读取状态。

# 原生菜单 API

`UI.getMenuItems()`、`UI.findMenuItem()`、`UI.tapMenuItem()` 属于同一个大写 `UI` 对象，因此菜单合同与文本、图片接口统一维护在本页，不再拆成独立 `desktop-ui-menu.md`。

菜单方法为 **Experimental**。它们复用唯一的 [`AccessibilityRuntime`](accessibility.md)、元素表、总 deadline、取消和资源清理；没有 `MenuRuntime`、平行菜单后端或鼠标/OCR 降级。

可信本地 `-script` / `ai run` execution 可显式启用；HTTP、MCP 和 Scheduler execution 当前关闭。禁用时拒绝为 `CAPABILITY_DISABLED`，不会先读取目标。

## 菜单公共 options

```ts
interface OpenDeskUIMenuOptions {
  within:
    | OpenDeskWindowInfo
    | {
        app: OpenDeskAppTarget;
        root: 'menuBar';
      };
  timeout?: number;  // default 3000, max 30000
  maxDepth?: number; // default 8, max 32
  maxNodes?: number; // default 1000, max 5000
}
```

菜单 `within` **必填**，且与视觉 API 的 `within` 合同不同：

- 可传可重新验证的明确 `OpenDeskWindowInfo`；
- 或 `{ app: OpenDeskAppTarget, root: 'menuBar' }`；
- 不能传 Display、ScreenRegion、裸坐标、Accessibility ref；
- 不能传只有 title/PID/handle 的自造对象；
- App target 匹配多个实例时必须消歧；
- unresolved、关闭重建或前后身份不一致时返回 `STALE_TARGET`。

macOS menu bar 是应用级根，不按主窗口矩形裁剪。菜单 popup 可以位于原窗口外或使用不同原生窗口，但后端必须证明应用/窗口 owner 关系。只凭同一 PID、文字同名、距离接近或 handle 变化不能接受 popup；无法证明归属时停止。

## 菜单 path

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

数组不能为空。字符串段必须非空；对象段至少有一个非空 `name` / `identifier`。对象的多个字段按 AND 精确匹配：不翻译、不忽略大小写、不自动修复、不把数组解释为 aliases。未知字段、非法类型或超过限制的值会拒绝，不会静默忽略。

每一层都必须在明确父容器中唯一匹配，不会跨整个应用挑第一个同名项。

```js
const saveAs = [
  { identifier: 'file-menu' },
  { name: 'Export' },
  { name: 'PDF' },
];
```

具体应用、版本和语言的菜单映射应放在应用 adapter；通用 Runtime 不猜菜单翻译或替代路径。

## `UI.getMenuItems()`

```ts
UI.getMenuItems(
  options: OpenDeskUIMenuOptions,
): Promise<OpenDeskUIGetMenuItemsResult>;
```

只读观察当前已经物化的菜单数据，不展开菜单、不激活应用、不抢焦点。

```js
const win = await window.getActiveWindow();
const observed = await UI.getMenuItems({
  within: win,
  maxDepth: 3,
});

console.log(observed.complete, observed.truncated, observed.reason);
```

返回：

```ts
{
  requestId: string;
  operation: 'UI.getMenuItems';
  backend: string;
  items: OpenDeskUIMenuItem[];
  complete: boolean;
  truncated: boolean;
  reason: string | null;
  stats: {
    nodes: number;
    maxDepth: number;
  };
}
```

菜单项只包含白名单观察数据：规范化/native role、name、identifier、状态、actions、经验证的 bounds 和 children；不返回可伪造的原生 handle。未物化、不可读或超过深度/节点/deadline 的子菜单不能被描述成“空且完整”。

## `UI.findMenuItem()`

```ts
UI.findMenuItem(
  path: OpenDeskUIMenuPath,
  options: OpenDeskUIMenuOptions,
): Promise<OpenDeskUIMenuItem | null>;
```

同样是只读操作：不展开菜单、不激活应用、不抢焦点。

- 完整观察且 0 个候选：返回 `null`；
- 唯一候选：返回普通 `OpenDeskUIMenuItem` 数据；
- 多个候选：抛 `AMBIGUOUS_TARGET`；
- 路径需要尚未物化的子菜单，或限制使 Runtime 无法证明 0/1：抛 `SEARCH_INCOMPLETE`。

`SEARCH_INCOMPLETE` 不会被伪装成 `null`。

## `UI.tapMenuItem()`

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

`finalAction` 省略时等价于 `{ action: 'invoke' }`。

```js
const result = await UI.tapMenuItem(
  ['File', 'Export', 'PDF'],
  {
    within: {
      app: { bundleId: 'com.example.fixture' },
      root: 'menuBar',
    },
    timeout: 3000,
  },
);

console.log(result.actionState);
```

执行顺序固定为：

```text
复核目标身份与前台状态
→ 在当前观察中唯一匹配第 0 层
→ 展开并重新观察已验证 owner 的新菜单
→ 逐层重复唯一匹配与重新观察
→ 再次复核目标、enabled、状态和实际 action
→ 最终动作最多提交一次
```

调用前应通过既有 `App.launch(..., { activate: true })` 或 `window.focus(...)` 激活已知目标，并自行验证身份。菜单方法不会按标题盲目切前台。开始或最终动作前发现其他应用、模态状态或 owner 不明会停止。

打开后的每一层定位必须来自新观察，不缓存旧坐标或旧菜单 ref，也不会全屏点击同名文字。

整个路径共享一个从入队开始计算的 deadline，不会每展开一层重置 timeout。Accessibility 菜单请求在本模块内有界串行，避免本模块自身的多个操作穿插；这不等于锁住真人、其他进程或旧鼠标脚本。

成功结果包含 `requestId`、`operation`、`backend`、最终 `action`、`actionState`、`completedLevels` 和 `expansionOccurred`。`actionState` 与 [`Accessibility.perform()`](accessibility.md#perform动作与状态) 相同。

`setChecked` 已是目标值时返回 `not_needed` 且不提交输入。状态未知、只读、disabled、三态无法安全映射或 pattern/action 不支持时停止；`select` 不会退化成 toggle；任何最终动作都不会在失败或超时后自动重做。

## 菜单失败、副作用与清理

菜单 rejection 复用 [Accessibility 结构化错误](accessibility.md#结构化错误)，并在适用时增加：

```ts
{
  failedLevel?: number;
  completedLevels?: number;
  expansionOccurred?: boolean;
}
```

如果最终动作尚未开始，`actionState` 可以是 `not_started`；但此前若已经展开菜单，`expansionOccurred` 仍为 `true`，不能把整个请求描述成“无副作用”。取消只能阻止尚未执行的后续层级，已经发出的原生动作不保证撤回。

Runtime 不会向身份未知的当前前台窗口强发 Escape。只有后端仍能证明展开菜单属于原目标时，才允许受控清理；清理失败不得覆盖原始错误。默认日志不记录完整 path、菜单正文或用户数据。

# Capture mapping 与 DPI

视觉 UI 始终区分：

1. **screen logical coordinate**：window/display bounds 与 `mouse.click` 使用的虚拟桌面坐标；
2. **screenshot image pixel**：OCR 与 ImageColor bbox 使用的图片像素；
3. **scope-local coordinate**：本次 screenshot clip 内部局部坐标。

每次视觉查找使用现有截图接口：

```js
const image = await page.screenshot({
  target: 'screen',
  clip: { x, y, width, height },
  returnType: 'base64',
});
const [imageWidth, imageHeight] = ImageColor.getSize(image);
const scaleX = imageWidth / width;
const scaleY = imageHeight / height;
```

UI 默认只在内存中使用本次截图，不新增截图文件、上传内容或记录 OCR 正文日志。

不会假定 screenshot pixel 等于 screen logical coordinate，不写死 Retina 2× 或 Windows 125%/150%，也不要求 `scaleX === scaleY`。`Display.scale` 只用于 mixed-DPI 安全检查与诊断；本次真实图片尺寸才是坐标投影依据。

投影规则：

```text
screenLeft   = logicalScope.x + bbox.x / scaleX
screenTop    = logicalScope.y + bbox.y / scaleY
screenRight  = logicalScope.x + (bbox.x + bbox.width) / scaleX
screenBottom = logicalScope.y + (bbox.y + bbox.height) / scaleY
```

公开 screen bounds 左/上取 `floor`，右/下取 `ceil`；center 从最终完整 bounds 计算并 clamp 在 bounds 内。不要直接使用旧 OCR/ImageColor result 的 `centerX` / `centerY` 点击。

如果 scope 是 window，输入前会重新读取窗口身份。身份变化抛 `STALE_TARGET`。动态范围允许在输入前最多重新观察一次；鼠标或原生动作已提交后不会自动重复输入。

# 错误与边界

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

原生菜单还可能出现 Accessibility 结构化错误、`CAPABILITY_DISABLED` 与 `SEARCH_INCOMPLETE`。

当前明确边界：

- 没有 `UI.waitImage()`；
- 图片方法不支持 `region` / `relativeTo`；
- `waitText` / `waitTextGone` 暂不支持 `region` / `relativeTo`；
- visual API 不把失败自动降级为 Accessibility 动作；
- menu API 不把失败自动降级为 OCR/鼠标点击；
- menu API 不做 aliases、翻译或自动 repair；
- mixed-DPI split capture 尚未提供；
- Recorder、replay、UIMap/scene 不属于本页 API。

# 示例与验证

文字相对定位的受控示例：

```bash
./opendesk -script examples/ui-relative-target.js
```

请只在明确准备的测试窗口运行；不要把示例直接用于真实联系人、订单、支付或其他高风险界面。移动或调整测试窗口后再次运行，动态 `region` 会从最新窗口 bounds 重算，不复用上次点击坐标。

原生菜单 smoke 应使用仓库自有 fixture，或由本次 execution 明确启动且可安全清理的应用，并通过独立状态读取验证副作用。相关示例和产物约定见 [`examples/accessibility/README.md`](../../examples/accessibility/README.md)。

相关文档：

- [`Accessibility API`](accessibility.md)：底层原生元素 snapshot/find/read/perform/release；
- [`Vision API`](vision.md)：OCR provider 与底层识别；
- [`ImageColor API`](image-color.md)：模板匹配和图像辅助能力；
- [`Geometry API`](geometry.md)：screen logical coordinate 与可重算区域；
- [`Mouse API`](mouse.md)：实际鼠标输入；
- [`Native Accessibility architecture`](../architecture/desktop-automation/native-accessibility.md)：owner 与 popup 身份模型。
