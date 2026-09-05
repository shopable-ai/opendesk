# Shell gate → OpenDesk Runtime JavaScript 审计与迁移

日期：2026-09-05
工作目录：仓库根目录 `/Users/mac/Documents/workspace/clawdesk`

## 结论

本轮按“公开 Runtime 行为归 JavaScript，构建/安装/POSIX 生命周期继续归 shell”的边界逐文件迁移。
正式 JS 入口一律由 OpenDesk `-script` 启动，不使用 Node runner，也不把 `ai run` 当成 shell→JS 的默认入口。

| 原 shell | 当前正式入口 | 原 shell 处理 | 验证状态 |
| --- | --- | --- | --- |
| `scripts/e2e_smoke.sh` | `./dist/opendesk -script scripts/e2e_smoke.js -console-mode script` | 已删除 | JS 与 child Runtime 正常；当前 dirty baseline 的 `automation` Go gate 失败 |
| `scripts/test_recorder.sh` | `./dist/opendesk -script scripts/test_recorder.js -console-mode script` | 已删除 | PASS |
| `scripts/test_app_lifecycle.sh` | `OPENDESK_LIVE_APP_LIFECYCLE=1 ./dist/opendesk -script scripts/test_app_lifecycle.js -console-mode script` | 已删除 | 未 opt-in 时安全 SKIP；本轮未做 live/视觉验收 |
| `scripts/test_ai_calculator_recipe.sh` | `OPENDESK_LIVE_CALCULATOR=1 ./dist/opendesk -script scripts/test_ai_calculator_recipe.js -console-mode script` | 已删除 | 未 opt-in 时安全 SKIP；既有 live 证据未重跑 |
| `tests/wechat/run_e2e_test.sh` | `./dist/opendesk -script tests/wechat/e2e.js -console-mode script` | 已删除 | 编排正常；正确暴露现有 complex 阈值失败 |
| `scripts/test_runtime_apis.sh` | `./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script` | 已删除 | direct contract、默认 smoke、sound-cancel 均 PASS |

较大的业务/断言实现继续位于测试域：e2e、Recorder、App lifecycle 分别在 `tests/<domain>/`；Runtime API
的 9 行正式 loader 位于 `scripts/test_runtime_apis.js`，catalog 编排位于
`tests/runtime-api/gates/catalog-runner.js`。因此 `scripts/` 只提供清晰入口，不复制业务断言。

`scripts/test_runtime_apis.sh` 与 `scripts/test_host_apis.sh` 已删除。最新协作要求以 OpenDesk Runtime
JavaScript 为唯一正式入口；mode 通过 `OPENDESK_RUNTIME_API_MODE` 选择。

## `test_runtime_apis.sh` 拆分

迁入 `tests/runtime-api/gates/catalog-runner.js` 的职责包括：

- run-id、`.runtime/tests/runtime-api/<runId>/`、context/process records；
- run-local binary build/copy、SHA-256 与 Git/source provenance；
- Go Basic 与 macOS Apple Vision Native Extension build/context；
- generated Runtime JS、watchdog 前台调用和 15 个 mode registry；
- contract、unit、smoke、coverage、negative、failure-exit；
- Runtime cleanup NDJSON、资源归零和 residual-process 断言；
- File JSON artifact/envelope/cleanup 验收；
- Environment 显式 env file、默认 `.env`/`.opendesk.env`、公开 example、HTTP isolation；
- Custom UI config 的 cwd、优先级、success/error 断言。

总入口不使用 `ai run`。只有 `environment` 与 `file-json` mode 内部保留 `ai run`，因为这两个子场景
专门验收 AI CLI execution 的 JSON envelope/artifact/env-file 行为；Calculator gate 内部同理只为创建其
需要比较的独立 Workflow executions。它们不是正式外层 runner。

## 必须保留的 shell

下列 `scripts/*.sh` 属于构建、安装、系统包装或 POSIX 环境工作，不应为了“全 JS”机械迁移：

| 脚本 | 保留理由 |
| --- | --- |
| `scripts/audit_repo_layout.sh` | 审计 Git mode、跟踪状态和 POSIX 仓库布局。 |
| `scripts/build_automation_bootstrap_app.sh` | AppleScript App bundle/plist/codesign 构建。 |
| `scripts/build_macos_app.sh` | Go/Swift 编译、bundle staging、plist 与 codesign。 |
| `scripts/build_permission_bootstrap_app.sh` | macOS permission helper bundle 构建与签名。 |
| `scripts/check_opencv.sh` | CGO/pkg-config/GoCV/OpenCV 工具链环境 gate。 |
| `scripts/generate_app_icons.sh` | 生成并发布受版本控制的跨平台图标资产。 |
| `scripts/install_macos_cli.sh` | 被测对象就是 shell launcher、PATH 与安装生命周期。 |
| `scripts/open_macos_app.sh` | 规范化参数后交给 macOS `open` 的系统包装器。 |
| `scripts/render_custom_ui_icon_catalog.sh` | Swift/AppKit 图标渲染与 publish 构建入口。 |
| `scripts/reset_macos_permissions.sh` | 显式破坏性 `tccutil reset` 运维命令。 |
| `scripts/run_macos_stable.sh` | App bundle/binary exec 与 payload provenance 警告。 |
| `scripts/run_permission_bootstrap.sh` | 并发启动真实系统权限 helper 并等待授权。 |
| `scripts/test_app_icons.sh` | ICNS/ICO/PNG、plist、codesign 与 package gate。 |
| `scripts/validate_test_architecture.sh` | 跨 Go、Node 审计、cross-compile、vendor 与 source-drift 的元 gate；它还负责先构建 OpenDesk。 |
| `tests/cli-install/test_macos_cli_installer.sh` | 验收 shell launcher quoting/PATH/install/uninstall。 |

旧 `scripts/test_host_apis.sh` 已删除，不复制 Runtime API 实现。

## 必须保留的进程生命周期 seam

`Command.run()` 没有 process handle/PID、signal、detached、流式 stdout、PTY 或交互 stdin。以下 shell
只在必须让一个进程存活、再由另一个进程观察/发信号时使用；公共 Runtime 行为仍由 `.js` 场景断言：

| seam | 行数 | 必要性 |
| --- | ---: | --- |
| `tests/runtime-api/seams/async-fixture-session.sh` | 62 | loopback fixture 与三种兼容 stack 的 Runtime 同时存活。 |
| `tests/runtime-api/seams/command-cancel.sh` | 81 | 读取 ready/PID、发送 SIGINT、确认 child/descendant teardown；观察 JSON 由 JS 验证。 |
| `tests/runtime-api/seams/environment-http-session.sh` | 48 | HTTP server 常驻期间运行独立 controller；HTTP payload/状态断言在 `environment-http-controller.js`。 |
| `tests/runtime-api/seams/live-fixture-session.sh` | 108 | opt-in macOS live fixture start/ready/stop。 |
| `tests/runtime-api/seams/custom-ui-session.sh` | 385 | HTTP cancel/server shutdown 与 native UI host 并发生命周期。 |
| `tests/runtime-api/seams/dialog-session.sh` | 418 | 在 Dialog Promise pending 时运行 AX observer/controller、截图和外部按键。 |
| `tests/runtime-api/sound-cancel-smoke.sh` | 79 | 在同步 Sound playback 中发送 SIGINT；结果与资源归零由 `sound-cancel-validation.js` 断言。 |
| `tests/runtime-api/global-shortcut-smoke-darwin.sh` | 66 | Runtime 持续运行时由独立 System Events 注入全局按键。 |

Custom UI 与 Dialog 两个 seam 仍偏大，是当前 Runtime API 的明确限制：其中还有可继续迁为 JS validator 的
JSON/布局检查。本轮优先消除了 `scripts/test_runtime_apis.sh` 的双实现，同时保留全部 15 个 mode 的现有
live 行为；没有为了缩行数删除 live 功能。它们必须显式选择 mode，本轮没有执行，也不进入 CI。

## 原样验证与证据

| 从仓库根目录执行的命令 | 结果 | 证据 |
| --- | --- | --- |
| `OPENDESK_RUNTIME_API_MODE=contract OPENDESK_RUNTIME_API_RUN_ID=20260905-runtime-js-contract ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script` | PASS；catalog 325 methods，contract 323/323 | `.runtime/tests/runtime-api/20260905-runtime-js-contract/`；outer `direct-20260905-190543-004000` |
| `OPENDESK_RUNTIME_API_RUN_ID=20260905-runtime-js-smoke ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script` | PASS；contract 323/323、unit 477/477、smoke 3/3、async 三栈各 1/1、negative 10/10 | `.runtime/tests/runtime-api/20260905-runtime-js-smoke/`；outer `direct-20260905-190604-383000` |
| `OPENDESK_RUNTIME_API_MODE=sound-cancel OPENDESK_RUNTIME_API_RUN_ID=20260905-runtime-js-sound-cancel OPENDESK_BINARY=./dist/opendesk ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script` | PASS；canceled，SIGINT→exit 上界 50ms，Sound 三项资源均为 0 | `.runtime/tests/runtime-api/20260905-runtime-js-sound-cancel/`；outer `direct-20260905-190810-317000` |
| `OPENDESK_RUNTIME_API_MODE=contract OPENDESK_RUNTIME_API_RUN_ID=20260905-runtime-js-contract ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script` | PASS；证明 direct JS 入口可用 | `.runtime/tests/runtime-api/20260905-runtime-js-contract/`；outer `direct-20260905-190543-004000` |
| `./dist/opendesk -script scripts/test_recorder.js -console-mode script` | PASS | `.runtime/tests/recorder/direct-20260905-185104-238000/summary.json` |
| `./dist/opendesk -script scripts/e2e_smoke.js -console-mode script` | FAIL（现有 baseline） | `.runtime/tests/e2e/direct-20260905-185115-532000/summary.json`；child Runtime PASS，`automation` allowlist 引用了非公开 `Mouse.PressButtonForPID` |
| `./dist/opendesk -script tests/wechat/e2e.js -console-mode script` | FAIL（现有算法真值） | `.runtime/tests/wechat/runs/direct-20260905-185414-103000/summary.json`；simple=100/100/100，complex=50/50/50 |
| `./dist/opendesk -script scripts/test_app_lifecycle.js -console-mode script` | SKIP | outer `direct-20260905-185104-526000`；未设置 live opt-in，不能记为 live pass |
| `./dist/opendesk -script scripts/test_ai_calculator_recipe.js -console-mode script` | SKIP | outer `direct-20260905-185104-514000`；未设置 live opt-in，不能记为 live pass |

所有执行证据均位于 `.runtime/`，不得提交。`live`、`live-only`、`custom-ui`、`dialog`、
`notify-icon-live` 本轮均未运行，因此没有功能或视觉通过声明。

## 全量 `.sh` 盘点与后续目标

本次盘点覆盖仓库内全部 23 个正式 `.sh` 文件。分类不是按文件扩展名机械迁移，而是按
“是否需要 POSIX、外部进程生命周期、macOS 权限/签名、CGO 工具链或安装语义”判断：

| 文件 | 行数 | 结论 | 理由 / 后续目标 |
| --- | ---: | --- | --- |
| `scripts/audit_repo_layout.sh` | 64 | 保留 | Git mode、仓库布局和 POSIX 扫描；归入元审计目标。 |
| `scripts/build_automation_bootstrap_app.sh` | 45 | 保留 | AppleScript App bundle/plist/codesign 构建。 |
| `scripts/build_macos_app.sh` | 182 | 保留 | Go/Swift 编译、bundle staging、签名和发布产物。 |
| `scripts/build_permission_bootstrap_app.sh` | 59 | 保留 | macOS 权限 helper bundle 构建和签名。 |
| `scripts/check_opencv.sh` | 56 | 保留，已验证 | `pkg-config`、CGO、GoCV/OpenCV 工具链探测；不是 Runtime API 行为。完整 gate 已有独立 `.runtime/` 日志和 JS fixture 证据，不迁为 Runtime JS。 |
| `scripts/generate_app_icons.sh` | 204 | 保留 | 图标生成与受版本控制资产发布。 |
| `scripts/install_macos_cli.sh` | 181 | 保留 | shell launcher、PATH、安装/卸载和 legacy adoption 生命周期。 |
| `scripts/open_macos_app.sh` | 40 | 保留 | macOS `open` 系统包装和参数规范化。 |
| `scripts/render_custom_ui_icon_catalog.sh` | 45 | 保留 | Swift/AppKit 图标渲染与 publish。 |
| `scripts/reset_macos_permissions.sh` | 44 | 保留 | 显式破坏性 `tccutil reset` 运维动作。 |
| `scripts/run_macos_stable.sh` | 41 | 保留 | App/binary exec 及 payload provenance 检查。 |
| `scripts/run_permission_bootstrap.sh` | 39 | 保留 | 并发启动真实权限 helper 并等待授权。 |
| `scripts/test_app_icons.sh` | 235 | 保留 | ICNS/ICO/PNG、plist、签名和 package gate。 |
| `scripts/validate_test_architecture.sh` | 136 | 保留 | Go/Node 审计、cross-compile、vendor、source-drift 和构建。 |
| `tests/cli-install/test_macos_cli_installer.sh` | 80 | 保留 | 被测对象就是 shell installer/launcher 行为。 |
| `tests/runtime-api/global-shortcut-smoke-darwin.sh` | 66 | 保留 | 需要独立 System Events 注入全局按键。 |
| `tests/runtime-api/seams/async-fixture-session.sh` | 62 | 保留 | loopback fixture 与兼容 stack 并行存活。 |
| `tests/runtime-api/seams/command-cancel.sh` | 81 | 保留 | 读取 PID、发送 SIGINT、验证 child/descendant teardown。 |
| `tests/runtime-api/seams/custom-ui-session.sh` | 384 | 保留，待拆 | HTTP/native UI host 并发生命周期；后续只拆 JSON/layout validator，不移除 live 控制。 |
| `tests/runtime-api/seams/dialog-session.sh` | 417 | 保留，待拆 | AX observer/controller、截图和外部按键需要独立进程；后续拆布局断言。 |
| `tests/runtime-api/seams/environment-http-session.sh` | 48 | 保留 | HTTP server 常驻期间运行独立 controller。 |
| `tests/runtime-api/seams/live-fixture-session.sh` | 107 | 保留 | opt-in macOS live fixture 的启动、ready、stop。 |
| `tests/runtime-api/sound-cancel-smoke.sh` | 79 | 保留 | 同步 Sound 阻塞期间从外部发送 SIGINT；业务结果已由 JS 验证。 |

后续目标按优先级固定为：

1. `check_opencv.sh` 工具链目标：**已完成**。核对了文档命令、失败分类和 `.runtime/tests/opencv/` 证据；不删除、不新增第二执行器。
2. `custom-ui-session.sh` 拆分目标：把可由 Runtime 观察的 JSON/布局/结果断言迁入 `.js`，保留 server、host、cancel 和 watchdog 生命周期。
3. `dialog-session.sh` 拆分目标：把可由 Runtime 观察的状态/布局结果迁入 `.js`，保留 AX、截图、外部按键和 pending Promise 生命周期。
4. 活跃引用收口目标：新增或更新文档只能使用 direct `-script` 命令；带日期的历史报告保留原始证据，但不得作为当前用户入口。
5. 跨平台工具链目标：对 `validate_test_architecture.sh` 及 Native Extension 相关构建仅做 cross-compile/package 证据；Linux/Windows live Runtime 另设目标，不用模拟器补齐。

每个未完成目标都绑定以下可验证入口和证据位置：

| 目标 | 原样命令（仓库根目录） | 预期证据 | 当前状态 |
| --- | --- | --- | --- |
| Custom UI seam 拆分 | `OPENDESK_RUNTIME_API_MODE=custom-ui OPENDESK_RUNTIME_API_RUN_ID=<runId> ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script` | `.runtime/tests/runtime-api/<runId>/results/custom-ui.json`、`.runtime/tests/custom-ui/` | 待拆分，未宣称通过 |
| Dialog seam 拆分 | `OPENDESK_RUNTIME_API_MODE=dialog OPENDESK_RUNTIME_API_RUN_ID=<runId> ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script` | `.runtime/tests/runtime-api/<runId>/results/dialog.json`、`.runtime/tests/dialog/` | 待拆分，未宣称通过 |
| 活跃引用收口 | `rg -n 'scripts/(test_runtime_apis|test_host_apis|test_recorder|test_app_lifecycle|test_ai_calculator_recipe)\\.sh|tests/wechat/run_e2e_test\\.sh' README.md QUICKSTART.md AGENTS.md docs/api docs/quality/developer-test-catalog.md tests/README.md tests/runtime-api scripts tests/extensions` | 只允许审计文档中的“已删除”说明 | 当前入口已收口 |
| 架构/跨平台 gate | `./scripts/validate_test_architecture.sh` | `.runtime/tests/` 下 gate 日志及 cross-compile/package 记录 | 待独立运行；不等同目标系统 live |

### OpenCV 目标证据

从仓库根目录原样执行：

```bash
bash -o pipefail -c './scripts/check_opencv.sh 2>&1 | tee .runtime/tests/opencv/check-opencv.log'
```

结果：PASS（exit 0）。GoCV `v0.43.0`、OpenCV `4.13.0`、native health check、tagged Go
seam 均通过；OpenDesk JS fixture 47 assertions 通过。证据位于
`.runtime/tests/opencv/check-opencv.log` 和 `.runtime/tests/opencv/js/summary.json`。
