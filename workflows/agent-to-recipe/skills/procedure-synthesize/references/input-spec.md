# procedure-synthesize｜输入规格

## 必需输入

实际读取并固定 request、TaskContract、WorkPlan、S7 本次有效 DistilledSteps、相关 AppProfile/关系、runtime value 的必要政策/证据说明、实际能力选择来源以及所需 canonical/公共约束。

Dossier/Raw Trace 不是正常主输入。sourceActionRefs/dossierRef 只证明 lineage，不授权静默打开全量历史。已有材料未交付先找协调者；源事实本身缺失再返回原责任。

## S7 与 S9 的边界

S7 输入必须已经回答：哪些动作 retain/merge/omit/recovery/unresolved、哪些 runtime values 被投影、哪些 consumer bindings 属于必要路径。

S9 只解释这些必要步骤的业务含义、参数和数据关系。以下情况必须退回 S7，而不是本地修：

- sourceStepRefs 丢失/重复导致覆盖错误；
- runtime value producer 被错误移除；
- consumer binding 在 S7 投影中缺失；
- 必要顺序被重排；
- action disposition 本身与证据矛盾。

## 运行时值最小输入

每个 runtime value 至少要有：name/type、producer/sourceStep、origin action/application/target（若合同提供）、evidence、consumer bindings、actual transform/observedInput（若已发生）、validity/reacquireOnFreshRun，以及允许变换的政策来源或明确 unknown。

## 可选/条件输入

只按当前必要步骤读取相关应用关系、业务政策、capability selection 记录。不要要求未来 Candidate/Qualification 或完整聊天记录来补洞。