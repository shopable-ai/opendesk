# trace-distill｜输出规格

## 唯一主产物

交付固定 `distilled-steps.json`，或经重检仍有效的原版本引用；同版 `distilled-steps.md` 是可读视图，不是第二份事实。正式内容遵守 [共享合同](../../../../../docs/frameworks/agent-to-recipe-skill-contract.md) 的 DistilledSteps 及 S7→S9 输入充分性增量，不升级 schema，不把模板伪称可直接运行的 JSON。

## 内容与最小含义

| 现有字段/内容 | 必须表达什么 | 消费约束 |
| --- | --- | --- |
| contractRef/planRevision/workPlanRef | 本次任务、成功标准、有效计划和范围 | 不能把未执行的新计划写成旧事实 |
| dossierRef/appProfileRefs/sourceActionRefs/evidenceRefs | 实际读取的固定来源及必要应用资料 | lineage 不代表下游已取得全部内容或获准读全轨迹 |
| steps | 有序必要步骤及来源、输入输出、依赖、前提、判据/验证、类别 | 每一步均可追到实际动作，不重设计业务 |
| actionDecisions | 每个受处理 action/明确片段的唯一取舍、对应步骤、理由及证据 | 保留省略/恢复/未决记录，不只留下成功动作 |
| runtimeValues | 必需实际值、读取来源、生产/消费步骤和逐原消费者绑定、政策来源/有效期 | 历史 observedValue 不是未来参数、配置或默认值 |
| recoveryCandidates/unresolved/sideEffects | 恢复经验、缺项和实际已知效果，区分正常路径 | 不以恢复专用生产者供正常步骤使用；unknown/partial 不装成已成功 |

steps 每项至少含 `stepId/purpose/sourceActionRefs/inputs/outputs/dependencies/preconditions/expectedOutcome/verification/classification`。按任务保留必要状态、有效期和副作用；不要复制整份 Raw Trace。依赖可由步骤顺序/传递关系表达，但每条运行时值生产到消费的数据关系必须明确可追。

actionDecisions 每项使用既有 `actionRef/decision/stepRef/reason/evidenceRefs` 表达。retain/merge 的每个动作必须实际出现在所指正常步骤的 sourceActionRefs；反向亦须找到相容取舍。omit/recovery/unresolved 不能藏在正常步骤来源中。没有正常步骤的取舍沿用实际消费者支持的合同表示，不编造正常 stepRef。

merge 只压缩表示，不删除 sourceActionRefs、子动作顺序、重复次数、实际输入或每个消费者的变换。已有多个 retain 同属一步合法；不能为标签整齐破坏已有兼容格式。

## 运行时值必须足以独立消费

保留既有 `name/type/observedValue/origin/evidenceRefs/consumers/validity/reacquireOnFreshRun`，并明确有来源的 `meaning/allowedTransforms/producerStep/consumerSteps/consumerBindings`。当前结构化 origin 使用 `actionRef/applicationId/targetId`；consumerBindings 按每个实际消费动作保存 `actionRef/targetId/transform/observedInput`，消费者应用由已核对的 Profile 目标映射取得，不另造可漂移字段。

生产步骤来自真实读取，而非数学计算、Expected 或恢复候选。一个值有多个消费者时必须全列；即使合在同一步，也保留每个原 action 的输入和实际变换。allowedTransforms 是政策，transform 是实际事实，两者不能互相代替。无业务输出的动作可以没有值消费者；终点读值必须保留 `final output`，不能误判成无用读取。

字符串原样保留，包括前导零；金额、单位/精度或特殊格式由明确政策约束，不用数字样例推导通用规则。新运行重新取值要求必须传到下游，不能仅在备注写“勿硬编码”。旧字段形式无法表达必要信息时请求明确适配，不伪造新 schema 已获支持。

## S7 → procedure-synthesize 交接

下游必须实际拿到：固定 TaskContract/有效计划、DistilledSteps、必要应用身份/关系、值政策和有来源说明、实际消费者变换，以及本次明确交付的选择记录/契约/定向证据正文。它们可分文件，不要求全部塞进主产物，但必须列为获准固定输入，且实际可读。

S9 不应靠回读完整 Dossier/Trace、聊天或最终 JS 才明白值是什么、从哪里来、谁使用和怎么使用。检查器可以只读全源作比对，这不能替代对 Producer 的材料交付。S2—S6 的实际选型记录由协调者定向交付，S7 不从 API 文档或未来代码补造它。

S9 拥有业务步骤、参数和复用解释；错误取舍返回 S7，缺实际动作/读值回示范。S7 不输出 JS，不承担 S10 的定位规则工程或 S12 的资格放行。

## 发布和失败交付

先冻结主产物，再生成带源 ref/hash 的可读视图和检查记录，最后发布既有 handoff；修订先改主产物再重生成视图。列明方法/规格/合同和输入版本、实际检查、支持范围、未决、禁止消费范围及 nextRequest。

关键输入冲突、必要值/消费者缺失、未知副作用或无法解释的必需动作，均不得发布正常 pass。保留真实草稿及缺项是正确失败输出，但不等于原请求已完成。恢复候选和历史失败保留旧来源，不冒充已验证分支；新版本影响 Procedure/Candidate 时沿原链定向重验。
