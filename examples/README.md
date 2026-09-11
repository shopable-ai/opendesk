# JavaScript automation examples

OpenDesk 的公开自动化示例使用 JavaScript，并以 [`docs/api/`](../docs/api/README.md) 为 API 契约。网页侧快速索引位于 [`docs/api/examples/`](../docs/api/examples/README.md)。

## OpenDesk Examples

图形化浏览、分类搜索、源码查看、运行策略和安全一键运行由独立应用 [`apps/example-explorer/`](../apps/example-explorer/README.md) 提供。

从仓库根目录启动：

```bash
./dist/opendesk -ui -script apps/example-explorer/main.js -console-mode script -log-dir .runtime/apps/example-explorer
```

Explorer 会扫描 `examples/` 以发现目录变化，但普通列表只展示 [`catalog.json`](catalog.json) 登记的 canonical examples。helper、support、`*.test.js`、`*smoke*` 和尚未审核的 JavaScript 不会因为扩展名为 `.js` 就进入普通用户列表。

`runPolicy: "safe"` 表示允许 Explorer 一键运行；`manual` 表示可以搜索、阅读源码和前置条件，但必须由用户根据说明手动运行。目录整理不能把鼠标输入、截图、OCR、录屏、声音、系统通知或真实应用操作自动升级为 `safe`。

## 目录契约

新的公开示例按能力领域进入目录；不要继续把业务 `.js` 堆到 `examples/` 根目录：

```text
examples/
├── README.md
├── catalog.json
├── runtime/          # JavaScript / Execution / File / Command / System 等基础 Runtime
├── desktop/          # window / keyboard / mouse / screen / screenshot / recording
├── vision/           # OCR、截图字节与基础视觉示例
├── image-color/      # ImageColor 专题套件
├── audio/            # Sound / Audio 专题
├── dialog/           # Dialog async/await 与 Promise-chain
├── notifications/    # 系统通知
├── custom-ui/        # ui.createWindow / FloatingWindow
├── clipboard/
├── accessibility/
├── http/
├── sqlite/
├── app/              # 具体应用场景
├── app-mode/
├── ai-cli/
├── native-extensions/
└── mac/              # 现有 macOS 专项，后续再统一平台目录
```

规则：

- **目录表达领域，文件名表达能力**；新增 public example 使用 `kebab-case.js`。
- 单文件示例直接放在领域目录；多文件示例使用明确入口，并把 helper / assets / fixtures 与入口区分。
- `examples/` 根目录不再保留 compatibility wrapper，也不再新增 canonical `.js`。
- 已完成迁移的旧入口直接退休；Catalog `aliases` 仅保存历史名称/搜索上下文，不代表旧文件仍存在。
- `tests/` 负责正确性证明；示例中的结果检查不能代替 `tests/runtime-api/` 或领域测试。
- 执行日志、截图和临时产物写入 `.runtime/`，不提交运行结果。

## Canonical 示例目录

- [Runtime](runtime/README.md)：quickstart、console、Promise、等待、timer、环境、路径、File/JSON、Command、AppStorage、System、Page wait。
- [Desktop](desktop/README.md)：window、keyboard、mouse、page click、screen、screenshot、display modes、screen recording。
- [Vision](vision/README.md)：OCR、截图 bytes、基础 ImageColor。
- [Audio](audio/README.md)：Sound 播放与播放控制；历史 smoke/fixture 文件需单独分类。
- [Dialog](dialog/README.md)：async/await 与 Promise chain。
- [Notifications](notifications/README.md)：发送通知、等待/关闭通知。
- [Applications](app/README.md)：Calculator、WeChat、应用窗口清单、千牛等真实应用场景。

已有独立专题目录如 `accessibility/`、`clipboard/`、`http/`、`sqlite/`、`native-extensions/` 保持其现有边界，不为了目录外观做无收益搬迁。

完整 Examples / Tests 归属和已退休路径见 [Examples 与 Tests 目录及迁移规则](../docs/quality/example-test-layout.md)。**不要批量执行整个 `examples/`。**

## 原生 Dialog

两个 canonical 示例：

```bash
./opendesk -ui -script examples/dialog/async-await.js -console-mode script
./opendesk -ui -script examples/dialog/promise-chain.js -console-mode script
```

普通体验是一条启动命令加真实窗口交互；WindowServer、AX observer/controller、截图探针和 watchdog 属于正式自动化验收。完整契约见 [`docs/api/dialog.md`](../docs/api/dialog.md)。

## 示例与正式测试的边界

公开示例用于学习接口和观察效果；即使示例带有结果检查，也不代表 Runtime contract、原生 UI 视觉或跨平台行为已经通过正式验收。开发者回归测试继续使用 `tests/runtime-api/` 和相应领域测试目录。

Go 源码不是公开 Runtime API 示例。仅有以下有意分开的例外：

- `legacy/`：保留历史 host-side 程序用于兼容背景；
- `native-extensions/`：包含实验性 native-process 协议示例与 JavaScript Runtime quickstart，并参与独立构建/打包流程。

仅供开发的生成器、探针和诊断工具应归入 `tests/<domain>/tools/`；一次性运行产物归入 `.runtime/`。
