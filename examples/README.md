# JavaScript automation examples

OpenDesk 的公开自动化示例使用 JavaScript，并以 [`docs/api/`](../docs/api/README.md) 为 API 契约。网页侧快速索引位于 [`docs/api/examples/`](../docs/api/examples/README.md)。

## OpenDesk Examples

图形化浏览、分类搜索、源码查看、运行策略和安全一键运行由独立应用 [`apps/example-explorer/`](../apps/example-explorer/README.md) 提供。

从仓库根目录启动：

```bash
./dist/opendesk -ui -script apps/example-explorer/main.js -console-mode script -log-dir .runtime/apps/example-explorer
```

Explorer 会扫描 `examples/` 以发现目录变化，但普通列表只展示 [`catalog.json`](catalog.json) 登记的 canonical examples。helper、support、测试、smoke 和尚未审核的 JavaScript 不会因为扩展名为 `.js` 就进入普通用户列表。

`runPolicy: "safe"` 表示允许 Explorer 一键运行；`manual` 表示可以搜索、阅读源码和前置条件，但必须由用户根据说明手动运行。目录整理不能把鼠标输入、截图、OCR、录屏、声音、系统通知、全局快捷键或真实应用操作自动升级为 `safe`。

`catalog.json` 是所有正式 public examples 的索引，而不是部分白名单。每条记录都包含 canonical `path`（作为 `entries` 的 key）、`category`、`level`、`platforms`、`runPolicy`、`prerequisites`、`requiredEnv`、`expected` 和结构化 `launch`：

```json
{
  "runPolicy": "manual",
  "platforms": ["darwin"],
  "launch": {"kind": "script", "ui": true, "consoleMode": "script"}
}
```

`launch.kind: "script"` 对应 `-script`，`launch.kind: "ai-run"` 对应 `ai run`；需要输入的 ai-run 只展示 `--input-file <path-to-input.json>` 模板。`requiredEnv` 只列变量名，不保存 secret。`legacyNames` 是 Explorer 实际搜索的历史名称，不代表磁盘上的 wrapper。

## 目录契约

`examples/` 顶层只允许 `README.md`、`catalog.json` 和领域目录；**不再允许顶层 `.js/.json/.txt` 散件**。

```text
examples/
├── README.md
├── catalog.json
├── runtime/          # JavaScript / Execution / File / Command / System
├── desktop/          # window / keyboard / mouse / screen / screenshot / UI 定位
├── vision/           # OCR、截图字节与基础视觉
├── image-color/      # ImageColor 专题套件
├── audio/            # Sound / Audio
├── dialog/           # Dialog
├── notifications/    # 系统通知
├── events/           # Events / Global Shortcut
├── custom-ui/        # ui.createWindow / FloatingWindow
├── clipboard/
├── accessibility/
├── http/
├── scheduler/        # Scheduler task payload and acceptance commands
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
- 完成迁移的旧根入口直接退休，不保留 compatibility wrapper；Catalog `legacyNames` 仅保存历史名称/搜索上下文，并由 Explorer 搜索实际使用。
- `*.test.js`、`*smoke*`、fixture generator 和诊断脚本归 `tests/`；仅有历史价值的旧实验归 `.archive/`。
- `tests/` 负责正确性证明；示例中的结果检查不能代替 `tests/runtime-api/` 或领域测试。
- 执行日志、截图和临时产物写入 `.runtime/`，不提交运行结果。

## Canonical 示例目录

- [Runtime](runtime/README.md)：quickstart、console、Promise、等待、timer、环境、路径、File/JSON、Command、AppStorage、System、Page wait。
- [Desktop](desktop/README.md)：window、keyboard、mouse、page click、screen、screenshot、display modes、screen recording、UI 相对定位。
- [Vision](vision/README.md)：OCR、截图 bytes、基础 ImageColor。
- [Audio](audio/README.md)：Sound 播放、播放控制与经过审核的监听示例。
- [Dialog](dialog/README.md)：async/await 与 Promise chain。
- [Notifications](notifications/README.md)：发送通知、等待/关闭通知。
- [Events](events/README.md)：全局快捷键及权限准备。
- [Scheduler](scheduler/README.md)：可直接运行、也可由 Scheduler 调度的安全任务脚本与验收命令。
- [Applications](app/README.md)：Calculator、WeChat、应用窗口清单、千牛等真实应用场景。

已有独立专题目录如 `accessibility/`、`clipboard/`、`http/`、`sqlite/`、`native-extensions/` 保持其现有边界，不为了目录外观做无收益搬迁。

完整 Examples / Tests 归属和已退休路径见 [Examples 与 Tests 目录及迁移规则](../docs/quality/example-test-layout.md)。**不要批量执行整个 `examples/`。**

## 示例与正式测试的边界

公开示例用于学习接口和观察效果；即使示例带有结果检查，也不代表 Runtime contract、原生 UI 视觉或跨平台行为已经通过正式验收。开发者回归测试继续使用 `tests/runtime-api/` 和相应领域测试目录。

仅供开发的生成器、探针和诊断工具归 `tests/<domain>/tools/`；历史实验归 `.archive/`；一次性运行产物归 `.runtime/`。
