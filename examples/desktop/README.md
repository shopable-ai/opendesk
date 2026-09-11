# 通用桌面示例

所有命令从仓库根目录运行。桌面示例分为**只读/观察**与**真实输入/状态变更**两类；即使文件已经进入 canonical 目录，也不表示适合 Example Explorer 一键运行。

Explorer 中只有明确标记为 `safe` 的条目提供 Run；截图、录屏、鼠标、键盘、窗口修改等示例统一保持 `manual`，先阅读前置条件和源码。

## 只读窗口与显示信息

### Window Inspect

```bash
./opendesk -script examples/desktop/window-inspect.js -console-mode script
```

只输出窗口 ID、PID 和几何信息，不聚焦、不调整窗口、不读内容、不截图，默认不打印标题或进程路径。确实需要选择测试窗口时才显式打开标题输出：

```bash
OPENDESK_EXAMPLE_SHOW_TITLES=1 ./opendesk -script examples/desktop/window-inspect.js -console-mode script
```

标题、应用 identity 等仍可能包含隐私，因此 Catalog 将该示例保持为 `manual`。

### Display Modes

```bash
./dist/opendesk -script examples/desktop/display-modes.js -console-mode script
```

只读取 display capabilities、当前模式及可用模式数量，不切换显示模式。该条目在 Catalog 中是 `safe`。

## 指定窗口输入

先在可丢弃测试编辑器中准备目标，再把标题和 PID 替换为真实值：

```bash
OPENDESK_EXAMPLE_WINDOW_TITLE='OpenDesk input test' OPENDESK_EXAMPLE_WINDOW_PID=12345 OPENDESK_EXAMPLE_ALLOW_INPUT=1 ./opendesk -script examples/desktop/keyboard.js -console-mode script
```

脚本核对唯一精确标题、PID 与 native identity，聚焦目标并再次验证活动窗口，只派发一段有限文本。不点击按钮、不按 Enter。焦点竞争仍然存在，因此不要使用聊天、支付、终端或含未保存重要数据的窗口。

## 指定窗口位置

```bash
OPENDESK_EXAMPLE_WINDOW_TITLE='OpenDesk window test' OPENDESK_EXAMPLE_WINDOW_PID=12345 OPENDESK_EXAMPLE_ALLOW_WINDOW_CHANGE=1 ./opendesk -script examples/desktop/window-controls.js -console-mode script
```

只用于普通、非最大化/全屏的可丢弃测试窗口。示例将 x 增加 20，核对结果，并在 `finally` 中恢复原 bounds；不会关闭、杀进程或修改置顶状态。

## Mouse 与 Page 固定坐标

[`mouse.js`](mouse.js) 和 [`page-click.js`](page-click.js) 都会对真实桌面发送固定坐标输入，只能手动运行：

```bash
./dist/opendesk -script examples/desktop/mouse.js -console-mode script
./dist/opendesk -script examples/desktop/page-click.js -console-mode script
```

`page-click.js` 还会把截图写入 `.runtime/examples/desktop/page-click/`。运行前必须检查脚本里的坐标并准备可丢弃桌面状态。

## Screen 与 Screenshot

这些示例不发送键盘/鼠标输入，但会捕获可见像素，因此仍是 `manual`：

```bash
./dist/opendesk -script examples/desktop/screen-info.js -console-mode script
./dist/opendesk -script examples/desktop/screenshot.js -console-mode script
./dist/opendesk -script examples/desktop/screenshot-bytes.js -console-mode script
```

- `screen-info.js`：读取屏幕尺寸、像素并获得全屏截图预览；
- `screenshot.js`：把完整/裁剪截图写入 `.runtime/examples/desktop/screenshot/`；
- `screenshot-bytes.js`：把活动窗口 bytes 写入 `.runtime/examples/desktop/screenshot-bytes/active-window.png`。

运行前关闭密码、聊天、支付和其他敏感可见内容；不要把截图或 base64 输出当成可公开日志。

## 区域录屏

```bash
./dist/opendesk -script examples/desktop/screen-record-region.js -console-mode script
```

用户先选择区域，随后录制约 1.5 秒，结果写入 `.runtime/examples/desktop/screen-record-region/`。需要对应系统录屏权限，并会真实捕获所选区域的像素。

## Canonical 与兼容路径

推荐路径统一使用本目录：

```text
examples/window.js                 -> examples/desktop/window-inspect.js
examples/window-more.js            -> examples/desktop/window-controls.js
examples/keyboard.js               -> examples/desktop/keyboard.js
examples/mouse.js                  -> examples/desktop/mouse.js
examples/page.js                   -> examples/desktop/page-click.js
examples/screen.js                 -> examples/desktop/screen-info.js
examples/screenshot.js             -> examples/desktop/screenshot.js
examples/screenshot_bytes_smoke.js -> examples/desktop/screenshot-bytes.js
examples/display-modes.js          -> examples/desktop/display-modes.js
examples/screen-record-region.js   -> examples/desktop/screen-record-region.js
```

旧路径只是兼容入口；`examples/catalog.json` 通过 `aliases` 关联，不会在 Example Explorer 中显示为第二份示例。

`support/` 仍只保存多个桌面示例共享的目标核对逻辑，不是可运行入口，不进入 Explorer 普通列表。

## 验证与平台

支持矩阵以对应的 [`docs/api/`](../../docs/api/README.md) Reference 为准。Unsupported 必须明确失败；命令存在不等于目标平台已经 live PASS。

正式 Runtime API contract 使用 `tests/runtime-api/`；公开示例用于学习和人工观察，不能代替正式测试或视觉验收。不得遍历此目录自动运行所有 `.js`。
