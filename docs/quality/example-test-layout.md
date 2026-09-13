---
title: Examples 与 Tests 目录及迁移规则
description: 定义 canonical examples、正式测试、诊断工具和已退休旧路径的当前归属规则。
order: 22
---

# Examples 与 Tests 目录及迁移规则

本页描述**当前有效结构**。历史迁移阶段曾保留薄兼容入口；这些 wrapper 已在目录收口时退休，不再属于当前架构。

## 归属

| 职责 | 位置 | 边界 |
| --- | --- | --- |
| 用户可运行示例 | `examples/<topic>/` | 有用途、工作目录、命令、输入输出、权限和副作用说明。 |
| Example Explorer | `apps/example-explorer/` | 消费 `examples/` 与 Catalog；本身不是 Example。 |
| Runtime 公共契约及共享断言 | `tests/runtime-api/` | 沿用现有 Runtime test runner，不复制断言。 |
| 领域黑盒测试 | `tests/<domain>/` | 按已有领域组织。 |
| Go/native 私有实现测试 | 实现同包的 `*_test.go` | 保留包内访问边界。 |
| 生成、分析、人工诊断工具 | `tests/<domain>/tools/<tool>/` | 诊断结果不等于回归通过。 |
| 版本化输入和资源 | 所属示例/测试资源目录 | fixture / asset 与入口分开。 |
| 一次性日志、截图、运行输出 | `.runtime/` | 不提交。 |
| 历史资料 | `.archive/` | 不作为活跃实现。 |

## Repository / Distribution Boundary

源码仓库中的资产归属与正式发行 Payload 是两套不同边界：

```text
OpenDesk Source Repository
├─ examples/       用户 / 开发者学习与示例源码
├─ tests/          开发、CI、回归与 qualification 资产
├─ docs/           文档源码
├─ workflows/      开发工作流资产
└─ Product Source
        ↓ 显式声明运行时所需 Payload
Official OpenDesk Distribution
├─ Runtime 必需文件
├─ Desktop App 必需文件
├─ Native UI Host / platform payload
└─ 官方产品资源
```

正式 Runtime、Desktop App 和 Installed App Builder 产物必须遵守以下规则：

- `examples/` 是 repository-side 学习资产，不属于正式 Runtime / Desktop App payload。
- `tests/` 是 repository-side 开发、CI、回归和 qualification 资产，不属于普通用户安装包。
- `docs/`、`workflows/`、`research/` 等 repository-only 资产不会因为存在于源码仓库而自动进入发行包。
- Distribution / App Builder 必须显式选择真正运行所需的 Runtime、App、Native UI、platform payload 和官方产品资源；优先使用 allowlist 或等价的显式资源选择机制。
- 仓库未来新增 `examples/new-feature/`、`tests/new-feature/`、`benchmarks/`、`research/`、`tools/` 等目录，不应自动改变正式发行内容。
- 某个 repository-side 文件被构建或测试流程显式用作**构建期输入**，不等于其源码目录成为 Distribution Payload；真正需要发行的是构建结果时，应由对应 Distribution owner 显式声明该结果。
- Examples 的 canonical source 是 `https://github.com/shopable-ai/opendesk/tree/master/examples`。正式 OpenDesk 的「示例代码…」通过既有 Official Shell / 外部 HTTPS URL 机制打开该在线来源，不依赖安装包内存在 `examples/`。
- 公开 Example 可以帮助理解和组合 API，但不承担 Tests / Qualification 职责，也不能替代正式 contract、回归或真机验收。
- 不因为用户需要查看 Examples 而恢复 Built-in Examples Distribution；未来若需要单文件下载、Example Pack 或缓存，应作为独立产品能力设计。

因此核心约束是：

```text
Repository Source Tree != Distribution Payload
```

运行时确实需要的新资源，必须在对应 Distribution / App Builder 中显式声明；不能通过“复制整个仓库，再持续增加 exclude”来隐式扩大产品 Payload。

## Canonical-only 规则

完成迁移后只保留 canonical 实现。**不再为了旧命令在 `examples/` 中保留 wrapper。**

当前审计清单中的旧路径必须不存在，对应 canonical 路径必须存在且非空。旧名字如仍有识别价值，可以留在 `examples/catalog.json` 的 `legacyNames` 中作为历史名称/搜索元数据，但 alias 不代表磁盘上存在第二个文件。

已退休的第一、二批路径：

| 已退休路径 | Canonical 位置 |
| --- | --- |
| `examples/api-quickstart.js` | `examples/runtime/api-quickstart.js` |
| `examples/environment.js` | `examples/runtime/environment.js` |
| `examples/path.js` | `examples/runtime/path.js` |
| `examples/file-json.js` | `examples/runtime/file-json.js` |
| `examples/sqlite/smoke-cases.js` | `tests/runtime-api/support/sqlite-smoke-cases.js` |
| `examples/sqlite/smoke.test.js` | `tests/runtime-api/sqlite-smoke.js` |
| `examples/analyze_progressive_tests.js` | `tests/automation/tools/image-layout-lab/analyze-progressive.js` |
| `examples/file.js` | `examples/runtime/file.js` |
| `examples/command.js` | `examples/runtime/command.js` |
| `examples/http.js` | `examples/runtime/http.js` |
| `examples/clipboard.js` | `examples/clipboard/text.js` |
| `examples/keyboard.js` | `examples/desktop/keyboard.js` |
| `examples/window.js` | `examples/desktop/window-inspect.js` |
| `examples/window-more.js` | `examples/desktop/window-controls.js` |
| `examples/clipboard.test.js` | `tests/runtime-api/clipboard-stress.js` |

后续为 Example Explorer 做的领域整理同样采用 canonical-only：Runtime、Desktop、Vision、Audio、Dialog、Notifications、Applications 的旧根入口均已退休。

## Examples 根目录规则

`examples/` 根目录用于 README、Catalog 和领域目录，不再作为新脚本投放区。

新增 public example：

```text
需求/API
  ↓
examples/<domain>/kebab-case.js
  ↓
<domain>/README.md
  ↓
examples/catalog.json
  ↓
safe / manual
  ↓
apps/example-explorer/
```

多文件示例应有明确主入口；`support/`、`assets/`、`fixtures/` 不进入普通 Explorer 列表。

## 测试与 smoke 的边界

`*.test.js`、`*smoke*`、fixture generator、诊断脚本如果目的是证明正确性或制造测试输入，应进入 `tests/` 或对应测试领域，而不是通过 compatibility wrapper 留在公开 Example 根目录。

公开 Example 可以包含最小结果检查，但不能因此替代正式 Runtime API contract、真实原生 UI 验收或跨平台 evidence。

## 审计

统一入口仍为：

```bash
node scripts/audit_test_architecture.js
```

`scripts/lib/test-architecture-layout.js` 对已审核迁移执行两类检查：

1. canonical 文件存在且非空；
2. retired 旧路径不存在。

因此以后如果有人重新加入 `examples/file.js`、`examples/window.js` 等 wrapper，架构审计应直接失败，而不是要求它保持“足够薄”。

相关宿主侧测试：

```bash
node --test tests/test-architecture/layout.test.js
node --test tests/test-architecture/examples-safety.test.js
node --test tests/test-architecture/example-explorer-catalog.test.js
```

这些测试不代替真实 OpenDesk Runtime、桌面输入、原生 UI 或目标平台验证。

## 保护范围

目录整理不得为了“更整齐”破坏以下已有边界：

- Native Extension 构建/manifest/types 映射；
- `tests/runtime-api/framework.js`、`manifest.js`、`unit.js`；
- `examples/desktop/support/target-window.js` 等共享 support；
- `examples/app/qianniu-window.js` 等仍有明确公开用途的 canonical 示例；
- `.runtime/` 中正在使用的运行证据。

不确定用途的历史脚本应先分类，再决定迁移到 canonical example、tests/tool、archive 或删除；不要重新用 root wrapper 作为拖延分类的方式。
