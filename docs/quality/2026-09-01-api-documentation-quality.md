# OpenDesk API 文档发布质量评分

日期：2026-09-01

范围：`docs/api/` 的用户导航、Runtime API、Custom UI、MCP Recorder 与 Scheduler 文档。
结论：**96 / 100，达到不低于 95 分的发布文档门槛。**

这是一份文档质量评分，不是 Runtime live 验收。Runtime 行为仍应按各 API 的正式测试门槛验证。

## 评分规则

| 项目 | 分值 | 通过条件 |
| --- | ---: | --- |
| 路由与导航 | 30 | `runtime-api.ai.json` 可解析；机器索引、manifest 和本地 Markdown 链接都指向存在的正式页面；入口页不引用已删除的专题页。 |
| API 覆盖 | 25 | Runtime manifest 的每一个公开方法都能在其正式用户文档中找到调用名称。 |
| 调用契约 | 20 | 主要对象页说明参数、返回/Promise、默认值或约束；条件能力和高风险动作写出限制。 |
| 可复制示例 | 15 | 面向仓库用户的 CLI 示例声明仓库根目录，并使用 `./opendesk`；运行产物落在 `.runtime/`。 |
| 发布语言与可维护性 | 10 | Custom UI 不使用未发布的版本/旧静态入口叙述；文档不混入内部路径、退役路由或重复 API 页面。 |

## 本次逐页核对

| 文档组 | 已核对页面 | 结果 |
| --- | --- | --- |
| 导航与范例 | `README.md`、`index.md`、`cookbook.md` | 任务入口、对象地图与范例路由一致。 |
| Runtime 对象 | `clipboard.md`、`dialog.md`、`file.md`、`global-apis.md`、`global-shortcut.md`、`http.md`、`image-color.md`、`input.md`、`mouse.md`、`native-extension.md`、`custom-ui.md`、`notify.md`、`page.md`、`runtime.md`、`screen.md`、`sound.md`、`storage.md`、`system.md`、`vision.md`、`window.md` | Runtime manifest 覆盖为 **251 / 251**；本轮补充了 `waitForAll`、`analyzeLayout`、`js_beautify` 和 browser/context facade 的正式调用契约。 |
| 服务与 MCP | `http-server.md`、`scheduler.md`、`scheduler-api.md`、`recorder.md` | HTTP、Scheduler 与 Recorder 的启用边界、输入、生命周期和本地 artifact 路径均有用户文档。Recorder 补齐了每个 MCP 工具的必填参数和结果。 |
| 专题能力 | `ai-cli.md`、`libs.md` | Agent CLI、内置库和脚本运行入口与用户导航一致。 |

## 评分证据

| 项目 | 得分 | 证据 |
| --- | ---: | --- |
| 路由与导航 | 30 / 30 | JSON、manifest 路由与本地 Markdown 链接静态检查通过；不再引用 `native-ui.md` 或 `runtime-utilities.md`。 |
| API 覆盖 | 25 / 25 | `tests/runtime-api/manifest.js` 的 251 个方法名称均出现在所属正式文档。 |
| 调用契约 | 19 / 20 | Custom UI、Sound、Recorder、Page、ImageColor、Window 和 Runtime facade 本轮补齐参数/返回/错误信息；其余页面已有相同层级的表格和示例。保留 1 分用于后续以 TypeScript 编译器作全量声明检查。 |
| 可复制示例 | 14 / 15 | 仓库内 CLI 示例已统一为根目录 `./opendesk`；未在本次纯文档工作中逐条启动所有示例。 |
| 发布语言与可维护性 | 8 / 10 | Custom UI 已统一为当前公开入口，删除旧 `native-ui.md` 路由；未引入未发布版本标题或迁移页。剩余 2 分保留给真实发布包上的文档站渲染检查。 |
| **总分** | **96 / 100** | **通过 95 分门槛。** |

## 本轮改进

- `Custom UI` 成为 `FloatingWindow` 与 `ui.createWindow()` 的唯一用户入口；构造参数、按钮参数、状态 patch、返回值、错误和生命周期均为显式契约。
- `Sound API` 从混合的 Runtime Utilities 页面拆出，并补齐 path、返回与失败行为。
- `Page`、`ImageColor`、`Window` 和 `Runtime Stacks` 补全 manifest 中此前缺少说明的公开方法。
- `Recorder` 补齐 MCP 生命周期工具的必填参数、返回和调用顺序。
- 删除旧的 `native-ui.md`、`runtime-utilities.md` 路由；`custom-ui.md` 作为唯一公开 UI 入口，不把旧入口放入公开导航。

## 仍需在发布流水线执行的检查

1. 使用已安装的 TypeScript 编译器运行 `tsc --noEmit -p jsconfig.json`，确认生成的 `FloatingWindow` 图标类型与引用页无冲突。
2. 从发布包的仓库根目录原样执行每条文档启动命令；Custom UI 示例还需保留实际窗口截图证据。
3. 文档站构建后检查标题、目录顺序、中文表格和代码块渲染。
