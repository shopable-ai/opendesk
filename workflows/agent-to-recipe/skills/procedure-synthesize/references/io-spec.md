# procedure-synthesize：输入输出适用规格

S8—S9 从必要步骤形成业务过程、参数与数据关系。字段唯一依据：[共享合同](../../../../../docs/frameworks/agent-to-recipe-skill-contract.md)的 S7 → S9 增量和 SemanticProcedure；本页不再维护 actionDecisions、schema 或评分。评分与检查层级统一见 [validation-plan](../../../design/validation-plan.md)。固定方法、本规格、必要正式资料与输入的各自版本。

## 必需与条件输入：收到正文才算交付

必须实际读取 request、固定 TaskContract／WorkPlan、S7 本次有效 DistilledSteps、相关 AppProfile／关系与解释、运行时值的必要证据／政策、实际能力选择来源及所需 canonical／公共约束。资料按本次步骤所需裁剪；不是要求每次拿完整应用档案。核对根目录、字节、hash、schema、来源与任务／计划身份。

Dossier 是历史事实来源，不是正常 S9 输入。dossierRef／sourceActionRefs 仅为 lineage，不授权静默展开完整 Dossier／Raw Trace；检查器能读它们，不代表 Producer 已获准取得。源资料已有但未交付先补包，源资料缺失再定向补证。未来 Candidate／Qualification、完整聊天和 Expected 均不得作为补全依据。

## 下游反向消费证明

| S9 必须决定并交给 S10／S11 的内容 | 所需信息 | 获准实际来源 | 缺失或超出证明时 |
| --- | --- | --- | --- |
| 业务步骤与必要路径对应 | 必要步骤目的、输入输出、顺序／依赖、前后置与验证 | 固定 DistilledSteps.steps，合同目标 | 必要路径／动作取舍错回 S7；业务分组错由 S9 修 |
| 运行时值的业务身份 | meaning、type、必要单位精度、参数与运行值角色 | DistilledSteps 必要投影＋固定合同政策／有来源定向说明 | 源政策缺失回 S1；不能让代码作者猜 |
| 实际读取来源 | observedValue、origin 的 action／application／target、evidence | 固定投影与明确交付的 observation 字节 | 缺历史事实回 S3—S6；不靠最终答案证明 |
| 每个实际消费者及输入绑定 | consumerBindings 的 action、target、transform、observedInput 与步骤映射 | S7 已核对投影＋必要 Profile 目标身份 | 漏投影回 S7；本次业务输入映射错由 S9 修 |
| 允许变换与当次变换的区别 | allowedTransforms 与实际 transform | 固定政策＋实际消费投影 | 不能从允许清单猜当次采用方式 |
| 有效期与重新获取 | validity、失效条件、reacquireOnFreshRun | 有来源政策与投影 | 未知保留并阻塞依赖，历史值不变默认答案 |
| 应用与目标之间关系 | targets／relations、应用身份、同业务对象依据 | 实际提供的 Profile／application-relation 证据 | 缺关系回 application-engineer；不按界面常识补造 |
| 能力选择及验证状态 | 实际候选／选择理由／来源、canonical、公共约束、runtimeValidation | 明确 capability-selection 记录及其实际引用正文 | 有 API 文档不等于有选型；工程 not-run 可交 S10，不能写 pass |
| 终点读取与交付 | terminal value、final output、用户输出要求 | DistilledSteps＋合同 | 不能因为无后续步骤删终点；补正确输出映射 |

本次应能逐项写出“判断／产出 → 来源 ref／版本 → 实际读到的内容 → 证明范围 → 缺口责任”。不把所有资料复制到上一份输出，也不把路径非空当作充分。自然语言政策的业务充分性仍需专业审阅，hash 只固定字节。

## 产物与语义不变量

输出 SemanticProcedure，按共享合同保留 businessSteps、参数／配置／Secret、runtimeValues、dataDependencies、capabilityDecisions、支持范围、恢复候选与未决。业务步骤引用 sourceStepRefs，不重新维护原动作取舍；retained／omittedReasons 只解释业务组织，不覆盖 S7 actionDecisions。

每个业务输入有唯一且正确的来源。正确 runtime 来源不能掩盖同时存在的 Expected／常量来源。每个实际值保留生产者、完整消费者与终点；步骤 consumers、runtimeValues、inputSources 和 dataDependencies 必须一致。保留前导零、单位精度与每个实际 consumerBinding；同一步多个原消费者允许采用不同的获准变换。

事实、解释、Expected 和 Unknown 分开；运行时值不进入 parameters／config／Secret 默认值。未证明的分支、循环和恢复只能作候选／补采请求，不能扩大支持范围。工程验证可留给 S10 并明确 not-run、所需验证与影响范围；关键业务语义不可留给 S11 猜。

## 检查、拒绝及接续

按上述矩阵核对收件，先判断缺包与缺源，再核对步骤覆盖／数据角色／实际绑定／来源选型／终点与范围，使用现有 `--through procedure-synthesize` 或 evaluateAdjacent 的适用检查。合法但超出顺序切片（如同一步内部先读后用、金额、分支）交专业判断，不能机械拒绝为业务非法或改事实迎合测试。

包缺交协调者；历史事实回示范；原动作／投影回 S7；源政策回 S1；应用规则回应用工程；业务含义及映射由本职责修。部分成果保存未决，不发布虚假的正常放行。副作用 unknown 保留并先核对，不重放。

失败后保存原输入／输出／check 与预算。只补 S9 定向资料时固定新引用，重检并复用同版 S7，仅重做 S9；S7 输入、方法／规格或共享合同改变则重新判受影响范围，不沿用旧结果。修订 Procedure 后新版本只使相应下游重验，不反改 Dossier 或 S7。

## 正常、拒绝与修复／复用样例

以下为方法练习；真正 wrapper／探针调用由测试和质量记录另证，不是模型生产能力。

| 类别 | 已提供输入／变更 | 应产出／拒绝 | 原因及接续 |
| --- | --- | --- | --- |
| 正常 | S7 对 `0040` 的真实合成投影；两个原消费者同一步，分别 characters 与 identity；关系／选择／契约齐全 | 同一步保留两条实际变换及输入来源；最终状态读值连接 final output | 合法合并不误拒，不把 `0040` 变 `40` |
| 正常合法空项 | 查询步骤无业务输出，且未提供非必需诊断资料 | 允许该步骤 consumers=[]，其他终点和依赖仍完整 | 不能禁止全部空数组；本次无关资料不是必要前置 |
| 拒绝缺材料 | S7 有效，但未向 S9 交付实际选择记录 | 明确拒绝“凭 API 文档反推选择”；先请求协调者交付固定来源 | Producer 未收包不是上游从未存在；不读全历史补洞 |
| 拒绝错误成果 | 一个业务输入同时指向 runtime 与 Expected，或步骤丢消费者／final output／虚构消费者 | 判数据关系失败，保留原失败输出；S9 定向修订 | 仅值表正确不足以掩盖业务步骤错误 |
| 修复／复用 | 原 S7、方法与规格未变；补交选择记录新版本或修正 S9 映射 | 用 resumeFrom 重核失败记录和预算，复用相同 S7 字节，只消费新 S9 输入；新 Procedure 再检查 | 不重跑 S7，不覆盖失败，不把探针通过称模型／业务通过 |
