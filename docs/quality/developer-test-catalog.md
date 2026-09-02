# 开发测试脚本

所有命令从仓库根目录执行。优先复制下面的 JavaScript 命令；每项只写“测试什么”和“怎么运行”。
`.sh` 只放在文末，用于多步骤编排、真实窗口控制、watchdog 或环境准备。

## JavaScript：直接运行

### 原生插件

原生插件 quickstart：

```text
./dist/opendesk -script examples/native-extensions/quickstart.js -console-mode script
```

原生插件 OCR quickstart（macOS）：

```text
./dist/opendesk -script examples/native-extensions/ocr-quickstart.js -console-mode script
```

### Runtime API

Runtime API contract：

```text
./dist/opendesk -script tests/runtime-api/contract.js -console-mode script
```

Runtime API unit（一次加载全部 unit 子测试）：

```text
./dist/opendesk -script tests/runtime-api/unit.js -console-mode script
```

Runtime API safe smoke：

```text
./dist/opendesk -script tests/runtime-api/smoke.js -console-mode script
```

Runtime API coverage：

```text
./dist/opendesk -script tests/runtime-api/coverage.js -console-mode script
```

Runtime API negative：

```text
./dist/opendesk -script tests/runtime-api/negative.js -console-mode script
```

Runtime API 其他专用 JS：

```text
tests/runtime-api/async-lifecycle.js
tests/runtime-api/cleanup_validation.js
tests/runtime-api/failure_exit.js
tests/runtime-api/failure_exit_result.js
tests/runtime-api/quality_gate.js
tests/runtime-api/macos_live.js
```

其中 `async-lifecycle.js` 需要 live fixture；`failure_exit_result.js`、`cleanup_validation.js`
和 `quality_gate.js` 需要正式 gate 产生的 run context，不能当作普通单文件 smoke。

Runtime API 内部加载代码（不是单独测试入口）：

```text
tests/runtime-api/framework.js
tests/runtime-api/manifest.js
tests/runtime-api/catalog_validation.js
tests/runtime-api/coverage_validation.js
tests/runtime-api/crypto.js
tests/runtime-api/live_driver.js
tests/runtime-api/acceptance.js
tests/runtime-api/acceptance_negative.test.js
```

Global Shortcut JavaScript smoke（需要 macOS 全局快捷键权限，并按脚本提示触发）：

```text
./dist/opendesk -script tests/runtime-api/global-shortcut-smoke.js -console-mode script
```

Dialog 手动交互脚本（需要 `-ui` 和真实窗口）：

```text
./dist/opendesk -ui -script tests/runtime-api/dialog-interactions.js -console-mode script
```

### OpenCV ImageColor

OpenCV fixture JavaScript（需要 CGO、OpenCV 4.13.x 和 GoCV v0.43.0）：

```text
go run -tags opencv ./cmd/opendesk -script tests/opencv/image_color_opencv_test.js -timeout 1 -console-mode script -log-dir .runtime/tests/opencv/js
```

### WeChat 布局识别

先生成固定图片：

```text
go run ./tests/wechat/tools/generate-simple-image
go run ./tests/wechat/tools/generate-mock-image
```

简化图片：

```text
./dist/opendesk -script tests/wechat/test_simple_image.js -console-mode script
```

复杂图片：

```text
./dist/opendesk -script tests/wechat/test_complex_image.js -console-mode script
```

模拟微信完整识别：

```text
./dist/opendesk -script tests/wechat/run_and_visualize.js simple
./dist/opendesk -script tests/wechat/run_and_visualize.js complex
```

模拟微信可视化：

```text
./dist/opendesk -script tests/wechat/test_with_visualization.js -console-mode script
```

真实微信快速检查：

```text
./dist/opendesk -script tests/wechat/wechat_quick_test.js -console-mode script
```

真实微信截图：

```text
./dist/opendesk -script tests/wechat/wechat_screenshot_quick.js -console-mode script
```

真实微信完整可视化：

```text
./dist/opendesk -script tests/wechat/wechat_visualization.js -console-mode script
```

### LocateAnything

最小 grounding smoke：

```text
./dist/opendesk -script tests/locateanything/demo_grounding.js -timeout 2
```

Stage 02 model-only：

```text
./dist/opendesk -script tests/locateanything/scripts/run_stage_02_model_only.js -timeout 5
```

Stage 03 script-assisted：

```text
./dist/OpenDesk.app/Contents/MacOS/opendesk -script tests/locateanything/scripts/run_stage_03_script_assisted.js -timeout 8
```

Stage 03b browser smoke：

```text
./dist/opendesk -script tests/locateanything/scripts/run_stage_03b_browser_smoke.js -timeout 8
```

Stage 04 boundary stress：

```text
./dist/opendesk -script tests/locateanything/scripts/run_stage_04_boundary_stress.js -timeout 5
```

### DesktopVision 和 Scheduler

Calculator Level 1 locate dry-run：

```text
./dist/opendesk -script tests/desktopvision/calculator/scripts/level1-locate-dry-run.js -console-mode script
```

Scheduler live smoke：

```text
./dist/opendesk -script tests/scheduler/fixtures/live-smoke.js -console-mode script
```

## JavaScript：由 runner 加载的测试文件

下面这些是实际的测试 JS 源码。它们保留独立文件名，方便按功能查找；不要把它们误写成
可以脱离 runner 单独运行的命令。直接运行上面的 `unit.js`、正式 live/custom-ui/dialog
入口时，会加载对应文件。

### Runtime API unit 子测试

```text
tests/runtime-api/unit/page.test.js
tests/runtime-api/unit/mouse.test.js
tests/runtime-api/unit/keyboard.test.js
tests/runtime-api/unit/global-shortcut.test.js
tests/runtime-api/unit/events.test.js
tests/runtime-api/unit/app.test.js
tests/runtime-api/unit/notifications.test.js
tests/runtime-api/unit/touchscreen.test.js
tests/runtime-api/unit/window.test.js
tests/runtime-api/unit/screen.test.js
tests/runtime-api/unit/system.test.js
tests/runtime-api/unit/file.test.js
tests/runtime-api/unit/storage.test.js
tests/runtime-api/unit/clipboard.test.js
tests/runtime-api/unit/console.test.js
tests/runtime-api/unit/http.test.js
tests/runtime-api/unit/notify.test.js
tests/runtime-api/unit/native-extension.test.js
tests/runtime-api/unit/axios.test.js
tests/runtime-api/unit/http-axios.test.js
tests/runtime-api/unit/ocr.test.js
tests/runtime-api/unit/vision.test.js
tests/runtime-api/unit/vision-layout.test.js
tests/runtime-api/unit/image-color.test.js
tests/runtime-api/unit/sound.test.js
tests/runtime-api/unit/audio.test.js
tests/runtime-api/unit/dialog.test.js
tests/runtime-api/unit/custom-ui.test.js
tests/runtime-api/unit/floating-window.test.js
tests/runtime-api/unit/browser.test.js
tests/runtime-api/unit/context.test.js
tests/runtime-api/unit/page-compat.test.js
tests/runtime-api/unit/window-library.test.js
tests/runtime-api/unit/globals.test.js
```

### Runtime API live 子测试

这些测试需要由 live runner 注入隔离浏览器 fixture，不能直接执行 `macos_live.js`。

```text
tests/runtime-api/live/page.test.js
tests/runtime-api/live/permissions-session.test.js
tests/runtime-api/live/capture-screen.test.js
tests/runtime-api/live/mouse.test.js
tests/runtime-api/live/wheel.test.js
tests/runtime-api/live/keyboard.test.js
tests/runtime-api/live/touchscreen.test.js
tests/runtime-api/live/screen.test.js
tests/runtime-api/live/window.test.js
tests/runtime-api/live/clipboard.test.js
tests/runtime-api/live/http-axios.test.js
tests/runtime-api/live/composition.test.js
tests/runtime-api/live/composition-replay.test.js
tests/runtime-api/live/app-lifecycle.test.js
tests/runtime-api/live/notify-icon.test.js
```

对应 runner：`tests/runtime-api/macos_live.js`；它由正式 live 入口准备 fixture。

### Runtime API Custom UI 子测试

```text
tests/runtime-api/custom-ui/window.test.js
tests/runtime-api/custom-ui/floating-window-layout.test.js
tests/runtime-api/custom-ui/floating-window-vertical.test.js
tests/runtime-api/custom-ui/floating-window-callback.test.js
tests/runtime-api/custom-ui/floating-window-lifecycle.test.js
tests/runtime-api/custom-ui/floating-window-negative.test.js
tests/runtime-api/custom-ui/floating-window-lifecycle.probe.js
tests/runtime-api/custom-ui/floating-window-http-lifecycle.probe.js
tests/runtime-api/custom-ui-missing-host.js
tests/runtime-api/custom-ui-config.js
```

对应 runner：`tests/runtime-api/custom-ui.js`。真实 native host、HTTP server 和清理检查由
正式 Custom UI 入口统一准备。

### Runtime API Dialog 测试

正式 Dialog 测试使用这些 JavaScript 文件：

```text
tests/runtime-api/dialog-no-ui.js
tests/runtime-api/dialog-validation.js
tests/runtime-api/dialog-lifecycle.js
tests/runtime-api/dialog-unobserved.js
tests/runtime-api/dialog-layout-probe.js
tests/runtime-api/dialog-adaptive-layout-probe.js
tests/runtime-api/dialog-ax-controller.js
```

其他 Dialog 调试脚本：

```text
tests/runtime-api/dialog-busy.js
tests/runtime-api/dialog-enter.js
tests/runtime-api/dialog-esc.js
tests/runtime-api/dialog-host-crash.js
tests/runtime-api/dialog-secure.js
tests/runtime-api/dialog-timeout-catch.js
tests/runtime-api/dialog-timeout.js
tests/runtime-api/dialog-titlebar-close.js
```

### Native Extension 测试 JS

这些 JS 由 Native Extension harness 复制到隔离目录后调用；它们不是普通 cwd 下的单文件
命令，避免误把源码目录当成已安装插件目录：

```text
tests/extensions/native-plugin/disabled.js
tests/extensions/native-plugin/list-only.js
tests/extensions/native-plugin/smoke.js
tests/extensions/native-plugin/user-root.js
tests/extensions/native-plugin/hello-again.js
tests/extensions/native-plugin/error-privacy.js
tests/extensions/native-plugin/app-call.js
tests/extensions/native-plugin/canonical-diagnostics.js
tests/extensions/native-process/smoke.js
```

### WeChat 其他 JavaScript 测试和诊断

这些文件都属于 WeChat 测试域；需要哪一个时，可套用这个单文件命令：

```text
./dist/opendesk -script tests/wechat/具体文件名.js -console-mode script
```

静态图片、算法和可视化：

```text
tests/wechat/agent_test.js
tests/wechat/analyze_offset.js
tests/wechat/analyze_separators.js
tests/wechat/check_full_result.js
tests/wechat/color_based_recognition.js
tests/wechat/complete_test.js
tests/wechat/complete_visualization.js
tests/wechat/evaluate_accuracy.js
tests/wechat/generate_mock_wechat.js
tests/wechat/generate_visualization.js
tests/wechat/inspect_candidates.js
tests/wechat/interactive_recognition.js
tests/wechat/optimize_parameters.js
tests/wechat/optimize_with_postprocessing.js
tests/wechat/practical_progressive.js
tests/wechat/progressive_recognition.js
tests/wechat/progressive_region_recognition.js
tests/wechat/run_and_visualize.js
tests/wechat/smart_recognition.js
tests/wechat/test_color_based.js
tests/wechat/test_complete_recognition.js
tests/wechat/test_complex_image.js
tests/wechat/test_interactive.js
tests/wechat/test_mock_recognition.js
tests/wechat/test_progressive.js
tests/wechat/test_simple_image.js
tests/wechat/test_with_visualization.js
tests/wechat/visualize_regions.js
```

真实微信窗口：

```text
tests/wechat/visualize.js
tests/wechat/wechat_auto_fix.js
tests/wechat/wechat_complete_test.js
tests/wechat/wechat_deep_validation.js
tests/wechat/wechat_param_tuning.js
tests/wechat/wechat_quick_test.js
tests/wechat/wechat_screenshot_quick.js
tests/wechat/wechat_simple_test.js
tests/wechat/wechat_visualization.js
```

### 其他 JavaScript 文件

LocateAnything 的 `common.js`、`wechat_inject.js` 是被 Stage 脚本加载的辅助代码；MCP 的
两个 `main.js` 是 Node 工具；Scheduler 的 `write-result.js` 由 Go Scheduler 测试注入
输出路径。它们的路径如下：

```text
tests/locateanything/scripts/common.js
tests/locateanything/scripts/wechat_inject.js
tests/mcp/tools/guard-smoke/main.js
tests/mcp/tools/macos-smoke/main.js
tests/scheduler/fixtures/write-result.js
```

完整查找所有测试 JS：

```text
find tests -type f -name '*.js' -print | sort
```

## 必要的 Shell 编排入口

下面的 Shell 不是 JS 的重复包装，而是确实包含多个步骤或系统级动作的入口：

Runtime API 正式 gate（默认 mode 是 `smoke`）：

```text
./scripts/test_runtime_apis.sh contract
./scripts/test_runtime_apis.sh unit
./scripts/test_runtime_apis.sh smoke
./scripts/test_runtime_apis.sh coverage
./scripts/test_runtime_apis.sh negative
./scripts/test_runtime_apis.sh live
./scripts/test_runtime_apis.sh custom-ui-config
./scripts/test_runtime_apis.sh custom-ui
./scripts/test_runtime_apis.sh dialog
```

普通 `contract/unit/smoke/coverage/negative` 不需要写 `OPENDESK_BINARY=`；入口会生成
run-local binary。只有要锁定已有二进制时才写，例如：

```text
OPENDESK_BINARY=./dist/opendesk ./scripts/test_runtime_apis.sh smoke
```

通知图标和全局快捷键必须指定实际 macOS binary，保留变量是为了避免测错程序：

```text
OPENDESK_BINARY=./dist/OpenDesk.app/Contents/MacOS/opendesk ./scripts/test_runtime_apis.sh notify-icon-live
OPENDESK_BINARY=./dist/opendesk ./tests/runtime-api/global-shortcut-smoke-darwin.sh
```

其他正式测试或编排：

```text
./scripts/test_app_lifecycle.sh
./scripts/test_app_icons.sh
./scripts/test_recorder.sh
./tests/cli-install/test_macos_cli_installer.sh
./tests/wechat/run_e2e_test.sh
./scripts/check_opencv.sh
./scripts/e2e_smoke.sh
./scripts/audit_repo_layout.sh
python3 scripts/validate_browser_automation_evidence.py
go test -count=1 ./pkg/mcpserver ./cmd/opendesk-mcp
go test -count=1 ./tests/mcp/tools/stdio-smoke
node tests/mcp/tools/guard-smoke/main.js --binary ./dist/opendesk-mcp --evidence .runtime/tests/mcp/guard-smoke
node tests/mcp/tools/macos-smoke/main.js --binary ./dist/opendesk-mcp --evidence .runtime/tests/mcp/macos-smoke
python3 tests/locateanything/scripts/run_stage_01_env.py
python3 tests/locateanything/scripts/run_stage_05_report.py
```

旧兼容入口仍保留，但不维护第二套测试实现：

```text
./scripts/test_host_apis.sh smoke
```

构建、安装和权限辅助脚本不是测试：`build_macos_app.sh`、`build_automation_bootstrap_app.sh`、
`build_permission_bootstrap_app.sh`、`generate_app_icons.sh`、`install_macos_cli.sh`、
`open_macos_app.sh`、`run_macos_stable.sh`、`run_permission_bootstrap.sh`、
`reset_macos_permissions.sh`。

运行日志、截图和结果统一写入 `.runtime/`，不提交运行产物。
