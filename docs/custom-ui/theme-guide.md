---
title: Custom UI 主题与控件规范
description: 为 Custom UI 组件选择主题、组织 CSS，并处理 HTML 与原生控件的跨平台差异。
order: 2
---

# Custom UI 主题与控件规范

这份指南是组件作者的设计约定，不增加新的 Runtime API。API 的字段、错误和资源边界
以 [Custom UI API](../api/ui.md) 为准。

## 先选控件表面

| 目标 | 推荐 surface | 主题来源 | 适合的状态展示 |
| --- | --- | --- | --- |
| 结构化表单、卡片、滚动内容、可复用网页式组件 | `ui.createWindow()` | `system` 或 `dark` 加脚本 CSS token | button、input、select 的完整状态矩阵 |
| 紧凑工具栏、少量动作和固定宽度设置项 | `FloatingWindow` | 固定 `dark`，由 native host 绘制 | 原生 button、input、select 的 readback |
| 一次性的确认或短输入 | `Dialog` | host 主题 | host-owned 的确定/取消状态 |

HTML/CSS 和 FloatingWindow 不是同一套组件实现。需要复用组件视觉时复用 token、状态
命名和交互约定；需要复用 native 控件时复用 `FloatingWindow.add*()` 声明，不要试图把
CSS 注入 native toolbar。

## 主题约定

`ui.createWindow()` 支持 `system` 和 `dark`。`theme` 只在创建窗口时声明；它不会
自动生成 CSS 变量，也不能通过 `ControlHandle.update()` 运行时切换。推荐把颜色、
边框、圆角、间距和焦点环集中放在 `:root` token 中：

```css
:root {
  color-scheme: dark;
  --ui-bg: #0b1016;
  --ui-surface: #121820;
  --ui-surface-raised: #18212c;
  --ui-field: #0e151e;
  --ui-line: #293646;
  --ui-text: #f3f6fb;
  --ui-muted: #93a1b3;
  --ui-accent: #8ea7ff;
  --ui-danger: #f08c8c;
}
```

稳定的示例、截图和视觉回归使用 `theme: "dark"` 与显式 token。需要跟随系统外观时
使用 `theme: "system"`，把 `color-scheme: light dark` 作为浏览器控件提示，并为自定义
背景和文字提供浅色/深色规则。不要把浏览器的默认颜色当作设计 token，也不要把
`prefers-color-scheme` 的结果当作跨 host 的精确像素承诺。

`FloatingWindow` 始终是 dark native toolbar：按钮图标、输入框、选择器、slider 和
segmented control 使用平台 peer 的状态色。它不接受 `css`、`cssFile`、HTML、图片 URL
或 Web 字体；用声明的 `width`、`label`、`disabled`、`value`、`busy` 和 `badge` 表达
状态。

## CSS 来源与资源边界

推荐使用 file-first 内容，把结构和样式拆开：

```js
const panel = await ui.createWindow({
  id: "uiComponents",
  kind: "normal",
  theme: "dark",
  position: {
    mode: "anchor",
    size: { width: 760, height: 780 },
    horizontal: "center",
    vertical: "center",
    display: "active"
  },
  content: {
    file: "./ui-components/panel.html",
    cssFile: "./ui-components/panel.css"
  }
});
```

CSS 层叠顺序是 HTML `<style>` → `content.css` → `content.cssFile`。所有文件和图片
必须解析到脚本目录以内；禁止 `url()`、`image-set()`、`@import`、CSS escape、远程
stylesheet、远程图片、`srcset` 和 HTML 业务脚本。组件事件由外层 Runtime controller
绑定，HTML 只保留稳定 id 和语义结构。

推荐每个交互控件都具备：

- 默认状态：清晰的文字、边界和可操作性；
- hover/pressed 状态：只改变背景或边框，不改变尺寸；
- `:focus-visible` 状态：至少 2px 对比明显的 outline，并保留 offset；
- disabled 状态：降低对比度但仍可读，不用纯透明或仅靠颜色表达；
- 错误或 busy 状态：用文字/辅助状态同时表达，不用颜色作为唯一提示。

组件状态类应保持稳定。例如 `cd-button is-busy`、`cd-input is-invalid` 和
`cd-select is-disabled` 只表达视觉状态；真实可交互性仍由 `disabled` 属性和
Runtime `ControlState` 决定。状态变更使用 `control.update({classes: [...]})`，不要
重建 DOM 或改变控件 id。

## select、input、button 状态矩阵

| 组件 | HTML 结构 | Runtime 状态 | 必须覆盖的视觉状态 | 平台注意事项 |
| --- | --- | --- | --- | --- |
| select | 单一 `select`，稳定 id，非 `multiple` | `value`、`disabled`、`options` | default、focus-visible、disabled、当前值 | 关闭的 field 可样式化；展开菜单的字体、阴影、箭头和位置由 WKWebView/WebView2/系统控制。 |
| input | 支持的单行 `input` type，稳定 id | `value`、`disabled`、`classes`，事件 `input`/`change` | empty/placeholder、filled、focus-visible、disabled、invalid | 不使用 `autofocus`；floating window 不在 show 时抢键盘。校验提示放在相邻文字节点。 |
| button | `button type="button"`，稳定 id | `text`、`disabled`、`busy`、`active`、`error`、`classes` | default、hover、pressed、focus-visible、disabled、busy、error | busy 时禁止重复点击；错误信息保留在可读文字或辅助状态中。 |

最小的状态切换模式如下：

```js
const save = panel.control("save");

await save.update({
  text: "Saving…",
  busy: true,
  disabled: true,
  classes: ["cd-button", "cd-button-primary", "is-busy"]
});

await save.update({
  text: "Try again",
  busy: false,
  disabled: false,
  error: "The sample request failed.",
  classes: ["cd-button", "cd-button-primary", "is-error"]
});
```

在 `ui.createWindow()` 中，`button` 的文本同时会成为受限 bridge 的 accessible label；
`select` 与 `input` 的可见 `label` 应通过 `for` / `id` 或相邻语义文本关联。更新
`classes` 时传入完整 class 列表，因为 bridge 会替换该控件的 className。

## Native UI state gallery

Native 对照示例是 `examples/custom-ui/native-ui-components.js`。它只使用真实的
`FloatingWindow` native peers：Button、Label、Switch、Checkbox、Input、Select、
SegmentedControl、Slider 和 Progress；没有 HTML、CSS、WebView 或浏览器 fallback。
从仓库根目录运行：

```bash
./opendesk -ui -script examples/custom-ui/native-ui-components.js -console-mode script -log-dir .runtime/examples/custom-ui/native-ui-components
```

Native 控件的状态边界必须明确记录，不能把 HTML/CSS 的状态名直接当作 Native API：

| 控件 | Native API 实际支持 | 本示例中的差异说明 |
| --- | --- | --- |
| Button | `active`、`disabled`、`busy`、`error`、`badge`，以及平台自身的 hover/pressed | 没有独立的 `success` 字段；示例用 `active + badge` 表达成功约定，并在 Label 中说明。 |
| Input | `value`、`placeholder`、`disabled`；用户直接点击后获得真实键盘焦点 | 没有 `invalid`、`loading` 或 `success` 字段；校验文案应由相邻 Label 或业务层表达。 |
| Select | 固定 `options`、`value`、`disabled` | 没有 CSS invalid/error 样式；展开菜单由 AppKit/WinForms 绘制，脚本只保证选项和 readback。 |
| Progress | 确定值和 `indeterminate` | 它是独立的不可交互 loading indicator，不会自动改变 Button 的 `busy` 状态。 |
| Label | 固定宽度、文字、水平/垂直对齐、tone | 没有 callback、focus、busy、active 或 error 状态；适合解释不支持的语义状态。 |

两条轨道共享稳定 id、Runtime 事件和 `Screen.screenshot()` 证据，但不共享绘制层：
HTML/CSS 依靠 token、class 和 `:focus-visible` 控制内容布局；Native 依靠 typed
declaration、固定 item geometry 和 host readback。自动化可以检查 Native role/name/value、
bounds 和 callback，也可以截取实际窗口，但不能用 HTML 截图替代 Native 视觉证据。

## HTML 与原生控件差异

| 维度 | `ui.createWindow()` HTML/CSS | `FloatingWindow` native toolbar |
| --- | --- | --- |
| macOS 实现 | WKWebView 内容，AppKit 外层窗口 | AppKit native peers，Dark Aqua |
| Windows 实现 | WebView2 内容，WinForms 外层窗口；需要 WebView2 Runtime | WinForms native peers；不需要 WebView2 Runtime |
| 样式入口 | 受限 HTML/CSS | 无 CSS；使用 typed declaration |
| button | 浏览器 button，通过 bridge 派发 click | 40×40pt native button，图标和 tooltip 由 host 管理 |
| input | 浏览器单行 input，通过 input/change 事件 | 固定宽度 native TextBox；用户直接点击后才激活键盘 |
| select | 浏览器 select；关闭 field 可控，弹出菜单由 host/系统决定 | 固定宽度 native ComboBox，选项集合声明后不可变 |
| 视觉精度 | token 可稳定，默认控件细节不可完全稳定 | native 状态真实，但平台绘制差异不可消除 |
| Accessibility | 稳定 id、bridge state/readback 和 host adapter | native role、name、value 和 bounds readback |

不要以 HTML 截图证明 FloatingWindow 的视觉通过，也不要以浏览器 preview 证明
`ui.createWindow()` 的 host/生命周期通过。两者都需要真实 Runtime 窗口；Windows
还要分别确认主程序、UI host 和 WebView2 前置条件。

## 双轨设计评分表

每次更新示例或主题 token 后，在两组真实窗口截图上按下表复核；每项 0 或 1 分，
9/10 以上才标记为高质量示例。若某一项因平台限制无法保证，必须在报告中写出限制，
不能用功能 Promise 通过替代视觉分数。

| 评分项 | 通过条件 | HTML/CSS | Native |
| --- | --- | ---: | ---: |
| 信息层级 | 标题、说明、组件名、状态和操作有清晰阅读顺序 | 0/1 | 0/1 |
| 对齐与间距 | 标签、控件、卡片和操作区使用一致的轴线与间距 | 0/1 | 0/1 |
| 控件一致性 | 同类控件共享高度、边框、圆角或同一 native geometry | 0/1 | 0/1 |
| 状态可辨识 | 状态同时有文字/形状/属性，不只依赖颜色 | 0/1 | 0/1 |
| 文本换行 | 长说明不溢出、不裁切，短控件不被异常拉宽 | 0/1 | 0/1 |
| 窗口自适应 | 内容适合窗口尺寸，没有过高、过宽或大面积空白 | 0/1 | 0/1 |
| 键盘焦点 | Tab/真实输入动作可观察，焦点环或 host readback 可复核 | 0/1 | 0/1 |
| 禁用/错误反馈 | 禁用仍可读，错误有相邻文案或 native error readback | 0/1 | 0/1 |
| 主题对比度 | 正文、muted、边框、焦点和状态色在 dark 主题中清晰 | 0/1 | 0/1 |
| 证据完整 | 保留 ready/state-transition 截图、日志和构建 provenance | 0/1 | 0/1 |

HTML 与 Native 各自满分 10 分；至少保留 `ready` 和一个状态变化截图。Native
的 hover/pressed 和 Input 键盘焦点应在真实窗口中操作后记录；HTML 的 focus ring
应使用 Tab 操作检查，select 的展开菜单只作为当前 host 的附加观察，不作为跨平台
像素契约。

## 视觉验收清单

从仓库根目录运行组件示例：

```bash
./opendesk -ui -script examples/custom-ui/ui-components.js -console-mode script -log-dir .runtime/examples/custom-ui/ui-components
```

Native 对照示例：

```bash
./opendesk -ui -script examples/custom-ui/native-ui-components.js -console-mode script -log-dir .runtime/examples/custom-ui/native-ui-components
```

完整的静态检查、catalog 检查和 `custom-ui` Runtime API gate 可从仓库根目录统一运行：

```bash
make check-custom-ui-components
```

该命令会先刷新当前 `dist/opendesk` 与配套 UI host，再将检查日志写入
`.runtime/tests/custom-ui/ui-components/`；真实窗口截图由 Runtime gate 写入其 run
context 目录。

在真实窗口中至少检查：

1. 标题、卡片和底部操作区没有裁切，窗口没有异常拉宽、过高或大面积空白；
2. HTML 的 select closed field、input placeholder/filled/invalid、button normal/active/
   loading/disabled/success/error 状态均可见，状态变化不移动相邻控件；Native 窗口的
   typed peers、固定 geometry、busy/error/disabled/badge readback 与 Label 差异说明一致；
3. 鼠标 hover 和键盘 Tab 能到达三个组件，focus-visible ring 与深色背景有足够对比；
4. 打开 select 后记录平台弹出菜单差异，但不把弹出菜单的像素当作跨平台契约；
5. 点击 Save、Simulate error、Reset 和 Close 后，日志中的 state/readback 与窗口可见
   状态一致，关闭后无残留进程。

结构/样式单测和 Runtime 行为 gate 不能代替这张真实窗口截图；正式 gate 会把 HTML
截图写入 `.runtime/tests/runtime-api/<run-id>/runtime-logs/custom-ui/ui-components/`，
Native 截图写入 `.runtime/tests/runtime-api/<run-id>/runtime-logs/custom-ui/native-ui-components/`。
最终报告分别标注 direct command、自动化 gate、构建 provenance 和视觉评分的状态。
