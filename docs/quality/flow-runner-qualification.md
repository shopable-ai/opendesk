# Flow Runner Qualification

基准：2026-09-18，本地 `master` 工作树（提交基线 `84a6415c`）。

状态值只使用 `PASS / FAIL / BLOCKED / NOT_RUN`。`BLOCKED` 表示资格脚本已安全执行并记录了外部前置条件；它不是视觉或功能通过。

## 迁移范围与兼容边界

- 正式产品入口和目录为 `apps/opendesk/flow-runner.js` 与 `apps/opendesk/flow-runner/`；`main.js` 只加载 Flow Runner 的 controller、player 与 shortcut decorator。
- `apps/opendesk/script-runner-v1/` 是 legacy / frozen historical implementation，只作历史参考，不由产品入口导入或执行。
- 只保留两个读取兼容边界：已安装用户的 `OPENDESK_SCRIPT_RUNNER_DIR` fallback（canonical `OPENDESK_FLOW_RUNNER_DIR` 优先）与 Runtime Log 对旧 `script-runner-simple/runs` 的只读发现。它们不重新暴露旧 controller、global 或产品路径。
- JavaScript、`.mjs`、`.odpkg` 与 `-script` 是执行格式/Runtime 参数，不是迁移时可机械改名的 UI 术语。

## 自动化验证

| 项目 | 状态 | 当前证据 |
| --- | --- | --- |
| Flow Runner controller、player、产品 composition 与 product locale 注册 | PASS | `node --test tests/custom-ui/flow-runner.test.js tests/custom-ui/flow-runner-player.test.js tests/custom-ui/product-flow-runner.test.js tests/app-lifecycle/product-localization.test.js`（64/64） |
| Recorder 内嵌 bundle 与 canonical `apps/opendesk/localization.js` 同步 | PASS | `go generate ./internal/recorderbundle`，随后 `go test ./internal/recorderbundle ./cmd/opendesk ./internal/appmodepayload -count=1` |
| Run / Stop shortcut 状态、冲突诊断和 macOS/Windows 可见标签 | PASS | `./dist/opendesk -script tests/runtime-api/flow-runner-shortcuts.js -console-mode script`；`.runtime/runs/direct-20260918-011358-824000/summary.json` |
| Windows App Mode payload 的 staged 文件集合 | PASS | `.runtime/tests/flow-runner/windows-package/expected.txt` 与 `actual.txt` 相同 |

## 原生资格矩阵

| 项目 | macOS | Windows | 说明 |
| --- | --- | --- | --- |
| 当前 bundle 的 Flow Runner 窗口、屏幕截图和 AX 高级控件 | BLOCKED | NOT_RUN | `tests/runtime-api/flow-runner-native-macos.js` 在启动前发现另一会话的源码 App Mode UI host（PID 28961，`dist/opendesk-ui-host`）。它写入 `.runtime/tests/flow-runner/native-macos/1789665141254-direct-20260918-011221-232000/blocked.json` 并退出，不启动/终止该实例。 |
| 工具条六个主要控件无裁切、长名称、面板定位、原生键盘和关闭清理 | BLOCKED | NOT_RUN | 必须在上项解除单实例冲突后，以当前签名 `dist/OpenDesk.app` 运行同一资格脚本并保存新截图/AX snapshot；不得把源码 UI host 的现有窗口当作 bundle 证据。 |
| Flow Runner shortcut Runtime contract | PASS | PASS（模拟 platform label） | 见上方 direct Runtime evidence。Windows label 由同一 JS Runtime scenario 覆盖；这不构成 Windows 桌面 live validation。 |
| Windows cross-compile / native UI host | NOT_RUN | NOT_RUN | 当前没有完成 RobotGo/CGO Windows toolchain 的完整 cross compile；不能以 payload staging 或 macOS 结果代替。 |
| Windows installed/live Runtime | NOT_RUN | NOT_RUN | 需要目标系统设备上的独立后续资格，不启动 Docker、Wine、VM 或系统镜像来伪造 live evidence。 |

## 复测命令

从仓库根目录运行：

```bash
node --test tests/custom-ui/flow-runner.test.js tests/custom-ui/flow-runner-player.test.js tests/custom-ui/product-flow-runner.test.js tests/app-lifecycle/product-localization.test.js
go generate ./internal/recorderbundle
go test ./internal/recorderbundle ./cmd/opendesk ./internal/appmodepayload -count=1
./dist/opendesk -script tests/runtime-api/flow-runner-shortcuts.js -console-mode script
./dist/opendesk -script tests/runtime-api/flow-runner-native-macos.js -console-mode script
```

最后一条命令只在没有其他 OpenDesk Flow Runner/App Mode 实例时才会启动当前 `dist/OpenDesk.app`。成功时写入 screenshot、`result.json` 与 AX snapshot；冲突时写入 `blocked.json`，状态必须维持 `BLOCKED`。所有运行产物只写入 `.runtime/`，不得提交。
