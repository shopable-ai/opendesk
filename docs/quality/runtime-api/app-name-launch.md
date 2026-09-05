# App 按名称启动 Calculator：macOS 验收记录

状态：通过；严格 cold-start 与 warm/reuse 两条路径均有真实证据。

## 构建上下文

- HEAD：`77d1e780641c70db0a394ba00c6869d2af4f1a1b`
- 工作区：dirty（最终上下文记录时 178 条状态记录；并行任务的改动未重置、未覆盖）
- 构建命令：`make build`
- `dist/opendesk` SHA-256：`52f3a13eb76b682d3b204e63e0c51a7c4c2f8b5b45a59a69592d1f634773af32`
- `dist/opendesk-ui-host` SHA-256：`b420ecc30ef07f43c256f1ee32040c3d9fb376eb9fadfefc871adf323d01f37f`
- 运行环境：macOS 12.7.6 (21H1320), x86_64, Go 1.25.13, `AppleLanguages=(zh-Hans-CN)`。

一次早期 lifecycle gate 因共享源码在构建后发生变化而正确拒绝过期 binary；在相关并行改动收尾后，
重新执行 `make build` 和全部下列最终验证。

## 公开入口

从仓库根目录原样执行：

```bash
./dist/opendesk ai run tests/runtime-api/acceptance/app-launch-name.js
```

通过。执行 ID 为 `ai-20260905-201928-847000`，耗时 37,546 ms。完整报告为
`.runtime/ai/ai-20260905-201928-847000/app-name-launch/report.json`，运行摘要为
`.runtime/ai/ai-20260905-201928-847000/summary.json`。

- 此次为 strict-cold 成功后已运行实例的 warm/reuse 验收：PID `35517` 保持不变，未关闭或新建第二个实例。
- `计算器`、`{ name: '计算器' }`、`{ name: 'Calculator' }` 和显式
  `{ bundleId: 'com.apple.calculator' }` 都返回该实际 PID 与规范化的
  `{ kind: 'bundleId', value: 'com.apple.calculator' }` identity。
- 每次 `waitUntilReady: 'window'` 都观察到 PID `35517` 的窗口
  `darwin:35517:native:21140`，标题 `Calculator`，尺寸 232×321；process readiness 也单独验证。
- 无效输入、未知应用、缺失 bundle timeout 与别名 `waitForExit` 分别得到
  `INVALID_ARGUMENT`、`LAUNCH_FAILED`、`TIMEOUT`、`TIMEOUT`。
- 截图前通过同一 `App.launch(..., { activate: true })` 重新激活同一 bundle，再以已验证窗口坐标裁剪，
  不依赖可能降级为全屏的 active-window 查询：
  `.runtime/ai/ai-20260905-201928-847000/app-name-launch/calculator-window.png`。人工视觉检查通过：
  窗口内容、按钮、文字和边界均正常。
- execution 事件的 teardown 报告 `appWorkers: 0` 和 `appPending: 0`。

从仓库根目录原样执行：

```bash
./dist/opendesk ai run examples/open-calculator-by-name.js
```

通过。执行 ID 为 `ai-20260905-201812-770000`，耗时 859 ms；摘要为
`.runtime/ai/ai-20260905-201812-770000/summary.json`。该示例仅启动/激活并打印实际应用信息，
不输入、不清空、不 restart 或 terminate Calculator。

## 严格冷启动 gate

真正的冷启动不接受“目标已经在运行”的假阳性。使用同一公开验收脚本的正式 recipe 输入：

```bash
./dist/opendesk ai run tests/runtime-api/acceptance/app-launch-name.js --input '{"requireColdStart":true}'
```

当 `requireColdStart` 为 `true` 时，脚本先通过 `App.get({ bundleId: 'com.apple.calculator' })`
检查状态；如果发现已运行，它会在任何 `App.launch` 调用之前以 `COLD_START_PRECONDITION` 失败，
并把 `launches: []` 写入 artifact。此前 guard run `ai-20260905-201155-561000` 检测到已运行 PID
`90675`，随后独立只读 probe (`ai-20260905-201201-043000`) 仍观察到相同 PID，证明 guard 不会
启动、激活或关闭用户实例。

用户手动退出 Calculator 后，fresh probe `ai-20260905-201636-832000` 记录
`running: false`、`group: null`。同一 strict 命令随后以执行 ID `ai-20260905-201649-739000` 通过，
耗时 50,086 ms：`before: null`、`coldStart: "Evaluated"`，首个 `App.launch('计算器')` 创建实际
PID `35517`，并返回实际显示名 `Calculator`（而不是伪造为输入的中文名）。后续中文对象、英文名和
bundle ID 都复用 PID `35517`；每一步分别通过 process/window readiness。截图为
`.runtime/ai/ai-20260905-201649-739000/app-name-launch/calculator-window.png`，视觉检查通过，
teardown 为 `appWorkers: 0`、`appPending: 0`。该实例保持运行，未由验收关闭。

## 回归

- `./scripts/test_runtime_apis.sh unit`：通过，run ID `direct-20260905-201818-208000`；506 passed、0 failed。
  证据目录：`.runtime/tests/runtime-api/direct-20260905-201818-208000/`。其中包含
  `App normalizes documented Calculator names to the macOS bundle identity`，且 teardown 为
  `appWorkers: 0`、`appPending: 0`。
- `OPENDESK_LIVE_APP_LIFECYCLE=1 ./dist/opendesk -script scripts/test_app_lifecycle.js -console-mode script`：
  通过，执行 ID `direct-20260905-200309-665000`。隔离 fixture 的首次 launch、重复 launch 复用 PID、
  restart、graceful/force terminate 和 postcondition 均成功；证据为
  `.runtime/tests/platform-primitives/task-007-app-lifecycle/evidence.json` 与
  `.runtime/tests/platform-primitives/task-007-app-lifecycle/window.png`。视觉检查通过。
- `go test ./automation -run '^TestNormalizeMacOSSystemApplicationAlias$' -count=1` 和
  `go test ./automation -run '^(TestAppJSBindingLifecycleAndMultiProcessGrouping|TestAppWaitCancellationCleansResources)$' -count=1`
  均通过；后者断言 execution teardown 的 JavaScript catch 实际收到 `CANCELED`，并清空 App
  worker/pending。它们只覆盖内部规范化/cancellation seam，不替代上述 JavaScript Runtime 公开验收。

## 未验证范围

- Windows、Linux 和 macOS 无 cgo 未做 live Runtime 验证；它们保留既有行为，且不提供这两个中文/英文
  系统别名。
