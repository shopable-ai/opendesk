---
title: "Agent-to-Recipe｜交接审阅地图"
description: "用具体输入、输出、反例和失败责任快速判断 S1—S12 的相邻交接是否正确。"
order: 35
---

# Agent-to-Recipe：怎样判断每个环节做对了

本文只回答一个问题：

> **当一个阶段把成果交给下一个阶段时，人和 Agent 怎样快速判断“这个交接能不能信”？**

本页是**审阅投影**，不是第二份 schema、Gate 或执行引擎。完整任务内容见 [task-decomposition.md](task-decomposition.md)，正式字段见[共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)，验证方法见 [validation-plan.md](validation-plan.md)。

## 30 秒使用方法

先问四件事：

```text
1. 上游真正收到的输入是什么？
2. 它实际产出了什么？
3. 下游必须知道的信息有没有丢？
4. 如果错了，应该回哪个责任方？
```

然后再看版本、hash、Gate、证据和实际运行。

## 正式阶段统一检查协议

Calculator 基准案例把每个阶段都写成“收到什么、负责什么、实际产出什么、怎样验收、错了回哪里”。这不是 Calculator 专用写法，而是 S1—S12 都应满足的**阶段推进 / 阶段检查协议**。

它不是新 schema、Runtime、Gate、状态机或 S13，也不要求每个阶段新建文件。它只是把现有 TaskContract、主产物、Gate、failure owner、handoff 与影响分析用同一组问题检查。Calculator 是这个协议的 reference implementation，不是协议 owner。

审查任一正式阶段时，至少回答：

| 检查项 | 必须回答 |
| --- | --- |
| **Stage Input** | 本阶段实际消费了哪些固定输入、版本、hash、权限和现场前提？ |
| **Responsibility** | 本阶段唯一要解决的核心问题是什么？ |
| **Non-responsibility** | 哪些判断明确属于上游、下游或其他专业职责，不能在这里静默代做？ |
| **Actual Output** | 本阶段实际形成了什么可消费成果？Expected、计划、示例或未来产物不能冒充 actual output。 |
| **Acceptance** | 哪些证据足以证明本阶段职责完成；哪些仍只能是 unknown / not-run / blocked？ |
| **Typical Failure** | 最容易把什么角色、来源、值或边界混错？ |
| **Failure Owner** | 第一个输入仍正确、输出已经错误的责任阶段／职责是谁？ |
| **Invalidated Downstream** | 该错误会使哪些依赖当前错误输出的下游结论失效？ |
| **Preserved Upstream** | 哪些已确认上游事实、产物和证据仍然有效，不应为了“完整”重做？ |
| **Minimum Next Gate** | 进入下一正式阶段前最少还必须成立什么？这里复用现有适用 Gate / handoff，不新增 G 编号。 |

阶段诊断统一采用：

    last confirmed correct artifact
    → first invalid boundary
    → failure owner
    → invalidated downstream
    → preserved upstream
    → next minimum action

同一个 Skill 承担多个阶段时仍逐阶段回答这组问题。S3、S4、S5、S6 不能因为都由 task-demonstrate 承担而合并判定；S8、S9 同理。

## 一、旧任务树怎样继续使用

各材料的职责保持分开：

| 材料 | 用来判断什么 | 不能据此推断什么 |
| --- | --- | --- |
| [requirements.md](requirements.md) | 为什么做、必须满足什么 | 有需求就已实现 |
| [task-decomposition.md](task-decomposition.md) | S1—S12 完整需要做什么 | 每个节点都必须成为 Skill |
| [chain-design.md](chain-design.md) | producer / consumer / route / failure owner | 职责名就是可调用实现 |
| [共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md) | 字段、版本、正式 handoff | schema 合法就说明事实真实 |
| Skill 方法文件 | 某职责应该怎样生产成果 | 文件存在就证明宿主加载／模型可靠 |
| [validation-plan.md](validation-plan.md) | 怎样测试、怎样判失败、怎样评分 | 测试计划存在就已经通过 |
| 本页 | 快速审阅相邻边界 | 本页显示可读就获得业务资格 |

## 二、主链：在箭头上写交付物，在节点上写职责

```text
User Source
  ↓
S1 automation-plan
  ── TaskContract / WorkPlan ──▶
S2 application-engineer / discover
  ── minimal AppProfile ──▶
S3—S6 task-demonstrate
  ── Dossier / Raw Trace / Evidence ──▶
S7 trace-distill
  ── DistilledSteps ──▶
S8—S9 procedure-synthesize
  ── SemanticProcedure ──▶
S10 application-engineer / harden|repair
  ── reliable Profile / rules / helper ──▶
S11 recipe-build
  ── Candidate ──▶
[optional code-rebuild]
  ── retained / revised Candidate ──▶
S12 recipe-qualify
  ── QualificationRecord ──▶
delivery / explicit publish handoff
```

失败按责任返回，不默认回 S1。

固定版本的 Artifact DAG 只向上游引用：

```text
Source
→ Contract / Plan
→ Dossier / Trace
→ DistilledSteps
→ Procedure
→ Profile / helper
→ Candidate
→ Qualification
```

View、Review、Summary 都是这些权威工件的投影。

### Delivery / Publish Handoff（不是 S13）

Delivery / Publish 是 S12 之后的外部交付边界，不进入 S1—S12 编号，但当它承担真实交付责任时仍可按独立责任对象审查：

| 检查项 | 最低要求 |
| --- | --- |
| 输入 | exact QualificationRecord / Candidate、已证实 scope、交付目标与必要发布批准 |
| 责任 | 把已资格化的固定对象和真实证明范围准确交给外部消费者 |
| 非责任 | 不扩大 qualified scope、不重做 S12、不把登记／发布自动等同于执行用户任务 |
| 实际输出 | 固定交付包／发布 handoff、版本与范围说明、未测项和必要证据引用 |
| 验收 | 接收方能够确认拿到的是同一 Candidate、同一资格范围和可复核证据 |
| 失败责任 | 交付包装／发布记录错误留在 Delivery；Candidate 或 Qualification 本身错误返回 S11 / S12 |
| 影响 | 只使依赖错误交付的外部发布／消费失效；已验证的上游事实不因包装错误自动失效 |

因此 Delivery 可以被单独审查，但绝不能命名为 S13。

## 三、八个边界怎样判断

| 边界与方法 | 输入里必须看到 | 输出里必须看到 | 最低放行判断 | 错误返回 |
| --- | --- | --- | --- | --- |
| **S1 · automation-plan** | 原始目标、来源、已有资产、授权、限制 | TaskContract、WorkPlan、关键 Unknown、checkpoint | 要求没被偷换；计划不越权；高影响 Unknown 已暴露 | S1 |
| **S2 · application-engineer / discover** | 合同、近期步骤、旧 Profile、获准观察 | 当前应用／页面／目标／读取依据、limits | 下一步关键对象可可靠识别；认识不等于授权 | S2；路线被推翻回 S1 |
| **S3—S6 · task-demonstrate** | 固定计划、Profile、真实输入、授权 | planned/actual、动作、observation、runtime values、consumer、result、side effect | 关键事实实际发生并可追溯 | S3—S6 |
| **S7 · trace-distill** | Dossier、Raw Trace、合同／计划、必要 evidence | DistilledSteps + retain/merge/omit/recovery/unresolved + source refs | 必要动作和真实数据依赖不丢 | S7；事实不足回 S3—S6 |
| **S8—S9 · procedure-synthesize** | DistilledSteps、任务约束、必要应用资料 | Business Steps、参数、producer→consumer、范围、pending engineering | 不重新猜 Raw Trace；业务语义和数据关系有来源 | S8—S9；取舍错回 S7 |
| **S10 · application-engineer** | Procedure、旧规则、工程缺口／失败 | locator/read/wait/action/verifier/helper、失效条件、局部证据 | 每个必要操作能落实，且没改变业务要求 | S10 |
| **S11 · recipe-build / code-rebuild** | 固定 Procedure、Profile/helper、实际 API、代码基线 | exact JS、CandidateManifest、source mapping、依赖 | 实现忠实消费实际数据；Candidate 字节冻结 | S11；语义／规则问题回 owner |
| **S12 · recipe-qualify** | exact Candidate、合同、requested scope、场景、环境、授权 | QualificationRecord、execution、actual evidence、not-run/blocked、repair request | 同一候选在 requested scope 有真实证据 | 按 defect owner 定向返工 |

### 外部责任边界 Contract Matrix：样例、拒绝条件与检查责任

| 边界 | 有效示例 | 必须拒绝 | 主要审阅点 |
| --- | --- | --- | --- |
| **S1** | “第二次使用本次真实读值”保留为合同约束 | 改写成“输出 660” | Source、授权、成功／失败、Unknown |
| **S2** | 当前窗口 + 结果区读值依据 + limits | 只有截图就宣称允许点击 | identity、target、readability、scope |
| **S3—S6** | A005 实际读值，A009 实际消费 | Expected 110 伪装成 observation | planned/actual、producer/consumer、副作用 |
| **S7** | A005 → D030，保留 sourceActionRefs | merge 后丢 A005；合法重复输入被去重 | disposition、顺序、数据依赖 |
| **S8—S9** | D030 → Business Step → runtime firstResult | 改成默认 110；丢终点读取 | 业务语义、参数分类、dataDependencies |
| **S10** | Procedure 读值需求 → 有来源的 read rule / verifier | API 文档存在就写“已验证” | Target/Locator/Read/Wait/Verifier |
| **S11** | firstResult 变量真实进入后续输入 | 读了 firstResult 仍输入常量 | exact bytes、API refs、source mapping |
| **S12** | exact Candidate + predeclared scenarios → actual evidence | 改代码后沿用旧 Qualification | Candidate identity、scope、scenario、evidence |

Gate 选择见 [validation-plan.md](validation-plan.md)，不是每个边界都机械要求所有 G0—G7。

### 同一 Skill 内部的阶段诊断

上面的八行按**外部 handoff / 专业职责**分组；为了定位“哪一个正式阶段先错”，还要在两个多阶段 Skill 内继续细分：

| 正式阶段 | Calculator 有效参考 | 必须拒绝 | 本阶段审阅点 |
| --- | --- | --- | --- |
| **S3 Execute** | P30 真正执行 A005 read，并保存 actual target/request/return | 只有 planned P30 就补写 A005；Expected 110 当 rawReturn | action 是否真实发生、目标、receipt、sideEffect |
| **S4 Observe / Verify** | A005 在正确结果区稳定观察为 actualObservation，再与 Expected 比较 | receipt ok 就写业务 pass；未观察到就写 false | object identity、actual vs Expected、pass/fail/uncertain |
| **S5 Classify / Decide** | S4 pass 后 continue；A007/A008 分类为 setup；unknown 时 stop | unknown effect 继续/重放；必要 setup 被当 off-task | classification、decision、planDelta、recovery |
| **S6 Close** | Dossier 固定 A005→firstResult→A009、A010→final output 与范围 | 只写 final=660 就宣称 complete；补造缺失历史 | taskStatus、scope、data flow、evidence、unresolved |
| **S8 Business Semantics** | D030→B025、D050→B040，Business Step 仍消费 firstResult | B040 已直接写 input=110；producer 无 consumer | step purpose、input/output、consumer、source refs |
| **S9 Reusable Procedure** | B025→runtime firstResult→characters→B040 | firstResult.default=110；无证据扩大 scope | value classification、dataDependencies、supported scope、capability decision |

因此，S3—S6 或 S8—S9 在“八个外部边界”里写成一行是正常的；在**阶段正确性诊断**里再把它们当作一个结论则是不够的。


## 四、用一个值贯穿检查，而不只看文件名称

以 Calculator 的 `firstResult` 为例：

| 层 | 应看到 | 应拒绝 |
| --- | --- | --- |
| User / Contract | “第一次真实读值必须成为第二次输入” | “期望 110 就是生产输入” |
| Dossier / actions | 真实 read action + 实际 consumer | 只有最终 660，没有 firstResult 来源 |
| DistilledSteps | 必要 read step 输出 firstResult，后续 step 消费 | read 被 omit / merge 后 lineage 消失 |
| Procedure | 明确 producer→consumer data dependency | firstResult 被改成配置常量 |
| Candidate | 实际 read 返回值赋给变量并传给后续动作 | 读值存在但后续硬编码 |
| Qualification | exact Candidate、scope、scenario、evidence 一致 | 修改 Candidate 继续用旧 pass |

这个贯穿检查特别适合人工快速发现“文件都齐，但真正数据链已经断了”的情况。

## 五、已经可以运行的增量检查

仓库中的辅助检查用于降低人工审阅成本，不拥有业务资格。

### handoff / artifact 检查

- `scripts/check-handoff.js`：检查 request / handoff 引用、身份和 hash。
- `scripts/check-artifact-chain.js`：检查当前支持范围内的相邻工件关系。
- `--through` 一类前缀检查只能表示“检查到某边界”，不是后续阶段自动通过。

工具输出至少应明确：

- 读了哪些实际文件；
- hash / version；
- 哪个边界 pass/fail/blocked/not-run；
- 失败原因；
- 没检查什么。

**检查器 PASS 不能证明：**

- 事实真实；
- 任意自然语言语义正确；
- Skill 独立 Producer 行为；
- 宿主加载；
- 桌面真实执行；
- Candidate 业务资格。

### 审阅页实际显示什么

审阅 View 应优先显示：

1. 当前检查截止边界；
2. 实际读取的工件和版本；
3. 输入 → 输出；
4. 关键 runtime value 的 producer → consumer 链；
5. unresolved / pending engineering；
6. Candidate / Qualification 的绑定；
7. failure owner；
8. 未检查范围。

View 自己不拥有 PASS 语义，输入变化后必须重新生成／检查。

## 六、八个方法文件的当前边界

这里的“当前边界”指职责边界，不是成熟度状态。

| 方法 | 本方法应该拥有 | 本方法不能证明 |
| --- | --- | --- |
| [automation-plan](../skills/automation-plan/SKILL.md) | S1 目标、合同、计划、Unknown | 用户原话之外的授权；后续任务已经执行 |
| [application-engineer](../skills/application-engineer/SKILL.md) | discover/harden/repair、Profile、operation rules | 业务过程语义；Candidate 整体资格 |
| [task-demonstrate](../skills/task-demonstrate/SKILL.md) | planned/actual、真实 execution facts | 必要动作取舍、泛化后的复用规律 |
| [trace-distill](../skills/trace-distill/SKILL.md) | S7 action disposition 和必要路径 | S8—S9 参数化／泛化 |
| [procedure-synthesize](../skills/procedure-synthesize/SKILL.md) | Business Steps、参数、数据依赖、范围 | 重写 Raw Trace；应用定位工程 |
| [recipe-build](../skills/recipe-build/SKILL.md) | 普通 JS、CandidateManifest、source mapping | 上游事实真实性；独立资格 |
| [code-rebuild](../skills/code-rebuild/SKILL.md) | 有据代码改进或原样保留 | 缺失业务语义／应用事实 |
| [recipe-qualify](../skills/recipe-qualify/SKILL.md) | exact Candidate 的独立资格 | 修改 Candidate 后继续沿用旧结果 |

真实宿主加载、独立上下文能力和业务资格由 [validation-plan.md](validation-plan.md) 定义的相应层证明。

## 七、问题清单与推进顺序

动态 P0/P1/P2、某次 checker 缺陷、测试数量和“本轮已修什么”不再维护在本 canonical 审阅地图。

发现问题时按下面顺序处理：

```text
先确认问题属于哪个边界
→ 找 producer / consumer
→ 判断是输入缺失还是 producer 输出错误
→ 判断是否已经产生副作用
→ 返回最小 failure owner
→ 形成新版本
→ 只重验受影响下游
```

实际缺陷与某版本验证结果进入 `docs/quality/`。

## 快速人工验收清单

对任一相邻 handoff，用下面 10 项即可快速检查：

1. 当前任务身份是否一致？
2. 上游版本／hash 是否固定？
3. 下游需要的主产物是否真实交付？
4. Expected 与 Actual 是否分开？
5. 关键 runtime value 是否有 producer？
6. 每个 producer 是否能追到真实 evidence？
7. consumer 是否真的使用该值，而不是示范常量？
8. unresolved / side effect / limitation 是否保留？
9. Gate 是否允许正常消费？
10. 失败时是否能明确返回唯一责任方？

只要第 3、5、6、7、8、9 任一关键项失败，就不能因为“文件齐全”继续正常链。
