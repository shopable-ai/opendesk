---
title: Custom UI
description: 使用 FloatingWindow 或受限 HTML/CSS 创建受控桌面界面。
order: 13
---

# Custom UI

Custom UI 由当前 JavaScript Runtime 控制受控桌面窗口。`FloatingWindow` 直接声明
简单图标工具栏；`ui.createWindow()` 用受限 HTML/CSS 声明视图。这里的 “Custom” 指脚本
作者可以声明自己的工具栏或受限视图；“native” 是底层 AppKit / host 的实现方式。HTML 不能直接取得
`mouse`、`File`、`http` 等全局能力；业务接口仍由 JavaScript listener 调用。

在 macOS 上，Custom UI 使用 AppKit；只有 `ui.createWindow()` 使用 WKWebView。Windows 与 Linux 会报告 `available: false`；创建窗口明确抛出 `UNSUPPORTED_PLATFORM`，不会静默成功。需要固定的一次性确认/输入窗口时使用 [Dialog API](dialog.md)：Dialog 由 host 根据结构化参数生成，不能提交 HTML/CSS，也不会成为 Custom UI 的第二套 controller。

## 选择 UI API

| 需求 | 使用 API | 不适用的情况 |
| --- | --- | --- |
| 一次性的确认、取消或短文本输入 | [Dialog API](dialog.md) | 任意布局、持续交互或复杂表单 |
| 最多 32 个简单图标操作按钮，以及少量分隔结构 | `new FloatingWindow(options)` | 需要可见文本、表单、任意 HTML/CSS 或动态控件树 |
| 表单、受限 HTML/CSS 或动态控件树 | `ui.createWindow(spec)` | 仅需图标工具栏 |

## Custom UI：命令行 `-ui` 与启用方式

`-ui` 是不带值的布尔开关：它只为**本次 CLI JavaScript execution** 授予 Custom UI
能力；配合 `-http` 时，它只允许服务器接受后续可能请求 UI 的 execution。它本身不会创建窗口、
不会启动一个图形化 shell，也不会替脚本调用 `ui.createWindow()` 或 `new FloatingWindow()`。
脚本仍必须显式创建并显示窗口。

`ui` 全局始终存在，但默认 dormant。未授权的 `createWindow()`、`closeAll()` 或 `on()` 会抛出 `UI_DISABLED`。
`-ui` 让 `ui`、`FloatingWindow` 和 Dialog 获得当前 execution 的授权；是否真的可创建原生窗口
还取决于平台和 UI host，可通过 `ui.getCapabilities()` 区分 `enabled` 与 `available`。

普通项目推荐把下面文件放在 JavaScript 脚本同目录，文件名固定为 `clawdesk.runtime.json`：

```json
{
  "schemaVersion": 1,
  "runtime": {
    "capabilities": ["ui"]
  }
}
```

配置采用严格 schema：未知字段、未知 capability、重复 capability、错误类型和不支持的 schemaVersion 都会让执行失败。项目配置不能提供 UI host 路径。

配置错误使用 `RUNTIME_CONFIG_INVALID`、`RUNTIME_CONFIG_NOT_FOUND` 或 `RUNTIME_CONFIG_UNSUPPORTED`，并在 CLI stderr 中包含配置路径和原因。

从仓库根目录运行，最直接的方式是把 `-ui` 与脚本一起传入：

```bash
# 为当前脚本明确启用 Custom UI
./opendesk -ui -script examples/custom-ui/panel.js -console-mode script

# 启动 HTTP server；每一条 UI 请求还要声明 capabilities，并且必须来自 loopback
./opendesk -http -ui -port 60844

# 明确禁用，优先于所有其他来源
./opendesk -no-ui -script examples/custom-ui/panel.js -console-mode script

# 从指定项目配置决定是否启用 UI
./opendesk -config examples/custom-ui/clawdesk.runtime.json -script examples/custom-ui/panel.js -console-mode script
```

| 开关或配置 | 是否带值 | 作用 |
| --- | --- | --- |
| `-ui` | 否 | 强制授予本次 CLI execution 的 UI 能力；也可使 HTTP server 具备接受 UI 请求的前提。它优先于项目配置。 |
| `-no-ui` | 否 | 强制禁用 UI，优先于 `-ui` 和所有项目配置。 |
| `-config <path>` | 是 | 只从指定的严格 schema 配置读取 `runtime.capabilities`；文件不存在或不合法会终止启动。 |
| `-ui-host <path>` | 是 | 内部开发/验收用的 native host 覆盖项，不是项目配置字段，也不是发行版用户 API。 |

当 `-ui` 或 `-no-ui` 已生效时，UI 的启用判断不会再读取 `-config` 或自动发现的项目配置；
不要把它们当作“先读取配置、再叠加一个 UI 值”。若需要由配置做决定，不要传这两个强制开关。

优先级从高到低为：

1. `-no-ui`
2. `-ui`
3. `-config <path>`
4. 本地脚本同目录的 `clawdesk.runtime.json`
5. 默认禁用

普通 `-script` 执行会在脚本同目录自动查找 `clawdesk.runtime.json`。在迁移期间，只有当它不存在时，
才会退回查找同目录的 `opendesk.runtime.json`；两者同时存在时始终使用前者。双击 / `tm.config.js`
模式改为从工作目录查找这两个固定文件名。若配置的 `capabilities` 是空数组，则它明确保持 UI 禁用。

HTTP UI 还需要第二层按请求授权：服务器已通过 `-ui` 或 `-config` 启用后，单次请求仍必须带
`"capabilities":["ui"]`，并从 `127.0.0.1` 或 `::1` 的 loopback socket 发出。否则该 execution
仍是 dormant，并返回 403；详见 [HTTP Server API](http-server.md)。

可以同时从两个位置观察启用来源：

```js
console.log(ui.getCapabilities().activationSource);
console.log(Execution.activationSource);
```

值为 `disabled`、`cli`、`projectConfig` 或 `httpRequest`。

## FloatingWindow：浮动工具栏

**状态：Conditional / Native**

`FloatingWindow` 是 compact native action toolbar：它通过结构化、版本化的
`ToolbarSpec.Items[]`（`Button` / `Separator` / `Spacer`）直接创建 AppKit toolbar，
不生成 HTML/CSS 或 WKWebView。复杂表单、可见标题分区、任意受限 HTML/CSS、输入、滚动区或
动态控件树仍使用本页的 `ui.createWindow()`。两者共享 native driver、事件队列、
`EventLoop.RunOnLoop`、统一 `WindowState`、结构化错误和生命周期清理，不引用或初始化 Fyne。
只有 execution 已显式授权 UI 时才注入 `FloatingWindow`。

每个工具栏都通过 `new FloatingWindow(options?)` 创建；后续按钮和生命周期方法只在该实例上调用：

```js
const toolbar = new FloatingWindow({
  position: { mode: "absolute", x: 100, y: 100 },
  theme: "dark"
});
```

## `new FloatingWindow(options?)`

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `position` | discriminated union | 未设置 | 推荐的初始位置声明。只能是 `{ mode:"absolute", x, y }` 或 `{ mode:"anchor", horizontal, vertical, margin?, display? }`，两种成员不能混合。 |
| `x` / `y` | number | `100` / `100` | 已有绝对定位兼容写法；必须成对提供，不能和 `position` 混用。新代码使用 `position.mode:"absolute"`。 |
| `theme` | `"dark"` | `"dark"` | 当前仅支持 dark；其他值返回 `INVALID_SPEC`。 |
| `title` | string | `"Toolbar"` | 原生窗口标题，最多 128 个 Unicode 字符。 |
| `alwaysOnTop` | boolean | `true` | 是否使用原生置顶层级。 |
| `draggable` | boolean | `true` | 是否允许拖动原生窗口。 |
| `orientation` | `"horizontal"` / `"vertical"` | `"horizontal"` | horizontal 最多 32 个 actionable Button；vertical 最多 5 个。Separator / Spacer 不占 Button quota。 |
| `toolbar` | object | 未设置 | horizontal 工具栏的换行约束；见下表。vertical 保持兼容的一列布局，不接受此对象中的约束。 |

`toolbar` 采用与主流 responsive flex/grid 一致的“**宽度或轨道上限 + 自动换行**”模型：按钮保持 40×40pt 和 8pt 间隔，native host 按声明顺序从左到右填充，达到有效列数后换到下一行。它不缩小图标、不裁切按钮，也不要求调用方预先计算窗口 frame。

| `toolbar` 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `maxWidth` | number | `960` | 最大外部宽度，单位 pt，范围 `60–960`。host 根据按钮尺寸计算一行可放的整数列数；最后一行或按钮较少时窗口自动收紧。 |
| `maxColumns` | integer | `19` | 每行最多按钮数，范围 `1–19`。与 `maxWidth` 同时设置时使用较窄的限制。设置 `2` 即每行至多两列。 |
| `maxRows` | integer | 自动 | 最多行数，范围 `1–32`。host 为当前按钮数选取刚好满足该行数的紧凑列数；若再添加按钮会超过有效列数（`maxWidth` 与 `maxColumns` 中较窄者）乘以 `maxRows`，`addButton()` 返回 `INVALID_SPEC`，不会静默裁切或溢出。 |

例如，五个按钮每行最多两列：

```js
const toolbar = new FloatingWindow({
  x: 100,
  y: 100,
  toolbar: { maxColumns: 2 }, // 2 + 2 + 1，自动换成三行
});
```

如果按钮数量会变化，但希望最多两行，让 `maxRows` 自适应决定需要的列数：

```js
const toolbar = new FloatingWindow({
  x: 100,
  y: 100,
  toolbar: { maxRows: 2 }, // 7 个按钮时为 4 列 + 3 列
});
```

如果设计稿直接给出宽度，就只使用 `maxWidth`；例如 `toolbar: { maxWidth: 252 }` 恰好可放五个 40pt 按钮，新增第六个按钮会自动开始第二行。`orientation: "vertical"` 继续是固定单列、最多五个按钮的兼容模式；需要任意二维控件布局、滚动或可见文字时应使用 `ui.createWindow()`。

首次 `show()` 前必须按声明顺序添加 toolbar item。未提供 `toolbar` 时，horizontal 的安全宽度上限仍为 960pt；vertical 在单列中从上至下排列，固定宽 60pt，五个 Button 时高 273pt（含原生标题栏）。初始定位必须只选择一种模式：推荐的 `position.mode` 明确描述该模式；不提供任何位置时保留已有 `100/100` 默认绝对位置。顶层 `placement` 是已废弃的草案形式，会返回 `INVALID_SPEC` 并提示迁移，绝不采用隐式优先级。

## 窗口停靠与对齐（框架能力）

这里的 *anchor placement* 属于顶层窗口能力，不属于 toolbar 内部布局，也不要求业务示例读取屏幕尺寸后手算坐标。它不是 CSS `place-items`、flex/grid 对齐或 DOM anchor positioning：那些只布局窗口**内容**，不会移动 native top-level window。`FloatingWindow` 构造参数与 `ui.createWindow()` 的 `WindowSpec` 都用 `position.mode:"anchor"` 声明初始位置；窗口创建后可调用 `setPlacement()`。原生 driver 以选中显示器的可用工作区定位，自动避开菜单栏和 Dock。

公开声明没有“谁覆盖谁”的隐式规则，而是判别联合：

- `FloatingWindow`：`position: { mode:"absolute", x, y }` 或 `position: { mode:"anchor", horizontal, vertical, ... }`；
- `ui.createWindow()`：`position: { mode:"absolute", bounds }` 或 `position: { mode:"anchor", size, horizontal, vertical, ... }`。`size` 只描述宽高，避免在 anchor 模式中伪造无效的 `x/y`。

```js
const toolbar = new FloatingWindow({
  orientation: "vertical",
  position: {
    mode: "anchor",
    horizontal: "right",
    vertical: "center",
    margin: 16,
    display: "active"
  }
});
```

通用 Custom UI 窗口将 `size` 放在同一个 anchor union 成员中：

```js
const panel = await ui.createWindow({
  id: "statusPanel",
  position: {
    mode: "anchor", size: { width: 420, height: 180 },
    horizontal: "left", vertical: "bottom", margin: 16
  },
  content: { html: '<span id="status">Ready</span>' }
});
```

| 字段 | 值 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `horizontal` | `"left"` / `"center"` / `"right"` | 必填 | 工作区横轴对齐。 |
| `vertical` | `"top"` / `"center"` / `"bottom"` | 必填 | 工作区纵轴对齐。 |
| `margin` | 非负有限 number | `0` | 单位 pt；对齐到边缘的轴与工作区保留此距离，居中轴不偏移。 |
| `display` | `"active"` / `"current"` / `"primary"` | `"active"` | `active` 是指针所在显示器；`primary` 是系统主显示器。`current` 是窗口当前显示器，仅能在窗口已创建后调用 `setPlacement()` 时使用，初始 `position` 或首次 `show()` 前使用会返回 `INVALID_SPEC`。 |

横轴和纵轴正交组合，共覆盖九个稳定位置：左上、左中、左下、中上、正中、中下、右上、右中、右下。窗口或边距放不进目标工作区时返回结构化 `INVALID_SPEC`，不会裁切窗口、缩小窗口或静默越过边界。动态方法允许切换模式：成功的 `setPosition(x, y)` / `setBounds(...)` / `setSize(...)` 使当前 frame 成为绝对结果；成功的 `setPlacement(...)` 重新从当时的 outer frame 按工作区锚定；最后一次**成功**调用决定当前位置。失败不会改变本地保存的 mode 或 frame。

Anchor 是一次明确的重定位动作，不是持续约束。用户拖动、`setSize()`、手动 resize 或工作区/DPI/显示器拓扑变化后，窗口保持系统给出的实际 frame；不会悄悄自动重锚或跳回边缘。若窗口必须再次贴边，调用 `setPlacement()`；`active` 在每次调用时重新读取指针所在显示器，`current` 读取此窗口当前所在显示器，`primary` 读取当前系统主显示器。拔掉当前显示器后由系统先把窗口迁移到可用屏幕，随后一次 `setPlacement({display:"current",...})` 会在迁移后的工作区计算。坐标和 margin 是 logical desktop points；原生 host 用每屏 DPI/Retina scale 处理像素转换，`getState().bounds` 返回同一 logical frame 空间，允许负坐标。

迁移：已发布的绝对 `FloatingWindow({x,y})` 与 `ui.createWindow({bounds})` 继续有效；新代码应改用 `position`。尚未稳定的顶层 `{placement}` 或 `{size,placement}` 草案不再接受，必须分别移到 `position:{mode:"anchor",...}`，以避免“谁覆盖谁”的兼容陷阱。

## `toolbar.addButton(id, label, icon, callback?)`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 必填；匹配 `[A-Za-z][A-Za-z0-9_-]{0,63}`，同一工具栏内唯一。 |
| `label` | string | 必填，1–60 个 Unicode 字符；作为 tooltip、macOS Accessibility name 和调试证据，不显示在图标按钮正文。 |
| `icon` | string \| `{path, renderingMode?}` | 必填；可传 160 个经过审核的内置图标键，或脚本目录内的本地 PNG/JPEG。`renderingMode` 为 `original`（默认）或 `template`。 |
| `callback` | `(event) => unknown \| Promise<unknown>` | 可选；接收 `click` 事件，可同步返回或返回 Promise。 |

按钮只能在首次 `show()` 前增加或删除。重复 id 返回 `DUPLICATE_ID`；无效 id、label、icon、callback 或超出按钮数返回 `INVALID_SPEC`。

## `toolbar.addSeparator(id)` / `toolbar.addSpacer(id)`

两者都是只可在首次 `show()` 前声明的真实 native structure primitive，不是 disabled Button：

```js
toolbar.addButton("reply", "回复", "arrowshape.turn.up.left.fill", reply);
toolbar.addSeparator("reply-order-divider");
toolbar.addButton("order", "订单", "doc.text.fill", openOrder);
toolbar.addSpacer("order-help-space");
toolbar.addButton("help", "帮助", "questionmark.circle.fill", help);
```

- `Separator` 是 1pt native line；horizontal 为竖线，vertical 为横线。它在两侧各保留一个标准 8pt gap，因此是紧凑、可见的 17pt group boundary，而不是孤立的空白区域。
- `Spacer` 是固定、无绘制的 8pt group gap（一个标准 Button gap）；host 不会在它后面再叠加第二个 stack gap，也不会额外占用 intrinsic 8pt track。它不是 arbitrary width、flexible space、percentage 或负间距。
- 两者都没有 callback、busy、active、error、tooltip、focus target 或 Accessibility button；它们不会出现在 `getButtonState()` 中。
- 所有 item 的 `id` 共用一个严格命名空间，匹配 Button id 规则，重复返回 `DUPLICATE_ID`。这只用于稳定证据、调试和 strict validation，不会成为业务控件。

结构项只能表达相邻 action group 的边界：不能在首位或末位，不能连续；构建期间可暂时以 Separator / Spacer 结尾来继续添加下一个 Button，但在 `show()` / 未显示的 `getState()` 时仍未闭合的结构会返回 `INVALID_SPEC`。show 后不能 add/remove Button、Separator 或 Spacer。

horizontal planner 按 Button capacity、`maxWidth` 和 `maxRows` 计算行；Separator / Spacer 不占 action Button quota，但会占真实视觉空间。如果 boundary 与自然换行恰好重合，host 不绘制该 boundary，而让换行本身承担分组，因此不会产生空行、行首 / 行尾 separator 或错误窗口尺寸。每行仍保持 Button 的 40×40pt 外盒和 8pt Button gap。

资源限制分别计算：horizontal 最多 32 个 Button、63 个 total item；vertical 最多 5 个 Button、9 个 total item。63 与 9 分别来自 `2 × MaxButtons - 1`，即每两个相邻 action group 之间至多一个结构边界；不能通过无限 Separator / Spacer 绕过 compact toolbar 限制。

没有 `addGroup(title)`：调用方只需用顺序和 Separator / Spacer 表达边界。可见的 `──── 订单操作 ────`、文本 label block 或任何 group title 会把 icon-first toolbar 发展成第二个 UI framework，应使用 `ui.createWindow()`。本版本同样不实现 Button badge / indicator；未来它若需要，应是 Button presentation state，而不是新的结构 item。

`FloatingWindow` 的按钮正文始终只有图标，因此 `label` 是按钮文字的单一来源：每个按钮都会把它显示为原生 tooltip，并同时用作 macOS Accessibility name。无需再传一份容易与 `label` 不一致的 tooltip 文案；需要修改提示时调用 `updateButton(id, { label })`，原生 tooltip 与 Accessibility name 会在同一次更新中同步变化。`ui.createWindow()` 中自行声明的 HTML 按钮不走这套映射，可按 HTML 标准分别使用可见文字、`title` tooltip 与 `aria-label`。

内置图标注册表当前提供 **160** 个常用图标键，覆盖播放/导航、通信/人员、媒体/编辑、文件/数据和设备/状态。除了直接使用 SF Symbol 名称（例如 `arrow.clockwise`、`envelope.fill`、`camera.fill`、`doc.text.fill`、`chart.line.uptrend.xyaxis` 或 `wifi`），还提供十个面向主流工作流的语义键：`ai.*` 处理 AI 协作，`automation.*` 处理无人值守与人工介入流程。编辑器会通过 `ClawdeskFloatingIconKey` 提供完整补全。完整图标清单由同一注册表生成类型、Go 与 macOS host 映射；远程 URL、`javascript:`、越出脚本目录的路径及未注册内置名称一律以带 `capability: "icon"` 的 `INVALID_SPEC` 拒绝。

### 按主流场景选择默认图标

| 场景 | 首选键 | 当前审核的 SF Symbol | 适用边界 |
| --- | --- | --- | --- |
| AI 助手 / Agent 入口 | `ai.assistant` | `brain` | 打开助手、对话或 Agent 面板；不表示已经执行。 |
| AI 生成 / 改写 | `ai.generate` | `wand.and.rays` | 生成、摘要、润色或转换内容。 |
| AI 分析 / 文档理解 | `ai.analyze` | `doc.text.magnifyingglass` | 分析文档、提取结构或解释内容。 |
| AI 检索 / 问答 | `ai.search` | `text.magnifyingglass` | 语义搜索、提问和资料定位。 |
| 全自动运行 | `automation.run` | `arrow.triangle.2.circlepath` | 已配置、可无人值守的工作流；开始/停止仍应给出独立状态。 |
| 定时自动化 | `automation.schedule` | `clock.arrow.circlepath` | 计划任务、轮询和周期执行。 |
| 自动化触发 | `automation.trigger` | `bolt.circle.fill` | 事件触发、Webhook 或快捷启动。 |
| 自动化配置 | `automation.configure` | `gearshape.2.fill` | 编辑工作流或规则，不表示执行。 |
| 半自动：人工审阅 | `automation.review` | `rectangle.and.hand.point.up.left.fill` | 自动处理到人工检查点；避免误用为“自动批准”。 |
| 半自动：人工批准 | `automation.approve` | `hand.tap.fill` | 明确需要用户确认后才能继续的步骤。 |

语义键是受控的产品级别别名，稳定映射到当前审核的 SF Symbol；它们让业务代码表达意图，而不是让用户从近似的图形里猜测。`label` 仍必须写清真实动作，例如“运行日报工作流”“等待人工批准”，不能只写“自动化”。

### 查找和试用全部内置图标

从仓库根目录运行图标目录示例：

```bash
./opendesk -ui -script examples/custom-ui/icon-list.js -console-mode script -log-dir .runtime/examples/custom-ui/icon-list
```

示例直接读取唯一注册表 `pkg/customui/assets/toolbar-icons-v1.json`，不会维护第二份图标名称。它使用 `ui.createWindow()` 打开一个受限、可滚动的真实 Runtime 窗口，初始位于左上安全区域且仍可拖动；配套的 `examples/custom-ui/icon-list.html` 在同一个控件树中一次声明全部 160 个图标按钮，固定按每行 10 个、共 16 行排列，不存在翻页，也不再用 30/32 个 `FloatingWindow` 槽位冒充完整目录。controller 会在显示前检查 `panel.controls()` 中恰好存在 160 个、顺序与注册表一致的 button。

这里使用 `ui.createWindow()` 是因为 `FloatingWindow` 的 32 按钮上限属于简单原生工具栏的安全契约，不应为了目录场景放宽。目录图片由当前 macOS 根据注册表中的同一 SF Symbol recipe 生成，并作为受限 base64 PNG 内嵌；HTML 不包含业务 `<script>`，160 个 click listener、剪贴板调用和可见状态更新仍全部由 `icon-list.js` 的 Runtime controller 持有。

每个按钮都以紧凑卡片显示较小图标与名称；编号和“点击复制代码”不重复铺在每张卡片上，而是保留在 DOM 的稳定 id / index 与完整 `title` / `aria-label` 中。完整提示仍使用“`图标名 · 点击复制按钮代码`”，实际 host 还会为 WebView button 同步原生 AXButton peer。点击图标会直接把以下一行代码写入系统剪贴板，将当前卡片显示为绿色选中状态，并在固定状态栏显示“已复制”作为成功反馈：

```js
toolbar.addButton("icon-camera-fill", "动作说明", "camera.fill", () => {});
```

复制使用稳定的 [`clipboard.copy()`](clipboard.md#clipboardcopytext写入文本)。控制台还会输出 `CUSTOM_UI_ICON_COPIED`，分别保留唯一 `id`、`icon`、`usage`、注册表序号和总数，便于自动化或日志检查。剪贴板写入失败时，固定状态栏和 `CUSTOM_UI_ICON_LIST_ERROR` 会显示失败，不会打印虚假的成功记录。

如果主要目的是查找、复制或保存图标名称，直接打开仓库内长期保存的自包含图鉴：

[打开 `docs/custom-ui/icon-list.html`](../custom-ui/icon-list.html)。

它默认以大图模式显示，支持切换紧凑模式、名称搜索、点击复制图标名、复制完整 `addButton()` 用法、复制全部名称以及保存 JSON。HTML 内的 160 个图像由 macOS 根据同一注册表生成并以内联 data image 保存，因此移动单个 HTML 文件也能离线使用，不依赖 `.runtime/` 或另外 160 张图片。

维护者需要重新渲染和检查时，从仓库根目录运行：

```bash
bash scripts/render_custom_ui_icon_catalog.sh
```

临时结果位于 `.runtime/tests/custom-ui/icon-list/`：`index.html` 是浏览器图鉴，`runtime-window.html` 是无业务脚本的受限 Runtime 视图，`contact-sheet.png` 用于快速视觉检查，`manifest.json` 记录系统版本和实际渲染数量。确认 160 个图标都正确后，再显式发布正式 HTML：

```bash
bash scripts/render_custom_ui_icon_catalog.sh --publish
```

命令会同时更新 `docs/custom-ui/icon-list.html` 和 `examples/custom-ui/icon-list.html`；两者都是生成并提交的资产，名称仍来自唯一注册表，没有第二份手写清单。`.runtime/` 只是可随时删除和重新生成的维护证据。

`docs/custom-ui/icon-list.html` 是浏览器选型工具；`examples/custom-ui/icon-list.html` 只有通过 `icon-list.js` 加载时才构成真实 Runtime Custom UI。浏览器 HTML 成功不能替代 Runtime callback、Accessibility、剪贴板、滚动和窗口生命周期验收。

最小使用方式仍然是直接传入内置名称：

```js
const toolbar = new FloatingWindow({ x: 100, y: 100 });
toolbar.addButton("save", "保存", "tray.and.arrow.down.fill", () => {
  console.log("save");
});
await toolbar.show();
await toolbar.waitUntilClosed();
```

### 用户自定义按钮图标

`FloatingWindow.addButton()` 和 `updateButton()` 可通过 `{path, renderingMode?}` 接收脚本目录内的 PNG/JPEG 路径。string 始终保留给内置图标键，所以不要把 `"./icon.png"` 当成 icon string；应传 `{path:"./icon.png"}`，这样不会把文件路径和未来新增的内置名称混为一谈。相对路径以**执行中的 `.js` 文件所在目录**为根；绝对路径也必须解析到这个目录之内。推荐使用相对路径，示例从仓库根目录直接运行时仍按脚本位置解析：

```js
const toolbar = new FloatingWindow({
  position: { mode: "anchor", horizontal: "right", vertical: "center", margin: 16 }
});

// original（默认）保留品牌图片原色。
toolbar.addButton("brand", "打开品牌助手", {
  path: "./icons/brand-assistant.png"
}, () => console.log("brand assistant"));

// template 使用图片 alpha 轮廓，并跟随 disabled/error 等原生状态着色。
toolbar.addButton("approve", "人工批准", {
  path: "./icons/approve.png",
  renderingMode: "template"
}, () => console.log("approve"));

// 内置图标名称仍保持兼容，也可在显示前后切换图标来源。
toolbar.addButton("settings", "设置", "gearshape.fill");
await toolbar.updateButton("settings", {
  icon: { path: "./icons/settings.png", renderingMode: "template" }
});

await toolbar.show();
await toolbar.waitUntilClosed();
```

安全与资源边界：

- 只接受扩展名和真实内容一致的 `.png`、`.jpg`、`.jpeg`；不接受 SVG、GIF、WebP、BMP、ICO、data URL、`file:` URL 或远程 URL。
- 单张图片为 1–524288 bytes，宽高各为 1–1024 pixels；一个工具栏的自定义图片数据合计不超过 4194304 bytes。
- `..` 目录穿越和解析后逃出脚本目录的符号链接会被拒绝。Runtime 读取并验证图片后，只把受限的 base64 raster payload 交给 native host；原始路径不会跨进程传递，host 还会独立校验格式、尺寸和总量。
- `original` 保留原色，disabled 时降低透明度；`template` 适合单色 alpha mask，会使用与内置图标一致的 disabled/error tint。所有图片仍在固定 40×40pt 按钮中等比缩放到最多 22×22pt，不会改变工具栏布局。

若需要 GIF/WebP、可见文字、不同图片尺寸或更自由的组合布局，继续使用 `ui.createWindow()` 中受限的 `img`；它的本地图片仍必须位于脚本目录 / `content.basePath` 内。

## `toolbar`：状态、事件与生命周期

| 方法 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `addButton(id, label, icon, callback?)` | 见上表 | `void` | 增加有序图标按钮。 |
| `addSeparator(id)` | 严格 item id | `void` | 增加非交互的 native 分割线；只允许在相邻 Button group 之间。 |
| `addSpacer(id)` | 严格 item id | `void` | 增加固定 8pt group gap；不是 flexible space。 |
| `removeButton(id)` | `id: string` | `void` | 在首次 `show()` 前删除按钮及其相邻 separator/spacer，避免留下无效边界；不存在时返回 `NOT_FOUND`。 |
| `updateButton(id, patch)` | `id: string`、见下表 | `Promise<ButtonState>` | 更新非结构状态；显示前后都可调用。 |
| `getButtonState(id)` | `id: string` | `Promise<ButtonState>` | 返回逻辑状态及 local/screen bounds。 |
| `onButtonClick(id, callback)` | `id: string`、callback | `void` | 为已声明按钮绑定或替换 callback。 |
| `onError(callback)` | `(error) => unknown \| Promise<unknown>` | `void` | 接收 callback 失败的结构化错误。 |
| `show()` | 无 | `Promise<WindowState>` | 创建或显示原生工具栏；至少需要一个按钮。 |
| `hide()` | 无 | `Promise<WindowState \| null>` | 隐藏工具栏。 |
| `close()` | 无 | `Promise<WindowState \| null>` | 关闭工具栏并释放资源。 |
| `getState()` | 无 | `Promise<WindowState>` | 读取统一 WindowState；首次 show 前返回完整、已闭合声明的 hidden state。 |
| `setPosition(x, y)` | 两个有限 number | `Promise<Bounds \| WindowState>` | 移动原生顶层窗口。 |
| `setPlacement(placement)` | 见“窗口停靠与对齐” | `Promise<Placement \| WindowState>` | 创建前可保存 `active` / `primary` anchor；创建后按目标显示器工作区重新定位，`current` 仅在此时可用。 |
| `setAlwaysOnTop(enabled)` | `enabled: boolean` | `Promise<boolean \| WindowState>` | 设置真实原生窗口层级。 |
| `setDraggable(enabled)` | `enabled: boolean` | `Promise<WindowState>` | 运行时切换真实 native dragging，并返回 host readback。 |
| `on("move" \| "close", listener)` | listener | `() => void` | 监听 toolbars 的最小 lifecycle；返回取消订阅函数。 |
| `waitUntilClosed()` | 无 | `Promise<WindowState>` | 保持 Runtime 存活直到工具栏关闭。 |
| `run()` | 无 | `Promise<WindowState>` | 与 `waitUntilClosed()` 相同。 |

`patch` 必须至少包含一个字段，且不接受未知字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `icon` | 内置 icon 名称或 `{path, renderingMode?}` | 替换图标；自定义图片遵循上面的脚本目录、格式和资源限制。 |
| `label` | string | 按 `addButton()` 的 label 规则更新 tooltip 与 Accessibility name。 |
| `active` / `disabled` / `busy` | boolean | 更新对应视觉与交互状态。 |
| `error` | string / `null` | 设置错误状态；`null` 清除，字符串最多 2048 bytes。 |

`addButton()` 默认创建瞬时普通按钮，点击不会自动写入 `active`。只有“录制中”“当前模式”等需要持续表达的业务状态才应显式设置 `active: true`；复制、发送、刷新等一次性动作保留默认的 `active: false`，使用原生 pressed 和 callback 期间的 busy 反馈即可。

`ButtonState` 包含 `id`、`label`、`icon`、`active`、`disabled`、`busy`、`error`、单调递增的 `revision`、`renderedText`、`tooltip`、`tooltipVisible`、`iconPresentation`、`accessibilityName`、`localBounds` 与 `screenBounds`。`icon` 按原声明读回：内置图标为 string，自定义图标为不含图片 bytes 的 `{path, renderingMode}`；`iconPresentation.kind` 为 `builtIn` 或 `image`，图片 presentation 只公开 media type、像素尺寸和 rendering mode。工具栏始终是 icon-only，`renderedText` 为空字符串；`tooltip` 是 native host 实际应用的读回值，并与 `label` 一致；`tooltipVisible` 表示原生提示面板当前是否可见。

`getState()` 与 `ui.createWindow()` 的 `WindowHandle.getState()` 返回相同 `WindowState`：`status`、`visible`、`bounds`、`alwaysOnTop`、`draggable`、`revision`、`lastSequence`，以及 host 存在时的 `hostPid` / `nativeWindowId`、`onScreen`、`layer`、`alpha`。未 show 的 toolbar 没有 native identity，因此这些 host-only 字段为零值；anchor 初始位置也须等 native host 创建后才有实际屏幕坐标。

`move` 由 `setPosition()`、`setPlacement()` 或用户真实拖动后的 native window movement 发出；事件带实际 `bounds`。`close` 由 script close、native title-bar close 或 teardown 的终结路径最多发出一次，带 `reason: "script"` 或 `"user"`。Toolbar 不会把 position 自动写入 `AppStorage`：是否保存 / 恢复位置是应用层策略。

示例：

```js
const toolbar = new FloatingWindow({ x: 100, y: 100, theme: "dark" });
let running = false;

toolbar.addButton("startPause", "开始", "play.fill", async () => {
  if (running) await userActions.pause();
  else await userActions.start();
  running = !running;
  await toolbar.updateButton("startPause", running
    ? { icon: "pause.fill", label: "暂停", active: true }
    : { icon: "play.fill", label: "开始", active: false });
});

toolbar.addButton("stop", "停止", "stop.fill", async () => {
  await userActions.stop();
  running = false;
  await toolbar.updateButton("startPause", {
    icon: "play.fill", label: "开始", active: false
  });
});

toolbar.onError(error => console.error(error.code, error.targetId, error.message));
await toolbar.show();
await toolbar.waitUntilClosed();
```

每个按钮默认 single-flight：callback 未完成时进入 busy，同一按钮的重复点击不会再次启动，其他按钮仍可响应。callback 的同步返回值与 Promise 都会被等待；成功清除 busy。失败会先清除 busy、设置 error 视觉状态，再产生 `UI_CALLBACK_FAILED`，包含 `operation`、`windowId`、`targetId` 和 `capability`。用 `onError` 显式处理；用 `updateButton(id, { error: null })` 清除错误状态。normal、hover、pressed、active、disabled、busy、error 始终使用相同的 40×40pt 外盒。

## ui.createWindow：最小示例

```js
async function main() {
  const panel = await ui.createWindow({
    id: "helloPanel",
    kind: "floating",
    title: "Hello",
    bounds: { x: 160, y: 160, width: 440, height: 180 },
    alwaysOnTop: true,
    draggable: true,
    content: {
      html: `<!doctype html><html><head><meta charset="utf-8"></head><body>
        <header id="drag" data-clawdesk-drag>Custom UI</header>
        <button id="refresh">Refresh</button>
        <p id="status">Ready</p>
      </body></html>`,
      css: `body{font:14px -apple-system,sans-serif}button{padding:8px 12px}`
    }
  });

  panel.control("refresh").on("click", async () => {
    const info = System.getSystemInfo();
    await panel.control("status").update({ text: JSON.stringify(info) });
  });

  await panel.show();
  await panel.waitUntilClosed();
}

await main();
```

必须等待 `show()`。需要窗口继续存活时，再等待 `waitUntilClosed()`；不要用长时间 timer 或 sleep 维持示例。

## ui.createWindow：窗口声明

`ui.createWindow(spec)` 返回 `Promise<WindowHandle>`。声明的未知字段会被拒绝。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 必填；同一 execution 内唯一，匹配 `[A-Za-z][A-Za-z0-9_-]{0,63}` |
| `kind` | `normal` / `floating` | 默认 `normal` |
| `title` | string | 原生窗口标题；当 HTML 已提供可见标题时可传空字符串，避免重复文本（原生窗体按钮与边框仍保留）。 |
| `position` | discriminated union | 推荐且唯一的新声明形式：`{mode:"absolute",bounds}` 或 `{mode:"anchor",size,horizontal,vertical,margin?,display?}`。两个成员及顶层旧字段不能混用。 |
| `bounds` | `{x,y,width,height}` | 已发布绝对窗口 API 的兼容写法；不能和 `position`、`size` 或 `placement` 同时声明。新代码使用 `position.mode:"absolute"`。 |
| `size` | — | 顶层 `size` 已是废弃草案；移到 `position.mode:"anchor"` 内。 |
| `alwaysOnTop` | boolean | 是否使用真实置顶层级 |
| `draggable` | boolean | 是否启用带 `data-clawdesk-drag` 的拖动区；拖动区必须是带稳定 `id` 的受支持容器 |
| `placement` | — | 顶层 `placement` 已是废弃草案；移到 `position.mode:"anchor"` 内。初始 `display` 只接受 `active` / `primary`。 |
| `theme` | `system` / `dark` | 默认 `system`；FloatingWindow 固定使用 `dark` |
| `content` | object | 必填；受限 HTML/CSS、局部资源根目录与本地文件入口。字段、互斥规则见下表。 |

### `content` 参数

`content` 只能使用下列五个字段；未知字段不会被忽略，而是以 `INVALID_SPEC` 拒绝。表格按推荐的
`file`-first 写法排列：`file` 是清晰的首选文件入口，`html` 是内联内容或简写入口；二者是**互斥的
内容来源**，不是“同时提供时由 `file` 覆盖 `html`”的优先级关系。

| 字段 | 类型 | 是否必填 | 默认值 | 规则 |
| --- | --- | --- | --- | --- |
| `file` | string | 与 `html` 二选一 | — | **首选的显式文件入口**：只接受 HTML 路径字符串。路径可相对或绝对，但解析后的常规文件必须留在脚本目录内；文件内可写受限 `<style>`，也可使用同级 `css` 或 `cssFile`。 |
| `html` | string | 与 `file` 二选一 | — | 与 `css` 成对书写时的受限内联 HTML；也可简写为相对于**脚本目录**的 `.html` / `.htm` 文件路径。 |
| `css` | string | 否 | 空字符串 | 受限的内联 CSS。可与 `cssFile` 同时使用。 |
| `cssFile` | string | 否 | 无 | 从脚本目录内读取一份本地 CSS 文件；可相对或绝对，但必须是目录内的常规文件。 |
| `basePath` | string | 否 | 见下文 | 本地 `img src` 与 `control.update({source})` 的资源根目录；必须是脚本目录内已存在的目录。 |

以下结构无论名称看起来多像 Web API 都不是当前契约：`content.children`、`content.assets`、
`content.url`、`content.src` 以及任何远程资源字段。不要期望它们被兼容或静默忽略；应改用
`html` / `file`、`css` / `cssFile` 与受控的 `basePath`。

最小的内联内容写法如下。`html` 不是浏览器页面入口；其中不能写业务 `<script>` 或 inline
event handler，交互逻辑仍在外层 JavaScript 中通过 `panel.control(id).on(...)` 注册。

```js
const panel = await ui.createWindow({
  id: "inlinePanel",
  bounds: { x: 160, y: 160, width: 440, height: 220 },
  content: {
    html: `<!doctype html><html><head><meta charset="utf-8"></head><body>
      <main id="main"><button id="save">Save</button><span id="status">Ready</span></main>
    </body></html>`,
    css: `html,body{margin:0}main{padding:20px}button{padding:8px 12px}`
  }
});
```

文件内容推荐显式使用 `file`。**文件中的 HTML 自己就支持受限 `<style>`**，并且仍可叠加同级
`css` 与 `cssFile`；这三种 CSS 来源不是只为 `html` 字符串提供的字段。脚本与
`views/panel.html` 位于同一项目目录时，可以直接写：

```js
const panel = await ui.createWindow({
  id: "filePanel",
  title: "File-backed panel",
  bounds: { x: 160, y: 160, width: 440, height: 220 },
  content: {
    file: "./views/panel.html",
    css: `#status{font-weight:600}`,
    cssFile: "./views/panel.css"
  }
});
```

例如 `views/panel.html` 本身可以包含：

```html
<!doctype html>
<html><head><meta charset="utf-8">
  <style>#status { color: seagreen; }</style>
</head><body><main id="main"><span id="status">Ready</span></main></body></html>
```

因此 `file` 的 CSS 有三种来源：文件 HTML 的 `<style>`、同级 `content.css` 与同级
`content.cssFile`。这是和内联 `html` 完全相同的模型；最终层叠顺序为 `<style>` → `css` →
`cssFile`。不支持 `<link rel="stylesheet">`、CSS `@import` 或 CSS `url()`。

这里“`file` 支持 CSS”的准确含义不是把 CSS 嵌套进 `file` 对象：

```js
// 支持
content: { file: "./views/panel.html", css: "#status{color:green}" }

// 不支持：file 必须是路径字符串
content: { file: { html: "./views/panel.html", css: "#status{color:green}" } }
```

`file` 读到的字符串会先成为内部 `content.html`，再与内联 `html` 走完全相同的流程：解析受限
HTML、检查稳定 id 和本地资源、提取 `<style>`、合并 `css` / `cssFile`、校验 CSS，并生成稳定的
`controls()` 顺序。因此 `file` + `css`、`file` + `cssFile` 与 `file` + 两者同时存在都受支持。

若代码已经用相对 `.html` 路径表示内容来源，也可使用简写；在下例中，后续处理与上面的 `file`
写法相同：

```js
content: {
  html: "./views/panel.html",
  css: "#status{font-weight:600}",
  cssFile: "./views/panel.css"
}
```

仅“不含 `<` / `>` / 换行”且以 `.html` 或 `.htm` 结尾的**相对** `html` 值才会被当作文件路径读取；
`html: "/absolute/path/panel.html"` 不是文件简写。包含 HTML 标记的值始终是内联 HTML。要显示字面量
`panel.html`，请写 `<p>panel.html</p>`。`html` 与 `file` 同时提供、两者都缺失、空白字符串、文件不存在、
非普通文件、`..` 越界或 symlink 越界都会返回 `INVALID_SPEC`。

`basePath` 的默认值取决于内容来源：从 `html` 文件路径或 `file` 读取时，默认是该 HTML 文件所在目录；
内联 HTML 默认是脚本目录。显式 `basePath` 覆盖这一默认值。因此下例的图片解析为
`./views/images/ready.png`，而不是相对于当前工作目录：

```js
content: {
  html: '<main id="main"><img id="readyIcon" src="images/ready.png"><span id="status">Ready</span></main>',
  basePath: './views'
}
```

`<style>` 中的规则、`css` 与 `cssFile` 可以同时存在。创建时会先校验 HTML，再把 HTML 内的
`<style>` 提取到受限样式通道；最终层叠顺序为：HTML `<style>` → `css` → `cssFile`，因此相同选择器中
较后的来源可以覆盖较前的规则。所有三处 CSS 都拒绝 `url()`、`image-set()`、`@import`、CSS escape
和 `</style` 注入；不要用 CSS 加载图片。

本地图片只能通过 `img src` 或 `update({source})` 使用 `basePath` 内的 PNG、JPEG、GIF、WebP、BMP
或 ICO 文件。另可直接传入 base64 的 PNG、JPEG、GIF 或 WebP data image；远程 URL、`file:`、
`javascript:`、协议相对 URL、`srcset` 与文档导航均会被拒绝。

## ui.createWindow：HTML 与资源边界

允许的主要元素包括布局容器、文本、`button`、`input`、`select`、`option` 和 `img`。所有交互元素必须有稳定 `id`；可公开为七类控件的带 ID 元素按 DOM 前序形成稳定 `controls()` 顺序，重复 ID 返回 `DUPLICATE_ID`。`style`、`meta`、`option` 等非公开节点不能借 `id` 进入控件树。

公开拖动区使用 `data-clawdesk-drag`，且只能声明在带稳定 `id` 的 `div`、`section`、`main`、`header` 或 `footer` 容器上；属性值只能为空或 `true`。按钮、输入框等交互控件不能兼作拖动区。

当前明确禁止：

- `<script>` 和 HTML 内业务 JavaScript；
- `onclick` 等 inline event handler；
- `autofocus`；
- meta refresh 和除 `<meta charset="utf-8">` 以外的 meta；
- 后续 document navigation；
- 远程 URL、`file:`、`javascript:`、协议相对 URL；
- CSS `url()`、`image-set()`、`@import`、CSS escape 和 `</style` 注入；
- `srcset`；
- file/color/date 等未纳入支持范围的 input type，以及 multiple select；
- 脚本目录 / `basePath` 之外的本地资源。

图片可使用 `basePath` 内存在的 PNG、JPEG、GIF、WebP、BMP、ICO，或受限的 base64 raster data image。动态 `update({source})` 采用相同策略。

## ui：全局对象

| 方法 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `ui.getCapabilities()` | 无 | `Capabilities` | 同步读取当前 execution 的启用、平台、driver 和可用控件能力。 |
| `ui.createWindow(spec)` | `spec: WindowSpec` | `Promise<WindowHandle>` | 校验窗口声明并创建隐藏窗口。`WindowSpec` 见上文。 |
| `ui.closeAll()` | 无 | `Promise<void>` | 幂等关闭当前 execution 的所有窗口。 |
| `ui.on(type, listener)` | `type: EventType \| "*"`、`listener: (event) => void \| Promise<void>` | `() => void` | 监听当前 execution 的所有 Custom UI 事件；返回取消订阅函数。 |

`Capabilities` 的关键字段为：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `enabled` / `available` | boolean | 是否被当前 execution 授权、当前平台/host 是否可用。 |
| `activationSource` | `disabled` / `cli` / `projectConfig` / `httpRequest` | 授权来源。 |
| `platform` / `driver` | string | 当前平台和原生 driver。 |
| `window` | object | `position`、`placement`、`size`、`alwaysOnTop`、`draggable`、`nativeIdentity` 的支持情况。 |
| `controls` | string[] | 当前公开的控件类型。 |
| `reason` | string | 可选；不可用或未授权的原因。 |

macOS 上 `available` 还要求随包的 `clawdesk-ui-host` 可发现；缺失时创建窗口抛出 `UI_HOST_NOT_FOUND`。

## WindowHandle：窗口句柄

| 方法 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `controls()` | 无 | `{id,type,order}[]` | 返回稳定的公开控件顺序。 |
| `show()` / `hide()` / `close()` | 无 | `Promise<WindowState>` | 显示、隐藏或关闭原生窗口。 |
| `getState()` | 无 | `Promise<WindowState>` | 读取实际窗口状态。 |
| `setBounds(bounds)` | `bounds: {x,y,width,height}` | `Promise<WindowState>` | 同时设置位置和尺寸；宽高必须为正数。 |
| `setPosition(x, y)` | 两个有限 number | `Promise<WindowState>` | 设置窗口位置。 |
| `setPlacement(placement)` | 见“窗口停靠与对齐” | `Promise<WindowState>` | 按选中显示器的可用工作区重新停靠窗口。 |
| `setSize(width, height)` | 两个正 number | `Promise<WindowState>` | 设置窗口尺寸。 |
| `setAlwaysOnTop(enabled)` | `enabled: boolean` | `Promise<WindowState>` | 改变真实原生层级。 |
| `setDraggable(enabled)` | `enabled: boolean` | `Promise<WindowState>` | 动态启用或禁用拖动。 |
| `waitUntilClosed()` | 无 | `Promise<WindowState>` | 保持 Runtime 生命周期，直到用户或 controller 关闭窗口。 |
| `control(id)` | `id: string` | `ControlHandle` | 获取控件句柄；未知 id 返回 `NOT_FOUND`。 |
| `on(type, listener)` | `type: EventType \| "*"`、`listener` | `() => void` | 仅监听此窗口的事件；返回取消订阅函数。 |

`floating` 窗口使用 nonactivating panel。`show()` 只有在 WindowServer 报告 `onScreen=true` 且 `alpha>0` 后 resolve，并且不会主动取得键盘焦点。`setBounds()` 与 `setPlacement()` 都只有在 WindowServer 的实际边界匹配后 resolve。

`close()` 是终止操作：关闭后不得再通过原 `WindowHandle` 或其
`ControlHandle` 调用 `show()`、`update()` 等方法；它们会返回 `NOT_FOUND` 或
`INVALID_STATE`。需要在同一 execution 中再次打开独立工作台时，应在 `close`
事件中清除保存的句柄，然后用新的 window id 调用 `ui.createWindow()` 创建新的
窗口。window id 在同一 execution 内始终唯一，已经 `close()` 的 id 也不能复用；
复用会返回 `DUPLICATE_ID`。`hide()` 不终止窗口，适用于稍后以相同句柄 `show()`
的暂时收起场景。

`WindowState` 包含 `id`、`sessionId`、`status`（`creating` / `hidden` / `visible` / `closing` / `closed` / `failed`）、`visible`、`bounds`、`alwaysOnTop`、`draggable`、可选的 `hostPid` / `nativeWindowId`、以及 `onScreen`、`layer`、`alpha`、`revision`、`lastSequence`。

## ControlHandle：控件句柄

```js
const save = panel.control("save");
const state = await save.getState();
await save.update({ text: "Saving...", disabled: true });
const unsubscribe = save.on("click", event => console.log(event));
unsubscribe();
```

| 方法 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `getState()` | 无 | `Promise<ControlState>` | 返回控件 id、type、状态、bounds 和类型相关值。 |
| `update(patch)` | `patch: ControlPatch` | `Promise<ControlState>` | 更新声明允许的非结构状态。 |
| `on(type, listener)` | `type: EventType \| "*"`、`listener` | `() => void` | 监听这个控件的事件；返回取消订阅函数。 |

`ControlPatch` 支持：

| 字段 | 类型 | 允许的控件 | 说明 |
| --- | --- | --- | --- |
| `text` | string | button / text | 容器文本更新会破坏稳定控件树，因此不支持。 |
| `icon` | 内置 icon 名称 | button | 低层 `ControlHandle.update()` 只接受 160 个内置键；`FloatingWindow` 请使用 `updateButton()`，它也接受受限图片对象。 |
| `active` / `busy` | boolean | button | 同步更新 Accessibility 属性和视觉状态。 |
| `error` | string | button | 空字符串清除错误状态。 |
| `value` | unknown | input / select | 设置当前值。 |
| `checked` | boolean | checkbox input / switch | 设置选中状态。 |
| `disabled` | boolean | button / input / select / switch | 禁用或启用控件。 |
| `visible` | boolean | 公开控件 | 显示或隐藏控件。 |
| `classes` | string[] | 公开控件 | 更新受限样式 class。 |
| `source` | string | img | 只能解析 `content.basePath` 内的本地资源。 |
| `options` | `{value,label}[]` | select | 替换选择项。 |

空 patch、未知字段或控件类型不支持的字段不会静默忽略；会返回 `INVALID_SPEC` 或 `UNSUPPORTED_CAPABILITY`。

## ui.on：事件

公开事件为 `click`、`change`、`input`、`move`、`resize`、`close`，监听器也可以用 `*`。未知拼写会立即返回 `INVALID_SPEC`。

事件包含 `sessionId`、`windowId`、可选 `targetId`、`type`、单调 `sequence`、`timestamp`，以及相应的 `value`、`checked`、`bounds` 或 `reason`。

事件队列有界。只有 `input`、`move`、`resize` 可以在不跨越 click/change/close 屏障时合并；click/change/close 不会静默丢失。队列满时 execution 以 `UI_EVENT_QUEUE_OVERFLOW` 失败。

## Custom UI：错误

Custom UI 错误保留下列字段：

```js
try {
  await panel.control("photo").update({ source: "https://example.com/a.png" });
} catch (error) {
  console.error(JSON.stringify({
    code: error.code,
    operation: error.operation,
    windowId: error.windowId,
    targetId: error.targetId,
    capability: error.capability,
    message: error.message
  }));
}
```

| 错误码 | 常见原因 |
| --- | --- |
| `UI_DISABLED` | execution 没有 UI 授权。 |
| `UNSUPPORTED_PLATFORM` / `UNSUPPORTED_CAPABILITY` | 当前平台、host 或控件能力不支持请求。 |
| `INVALID_SPEC` | `FloatingWindow.constructor`、`addButton`、`createWindow` 或 update 参数不合法。 |
| `DUPLICATE_ID` / `NOT_FOUND` | 重复声明 id（包括同一 execution 中已关闭窗口的 id），或请求不存在的窗口/控件/按钮。 |
| `INVALID_STATE` / `UI_BUSY` / `UI_CANCELED` | 在错误生命周期阶段操作、创建进行中或 execution 被取消。 |
| `UI_EVENT_QUEUE_OVERFLOW` / `UI_DRIVER_FAILURE` / `UI_HOST_NOT_FOUND` | 事件队列、native driver 或原生 host 失败。 |
| `UI_CALLBACK_FAILED` | 按钮 callback 抛错或拒绝；注册 `toolbar.onError()` 可处理。 |

## ui / WindowHandle：生命周期

- 所有 JavaScript callback 只在 EventLoop owner 上调用；原生 / driver goroutine 不直接触碰 Goja。
- FloatingWindow callback 的同步值和 Promise 都在 owner loop 中接续；每个按钮有独立 single-flight，其他按钮不会被锁住。
- `waitUntilClosed()` 会保持 execution 存活。
- 脚本异常、timeout、HTTP cancel、server shutdown 和未等待的脚本结束都会清理窗口、listener、pending callback 与 host process。
- `close()`、`closeAll()` 和 execution teardown 是幂等的。

## ui：HTTP 模式

HTTP UI 必须同时满足：服务器用 `-ui` 或可信本地配置启用、单次请求包含 `"capabilities":["ui"]`、请求来自 loopback。任一条件失败都会返回明确 403；`X-Forwarded-For` 不会绕过 socket 来源检查。详见 [HTTP Server API](http-server.md)。

## ui：示例

- `examples/custom-ui/panel.js`
- `examples/custom-ui/form.js`
- `examples/custom-ui/recording-console.js`：默认是小型 `recording-console/tray.html` 托盘；点“展开”才显示 `recording-console/recorder.html` 设置页。HTML 只声明受限结构和稳定 id，CSS 与 JavaScript controller 分离；它使用空的原生 `title`，因此 HTML header 是唯一可见标题。录制会话本身仍必须由 [Recorder MCP API](recorder.md) 创建，不能由 HTML 或 Runtime 直接绕过。
- `examples/custom-ui/floating-recording-toolbar.js`
- `examples/custom-ui/floating-toolbar-primitives.js`：Button + Separator + fixed Spacer、统一 `getState()` 与 `move` / `close` lifecycle 的最小 native toolbar 示例；不保存位置，也不拥有 global shortcut。
- `examples/custom-ui/custom-image-icons.js`：同一个 `FloatingWindow` 中组合原色 PNG、template PNG 与内置图标，展示脚本相对路径和动态图标切换。
- `examples/custom-ui/icon-list.js` 与 `icon-list.html`：在一个可滚动的真实 Runtime 窗口中声明全部 160 个默认图标按钮；其中 `ai.*` 与 `automation.*` 为 AI、全自动和半自动场景提供直接可发现的语义键，悬停查看名称与复制提示，点击直接复制一行 `addButton()` 代码。
- `docs/custom-ui/icon-list.html`：提交到仓库的自包含浏览器图鉴，可长期查找、复制和离线保存，不依赖 `.runtime/`。
- `scripts/render_custom_ui_icon_catalog.sh`：从唯一注册表生成浏览器 HTML、受限 Runtime HTML、联系表与渲染 manifest；默认写入 `.runtime/tests/custom-ui/icon-list/` 供检查，只有 `--publish` 才更新两个正式图鉴。
- `examples/custom-ui/floating-toolbar-wrap-demo.js` 及其 `floating-toolbar-wrap-demo.json`：同时显示 `maxWidth` 自动换行、两列与最多两行的可交互原生工具栏；从仓库根目录运行 `./opendesk -ui -script examples/custom-ui/floating-toolbar-wrap-demo.js -console-mode script -log-dir .runtime/examples/custom-ui/floating-toolbar-wrap-demo`，可编辑 JSON 比较其他限制，点击图标可切换 active 状态，关闭三个窗口结束示例。
- `examples/custom-ui/five-button-toolbar.js`：推荐的独立 Button-first 五按钮示例，只使用公开的 `new FloatingWindow()`、`addButton()` 和 `updateButton()`；从仓库根目录执行 `./opendesk -ui -script examples/custom-ui/five-button-toolbar.js -console-mode script -log-dir .runtime/examples/custom-ui/five-button-toolbar`。
- `examples/custom-ui/toolbar-example.js`：横向 actions 示例使用的 `FloatingWindow` controller
- `examples/custom-ui/toolbar-horizontal-actions.js`：用 JavaScript 变量声明横向按钮和可替换的 action handlers
- `examples/custom-ui/toolbar-vertical-quick-replies.js`：读取相邻 JSON 数据、使用纵向五按钮快捷回复的 controller
- `examples/custom-ui/toolbar-vertical-quick-replies.json`：客服回复文案、按钮声明顺序、纵向内部布局和右侧居中窗口 `position.mode:"anchor"` 的数据源
横向按钮与业务回调见 `examples/custom-ui/toolbar-horizontal-actions.js`；客服纵向快捷回复见 `examples/custom-ui/toolbar-vertical-quick-replies.js` 及其 JSON 数据文件。该示例通过框架 anchor position 在活动显示器工作区右侧垂直居中，并保留 16pt 边距；没有业务坐标计算。快捷回复是普通动作按钮：点击复制文案，但不会进入持久 `active` 选中态。普通用户从仓库根目录执行 `./opendesk -ui -script examples/custom-ui/toolbar-vertical-quick-replies.js -console-mode script -log-dir .runtime/examples/custom-ui/toolbar-vertical-quick-replies`，窗口不会自动关闭，用户可真实点击按钮后关闭。若 callback 未执行，按所运行示例检查 `FIVE_BUTTON_TOOLBAR_ACTION`、`HORIZONTAL_TOOLBAR_ACTION` 或 `VERTICAL_QUICK_REPLY_COPIED` 日志；对应的 `*_ERROR` 会提供 `UI_CALLBACK_FAILED` 的 `operation/windowId/targetId/capability`。原生 single-flight、Accessibility 与截图证据由正式 custom-ui gate 生成。

## ui：实现边界

用户事件按以下内部链路回到所属 JavaScript Runtime：

```text
DOM / WKWebView event
  -> native host
  -> bounded Go event queue
  -> EventLoop.RunOnLoop
  -> Goja listener
  -> OpenDesk Runtime API
```

该链路用于说明事件所有权和故障排查；普通脚本只应依赖本页列出的 `ui`、
`WindowHandle` 与 `ControlHandle` 契约。
