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
| 1–32 个简单图标操作按钮 | `new FloatingWindow(options)` | 需要可见文本、表单、任意 HTML/CSS 或动态控件树 |
| 表单、受限 HTML/CSS 或动态控件树 | `ui.createWindow(spec)` | 仅需图标工具栏 |

## Custom UI：启用方式

`ui` 全局始终存在，但默认 dormant。未授权的 `createWindow()`、`closeAll()` 或 `on()` 会抛出 `UI_DISABLED`。

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

命令行入口：

```bash
# 强制启用
./opendesk -ui -script examples/custom-ui/panel.js -console-mode script

# 强制禁用
./opendesk -no-ui -script examples/custom-ui/panel.js -console-mode script

# 使用指定配置
./opendesk -config examples/custom-ui/clawdesk.runtime.json -script examples/custom-ui/panel.js -console-mode script
```

优先级从高到低为：

1. `-no-ui`
2. `-ui`
3. `-config <path>`
4. 本地脚本同目录的 `clawdesk.runtime.json`
5. 默认禁用

双击 / `tm.config.js` 模式改为从工作目录查找固定配置。`-ui-host` 只用于内部开发验收，不属于项目配置或普通用户 API。

可以同时从两个位置观察启用来源：

```js
console.log(ui.getCapabilities().activationSource);
console.log(Execution.activationSource);
```

值为 `disabled`、`cli`、`projectConfig` 或 `httpRequest`。

## FloatingWindow：浮动工具栏

**状态：Conditional / Native**

`FloatingWindow` 用于声明简单图标工具栏；它通过结构化 `ToolbarSpec/ButtonSpec/ButtonState` 直接创建 AppKit Toolbar，不生成 HTML/CSS 或 WKWebView。复杂表单、任意受限 HTML/CSS 或动态控件树仍使用本页的 `ui.createWindow()`。两者共享 native driver、事件队列、`EventLoop.RunOnLoop`、结构化错误和生命周期清理，不引用或初始化 Fyne。只有 execution 已显式授权 UI 时才注入 `FloatingWindow`。

每个工具栏都通过 `new FloatingWindow(options?)` 创建；后续按钮和生命周期方法只在该实例上调用：

```js
const toolbar = new FloatingWindow({ x: 100, y: 100, theme: "dark" });
```

## `new FloatingWindow(options?)`

| 参数 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `x` | number | `100` | 左上角横坐标；必须是有限数字。 |
| `y` | number | `100` | 左上角纵坐标；必须是有限数字。 |
| `theme` | `"dark"` | `"dark"` | 当前仅支持 dark；其他值返回 `INVALID_SPEC`。 |
| `title` | string | `"Toolbar"` | 原生窗口标题，最多 128 个 Unicode 字符。 |
| `alwaysOnTop` | boolean | `true` | 是否使用原生置顶层级。 |
| `draggable` | boolean | `true` | 是否允许拖动原生窗口。 |
| `orientation` | `"horizontal"` / `"vertical"` | `"horizontal"` | horizontal 最多 32 个按钮；vertical 最多 5 个按钮。 |
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

首次 `show()` 前必须按声明顺序添加按钮。未提供 `toolbar` 时，horizontal 的安全宽度上限仍为 960pt；vertical 在单列中从上至下排列，固定宽 60pt，五个按钮时高 273pt（含原生标题栏）。布局不会改变调用方给出的 `x/y`。

## `toolbar.addButton(id, label, icon, callback?)`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 必填；匹配 `[A-Za-z][A-Za-z0-9_-]{0,63}`，同一工具栏内唯一。 |
| `label` | string | 必填，1–60 个 Unicode 字符；作为 tooltip、macOS Accessibility name 和调试证据，不显示在图标按钮正文。 |
| `icon` | string | 必填；150 个经过审核的内置 SF Symbols 之一。 |
| `callback` | `(event) => unknown \| Promise<unknown>` | 可选；接收 `click` 事件，可同步返回或返回 Promise。 |

按钮只能在首次 `show()` 前增加或删除。重复 id 返回 `DUPLICATE_ID`；无效 id、label、icon、callback 或超出按钮数返回 `INVALID_SPEC`。

`FloatingWindow` 的按钮正文始终只有图标，因此 `label` 是按钮文字的单一来源：每个按钮都会把它显示为原生 tooltip，并同时用作 macOS Accessibility name。无需再传一份容易与 `label` 不一致的 tooltip 文案；需要修改提示时调用 `updateButton(id, { label })`，原生 tooltip 与 Accessibility name 会在同一次更新中同步变化。`ui.createWindow()` 中自行声明的 HTML 按钮不走这套映射，可按 HTML 标准分别使用可见文字、`title` tooltip 与 `aria-label`。

内置图标注册表当前提供 **150** 个常用 SF Symbols，覆盖播放/导航、通信/人员、媒体/编辑、文件/数据和设备/状态等场景。直接传入名称，例如 `arrow.clockwise`、`envelope.fill`、`camera.fill`、`doc.text.fill`、`chart.line.uptrend.xyaxis` 或 `wifi`；编辑器会通过 `ClawdeskFloatingIcon` 提供完整补全。完整图标清单由同一注册表生成类型、Go 与 macOS host 映射；远程 URL、`javascript:`、项目文件路径及未注册名称一律以带 `capability: "icon"` 的 `INVALID_SPEC` 拒绝。

### 查找和试用全部内置图标

从仓库根目录运行图标目录示例：

```bash
./dist/opendesk -ui -script examples/custom-ui/icon-catalog.js -console-mode script -log-dir .runtime/examples/custom-ui/icon-catalog
```

示例直接读取唯一注册表 `pkg/customui/assets/toolbar-icons-v1.json`，不会维护第二份图标名称。它使用 `ui.createWindow()` 打开一个受限、可滚动的真实 Runtime 窗口；配套的 `examples/custom-ui/icon-catalog.html` 在同一个控件树中一次声明全部 150 个图标按钮，固定按每行 10 个、共 15 行排列，不存在翻页，也不再用 30/32 个 `FloatingWindow` 槽位冒充完整目录。controller 会在显示前检查 `panel.controls()` 中恰好存在 150 个、顺序与注册表一致的 button。

这里使用 `ui.createWindow()` 是因为 `FloatingWindow` 的 32 按钮上限属于简单原生工具栏的安全契约，不应为了目录场景放宽。目录图片由当前 macOS 根据注册表中的同一 SF Symbol recipe 生成，并作为受限 base64 PNG 内嵌；HTML 不包含业务 `<script>`，150 个 click listener、剪贴板调用和可见状态更新仍全部由 `icon-catalog.js` 的 Runtime controller 持有。

每个按钮都显示图标与名称，并使用“`图标名 · 点击复制按钮代码`”作为完整 `title` / `aria-label`；实际 host 还会为 WebView button 同步原生 AXButton peer。点击图标会直接把以下一行代码写入系统剪贴板，将当前卡片显示为绿色选中状态，并在固定状态栏显示“已复制”作为成功反馈：

```js
toolbar.addButton("icon-camera-fill", "动作说明", "camera.fill", () => {});
```

复制使用稳定的 [`clipboard.copy()`](clipboard.md#clipboardcopytext写入文本)。控制台还会输出 `CUSTOM_UI_ICON_COPIED`，分别保留唯一 `id`、`icon`、`usage`、注册表序号和总数，便于自动化或日志检查。剪贴板写入失败时，固定状态栏和 `CUSTOM_UI_ICON_CATALOG_ERROR` 会显示失败，不会打印虚假的成功记录。

如果主要目的是查找、复制或保存图标名称，直接打开仓库内长期保存的自包含图鉴：

[打开 `docs/custom-ui/icon-catalog.html`](../custom-ui/icon-catalog.html)。

它默认以大图模式显示，支持切换紧凑模式、名称搜索、点击复制图标名、复制完整 `addButton()` 用法、复制全部名称以及保存 JSON。HTML 内的 150 个图像由 macOS 根据同一注册表生成并以内联 data image 保存，因此移动单个 HTML 文件也能离线使用，不依赖 `.runtime/` 或另外 150 张图片。

维护者需要重新渲染和检查时，从仓库根目录运行：

```bash
bash scripts/render_custom_ui_icon_catalog.sh
```

临时结果位于 `.runtime/tests/custom-ui/icon-catalog/`：`index.html` 是浏览器图鉴，`runtime-window.html` 是无业务脚本的受限 Runtime 视图，`contact-sheet.png` 用于快速视觉检查，`manifest.json` 记录系统版本和实际渲染数量。确认 150 个图标都正确后，再显式发布正式 HTML：

```bash
bash scripts/render_custom_ui_icon_catalog.sh --publish
```

命令会同时更新 `docs/custom-ui/icon-catalog.html` 和 `examples/custom-ui/icon-catalog.html`；两者都是生成并提交的资产，名称仍来自唯一注册表，没有第二份手写清单。`.runtime/` 只是可随时删除和重新生成的维护证据。

`docs/custom-ui/icon-catalog.html` 是浏览器选型工具；`examples/custom-ui/icon-catalog.html` 只有通过 `icon-catalog.js` 加载时才构成真实 Runtime Custom UI。浏览器 HTML 成功不能替代 Runtime callback、Accessibility、剪贴板、滚动和窗口生命周期验收。

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

`FloatingWindow` 当前只支持注册表内置图标，不接受自定义 PNG、SVG、URL 或文件路径。需要品牌或业务专用图标时，使用 `ui.createWindow()` 中受限制的 `img`；图片必须位于脚本目录 / `basePath` 内，或者是受限的 base64 raster data image。

```js
const panel = await ui.createWindow({
  id: "customIconButton",
  kind: "floating",
  title: "自定义按钮图标",
  bounds: { x: 160, y: 160, width: 220, height: 120 },
  content: {
    html: `<button id="save" class="icon-button" title="保存" aria-label="保存">
      <img id="saveIcon" src="./icons/save.png" alt="">
    </button>`,
    css: `.icon-button{width:44px;height:44px;padding:10px}
      .icon-button img{width:24px;height:24px;pointer-events:none}`
  }
});

panel.control("save").on("click", () => console.log("save"));
// 动态图标仍必须解析到同一个 basePath 内。
await panel.control("saveIcon").update({ source: "./icons/save-active.png" });
await panel.show();
await panel.waitUntilClosed();
```

本地自定义图片可使用 PNG、JPEG、GIF、WebP、BMP 或 ICO；base64 data image 仅接受 PNG、JPEG、GIF 或 WebP。SVG、远程 URL、`file:` URL、CSS `url()` 和越出 `basePath` 的路径均不支持。`pointer-events:none` 让图片点击继续由外层稳定 button id 接收。

## `toolbar`：状态、事件与生命周期

| 方法 | 参数 | 返回 | 说明 |
| --- | --- | --- | --- |
| `addButton(id, label, icon, callback?)` | 见上表 | `void` | 增加有序图标按钮。 |
| `removeButton(id)` | `id: string` | `void` | 在首次 `show()` 前删除按钮；不存在时返回 `NOT_FOUND`。 |
| `updateButton(id, patch)` | `id: string`、见下表 | `Promise<ButtonState>` | 更新非结构状态；显示前后都可调用。 |
| `getButtonState(id)` | `id: string` | `Promise<ButtonState>` | 返回逻辑状态及 local/screen bounds。 |
| `onButtonClick(id, callback)` | `id: string`、callback | `void` | 为已声明按钮绑定或替换 callback。 |
| `onError(callback)` | `(error) => unknown \| Promise<unknown>` | `void` | 接收 callback 失败的结构化错误。 |
| `show()` | 无 | `Promise<WindowState>` | 创建或显示原生工具栏；至少需要一个按钮。 |
| `hide()` | 无 | `Promise<WindowState \| null>` | 隐藏工具栏。 |
| `close()` | 无 | `Promise<WindowState \| null>` | 关闭工具栏并释放资源。 |
| `setPosition(x, y)` | 两个有限 number | `Promise<Bounds \| WindowState>` | 移动原生顶层窗口。 |
| `setAlwaysOnTop(enabled)` | `enabled: boolean` | `Promise<boolean \| WindowState>` | 设置真实原生窗口层级。 |
| `waitUntilClosed()` | 无 | `Promise<WindowState>` | 保持 Runtime 存活直到工具栏关闭。 |
| `run()` | 无 | `Promise<WindowState>` | 与 `waitUntilClosed()` 相同。 |

`patch` 必须至少包含一个字段，且不接受未知字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `icon` | 内置 icon 名称 | 替换图标。 |
| `label` | string | 按 `addButton()` 的 label 规则更新 tooltip 与 Accessibility name。 |
| `active` / `disabled` / `busy` | boolean | 更新对应视觉与交互状态。 |
| `error` | string / `null` | 设置错误状态；`null` 清除，字符串最多 2048 bytes。 |

`ButtonState` 包含 `id`、`label`、`icon`、`active`、`disabled`、`busy`、`error`、单调递增的 `revision`、`renderedText`、`tooltip`、`tooltipVisible`、`iconPresentation`、`accessibilityName`、`localBounds` 与 `screenBounds`。工具栏始终是 icon-only，`renderedText` 为空字符串；`tooltip` 是 native host 实际应用的读回值，并与 `label` 一致；`tooltipVisible` 表示原生提示面板当前是否可见。

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
| `bounds` | `{x,y,width,height}` | 必填；宽高必须为正数 |
| `alwaysOnTop` | boolean | 是否使用真实置顶层级 |
| `draggable` | boolean | 是否启用带 `data-clawdesk-drag` 的拖动区；拖动区必须是带稳定 `id` 的受支持容器 |
| `theme` | `system` / `dark` | 默认 `system`；FloatingWindow 固定使用 `dark` |
| `content` | object | HTML/CSS 内容 |

`content` 必须恰好提供一个：

- `html`：内联受限 HTML；也可传入相对于脚本目录的 `.html` / `.htm` 文件路径；
- `file`：脚本目录内的本地 HTML 文件的显式写法。

例如，脚本与 `views/panel.html` 位于同一项目目录时，可以直接写：

```js
const panel = await ui.createWindow({
  id: "filePanel",
  title: "File-backed panel",
  bounds: { x: 160, y: 160, width: 440, height: 220 },
  content: {
    html: "./views/panel.html",
    cssFile: "./views/panel.css"
  }
});
```

仅不包含 HTML 标记、且以 `.html` 或 `.htm` 结尾的**相对** `html` 值会被当作文件路径读取；包含 `<` 的值始终是内联 HTML。文件不存在或越出脚本目录会以 `INVALID_SPEC` 拒绝；要显示字面量 `panel.html`，请使用 `<p>panel.html</p>` 等 HTML 标记。使用 `content.file` 时仍可传入留在脚本目录内的绝对路径。

可附加 `css` 或脚本目录内的 `cssFile`。也可以把一个或多个受限 `<style>` 块直接写进本地 HTML 文件：创建时 host 会先按完整 HTML 的安全规则校验它们，再自动提取为 `content.css`，并从最终交给 WebView 的 `content.html` 移除。提取的 CSS 保持在调用方 `css` / `cssFile` 之前，因此后两者仍可覆盖同名规则；HTML 文件就是这种写法的唯一源码。

从 `html` 文件路径或 `file` 读取时，未显式设置的 `basePath` 默认为该 HTML 文件所在目录；内联 HTML 默认使用脚本目录。`basePath` 只能指向脚本目录内部，用于解析本地图片。相对路径或绝对路径都必须留在脚本目录内；`..` 和 symlink 越界都会被拒绝。

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
| `window` | object | `position`、`size`、`alwaysOnTop`、`draggable`、`nativeIdentity` 的支持情况。 |
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
| `setSize(width, height)` | 两个正 number | `Promise<WindowState>` | 设置窗口尺寸。 |
| `setAlwaysOnTop(enabled)` | `enabled: boolean` | `Promise<WindowState>` | 改变真实原生层级。 |
| `setDraggable(enabled)` | `enabled: boolean` | `Promise<WindowState>` | 动态启用或禁用拖动。 |
| `waitUntilClosed()` | 无 | `Promise<WindowState>` | 保持 Runtime 生命周期，直到用户或 controller 关闭窗口。 |
| `control(id)` | `id: string` | `ControlHandle` | 获取控件句柄；未知 id 返回 `NOT_FOUND`。 |
| `on(type, listener)` | `type: EventType \| "*"`、`listener` | `() => void` | 仅监听此窗口的事件；返回取消订阅函数。 |

`floating` 窗口使用 nonactivating panel。`show()` 只有在 WindowServer 报告 `onScreen=true` 且 `alpha>0` 后 resolve，并且不会主动取得键盘焦点。`setBounds()` 只有在 WindowServer 的实际边界匹配后 resolve。

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
| `icon` | 内置 icon 名称 | button | 仅接受 FloatingWindow 的 150 个内置 icon。 |
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
- `examples/custom-ui/icon-catalog.js` 与 `icon-catalog.html`：在一个可滚动的真实 Runtime 窗口中声明全部 150 个图标按钮；悬停查看名称与复制提示，点击直接复制一行 `addButton()` 代码。
- `docs/custom-ui/icon-catalog.html`：提交到仓库的自包含浏览器图鉴，可长期查找、复制和离线保存，不依赖 `.runtime/`。
- `scripts/render_custom_ui_icon_catalog.sh`：从唯一注册表生成浏览器 HTML、受限 Runtime HTML、联系表与渲染 manifest；默认写入 `.runtime/tests/custom-ui/icon-catalog/` 供检查，只有 `--publish` 才更新两个正式图鉴。
- `examples/custom-ui/floating-toolbar-wrap-demo.js` 及其 `floating-toolbar-wrap-demo.json`：同时显示 `maxWidth` 自动换行、两列与最多两行的可交互原生工具栏；从仓库根目录运行 `./dist/opendesk -ui -script examples/custom-ui/floating-toolbar-wrap-demo.js -console-mode script -log-dir .runtime/examples/custom-ui/floating-toolbar-wrap-demo`，可编辑 JSON 比较其他限制，点击图标可切换 active 状态，关闭三个窗口结束示例。
- `examples/custom-ui/minimal-five-button-toolbar.js`：约 20 行的推荐 Button-first 五按钮示例
- `examples/custom-ui/toolbar-example.js`：横向和纵向示例共用的 `FloatingWindow` controller
- `examples/custom-ui/toolbar-horizontal-actions.js`：用 JavaScript 变量声明横向按钮和可替换的 action handlers
- `examples/custom-ui/toolbar-vertical-quick-replies.js`：读取相邻 JSON 数据、使用纵向五按钮快捷回复的 controller
- `examples/custom-ui/toolbar-vertical-quick-replies.json`：客服回复文案、按钮声明顺序和布局意图的数据源
横向按钮与业务回调见 `examples/custom-ui/toolbar-horizontal-actions.js`；客服纵向快捷回复见 `examples/custom-ui/toolbar-vertical-quick-replies.js` 及其 JSON 数据文件。普通用户从仓库根目录执行 `./dist/opendesk -ui -script examples/custom-ui/toolbar-vertical-quick-replies.js -console-mode script -log-dir .runtime/examples/custom-ui/toolbar-vertical-quick-replies`，窗口不会自动关闭，用户可真实点击按钮后关闭。若 callback 未执行，检查 `HORIZONTAL_TOOLBAR_ACTION` 或 `VERTICAL_QUICK_REPLY_SELECTED` 日志；`*_ERROR` 会提供 `UI_CALLBACK_FAILED` 的 `operation/windowId/targetId/capability`。原生 single-flight、Accessibility 与截图证据由正式 custom-ui gate 生成。

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
