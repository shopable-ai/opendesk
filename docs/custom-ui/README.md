# Custom UI 图标资源

## 内置图标图鉴

[打开 `icon-catalog.html`](icon-catalog.html) 可以用默认大图模式查看全部 150 个内置图标，也可切换紧凑模式，并按名称搜索、复制图标名称、复制 `FloatingWindow.addButton()` 用法或保存名称 JSON。

图鉴是可提交、可长期保存的自包含 HTML，不依赖 `.runtime/` 或外部网络。公开名称的唯一数据源仍是 `pkg/customui/assets/toolbar-icons-v1.json`；不要手工修改生成的 HTML。

## 重新生成

从仓库根目录运行：

```bash
bash scripts/render_custom_ui_icon_catalog.sh
```

命令先把待检查的浏览器 HTML、受限 Runtime HTML、联系表和 manifest 写入 `.runtime/tests/custom-ui/icon-catalog/`。确认 manifest 为 150/150 且联系表没有缺失或异常后，显式更新正式图鉴：

```bash
bash scripts/render_custom_ui_icon_catalog.sh --publish
```

发布会更新本目录的浏览器图鉴和 `examples/custom-ui/icon-catalog.html` Runtime 视图。离线浏览器 HTML 只负责图标选型与复制；真实 Runtime 控件数量、滚动、callback、Accessibility、剪贴板和生命周期仍使用 `examples/custom-ui/icon-catalog.js` 验证。
