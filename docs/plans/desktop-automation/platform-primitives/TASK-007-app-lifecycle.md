# TASK-007 — App Lifecycle

Status: DONE
Priority: P1
Depends on: none

## Goal

把当前分散在 `page.openApp`、`System.processList()`、`System.killProcess()`、Window/PID 辅助逻辑中的应用生命周期能力整理成一致的 App 原语，避免上层自动化自己拼 PID、进程和窗口逻辑。

## 开始前必须审计

- `page.openApp` / `openURLInApp`。
- System process list / kill。
- Window 按 PID 操作。
- Recorder 对 app identity / pid 的保存方式。
- macOS bundle id、应用路径和启动方式的现有 helper。

## MVP API 候选

```js
App.launch(target, options?)
App.get(target)
App.list(options?)
App.isRunning(target)
App.waitForLaunch(target, options?)
App.waitForExit(target, options?)
App.terminate(target, options?)
App.restart(target, options?)
```

`target` 应优先支持稳定 identity，例如 bundle id / executable / PID；不要只靠可变的显示名称。

## Launch options 候选

```text
args
env
cwd
activate
waitUntilReady
timeout
```

平台不支持的字段必须显式 capability/error，不 silent ignore。

## 必须解决

- app identity 与 process identity 分离。
- 一个 App 多进程场景。
- launch 已运行 app 的语义。
- graceful terminate 与 force kill 区别。
- readiness 的定义：process started / window available / custom predicate。
- race condition：启动后 PID 变化、helper process。
- timeout / cancellation。

## 非目标

- 不重新实现完整 Process API。
- 不把 App 生命周期绑定到某一个 UI toolkit。
- 不把 `openURL` 浏览器行为混入 App core。

## 测试

至少覆盖：

1. 启动一个系统测试应用。
2. 已运行时再次 launch。
3. waitForLaunch。
4. graceful terminate。
5. force fallback（若设计支持）。
6. restart。
7. waitForExit。
8. app 不存在。
9. timeout。
10. PID 与 Window 联动 smoke。

## Done

- App API 复用现有 page/System/Window 能力，不出现第二套进程系统。
- macOS 至少一套真实 launch → ready → terminate Evidence。
- 旧接口兼容策略明确。
- 文档、类型、机器索引同步。

## Completion record

Decision: EXTEND

Base HEAD: `167126dfa853f4351feb5a9d1fcda0027d87d981`

Final Commit: 本任务的 task-closing commit（实际 SHA 见 Git 历史与连续执行最终报告）

### Audit

- 现有 `page.openApp()` / AI CLI `app.open` 已有平台 launcher，`System.getProcessList()` 与
  `killProcess()` 已用 gopsutil，Window 已有 PID metadata/动作，TASK-003 Events 已有 macOS
  `NSWorkspace.runningApplications` snapshot；Recorder 也保存 PID、bundle id、bundle path 与 window
  ownership。因此本卡不是新建 Process/Window/Event 系统，而是把约 50% 的已有能力整理成薄 App facade。
- 审计时不存在 `App` global、types、`docs/api`、机器索引、正式 conformance 或统一 wait/restart/
  graceful lifecycle。`third_party` / integrations 中也没有另一套 app lifecycle backend。
- `page.openURLInApp()` 保持独立 URL 能力；本轮没有新增 HTTP/MCP surface，也没有修改或复制
  `globalShortcut`。

### Implementation

- 新增 Experimental `App.launch/get/list/isRunning/waitForLaunch/waitForExit/terminate/restart/
  getCapabilities`。target 支持 PID、name、bundle id、bundle path；stable identity 可分组多个 process
  instance，PID restart 会先还原 bundle/path/name。
- macOS backend 复用 NSWorkspace identity、现有 gopsutil live process facade、`open -a/-b`、
  NSRunningApplication graceful/force 和现有 CoreGraphics PID-specific Window backend。真实 smoke 暴露并
  修复了无 AppKit runloop CLI 中 NSWorkspace snapshot stale 的问题：rich identity 只保留仍在 live
  process snapshot 的 PID，新启动 `.app` 从 executable path + NSBundle 补 bundle identity。
- readiness 明确定义为 `process` 或匹配 PID 的 on-screen `window`；custom predicate、args/env/cwd
  当前 capability=false / `NOT_SUPPORTED`，不 silent ignore。graceful timeout 不自动升级 force。
- 所有 async worker 属于 execution context，在 owner EventLoop settle；timeout/cancellation/teardown 后
  join，`RuntimeResourceCounts` 和 cleanup event 新增 `appWorkers/appPending`。
- 旧 `page.openApp(name)` 与 AI CLI 保持签名并共享 launcher bridge；System/Window/Events API 不变。

### Tests

- `go test ./automation ./pkg/execution ./pkg/nativeextension` -> PASS；覆盖 target/options、lowerCamel
  projection、多进程 group、已运行 second launch、window readiness、graceful/force、restart、timeout、
  cancellation、teardown、native namespace collision 与 execution resource counts。
- `./scripts/test_runtime_apis.sh unit` -> PASS，398/398；9 个 App contract 与 2 个 App behavior case
  全通过。证据：`.runtime/tests/runtime-api/20260901T204931Z-77316/`。
- 从仓库根目录原样执行公共示例：
  `./opendesk -script examples/app-lifecycle.js -console-mode script` -> PASS；示例仅在 Calculator 原本
  未运行时启动/restart/清理，并验证最终不运行。
- `./scripts/test_app_lifecycle.sh` -> PASS；编译并运行 repository-owned AppKit fixture，覆盖 launch、
  PID-window link、second launch、restart、graceful、force 与 waitForExit。
- `go test ./...` -> 本任务相关 packages PASS；`pkg/visionrun` 保持本 Goal 开始前已有的 4 个无关失败：
  两个缺 real validation input、一个缺 `capture_contract.json`、一个缺当前 preflight report。本任务未
  修改该 package，也未新增全仓失败。

### Evidence

- 平台：macOS 12.7.6 / amd64；backend=`nsworkspace-process-open`。
- 真实 fixture：first PID `77183`；second launch 保留该 PID；restart PID `77183 -> 77202`；
  graceful `force=false` 与明确 force `force=true` 均退出；最终 `running=false`。
- PID 对应标题 `OpenDesk App Lifecycle Fixture` 的 520×348 实窗；截图内容自适应、居中、无裁切或
  异常留白。截图：`.runtime/tests/platform-primitives/task-007-app-lifecycle/window.png`。
- 脱敏 evidence：`.runtime/tests/platform-primitives/task-007-app-lifecycle/evidence.json`；只含 fixture
  bundle id、PID、操作结果、平台和 artifact path，不含用户应用名/路径或窗口内容。
- execution cleanup：`appWorkers=0`、`appPending=0`、总 workers/callbacks=0；fixture 和 Calculator
  最终均无残留。

### API and documentation

- 类型：`types/App.d.ts`；用户文档：`docs/api/app.md`，同步 `docs/api/index.md` 与 `README.md`。
- 机器索引与 conformance：`docs/api/runtime-api.ai.json`、`tests/runtime-api/manifest.js`、
  `tests/runtime-api/unit/app.test.js`。
- 可复制用户示例：`examples/app-lifecycle.js`；正式 macOS gate：`scripts/test_app_lifecycle.sh` 与
  `tests/runtime-api/fixtures/app-lifecycle/`。

### Remaining

- API 保持 Experimental；本轮真实 installed-host evidence 只证明 macOS 12.7.6/amd64。Windows、
  Linux 和 macOS non-CGO 只保留明确 Partial/Not verified capability，不声称 live verified。
- 当前 launch 不支持 args/env/cwd，自定义 readiness predicate 也未实现；需要这些能力时应扩展同一
  backend/options contract，不创建第二套 App/Process API。
- macOS `.app` 内 helper process 会按 outer bundle identity 与主进程分组；非 bundle 后台 daemon 仍归
  System process API，不被伪装成 desktop App。
