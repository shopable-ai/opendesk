# trace-distill｜正确性检查

检查方法正确性、来源和消费者可用性，而非文件数量或动作减少率。适用 Gate/失败分类沿用 [validation-plan](../../../design/validation-plan.md) 的 G0—G7/F0—F10，不另建体系。

## 独立审阅顺序

| 检查 | 如何发现错误 | 不足时怎么办 |
| --- | --- | --- |
| 输入来源 | 核对任务/计划/根/hash/实际正文，区分事实与 Expected/代码 | 补交已有材料，或回原事实/政策责任 |
| 实际顺序 | 对照 Raw Trace 顺序和 planned/actual，检查未执行计划是否混入 | 删除伪造派生项，保留原事实并修 S7 |
| 唯一取舍 | 逐个原动作/片段对账，检查漏项、重复处置、无理由消失 | 修 actionDecisions；不能只统计数量 |
| 来源双向覆盖 | retain/merge→step.sourceActionRefs，正常来源→合法取舍 | merge 找不到原动作即失败；omit/recovery 不能潜入正常来源 |
| 合并无损 | 对比目标、顺序、输入序列及出现次数、实际变换、前后状态/验证 | 不能用父 actionId 相同掩盖子输入去重 |
| 删除有据 | 检查是否丢数据生产、状态准备、等待、安全、终点或约定证据 | “重复/计划外/无返回值”不能单独支持 omit |
| 数据完整 | 逐值核对 action/observation/origin 的值和应用/目标；枚举全部真实消费者 | 同值不同来源、漏消费者或错 transform 均不放行 |
| 状态与因果 | 每步前提由初始状态或保留前步支持；读值先于消费 | 不跨清空/状态转换猜测等价，不拼接缺前提的成功后缀 |
| 恢复/副作用 | 检查恢复是否被偷偷当正常路径、unknown/partial 是否变成功 | 先核对实际效果，保留失败和恢复边界 |
| 下游可用 | 只凭本 Skill、合同和交付包解释每个值/动作及安全下一步 | 不能靠完整聊天、标准 Procedure 或最终 JS 补缺口 |

## 必须能拒绝的反例

| 改坏的内容 | 正确判断 |
| --- | --- |
| 删除 Calculator 首读，因为终值仍可计算 | 失败：丢真实生产者，Expected 不能替代 |
| 删除第二次清空，因为前面已经清空过 | 失败：必须证明第二段前置状态，不能按同名动作去重 |
| 把原 `1,1,0` 输入变成 `1,0` | 失败：输入次数和数位语义改变，即使 actionId 仍在 |
| 保留值名但把消费者写成历史常量 | 失败：值的真实来源到消费断裂 |
| 读值字符串相同、应用/目标来源不一致 | 拒绝投影，回 S3—S6 查来源；关系缺口另回应用工程 |
| 两个消费者合并，只保留其中一个 transform | 失败：每个原消费者绑定仍须保留 |
| 删除最终读取，因为后面没有 UI 动作 | 失败：final output 是合法去向 |
| 删除“没有输出”的安全/状态检查 | 失败：数据消费者不是唯一必要性依据 |
| merge 跨越必要读取或把有界等待改成没有等待 | 失败：合并改变因果/验证边界 |
| 把超时且效果未知的动作视为未发生，再接成功尾部 | blocked：先确认实际副作用，不能猜路径 |
| 把恢复候选的值当正常步骤 producer | 失败：未证明正常路径的数据可用性 |
| 源动作完整但 S7 漏投影 | 由 S7 修订，不要求重做真实业务 |

这些是审阅题，不是本次已经运行的模型/桌面测试。非 Calculator 的必测方法练习包括：带前导零文本、一个值多个消费者各有变换、必要等待、安全检查、合法无业务输出、终点读取、可省略诊断、恢复与未知效果。按实际证据分别记录结果，不把一个样例通过扩成通用能力。

## 现有确定性检查及覆盖边界

从仓库根目录运行；尖括号参数须替换成已经取得的真实文件，不创建空 Procedure/Candidate 充数：

```bash
node workflows/agent-to-recipe/scripts/check-artifact-chain.js --through trace-distill --dossier <dossier.json> --actions <actions.json> --distilled <distilled-steps.json> --root <id=directory>
```

`--format markdown` 生成同一结果的审阅视图。该检查不需要未来 Procedure/Candidate/Qualification。当前 Calculator 形状 v1 成功路径、固定计划、digit-string、A/B 标识是有限检查切片，不是通用 schema、历史真实性、因果必要性或任意恢复证明。

对应检查器回归入口：

```bash
node --test tests/workflows/artifact-chain.test.js
```

相邻 Producer 评测入口仍是 `tests/workflows/tools/adjacent-producer-eval.js`；其中显式 `checkerScope: sequential-dataflow-v1` 覆盖 text/digit-string、identity/characters、前向跨步读值/消费/终点。金额、分支、循环、恢复及同一步内部读后用可能合法但不在该切片覆盖内；记录 CHECKER_COVERAGE 并交适用专业审阅，不改造业务或伪填成 PASS。不发明新的 CLI flag。

无模型适配器时评测只准备输入并记 not-run；Producer 不取得标准 DistilledSteps，Expected 由评测方保管，S9 只消费本次真实输出。固定方法/规格/合同字节、输入包、预算、实际上下文方式和失败尝试；不能无限重试熟悉答案。确定性探针验证检查器，不等于模型生产能力。

## 完成判据

必要动作与每条状态/数据依赖可解释，原动作完整对账，逐主张可追源，失败能准确返回，下游不需要猜。任何必要来源/权限/效果缺口阻塞依赖放行；超出检查器覆盖的合法材料不得自动判业务错误。结构审查、专业审阅、实际模型生产、独立上下文交接和真实执行分别报告，不互相代替，也不以文档评分替代 Stage/Gate/Qualification。
