# 通用桌面示例

所有命令从仓库根目录运行。桌面示例分为**只读/观察**与**真实输入/状态变更**两类；即使文件已经进入 canonical 目录，也不表示适合 Example Explorer 一键运行。

Explorer 中只有明确标记为 `safe` 的条目提供 Run；截图、录屏、鼠标、键盘、UI 点击、窗口修改等示例统一保持 `manual`，先阅读前置条件和源码。

## 只读窗口与显示信息

### Window Inspect

```bash
./opendesk -script examples/desktop/window-inspect.js -console-mode script
```

只输出窗口 ID、PID 和几何信息，不聚焦、不调整窗口、不读内容、不截图，默认不打印标题或进程路径。需要选择测试窗口时才显式打开标题输出：

```bash
OPENDESK_EXAMPLE_SHOW_TITLES=1 ./opendesk -script examples/desktop/window-inspect.js -console-mode script
```

### Display Modes

```bash
./dist/opendesk -script examples/desktop/display-modes.js -console-mode script
```

只读取 display capabilities、当前模式及可用模式数量，不切换显示模式。该条目在 Catalog 中是 `safe`。

## 指定窗口输入

```bash
OPENDESK_EXAMPLE_WINDOW_TITLE='OpenDesk input test' OPENDESK_EXAMPLE_WINDOW_PID=12345 ./opendesk -script examples/desktop/keyboard.js -console-mode script
```

脚本核对唯一精确标题、PID 与 native identity，聚焦目标并再次验证活动窗口，只派发一段有限文本。不点击按钮、不按 Enter。请只使用可丢弃测试窗口。

## 指定窗口位置

```bash
OPENDESK_EXAMPLE_WINDOW_TITLE='OpenDesk window test' OPENDESK_EXAMPLE_WINDOW_PID=12345 ./opendesk -script examples/desktop/window-controls.js -console-mode script
```

只用于普通、非最大化/全屏的可丢弃测试窗口。示例将 x 增加 20，核对结果，并在 `finally` 中恢复原 bounds。

## UI 相对文本定位

```bash
./dist/opendesk -script examples/desktop/ui-relative-target.js -console-mode script
```

运行前让一个可丢弃测试窗口包含两行：`OpenDesk 测试行 A    编辑` 与 `OpenDesk 测试行 B    编辑`。示例使用 `UI.tapText()` + `relativeTo` 精确选择第一行右侧的“编辑”，并执行一次真实点击，因此在 Catalog 中保持 `manual`。不要用于聊天、订单、支付等真实业务窗口。

## 指定目标窗口与 `UI.tapTexts()`

`WindowTarget` 只描述**本次执行的一个目标窗口**。它不是平台路由表，也不需要在一个 Recipe 中同时维护 macOS / Windows / Linux 三套应用名称。

推荐把目标作为一处部署参数或脚本顶部常量；迁移到另一台机器或另一个操作系统时，只替换这一处目标，后面的业务逻辑保持不变：

```js
const TARGET_WINDOW = {
  app: { bundleId: 'com.apple.calculator' },
};

const win = await window.wait(TARGET_WINDOW, { timeout: 10000 });

await UI.tapTexts(["2", "5", "×", "4", "="], { within: win, match: "exact" });
```

第一个参数 `texts` 是必填的主要动作序列；`within: win` 只把动作限定在 `window.wait()` 返回的 `WindowInfo` 中。上例是 macOS Calculator 的一个稳定目标配置。在 Windows 部署同一业务脚本时，只需要把 `TARGET_WINDOW` 替换成该机器已经验证的单一 `WindowTarget`，例如稳定的 `exeName`、`pid` 或必要时的精确 `title`；不要在业务脚本里增加平台判断，也不要为了跨平台而给 `UI.tapTexts()` 增加 `appName` / `windowName` 等重复参数。

推荐边界保持简单：

```text
Recipe / 部署参数
→ 一个 OpenDeskWindowTarget
→ window.wait()
→ 一个 OpenDeskWindowInfo
→ UI.tapTexts(texts, { within: win, ...textOptions })
```

如果目标应用身份在不同平台不同，差异属于部署配置，不属于 `WindowTarget` API 本身。标题查询可以跨平台使用，但标题值可能随语言、应用版本和窗口状态变化；存在更稳定 identity 时应优先使用 identity。

### Calculator 语义结果流（macOS，真实输入）

这个最小示例只展示关键业务代码：清空 Calculator，输入 `25 × 4 + 10`，从真实显示区读取 `110`，再把该读取值拆成第二轮 `6 × 110` 的按钮输入，最后读取 `660`。它不会录制 Recorder actions，也不会使用 JavaScript 算术代替 Calculator。

```bash
./dist/opendesk -script examples/desktop/calculator-semantic-110-660-macos.js -console-mode script
```

运行前授予 Screen Recording 与 Accessibility 权限。命令会真实修改系统 Calculator；终端打印两个显示值，并将可直接查看的 `first-result-110.png` 与 `final-result-660.png` 写入 `.runtime/examples/calculator-semantic-110-660/<execution-id>/`。

### UI Perception Resolver（macOS，真实输入）

这是独立于上面业务语义流程的 Runtime Resolver 示例。它先在没有输入的情况下以 `UI.findText()` 预检必要按键，随后只使用 `UI.tapText()`、`UI.tapTexts()` 与 `UI.readText()`；调用者不选择 OCR、Accessibility、VLM、provider 或 fallback。当前 cloud VLM 默认关闭。

```bash
./dist/opendesk -script examples/desktop/ui-resolver-calculator-macos.js -console-mode script
```

运行会真实清空和操作系统 Calculator，预检、实际 `110`/`660` 值及截图写入 `.runtime/examples/ui-perception-resolver-calculator/<execution-id>/`。如果焦点切换、候选歧义或输入状态未知，脚本停止，不会切换 backend 或重放输入。

## Mouse 与 Page 固定坐标

```bash
./dist/opendesk -script examples/desktop/mouse.js -console-mode script
./dist/opendesk -script examples/desktop/page-click.js -console-mode script
```

两者都会对真实桌面发送固定坐标输入，只能手动运行。`page-click.js` 还会写截图 artifact。

## Screen 与 Screenshot

```bash
./dist/opendesk -script examples/desktop/screen-info.js -console-mode script
./dist/opendesk -script examples/desktop/screenshot.js -console-mode script
./dist/opendesk -script examples/desktop/screenshot-bytes.js -console-mode script
```

这些示例不会发送键盘/鼠标输入，但会捕获可见像素，因此仍是 `manual`。运行前关闭密码、聊天、支付和其他敏感可见内容。

## 区域录屏

```bash
./dist/opendesk -script examples/desktop/screen-record-region.js -console-mode script
```

用户先选择区域，随后录制约 1.5 秒，结果写入 `.runtime/examples/desktop/screen-record-region/`。需要对应系统录屏权限。

## Canonical-only

通用桌面示例只使用本目录中的 canonical 路径。过去位于 `examples/` 根目录的 window/keyboard/mouse/page/screen/screenshot/UI 定位脚本已经退休并删除。Catalog 的 `legacyNames` 仅保留历史名称/搜索上下文，不代表旧文件仍存在。

`support/` 只保存多个桌面示例共享的目标核对逻辑，不是可运行入口，不进入 Explorer 普通列表。

## 验证与平台

支持矩阵以对应的 [`docs/api/`](../../docs/api/README.md) Reference 为准。Unsupported 必须明确失败；命令存在不等于目标平台已经 live PASS。

正式 Runtime API contract 使用 `tests/runtime-api/`；维护者专用平台验证脚本位于 `tests/automation/tools/window-platform/`，不再混入 public Examples。
