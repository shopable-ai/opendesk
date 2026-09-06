---
title: Examples 与 Tests 目录及迁移规则
description: 第一批示例、共享断言与诊断工具归位，兼容边界和增量审计。
order: 22
---

# Examples 与 Tests 目录及迁移规则

本轮基于 `master@6ae230233de95b34b66c8bdec864d24f6a34eeb7`，只整理已经确认职责的
第一批文件。不是全仓文件鉴定，也不是已批准的批量删除清单。

## 归属

| 职责 | 位置 | 边界 |
| --- | --- | --- |
| 用户可运行示例 | `examples/<topic>/` | 有用途、工作目录、命令、输入输出、权限和副作用说明。 |
| Runtime 公共契约及共享断言 | `tests/runtime-api/` | 沿用 `scripts/test_runtime_apis.js`；不另建 Runner，不复制断言。 |
| 领域黑盒测试 | 已有 `tests/<domain>/` | 不整体改成另一套 unit/integration/e2e 顶层布局。 |
| Go/native 私有实现测试 | 实现同包的 `*_test.go` | 保留包内访问边界；沿用既有 Go 分类账本。 |
| 生成、分析、人工诊断工具 | `tests/<domain>/tools/<tool>/` | 产出报告不等于提供回归正确性证明。 |
| 版本化输入和资源 | 所属示例/测试的资源目录 | 图片、JSON、故意失败脚本不能按扩展名或一次报错删除。 |
| 一次性日志、截图、探针输出 | `.runtime/` | 不提交；不要清理仍被进行中任务引用的证据。 |
| 有保留理由的历史资料 | `.archive/` | 不作为活跃实现，也不是不加审查的垃圾桶。 |

## 第一批迁移台账

| 原入口 | 唯一实现位置 | 处理 |
| --- | --- | --- |
| `examples/api-quickstart.js` | `examples/runtime/api-quickstart.js` | 基础示例；仅更新说明中的命令，逻辑保留。 |
| `examples/environment.js` | `examples/runtime/environment.js` | 保留按需读取、避免输出完整环境的行为。 |
| `examples/path.js` | `examples/runtime/path.js` | 保留真实入口的 `Execution.scriptPath/scriptDir`；不冒充目标文件来源。 |
| `examples/file-json.js` | `examples/runtime/file-json.js` | 配置仍相对工作目录，结果仍写入 `Execution.artifactDir`。 |
| `examples/sqlite/smoke-cases.js` | `tests/runtime-api/support/sqlite-smoke-cases.js` | 原 Git blob 原样迁入；不改写共享断言。 |
| `examples/sqlite/smoke.test.js` | `tests/runtime-api/sqlite-smoke.js` | 独立测试入口；与 unit gate 加载同一份 support。 |
| `examples/analyze_progressive_tests.js` | `tests/automation/tools/image-layout-lab/analyze-progressive.js` | 诊断工具；修复输入失败后仍成功结束、空集合产生无效均值的问题。 |

七个旧路径仅保留薄转发，不保留第二套实现。同步 SQLite support 的旧入口仍同步注册
`SQLiteSmokeCases`；其他旧入口等待目标脚本并传播错误，不创建新的 Execution。
新文件的入口命令见 [基础 Runtime 示例](../../examples/runtime/README.md) 和
[SQLite 示例说明](../../examples/sqlite/README.md)。

### 为什么暂不删除旧入口

现有文档、gate 或外部用户可能仍使用旧路径；代码搜索不完整不能作为“零引用”的证据。
本批新导航推荐规范路径，未逐一改写的既有命令继续经兼容入口使用唯一实现。
这不等于已完成全仓动态引用扫描。

维护者移除兼容入口前，必须核对完整本地工作区的文档、manifest、动态加载、脚本、构建及
已发布命令，完成新旧直接命令的对应验证，并同步修改本台账和审计中的迁移清单。
已有对外使用者时须明确弃用安排；不能只因为搜索不到引用就删除。

### 本轮保护范围

不改 Native Extension 源码/manifest/types 及其 Makefile 打包映射，不移动 Runtime
`framework.js`、`manifest.js`、`unit.js`；不改 Custom UI 配置发现，不合并两种 Dialog 写法。
不重写计算器 Recipe，不恢复计算器专用工作流，不改 `workflows/agent-to-recipe/`，不清理
已有任务包或运行证据。其他疑似临时文件留待逐项复核。

## 诊断工具不是质量 gate

从仓库根目录先生成输入，再运行分析：

```bash
go run ./tests/automation/tools/image-layout-lab all
./dist/opendesk -script tests/automation/tools/image-layout-lab/analyze-progressive.js -console-mode script
```

输入仍为 `.runtime/tests/automation/image-layout/` 下的七张分级图片。算法参数不变。
报告为当前 `Execution.artifactDir/progressive-analysis.json`，包含 attempted、analyzed、
failed、逐项 failures 和 `accuracyVerified: false`。任何样本读取或分析失败都会在写报告后
抛错；零有效样本时均值为 `null`。成功状态只表示诊断完成，不按分隔线数量宣称识别更好。

## 审计和 Go 增量登记

仍只有现有审计入口：

```bash
node scripts/audit_test_architecture.js
```

它新增第一批迁移检查：目标存在且非空、旧路径只能是指定转发、SQLite 的两个正式入口
直接加载规范 support，以及所列构建关键资产/Runtime 基础设施存在。结果写入原来的
`.runtime/tests/test-architecture/audit.json`，新增 `exampleTestLayout` 和对应 invariant。
检查范围是已审查的七项，不宣称其他 examples/tests 文件都已经分类。

历史 Go 迁移账本仍验证 151 行及其处置计数。以后新增 Go 测试时，在现有
`docs/quality/go-test-file-classification.md` 最后追加唯一的 `## 增量登记` 章节，使用相同的
七列表格登记新文件；不要改写旧迁移数量。审计仍要求逐项边界、私有访问、依赖、断言价值
和具体理由，并核对所有当前 `_test.go` 与已登记路径。当前期望文件数改为从已登记行扣除
`MOVE_TOOL` 后计算；历史记录缺失、未登记文件或丢失当前文件仍失败。没有增量章节的既有
账本继续按原基线检查。

## 验证边界

目录守卫、转发和诊断错误处理的宿主侧测试：

```bash
node --test tests/test-architecture/layout.test.js
```

这些隔离夹具和模拟对象只验证迁移/工具控制流，不代替 OpenDesk 公共 API 测试，也不证明
原生 SQLite、图像算法或 macOS/Windows 行为。临时夹具仅写入
`.runtime/tests/test-architecture/layout-unit/`，测试结束清理自己创建的目录。

具备完整源码及当前构建后，仍须原样运行新旧公开示例命令和受影响 gate，例如：

```bash
./dist/opendesk -script tests/runtime-api/sqlite-smoke.js -console-mode script
OPENDESK_RUNTIME_API_MODE=sqlite OPENDESK_BINARY=./dist/opendesk ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

完整架构审计、实际 Runtime 和目标平台验证必须分别报告；静态/模拟检查不能标为实机通过。
本轮不遍历执行所有 `.js`，不自动触发桌面输入、真实应用操作或完整历史验收脚本。
