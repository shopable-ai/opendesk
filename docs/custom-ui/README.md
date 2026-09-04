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
