# 必要步骤成果模板

> 用于任意应用的 S7。填写在当前工作包，不把运行产物写回 Skill。此模板是生成正式 DistilledSteps 的清单/同版可读视图，不是新 JSON schema；正式引用、字段和兼容格式遵守共享合同。未填项不是 pass，禁止伪造 ref/hash/历史动作。

## 版本、范围与进入判定

任务/来源身份、有效计划、本次原始范围：<实际内容>
方法、input/output/validation/failure、共享合同：<精确内容版本>
request/contract/workPlan/dossier/actions/必要 Profile：<固定引用及实际取得情况>
授权根、只读范围、预算：<实际限制>
进入结论和缺项：<可提炼/受阻依赖；已有材料未交付先补交>

## 原事实对账（不是第二份可编辑 Raw Trace）

| 原 action/明确片段 | 原顺序/对应 planned | actual 输入/回执 | observation/状态/证据 | 数据/状态/安全/输出作用 |
| --- | --- | --- | --- | --- |
| <原始 ID，不新造历史> | <实际> | <不混入 Expected> | <真实或 unknown> | <必要性依据> |

## 唯一动作取舍

| actionRef | decision | stepRef 或对应恢复/未决说明 | reason | evidenceRefs |
| --- | --- | --- | --- | --- |
| <原 action> | <retain/merge/omit/recovery/unresolved> | <遵守当前合同表示> | <可反证的理由> | <固定来源> |

逐项核对：所有受处理动作恰有取舍；retain/merge 与步骤来源双向覆盖；omit/recovery/unresolved 不潜入正常路径；子动作顺序、重复次数和验证边界不丢失。对每项 omit 写明为何不承担必要数据/状态/安全/证据作用；无法说明则未决。

## 有序必要步骤

| stepId / purpose / classification | sourceActionRefs | inputs / outputs | dependencies / preconditions | expectedOutcome | verification |
| --- | --- | --- | --- | --- | --- |
| <稳定步骤 ID/目的/类别> | <全部实际来源> | <显式数据> | <状态和数据因果> | <判据> | <实际证据或缺口> |

## 运行时值与实际消费者

每个必需值分别填写：

name / meaning / type：<含必要单位精度；含义有政策来源>
observedValue：<原始读取值，不填未来默认值>
origin / evidenceRefs：<实际生产 action/application/target 及观察；旧格式保留兼容边界>
producerStep / consumerSteps / consumers：<完整映射；终点保留 final output>
allowedTransforms / validity / reacquireOnFreshRun：<已确认政策与来源，不从样例猜测>

| 实际 consumer actionRef | targetId（所属应用经 Profile 核对） | transform | observedInput | 所属消费步骤 |
| --- | --- | --- | --- | --- |
| <每个原消费者各一行> | <实际目标> | <当次变换，不是允许清单> | <仅本值相关输入片段> | <映射> |

对照原 action、observation 和 Dossier 核对读取身份与完整消费者；合并不丢逐消费者变换。保留字符串前导零。无输出动作可无值消费者，终点读取仍需 final output。

## 恢复、未决与已知副作用

recoveryCandidates：<触发/原失败/实际恢复/效果/来源/未知；无则说明>
unresolved：<缺哪项、影响哪些步骤/消费者、返回谁>
sideEffects：<实际已知/unknown/partial，不猜成功>
恢复后的必要状态如何被正常路径支持：<依据或阻塞>
下一安全动作及剩余预算：<不重放未知副作用>

## 验证与交接

| 检查 | 实际方法/执行者 | 结果/证据 | 覆盖/未覆盖与消费限制 |
| --- | --- | --- | --- |
| <来源/取舍/依赖/变换/状态/下游等逐项> | <确实发生> | <pass/fail/not-run/blocked> | <不扩大范围> |

给 S9 的实际输入清单：<主产物、合同/计划、必要关系/值政策、实际选择记录、定向证据正文的固定引用和取得情况>
不得隐含提供：<完整聊天、全量 Dossier/Trace、标准 Procedure/最终 JS>
主产物与同版视图：<先冻结 JSON，再生成注明 ref/hash 的 Markdown>
nextRequest / 影响传播：<缺项、责任、安全接续、Procedure/Candidate/Qualification 重验范围>

修订只生成新派生版本，不覆盖 Raw Trace/Dossier 或旧失败。仅在输入/方法/规格/合同完全未变且复核有效时复用原字节。
