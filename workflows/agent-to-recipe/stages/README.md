# Agent-to-Recipe 十二阶段卡

返回[通用工作流](../WORKFLOW.md)。本页展开原 S1—S12，不新增阶段、Skill 或 Runtime。各阶段按[共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)读 request、写成果与 handoff；公共字段不在此复制。

每张卡都可以单独派发。局部通过只覆盖本次 requiredOutputs／gate.scope。S3—S5 的节点记录不等于完整 dossier；S7／S8 的草案不等于已经通过 S9 的 SemanticProcedure。尝试失败也保存事实与明确失败交接。

## S1 合同与计划

责任：[automation-plan](../../../prompts/automation/agent-to-recipe/automation-plan/SKILL.md)。输入：用户任务、实际授权、预算、已有资产及证据来源。作业：先定义业务目标与成功证据，再按子目标和依赖形成粗计划；区分文档、基本测试、接续与完整新生成。

输出：`task-contract.json`、`work-plan.json` 及交接。通过：对象、标准、权限、范围与下一工作包可核对。失败：列出缺失决策，不开始副作用动作；上游目标变化返回本阶段修订计划。

## S2 最小应用认识

责任：[application-engineer](../../../prompts/automation/agent-to-recipe/application-engineer/SKILL.md)，discover。输入：冻结合同、下一步所需操作、已有 AppProfile。作业：只认识任务相关窗口、状态、区域、目标与验证信号，核对当前环境和定位来源。

输出：最小 `app-profile.json` 与证据，条目标明观察事实和适用范围。通过：足以安全完成下一步，未知项没有被伪造。失败：缺工具／权限则阻塞；需要改变目标或授权返回 S1。不研究整个软件。

## S3 真实操作

责任：[task-demonstrate](../../../prompts/automation/agent-to-recipe/task-demonstrate/SKILL.md)。输入：合同、计划、应用认识、获准业务值及桌面操作拥有权。作业：确认当次对象和前提，说明简短意图与定位依据，执行当前节点，不依赖历史坐标。

输出：节点动作、脱敏参数、before／after 引用、读到的实际关键值与来源。通过：动作和事实可追踪，只进入 S4 检验结果。失败：保存已发生或结果不明的副作用，转 S5 决定安全下一步。

## S4 观察与局部验证

责任：task-demonstrate。输入：S3 节点与冻结 criterion。作业：重新读取现场，对照期望和实际；区分动作无异常、界面出现结果和业务条件满足。

输出：节点验证、证据、实际值及 pass／fail／uncertain。通过：只证明已核验的本节点。失败：不能用预期值补观察；把矛盾和不足交 S5，必要时定向补采。

## S5 分类与安全决策

责任：task-demonstrate。输入：动作和验证。作业：区分正常业务、准备、探索、错误、重试和 recovery，检查预算、授权及重复副作用风险。

输出：节点分类、关联与下一安全决策。通过：继续 S3、转 S6、定向补强或停止的依据明确。失败／不确定：先核对副作用，不盲重放；未知应用条件返回 S2，目标权限变化返回 S1。

## S6 关闭完整示范

责任：task-demonstrate。输入：整次节点事实、关键数据和任务合同。作业：逐项验证任务级结果、对象身份与副作用，整理原始事实，不删去不利证据。

输出：完整 `dossier.json` 与 handoff；包括实际中间值、消费者、初始／最终状态、验证与来源。通过：完整成功示范才可供完整新生成正常消费。失败：交付完整失败／部分包供诊断，不能冒充成功示范；接续定向补采仅证明声明范围。

## S7 因果复盘

责任：[procedure-synthesize](../../../prompts/automation/agent-to-recipe/procedure-synthesize/SKILL.md)。输入：合同、应用资料与可消费的 dossier；接续则使用明确限定的来源。作业：说明哪些步骤为何必要、哪些是探索或错误；准备和读取数据不能因没有写入而被删除。

输出：保留／排除理由、证据关系、未决问题的分析切片。通过：解释有事实依据，保留原始记录。失败：具体缺证据返回 S3—S6，不通过计算正确答案补造数据来源。

## S8 业务分段

责任：procedure-synthesize。输入：S7 分析。作业：按可独立解释、验证的业务子目标形成 BusinessStep，标明输入输出、前后条件、验证、副作用和失败语义；区分确定执行、Agent 判断与人工确认。

输出：可读业务步骤草案、输入输出与依赖关系、伪代码及目标操作／helper 映射。每步使用稳定 businessStepId，说明读取来源、消费者、数据有效期及失败重入；未知 API 或定位来源列为缺口，不用裸坐标掩盖。通过：下一步可凭明确输出和必要新观察接续，不依赖旧聊天、旧焦点或隐含全局变量。失败：意图不清返回 S1／S7，事实不足定向补采。不按每个点击拆 Skill。默认任务、合法变参和解释示例分开；例子中的数值不作为本次观察。组合与判断边界参见[组合能力](../composition.md)。

## S9 参数化与数据依赖

责任：procedure-synthesize。输入：S8 草案与真实样本。作业：分离 Input、Config、Secret 引用、Invariant、Runtime Value 和 Transient Value；每个运行时值说明来源、消费者与有效条件。

输出：完整 `procedure.json`，包含步骤、参数、数据依赖、适用范围、未决项与证据；附同版本可读视图 `procedure.md`，供 S10／S11 审阅。通过：正常路径与关键数据可追踪；单次示范不支持的分支不能被编造。失败：回 S8 修改关系或定向补证；完整过程缺口不得直接进入正常生成。

### S9 到 S11：唯一过程与可读视图

`procedure.json` 是已确认过程的唯一主产物；可读视图不能成为可独立修改的第二份规格。视图注明源路径、实际版本、提炼时间、来源范围和原始 UTF-8 JSON 文件字节 SHA-256；不要解析排序或重新序列化后再计算该摘要。handoff.artifacts 分别记录 JSON 与视图自身的 hash，避免把视图自身 hash 写入视图。

JSON、视图或输入版本不一致即阻塞 S10／S11，返回 S9 修正后发布新 attempt。过程主张区分事实、解释、代码推断与待测规则；普通 JS 仍是业务执行源码，不增加解析器、编译器或可执行 IR。沿用共享合同对 reuse-unchanged 的有限例外，但不能用空 procedureRef 绕过用户要求的过程解释或最小修复依据。

## S10 定向工程化

责任：application-engineer，harden／repair。输入：已确认过程与实际定位、等待、验证缺口。作业：把业务目标变成可重复定位的规则与可验证操作，约束相对坐标适用性、超时、恢复和停止。

输出：新版本 AppProfile、必要普通 JS helper 及相应证据。无缺口时明确复用已核验版本，不为凑阶段新增代码。通过：被候选使用的操作有适用依据。失败：能力缺口按现有扩展框架定向报告，不顺手改 Core 或安装服务。

## S11 候选生成或登记

责任：[recipe-build](../../../prompts/automation/agent-to-recipe/recipe-build/SKILL.md)。输入：过程、所需应用规则、冻结合同与当前 API；原样接续按共享合同处理。作业：生成普通业务语义函数，保留真实取数与验证，或登记原样采用的已有脚本。

输出：实际 `.js` 候选与 `candidate.json`，固定 hash、入口、工作目录、依赖、输入合同、来源与局限。通过：仅为候选生成／静态门槛，不宣称 live 通过。失败：按问题返回 S7—S10；修改产生新版本，不覆盖旧资格结论。

混合候选使用现有 dependencies、inputContract、supportedScope、limitations 和 sourceMapping 明示判断位置与真实接入方式。没有实际宿主／provider 接入时，只能交付片段与交接合同并标未集成；不得声称混合业务已端到端可运行，不直接执行模型返回的任意代码。

## S12 独立验收与限定交付

责任：[recipe-qualify](../../../prompts/automation/agent-to-recipe/recipe-qualify/SKILL.md)。输入：冻结候选、合同、获准场景、当前环境与真实运行权限。作业：原样执行声明的普通命令，使用新执行与本次输入，独立核验业务结果、数据流、适用范围及必要负向案例。

输出：`qualification.json`、证据与 repairRequests；各场景如实为 pass／fail／not-run／blocked。通过：只绑定本候选和已验证范围；基本测试、接续资格、完整开发链及混合业务质量分别表述。失败：定向返回责任阶段，不能由验收者改代码或降低期望后宣布原候选通过。

混合任务分别验收 JS 片段、Agent 输出约束／拒绝、人工边界和端到端；mock 只能证明接线。按共享合同核对 requested、exercised、qualified、excluded；请求范围内 not-run／blocked 的项目不能移入 excluded 来取得 pass。逐阶段记录实际输入、产物、criterion、证据、gate.scope 和失败责任；平均分不能抵消关键安全或业务证明缺口。

交付后的漂移、维护与资产化沿用通用工作流和业务执行约定，不另造 S13。只读过阶段卡或写完文档，十二阶段仍不能标记为真实通过。
