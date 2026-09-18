# Agent-to-Recipe Calculator 真实整链验收（2026-09-18）

结论：**r001 Agent-to-Recipe Calculator 真实整链验收通过**。范围为本机 macOS 12.7.6 的 Calculator Basic 布局、本次业务目标与下述冻结 Candidate；当前正式工作流采用 Coding Agent 手工协调 S1—S12。后续 r002 的真实运行事实与资格缺口分别处理，当前修订交付见 [r003 审计与交付报告](agent-to-recipe-calculator-r003.md)；不能把本页 r001 的 PASS 自动移给新脚本。

需求来源为本次用户要求：真实完成 `25 × 4 + 10`，读取当前 `firstResult`，再真实完成 `6 × firstResult` 并读取最终结果。被测 Agent 以 `fork_turns: none` 启动；[初始业务输入](../../.runtime/automation-authoring/calculator-fresh-20260918/business-input.txt)不含具体 API。协调者只提供当前工作流入口、授权、隔离要求和构建来源事实，未提供旧 Recipe 实现。

| 验收项 | 结果 | 实际证据 |
| --- | --- | --- |
| 能力发现 | PASS | 自主从短入口进入 targets、elements、entrypoints，以及取证写文件所需 data 部分；先比较候选再调用。见[发现审计](../../.runtime/automation-authoring/calculator-fresh-20260918/discovery-independent-audit.json)、[候选比较](../../.runtime/automation-authoring/calculator-fresh-20260918/candidate-comparison.json)。 |
| 合同读取 | PASS | 12 份选中 canonical 阅读包及公共约束完整读取、校验；必要类型结构来自合同。未全文加载机器索引、全部 API 或类型声明，也未因机器索引遗漏否定能力。见[读取账本](../../.runtime/automation-authoring/calculator-fresh-20260918/document-reading-ledger.jsonl)。 |
| 真实桌面执行 | PASS | 新示范 Execution `direct-20260918-213303-125000`，17 个已确认按钮动作，实际 UI 结果为 110、660；[原始事实](../../.runtime/automation-authoring/calculator-fresh-20260918/demonstration/actions.json)及[独立示范审计](../../.runtime/automation-authoring/calculator-fresh-20260918/demonstration-independent-audit.json)。 |
| firstResult 数据来源 | PASS | 示范 A008 两次实际 UI 读取均为 110；独立运行重新读取 110，没有读取历史结果文件。见[示范首值截图](../../.runtime/automation-authoring/calculator-fresh-20260918/demonstration/first-result.png)、[资格首值截图](../../.runtime/automation-authoring/calculator-fresh-20260918/candidate-runs/direct-20260918-214805-856000/first-result.png)。 |
| 跨步骤数据依赖 | PASS | `firstResult` 的实际字符串展开为第二段按钮参数；资格运行事件 6 → 14 → 15 保留生产者、消费者与最终读取，第二段实际序列为 `6 × 1 1 0 =`。见[资格事实](../../.runtime/automation-authoring/calculator-fresh-20260918/candidate-runs/direct-20260918-214805-856000/events.json)。 |
| Recipe 提炼 | PASS | Dossier → DistilledSteps → Procedure → AppProfile → 最终 Candidate 有固定引用；保留清空检查、目标唯一性、连续读值、错误停止和结果证据。见[必要步骤](../../.runtime/automation-authoring/calculator-fresh-20260918/distilled-steps.json)、[业务过程](../../.runtime/automation-authoring/calculator-fresh-20260918/procedure.json)、[普通 JavaScript](../../.runtime/automation-authoring/calculator-fresh-20260918/candidate.js)。 |
| 独立运行 | PASS | 冻结后重新清空；独立观察器三次读到 0 并保存截图，然后原样执行 Candidate，Execution `direct-20260918-214805-856000`，耗时 18.233 秒。源码、运行快照及执行记录 hash 一致。见[执行摘要](../../.runtime/automation-authoring/calculator-fresh-20260918/executions/qualification/summary.json)。 |
| 最终业务 Oracle | PASS | 新的独立只读 Execution `direct-20260918-214836-096000` 三次读到 660，实窗截图一致；固定期望只作断言。见[独立最终截图](../../.runtime/automation-authoring/calculator-fresh-20260918/executions/qualification-final-observer/independent-calculator.png)、[资格记录](../../.runtime/automation-authoring/calculator-fresh-20260918/qualification.json)。 |

没有用 JavaScript 算术计算业务答案；动作回执、Execution 状态、实际 UI 读值和 Oracle 分别记录。所有业务动作回执均为 `acknowledged`，没有出现 unknown/partial 输入或自动重放；这证明本次正常运行及源码停止路径，不声称已做故障注入资格。跨 Execution 仅传普通文件和业务证据，各次重新解析窗口；原生引用生命周期由框架管理。

S7 的 A001—A020 均有来源与 disposition，首次读取 D030 的输出进入 D050；S8/S9 的 B025 → B040 保留同一依赖。最终 Candidate 复用 `UI.tapTargets`、`UI.readText`、窗口和原生观察能力，没有自建定位或回放引擎。早期草稿与最终发布顺序在生成者记录中区分，S11 最终审阅、预检和冻结发生在固定 S7—S10 输入之后。

本轮没有修改 Runtime、API 阅读层或工作流源码。旧 `dist/opendesk` 与当前源码不一致，因此在固定路径重新构建，未更改系统权限、App ID、签名身份或运行中的产品进程。实际使用源码 HEAD 为 `2758d3032ac847d599008eb7cf7b37743788b8a5` 加既有未提交修改；未提交、未推送，本轮新增的版本控制范围仅为本报告，运行工件均在 `.runtime/`。

冻结 Candidate SHA-256：`065252f642d747dea69778b719eadeb2295990c043e8da92a5b445d5172cf33e`。主程序 SHA-256：`8e87527dcec02f2afb320fe7d27b59ca31c5186fd75e4561599e4afad48e2cd3`。实际加载的 28 个 polyfill 已锁定，运行前后均核验一致；本次未使用 OpenDesk UI host。见[依赖锁](../../.runtime/automation-authoring/calculator-fresh-20260918/dependency-lock.json)。

工作目录为仓库根 `/Users/mac/Documents/workspace/clawdesk`。本次从已独立确认的干净状态原样运行的一行命令：

```bash
./dist/opendesk -script .runtime/automation-authoring/calculator-fresh-20260918/candidate.js -console-mode script -log-dir .runtime/automation-authoring/calculator-fresh-20260918/executions/qualification -timeout 2
```

普通直接命令：PASS；正式 S12：PASS；真实窗口视觉证据：PASS。准备和两个独立观察命令均列于 QualificationRecord。该行是本次历史验收命令，重复执行会写入同一摘要目录；保留原证据后再做下一次资格任务。

独立 Oracle 在 Candidate 生成前固定。被测 Agent 的实际工具调用另存于[工具证据](../../.runtime/automation-authoring/calculator-fresh-20260918/tested-agent-tool-evidence.jsonl)，仅含工具调用与输出，不含模型私有推理。正式方法和所选 canonical 文档本身含 Calculator 示例；未打开所链接的旧案例、golden 或 Recipe，因此不能把本次表述为“删去所有文档示例的无提示盲测”。

本次只修复了资格记录封装器对日志 JSON 尾部元数据的解析，未修改期望、Candidate 或真实运行事实，也未重新操作 Calculator。无剩余核心验收项；其他平台、布局、参数化、故障注入、人审及应用认识 HTML 的浏览器渲染均不在本次整链业务资格声明内。原始证据位于可清理的本地 `.runtime/`；若其丢失，本报告不再提供可复核的本机证据闭包。

## 接续导航增量（2026-09-18）

后续任务核对发现：案例入口仍只描述 2026-09-07 的未实测状态，S11 冻结的 `handoff-notes.json` 和 Candidate limitations 仍保留资格前的“S12 未运行”。这些历史记录有各自时点，不构成本次资格失败。新增[案例接续入口](../../workflows/agent-to-recipe/cases/calculator.md#已完成整链的接续入口)和工作流时点说明，关联最终 QualificationRecord、普通 Recipe 及两份交接；原冻结记录不回写。当前 progress 仅补充维护说明，S1—S12 passed、资格引用与无待执行动作状态保持不变。

本轮从仓库根目录原样执行案例中的两条 Node 只读检查：S11、S12 分别检查 21、10 个文件，均 PASS；另核对 progress／Candidate／Qualification 的 41 个直接引用、同一脚本及合同绑定、资格 scope 和两份导航文档的 51 个链接，均通过。见[本轮检查记录](../../.runtime/automation-authoring/calculator-fresh-20260918/maintenance/resume-navigation-20260918/verification.json)。这些检查不新增桌面、功能或视觉资格；上文普通命令、S12 和实窗 PASS 仍属于原执行。

本轮版本控制范围为 `WORKFLOW.md`、`cases/calculator.md` 的导航修改及本报告增补；证据与 progress 维护留在 `.runtime/`。沿用 master／HEAD `2758d3032ac847d599008eb7cf7b37743788b8a5`，未提交、未推送、未 fetch；远端最新状态未核验。既有其他工作区修改保留；冻结脚本、交接及历史执行字节的最终比对见[收尾检查](../../.runtime/automation-authoring/calculator-fresh-20260918/maintenance/resume-navigation-20260918/final-verification.json)。

## 精简可调用 Recipe r002（2026-09-18）

用户复核指出 r001 `candidate.js` 同时包含生产业务、事件写盘、截图和资格取证，不适合作为简洁的最终复用文件。该判断成立：r001 是可审计的冻结资格候选，但 S10→S11 没有充分落实“生产运行门禁”和“资格验证代码”分离。旧文件及资格保持不变，另建 [r002 Recipe](../../.runtime/automation-authoring/calculator-fresh-20260918/calculator-recipe-r002.js)及 [CandidateManifest](../../.runtime/automation-authoring/calculator-fresh-20260918/candidate-r002.json)。

r002 用普通函数 `calculateWithButtons(win, buttons)` 表达可重复 Calculator 操作：清空当前状态、执行调用方给定的语义按钮数组、连续读取实际显示值并返回。主流程调用两次，第二次参数为 `['6', '×', ...firstResult, '=']`。生产文件不含 expected、截图、事件审计、hash 断言或资格 verdict；这些由独立的[测试代码](../../.runtime/automation-authoring/calculator-fresh-20260918/test-calculator-recipe-r002.cjs)承担。未增加 Calculator 对象方法层，也未假定跨文件 `import`／`require`。

从仓库根目录实际执行：

```bash
node .runtime/automation-authoring/calculator-fresh-20260918/test-calculator-recipe-r002.cjs
```

结果 PASS：精确脚本 SHA-256 `747b6037e0708f499c2d2b0b4fd452c85bd87ef2dd0a911df59a040e91d14e59`；业务 Execution `direct-20260918-230222-275000` 实际读取 `110`，实际第二段为 `6 × 1 1 0 =`，最终读取 `660`；独立观察 Execution `direct-20260918-230241-366000` 三次读取 `660`，截图已检查为清晰、无裁切的 Calculator `660`。见 [r002 QualificationRecord](../../.runtime/automation-authoring/calculator-fresh-20260918/qualification-r002.json)及[测试结果](../../.runtime/automation-authoring/calculator-fresh-20260918/executions/r002-tests/r002-2026-09-18T15-02-22-105Z-48326/test-result.json)。构建交接和资格交接的只读完整性检查分别检查 9 个文件，均 PASS。

以上记录保留 r002 当时运行事实；“当前推荐交付／完整资格通过”的原结论经本次审计撤回。r002 缺 API/依赖冻结、全目标预检、独立干净起点和同时点依赖检查；自报 `secondButtons` 不独立证明实际输入，资格声明时间也早于最终观察结束。W030/W031 的事后 request 未进入当时 WorkPlan，lineage 应按已有资产接续理解。两份 handoff 的完整性 PASS 不补足这些缺口；旧字节不回写。具体条款、证据及新候选修复见 [r003 报告](agent-to-recipe-calculator-r003.md)。r001 资格继续有效于原 hash/范围；r002 的 110→660 及独立最终读值仍是成立的历史事实。任意按钮组合、跨文件模块化、通用表达式、其他平台/布局和故障注入均未因此获得资格。
