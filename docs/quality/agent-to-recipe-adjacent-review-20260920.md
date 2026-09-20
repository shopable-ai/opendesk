# Agent-to-Recipe：S7 → S8—S9 相邻交接修复与成果审阅

> 当前接续结论见页末“接续复核：来源身份、合法合并与失败历史（2026-09-21）”。此前各轮记录保留其历史对象、数量和限制，不用新结果覆盖旧记录。

## 方案决定与交付范围

本次在既有 S1—S12、G0—G7、共享合同、方法文件、前缀检查器和相邻评测调用器上修复真实缺口。没有增加 Workflow Engine、DSL、公共状态枚举或第二套合同；没有修改生产 Calculator Recipe、Runtime 或 API 阅读体系，也没有重做历史示范。

**已证明：限定 Calculator 形状 v1 的输入输出、错误拒绝、相邻调用及同源审阅。尚未证明：实际模型 Producer、独立上下文、真实 UI 数据链、宿主加载和整条新生成链。** 单个前缀 PASS 不是阶段完成，159 项测试不是 159 次模型任务，也不是业务可靠性百分比。

补充质量审计见[200 回合多角色反方审计与 95+ 方案评审](agent-to-recipe-adversarial-review-200-rounds-20260920.md)。该记录给当前**设计方案** 97/100，明确不把这 97 分外推成模型 Producer、宿主加载、Fresh Run 或生产资格的 95+；运行证据仍按本页和 `validation-plan.md` 的硬门禁判断。

当前决定／需求覆盖表在[交接审阅地图](../../workflows/agent-to-recipe/design/acceptance-map.md#2026-09-20-接续决定与需求覆盖)；字段与兼容规则在[共享合同](../frameworks/agent-to-recipe-skill-contract.md)，评测执行与唯一评分规则在[validation-plan](../../workflows/agent-to-recipe/design/validation-plan.md)。需求、完整任务树、三个循环和职责划分保留各自权威位置；旧材料按范围继承，不按新旧日期整体废弃。

## 实际修复、原逻辑去向与检查

| 固定对象／目标 | 具体改动与保留行为 | 验收依据与限制 |
| --- | --- | --- |
| S7 前缀检查 | 在原步骤检查内补目的、输入输出数组、依赖、前提、预期、验证、分类；原来源、顺序、合法合并和读值检查保留 | 缺 8 类字段、字符串冒充 inputs 均拒绝；无来源动作仍返回原 SOURCE_ACTIONS 错误，不靠改断言掩盖回归 |
| S9 前缀检查 | 在原数据关系检查内核对 runtimeValues 的唯一声明、真实来源步骤、消费者及终点输出；不维护第二份 actionDecisions | 丢 finalResult、缺／重复声明、错生产者、错消费者均拒绝；仅结构与声明一致性，不证明真实读取 |
| 相邻评测调用器 | 保留实际 S7 输出进入 S9、前缀重检和一次尝试预算；修复未用授权根误拒绝、输入摘要与保存字节不同、多字节输出越界、非 Error 异常丢失、AppProfile 引用旁路带入 Raw Trace | 输入包与保存文件摘要一致；截断原返回与留存字节分别记录；失败 S9 不抹去 S7；方法／共享合同／检查器版本均固定 |
| 同源审阅 View | 关键值的资格列使用本次真实检查状态，另外显示固定记录的范围声明；摘要文本同样转义 | 上游失败则资格显示 blocked；未读记录显示 not-run；View 没有放行、改授权或写回工件的能力 |
| 合同／方法／设计 | 在共享合同修正 legacy 兼容歧义；在原验证计划补实际评测调用合同；S9 Skill 明确传递引用边界；本页只记录事实和结果 | 不新增平行 schema／权重；既有五个方法文件与三个尚未实现的方法职责分开 |
| 合成 Fixture | 只补既有 S7 合同要求的前提、预期与验证内容；沿用相同动作、值、候选和资格声明结构 | 这些新增内容是测试材料，不是补造旧 Dossier 或真实历史证据；Fixture 仍不能获得 live 资格 |

S11／S12 保留并复跑原有候选变更、helper 漂移、缺证据、部分范围、伪 PASS 和硬编码拒绝用例。本轮没有产生新的 Recipe 候选或 QualificationRecord；旧资格只有在其对象、范围和来源仍有效时才可复用，不能由本记录替代本地核验。

## 可审阅的实际相邻结果

开发 Fixture 的固定输入在测试中实际进入相邻调用器，S7 输出固定为新文件，S9 输入引用该输出的实际 SHA-256，而不是标准 DistilledSteps。正常包不向 S9 提供 Dossier／Raw Trace／标准 Procedure；涉及隐式 Raw Trace 的 Profile 另作为拒绝样本。适配器是 evaluator 持有预制开发输出的 deterministic-test-double，不是模型 Producer。

```text
合成输入记录 A005：firstResult = 110
→ S7 本次输出 D030：保留 A005，输出 firstResult
→ S9 本次输出 B025：生产 firstResult
→ S9 本次输出 B040：消费 firstResult，字符展开
→ 相邻输入输出前缀检查通过；Candidate／Qualification 未在这次相邻调用中执行

合成输入记录 A010：finalResult = 660
→ S7 D060 → S9 B050：终点输出必须保留
→ 删除终点输出：拒绝，而不是只因没有后续原动作消费者就放过
```

另一组合法合成输入 `12×3+4`、读取声明 `40`、后续 `6×40`、终点声明 `240` 也通过同一相邻调用器。它只补充输入变化的确定性集成证据，**不是同一冻结候选的真实 UI 变参验收**，更不是未见样本的模型泛化证据。

审阅页由实际 check.json 同源生成，显示引用、字段、firstResult 等关键值、待 S10 工程事项、失败责任及未证明内容。保存文件缺失、hash 错、未运行、截断和上游阻塞不能被页面上的 PASS 覆盖。当前工具仍只处理单固定计划、指定 ID／数据形状和成功路径；通用轨迹、复杂恢复或范围无关未决不能被强改为该形状取得通过。

## 测试基线、方式与失败留存

- 源码基线：`c578d5c7442ac24721086d1b14d0d8392dc82e51`，树 `2f2f165a1b2c4673b4302f0720b6e8c31cae3cc2`。
- 基线来自该提交的 GitHub Actions 源码证据包：run `35456310372`，artifact `10588123027`，包 SHA-256 `1ec4592953b8ac2ca4625fe34d03b543406be40e2b16d710c5034adaa02e30cf`。source-head 与目标提交一致，目标原文件 Git blob SHA 经核对。
- 执行环境：Linux 6.18.44 x86_64、Node.js v22.16.0，隔离源码快照 `/mnt/data/opendesk-audit`。这不是用户的 Mac 工作区，没有用户未推送修改，也没有桌面操作授权或实际模型宿主。
- 基线、红测、第一次修复、第二次修复、4 个分文件确认均实际执行并留存；没有隐藏失败或无限追分。相邻评测每阶段最多一次尝试，超时受预设预算约束，真实模型调用次数为 0。
- 原始 TAP、输入包、失败原文、字节摘要、方法快照及 JSON／Markdown 检查结果保留在测试环境 `.runtime/`，不提交为源码。正式结论由本页和相同提交的测试／方法版本复核；仓库既有 CI 会保存其独立运行证据，不能把本地结果写成尚未完成的 CI 结果。

聚合命令（仓库根目录）：

```bash
node --test tests/workflows/handoff-integrity.test.js tests/workflows/artifact-*.test.js
```

| 实际运行 | 结果 | 说明 |
| --- | --- | --- |
| 原基线＋原测试 | 134 PASS / 0 FAIL | 在本次 Linux 快照重新运行；不是沿用历史文档的测试数量 |
| 原实现＋首批 22 个新反例 | 134 PASS / 22 FAIL | 新反例确实暴露原实现缺口 |
| 第一次修复 | 155 PASS / 1 FAIL | 新前提检查抢先返回 STEP_CONTRACT，遮住原无来源步骤的 SOURCE_ACTIONS 判据；失败保留 |
| 第二次修复＋3 个补充正反例 | 159 PASS / 0 FAIL | 调整原检查顺序恢复原错误判据；没有降低断言；0 skipped |
| 4 个测试文件分别确认 | 159 PASS / 0 FAIL | 45＋56＋41＋17；不是再增加 159 个不同用例 |

## 分层验证结论

| 层级／被测对象 | 实际状态与依据 | 不能外推 |
| --- | --- | --- |
| 确定性函数与 Validator：handoff-integrity | 45/45 PASS | 可信发布身份、现场与授权真实性 |
| 工件合同与切片：artifact-chain | 56/56 PASS | 通用 schema、完整 Stage Contract／Gate、任意 JS 数据流 |
| 交接反例与 View：artifact-boundaries | 41/41 PASS | HTML／文档站视觉验收、人工接受 |
| 评测调用器与相邻集成：artifact-producer-eval | 17/17 PASS，明确使用测试替身／prepare-only | 实际模型方法成功率、盲测、宿主沙箱 |
| 修改的 3 个 JS 实现 | node --check PASS | Runtime 业务可用性 |
| 五个 SKILL.md | YAML frontmatter、name／description 格式检查 PASS | 宿主发现／加载与方法行为 |
| 实际 S7／S9 模型 Producer、独立上下文／未见样本 | NOT-RUN；没有对应模型／宿主执行条件 | 不能用同一上下文换角色或 Fixture 改名补齐 |
| Calculator 同一冻结候选 Fresh Run／合法变参／读失败停止 | NOT-RUN；本次没有 Mac 桌面或现有本地任务包 | 静态硬编码拒绝不等于真实 UI 数据来源证明 |
| S1—S12 新生成 E2E／人工接受 | NOT-RUN | 相邻前缀通过不代表整链完成 |

## 质量结论与评分边界

代码改进对象是前缀检查器、评测调用器和 View，不是新的业务 Recipe。上述表已固定目标、具体改动、原逻辑去向、保留的数据关系、检查、真实范围、风险与下一责任。

评分权重继续唯一采用 validation-plan 的需求与语义 25、职责与独立性 20、成果与接续 20、验证与修复 20、复杂度与成本 15；不建立另一套分数。**本轮不生成 Recipe 的分项成绩或“95 分已达成”结论**：没有新的精确 Recipe 评审对象与独立业务证据；五个维度对 Recipe 均为未评价，而不是默认满分。当前交付的质量结论是“支持范围内离线检查与相邻集成通过；完整工作流／真实候选资格证据不足”。

评审由同一 Agent 完成，未发生独立专家会审、人工批准或视觉验收。硬错误不能被高分抵消，未评价项不得隐藏，下一轮也不要求通过无限重试追到 95。

## 完成标准与剩余责任

| 用户完成标准 | 本轮实际状态 | 依据／未完成影响与下一最小动作 |
| --- | --- | --- |
| 1. 主链可理解 | 已核对并保留现有主链、八边界及三个循环 | 交接审阅地图与原任务树；方法文件存在不等于宿主可用 |
| 2. 合同可检查 | 当前涉及的限定不变量已补齐；完整合同仍部分实现 | 共享合同与 97 项 artifact-chain/boundaries 测试；通用语义仍由专业审阅负责 |
| 3. 测试可解释 | 已交付分层结果、版本、实际命令和失败记录 | 不把 159 当 Producer 成功率；预制答案明确在测试替身层 |
| 4. 相邻链可推进 | 离线相邻调用与输出消费已验证；模型行为未运行 | 接入获准、可核验隔离的宿主后，使用 evaluator 持有 Expected 的样本执行一次有预算的两阶段作业 |
| 5. 错误能够拒绝 | 本轮支持范围内正反例通过 | 原错版、缺证据、假合并、错数据关系、旧资格、Fixture 改名、假 View 等测试保留；范围外不宣称已覆盖 |
| 6. 结论不扩大 | 已落实 | stageComplete/modelBehaviorVerified/liveQualificationGranted 仍不自动为 true；资格局部通过但上游失败显示 blocked |
| 7. 结果可审阅 | 同源字段与关键值追溯已落实；真实任务总览待本地材料 | 以已有真实任务包生成审阅页，定位当前缺口，不补造旧观察 |
| 8. 仓库实际交付 | 本记录与必要代码／方法／设计／测试同批交付 | 以包含本记录的 master 提交和上述测试版本为准，不以下载包或建议代替修改 |

下一最小动作由本地验收负责人完成：**先核对已有任务包、Candidate／helper 与历史 Qualification 的固定版本及原 requested 范围，运行本轮相同前缀检查生成 View，只修真实暴露的缺口。** 已有证据有效则按原范围复用；缺新语义字段保持阻塞或原范围诊断，不倒填历史。

其后由评测宿主负责人执行有隔离证据的 S7 → S9 Producer 测试；由 S12 负责人在获准桌面上核验同一冻结候选的实际 firstResult 读取与消费，及其已声明支持范围内的合法变参／读失败停止。外部预先固定的验收请求尚未被本通用工件检查器完整机器绑定，不得仅凭记录自己填写的 requested 宣称原请求全部完成。

P1 保留更多应用／轨迹、计划修订、复杂恢复、多消费者、证据有效性及依赖影响；P2 再按收益建设必要宿主接线。它们没有被本轮缩小范围永久删除，也没有被标为完成。

## 本轮：输入充分性与失败接续（2026-09-20）

### 方案决定与实际交接

保留 S1—S12、G0—G7、五个 Skill 和普通 JavaScript 交付。三个没有同名 Skill 的职责仍按已有作业依据执行；本轮没有依据把它们宣称为已实现的独立方法，也没有为了凑数新增文件。逐职责决定已回写 [WORKFLOW 的输入充分性表](../../workflows/agent-to-recipe/WORKFLOW.md#当前-skill-划分与下游输入充分性)。

修正发生在原责任位置：共享合同补足 S7 运行时值的有来源投影与实际消费绑定；S7／S9 方法分别补保留与收件检查；现有相邻调用器补固定来源、有限预算和新版本续接。新顺序检查是同一评测入口的显式有限范围，不扩大原 Calculator 检查，不增加工作流引擎或第二套状态。原预制输出测试保持回归身份；新探针不读取任何标准 DistilledSteps／Procedure／Candidate／Qualification。

实际执行的合成工单切片是：读取 `ticketCode = T-042` → 必要步骤 `necessary-0` 生产该值 → `necessary-1` 实际消费该值进行查询 → 读取 `statusText = 已受理`。S9 得到值的含义、类型、应用目标、来源证据、有效期／重读政策和实际 identity 绑定，再投影为 `business-0 → business-1`，并保留 `business-2` 的终点输出。使用的是独立进程输入消费探针；这些值不是新的真实业务观察，`synthetic.read/input` 也不是声称存在的 OpenDesk API。

最小失败接续实际发生如下：第一次只交 API 资料，没有交实际选择记录，S7 通过而 S9 因 `CAPABILITY_SOURCE_MISSING` 失败。责任先回协调者交付已有材料，原来源责任为 task-demonstrate；不是要求重做查询。补交 `selection-r2.json` 后，新目录重检并复用相同 S7，只再次调用 S9。累计实际探针调用 **2 → 3**，总预算 4，每次超时预算 5000 ms，第二次作业只有一次 S9 调用。失败原文和旧目录没有被改写。

本次本地实例目录：`.runtime/tests/agent-to-recipe/input-sufficiency/case-ma1s46`；CI 的临时 case 名可不同，按同一测试和内容绑定复核。

| 固定对象 | 实际 SHA-256 |
| --- | --- |
| 原 S7 输入包 | `8ec52255909a2daeac9d6f4c317b068554c6b2af40f0040910addd5d46a99a8a` |
| 原 S7 输出及修复后复用输出 | `562f8ca492a52ee921c7388557e03c3d9b070e86da1e98d5a2ffefbd10515520` |
| 失败 S9 原始输出 | `45460861fe0a5bdfd8cf761738b54e920962d712cd116fc4757157db55630df0` |
| 补证后 S9 新输入包 | `3ade029cb9a118ac0f744c7984c5f15ec2c28d7ebd12080250bf4844c695f361` |
| 补证后 S9 新输出 | `0efc38a213f765307fedc4a68ced57f93c9b8fb78b67ea5b6488744767a75e21` |
| S7 方法 | `2d98f4081241515ed7dba5bbd5a77be7b190fd7ae0f03bb0db443b5989ce6230` |
| S9 方法 | `19440bf8890ed1c68fcb068f0cdfc8fb459420361b5b9645f7ecd9a1397d2aff` |
| 共享合同 | `a89354273f5e045cf65c94c4381277fac9e24a8c3fcef039b9d46ebcd3138a6e` |

### 实際修改与责任

| 位置 | 改动及原逻辑去向 |
| --- | --- |
| 共享合同、S7／S9 Skill | 只在合同维护字段含义；方法负责如何核对来源、保留实际消费、拒绝猜测和定向返回 |
| WORKFLOW、原交接地图、验证计划、本记录 | 更新同一审阅入口、方法判断、评测参数、版本与结果；旧记录、完整任务树和唯一评分办法保留 |
| `tests/workflows/tools/adjacent-producer-eval.js` | 原调用器增加显式检查范围、S9 定向补充、重新核验 S7、固定 resumeFrom、累计预算和冻结资料重入；不运行桌面、不发布 handoff／Gate |
| `tests/workflows/tools/input-sufficiency/check.js` | 对本次顺序切片检查实际收件、来源字节和声明对应，并复用原审阅 View 展示值与失败；不是通用 schema 或语义判断器 |
| `tests/workflows/tools/input-sufficiency/probe.cjs`、`artifact-input-sufficiency.test.js` | 上游来源直接构造；新进程通过 stdin 计算投影。故障由评测端显式注入，正常与修复都使用本次实际输出，不读取预制下游答案 |

### 验证方式与分层结论

读取基线为 `0ff69b4e3872ddc21fd879f52b8eccd1a9b7de5d`，树 `cdbf298126b21b1670aaee7e85dcdc90e3e1ec7a`。本地源码来自该提交的 CI run `35503594817`、artifact `10603421059`；下载包 SHA-256 为 `f1d036139bdd95dfcb94346e4dff57223e9038c8d8118c8543bfa2501266e737`，source-head 与目标一致。该包仅用于取得可运行源码，不作为仓库交付物。

实际环境：`Linux-6.18.44-x86_64-with-glibc2.41`、Node `v22.16.0`、隔离源码快照 `/mnt/data/opendesk-audit`。它不是用户 Mac 工作区，也没有用户未推送文件或真实桌面授权。仓库交付通过最新 master 的固定父提交和非强制快进，不能据此声称检查过用户的本地 git status。

| 验证层 | 实际结果 | 限制 |
| --- | --- | --- |
| 原基线重新执行 | 159 PASS / 0 FAIL | 是本次实际重跑，不是沿用旧报告数字 |
| 原调用器加本轮新案例，对照测试 | 1 PASS / 23 FAIL | 原调用器不具备本轮范围与续接，错误保留于 `original-evaluator-red-final.tap`；不是模型失败次数 |
| 当前全部离线回归 | **183 PASS / 0 FAIL / 0 skipped** | 原 159 项＋本轮 24 项；包括来源、正常消费、错误拒绝、补证／修复与重新消费。不是生产成功率 |
| 4 个 JS 文件语法、五个方法 frontmatter | PASS | 不证明宿主自动发现／加载、方法行为或文档站视觉效果 |
| 探针进程与输入供给 | 新进程、stdin、Node 文件读取许可清单已实际使用；越界读取返回 ERR_ACCESS_DENIED | 是进程／文件读取边界证据，不是完整 OS／网络沙箱，也不是模型盲测 |
| 实际 S7／S9 模型 Producer、未见样本与独立语义 Oracle | **NOT-RUN，模型调用 0** | 没有本次获准的独立模型宿主；同一上下文换角色没有被冒充隔离 |
| 真实业务、Runtime／候选 Fresh Run、整链资格 | **NOT-RUN，桌面操作 0** | 没有产生新 Recipe 或 Qualification；不把旧资格绑定到改变的候选 |

正常接受实际包括不同编号、digit-string 的实际字符展开、合法相邻合并、非必需诊断材料省略，以及工程验证 not-run 明确交 S10。反例实际包括缺证据、错误选型版本／hash、错误上下游数据关系、S7 含义丢失、终点遗漏、运行值变默认参数、伪造选型、API 契约角色替换、未知副作用、篡改旧输出、输入变化、预算耗尽和非法 Raw Trace 补充。检查器不覆盖的数据类型保留原输入，返回 `CHECKER_COVERAGE` 及验证责任方，不称业务本身非法。

另一个实际续接测试移走原 source 工作区后，仍使用生成的 `resume-request.json`、冻结输入和已修复探针完成 S9；因此本切片的跨会话最小资料不依赖完整聊天或原作者工作区。父目录不能找回时、方法／政策发生变化时、预算不足时不执行这种复用。

证据保存在 `.runtime/tests/agent-to-recipe/input-sufficiency/`：各新 attempt 的 input.json、output.raw、check.json、review.md、evaluation.json、resume-request.json，以及 host-call 命令／版本／退出信息。聚合日志为 `final-publish.tap`，语法和方法清单为 `static-audit.json`。这些临时数据不提交源码；既有 CI 的证据目录会保留其自己的独立运行结果，不能把本地 PASS 写成尚未取得的 CI PASS。

### 下一责任与明确未完成部分

本轮已完成文档／职责审查、可执行收件限制、有限顺序声明检查以及失败后的版本化接续。没有证明五个 Skill 的模型稳定性，也没有证明三个缺少同名入口的职责可在独立上下文中稳定生产。来源真实性、自然语言政策、业务因果、一般分支／循环／恢复、多计划影响与完整 AppProfile／Candidate schema 仍由各原责任作业判断；本工具没有取代它们。

下一最小动作由获准评测宿主负责人承担：先固定一个真实但低风险的上游输入包及预先确定的独立验收目标，明确材料外发、工具与预算；让真正隔离的 S7 生产者生成结果，再让 S9 仅凭其包生产或准确拒绝。沿用当前失败记录与新尝试目录，必要时只补具体来源，不重新演示无关业务。没有宿主时，CLI 只准备输入，状态保持 not-run。

真实候选仍由 S12 对同一固定字节、实际环境与请求范围验收。当前不授予评分、业务资格或全链完成；也不把“没有实际模型条件”当成离线部分未执行的借口。


## 接续复核：来源身份、合法合并与失败历史（2026-09-21）

### 方案决定与本轮边界

**继续原五个 Skill，不新增阶段、Skill、业务字段或状态体系。** 本次不是重新实现上一轮输入供给，而是用反例复核它是否会漏放错误来源、误拒合法输入，以及接续是否真正保留失败事实。修复仅涉及两个离线评测实现、原输入充分性测试及必要合同／方法／审阅文档；没有改变 Runtime、普通 JS 交付、Candidate 或既有资格。

| 职责／方法 | 审查决定与依据 |
| --- | --- |
| automation-plan，无同名 Skill | 保留现有目标／计划作业依据与共享合同；当前没有证据说明再建入口能解决重复方法缺口。来源政策错误仍回 S1；独立生产未验证 |
| application-engineer，discover／harden／repair | 保留三模式；应用目标／关系有原责任位置，不从 S9 猜测；本次不修改该 Skill |
| task-demonstrate，无同名 Skill | 保留既有同步 Capture 方法；本次缺口是事实账目与原动作不一致，应回原资料核实，不能新建“事后补历史”方法 |
| trace-distill，S7 | 补强投影前的来源身份及完整消费者核对，不能只复制 Dossier 的摘要 |
| procedure-synthesize，S8—S9 | 补强按原消费动作映射、冲突输入来源拒绝及步骤消费者一致性；尚未完成的工程验证仍明确交 S10 |
| recipe-build，无同名 Skill | 保留既有路线 A、代码生成作业说明与 Candidate 合同；本轮没有初次生成失败可归因于缺同名入口，不机械新增；独立生成能力未验证 |
| code-rebuild，可选 | 保留行为保持、精确候选和按需修改边界；本次不改代码候选，不沿用旧资格认证新字节 |
| recipe-qualify | 保留独立候选／场景／环境资格责任；本次离线切片不授予业务资格 |

上述判断是本次文件／作业依据审查，不是模型方法成功率或独立专家会审。

### 真正修复的问题

| 原缺口 | 最小修正与责任 |
| --- | --- |
| 原读取与 observation 的值相同，但应用／目标不同仍可放行；消费者的应用身份未核对 | S7 前缀比较原动作、值来源及固定 Profile；资料相互矛盾回 task-demonstrate 核实，不擅自选一个来源相信 |
| Dossier 漏掉实际消费者仍可被原样投影；未知输入被带到下游；S9 同时存在正确 runtime 来源与另一条 Expected，或步骤丢失消费者 | 对原动作核对完整生产／消费集合和绑定；S9 每个输入只有一个明确来源，步骤消费者与值的去向一致；事实问题回示范，映射问题由 S9 修 |
| 多个原消费者合法合并到同一步时，检查器用第一项变换代替其余项 | 改为按每个原 action 的 consumerBindings 核对，保留不同实际变换及前导零；不改变业务输入来迎合检查器 |
| 接续只核验 S7，却未核验直接前次 S9 的失败输入／原输出／检查证据 | 新记录绑定 check.json；接续先核验前次调用证据再生产。历史被改或丢失则停止；已耗预算仍记入拒绝记录 |

字段和适用边界唯一维护在[共享合同](../frameworks/agent-to-recipe-skill-contract.md#s7--s9-的输入充分性增量2026-09-20)；方法在原 S7／S9 Skill；评测证据与兼容限制在[原验证计划](../../workflows/agent-to-recipe/design/validation-plan.md#输入充分性与失败接续切片2026-09-20)。没有复制原始聊天或把全量 Trace 改名塞给 S9。

### 可理解且实际执行的交接实例

**正常接受。** 上游合成编号是 digit-string `0040`，不是数字 40。第一条合成输入记录消费 `['0','0','4','0']`，第二条消费完整字符串 `0040`，两条动作合法合并为一个必要步骤。独立进程探针实际生成 S7 后，S9 从该输出生成三个业务步骤：读取编号 → 合并的消费步骤 → 读取最终状态。`dataDependencies` 同时保留 characters 与 identity，终点 `statusText` 仍交 final output。旧检查器误拒绝此例，修复后正常接受。

**定向修复。** 评测方对 S9 探针输出注入冲突：同一 ticketCode 同时有 runtime 与 Expected 来源。检查器拒绝并返回 `procedure-synthesize / business-1.inputSources`。保留失败原文，恢复正确生产逻辑，在新目录消费固定 resume-request；重新核验同版 S7 后只调用 S9。累计探针调用从 2 变 3，预算仍为 4、单次超时 5000 ms；没有重跑 S7，更没有真实界面动作。

**定向补证。** 原有“只提供 API 文档、缺实际选择记录”的失败例也重新执行：先返回协调者补交，原资料责任为 task-demonstrate；补交固定 selection-r2 后仅重做 S9，累计调用同为 2 → 3。另有接续反例分别改变旧 S9 input.json、output.raw、check.json，均在新调用前拒绝；拒绝记录仍保留已耗 2 次调用。

这些都是合成来源的输入消费探针和评测方故障注入，不是模型实际推理、历史桌面事实或真实 API 执行。synthetic.read/input 不是宣称存在的 OpenDesk API。

本次实例：

- 正常多消费者合并：`.runtime/tests/agent-to-recipe/input-sufficiency/case-b6es7I/merged-consumers`。
- 失败／修复：`.runtime/tests/agent-to-recipe/input-sufficiency/case-YirLL3/conflicting-input-source` → 同一 case 下 `repaired-conflicting-input-source`。
- 选择记录补证：`.runtime/tests/agent-to-recipe/input-sufficiency/case-6q3jWa/missing-selection` → 同一 case 下 `after-supplement`。

| 固定对象（失败／修复实例） | SHA-256 |
| --- | --- |
| 同版 S7 输入 | `00326e08f1ef502bba2996c098d66f9a7ba4bdd626633f0ed50977f70be4926d` |
| 原 S7 输出 | `562f8ca492a52ee921c7388557e03c3d9b070e86da1e98d5a2ffefbd10515520` |
| 失败 S9 原文 | `cfd159eb511b4474560912c4ee206cfb132c60130b6b5cdb79940847ad539dc1` |
| 失败检查 | `68a75e80ea4ac84a7a576b8263756903e719dc0dcb8ccda2700bf3e7e02fa0f1` |
| 修复后 S9 输出 | `f146c35622b067a3bb23849b0180b83fe94515daed8bc5f0c9c28fbe6deb905c` |
| S7 方法 | `0b3bcb1a0c31bf86387024d85bbf6dbe7c9b5d8052bdebadd354486d0bb1ef05` |
| S9 方法 | `b459cddeeb94135fc49e3824d04fecfdcf3fef6891ffeae6c9e2d6f0a8893c2d` |
| 共享合同 | `6dae8ffeb385d39bb407fff639d326dc2204aa0305e02b5ed129d3ff9952733c` |

修复后复用的 S7 输出 hash 与原值相同；失败 S9 原文未覆盖。方法与共享合同按本次实际输入包记录，不用旧方法的资格标签替代。

### 实际执行与分层结论

读取基线 `ab4775c77c26f98c567b04912f8d36c6f118864d`，树 `ff2354e631e36b2794cfca7001a0f02e88cda41a`。源码来自同一提交的 CI run `35523208362`、artifact `10608952991`，下载包 SHA-256 `f8c5881bb7eda8f399b849b2ea2df3415ecce2b01c70d1289236ee570c71d6ea`，包内 source-head 与目标一致。快照只用于离线验证，不作为仓库交付替代物；本次无法观察用户 Mac 未提交文件。

本地执行环境 Linux 6.18.44 x86_64、Node v22.16.0。原生产命令与业务 Runtime 未执行；以下 Node 命令是仓库既有离线开发测试工具，不是把 OpenDesk 普通 JS 改为 Node 应用：

```bash
node --test tests/workflows/handoff-integrity.test.js tests/workflows/artifact-*.test.js
```

| 层级／本次运行 | 实际结果与边界 |
| --- | --- |
| 原实现、原测试重新执行 | 183 PASS / 0 FAIL |
| 原实现＋11 项针对性补充（输入充分性单文件） | 24 PASS / 11 FAIL；包含合法合并被误拒，不全是错误输入。原失败保留 |
| 首次修复（同一单文件） | 35 PASS / 0 FAIL |
| 加入拒绝记录预算断言（同一 35 项） | 32 PASS / 3 FAIL；发现历史完整性拒绝时已耗预算尚未复制，失败保留 |
| 修正预算记录顺序，全部离线回归 | **194 PASS / 0 FAIL / 0 skipped**；原 183 项＋11 项，不作为成功率 |
| 最终合同／方法同步后全部复跑 | **194 PASS / 0 FAIL / 0 skipped**；与本页实例方法 hash 一致 |
| 三个修改 JS 的 node --check、五个方法 frontmatter | PASS；方法文件仍为 5 个，不证明宿主加载 |
| 输入供给与探针执行 | 两阶段各用新 Node 进程、stdin 包和文件读取许可；越界读取实际被拒绝；不是完整 OS／网络沙箱 |
| 实际模型 Producer、未见样本、独立语义 Oracle | **NOT-RUN，模型调用 0**；本次未取得获准独立模型宿主，未用同一上下文换角色冒充盲测 |
| Runtime、真实桌面、同一候选 Fresh Run、完整业务资格 | **NOT-RUN，桌面操作 0**；没有新 Candidate／Qualification |

正常接受、缺证据、错版本、错误数据关系、终点遗漏、合法合并、可选材料省略、检查范围不足、未知副作用和修复重消费均保留原判据；没有降低原 Calculator 断言或扩大其通过范围。已有有效源资料／候选优先复用。

原始日志保留在 `.runtime/tests/agent-to-recipe/continuation-audit/`：baseline.tap、red.tap、first-fix.tap、budget-red.tap、all-fix.tap、final.tap、static-audit.json；每个实例还有输入、原返回、检查、方法快照、恢复请求和 host-call 命令／版本／退出信息。运行产物不进入源码版本控制。远端 CI 的结果必须另按包含本次修改的具体提交核对，本地通过不等于 CI 已通过。

### 接续材料、限制与下一最小动作

新会话从 WORKFLOW 进入本页和固定实例，读取当前 nextRequest、原评测报告、resume-request、固定来源／方法和已耗预算即可继续；无需完整历史聊天。只做对应责任方的最小补证或修复，再创建新输出目录重检并消费。缺少必要固定文件、方法变化或预算耗尽时停止，不重放未知副作用。

当前只核验直接前次记录所列调用的输入／留存原输出／绑定检查结果，以及当前 S7；旧记录没有 check 绑定会明确记录 legacy 限制。它不认证全部祖先、并行分支预算或来源真实性。text／digit-string、单 Profile、identity／characters、跨步前向关系之外，尤其生产者与消费者同一业务步骤的内部时序、一般分支／循环／恢复和自然语言正确性，仍需专业审阅，不称输入本身非法。

下一责任是**获准独立评测宿主及语义验收负责人**：固定真实但低风险的最小输入、预定验收要求和材料外发／工具／费用预算，运行真正隔离的 S7，再由 S9 仅凭交付包生产或准确拒绝；沿用当前来源与失败接续方式。未具备该条件时只准备包，明确 not-run。真实候选仍由 S12 绑定同一字节、环境和范围独立验收。本次不授予工作流整体完成、模型稳定性分数或业务资格。
