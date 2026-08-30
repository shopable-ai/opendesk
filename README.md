# 使用说明

## 运行使用
clawdesk.exe -script examples/notify.js
clawdesk.exe -script examples/notify.js -delay 1


## CLI 模式运行脚本文件
go run main.go -script examples/test.js -delay 1

go run main.go -script examples/page.js
go run main.go -script examples/mouse.js
go run main.go -script examples/keyboard.js
go run main.go -script examples/screenshot.js

go run main.go -script examples/http.js -delay 1
go run main.go -script examples/promise.js -delay 1
go run main.go -script examples/timer.js
go run main.go -script examples/sleep.js
go run main.go -script examples/notify.js
go run main.go -script examples/window.js -delay 2
go run main.go -script examples/window-more.js
go run main.go -script examples/clipboard.js
go run main.go -script examples/appStorage.js
go run main.go -script examples/screen.js
go run main.go -script examples/sound.js
go run main.go -script examples/file.js
go run main.go -script examples/os.js


go run main.go -script examples/clipboard.test.js

go run main.go -script examples/globalThis.js

# 浏览器自动化双栈示例
go run main.go -script examples/browser_stack_legacy_smoke.js -stack legacy
go run main.go -script examples/browser_stack_upgraded_smoke.js -stack upgraded
go run main.go -script examples/browser_stack_playwright_smoke.js -stack playwright

# HTTP stack smoke docs and probes
# docs/browser-automation-http-smoke-guide.md
python3 examples/browser_stack_http_e2e_smoke.py http://127.0.0.1:60844 upgraded
python3 examples/browser_stack_http_e2e_smoke.py http://127.0.0.1:60844 playwright

go run main.go -script examples/imageColor.js
go run main.go -script examples/opencv.js
go run main.go -script examples/vision.ocr.js
go run main.go -script examples/mac/screenshot_permission_check.js
go run main.go -script examples/mac/request-macos-permissions.js
go run main.go -script examples/mac/request-macos-automation-popup.js
go run main.go -script examples/mac/automation-permission-wizard.js

### CLI 视觉模式（不启动 HTTP）
go run main.go -vision-ocr-image test.png -vision-provider paddle -vision-lang ch
go run main.go -vision-detect-ui-image test.png -vision-target-text 发送 -vision-provider paddle -vision-lang ch

### 一键冒烟测试
```bash
# 仅核心测试（不执行 Safari/微信 UI 自动化）
RUN_MAC_UI=0 ./scripts/e2e_smoke.sh

# 全量测试（macOS，包含 Safari/微信脚本）
RUN_MAC_UI=1 ./scripts/e2e_smoke.sh

# 多屏截图 App 端到端测试（编译 .app -> 启动 .app -> 输出尺寸/哈希分析）
./scripts/test_multi_display_app.sh
```


go run main.go -script examples/app/pinduoduo.js
go run main.go -script examples/app/qianniu.js

### libs
go run main.go -script examples/moment.js

go run main.go -script examples/start.js -timeout 0   # 无超时时限，默认 -timeout 30 分钟

go run main.go -http   # 启动 HTTP 服务器模式

### macOS 权限稳定运行（推荐）

排障手册（建议收藏）：
- `docs/macos-screenshot-troubleshooting.md`
- 浏览器双栈说明：`docs/browser-automation-stacks.md`
- 测试矩阵：`docs/browser-automation-test-matrix.md`
- HTTP 冒烟指南：`docs/browser-automation-http-smoke-guide.md`
- legacy raw escape hatch 迁移说明：`docs/browser-automation-legacy-escape-hatches.md`

`go run` 每次会编译到临时目录（可执行文件路径会变化），在 macOS 隐私权限（屏幕录制/辅助功能）场景下可能导致权限绑定不稳定。  
建议使用固定可执行文件或固定 `.app` 包：

```bash
# 1) 固定路径二进制（开发调试推荐）
REBUILD=1 ./scripts/run_macos_stable.sh -script examples/mac/wechat_agent_region_probe.js -timeout 4
# 之后不改代码时可不重编译：
./scripts/run_macos_stable.sh -script examples/mac/wechat_agent_region_probe.js -timeout 4

# 结构化区域识别 + 标注图 + 微信发送示例
PADDLE_OCR_ENDPOINT=http://127.0.0.1:8868/predict/ocr_system \
./scripts/run_macos_stable.sh -script examples/mac/wechat_structured_send.js -timeout 4

PADDLE_OCR_ENDPOINT=http://127.0.0.1:8868/predict/ocr_system \
./scripts/run_macos_stable.sh -script examples/mac/wechat_structured_send_v2.js -timeout 4
```

### Agent 直接驱动脚本执行

现在支持不落盘固定 `.js` 文件，直接把动态脚本文本送进运行时，适合 Agent 边生成边调试。

推荐入口：

```bash
# 直接传一段脚本文本
REBUILD=1 ./scripts/run_macos_stable.sh \
  -script-text "console.log('agent-inline')" \
  -timeout 4

# 从 stdin 读取动态脚本
printf "console.log('agent-stdin')\n" | \
  REBUILD=1 ./scripts/run_macos_stable.sh \
  -script-stdin \
  -timeout 4

# 从 stdin 读取，同时把本次执行内容保存成可回放脚本
printf "console.log('agent-stdin')\n" | \
  REBUILD=1 ./scripts/run_macos_stable.sh \
  -script-stdin \
  -save-last-script artifacts/last-agent-script.js \
  -timeout 4
```

这三种入口的定位：

- `-script`：继续兼容已有固定脚本文件
- `-script-text`：适合短脚本、一轮命令、Agent 直接拼接字符串执行
- `-script-stdin`：适合多行脚本、heredoc、pipe、Agent 动态输出

示例：

```bash
cat <<'EOF' | ./scripts/run_macos_stable.sh -script-stdin -timeout 4
console.log("agent session start");
await waitFor(100);
console.log("agent session end");
EOF
```

注意：

- `-script`、`-script-text`、`-script-stdin` 三者一次只能选一个
- `-save-last-script` 只负责把本次执行内容落盘，便于回放或转成正式脚本
- `./scripts/run_macos_stable.sh` 只是固定路径二进制包装器；当新增 CLI 参数后，第一次使用请加 `REBUILD=1`，确保 `dist/clawdesk-mac` 已按最新源码重编译
- `-console-mode script`：终端显示脚本日志、摘要和错误，适合人工确认脚本输出
- `-console-mode summary`：终端只显示摘要和错误；完整日志请看 `stdout.log`
- `-console-mode agent`：终端直接输出结构化小摘要，适合 Agent 低 token 读取
- `-output-format json`：stdout 输出 `agent_summary.json` 对应的小 JSON 结构，不再混入框架日志
- 三种脚本入口如果没有显式传 `-log-dir`，默认都会落到 `.runtime/runs/<executionId>/`
- 默认产物包括 `script_snapshot.js`、`stdout.log`、`stderr.log`、`summary.json`、`agent_summary.json`、`events.ndjson`
- `events.ndjson` 保存结构化事件流；`agent_summary.json` 保存给 Agent 直接读取的最小摘要

已验证：

- `go test .` 仅用于框架维护者回归
- `go test ./pkg/http` 用于 execution / SSE 路由回归
- `REBUILD=1 ./scripts/run_macos_stable.sh -script-text "console.log('hello')" -console-mode script -timeout 1`
- `printf "console.log('hello from stdin')\n" | REBUILD=1 ./scripts/run_macos_stable.sh -script-stdin -save-last-script /tmp/clawdesk-last.js -console-mode summary -timeout 1`
- `REBUILD=1 ./scripts/run_macos_stable.sh -script-text "console.log('json')" -output-format json -timeout 1`
- `REBUILD=1 ./scripts/run_macos_stable.sh -script-text "console.log('agent')" -console-mode agent -timeout 1`

可重复执行的 smoke 脚本：

```bash
# 维护者视角：包含 Go 回归 + 稳定包装器验证
./scripts/test_agent_direct_execution.sh

# 用户视角：仅用脚本和稳定包装器验证，不依赖 Go 测试能力
./scripts/test_agent_direct_execution_user_mode.sh
```

维护者脚本会验证：

- 根包测试通过
- `run_macos_stable.sh -script-text` 可执行
- `run_macos_stable.sh -script-stdin` 可执行
- `-save-last-script` 可落盘
- `summary.json` / `stdout.log` / `stderr.log` / `script_snapshot.js` / `agent_summary.json` / `events.ndjson` 都会生成

用户脚本会验证：

- `run_macos_stable.sh -script-text` 可执行
- `run_macos_stable.sh -script-stdin` 可执行
- 固定脚本文件执行兼容性仍然正常
- `-save-last-script` 可落盘
- `summary.json` / `stdout.log` / `stderr.log` / `script_snapshot.js` / `agent_summary.json` / `events.ndjson` 都会生成

```bash
# 2) 构建固定 .app（系统权限页按应用授予更直观）
./scripts/build_macos_app.sh
open dist/Clawdesk.app --args -script examples/mac/wechat_agent_region_probe.js -timeout 4

# 可选：使用固定签名身份，降低重编译后权限漂移概率
CODESIGN_IDENTITY="Apple Development: Your Name (TEAMID)" ./scripts/build_macos_app.sh

# 可选：跳过 codesign（本地调试）
SKIP_CODESIGN=1 ./scripts/build_macos_app.sh
```

说明：重编译后通常不需要每次重置权限；若使用 ad-hoc 签名（`-`）且系统判定签名身份变化，自动化权限偶发失效是可能的。

如果“自动化”没有弹窗或列表里没有出现条目，可重置后再次触发：

```bash
# 终端启动场景（按你实际终端选择其一）
tccutil reset AppleEvents com.apple.Terminal
tccutil reset AppleEvents com.googlecode.iterm2

# App 启动场景（Clawdesk.app 的 bundle id）
tccutil reset AppleEvents com.clawdesk.cli
```

然后再次运行：

```bash
open dist/Clawdesk.app --args -script examples/mac/request-macos-permissions.js -timeout 2
```

如需重新授权，可先重启终端，再在“隐私与安全性”里检查：
- 屏幕录制
- 辅助功能
- 输入监控
- 自动化

### 截图接口建议（避免错误区域）

- `page.screenshot()` 默认会优先按当前活动窗口坐标截图（`target: "activeWindow"`）。
- 需要整屏截图时请显式传 `fullPage: true` 或 `target: "screen"`。
- 需要固定区域时务必传完整 `clip: {x, y, width, height}`，`width/height` 必须大于 0（否则会直接报错，不再静默回退到整屏）。
- 多屏时可传 `displayIndex`（macOS 原生 `screencapture -D`）：`1` 主屏，`2` 第二屏。
- 在 `displayIndex > 0` 且传 `clip` 时，`x/y` 以目标屏幕局部坐标计算；`x<0` 表示从右边缘反向偏移，`y<0` 表示从底部反向偏移。

多屏推荐先查询屏幕元数据，再做截图坐标换算：

```js
const displays = Screen.getDisplays();
const primary = Screen.getPrimaryDisplay();
const virtual = Screen.getVirtualBounds();
console.log({ displays, primary, virtual });

// 示例：第二屏右上角 800x600
await page.screenshot({
  path: "temp/right_top_display2.png",
  target: "screen",
  displayIndex: 2,
  clip: { x: -800, y: 0, width: 800, height: 600 },
});
```

```js
const active = await window.getActiveWindow();
await page.screenshot({
  path: "temp/shot.png",
  clip: { x: active.x, y: active.y, width: active.width, height: active.height },
  target: "activeWindow",
});

// 第二块屏幕右上角 800x600（x=-800 表示从右侧锚定）
await page.screenshot({
  path: "temp/right_top_display2.png",
  target: "screen",
  displayIndex: 2,
  clip: { x: -800, y: 0, width: 800, height: 600 },
});
```

可在脚本里先做权限预检：

```js
const report = await page.checkScreenshotPermissions();
console.log(report);
```

建议排障时打开底层截图调试日志：

```bash
TM_SCREENSHOT_DEBUG=1 ./scripts/run_macos_stable.sh -script examples/mac/screenshot_permission_check.js -timeout 4
```

多屏错位排查可直接跑全量探测脚本（会输出每块屏的全屏图 + 四角裁剪图 + JSON 报告）：

```bash
TM_SCREENSHOT_DEBUG=1 ./scripts/run_macos_stable.sh -script examples/mac/screenshot_diagnose_all_displays.js -timeout 6
```

也可以一键唤起权限流程（打开权限页 + 触发权限探测）：

```js
const result = await page.requestMacPermissions({
  openSettings: true,
  section: "all", // all | accessibility | inputMonitoring | screenCapture | automation
});
console.log(result);
```

自动化脚本推荐在入口处加严格守卫（权限未就绪直接中止）：

```js
await page.ensureMacPermissions({
  openSettingsOnFail: true,
  section: "all",
  strict: true,
});
```

注意：macOS 不允许程序自动把应用加入白名单，仍需你在系统设置中手动打开开关。

### macOS 安全设计说明（关键）

- `屏幕录制/辅助功能/输入监控/自动化` 都由系统 TCC 管理，权限绑定到“调用主体”（App Bundle 或终端应用）。
- `自动化(AppleEvents)` 页面没有“+ 添加应用”按钮，必须先由程序发起一次真实控制请求，系统才弹窗。
- 无界面 `.app` 也可以申请权限，不要求必须有 GUI 按钮；但必须由该身份实际发起请求。
- 避免使用 `go run` 作为长期运行身份（路径变化会导致权限绑定不稳定），建议固定 `.app` 或固定二进制。

显式触发 Automation 弹窗（推荐）：

```js
const r = await page.requestMacAutomationPermission("System Events");
console.log(r);
```

如果你想用最小脚本直接判断当前 app 身份下的 Automation 状态：

```bash
open dist/Clawdesk.app --args -script examples/mac/automation_permission_check.js -timeout 2
```

返回重点：

- `state=granted`：当前身份已具备 Automation 权限
- `state=pending_user_consent`：系统弹窗已触发，等你点“允许”
- `state=denied_or_failed`：当前未通过，通常需要重置 TCC 或换成稳定 app 身份重试

如果系统弹窗显示的是 `Terminal`、`iTerm` 或 `sshd-keygen-wrapper`，说明这次授权绑到了脚本宿主，不是 `Clawdesk.app`。这种情况下请改用固定 App 身份重新触发：

```bash
open dist/Clawdesk.app --args -script examples/mac/request-macos-automation-popup.js -timeout 2
```

如果窗口一闪而过，使用“向导脚本”（会保持进程并循环触发请求）：

```bash
open dist/Clawdesk.app --args -script examples/mac/automation-permission-wizard.js -timeout 5
```

如果 `.app` 一闪而过，优先用包装脚本启动（会自动把 `-script` 转成绝对路径）：

```bash
./scripts/open_macos_app.sh -script examples/mac/automation-permission-wizard.js -timeout 5
```

go run main.go -script examples/test.txt -delay 1  # 后期未使用，可能无法使用

clawdesk.exe -script examples/app/qianniu.js

### 测试
clawdesk.exe -script examples/clipboard.test.js
go run main.go -script examples/clipboard.test.js
clawdesk.exe -script examples/opencv.js



C:/Users/111/Documents/workspace/clawdesk/clawdesk.exe -script C:/Users/111/Documents/workspace/clawdesk/examples/app/clickQianniuFloat.js


## 调试
直接代码运行。
> 发布环境，exe直接运行。把代码从默认的ts.config.js中提取出来，放到其他文件。 cmd 运行，如 clawdesk.exe -script qianniu.js  就可以看到报错信息。

## 构建

go build -o clawdesk.exe main.go

go build -ldflags="-s -w" -o clawdesk.exe main.go

## HTTP 服务器模式
旧版本,可能无法使用
go run main.go -http -port 60844

### Agent-friendly execution API

新增接口：

- `POST /executions`：创建一条新的脚本执行任务
- `GET /executions/{id}`：读取单次执行状态快照
- `GET /executions/{id}/summary`：读取最终 Agent 小摘要
- `GET /executions/{id}/events`：SSE 实时事件流

示例：

```bash
# 创建 execution
curl -X POST http://localhost:60844/executions \
  -H 'Content-Type: application/json' \
  -d '{
    "script": "for (let i = 0; i < 3; i++) { console.log(\"tick-\" + i); await page.waitFor(120); }",
    "timeout": 120
  }'

# 读取状态
curl http://localhost:60844/executions/<executionId>

# 读取最终 Agent 摘要
curl http://localhost:60844/executions/<executionId>/summary

# 读取实时 SSE 事件流
curl -N http://localhost:60844/executions/<executionId>/events
```

双栈 HTTP payload 示例：

- `examples/browser_stack_http_upgraded_smoke.js`
- `examples/browser_stack_http_playwright_smoke.js`

真实端到端 HTTP smoke：

```bash
# 1) 启动 HTTP 服务
go run . -http -port 60844

# 2) 在另一个终端运行 upgraded e2e smoke
python3 examples/browser_stack_http_e2e_smoke.py http://127.0.0.1:60844 upgraded

# 3) 或运行 playwright e2e smoke
python3 examples/browser_stack_http_e2e_smoke.py http://127.0.0.1:60844 playwright
```

SSE 默认推送：

- `meta`
- `script`
- `summary`
- `error`

不默认推送 `framework` 噪音。

### 旧兼容接口

```bash
curl -X POST http://localhost:60844/SCRIPT_RUN \
  -H 'Content-Type: application/json' \
  -d '{
    "script": "console.log(\"Hello\")",
    "timeout": 30
  }'

curl http://localhost:60844/status
```

说明：

- `/SCRIPT_RUN` 仍可用，但内部会转到新的 execution 流程
- `/status` 现在返回服务健康状态，并附带最近一次 execution 快照
- 请求体支持 `stack` 字段：`legacy | upgraded | playwright`

浏览器自动化栈说明：

- `legacy`：保持历史 `page.*`/`mouse.*`/`keyboard.*` 行为，默认值
- `upgraded`：启用统一兼容层，暴露 `open/getPage/getContext/query/locator/waitFor/click/type/press/evaluate/screenshot/cookies/storage/session`
- `playwright`：在 `upgraded` 基础上把新版 facade 作为默认页面对象，并注入 `playwright.chromium.launch()` 入口

### OCR + UI Detect API (PaddleOCR)

先配置环境变量（示例）：

```bash
# 1) 启动本地 PaddleOCR HTTP 服务
pip install -r scripts/requirements-paddle-ocr.txt
uvicorn scripts.paddle_ocr_server:app --host 127.0.0.1 --port 8868

# 2) 配置 clawdesk 使用 paddle provider
export VISION_OCR_PROVIDER=paddle
export VISION_OCR_LANG=ch
export PADDLE_OCR_ENDPOINT=http://127.0.0.1:8868/predict/ocr_system

# 可选：限制用户可选语言（逗号分隔）
export PADDLE_OCR_LANGS=ch,en,chinese_cht,japan,korean
# 可选：Paddle 默认语言
export PADDLE_OCR_DEFAULT_LANG=ch
```

查询能力（用于前端构建“provider/language 下拉框”）:

```bash
curl -X GET 'http://localhost:60844/v1/vision/capabilities'
```

OCR:

```bash
curl -X POST http://localhost:60844/v1/vision/ocr \
  -H 'Content-Type: application/json' \
  -d '{"imagePath":"test.png","lang":"ch","provider":"paddle"}'
```

统一配置对象（推荐，便于后续切换 provider/language）:

```bash
curl -X POST http://localhost:60844/v1/vision/ocr \
  -H 'Content-Type: application/json' \
  -d '{
    "imagePath":"test.png",
    "visionProfile":{
      "provider":"paddle",
      "language":"ch",
      "timeoutMs":15000,
      "minConfidence":0.5
    }
  }'
```

语言切换（支持 `lang` 或 `language`）:

```bash
curl -X POST http://localhost:60844/v1/vision/ocr \
  -H 'Content-Type: application/json' \
  -d '{"imagePath":"test.png","language":"en","provider":"paddle"}'
```

UI 文本定位:

```bash
curl -X POST http://localhost:60844/v1/vision/detect-ui \
  -H 'Content-Type: application/json' \
  -d '{"imagePath":"test.png","lang":"ch","provider":"paddle","targetText":"发送"}'
```

`visionProfile` + 单次覆盖参数（顶层参数优先）:

```bash
curl -X POST http://localhost:60844/v1/vision/detect-ui \
  -H 'Content-Type: application/json' \
  -d '{
    "imagePath":"test.png",
    "visionProfile":{"provider":"paddle","language":"en"},
    "lang":"ch",
    "targetText":"发送"
  }'
```



## 代码说明
axios.go 被http.go 和axios.js 代替， 可以删除。
