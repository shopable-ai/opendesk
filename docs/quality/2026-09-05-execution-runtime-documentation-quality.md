# Execution 与 JavaScript Runtime 文档发布质量评分

日期：2026-09-05

范围：`Execution` 独立用户文档、Runtime 公开边界、导航、机器索引、TypeScript 声明与正式
Runtime API contract/unit evidence。

结论：**97 / 100，达到不低于 95 分的发布门槛。**

## 评分

| 项目 | 得分 | 结果 |
| --- | ---: | --- |
| 可发现性与信息架构 | 20 / 20 | `Execution` 有独立页面，并进入 README、API 索引、全局 API 与机器索引。 |
| 契约完整性 | 25 / 25 | 11 个字段均说明类型、语义、默认值或边界，并覆盖 input、env、artifact、隐私与生命周期。 |
| Runtime 语义准确性 | 25 / 25 | Runtime 页面只说明真实执行模型；browser/context/upgraded/playwright 仅作为非公开兼容边界，不再提供方法表或示例。 |
| 同步与回归防线 | 20 / 20 | 文档、manifest、TypeScript 与 JavaScript tests 同步；catalog 会拒绝兼容 facade 重新进入机器索引。 |
| 发布验证 | 7 / 10 | 本地两个路由均为 HTTP 200，正式 contract 与 unit 通过，公开一行命令通过；当前环境没有可用的应用内 Browser，未完成截图级视觉验收。 |
| **总分** | **97 / 100** | **通过。** |

## 验证证据

- `scripts/test_runtime_apis.sh contract`：325 / 325 通过，catalog 共 325 个公开成员；证据目录
  `.runtime/tests/runtime-api/direct-20260905-192659-375000/`。
- `scripts/test_runtime_apis.sh unit`：480 / 480 通过，包括 `Execution` 11 个字段的暴露检查、冻结的
  environment snapshot、`System.getEnv/hasEnv` 与 coherent context snapshot 行为检查；证据目录
  `.runtime/tests/runtime-api/direct-20260905-192825-438000/`。
- `scripts/test_runtime_apis.sh environment`：3 / 3 通过；显式 env file、启动时 OS 环境、系统
  `PATH`、默认 `.env` / `.opendesk.env` 自动发现、安全公开示例、AI CLI 注入、`Command.run()`
  继承/覆盖和 HTTP 宿主环境隔离均通过；证据目录
  `.runtime/tests/runtime-api/direct-20260905-192637-305000/`。
- 刷新根目录二进制后，从仓库根目录原样执行环境文档中的
  `./opendesk -script examples/environment.js` 通过；输出只报告选定变量是否存在，不泄露其值，
  运行目录为 `.runtime/runs/direct-20260905-185051-225000/`。
- 从仓库根目录使用当前 `./dist/opendesk` 执行同一示例通过，并观察到本地 `.opendesk.env` 中
  allowlist 的 `OPENDESK_CONSOLE_MODE` 已进入 `Execution.env`；运行目录为
  `.runtime/runs/direct-20260905-185936-104000/`。
- 使用 `./dist/opendesk ai run examples/environment.js` 通过；JSON envelope 指向的
  `.runtime/ai/ai-20260905-193015-937000/stdout.log` 同样记录了该 `.opendesk.env` 值，验证 AI CLI
  quiet stdout 只改变展示位置、不改变环境解析。
- 刷新当前源码后的 `./dist/opendesk -script-text "console.log(typeof System.getEnv, typeof System.hasEnv)"`
  返回 `function function`，确认用户实际使用的二进制已包含新 API。
- 从仓库根目录原样执行 `execution.md` 的 `./opendesk -script-text ...` 命令通过，运行目录为
  `.runtime/runs/direct-20260905-173108-563000/`。
- `http://127.0.0.1:3000/docs/execution` 返回 200，标题为 `Execution Context`；
  `http://127.0.0.1:3000/docs/runtime` 返回 200，标题为 `JavaScript Runtime`。实时页面导航包含
  `Execution Context` 和 `Command API`，不包含旧 `Runtime Stacks` 或 `Subprocess API` 标题。
- `runtime-api.ai.json` JSON 解析、相关 JavaScript 语法以及 `git diff --check` 均通过。
- 本轮追加执行 `gofmt`、JavaScript `node --check`、Shell `bash -n` 与 JSON 解析均通过；`go test
  ./automation ./pkg/runtimeenv` 触发了当前工作树既有的无关失败
  `TestJSMethodAllowlistReferencesRealExportedMethods`（allowlist 引用了
  `*automation.Mouse.PressButtonForPID`），未由本次 System 环境改动引入。

## 保留的 3 分

应用内 Browser 当前没有可用实例，因此不能提供真实页面截图、窄宽布局和滚动导航的视觉证据。
此外，仓库当前没有 `docs.config.yml`，`shopme build` 的静态导出入口不可用；本地 watch server 的
实际路由与内容已验证，但静态发布包应在补齐项目级配置后独立验收。

## 工作树附加观察

额外执行 `node scripts/audit_test_architecture.js` 时，全仓库架构审计未通过。报告位于
`.runtime/tests/test-architecture/execution-runtime-audit.json`，原因是当前工作树另有 7 个未登记的
Go 测试文件，且当前 `_test.go` 总数 149 与审计基线 142 不一致。该检查不否定本报告范围内已经
通过的 Runtime contract/unit，但应由这些并行测试改动的 owner 单独补齐分类。
