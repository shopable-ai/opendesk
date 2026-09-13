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
OPENDESK_EXAMPLE_WINDOW_TITLE='OpenDesk input test' OPENDESK_EXAMPLE_WINDOW_PID=12345 OPENDESK_EXAMPLE_ALLOW_INPUT=1 ./opendesk -script examples/desktop/keyboard.js -console-mode script
```

脚本核对唯一精确标题、PID 与 native identity，聚焦目标并再次验证活动窗口，只派发一段有限文本。不点击按钮、不按 Enter。请只使用可丢弃测试窗口。

## 指定窗口位置

```bash
OPENDESK_EXAMPLE_WINDOW_TITLE='OpenDesk window test' OPENDESK_EXAMPLE_WINDOW_PID=12345 OPENDESK_EXAMPLE_ALLOW_WINDOW_CHANGE=1 ./opendesk -script examples/desktop/window-controls.js -console-mode script
```

只用于普通、非最大化/全屏的可丢弃测试窗口。示例将 x 增加 20，核对结果，并在 `finally` 中恢复原 bounds。

## UI 相对文本定位

```bash
./dist/opendesk -script examples/desktop/ui-relative-target.js -console-mode script
```

运行前让一个可丢弃测试窗口包含两行：`OpenDesk 测试行 A    编辑` 与 `OpenDesk 测试行 B    编辑`。示例使用 `UI.tapText()` + `relativeTo` 精确选择第一行右侧的“编辑”，并执行一次真实点击，因此在 Catalog 中保持 `manual`。不要用于聊天、订单、支付等真实业务窗口。

## 跨平台窗口范围与 `UI.tapTexts()`

`UI.tapTexts(texts, { within: win })` 是推荐边界：先由 `window` 把平台相关查询解析成唯一 `WindowInfo`，再把这个已解析窗口交给 `UI`。不要把窗口标题字符串当作跨平台应用 identity；标题查询 API 可以跨平台使用，但标题值可能随操作系统、语言、应用版本和窗口状态变化。

`examples/desktop/support/platform-window-target.js` 提供 example-local 的严格平台选择器。它不会猜测其他平台的应用名，也不会在缺少当前平台目标时退回活动窗口。下面的 Calculator 结构可以在不同系统复用；macOS 使用稳定 bundle ID，Windows/Linux 应填写该机器上已经验证的 `exeName`，只有无法取得更稳定 identity 时才通过环境变量显式提供精确标题：

```js
const createPlatformWindowTarget = (0, eval)(File.read(
  File.join(File.cwd(), 'examples/desktop/support/platform-window-target.js'),
));
const platformWindow = createPlatformWindowTarget();
const platform = platformWindow.currentPlatform();

const calculatorTargets = {
  darwin: { app: { bundleId: 'com.apple.calculator' } },
};

if (platform !== 'darwin') {
  const exeName = Execution.env.OPENDESK_CALCULATOR_EXE_NAME;
  const title = Execution.env.OPENDESK_CALCULATOR_WINDOW_TITLE;
  if (typeof exeName === 'string' && exeName.trim()) {
    calculatorTargets[platform] = { exeName: exeName.trim() };
  } else if (typeof title === 'string' && title.trim()) {
    calculatorTargets[platform] = { title: title.trim() };
  } else {
    throw new Error(
      'Set OPENDESK_CALCULATOR_EXE_NAME or OPENDESK_CALCULATOR_WINDOW_TITLE ' +
      'to a verified exact target for platform: ' + platform,
    );
  }
}

const win = await platformWindow.wait(calculatorTargets, { timeout: 10000 });
await UI.tapTexts(['2', '5', '×', '4', '='], {
  within: win,
  match: 'exact',
  waitForEach: true,
  intervalMs: 100,
});
```

这个例子故意把“平台目标解析”和“UI 文本点击”分开：`WindowTarget` 可以按平台配置，`UI.tapTexts()` 不新增 `appName` / `windowName` 等重复解析参数。若 Recipe 已知更稳定的应用 identity，应优先使用 identity；精确标题是配置型 fallback，不是跨平台默认值。

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