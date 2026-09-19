# Agent-to-Recipe：Calculator 接续与工作流质量总览

最终程序仍是 [examples/agent-to-recipe/calculator.js](../../examples/agent-to-recipe/calculator.js)。本轮没有改变它的字节或桌面行为；`code-rebuild` 结论为 **baseline-retained**。Skill、过程工件、fixture、测试和资格证据用于分层判断这份 JS，不是第二个可执行业务成品，也没有新增 Engine／DSL／Compiler。

## 2026-09-19 当前续作｜Run Summary

本次续作从远端 `master@64872b6642d32588cbe3a3fabaaedfff7c5d54f7` 开始，直接反向验收既有 r003 黄金 Recipe，没有重做 Calculator、没有修改生产 `calculator.js`、没有恢复 `runtime-api.ai.json`。当前执行容器仍不能读取用户 Mac 上被 `.gitignore` 排除的 `.runtime/automation-authoring/**`，且 `/Users/mac/Documents/workspace/clawdesk` 在本环境不存在；历史 q002 Calculator live 证据因此只按已提交质量报告／来源关系复用。正式 OpenDesk Runtime contract/unit 则已通过 GitHub macOS runner 从当前源码构建真实 `dist/opendesk` 后执行，不用 Node 模拟 Runtime。

| 项目 | 当前结论 | 关键入口 |
| --- | --- | --- |
| 任务 | 用成功 Calculator Recipe 反向证明 Agent-to-Recipe 的能力发现与生成链 | [Calculator 案例](../../workflows/agent-to-recipe/cases/calculator.md#2026-09-19从-r003-反向验收能力发现链) |
| S1—S7 | 复用历史 TaskContract / WorkPlan / Dossier / DistilledSteps；本轮不重做示范 | [r003 报告](agent-to-recipe-calculator-r003.md) |
| S8—S9 | 新合同把最终 Recipe-driving 选择收敛进 `SemanticProcedure.capabilityDecisions`；旧 r003 缺字段时保持 unknown，不倒填 | [共享合同](../frameworks/agent-to-recipe-skill-contract.md)、[procedure-synthesize](../../workflows/agent-to-recipe/skills/procedure-synthesize/SKILL.md) |
| S10 | 仍由 application-engineer 负责 locator / stability；Calculator 当前使用 exact window + AX semantic preflight + Runtime scoped UI API，不留下裸坐标 | [application-engineer](../../workflows/agent-to-recipe/skills/application-engineer/SKILL.md) |
| S11 | 生产 Recipe baseline-retained；Candidate 对新链路用 `apiRefs` + `sourceMapping.capabilityDecisionRefs` 固定选择关系 | [calculator.js](../../examples/agent-to-recipe/calculator.js) |
| S12 | [recipe-qualify](../../workflows/agent-to-recipe/skills/recipe-qualify/SKILL.md) 已形成正式方法；历史 q002 固定范围资格继续是历史 PASS；当前 HEAD 未重跑 Calculator live，因此不提升为新的 live PASS | [r003 Qualification 说明](agent-to-recipe-calculator-r003.md) |
| 最终汇总 | 本页即 Run Summary 投影；权威状态仍来自 progress / handoff / QualificationRecord，不新增平行状态文件 | [WORKFLOW](../../workflows/agent-to-recipe/WORKFLOW.md) |

### 反向闭环结论

```text
业务步骤
→ 能力需求
→ docs/api/agent/README.md
→ targets.md / elements.md
→ 候选方法
→ 选中方法的 canonical contract / shared constraints
→ 当前环境 Runtime Validation
→ Observation / Evidence
→ DistilledSteps
→ SemanticProcedure（dataDependencies + capabilityDecisions）
→ AppProfile / Locator / Stability
→ 普通 JavaScript + CandidateManifest
→ QualificationRecord
→ Run Summary / Handoff
```

Calculator 当前代码可以从短入口发现并追到 `window.get / window.activate / window.current`、`Accessibility.snapshot`、`UI.tapTargets`、`UI.readText`；同一 catalog 也能看到 `App.launch`、`UI.tapText`、`UI.tapTexts` 等候选。现在明确区分“能发现”“决定选择”“读过合同”“在现场验证通过”，失败候选必须留证；已知不合适但未运行的候选使用 `rejected/not-run`，不为了填表制造副作用失败。选中的 canonical contract 以内容绑定进入 Candidate，不能只留一个 API 名称。

### Calculator 关键事实

| 必须回答的问题 | 当前可复核结论 |
| --- | --- |
| `firstResult` 从哪里来 | `readCalculatorResult()` 的 `UI.readText({within: win})` 实际返回；Procedure 数据依赖为第一次 runtime read → 第二段业务输入 |
| 为什么不是 expected | 生产源码不包含 110 / 660 Oracle；第二次调用展开 `...firstResult`，工件检查器会拒绝“先读再固定写 110” |
| 按钮如何动作 | 语义 role/name 预检后用 `UI.tapTargets`；当前 fixed scope 不把 `UI.tapTexts` 或 Accessibility-first 推广为全局优先级 |
| 窗口变化如何处理 | 每个受保护操作前用 `window.current` 重验同一 PID/native handle、焦点和 Basic bounds；不持久化旧 ref / 裸坐标 |
| `× / * / x` 怎么处理 | 当前生产只支持真实语义名 `×`；没有证据就不做隐式别名。未来增加别名属于策略变更，需要新候选和重验 |
| Recipe 如何进入最终结论 | S12 固定 Candidate 后产生 QualificationRecord；本页只汇总，不把历史 PASS 提升为当前 HEAD 新 PASS |

### 正式 Runtime / API 阅读链验收

本轮把用户要求的两条正式命令接入 macOS CI，并从当前源码构建真实 OpenDesk Runtime。执行对象为 `9360b3d74fd8235b44e716fcb706a3b28108eb0c`；后续若只修改本质量总览，Runtime 结果仍绑定该可执行字节。

| 验证 | 结果 | 结论边界 |
| --- | --- | --- |
| `OPENDESK_RUNTIME_API_MODE=contract ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script` | **PASS** | Runtime surface、manifest、canonical docs 路径与 types 能闭合；不依赖退役 JSON |
| `OPENDESK_RUNTIME_API_MODE=unit ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script` | **822 PASS / 12 FAIL** | full unit 仍有现有 Runtime 回归，不能报告全绿；失败不来自旧 JSON 删除 |
| Calculator exact-owner `unit-selected`：`window-target,ui-target-sequence,ui-semantic-targets,ui-semantic-targets-cancel,accessibility` | **52/52 PASS** | 当前 Recipe 使用的 window identity、`UI.tapTargets`、Accessibility owner 在选定单元范围通过 |
| `node tests/runtime-api/ui-perception-resolver.unit.cjs` | PASS；其中 `readText` 实际值 110 / macOS display 660 两案 PASS | 证明 resolver 逻辑不会拿 caller expected 当数据源；不是新的 Calculator live |
| Agent-to-Recipe contract CI | **101/101 PASS** | 检查 Stage/artifact/capability decision 关系，不证明模型 Producer 或真实桌面 |
| API reader/discovery | **27/27 + 9/9 PASS**，catalog deterministic check PASS | 短 Markdown 入口、目录、canonical contract、退役 JSON 清理闭合 |

full unit 的 12 个失败集中在既有 `window.list` 归一化、visual Locator fallback、Audio capability，以及 legacy `UI.findText / tapText / tapTexts / waitText` 行为测试；**没有** `window.get/current/activate`、`UI.tapTargets`、`UI.readText` contract 或 `Accessibility.snapshot` 的失败。它们作为 Runtime 既有问题保留，不为本轮 Agent-to-Recipe 验收修改成功标准。

formal contract 首轮还真实发现了一个高价值 source-of-truth 缺口：lowercase Custom UI `ui.toast / notify / getCapabilities / createWindow / closeAll / on` 的 Runtime manifest 指向了实际属于大写桌面 `UI` 的 `types/ui.d.ts`。本轮新增 `types/CustomUI.d.ts`，把 Runtime manifest 与 Agent docs type map 指向独立 Custom UI owner，并按 generator 重生成 `presentation.md`；之后 macOS formal contract PASS。仓库仍同时跟踪 case-only 的 `types/UI.d.ts` / `types/ui.d.ts` 重复路径，本轮不贸然删除，留作独立兼容性清理。

### Recipe Review / Qualification 结论

生产 Recipe 字节没有变化，所以先前 validation-plan 权重下的固定候选 **88/100** 不能因为工作流文档更完整就被抬高。其主要强项是业务数据链、框架能力复用、普通函数职责、fail-fast 与固定场景的历史真实验证；主要扣分仍是当前 HEAD 未重新 live、变化／故障场景有限、跨布局／语言／Windows／更广参数域未资格化。**本轮不虚报 ≥95。**

| 维度 | 结论 | 剩余边界 |
| --- | --- | --- |
| 业务正确性 / 真实 UI 数据依赖 | PASS（历史 fixed scope） | 当前 HEAD live 未重跑 |
| 框架能力复用 / 可读性 / 可维护性 | PASS | 不因一个 Calculator 抽成应用类或全局策略 |
| 参数化 / 可复用性 | LIMITED-BY-DESIGN | 当前只资格化固定正整数链和指定运算符 |
| Locator / Stability | PASS（声明范围） | 其他布局、语言、平台未测 |
| 错误处理 | PASS（源码/既有资格） | unknown / partial 故障注入仍有限 |
| 验证充分性 | PARTIAL（当前续作） | Runtime contract PASS；Calculator exact-owner selected unit 52/52 PASS；full Runtime unit 仍 12 FAIL；当前 HEAD Calculator live 未重跑 |

因此可以继续复用的是“历史已资格化的 fixed-scope Recipe + 已绑定证据”；不能从本轮得出“当前任意环境生产级 95+”或“Windows/其他布局已通过”。这不是代码必须重写的信号，而是后续资格证据边界。

### 新增结构门禁

当前 frozen fixture 明确为 synthetic，只验证检查器能否识别断链。它现在覆盖：缺 capability decision、绕过短入口、双 selected、selected 无 canonical contract、文档存在但 Runtime not-run、failed 无 evidence、Candidate 丢 decision mapping、Candidate 丢 selected API ref，以及旧 Procedure/Candidate 不含新字段时保持 provenance unknown。fixture 不执行 Calculator，也不把合成 110/660 冒充历史 observation。

新链路的机器门禁还要求 modern Business Step 显式给出 inputSources / preconditions / execution / observation / postconditions / verification / stopConditions / consumers，并把 selected canonical contract 与必要 shared constraints 通过 Candidate `apiRefs`、`sourceMapping.capabilityDecisionRefs` 继续绑定；旧工件缺字段时保留 provenance unknown，不倒填。

以下原有评审段落记录较早的 2026-09-19 本地切片，其中当时的 HEAD、测试次数和“未提交”状态只对那个时点成立；本次续作以上面的 Run Summary 为当前状态，不改写旧执行证据。评审者始终是任务 Agent，不是人类评审或盲上下文评测。

## 要求如何落到证据

| 用户要求 | 关键环节 | 实际文件 | 检测方法 | 成功条件 | 本次事实／局限 |
| --- | --- | --- | --- | --- | --- |
| 最终仍是普通 JS，首值来自 UI | S11 候选 | [calculator.js](../../examples/agent-to-recipe/calculator.js)、[Procedure r003][procedure] | 读源码并核对业务步骤、API、hash | `readCalculatorResult` → `firstResult` → 第二段字符展开，110/660 不作生产来源 | 符合；只资格化固定业务及原环境 |
| 必要路径不能误删读取／准备或去重数字 | S7 | [trace-distill Skill](../../workflows/agent-to-recipe/skills/trace-distill/SKILL.md)、[DistilledSteps][distilled] | 原 action 与 decision／step、读值来源及正反 fixture 对照 | 必要动作、顺序和重复输入保留；缺事实不得补造 | 静态切片通过；不证明任意轨迹提炼能力 |
| 语义阶段真实消费上游 | S8—S9 | [procedure-synthesize Skill](../../workflows/agent-to-recipe/skills/procedure-synthesize/SKILL.md)、[工件链检查](../../workflows/agent-to-recipe/scripts/check-artifact-chain.js) | 检查 sourceStep、生产／消费声明与原 action 对应 | 不丢数据依赖，不另建 action disposition | 真实六类工件的五个检查边界 PASS；非一般语义证明 |
| 可接续，旧文件不能冒充当前版本 | request／handoff、S11→S12 | [check-handoff.js](../../workflows/agent-to-recipe/scripts/check-handoff.js)、[Candidate q002][candidate]、[Qualification q002][qualification] | 根目录、身份、hash、引用、requested/exercised/qualified | 缺文件、错版本、部分任务假 PASS 被拒绝 | 45 项信封测试、27 项工件链测试通过；信任及授权不由 hash 证明 |
| 代码质量要实际评审，可不改 | S11 可选审查 | [code-rebuild Skill](../../workflows/agent-to-recipe/skills/code-rebuild/SKILL.md)、本页代码评审 | 固定内容、逐项审查、核对真实历史资格 | 正确数据流、公开 API、有界失败、普通函数和明确副作用 | baseline-retained；未新建 Candidate，不复制旧资格到新版本 |
| 测的是实际生产程序 | S12 历史业务资格 | [qualify.cjs](../../tests/workflows/calculator/qualify.cjs)、[RUN/test-result.json][run-result] | 原样候选快照、原生回执、独立显示观察、前后依赖 | 固定业务实际 110→660，第二段消费实际首值 | 复用 q002；本轮 `--check` PASS，只读绑定／语法，不是新 live |
| 视觉与用户接受单列 | 截图、人工验收 | [历史视觉记录][visual]、[README 证据路线图](../../examples/agent-to-recipe/README.md#怎样核对正确性) | 原 PNG 及对应版本；用户自行审阅 | 窗口完整、值清晰、无裁切／错位；用户明确接受 | 历史 Agent 已读 0/110/660 原图；本轮复用，未新截图或新增人审 |

`native invoke acknowledged` 是框架原生调用确认，不能称为 OS 物理点击监听。历史独立观察是另一个只读 Execution 自行读 UI，仍共用 Runtime／AX 后端；它不向候选供值，也不构成独立实现或盲评。

## 接续盘点及需求决定

| 来源处置 | 本次内容 | 证明边界 |
| --- | --- | --- |
| 已复用 | 原 Dossier、Raw Trace、DistilledSteps、AppProfile；r003 需求／过程、q002 Candidate／Qualification、历史普通命令与 RUN | 固定字节及历史范围；不代表当前桌面状态 |
| 需核实 | 每次未来运行的窗口、权限、binary／依赖；三个新增 Skill 的宿主加载、隔离上下文表现；用户接受 | 本次没有授予新桌面动作，也没有宣称这些已通过 |
| 本轮反向形成 | 从既有成功链形状提取合成 Frozen Fixture、反例、相邻消费检查、方法说明和代码评审 | 记录于本次，不能追认为当时执行前已具备的方法或测试 |
| 无法事后补造 | 缺失的动作前观察、未发生的请求时间、逐次底层读取或 OS 输入监听、盲上下文及人类批准 | 现有成功不能填补这些空白；保持未知或未测 |

| 需求／决定 | 设计覆盖 | 本轮实现 | 验证及未完成部分 |
| --- | --- | --- | --- |
| 普通 JS、阶段及职责不扩张（DREQ-03/07/12/17/18） | 完整任务树、原 S/G 编号保留 | 四个方法入口明确，新增三个 SKILL；仅 Node 维护检查 | 源码评审及格式校验；没有宿主安装结论 |
| 可选代码改进（DREQ-05/09/13） | 可保留原基线，有范围和结束条件 | 本页固定候选评审，不改生产 JS | baseline-retained；未测所有坏代码反例或性能收益 |
| 来源、真实值与必要路径（DREQ-01/06/32/33） | Dossier→DistilledSteps→Procedure 唯一职责 | 拒绝读值缺证据、误删、机械去重、来源错接、样例常量 | 正常、负例及合法省略截图通过；没有一般因果分析证明 |
| 可接续与变更失效（DREQ-04/10/11/14） | 信封与相邻语义、依赖、资格分别核对 | 共用安全读取基础，保留旧失败与内容绑定 | 72 项通过、真实 CLI、`--check`；跨会话盲消费未测 |
| 有界执行及同一 Agent（DREQ-08/23） | 未知输入停止，正常复用，不为每步建交接 | 延用原生产门禁；本轮纯离线检查，不重跑 Calculator | 静态 unknown 拒绝；真实 unknown／partial 故障注入未做 |
| 分层质量（DREQ-15/16/24） | 评分、安装、业务、视觉、人审分离 | 下方两份评分，唯一权重正文仍在 validation-plan | 3 个 Skill 格式通过，不是行为准确率；不宣称 ≥95 或人审完成 |
| 多入口、业务与计划（DREQ-02/19/20/30/31） | 保留原设计及真实任务合同／计划 | 本轮复用已有资产路径，不重新生成任务 | 未测试 Human 适配、跨应用、他人复用、自然语言新规划及早期否证能力 |
| 应用认识／Collection（DREQ-21/22/25—29） | 保留原职责与专项设计 | 仅复用当前 Calculator Profile | 不因本次 PASS 宣称模型提取、留出布局、Collection／traversal 或其他平台成熟 |

完整 DREQ→阶段→BC 映射仍在 [chain-design.md](../../workflows/agent-to-recipe/design/chain-design.md#八需求覆盖与责任映射)。本轮实现／验证没有把全部设计待办改成完成。

## 固定候选的 code-rebuild 评审

评审范围：2026-09-19 对固定 Calculator 场景的业务／数据、API、异步与停止、函数职责和维护成本审查；不改变定位策略或生产字节。依据包括当前源码、TaskContract、Procedure、AppProfile、Candidate 绑定的 canonical API 阅读包，以及 q002 历史观察。`qualify.cjs --check` 也核对当前 API／依赖仍匹配冻结清单。

| 固定对象 | SHA-256 |
| --- | --- |
| [calculator.js](../../examples/agent-to-recipe/calculator.js) | `a62c72aa2b00f256755aac2524d14e4655a88194c012bf6765f0d314a62774cc` |
| [TaskContract r003][contract] | `e37dc0e8fdb9b676a72c8a0d9678b9b934964c094311475abed12293af62a2e6` |
| [Procedure r003][procedure] | `e36d3deac20c06282632a859f8cad9a69d7965771021dcb4eaa7e47ec2a6039a` |
| [Candidate r003-q002][candidate] | `31f610a5265abbf855911861c3e3137ab9f21f0ab66da3f5392b868bcde30925` |
| [code-rebuild 方法](../../workflows/agent-to-recipe/skills/code-rebuild/SKILL.md) | `1521ee5683e26af77868f5779ce07012e1731384bedbcf355ad0ec0d30c591d5` |

其他方法、检查器、测试、fixture、合同和文档的完整内容绑定见 [content-bindings.json][bindings]。评审结果写在本页，不修改冻结 Candidate，也不倒填 progress 或历史 request。

| 项目与代码位置 | 映射／依据与影响 | 处置与验证 |
| --- | --- | --- |
| `main()` 96–102；B020→B025→B040→B050 | 首次实际读数赋给 const，第二次输入展开同一值，最终返回 UI 值；不是 JS 算术或 expected | 保留；源码人工式审查、原样快照、静态消费检查及 q002 交叉支持 |
| `clearCalculator()` 56–71；B010/B030 | 最多 C→AC 两次，必须 AC 后回读 0；两处显式调用 | 保留；不把“显示 0”当作全部清空，不在 click helper 偷加准备 |
| `clickCalculatorButtons()` 75–86；B020/B040 | 稠密 1..16 token 数组、保留重复数字，只调用框架 `UI.tapTargets`，返回原样回执 | 保留；两次真实调用有据，参数语法可接受不代表任意组合已资格化 |
| `currentCalculator()`／`inspectCalculator()` 14–43 | 确切窗口、焦点、Basic 尺寸；完整快照、目标唯一／enabled／invoke；首次清除前预检全部 distinct 按钮及读值 | 保留必要运行门禁；未提供其他语言／布局或漂移实测 |
| `readCalculatorResult()` 46–54 | 两次同一窗口实际 UI 读取，相同且无符号 ≤12 位才返回；任何失败终止链 | 保留；瞬态不可读时安全停止，当前不声称自动恢复或高可用 |
| 顺序、失败与复用 | `await` 串行；循环有界、错误向外传播；无自动输入重放、无旧 ref／坐标缓存；API 合同规定逐步重新观察 | 保留；未做本轮 live 取消、unknown／partial、权限和延迟故障注入 |
| 生产／测试职责 | 生产无 110/660 Oracle、截图、hash 写盘或资格 verdict；单文件普通函数复用 | 保留；没有证据支持再加类、应用对象层或拆模块，未测性能／成本提升 |

未发现固定范围内需要修改的实质问题。源码模式检查只识别直接 await／spread；本次另由 Agent 阅读实际函数体、调用顺序和变量绑定，不能把这个方法推广为任意 JS 的静态证明。

## 两个评审对象分别评分

唯一规则为 [validation-plan 五维评分](../../workflows/agent-to-recipe/design/validation-plan.md#六95-分目标的评估办法)。表内小项按该正文顺序取 5（有相应范围证据）／2（局部）／0（无证据或错误）；本轮把“复杂度与成本”的计划和预算说明合为一个检查项，使 15 分对应 3 项，总计仍 20 项、100 分，权重未改变。

候选评分只评价上述精确代码及固定场景；工作流评分只评价本轮 S7→S12 静态消费切片与手工方法接线，均不是一般可靠性、模型成功率或独立专家结论。

| 维度／上限 | 候选代码：小项 → 分数 | 工作流切片：小项 → 分数 | 证据与扣分原因 |
| --- | --- | --- | --- |
| 需求／语义 25 | 5/5/5/5/5 → 25 | 5/5/5/5/5 → 25 | 原合同、数据流、来源分类和本页限定覆盖；未把范围外设计当本轮实现 |
| 职责／独立 20 | 5/5/5/5 → 20 | 5/2/5/5 → 17 | 代码与测试职责明确；Skill 输入合同及静态检查已落地，隔离上下文充分性尚无证据 |
| 工件／接续 20 | 5/5/5/5 → 20 | 5/5/2/5 → 17 | 真实字节绑定及生命周期可查；任意规划／过程的无聊天接续只覆盖固定样本 |
| 验证／维修 20 | 5/2/2/2 → 11 | 5/5/2/2 → 14 | 固定 live 正例复用，静态正反例实际通过；生产故障变化、跨责任实修及改码后新资格未全面验证；q001→q002 只属测试观察器维修 |
| 复杂度／成本 15 | 5/5/2 → 12 | 5/5/2 → 12 | 普通函数、共用读取基础、只补缺口；没有模型费用／计划节省量的实测数据 |
| 合计 100 | **88** | **85** | 不宣称达到 ≥95；硬性错误／缺证据不能由这些分数抵消 |

工作流评审额外发现并修复：畸形数组抛异常、未运行边界误标 PASS、自依赖／Procedure 重排、保留声明与步骤脱节、同名输出冒充实际读值、注释／字符串假调用，以及失败资格被正常消费。对应反例已进入测试。原有断言未降低。剩余限制是普通 JS 的可达性／别名／遮蔽、完整 schema／传递依赖及一般业务因果均需另验；没有为补齐它们引入编译器。

## 直接入口与本次检查

以下命令均从仓库根 `/Users/mac/Documents/workspace/clawdesk` 执行。普通命令和 live Gate 会激活、清空及操作 Calculator，需本机支持的 Basic 窗口、权限与空闲桌面；本轮仅复用历史运行，不执行这两个入口。

```bash
./dist/opendesk -script examples/agent-to-recipe/calculator.js -console-mode script
node tests/workflows/calculator/qualify.cjs
```

只读工件检查（root 由调用者显式允许，不读取任意仓库／用户根）：

```bash
node workflows/agent-to-recipe/scripts/check-artifact-chain.js --dossier .runtime/automation-authoring/calculator-fresh-20260918/dossier.json --actions .runtime/automation-authoring/calculator-fresh-20260918/demonstration/actions.json --distilled .runtime/automation-authoring/calculator-fresh-20260918/distilled-steps.json --procedure .runtime/automation-authoring/calculator-fresh-20260918/revisions/r003/procedure.json --candidate .runtime/automation-authoring/calculator-fresh-20260918/revisions/r003/candidate-q002.json --qualification .runtime/automation-authoring/calculator-fresh-20260918/revisions/r003/qualification-q002.json --root task=.runtime/automation-authoring/calculator-fresh-20260918 --root source=examples/agent-to-recipe --root runs=.runtime/tests/workflows/calculator --root manual=.runtime/runs
```

| 实际检查 | 本次结果及证据 |
| --- | --- |
| `node --test tests/workflows/handoff-integrity.test.js tests/workflows/artifact-chain.test.js` | **72/72 PASS**（45+27）。[稳定 fixture](../../tests/workflows/fixtures/calculator-artifact-chain/source.json) 与[期望](../../tests/workflows/fixtures/calculator-artifact-chain/expected.json)明确为合成测试；不需要历史任务包，不执行候选。包含合法省略截图的正例，避免全拒绝 |
| 上述真实 artifact-chain CLI | **PASS**，27 个引用文件、五个检查边界；[原始报告][chain-check]。这不是完整依赖闭包或桌面资格 |
| `node tests/workflows/calculator/qualify.cjs --check` | **PASS**；[检查结果](../../.runtime/tests/workflows/calculator/2026-09-18T17-27-18-138Z-57348/test-result.json)。未启动 Runtime；测试工具仅在 `.runtime` 写核查日志 |
| `python3 /Users/mac/.codex/skills/.system/skill-creator/scripts/quick_validate.py <三个新增Skill目录>` | **3/3 PASS**，各自单独调用；只校验格式／命名／占位符，不证明方法表现或宿主加载 |
| `node scripts/audit_test_architecture.js` | **FAIL（既有）**：当前布局 invariant 通过，10 个 Go 测试未登记。已逐个核对它们与 HEAD 字节相同；[审计输出](../../.runtime/tests/test-architecture/audit.json)。不扩修这些文件 |
| `git diff --check` | **PASS**；最终收尾重新检查，未暂存／提交 |

历史普通一行命令：q002 所引 `direct-20260918-234653-089000` PASS。历史正式 live Gate：`2026-09-18T15-45-08-040Z-75772` PASS。历史视觉：原图由 Agent 实看 PASS，本轮复用其内容绑定记录。**人类验收、宿主自动加载、盲上下文、新桌面场景均未完成／未运行。** 当前 native 源码虽有其他任务改动，历史受测 binary 的 VCS 为 `2758d3032ac847d599008eb7cf7b37743788b8a5`（dirty），不能冒称本轮 HEAD 已构建验收。

## 文件寿命与未提交边界

本轮新增／修改的是四个设计层入口的接线说明（WORKFLOW、共享合同及既有 design 文档）、三个 Skill、共用读取基础、工件链检查及正反 fixture／测试、本质量总览。原 check-handoff 只抽取共用基础，45 项回归保留通过；Calculator 生产／测试文件与冻结工件均保留原字节。已有 r003 报告只增加本总览导航，不复制新的状态正文。

本任务相关改动仍全部未提交；其他 assistant/product、accessibility、flow、execution、Custom UI 等 dirty 文件未在本轮修改。没有 commit、push、fetch、reset 或 clean，远端状态未核验。历史 [q001 fail](../../.runtime/automation-authoring/calculator-fresh-20260918/revisions/r003/qualification-q001.json) 保留为 fail；另一个既有示例安全测试失败只引用 [r003 记录](agent-to-recipe-calculator-r003.md#完成判断与未测边界)，本轮未重跑或宣称修复。

`.runtime/` 是本地可清理证据，不进入版本控制。清理后旧资格的可复核闭包失效，不能只凭本页继续声称可核查；需要从保留的真实资料恢复并核对 hash，或建立新候选／新资格。稳定 fixture 是可维护测试资产，会由测试生成独立临时实例，不能替代被清理的真实历史。

[contract]: ../../.runtime/automation-authoring/calculator-fresh-20260918/plan/r003/task-contract.json
[procedure]: ../../.runtime/automation-authoring/calculator-fresh-20260918/revisions/r003/procedure.json
[distilled]: ../../.runtime/automation-authoring/calculator-fresh-20260918/distilled-steps.json
[candidate]: ../../.runtime/automation-authoring/calculator-fresh-20260918/revisions/r003/candidate-q002.json
[qualification]: ../../.runtime/automation-authoring/calculator-fresh-20260918/revisions/r003/qualification-q002.json
[visual]: ../../.runtime/automation-authoring/calculator-fresh-20260918/revisions/r003/visual-review-q002.json
[run-result]: ../../.runtime/tests/workflows/calculator/2026-09-18T15-45-08-040Z-75772/test-result.json
[chain-check]: ../../.runtime/tests/workflows/agent-to-recipe-review-20260919/artifact-chain.json
[bindings]: ../../.runtime/tests/workflows/agent-to-recipe-review-20260919/content-bindings.json
