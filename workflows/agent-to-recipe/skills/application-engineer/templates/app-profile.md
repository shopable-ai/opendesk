# 应用认识成果模板

> 用于任意应用的 discover，也用于 harden/repair 的认识增量。填在当前工作包，不在 Skill 目录保存运行产物。这是生成 AppProfile 前的填写清单/同版可读视图；正式 JSON 沿用共享合同。删除提示文字不能代替补齐证据，未填项不是 pass。

## 版本、范围与输入

任务/来源身份：<实际身份>
模式：<discover | harden | repair>
本次原始请求及交付范围：<只认识/指定操作/局部维修>
方法、input/output/validation/failure 规格、合同、计划：<精确内容版本/ref>
旧 AppProfile：<实际 ref；没有则说明>
授权与共享预算：<读取/观察/输入/上传分别说明>

## 从任务到认识问题

| 任务所需操作/结果 | 必需目标/父区/关系/状态 | 要回答的问题 | 已交付观察 | 缺口与禁止消费范围 |
| --- | --- | --- | --- | --- |
| <需求> | <必要对象> | <问题> | <真实来源或 unknown> | <下一安全动作> |

## 观察与逐字段主张

| observation/ref | 时间/完整性 | 应用/窗口/页面 | 原图尺寸与坐标 mapping | 实际可见内容 |
| --- | --- | --- | --- | --- |
| <不可变引用> | <实际或未知原因> | <身份> | <实际或 unknown> | <不混入期望> |

| 对象 ID/字段路径 | 主张 | 事实/解释/假设/修订 | 来源与简短依据 | 未知/适用限制 |
| --- | --- | --- | --- | --- |
| <target/region/state/relation> | <内容> | <来源类型> | <ref> | <限制> |

## AppProfile 字段完成情况

applicationIdentity / environmentScope：<身份及有限支持环境>
states / regions / targets：<稳定 ID、父区、必要状态和观察关联>
relations：<必要关系及来源；未知明示>
observationRefs / evidenceRefs / claimSources：<实际引用>
geometryRules / operations / verifiers：<实际规则引用；discover 尚未落实可为空并解释>
preconditions / limitations / maturity：<有据状态，不自动 qualified>
revision / changeLog：<基线、旧新差异、原因、修改者、范围、dependsOn>

文字框、控件框、安全动作区与坐标空间分别记录。动态值不是未来默认值；无映射不准点击。未用几何字段不伪填。

## 审阅、验证与下游

| 层级 | 实际方法/执行者 | 预期与实际 | 证据 | 状态与支持范围 |
| --- | --- | --- | --- | --- |
| 结构/认识/定位/操作/业务（分别填） | <真实发生的检查> | <两者分开> | <ref> | <pass/fail/not-run/blocked> |

消费者与明确交付材料：<只交必要正文和固定 ref>
可继续的工作：<受控范围>
禁止消费/未决与 nextRequest：<缺哪项、返回谁、下一安全动作>

先冻结 Profile/helper，再生成引用其版本/hash 的审阅和视图，最后发布 handoff；不互相回写 hash。未生成视图不列为已交付。
