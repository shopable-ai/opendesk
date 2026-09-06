---
title: Desktop UI Menu API
description: 在现有大写 UI 对象上观察完整菜单路径，并通过同一个 AccessibilityRuntime 执行原生菜单动作。
order: 13
---

# UI Menu

`UI.getMenuItems()`、`UI.findMenuItem()` 和 `UI.tapMenuItem()` 是大写 `UI` 上的 **Experimental**
原生菜单接口。它们复用唯一的 [`AccessibilityRuntime`](accessibility.md)、元素表、总 deadline、取消和
资源清理；没有 `MenuRuntime`、平行菜单后端或鼠标/OCR 降级。

原有 `UI.tapText()`、`UI.tapImage()`、`UI.tapTexts()` 等视觉方法保持既有截图 + OCR/模板匹配 +
鼠标合同。小写 [`ui`](custom-ui.md) 仍只管理 OpenDesk 自己的 Custom UI；`App` 和 `window` 只用于
目标身份、激活和窗口生命周期，不扩展成菜单系统。

## 方法

| 方法 | 返回 | 是否展开/抢焦点 |
| --- | --- | --- |
| `UI.getMenuItems(options)` | `Promise<OpenDeskUIGetMenuItemsResult>` | 否；只观察当前已物化菜单数据。 |
| `UI.findMenuItem(path, options)` | `Promise<OpenDeskUIMenuItem \| null>` | 否；只在完整观察能证明结果时返回。 |
| `UI.tapMenuItem(path, options)` | `Promise<OpenDeskUITapMenuItemResult>` | 是；逐层唯一匹配、展开、重新观察，最终动作最多一次。 |

三个方法始终返回 Promise。可信本地 `-script` / `ai run` execution 可显式启用；HTTP、MCP 和
Scheduler execution 当前关闭。禁用时方法拒绝为 `CAPABILITY_DISABLED`，不触发目标读取。

## `MenuOptions` 与 scope

```ts
interface OpenDeskUIMenuOptions {
  within: OpenDeskWindowInfo | {
    app: OpenDeskAppTarget;
    root: 'menuBar';
  };
  timeout?: number;  // default 3000, max 30000
  maxDepth?: number; // default 8, max 32
  maxNodes?: number; // default 1000, max 5000
}
```

`within` 必填。它只能是可重新验证的明确窗口，或现有 App target 加 `root: 'menuBar'`；不能传
Display、ScreenRegion、裸坐标、Accessibility ref 或只有标题/PID/handle 的自造对象。App target 匹配
多个实例时必须消歧；Windows 多窗口菜单优先绑定明确窗口。unresolved、关闭重建或前后身份不一致的
窗口返回 `STALE_TARGET`，不会按标题换成另一个窗口。

macOS menu bar 是应用级根，不按主窗口矩形裁剪。菜单 popup 可以位于原窗口外或使用不同原生窗口；
后端必须证明其应用/窗口 owner 关系。只凭同一 PID、文字同名、距离接近或 handle 变化不能接受 popup；
无法证明归属时停止。

## Path 是完整层级，不是点击序列

```ts
type OpenDeskUIMenuPathSegment =
  | string
  | { name: string, identifier?: string }
  | { name?: string, identifier: string };

type OpenDeskUIMenuPath = [
  OpenDeskUIMenuPathSegment,
  ...OpenDeskUIMenuPathSegment[]
];
```

数组不能为空；字符串段必须非空，对象段至少有一个非空 `name` / `identifier`。对象的多个字段按
AND 精确匹配，不翻译、不忽略大小写、不自动修复、不把数组解释为 aliases。path/options 对象的未知
字段、非法类型和超过限制的值都会拒绝，不会静默忽略。每一层都必须在其明确父容器中唯一；不会跨
整个应用挑第一个同名项。

```js
const saveAs = [
  { identifier: 'file-menu' },
  { name: 'Export' },
  { name: 'PDF' },
];
```

具体应用、版本和语言的菜单映射应放在应用 adapter；通用 Runtime 不猜菜单翻译或替代路径。

## 只读观察：`getMenuItems()` / `findMenuItem()`

```js
const win = await window.getActiveWindow();
const observed = await UI.getMenuItems({ within: win, maxDepth: 3 });

console.log(observed.complete, observed.truncated, observed.reason);
```

`getMenuItems()` 返回：

```ts
{
  requestId: string;
  operation: 'UI.getMenuItems';
  backend: string;
  items: OpenDeskUIMenuItem[];
  complete: boolean;
  truncated: boolean;
  reason: string | null;
  stats: { nodes: number, maxDepth: number };
}
```

菜单项只包含白名单观察数据：规范化/native role、name、identifier、状态、actions、经验证的 bounds
和 children；不带可伪造的原生 handle。未物化、不可读或超过深度/节点/deadline 的子菜单不能作为空且
完整返回。

`findMenuItem()` 同样不展开菜单、不激活应用、不抢焦点。完整观察且零候选返回 `null`，唯一候选返回
普通 `OpenDeskUIMenuItem` 数据；多个候选返回 `AMBIGUOUS_TARGET`。如果路径需要尚未物化的子菜单，
或限制使 Runtime 无法证明零/唯一，则返回 `SEARCH_INCOMPLETE`，而不是 `null`。

## 动作：`tapMenuItem()`

```js
const result = await UI.tapMenuItem(
  ['File', 'Export', 'PDF'],
  {
    within: { app: { bundleId: 'com.example.fixture' }, root: 'menuBar' },
    timeout: 3000,
  }
);

console.log(result.actionState); // acknowledged 仍须验证业务结果
```

`finalAction` 省略时为 `{ action: 'invoke' }`，也可明确指定：

```ts
{ action: 'select' }
{ action: 'setChecked', checked: boolean }
```

`tapMenuItem()` 的顺序固定为：

```text
复核目标身份与前台状态
→ 在当前观察中唯一匹配第 0 层
→ 展开并重新观察已验证 owner 的新菜单
→ 逐层重复唯一匹配与重新观察
→ 再次复核目标、enabled、状态和实际 action
→ 最终动作最多提交一次
```

调用前应通过既有 `App.launch(..., { activate: true })` 或 `window.focus(...)` 激活已知目标，并自行验证
身份。菜单方法不会按标题盲目切前台；开始或最终动作前发现其他应用、模态状态或 owner 不明会停止。
打开后的每层定位必须来自新观察，不缓存旧坐标或旧菜单 ref，也不会全屏点击同名文字。

整个路径共享一个从入队开始计算的 deadline；不会每展开一层重置 timeout。Accessibility 菜单请求在
本模块内有界串行，避免本模块自身的多个操作穿插；这不等于能锁住真人、其他进程或旧鼠标脚本。

成功结果包含 `requestId`、`operation`、`backend`、最终 `action`、`actionState`、
`completedLevels` 和 `expansionOccurred`。`actionState` 语义与
[Accessibility.perform()](accessibility.md#perform动作与状态) 相同；`acknowledged` 不是保存、导出或
提交业务成功的证明，应用 adapter 仍需验证业务后置条件。

`setChecked` 已是目标值时返回 `not_needed` 且不提交输入。状态未知、只读、disabled、三态无法安全
映射或 pattern/action 不支持时停止；`select` 不会退化成 toggle，任何最终动作都不会在失败/超时后
自动重做。

## 失败、副作用与清理

菜单 rejection 复用 [Accessibility 结构化错误](accessibility.md#结构化错误)，并在适用时增加：

```ts
{
  failedLevel?: number;       // 零基失败层级
  completedLevels?: number;   // 失败前完成的层数
  expansionOccurred?: boolean;
}
```

例如最终动作尚未开始时 `actionState` 可以是 `not_started`，但此前若已经展开菜单，
`expansionOccurred` 仍为 `true`；不能把整个请求描述为“无副作用”。取消只能阻止尚未执行的后续层级，
已经发出的原生动作不保证撤回。

Runtime 不会向身份未知的当前前台窗口强发 Escape。只有后端仍能证明展开菜单属于原目标时，才允许
受控清理；清理失败不得覆盖原始错误。默认日志不记录完整 path、菜单正文或用户数据。

## 安全示例与验证

普通 smoke 不应操作任意活动窗口。请使用仓库自有 fixture 或明确由本次 execution 启动、可安全清理
的应用，并用独立计数器/状态读取验证副作用。仓库示例、权限和一行命令见
[examples/accessibility/README.md](../../examples/accessibility/README.md)，运行产物统一写入
`.runtime/tests/accessibility/`。

完整视觉 UI 合同见 [Desktop UI API](desktop-ui.md)，原生元素接口见
[Accessibility API](accessibility.md)，owner 与 popup 身份模型见
[Native Accessibility architecture](../architecture/desktop-automation/native-accessibility.md)。
