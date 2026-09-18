# Agent-to-Recipe：阶段边界检查与审阅交付

## 结论与本轮范围

保留 S1—S12、G0—G7、原 task-decomposition 完整任务树和三个新增方法职责；修复阶段前缀无法独立检查、动作／输入版本约束缺失、报告扩大通过范围，以及设计入口状态冲突。
本轮交付的是**限定工件切片的确定性检查、对应方法接线和可读审阅 View**，不是完整 Workflow Engine、全部 Stage Validator 或模型 Producer 资格。

用户要求：重新审查仓库已提交材料而非相信文件自述；把关键环节、Skill、真实输入输出、判断条件与结果展示落到实现，并参考旧任务树。

- 初始源码核对：`962644b8011d8daae04ccee5d120078ec9818553`。
- 合入并行改动后的测试基线：`72bf2294fbe8dce94e427066289385eddd01d2d6`。保留此基线新增的 Business Step 详细字段、capabilityDecisions 检查及 legacy 兼容说明，不改写其他会话的 API 方案。
- 评审及修复由本次同一 Agent 完成；不是多人专家会审、盲上下文评测或人工批准。
- 仓库文件经 GitHub 读取并在隔离目录物化，相关基线文件的 Git blob SHA 与远端一致；测试环境为 Linux／Node.js v22.16.0，不是用户 Mac 工作区，不含其未推送修改。

## 旧文件的保留价值

`workflows/agent-to-recipe/design/task-decomposition.md` 继续拥有完整任务分解、五个成果层次、Execution／Learning／Reliability 三个循环、失败返回及 R 编号历史对照。
它用于反查遗漏，而不是证明实现通过，也不要求每个叶节点新建 Skill 或 JSON。本轮不重写该任务树；[交接审阅地图](../../workflows/agent-to-recipe/design/acceptance-map.md) 是它的交接投影，链接回原需求、链路、共享合同和验证计划。

## 发现、修复与证明范围

| 原问题 | 实际修复 | 检查依据及限制 |
| --- | --- | --- |
| S7 方法要求等 Procedure／Candidate／Qualification 齐全才检查 | 原检查器增加显式 `--through`；不读取未来工件，不自动缩小缺文件的默认范围 | S7／S9／S11 前缀 CLI 与函数测试；不是全部 Stage 接受条件 |
| `merge` 可声明动作却没有实际纳入步骤 | retain 和 merge 均需真实 sourceActionRefs 归属；禁止无来源正常步骤 | 缺失与合法 merge 正反例 |
| S7 忽略不存在的动作消费者 | A 编号消费者必须存在、在生产动作之后，并由正常路径步骤消费 | A999、恢复路径冒充正常生产者反例；仅支持既定 A/B 形状 |
| Dossier／DistilledSteps 的合同、计划未真正绑定 | 验证引用字节、工件种类、任务身份及单个固定计划修订一致性 | 错 revision、错任务、改后未更新 hash 反例；不支持多计划修订轨迹 |
| unresolved 可混入成功正常路径 | 明确拒绝未决提炼与未决动作 | 未知／部分输入保持停止，不创建补造事实 |
| 上游失败，下游局部规则仍显示 PASS | `localChecks` 保留诊断；`boundaries` 表达依赖阻塞；失败不输出成功证明清单 | 上游失败、未运行下游和空证明清单反例 |
| 资格范围声明可包含未测／排除项 | qualified 必须属于 exercised，且不与 excluded 重叠 | 范围外 qualified 反例；不证明真实运行或授权 |
| 只有 JSON／文件名，难以人工审阅 | `--format markdown` 从同次检查的实际输入与结果生成内容投影，显示版本、数据链、失败责任与未证明内容 | CLI、内容绑定、转义、截断测试；不是可编辑真相或完整任务门户 |
| 总纲关于 Skill 是否存在互相矛盾 | 修正已存在方法与未验证宿主／模型／业务状态 | 三个方法 frontmatter 解析；不代表宿主安装或行为通过 |
| 优化后缺明确结论 | code-rebuild 明确对象、改动去向、风险、依据、评分范围、保留／修订结论与下一责任 | 本轮是方法合同改进，尚未测评分一致性或模型评审准确率 |

## 实际执行的离线验证

从物化仓库根目录运行 `node --test tests/workflows/artifact-chain.test.js`：

| 对象 | 结果 | 含义 |
| --- | --- | --- |
| 最新基线检查器＋最新基线测试 | 37/37 PASS | 原有测试未暴露本轮全部缺口 |
| 最新基线检查器＋本轮完整测试 | 38 PASS、18 FAIL，总计 56 | 反例和新入口要求确实能够区分旧实现；其中有对原测试断言的加强 |
| 修复后检查器＋本轮完整测试 | 56/56 PASS，0 skipped | 新增 19 个用例并保留原测试；不等于执行 56 次真实 Agent／桌面任务 |
| 检查器与 stage-review.js | `node --check` PASS | JavaScript 语法检查 |
| 三个 SKILL.md | YAML frontmatter 解析及 name/description 非空检查 PASS | 文件格式检查，不是宿主安装或模型行为评测 |

测试没有执行候选 JS；只写隔离测试目录和 `.runtime/tests/workflows/` 内临时材料，未修改生产 Calculator、Runtime 或现场。
测试使用上游 Frozen Fixture，未把它转换为真实 Dossier。测试运行记录留在本次环境，不作为源码提交。

实际测试源码的 SHA-256：

| 对象 | SHA-256 |
| --- | --- |
| check-artifact-chain.js | `44acd93a097281bbc3aea7c7f139231d854ac263f86af9cf24367f3278e69767` |
| stage-review.js | `2066289a8d3023cde61537f505db7b2221a2b2c0e21c55e06e5bfdbd3014aa72` |
| artifact-chain.test.js | `cf5dc9280300b7549b472ce840e56b96ccbc5b0be5bb5c1bac379fb96f705f02` |

## 怎样查看和继续

先读[交接审阅地图](../../workflows/agent-to-recipe/design/acceptance-map.md)：节点显示阶段与 Skill，箭头显示交付物，矩阵显示输入内容／输出内容／拒绝条件／返工责任，Calculator fixture 展示同一个 firstResult 怎样穿过各层。

对于已有真实任务包，使用实际输入路径和明确授权根运行原检查器，按当前缺口选择 `--through trace-distill`、`procedure-synthesize`、`candidate` 或 `qualification`，通过 `--format markdown` 得到审阅 View。六文件默认命令保持检查到 qualification，不能用前缀 PASS 宣称整链通过。

新增工具没有评分、Gate 或发布决定权。`stageComplete=false`、`liveQualificationGranted=false` 是明确限制；正式交接仍需核对 request、适用 G0—G7、可信证据及 handoff。人工修改 PASS 文本不能替代下游重新检查。

## 尚未完成，不能借本轮 PASS 外推

- 模型 Producer 在未见轨迹上的实际提炼／语义／代码评审能力，独立上下文交接及宿主 Skill 发现／加载。
- 通用 S1／S2／S10 验证，复杂恢复与多计划版本，完整 schema、依赖闭包、真实授权和可信发布身份。
- 任意 JavaScript 可达性、别名、遮蔽、语义等价，以及证明观察确实发生的可信宿主记录。
- 用户本地任务包与历史 Calculator 的兼容性、新的 Fresh Run、视觉与人工验收、其他系统／应用。
- Mermaid 在用户文档站中的实际渲染；本轮只维护 Markdown 源与可运行的文本审阅输出。

因此本轮不宣称整体工程化完成，也不给没有相应行为证据的“专家 95+”总分。设计、确定性工具、模型方法和具体候选资格分别记录。
下一优先级是用隔离 Expected 的 Frozen Fixture 实际评测三个 Producer 的输出，再按真实任务包缺口做相邻集成与获准的本地验证；不重做无关已完成上游，不以补造历史来追求全绿。
