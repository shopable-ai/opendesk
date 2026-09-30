# application-engineer｜输出规格

## 唯一主产物与版本

主产物为 `app-profile.json` 或对现有精确版本的有效复用引用；必要普通 helper 仅在实际存在且有消费者时交付。不得生成第二份 UIProfile/规则注册表。正式输出沿用 [共享合同](../../../../../docs/frameworks/agent-to-recipe-skill-contract.md) 的 AppProfile；新建增量 Profile 使用现有 `agent-to-recipe/app-profile/v1.1`，request/handoff 仍为 `agent-to-recipe/v1`，不自创升级。

本地模板是填写清单/可读视图，不是直接运行或直接发布的 JSON。旧 Profile 缺新字段保持未知；不了解版本的消费者拒绝自动消费，不能静默删约束。只复用原版时不制造无变化的新 Profile。

## 每个 Profile 必须表达的内容

| 现有字段/内容 | 最小交付含义 | 审阅重点 |
| --- | --- | --- |
| applicationIdentity / environmentScope | 哪个应用、窗口/页面、模式、语言/主题/缩放等实际支持范围 | 应用名相同不足以证明是正确对象 |
| states / regions / targets | 稳定本地 ID、类型/名称、父区、必要状态及观察关联 | 目标、文字框、控件框、安全动作区分开；未知不填假坐标 |
| observationRefs / evidenceRefs / claimSources | 实际来源与字段级事实、解释、假设、修订依据 | 路径/hash 只证明字节，不证明现场真实性 |
| relations | 必需父子、标签—输入、结果—操作等关系和来源 | ID 存在不等于业务关系成立 |
| geometryRules / operations / verifiers | 本次真实需要的定位、读取、等待、动作、验证规则 | discover 可尚无操作；不能因此伪装 harden 已完成 |
| preconditions / limitations / maturity | 进入条件、未知、支持限制及有证据的成熟度 | observed/demo-confirmed/qualified 不由阶段名称自动提升 |
| revision / changeLog | 基线版本、旧/新字段、原因、修改者、范围和依赖 | 保留原失败；无影响性改变不强制改版 |

数组无适用条目可为空，但关键缺口要明确。动态显示值、记录实例或一次矩形不能变成永久身份/未来答案。几何规则只填写实际采用的 sourceObservation/referenceRegion、坐标空间、parent region、容差、安全边界、校准证据及 revalidateWhen，不为字段齐全伪造。

## 三模式交付差异

**discover：** 给出“任务需要认识的问题 → 观察 → 主张 → 限制/下一步”的完整映射，最小 Profile、同版认识审阅和具体缺口。可以交付可供受控示范消费的认识，同时把定位/操作/业务记为 not-run。不能只交截图或一句“已了解应用”。

S3 返回的定向 discover 补证可复用原 Profile 并发布有版本的应用知识增量：写出原操作性前置、可能残留的作用、区分性的反例、每个动作前后实际观察与回执、结论支持的环境/序列、仍未知的副作用，以及下一输入前须重新核对的可观察条件。经独立审阅后将增量的精确引用交原 S3；未运行的业务示范和未来状态仍为 not-run。若增量改变原 Profile 的事实或规则，另按修订顺序发布新版本并重验受影响消费者。

**harden：** 除 Profile 固定引用外，逐操作交付 `target、locator、geometry、actionStrategy、runtimeGuards、recoveryRule、qualificationClaims、sourceRefs、unknowns`；明确输入/输出类型、前/后条件、读取来源、等待条件/上限、失败方式、dependsOn 和当前 API 依据。注明哪些有效规则保留、哪些有增量。运行门禁保护当次动作；资格断言和 evidence 支持 S12，二者不互相替代。

**repair：** 在上述对应产物中写明原失败/旧版、归因依据、精确差异、保留资产、已知副作用、影响传播、重验结果或待验项及安全接续点。非规则问题可交“原规则保持有效＋定向返回”，无需为了显示修复而改规则。

## 操作策略的可消费正文

操作策略按[现有规则模板](../templates/operation-rules.md)表达，仍落在现有 AppProfile/规则、helper 与验证记录中，不建立 `strategies.json` 或第二个 Registry。一个操作可以只有一种做法；不要求每个控件单建档案。

| 内容 | 必须交付的判断 |
| --- | --- |
| 候选与选择 | 当前操作硬约束、候选、选中与未选理由；实际失败附原证据，未尝试不写 failed |
| 执行组合 | 公开 API/契约、观察来源、目标绑定和应用封装各自说明，不混成固定优先级 |
| 可执行路径 | 前置、输入来源、定位/读值/等待/动作/验证、当前范围与停止规则 |
| 备用边界 | 每条已验证备用的适用范围、证据和允许切换的动作状态；没有备用明确 stop / human handoff，未验证候选不进入生产选择 |
| 环境与有效性 | 版本、语言、主题、窗口/DPI、结构等真实依赖，失效和定向重验条件；范围外拒绝不冒充兼容成功 |
| 下游与维修 | 固定规则/helper、受影响步骤、能力选择来源、缺口归属和下一安全动作 |

`actionStrategy` 等名称是既有方法合同的阅读项，不在本页宣布新的机器 schema 或自动 Guard。S10 改变 S9 已冻结选择时，输出有来源的修订请求和影响范围，由原责任更新精确引用；不得让 Profile、Procedure 和 Candidate 保留矛盾的选择。仅漏交资料由协调者补交。

## 发布顺序与审阅记录

先冻结 Profile/helper，再生成引用其精确 ref/hash 的审阅、验证和视图，最后写 handoff.artifacts。不要把本次审阅记录 hash 写回它所引用的 Profile。原图、叠加框/关系、简化结构、属性/差异/状态视图由同版数据产生；未生成的视图不得列为已存在。简化结构由数据绘制，不自由重画事实。

审阅记录写 appProfileRef、scope、方法、实际执行者/人工、时间、结论、未知、修改请求。验证记录写 Profile/helperRef、操作、场景/环境、criterionRefs、预期与实际、evidenceRefs、pass/fail/not-run/blocked、重验范围。结构、认识、定位、动作回执、真实后置、业务结果分开报告。

当前任务 `stage-review.md` 的 S2/S10 条目应链接同版选择理由、实际规则正文、证据及证明范围、Unknown、failure owner 与下一步；来源仍是权威成果和审阅记录，不手写第二套策略运行事实，不要求新增平行总报告。

## 下游消费条件

| 消费者 | 必须实际交付 | 不得推导 |
| --- | --- | --- |
| task-demonstrate | 必要身份/目标/关系、状态、进入条件、证据及未知 | 候选规则已 qualified，或旧现场仍有效 |
| trace-distill | 所需应用术语/目标/关系的固定资料 | 原动作和读值历史；历史只能来自 Dossier/Trace |
| procedure-synthesize | 必要应用关系、操作范围、明确选择记录/契约及定向证据正文 | 凭 lineage 静默读取全量历史、把业务 parser 塞入 Profile |
| recipe-build | 已落实的操作合同、当前 API、实际 helper、运行门禁和停止规则 | 只有认识就存在可执行操作；不存在的 API 已实现 |
| recipe-qualify | 冻结候选实际使用的 Profile/helper、支持范围、预定验证要求 | 局部规则 pass 等于整份 Candidate pass |

handoff 还须给出已完成范围、真实局部成果、剩余 unknown、禁止消费范围和 nextRequest。请求原范围未完成时保留 blocked/失败，不缩范围换 pass。
