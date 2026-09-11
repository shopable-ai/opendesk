# JavaScript automation examples

OpenDesk 的公开自动化示例使用 JavaScript，并以 [`docs/api/`](../docs/api/README.md) 为 API 契约。
网页侧快速索引位于 [`docs/api/examples/`](../docs/api/examples/README.md)。

## OpenDesk Examples

图形化浏览、分类搜索、源码查看、运行策略和安全一键运行由独立应用
[`apps/example-explorer/`](../apps/example-explorer/README.md) 提供。

从仓库根目录启动：

```bash
./dist/opendesk -ui -script apps/example-explorer/main.js -console-mode script -log-dir .runtime/apps/example-explorer
```

Explorer 仍会扫描 `examples/` 以发现目录变化，但**普通列表只展示 [`catalog.json`](catalog.json)
登记的 canonical examples**。旧兼容入口通过 `aliases` 关联到 canonical 文件，不重复显示；helper、support、
`*.test.js`、`*smoke*` 和尚未审核的 JavaScript 也不会因为扩展名为 `.js` 就进入普通用户列表。

`runPolicy: "safe"` 表示允许 Explorer 一键运行；`manual` 表示可以搜索、阅读源码和前置条件，但必须由用户
根据说明手动运行。目录整理不能把鼠标输入、截图、OCR、录屏、声音、系统通知或真实应用操作自动升级为
`safe`。

## 目录契约

新的公开示例按能力领域进入目录；不要继续把业务 `.js` 堆到 `examples/` 根目录：

```text
examples/
├── README.md
├── catalog.json
├── runtime/          # JavaScript / Execution / File / Command / System 等基础 Runtime
├── desktop/          # window / keyboard / mouse / screen / screenshot / recording
├── vision/           # OCR、截图字节与基础视觉示例
├── image-color/      # 已形成独立 README/fixtures 的 ImageColor 专题套件
├── audio/            # Sound / Audio 专题
├── dialog/           # Dialog 的 async/await 与 Promise-chain 写法
├── notifications/    # 系统通知发送、等待与关闭
├── custom-ui/        # ui.createWindow / FloatingWindow 教学示例
├── clipboard/
├── accessibility/
├── http/
├── sqlite/
├── app/              # 具体桌面应用发现、启动和生命周期示例
├── app-mode/
├── ai-cli/
├── native-extensions/
└── mac/              # 现有 macOS 专项；后续平台整理时再统一迁移
```

规则：

- **目录表达领域，文件名表达能力**；新增 public example 使用 `kebab-case.js`。
- 单文件示例直接放在领域目录；多文件示例应使用一个明确入口，并把 helper / assets / fixtures 与入口区分。
- `examples/` 根目录现有 `.js` 只允许作为薄兼容入口或尚待单独审查的 legacy 文件；不再新增新的 canonical 实现。
- 已发布旧路径迁移后保留薄兼容入口，canonical 实现只有一份；`catalog.json` 的 `aliases` 记录兼容路径。
- `tests/` 负责正确性证明；示例中的少量结果检查不能代替 `tests/runtime-api/` 或领域测试。
- 执行日志、截图和临时产物写入 `.runtime/`，不提交运行结果。

## 当前 canonical 基础目录

基础 Runtime 位于 [`runtime/`](runtime/README.md)，包括 quickstart、console、Promise、等待、timer、环境、路径、
File/JSON、Command、AppStorage、System 和 Page wait。桌面能力位于 [`desktop/`](desktop/README.md)，包括已有的
keyboard/window 示例和本轮归位的 mouse、page click、screen、screenshot、display modes、screen recording。
具体应用场景位于 [`app/`](app/README.md)，包括只读应用发现、WeChat 窗口检查以及 macOS Calculator 的启动/生命周期示例。

散落在根目录的历史入口例如：

```text
console.js                    -> runtime/console.js
globalThis.js                 -> runtime/global-this.js
promise.js                    -> runtime/promise.js
appStorage.js                 -> runtime/app-storage.js
page.waitfor.js               -> runtime/page-wait.js
mouse.js                      -> desktop/mouse.js
page.js                       -> desktop/page-click.js
screen.js                     -> desktop/screen-info.js
screenshot.js                 -> desktop/screenshot.js
screenshot_bytes_smoke.js     -> desktop/screenshot-bytes.js
display-modes.js              -> desktop/display-modes.js
screen-record-region.js       -> desktop/screen-record-region.js
vision.ocr.js                 -> vision/ocr.js
vision_bytes_roundtrip.js     -> vision/bytes-roundtrip.js
sound.js                      -> audio/play.js
sound-playback.js             -> audio/playback-control.js
dialog.js                     -> dialog/async-await.js
dialog-promise-chain.js       -> dialog/promise-chain.js
notify.js                     -> notifications/send.js
notifications.js              -> notifications/lifecycle.js
check_all_apps.js             -> app/running-apps.js
check_wechat.js               -> app/wechat-window-inspect.js
open-calculator-by-name.js    -> app/open-calculator-by-name.js
app-lifecycle.js              -> app/lifecycle-calculator.js
```

旧路径暂时继续工作，但文档和 Explorer 应推荐右侧 canonical 路径。

## 已维护的使用示例

文件、固定命令与显式测试服务请求见 [runtime/](runtime/README.md)；剪贴板文本见
[clipboard/](clipboard/README.md)；只读窗口查询、指定窗口输入和 bounds 控制见
[desktop/](desktop/README.md)。具体应用示例独立在 [app/](app/README.md)，不再混入通用窗口示例。

原生语义元素和菜单示例位于 [`accessibility/`](accessibility/README.md)。它们只面向可信本地 execution，
要求明确、可验证且可安全清理的目标；运行产物统一写入 `.runtime/tests/accessibility/`。

原生流式 HTTP 下载示例与自动 loopback 自测位于 [`http/`](http/README.md)。普通示例使用小型公网只读文档；
确定性自测自动管理 loopback fixture，两者的结果和证据不混用。

完整迁移台账、兼容退出条件和验证边界见
[Examples 与 Tests 目录及迁移规则](../docs/quality/example-test-layout.md)。不要批量执行整个 `examples/`。

## macOS：按名称打开系统计算器

从仓库根目录运行 canonical 示例：

```bash
./dist/opendesk ai run examples/app/open-calculator-by-name.js
```

示例使用 `App.launch('计算器', { waitUntilReady: 'window', timeout: 10000 })`，只启动或激活 Calculator、
确认其实际 identity 并打印结果；它不会输入、清空、restart 或 terminate 已有实例。旧
`examples/open-calculator-by-name.js` 只是兼容入口。完整契约见 [`docs/api/app.md`](../docs/api/app.md)。

## 路径与源码上下文

```bash
./dist/opendesk -script examples/runtime/path.js -console-mode script
```

它使用全局 `path` 计算 artifact 路径，并展示可信文件入口的 `Execution.scriptPath/scriptDir`。
完整契约见 [`docs/api/path.md`](../docs/api/path.md)。

## 原生 Dialog

Dialog 的两个 canonical 示例现在位于：

- [`dialog/async-await.js`](dialog/async-await.js)：直接使用 `async` / `await`；
- [`dialog/promise-chain.js`](dialog/promise-chain.js)：使用 `.then()` / `.catch()` / `.finally()`。

从仓库根目录运行：

```bash
./opendesk -ui -script examples/dialog/async-await.js -console-mode script
./opendesk -ui -script examples/dialog/promise-chain.js -console-mode script
```

旧 `examples/dialog.js` 与 `examples/dialog-promise-chain.js` 只是兼容入口。普通体验是一条启动命令加真实窗口交互；
WindowServer、AX observer/controller、截图探针和 watchdog 属于正式自动化验收，不应包装成新手运行步骤。
完整契约见 [`docs/api/dialog.md`](../docs/api/dialog.md)。

## 示例与正式测试的边界

公开示例用于学习接口和观察效果；即使示例带有结果检查，也不代表 Runtime contract、原生 UI 视觉或跨平台行为
已经通过正式验收。开发者回归测试继续使用 `tests/runtime-api/` 和相应领域测试目录。

Go 源码不是公开 Runtime API 示例。仅有以下有意分开的例外：

- `legacy/`：保留历史 host-side 程序用于兼容背景；
- `native-extensions/`：包含实验性 native-process 协议示例与 JavaScript Runtime quickstart，并参与独立构建/打包流程。

仅供开发的生成器、探针和诊断工具应归入 `tests/<domain>/tools/`；一次性运行产物归入 `.runtime/`。
