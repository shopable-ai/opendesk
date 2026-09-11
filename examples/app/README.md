# 应用场景示例

本目录保存面向真实桌面应用的 canonical public examples。与 `examples/desktop/` 的通用窗口/输入 API 不同，这里的脚本包含具体应用名称、平台或业务上下文，因此统一在 Example Explorer 中作为 `Applications` 分类展示，并默认保持 `manual`。

## Running Applications Overview

```bash
./dist/opendesk -script examples/app/running-apps.js -console-mode script
```

只读 `window.list()`，按固定关键字汇总 WeChat、VS Code、Chrome、Safari、Finder 等窗口。它不修改应用状态，但窗口标题可能包含用户信息，因此运行输出不应直接公开分享。

## WeChat Window Inspect

```bash
./dist/opendesk -script examples/app/wechat-window-inspect.js -console-mode script
```

只查找 WeChat/微信窗口并打印标题与尺寸，不点击、不输入、不切换状态。标题仍可能含隐私，所以 Catalog 保持 `manual`。

## Open Calculator by Name（macOS）

```bash
./dist/opendesk ai run examples/app/open-calculator-by-name.js
```

调用 `App.launch('计算器', { waitUntilReady: 'window', timeout: 10000 })` 启动或激活系统 Calculator，并打印真实 identity。不会输入、清空、restart 或 terminate 已存在实例。

## Calculator App Lifecycle（macOS）

```bash
./dist/opendesk -script examples/app/lifecycle-calculator.js -console-mode script
```

这是有明显副作用的生命周期示例：只有检测到 Calculator 当前未运行时才继续，然后 launch → restart → terminate → waitForExit；最终结果写到 `.runtime/examples/app/lifecycle-calculator/result.json`。`finally` 会尽力清理本示例创建的实例。该示例必须人工运行，不能由 Example Explorer 一键触发。

## 千牛窗口（Windows）

从仓库根目录进行只读查询：

```powershell
.\dist\opendesk.exe -script examples/app/qianniu-window.js -console-mode script
```

按 `exeName === AliWorkbench.exe`（大小写不敏感）筛选，仅输出 ID/PID。不会读取聊天、商品或窗口内容。需要标题时先设置 `$env:OPENDESK_EXAMPLE_SHOW_TITLES = '1'`，用毕移除。

设置置顶必须明确输入实际标题与 PID、on/off 和授权。例如：

```powershell
$env:OPENDESK_EXAMPLE_WINDOW_TITLE = '你的千牛测试窗口完整标题'
$env:OPENDESK_EXAMPLE_WINDOW_PID = '12345'
$env:OPENDESK_EXAMPLE_QIANNIU_TOPMOST = 'on'
$env:OPENDESK_EXAMPLE_ALLOW_WINDOW_CHANGE = '1'
try { .\dist\opendesk.exe -script examples/app/qianniu-window.js -console-mode script }
finally {
  Remove-Item Env:OPENDESK_EXAMPLE_WINDOW_TITLE, Env:OPENDESK_EXAMPLE_WINDOW_PID, Env:OPENDESK_EXAMPLE_QIANNIU_TOPMOST, Env:OPENDESK_EXAMPLE_ALLOW_WINDOW_CHANGE -ErrorAction SilentlyContinue
}
```

没有 mode 时只读；非法 mode 或未授权时失败。动作前核对唯一标题、PID、稳定身份和能力。API 返回后仍需视觉确认，不能只凭日志宣布业务或视觉结果通过。

## 旧路径已退休

根目录 `examples/check_all_apps.js`、`examples/check_wechat.js`、`examples/open-calculator-by-name.js`、`examples/app-lifecycle.js` 已删除。只使用本目录 canonical 路径；Catalog `aliases` 仅用于历史名称/搜索上下文。

## 其他历史应用脚本

本目录还包含千牛、拼多多、CSDN 等历史应用脚本。它们不会因为位于 `examples/app/` 就自动成为 Explorer 普通入口；只有完成用途、副作用、平台和前置条件审查并登记到 `examples/catalog.json` 后才进入 curated list。

真实应用示例不是正式测试。API contract、跨平台状态和业务结果验证仍由对应 `tests/`、工作流或人工验收承担。
