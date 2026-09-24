---
name: recipe-qualify
description: 独立验收一个冻结的 Agent-to-Recipe Candidate（S12），绑定精确脚本/依赖/合同/环境和预先定义范围，执行 Fresh Run 并形成 QualificationRecord。用于单次运行证据、重复运行证据、参数化证据、范围判定和修复路由；绝不修改 Candidate、成功标准或 requested scope 来获得 PASS，也不能让一次成功扩大成未验证范围。
---

# recipe-qualify｜冻结候选资格验收（S12）

## 定位

本 Skill 只回答：**这个精确 Candidate，在这个明确范围和环境里，实际证明了什么？**

它不改 Candidate、不修代码、不重写成功标准、不把 requested scope 缩小成容易通过的子集。资格结论永远绑定 exact candidate bytes + dependencies + contract + environment + actual evidence。

## 开始作业时读取

必读 [input-spec](references/input-spec.md)、[output-spec](references/output-spec.md)、[validation](references/validation.md)、[failure-handling](references/failure-handling.md)。使用 [qualification 模板](templates/qualification-record.md) 组织新任务；[Calculator 示例](examples/calculator.md) 解释 one run / repeatability / parameterization 三种不同证据强度。

正式 QualificationRecord 字段和状态以 [共享合同](../../../../docs/frameworks/agent-to-recipe-skill-contract.md) 为唯一依据。原 [io-spec](references/io-spec.md) 仅兼容导航。

## 方法

### 1. 冻结对象和请求范围

实际读取 TaskContract、success/failure criteria、CandidateManifest、script bytes/hash、关键依赖、entry command、working directory、Procedure/AppProfile/API refs、requested qualification scope、环境/build、授权和预算。

candidate 或关键 dependency 一旦变化，旧 attempt 立即停止；新字节必须走新 Candidate/revalidation。S12 不能现场 patch 后继续把结果记到旧 Candidate。

### 2. 运行前定义 scenarios 和 Oracle

每个 requested scope 在执行前定义：
- scenario；
- scopeRefs；
- input；
- expected/oracle；
- independent observation source；
- allowed side effects；
- stop conditions。

Expected 是 Oracle，不是 production input。scenario 的 scopeRefs 不能等结果出来后再“顺便”扩大。

### 3. 清洁且可归因的起点

准备动作与 Candidate run 分离记录。未知副作用先核对真实状态，不为获得理想起点盲重放旧前缀。

### 4. 运行 exact production entry

在获准条件下运行被冻结的正常入口，记录 actual command、working directory、environment/build、execution refs、action receipts、stdout/stderr/raw outputs。测试替身/另写脚本/临时实现不能替代生产 Candidate。

### 5. 独立观察业务结果

按 criterion 要求从独立 UI/业务/输出渠道观察，不把正确答案喂回 Candidate。Framework success receipt、UI observation、业务 result、visual/human acceptance 分层记录。

### 6. 判每个 scenario 和 scope

scenario 状态为 pass/fail/not-run/blocked。每个 qualified scope 必须至少被一个 passing scenario 以 scopeRefs + actual evidence 覆盖，并且没有适用的失败/未运行缺口被隐藏。

requested 中未测的项不能移入 excluded 以换整体 PASS。

### 7. 区分三种证据强度

**单次 Fresh Run**
只证明：这个冻结 Candidate 在该次明确环境/输入/范围下成功一次。

**重复运行（repeatability）**
若要声明可重复，至少需要同一冻结 Candidate 的两个独立 Fresh Run，相关范围一致且各自有独立执行证据。

**参数化（parameterization）**
除了满足相应运行要求，还必须至少使用一个不同于示范值的合法输入，通过同一 Candidate、同一公开 inputContract、无需修改源码完成，并证明实际业务 consumer 使用了变参。

一次 run 不能自动证明 repeatable；固定输入成功不能自动证明 parameterized。

### 8. 判断“普通 Recipe”而不是逐步 Agent 控制

若 Candidate 运行时仍让 Agent/LLM 逐屏决定每个桌面点击，则不能把该范围描述为普通确定性 Recipe。允许的 bounded semantic judgment 必须预先声明、范围受限、有 schema/guard 并在资格范围中明确。

### 9. 形成 QualificationRecord

每项 criterion 写 actual vs expected、evidence、status。QualificationRecord 明确 requested/exercised/qualified/excluded、failedCriteria/skipped、actualCommands、workingDirectories、executionRefs、buildProvenance、environmentScope、observedResults、evidenceRefs、repairRequests、verdict。

PASS 不能扩大 scope。一次运行通过的固定 Calculator 不等于任意表达式、任意布局、任意平台或任意参数组合。

### 10. 路由修复，不在 S12 修改生产对象

事实缺失回 demonstration；S7 必要路径错误回 trace-distill；业务/data semantics 回 procedure-synthesize；应用规则回 application-engineer；实现 bug 回 recipe-build；Oracle、场景、证据和资格记录错误留本 Skill。

## 完成条件

只有 exact Candidate、exact requested scope、预先定义场景、actual production run、独立 observation 和逐 criterion/scope coverage 都闭合，才能发布对应资格结论。高代码审阅分、历史 PASS、checker PASS、一次最终数字正确都不能替代缺失的 live evidence。