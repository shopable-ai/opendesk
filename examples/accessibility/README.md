# Accessibility examples

本目录展示可信本地 JavaScript execution 中的原生 Accessibility 与大写 `UI` 菜单接口。公开合同见
[`docs/api/accessibility.md`](../../docs/api/accessibility.md) 和
[`docs/api/desktop-ui-menu.md`](../../docs/api/desktop-ui-menu.md)。所有命令都从仓库根目录运行，并使用
与当前源码配套构建的 `./dist/opendesk`。

## 公开示例源码

- [`inspect-window.js`](inspect-window.js)：只读调用 `Accessibility.getCapabilities()` 和
  `Accessibility.snapshot()`，用于观察已审核的 fixture 窗口。
- [`invoke-control.js`](invoke-control.js)：调用 `Accessibility.find()`、`perform()`、`read()` 和
  `release()`，并用 fixture 状态回读验证一次受控按钮动作。
- [`menu-command.js`](menu-command.js)：调用 `UI.tapMenuItem()`、`Accessibility.find()`、`read()` 和
  `release()`，并用 fixture 状态回读验证一次受控菜单动作。

`tests/accessibility/fixtures/macos/*.js` 不是公开 API 示例；它们只负责启动和停止仓库自有的
AppKit fixture，避免公开示例误操作任意活动应用。

## 前置条件与安全边界

- 先运行观察示例并检查 `Accessibility.getCapabilities()`；capability 不等于具体元素支持动作。
- macOS 需要给实际执行的 OpenDesk build 授予 Accessibility 权限；接口不会自行弹窗请求授权。
- 只在仓库自有 fixture，或本轮明确启动且可安全清理的应用实例上运行操作示例。不要让示例点击任意
  活动窗口、用户文档或真实业务菜单。
- HTTP、MCP 和 Scheduler execution 当前不启用此能力。准入开关不是完整 Runtime 沙箱。
- `acknowledged` 只表示 native 调用返回成功；示例必须通过 fixture counter/readback 或可见业务状态
  验证副作用。

三个示例都为每次原生调用显式使用 10 秒 deadline，以容纳真实 AX/UIA 遍历；这不会改变 API 的
3000 ms 默认值。

## 准备仓库自有 macOS fixture target

从仓库根目录启动一个新的受控 fixture。启动器会清理旧 state、拒绝并行的 fixture 实例，并在就绪后
写入受控 receipt。三个公开示例未提供 target 环境变量时只读取这个 receipt，并再次用当前窗口的
executable path 复核它是本仓库的 fixture；不会把它当成任意活动窗口：

```bash
./dist/opendesk -script tests/accessibility/fixtures/macos/launch.js -console-mode script -log-dir .runtime/tests/accessibility/fixture-launch

```

后续的默认公开命令无需 shell 变量；每次重新启动 fixture 后会使用新的 receipt，不能复用旧 PID 或
window number。需要运行自己已审核的非-fixture target 时，才显式同时设置
`OPENDESK_ACCESSIBILITY_TARGET_PID` 与 `OPENDESK_ACCESSIBILITY_WINDOW_ID`。完成后只停止该启动器记录的实例：

```bash
./dist/opendesk -script tests/accessibility/fixtures/macos/stop.js -console-mode script -log-dir .runtime/tests/accessibility/fixture-stop
```

## 观察窗口

从仓库根目录直接运行：

```bash
./dist/opendesk -script examples/accessibility/inspect-window.js -console-mode script -log-dir .runtime/tests/accessibility/public-inspect
```

没有显式 target 且没有当前 fixture 时，`inspect-window.js` 会通过 `Command.run()` 调用仓库的
`launch.js`，在同一 execution 中完成观察并调用 `stop.js` 清理；已有有效 fixture 则只复用它。
它只接受已核对 identity 的 fixture WindowInfo，在其明确 scope 内执行有界 snapshot，
并只输出非敏感摘要。它不请求权限、不展开菜单、不执行动作，也不把完整控件树或 value 写入日志；
fixture 不存在或 identity 不一致时安全失败，不会改为观察任意活动窗口。

macOS 刚发布 AppKit 窗口时，CoreGraphics 与 AX hierarchy 可能短暂不同步。仅默认的受控 fixture
观察在 `STALE_TARGET` 时会等待 100 ms、重新读取同一 receipt 并复核 PID、window ID、handle 和
executable，然后最多重试一次只读 snapshot；它不会追随重建后的窗口，也不会对显式 target 或任何动作
重试。持续失败仍按原始错误安全退出。

## 调用受控控件

先按上节准备仓库自有目标。下面命令使用 fixture 的 `Invoke Once` 按钮和独立的 `fixture.status`
状态文本；给出的期望值以新启动、各计数为零的 fixture 为前提。从仓库根目录原样运行（若复用已执行过
动作的 fixture，须按实际计数调整 `EXPECTED_VALUE`）：

```bash
OPENDESK_ACCESSIBILITY_CONTROL_ROLE=button OPENDESK_ACCESSIBILITY_CONTROL_NAME='Invoke Once' OPENDESK_ACCESSIBILITY_CONTROL_IDENTIFIER='fixture.invoke' OPENDESK_ACCESSIBILITY_VERIFY_ROLE=staticText OPENDESK_ACCESSIBILITY_VERIFY_IDENTIFIER='fixture.status' OPENDESK_ACCESSIBILITY_VERIFY_PROPERTY=value OPENDESK_ACCESSIBILITY_EXPECTED_VALUE='invoke-button | invoke=1 checkbox=0 menu=0' ./dist/opendesk -script examples/accessibility/invoke-control.js -console-mode script -log-dir .runtime/tests/accessibility/public-invoke
```

`invoke-control.js` 用精确 scope + selector 找到唯一 fixture 控件，调用一次 `invoke`，通过独立计数器
验证输入次数，并在 `finally` 中 release ref。目标缺失、歧义、权限不足或 fixture identity 不匹配时
安全失败，不会 fallback 到鼠标。

## 菜单命令

先按上节准备仓库自有菜单目标，手动确认所给精确 window id 已在前台。菜单路径通过 JSON 明确提供；
示例不会尝试按标题抢焦点。下面期望值同样以新启动、各计数为零的 fixture 为前提；从仓库根目录
原样运行：

```bash
OPENDESK_ACCESSIBILITY_MENU_PATH_JSON='[{"identifier":"fixture.menu.root"},{"identifier":"fixture.menu.invoke"}]' OPENDESK_ACCESSIBILITY_VERIFY_ROLE=staticText OPENDESK_ACCESSIBILITY_VERIFY_IDENTIFIER='fixture.status' OPENDESK_ACCESSIBILITY_VERIFY_PROPERTY=value OPENDESK_ACCESSIBILITY_EXPECTED_VALUE='menu-invoke | invoke=0 checkbox=0 menu=1' ./dist/opendesk -script examples/accessibility/menu-command.js -console-mode script -log-dir .runtime/tests/accessibility/public-menu
```

`menu-command.js` 复核已在前台的明确 fixture 实例，再以完整菜单 path 调用 `UI.tapMenuItem()`，最后读取
fixture 状态验证动作。它不翻译/修复 path，不操作任意同名应用，也不会在失败时向未知前台窗口发送
Escape。

如需测试非默认最终动作，可额外设置
`OPENDESK_ACCESSIBILITY_MENU_FINAL_ACTION_JSON='{"action":"setChecked","checked":true}'`。示例永远只提交
一次最终动作，readback 不匹配时也不会重试。

## Evidence

示例和原生 fixture 的日志、截图、状态、构建来源与清理计数统一写入：

```text
.runtime/tests/accessibility/
```

该目录是本地运行产物，不提交版本控制。正式 Runtime API 测试仍位于 `tests/runtime-api/`；单项命令为：

```bash
./dist/opendesk -script tests/runtime-api/accessibility.js -console-mode script
./dist/opendesk -script tests/runtime-api/accessibility-menu.js -console-mode script
./dist/opendesk -script tests/runtime-api/accessibility-lifecycle.js -console-mode script
```

完整 catalog/evidence gate 使用：

```bash
./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

模拟 backend 只证明确定性 Runtime 合同，不能标为 macOS AX 或 Windows UIA 真机通过。公开示例也只有
在以上一行命令原样运行、使用当前 build、观察到受控目标并完成资源清理后，才能报告 PASS。
