# TASK-013 — System Session Control

Status: DONE
Priority: P2
Depends on: none

## Goal

在现有 shutdown / restart / sleep 等 System 能力基础上，补齐桌面自动化中真正有价值的会话级控制，并保持与电源管理职责清晰。

## 开始前必须审计

- 当前 `System` power/session 相关实现和文档。
- 已有 shutdown/restart/sleep 的权限和错误语义。
- 平台是否已有 lock/logout/screensaver helper。

## 候选能力

```js
System.lock()
System.logout(options?)
System.startScreenSaver()
System.getSessionState()
```

是否加入 `wake`、用户切换等能力必须经过平台稳定性与权限审计，不因接口对称而强行实现。

## 必须解决

- destructive action 的显式确认/安全边界。
- 当前 session identity。
- logout 与 shutdown/restart 的区别。
- 自动化执行被 session lock/logout 中断时的 evidence 和 teardown。
- 平台不支持时明确 capability。

## 非目标

- 不实现账户管理。
- 不实现密码/解锁绕过。
- 不实现远程桌面服务。

## 测试

破坏性操作不能只靠普通 CI。至少要求：unit contract、可安全执行的 lock/screensaver smoke、logout 的人工/隔离环境 evidence，且测试步骤必须能恢复环境。

## Done

- 复用现有 System 架构，不创建第二套 Power/Session 模块。
- destructive action 有清晰安全语义。
- 文档明确真实平台支持矩阵。

## Execution record — 2026-09-02

Decision: `EXTEND`

Base HEAD: `dfa88f867a98714d6eb0a9f823d05f3c5f5f97e5`

Final Commit: 本任务的 task-closing commit（实际 SHA 见 Git 历史与连续执行最终报告）

Implementation:

- 保留现有 `System.shutdown/restart/sleep` compatibility surface，在同一 `System` object 上增加
  `getSessionCapabilities`、`getSessionState`、`lock`、`logout`、`startScreenSaver`；没有创建第二套
  Power/Session runtime。
- 所有 session-changing action 必须先通过 `confirm: true` gate；支持的 backend 成功时只返回
  `initiated: true, verified: false`，不把异步请求接受冒充最终 session postcondition。
- macOS 只读 state 使用公开 `CGSessionCopyCurrentDictionary`，未知的 lock/remote/session id 明确为
  `null`。macOS lock/logout 没有公开稳定 route，拒绝 private `CGSession`、合成快捷键或
  AppleScript 冒充 Stable；屏保仅以 Experimental 启动系统 `ScreenSaverEngine.app`。
- Windows adapter 使用公开 `ProcessIdToSessionId` / `WTSGetActiveConsoleSessionId`、
  `LockWorkStation` 和 `ExitWindowsEx(EWX_LOGOFF)`；Linux adapter 在 `loginctl` 与
  `XDG_SESSION_ID` 同时可用时使用当前 systemd-logind session。二者均保持 target-runtime
  `verified: false`，没有制造 silent no-op。
- `wake`、unlock 与 switch-user 未暴露；没有密码绕过或远程桌面职责。

Tests:

- 聚焦 Go tests：
  `go test ./automation -run 'Test(SystemSession|DarwinSystemSession)' -count=1 -v` 通过。
- 正式 JavaScript Runtime API unit gate：418/418 通过；Evidence 位于
  `.runtime/tests/runtime-api/20260901T224026Z-55454/`。gate 只执行只读 state 与 confirmation
  contract，不会触发 session mutation。
- 文档一行命令从仓库根目录原样通过：
  `./opendesk -script examples/system-session-state.js -console-mode script`。
- Windows/Linux backend 的最小源码集合在当前 macOS host 使用对应 `GOOS/GOARCH` + `CGO_ENABLED=0`
  target compile 通过。全 `automation` package 的 Windows cross compile 仍被既有
  `third_party/robotgo` 的 Bitmap/Rect/input cgo surface 阻断，不归本卡引入。
- `go test ./...`：本任务相关 `automation`、`cmd/opendesk`、`pkg/execution`、`pkg/scheduler` 等通过；
  全仓仍仅因既有 `pkg/visionrun` 4 个缺少 real input/fixture 的测试失败。
- `git diff --check` 通过；`runtime-api.ai.json` 可由 `python3 -m json.tool` 解析。

Evidence:

- 当前构建在 macOS 12.7.6 (`21H1320`), x86_64 上读取真实 caller WindowServer session：
  active/on-console/login-done 为 true，lock state 保持 unknown/null；Evidence 位于
  `.runtime/tests/platform-primitives/task-013-system-session-control/evidence.json`。
- 执行前确认本机屏保密码策略为关闭且不存在既有 `ScreenSaverEngine`。真实 JS smoke 通过
  `System.startScreenSaver({confirm:true})` 启动一个新 PID，只按该 PID 强制清理并以
  `App.waitForExit` 验证退出；脱敏证据位于同目录 `screensaver-evidence.json`。
- macOS lock/logout capability 为 unsupported，因此没有触发锁定或注销。Windows/Linux logout
  只完成 target compile，未表述为目标系统 live Runtime evidence。
- 平台依据：
  [Apple CGSessionCopyCurrentDictionary](https://developer.apple.com/documentation/coregraphics/cgsessioncopycurrentdictionary%28%29)、
  [Microsoft LockWorkStation](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-lockworkstation)、
  [Microsoft ExitWindowsEx](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-exitwindowsex)、
  [systemd loginctl](https://www.freedesktop.org/software/systemd/man/latest/loginctl.html)。

Remaining:

- Windows/Linux installed/live Runtime 证据需要对应目标设备，按跨平台验收规则作为独立后续工作；
  本轮不启动 VM、Wine、Docker 或模拟器。
- macOS lock/logout 只有 user-mediated/private/Automation route；除非未来出现公开稳定 API 或明确
  integration policy，不进入 Core。
- legacy `shutdown/restart/sleep` 本卡未做 breaking confirmation 改造，后续若统一 destructive
  action contract 必须单独设计兼容迁移。
