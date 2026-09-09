# Custom UI 图标资源

## 运行 Custom UI 示例

Custom UI 的 API 契约、`-ui` / `-no-ui` / `-config` 的优先级、配置文件格式，以及 HTTP
请求的额外授权条件都在 [Custom UI API](../api/custom-ui.md)。这个目录只保存内置图标资源和
生成说明，不定义另一套命令行行为。

从仓库根目录，在 `opendesk` 与同级 `opendesk-ui-host` 已由维护者准备好的前提下，可直接运行：

```bash
./opendesk -ui -script examples/custom-ui/panel.js -console-mode script
```

`-ui` 只授予这一轮脚本创建原生窗口的能力，不会自行显示界面；示例脚本中的
`ui.createWindow()` 与 `show()` 才会打开窗口。若项目选择配置方式，可去掉 `-ui`，让脚本同目录的
`clawdesk.runtime.json` 决定能力。平台或 host 不可用时，即使传入 `-ui`，创建窗口仍会明确失败；
脚本可用 `ui.getCapabilities()` 区分“已授权”和“可用”。

## FloatingWindow 状态文字

`FloatingWindow` 除了图标 Button、Separator 和固定 Spacer，也支持固定宽度的 native Label，适合显示
“Ready”“录制中 00:12”“3 tasks completed”等短状态。Label 的宽度在首次 `show()` 前声明，运行中只更新
文字、水平/垂直对齐和语义色，因此不会让窗口或相邻按钮随文字长度跳动。水平 `center` 由 native
text peer 实际应用；垂直轴使用独立的 `top` / `center`（默认）/ `bottom` 契约，不依赖 40pt 外框内
`NSTextField` 的默认绘制位置。Accessibility 只暴露 wrapper 这一个 `staticText` 元素，完整文字同时作为
name 和 value；内部 text peer 隐藏。`getLabelState()` 通过 `renderedTextBounds` 和完整的
`accessibilityName` / `accessibilityValue` 返回可验证的 native 布局与语义 readback。
从仓库根目录直接运行：

```bash
./opendesk -ui -script examples/custom-ui/floating-toolbar-status-label.js -console-mode script
```

## FloatingWindow 紧凑控件

紧凑设置栏现在可以直接混排 Switch、Checkbox、单行 Input、Select、Slider、SegmentedControl 和独立
Progress。Checkbox 表示“是否纳入”，Switch 表示立即生效的开关；互斥选项统一使用一个
SegmentedControl，不提供零散 Radio。Button 的短 badge 通过 `updateButton(id, {badge})` 附着并可用
`null` 清除，不再增加一个与 Label 重复的 item。

Input 不会让 `show()` 抢走键盘：只有用户直接进入真实 native 输入框时 host 才激活并接受输入；没有
autofocus 或脚本 `focus()`。所有控件的 width、options、range、step 和 maxLength 在显示前固定，运行中用
`updateControl()` 更新值，用 `getControlState()` 读取 native/Accessibility 状态。

从仓库根目录运行完整控件示例：

```bash
./opendesk -ui -script examples/custom-ui/floating-toolbar-controls.js -console-mode script -log-dir .runtime/examples/custom-ui/floating-toolbar-controls
```

多行表单、动态 option tree、滚动内容和任意进度布局仍使用 `ui.createWindow()`；完整契约见
[Custom UI API](../api/custom-ui.md)。

## 脚本录制控制台

从仓库根目录运行真实 Recorder 控制台：

```bash
./dist/opendesk -ui -allow-recorder-capture -script examples/custom-ui/recording-console.js -console-mode script -log-dir .runtime/examples/custom-ui/recording-console
```

点击“开始录制”会立即授权本次采集，并留出 3 秒供用户聚焦隔离、非敏感、可恢复的目标窗口；
倒计时结束后才读取并冻结其 PID＋标题并调用同一个 execution-owned `Recorder.start()`，用于聚焦的
点击不会被录入。界面明确显示准备、录制、保存、
Actions、生成和试运行阶段，并提供暂停／继续、取消、停止保存、独立生成、重置和试运行按钮。暂停仍保留 native listener；
敏感操作或长期离开应停止。停止后由已有 `Recorder.buildActions()` 制作 actions，只有 ready 时才能
手工点击生成。详情页用可滚动、可选择的受限文本控件显示 `File.read(scriptFile)` 的实际内容，并可由
Runtime controller 复制。生成不会自动回放；只有用户另点“试运行”，才会通过 `Command.run()` 启动
`./dist/opendesk -script <scriptFile>` Fresh Run。试运行可取消并保留结果，candidate 自身仍保持
`verification: "not-run"`。生成成功后按钮变为“重新生成”，再次明确点击会从现有 ready actions 重新生成并重新读取内容，
同时清理旧的内存候选／运行结果。重置只清空 UI/controller 引用，不删除不可变产物，也不重复停止已经终结的
Recorder session。主托盘关闭、脚本异常或宿主退出会取消在途试运行并沿现有 execution 生命周期清理。
详情页打开时会暂时隐藏置顶托盘，收起或关闭详情后恢复托盘，避免两个原生窗口互相覆盖；该操作不重置流程。
录制期间的每个 Custom UI 按钮 click 会先调用 `session.excludeControlClick(event)`，把对应 native 点击 ID 写入
显式 raw 边界，Actions 只排除这些引用，不按按钮坐标猜测。若 actions blocked，托盘摘要和详情页会显示
结构化 `code`、`eventId` 与 message，生成按钮保持禁用；这是可检查的转换状态，不会被隐藏或伪造成成功。
完整按钮和错误／部分保存语义见
[`examples/custom-ui/README.md`](../../examples/custom-ui/README.md)，公开 Recorder 契约见
[`Recorder Runtime API`](../api/recorder-runtime.md)。

## 内置图标图鉴

[打开 `icon-list.html`](icon-list.html) 可以用默认大图模式查看全部 160 个内置图标，也可切换紧凑模式，并按名称搜索、复制图标名称、复制 `FloatingWindow.addButton()` 用法或保存名称 JSON。清单包含可直接发现的 `ai.*` 与 `automation.*` 默认图标键。

图鉴是可提交、可长期保存的自包含 HTML，不依赖 `.runtime/` 或外部网络。公开名称的唯一数据源仍是 `pkg/customui/assets/toolbar-icons-v1.json`；不要手工修改生成的 HTML。

## FloatingWindow 自定义图片

业务或品牌图标可以直接传给 `FloatingWindow.addButton()`：`{path:"./icons/action.png"}` 保留图片原色，`{path:"./icons/action.png",renderingMode:"template"}` 使用原生状态颜色。路径相对于执行脚本，且解析后必须留在脚本目录内；只接受受限大小和尺寸的 PNG/JPEG，路径本身不会传给 native host。完整限制、动态替换方式和一行运行示例见 [Custom UI API 的“用户自定义按钮图标”](../api/custom-ui.md#用户自定义按钮图标) 与 `examples/custom-ui/custom-image-icons.js`。

## 重新生成

从仓库根目录运行：

```bash
bash scripts/render_custom_ui_icon_catalog.sh
```

命令先把待检查的浏览器 HTML、受限 Runtime HTML、联系表和 manifest 写入 `.runtime/tests/custom-ui/icon-list/`。确认 manifest 为 160/160 且联系表没有缺失或异常后，显式更新正式图鉴：

```bash
bash scripts/render_custom_ui_icon_catalog.sh --publish
```

发布会更新本目录的浏览器图鉴和 `examples/custom-ui/icon-list.html` Runtime 视图。离线浏览器 HTML 只负责图标选型与复制；真实 Runtime 控件数量、滚动、callback、Accessibility、剪贴板和生命周期仍使用 `examples/custom-ui/icon-list.js` 验证。

## 设计质量目标

默认图标的发布门槛是专家设计评审 **95/100 分以上**：场景语义与覆盖 35 分、发现与命名 25 分、视觉一致性 20 分、可访问性与安全边界 20 分。评审时必须同时检查注册表/类型映射、macOS 联系表以及经授权的真实 Runtime 窗口；浏览器图鉴不能单独构成 Runtime 通过证据。

自定义图片图标沿用 **95/100 分以上** 的发布门槛：API 易用性与内置图标兼容 25 分、路径和资源安全 30 分、原生状态渲染 20 分、类型/文档/公开示例 15 分、正式 JavaScript 实窗证据 10 分。路径逃逸、native host 未二次校验、按钮布局被图片改变、tooltip/Accessibility 名称丢失或正式实窗测试未通过均为硬性不通过；不能用其余分项抵消。
