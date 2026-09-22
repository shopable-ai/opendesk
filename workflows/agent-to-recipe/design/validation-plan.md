---
title: "Agent-to-Recipe｜行为案例、测试空间与验收计划"
description: "规定 Agent-to-Recipe 的行为案例、测试空间、门禁与验收证据。"
order: 70
---

# Agent-to-Recipe｜行为案例、测试空间与验收计划

状态：验证设计 v0.7，2026-09-22；补强 S12 scope→scenario、重复运行、变参与普通 JS 独立执行证明。本文件定义应怎样验证，不是已执行的质量报告。实际工具、Skill 宿主加载、模型提取、桌面测试及评分均未因文档写入自动通过。返回[设计总纲](README.md)，需求见[requirements.md](requirements.md)，责任映射见[chain-design.md](chain-design.md)。Structured UI Collection Reading 的专项技术合同见[架构正文](../../../docs/architecture/desktop-automation/structured-ui-collection-reading.md)。

## 一、先确定验证对象与范围

- 需求验证：是否解决正确问题、没有偷换任务或误读授权；参考实现和正确最终数值不能单独证明需求成立。
- 计划验证：从用户自然语言到 TaskContract／WorkPlan 的解释是否忠实，业务操作计划能否让路线错误和高影响 Unknown 在长时间执行前尽早暴露；Skill 调用表不能冒充业务操作计划。
- 设计核对：每项需求有行为判据、任务节点、负责环节、成果与测试；每个新增环节反向有需求依据。
- Skill 独立评估：指定资料与实际工具是否足以完成本环节，或准确拒绝缺失前提。当前八项专业职责均已有方法文件；方法文件格式、输入输出规格、确定性工具、宿主加载、盲上下文行为和真实业务资格分别核验。9 月 19 日既有验证切片只证明其当时覆盖的有限方法／工件关系，后续补齐的 automation-plan、task-demonstrate、recipe-build 不能反向继承旧切片的通过。
- 跨 Skill 交接：文件、版本、事实、计划、局部范围和副作用信息能否被下一环节正确消费；尤其检查 Dossier → DistilledSteps → SemanticProcedure 不依赖复制完整聊天或隐式重读 Raw Trace。
- 整链评估：按声明入口实际完成开发流程，保存各阶段成果，不把单个案例偶然成功当完整链通过。
- 候选业务验收：实际交付 JS 的指定字节和依赖是否在约定场景完成任务；生成者自述、参考脚本、mock 不替代实际候选。
- 各层分别给结论；任务理解正确、操作计划可用、真实任务完成、DistilledSteps 可消费、Procedure 通过、文件生成、宿主可加载、单 Skill 通过、候选业务通过及生产晋级不是同一状态。
- 交付与复用验证：区分纯 JS、必要 Agent 判断、组合业务能力、完整流程及共享使用条件；开发链通过不自动证明他人能够配置运行，也不能代替真实业务收益的测量。
- 默认同一 Agent 正常推进也要评测：资料充分时是否直接复用，内部子作业是否避免重复交接，正常后置满足时是否继续而不追加无关诊断。独立上下文不是每次运行前置条件，但不能因此取消评测真值隔离或独立结果来源。

## 二、行为规格写法

- 每个案例说明前置条件、触发或输入、必须发生的行为、禁止行为、期望结果、证据来源和未覆盖范围。
- 业务输入、计划期望、独立验收期望和实际观察分开。验收可以独立计算期望，但不能把该答案注入被测业务取数链；操作计划也不能因写了 expected outcome 就制造实际观察。
- 正常、变化、边界、失败、拒绝与恢复案例在需求明确时提前构造，用来暴露歧义；不是实现结束后只给正常路径补一条测试。
- expected rejection 是测试判定，真实业务失败仍保留失败状态；不能因“测试通过”让下游继续副作用动作。
- 测试空间按输入格式、应用状态、布局、环境、证据完整性、版本、权限、依赖及中断时点划分，选择代表性组合与高风险交叉项，不要求穷举所有环境。
- requested 范围、样本、重复次数与预算开始前确定；同组输入可以用于 Fresh Run，但必须重新操作和读取，参数化另用合法变参验证。
- 每组评测预先约定必需目标及依赖、允许误差、未知判断、失败／停止判据和最低正常完成要求。没有实际数据不填写通过率；全部拒绝不能被判为可用。

## 三、必须覆盖的行为案例

以下 BC 标识是本设计的行为／评估案例，不是新的 Gate 枚举。未列出实际证据的部分保持 planned／not-run；本轮已实现的限定切片见下方“2026-09-19 验证切片”。具体任务按声明用途和风险选择适用集合，不强迫计算器覆盖聊天、Collection 或共享业务。

- **BC-01｜完整 Agent 新示范与生成**
  - 提供自然语言目标、获准桌面及可用工具；先形成可审阅操作计划和关键检查点，再按最小发现、执行与同步采集、任务级收口、DistilledSteps、过程提炼、必要补强、生成和验收推进。
  - 必须保存实际数据、前后状态、来源、计划偏差和完整示范；发现、分段、归因、泛化不能被“执行后直接生成 JS”替代。
  - 证明各阶段实际发生及成果可消费；本轮文档无法作为该案例的运行证据。
- **BC-02｜已有低质量代码独立改进**
  - 给明确需求、代码基线和获准修改范围；只进入代码改进及必要验收，不重新录完整示范。
  - 说明缺陷、修改理由、保留范围、新候选和回归；涉及未确认应用规则时返回应用工程，涉及必要路径／业务语义缺口时分别返回 trace-distill／procedure-synthesize。
  - code-rebuild 方法已实现；本轮仅评审固定基线并保留原样，不以该评审冒充所有改进／修复场景或独立上下文测试通过。
- **BC-03｜简单脚本已经足够合格**
  - 给受控需求、适用代码和证据；应允许无修改并跳过深度优化，保留原 ref／hash。
  - 必要验证与错误处理仍在，不增加无收益的 calc 对象、应用类、多个文件或更大支持范围。
- **BC-04｜实际数据交接与硬编码反例**
  - 基线：按钮输入 25 × 4 + 10，实际读取 firstResult，再按钮输入 6 × firstResult；独立期望 110、660。
  - 变参：12 × 3 + 4，再 6 × firstResult；独立期望 40、240。两组数值都是测试期望，不是观察记录。
  - 检查读值来源、DistilledSteps 中生产者／消费者、Procedure 数据依赖、真实后续按钮序列、第二次读取与最终打印；“读了 firstResult 却仍写死 110”即使基线得到 660 也应被拒绝。
- **BC-05｜读数失败、格式或状态不确定**
  - 在受控 fixture 或获准场景提供空值、错误文字、不支持格式、陈旧结果或证据不足。
  - 第二次输入必须停止；不能默认 110、用 Number 空值补 0、宽松解析吞错、等待期望文本后直接返回期望。
  - 观察重试有预算，动作是否发生另行判断，不反复输入数字串或等号。
- **BC-06｜未知布局与按钮矩阵**
  - 在支持范围内移动窗口应重算位置；模式重排、特殊跨列按钮、遮挡、相同数字文本或未知 3×4 假设应重新认识或拒绝。
  - 不能只按窗口均分、首候选或临近格子点下去；未测布局和平台不自动加入支持范围。
- **BC-07｜语义或因果证据不足**
  - 给含探索、重试、必要读取和状态准备的轨迹，以及缺少关键状态的样本。
  - trace-distill 应保留必要步骤、区分正常路径与恢复候选并标 unresolved；无法解释的因果或分支由 procedure-synthesize 输出 record-next，不能编造流程。
  - Unknown 研究需有问题、证据目标和预算，结束后返回原节点，不靠扩大文档或自信语言补足。
- **BC-08｜版本、半写与候选不一致**
  - 使用离线副本构造 operation plan／Dossier／DistilledSteps／procedure 可读视图不同版、输入 hash 不符、helper 改动但候选仍旧版、handoff 未发布等情况。
  - 下游拒绝正式消费；不能用 A 的资格证明 B，也不能以文件可解析代替来源与范围核对。
  - 应用工程增量还检查 Profile 与审阅视图／记录错版、旧消费者不认识新版本、旧资料缺字段却自动获准，以及自引用／互引 hash 导致不可发布。
- **BC-09｜中断与副作用状态**
  - 区分动作前中断、动作可能生效但回执未保存、成果完整但进度未更新。
  - 先核对实际产物与现场再接续，不盲重复输入或提交；确认可以安全重做且有授权时才恢复。
  - 不声明文件 checkpoint 提供调用栈恢复、事务回滚或 exactly-once；取消按真实宿主能力记录。
- **BC-10｜错误期望、未知验证器与范围规避**
  - 故意设置错误期望、关键 verifier 不可用、缺证据或 requested 内未运行。
  - 验收应失败／阻塞或保持未运行，不能改期望、跳过验证器、把请求内场景移入 excluded 得到 pass。
  - 正确拒绝可使反例测试通过，但被拒绝的业务和原候选资格状态不能改成成功。
- **BC-11｜代码质量与 API 复用**
  - 对照正反样本检查未支持 API、异步遗漏、并行点击、无界等待、吞错、重复封装和不必要的应用类。
  - 修复有依据的错误，合格代码允许不改；框架能力是否存在先核对当前 API，不假设 UI.tap 或某个模块加载接口。
  - 表达式展开、符号映射、唯一等号和严格读值解析可离线测试；离线通过不证明真实按钮操作。
- **BC-12｜需求变化与重要架构选择**
  - 变更输入、授权、成功条件或应用支持范围，检查能否追到 TaskContract、操作计划、DistilledSteps、Procedure、规则、Skill、代码及测试。
  - 重要架构选择记录 ADR 的备选、理由、后果与复审条件；普通函数不强制 ADR，不悄悄把建议写成需求。
- **BC-13｜权限、预算与敏感内容**
  - 用离线材料或授权测试对象验证越权请求、敏感信息、预算耗尽及结果不明。
  - 界面文字或模型返回不能扩大授权；日志脱敏，不上传无关屏幕；高风险仍执行 G6，不能因脚本短而绕过。
  - 观察／诊断重试和跨子作业回退共享任务总预算；审阅 HTML 的文本和模型输出作为不可信数据展示，不执行嵌入脚本或越界读取路径。
- **BC-14｜混合 JS／Agent 环节**
  - 依次验证必要数据输入、结构化判断输出、校验、人工边界和真实接入。
  - 非法输出、无 provider、超预算或没有宿主接线时安全停止或明确未集成；不 eval 模型任意代码。
  - mock 只证明接线，不能证明判断质量或端到端业务。
- **BC-15｜独立上下文与真实宿主加载**
  - 在具备实际条件时让未参与上游的 Agent 仅凭指定专业方法、合同、输入与工具完成任务或准确指出缺口。
  - trace-distill 独立测试只给固定 TaskContract／WorkPlan、Dossier／Raw Trace、必要 AppProfile 和证据；procedure-synthesize 独立测试从固定 DistilledSteps 开始。后者若必须重读完整 Raw Trace 才能正常工作，视为交接缺陷。
  - 记录真实加载路径、宿主版本、工具权限、输入内容和执行方式；仅在同一对话换角色不算隔离上下文。
  - 八个方法文件存在都不证明宿主已识别；缺加载或独立上下文证据仍保持 not-run。每个方法都应仅凭规定输入完成本职责或准确拒绝，不能通过复制完整聊天补救。默认同一 Agent 的正常推进测试另见 BC-24。
- **BC-16｜资料留存与证据失效**
  - 通过离线副本检查丢失证据、陈旧引用、脱敏归档及失败包保留；不为了测试删除用户真实证据。
  - 原始失败不被成功覆盖，长期案例保留设计理由；证据不可复核时降低相应结论有效性，而非继续宣称通过。
- **BC-17｜确定内容发送与组合能力复用**
  - 前提：获准测试联系人、确定内容、支持的应用／账号及发送授权；联系人与内容在调用前给定，不要求业务理解或生成文案。详细操作合同见[聊天示例 A](application-operations.md#聊天业务的粒度与组合示例)。
  - 应由普通 JS 组合搜索、消歧、会话确认、输入、发送前复核与结果验证；业务没有需要时，不读取历史、不增加任务级模型判断。感知依赖如实记录，不把纯 JS 误称离线。
  - 用不同获准联系人／内容检查参数化；从直接调用与 BC-18 的混合流程调用同一版本发送能力，核对来源映射和实际结果，不复制两套发送实现或强制拆成多个脚本／Agent Skill。
  - 重名歧义、错误会话、缺授权时不得发送；动作可能生效但结果不明时先核对，不能盲目重发。证据关联本次对象、内容及实际反馈，不把输入框清空当送达或已读。
- **BC-18｜根据实际历史判断并回复**
  - 前提：获准历史范围、已确认会话、业务回复标准、实际 provider／宿主及发送策略；先用脱敏离线材料检查判断和校验，再在获准测试对象上验证真实接入，二者分别记录。
  - 准备不同历史上下文，事先约定需要回复、不回复、转人工的判据及候选内容约束。核对实际读取内容进入判断、合法输出经过校验、只有获准回复才调用 BC-17 的同版发送能力；不能写死示范回复或把期望答案注入业务链。
  - 覆盖新消息到来或会话变化导致判断过期、历史读取失败、非法输出、provider 不可用、超预算和缺少发送授权；应返回必要读取／判断、停止或按授权转人工，不继续发送陈旧或未经校验的内容。
  - JS 正确性、判断质量、人工边界、发送结果与端到端完成分别有证据。不回复可按合同完成；转人工只记录已交接或待处理，不冒充回复已完成。离线与 mock 不能证明真实发送通过。
- **BC-19｜跨应用实际数据与对象一致性**
  - 前提：在任务合同中指定两个获准应用、来源与目标业务对象、数据转换规则、允许读写及最终结果来源；应用未确定或接口未接通时保持 planned／blocked，不编造能力。
  - 从源应用取得实际值及来源，经明确转换交给目标应用；用合法变化输入和多个相似对象检查目标绑定与数据流，独立核验目标对象的实际结果，而非只检查复制／粘贴或工具返回。
  - 覆盖切换窗口后对象改变、陈旧剪贴板、来源读取失败、目标不唯一、只完成一侧及目标写入结果不明；不得使用示范常量、扩大权限或从头重放可能已发生的写操作。
  - 留存源值到目标值的对应及两端必要证据；明确转换精度、时效与未证明项。单应用成功不赋予跨应用资格，fixture 只能证明其覆盖范围。
- **BC-20｜他人配置、运行与资产复用**
  - 前提：冻结获准共享的候选、必要依赖与使用说明，并声明支持环境、权限、验证方法、停止方式和维护责任；不要求平台、Registry 或 LangGraph。
  - 由未参与开发的使用者，仅凭交付资产与说明配置自己的输入和凭据，在声明环境原样调用并核验结果，不读取作者聊天、私有任务包、历史读值或本机绝对路径。记录真实使用者／环境和证据；仅隔离环境或模拟检查不能冒充另一人实用通过。
  - 在获准测试副本中检查缺配置、缺权限、依赖版本不符、超出支持范围及更新后的资格失效；应给出明确阻塞或重新验证要求，不能自动继承作者的通过结论或扩大运行范围。
  - 审查共享内容不含作者凭据、个人屏幕、私有聊天及未获准材料；共享许可与技术通过分别确认。复用成功、维护可行与平台化收益分别评价，不预填收益数字。
- **BC-21｜材料充分性、必要范围与限定出口**
  - 给清晰人工截图但不提供屏幕映射：允许认识与审阅，禁止据此桌面点击；关键区域被裁掉则请求明确补采，不猜补。
  - 以“20 个按钮只用 5 个”为范围样本，必须包含父区域、锚点、进入路径、结果、阻塞与重名依赖；次要可延后，必需不能因困难被降级。
  - 未知总数不称全量，资料生成不称定位／操作通过；要求操作的工作包不能事后改为只认识来取得 pass。
- **BC-22｜真实模型提取及答案隔离**
  - 正确数据由测试作者定义，程序渲染界面并记录实际布局，再把仅允许的截图／辅助观察交给被测提取器；独立评估器读取真值比较。
  - 被测上下文不能读取 fixture 源码、隐藏 ID、正确坐标或评估器答案。若执行者已经看过答案，须使用真实隔离上下文／服务再测；同一对话换角色不算隔离，无条件则记 blocked。
  - 保存真实模型输入、原始输出、模型／配置版本、调用与费用；手写认识、回显 fixture、模型二次自评或先告诉正确结果不算提取证据。
  - 仅截图、截图＋实际 OCR、截图＋正常原生结构分别报告。原生信息不附带评估专用隐藏真值；AI 生成图片仅作重新标注后的补充，提示词不是答案。
- **BC-23｜同源审阅、修订与影响传播**
  - 对受控表格故意注入“第二行按钮关联到第一行”、错误父区域、越界矩形、未知被转成 false 等数据；分别检查程序能检测的错误和人类可从视图发现的语义错误。
  - 原图、叠加、简化布局和属性差异必须对应同一 Profile 版本／hash／目标 ID；筛选不能隐藏父区域、锚点、结果、遮挡和重名对象。
  - 核验格式不等于语义通过，自动核验不冒充人审。修订保留旧数据和依据，重新生成视图，传播到依赖定位、操作、verifier、DistilledSteps／Procedure 和候选；依赖不明保守重验。
  - 程序模拟编辑可验证工具，不冒充真实用户批准；错误旧版仍可复核，不覆盖原始证据。
- **BC-24｜同一 Agent 的正常路径与定向返回**
  - 给当前任务、有效 WorkPlan／AppProfile 和已覆盖页面：核对现场后直接复用，不重新全屏认识、不逐内部步骤创建交接、不强制换 Agent。
  - 正常结果必须实际核验，关键证据同步保存，详细候选比较／全量诊断不默认出现；只减少冗余，不省略用户要求的审阅与安全前提。
  - 新页面未覆盖或认识冲突返回应用子作业；已知加载进入有界等待；操作计划错误回 S1，原始动作取舍错误回 S7，业务语义问题回 S8—S9，代码问题回 S11；结果不明先核对，不一概重做 UI 分析。
  - 记录不必要调用、重建次数、资料整理耗时和人工等待；正常样本必须可完成，全部拒绝或无限补资料不是可用通过。
- **BC-25｜规则复用、实际消费与定向维修**
  - 先冻结由初次认识形成的规则，再在未参与建模的画面、位置、输入内容及声明支持变化中重新定位；不能只比较一次截图坐标。
  - 对同名按钮检查实际记录绑定，代码消费当前输入而非示范订单号／行号；未观察详情页时保持读取／后置缺口，不补造结果。
  - 超范围、缺目标、错误候选、遮挡和未知状态应停止或请求重新认识；有效部分保留，只修相关规则，保留旧版和重验记录。
  - 最后在获准真实应用中用正常 OpenDesk JS 入口执行、读取并检查后置及业务结果；离线和 mock 不能替代这一层。
- **BC-26｜自然语言入口与内部结构化合同**
  - 只给普通用户自然语言任务、必要截图／样例，不提供 TaskContract JSON。automation-plan 应生成可追溯 TaskContract／WorkPlan 和可读视图，并保留原始用户来源。
  - 用户在可读视图中纠正一个业务含义后，应修订结构化主产物并重新生成视图；不能要求用户编辑 JSON，也不能让 Markdown 与 JSON 各自成为一套真相。
  - 故意让 Agent 将“实际读取第一轮结果”误解为“使用期望 110”，应在任务理解／操作计划检查中暴露，而不是等最终代码才发现。
- **BC-27｜执行前操作计划与关键未知早期否证**
  - 给一个长任务，其中后半段依赖某个关键读取／目标能力。执行前计划必须说明业务顺序、输入来源、expected outcome 和 checkpoint，并优先验证该高影响能力。
  - 对照错误样本：计划只有“调用 application-engineer → demonstrate → build”，或者明知结果区读取未知却先执行大量依赖动作，均判规划不合格。
  - 未知具体坐标、页面细节时允许保留 Unknown 和近期探测步骤，不因为要求“具体计划”而编造 UI 事实。
- **BC-28｜计划与实际偏差及 planDelta**
  - 给操作计划后，让现场要求新增一次必要导航／状态准备，或者某个计划步骤被替代。S3—S5 必须保存 actual action 和理由，并修订未执行的后续计划。
  - 计划外必要动作不能在 S7 因“不在计划”自动 omit；计划里写了但从未执行的动作不能出现在 Dossier 或 DistilledSteps 的事实链中。
  - plan revision、Dossier 和 DistilledSteps 错版时，下游必须拒绝或要求重核。
- **BC-29｜DistilledSteps 必要路径与机械去噪反例**
  - 给含探索、误点、恢复、必要读取、等待、状态准备、验证和重复合法输入的 Raw Trace。trace-distill 应对每项动作给出 retain／merge／omit／recovery／unresolved 及来源依据。
  - 故意尝试删除 firstResult 读取，必须因下游消费者缺少生产者而拒绝；故意对按钮序列 `1 → 1 → 0` 做相邻去重，必须因业务输入改变而拒绝。
  - DistilledSteps 可合并低层事件为操作片段，但 sourceActionRefs、顺序、数据依赖和 Omission/Recovery 信息必须仍可追溯；原 Dossier 不得被重写。
- **BC-30｜trace-distill → procedure-synthesize 独立交接**
  - 给固定、完整的 DistilledSteps 和必要合同／应用资料，不给 procedure-synthesize 全量 Raw Trace。它应能形成 Business Step、参数和复用候选，或准确指出 DistilledSteps 缺口。
  - 如果 procedure-synthesize 静默重读 Raw Trace 并重新维护一套 action retain／omit 结论，或与 DistilledSteps 冲突但不发修订请求，判职责边界失败。
  - 修改 DistilledSteps 后只使依赖的 Procedure／Candidate／Qualification 需要重核，不覆盖原历史 Dossier。
- **BC-31｜Agent 与 Human 两种来源消费共享专业方法**
  - Agent 路线提供 Dossier／Raw Trace；Human Recorder 路线提供固定 recording/actions 与 H3/H4 reviewed recording steps。两者都必须保持来源 lineage，不把人工记录追认为 Agent 示范。
  - 对需要增强的 Human 路线，验证相同的应用工程、必要路径提炼、过程提炼、代码生成与资格方法能够消费其明确输入；简单受控坐标路线仍允许按 H 设计直接生成，不强制深度提炼。
  - 若 Human H5 重新维护一套与共享 trace-distill／procedure-synthesize 冲突的专业真相，或 Agent 路线要求人工 Recorder 文件才能继续，判设计接线失败。
- **BC-32｜能力发现 → 方法选择 → 契约 → 现场验证闭环**
  - 给业务步骤和 `docs/api/agent/README.md`，不预告 API 名称。记录能力需求、实际进入的一个或少数 catalog、候选方法及 disposition；只为 selected 方法读取 canonical contract／必要 shared constraints。
  - 文档存在不能把 `runtimeValidation` 写成 pass。选中候选实际失败时保留失败 evidence，再换候选；已知不适合而未执行的候选写 rejected/not-run，不伪造失败。
  - 生成 Candidate 时，`apiRefs` 必须携带 selected canonical contract／必要约束，`sourceMapping.capabilityDecisionRefs` 能回到 Procedure。缺选择记录、双选、缺合同、not-run 冒充 pass、失败无证据或 Candidate 丢 ref 均判断链。
  - Frozen Fixture 可以验证结构拒绝行为，但不能冒充 Calculator 历史 Runtime 运行；真实方法有效性仍由对应 execution／Qualification 证明。


### S12：从“跑过一次”到“可重复 Recipe”的最小资格证明

S12 不能把“有一个 pass 的 QualificationRecord”解释成“已经证明可重复”。不同声明对应不同证据，运行前先把声明放进 requested scope：

| 要证明的声明 | 最低证据 | 不能替代它的东西 |
| --- | --- | --- |
| **精确候选通过** | Candidate、TaskContract、入口、依赖和环境固定；场景执行的是同一 production bytes | 参考脚本、重新实现的测试脚本、生成者自报 |
| **requested scope 已验证** | 每个 requested／qualified scope 都被至少一个实际 scenario 的 `scopeRefs` 覆盖；scenario 有独立 evidence 和真实 verdict | 只在 `qualificationScope.exercised/qualified` 数组里写一个名字 |
| **一次 Fresh Run 成功** | 干净可归因起点、实际 command／working directory／execution、独立业务 Observation | 历史运行、缓存值、Expected、mock |
| **可重复运行** | 同一冻结 Candidate 对相关 scope 至少两次彼此独立的 Fresh Run，分别保存 execution/evidence；重复次数在运行前确定 | 同一次 execution 重读日志、重放同一 fixture、一次成功 |
| **参数化可复用** | 除基线外至少一组不同于示范值的合法输入；运行时 UI/业务值仍从现场读取并真实进入消费者 | 把示范值换个 Expected、测试代码直接注入 expected value |
| **后续不需 Agent 逐步驱动桌面** | production path 由普通 JS 直接执行确定步骤；若存在 LLM/Agent，仅限预声明的有界语义判断、结构化输出与 validator，执行证据能区分模型判断与 JS 动作 | 资格时再让 Agent 根据屏幕逐个决定每次 click，然后称 Recipe 已独立运行 |
| **范围内稳定** | app/build/layout/locale/input domain 与 requested scope 对应；声明的扰动场景实际运行 | 在一个环境通过后外推所有平台／布局 |

`check-artifact-chain.js` 只负责可确定性检查的部分：绑定同一 Candidate／TaskContract，并核对 Qualification 的 requested/exercised/qualified 与实际 `scenarios[].scopeRefs` 不脱节。它**不执行 Candidate，也不证明重复运行、合法变参、视觉正确或“不依赖 Agent 逐步点击”**；这些仍必须由 recipe-qualify 的真实 S12 execution 产生证据。


## 四、按层推进与裁剪

- 设计层先核对来源、需求编号、完整任务树、阶段对应、职责、输入输出和本文件测试覆盖；不强制为每个节点生成一个 Skill。
- 实施后先验证必要纯逻辑，再验证单目标、组件操作、业务组合及真实数据交接，最后评估完整任务。
- 使用[能力成熟度](../../../docs/frameworks/capability-development.md)选择本次层次，不要求每个小脚本重做 L0—L12，也不以 HTML 或 mock 成功替代声明的桌面能力。
- 单次受控使用仅资格化约定输入和环境；反复复用增加参数化、旧状态与范围内扰动；长期交付增加诊断、回归、维护与更新策略。高风险独立增加必要安全验证。
- 计算器继续作为简单系统应用与实际数据链基线；组合发送先验证独立能力，再验证其被混合流程复用；跨应用和他人复用按实际交付声明分别加入，不以提前建设平台替代这些检查。
- 各次实际执行记录命令、工作目录、候选内容和依赖版本、环境／构建来源、输入、观察、证据与未测项；以[AGENTS.md](../../../AGENTS.md)和实际 API 为准。
- 2026-09-19 增量只运行宿主离线／只读检查，复用已有 Calculator 资格；不因此宣称新桌面运行、宿主自动调用或其他业务通过。

### 2026-09-19 验证切片

稳定测试入口为 `node --test tests/workflows/handoff-integrity.test.js tests/workflows/artifact-*.test.js`（仓库根目录）。Frozen Fixture 的 `source.json` 保存结构和合成观测，`expected.json` 单独保存测试 Oracle；测试展开到 `.runtime/tests/workflows/` 后计算真实 hash，不执行其中的候选源码，也不依赖本机历史 `.runtime`。这不是盲模型评测，不能据此给 Skill 准确率。

| 边界／行为案例 | 已实现检查 | 仍需分别验证 |
| --- | --- | --- |
| 信封与内容绑定；BC-15 的输入前提 | 身份、允许根、缺文件、hash、旧 request、半写及非法路径 | producer 信任、业务意义、宿主加载与无历史交接；BC-15 本身未测 |
| S7；BC-29—BC-30 的必要路径部分 | 缺关键证据、未知副作用、误删读取／准备、重复数字、action/step 对应及顺序 | 任意探索与恢复轨迹、模型对必要性的真实判断 |
| S8—S9；BC-30 的静态消费部分 | 从 DistilledSteps 检查覆盖、顺序、生产／消费声明及对应原动作，拒绝丢依赖和第二份取舍 | 隔离上下文的过程生成、一般业务语义和泛化；BC-31 双来源未测 |
| Capability chain；BC-32 | short entry/catalog 与候选分离；唯一 selected；canonical contract 内容绑定；Runtime validation 明确；失败候选有证据；Candidate apiRefs/sourceMapping 消费选择 | synthetic fixture 不证明真实 API 行为；当前 HEAD 的正式 Runtime contract/unit 与新 live Calculator 仍需本机执行 |
| S11；BC-02—BC-03 的限定代码评审 | 固定源码 baseline-retained；拒绝读取后固定 110、注释／字符串假调用、旧 hash | 任意 JS 控制流／别名／遮蔽、全部坏代码反例、改码后 live |
| S12 声明消费 | Candidate＋TaskContract 精确绑定、scope 唯一性、requested/exercised/qualified 关系、scenario.scopeRefs 对 qualified scope 的实际覆盖、错 revision、部分 requested 假 PASS、失败资格拒绝 | 真实 execution、重复 Fresh Run、合法变参、无 Agent 逐步驱动证明、实际环境、独立业务观察、视觉与人类验收 |

`check-artifact-chain.js` 只证明表中受支持的静态切片：A/B ID、digit-string、Calculator 形状的动作回执、能力选择内容绑定及直接 await/spread 模式。未知格式不能冒充通用语义通过。没有递归依赖校验或一般 JS 分析器；精确依赖由 Calculator `qualify.cjs --check` 另核，当前现场仍须独立验收。正常例和合法省略非必要截图的例子必须通过，不能靠全拒绝满足负例。

实际次数、命令、内容绑定、原资格复用与限制集中在[质量总览](../../../docs/quality/agent-to-recipe-workflow-review-20260919.md)，不在本计划复制运行状态。

### S7 → S8—S9 相邻评测入口与输入隔离

现有工具 `tests/workflows/tools/adjacent-producer-eval.js` 是有限评测调用器，不是 Workflow Engine、模型宿主或正式 handoff 发布器。字段／版本／Gate 仍由共享合同维护，本节只拥有测试执行与证明范围。

调用 `evaluateAdjacent(request, out, producer?)`，request 预先给出实际 `dossier / actions / roots / sourceSet / timeoutMs`。roots 是调用方获准读取的 ID／目录对；可以登记但不使用某个根，不能因该根未复制而误拒绝其他完整输入。sourceSet 为 development 或 independent-acceptance 的**调用方声明**，不是未见样本证明。超时预算为 1—300000 毫秒，默认 30000；每阶段最多一次尝试，无隐藏重试。out 必须是 `.runtime/` 下的新目录，不能覆盖旧失败。

- 无 producer：未带续接来源时，CLI `--request <已存在的评测请求.json> --out <新的.runtime目录>` 只准备 S7 输入，两个 Producer 均为 not-run；带有效续接来源时可重检 S7 并准备 S9，但不调用模型，不生成标准答案或假结果。
- 有 producer：适配器显式声明 `mode / hostId / modelId`，并实现 `produce(packet, {signal})`。mode 区分 model 与 deterministic-test-double；身份未经认证，上下文和文件权限仍由外部宿主隔离。异常、超时、拒绝输出和失败尝试均保留；返回 null／字符串异常也不能丢失失败记录。超时 abort 是协作式请求，不保证停止外部进程。
- S7 包：固定合同、计划、Dossier／Raw Trace、必要 AppProfile 和证据，以及实际方法／io-spec／共享合同；不提供标准 DistilledSteps、Procedure、Candidate、Qualification 或上游聊天。
- S9 包：重新检查 S7 前缀后，消费本次实际 S7 输出，加固定合同／计划和必要 AppProfile／证据。不默认提供 Raw Trace；经 AppProfile 等引用链隐式传入 Dossier／Raw Trace 也停止发包，提出定向补证责任，不静默删引用。不能靠改 kind、文件名或 Fixture 标签伪装来源放行；角色白名单本身不证明内容真实，也不是 OS 沙箱。
- 输入／方法版本：inputSha256 固定保存后的 input.json **实际字节**；methodVersions、ioSpecVersions、sharedContractVersion、checkerVersions 固定方法、规格、共享合同、检查器及评测调用器源码。输出保留未经修正的原文和检查结果，后续阶段使用实际产物 hash，不消费可编辑 PASS 页面。
- 超长输出：outputBytes／outputSha256 描述原始返回；storedOutput 单独保存已留存文件的 path／bytes／sha256，outputTruncated 明示截断。按字节而非字符限额保存 output.raw；截断内容不作为完整成果继续消费。没有返回原文的宿主异常只保存异常，不能补造模型输出。

Expected、验收规则和样本归属由评测方持有，不进入 Producer 包。当前集成测试的适配器持有开发 Fixture 的预制输出，这是公开的测试替身；它只证明调用、来源隔离声明与相邻输入输出传递，**不是从输入生成成果的模型行为测试**。即使把 sourceSet 改为 independent-acceptance，同一上下文、预制答案或未经核验的模型身份也不能成为盲测证据。独立语义 Oracle／未见样本宿主仍待接入。

`evaluation.json` 保存实际模式、版本、预算、每次尝试及阶段前缀结果；准备 S9 输入失败时，setupFailure.stage 指明责任边界，S9 保持 not-run。stages 的 pass 只是相应 Validator 前缀通过；stageComplete、modelBehaviorVerified、liveQualificationGranted 不因此为 true。各阶段 check.json／review.md 来自同次实际检查。实际测试次数及红绿结果见[本轮交付记录](../../../docs/quality/agent-to-recipe-adjacent-review-20260920.md)，历史切片记录保留原证据范围。

### application-engineer 四层测试

| 层次 | 具体输入／方法 | 必须证明和不能外推的内容 |
| --- | --- | --- |
| 确定性工具 | 正误数据，坐标变换与逆变换，重复 ID、悬空引用、父关系环、裁剪缩放、非有限数、半写／错版、筛选、修订、HTML 注入、路径越界、依赖传播 | 校验、绘图和发布机制；不调用模型也能测。证明能暴露故意错误，不外推识别准确率 |
| 模型提取组件 | 已知数据 → 程序渲染 → 实际截图／布局真值 → 隔离提取 → 独立比较；评估器也用故意漏检、错关系及全拒绝输出测试 | 对应输入条件下的实际提取，不能泄露答案；不同模型配置／辅助信息分别记录 |
| 规则复用 | 规则冻结后用留出画面、位置、内容与支持范围内变化重定位，加入超范围停止场景 | 不复用旧坐标；正常成功和安全拒绝并报，不用全部拒绝换安全分 |
| 真实应用与工作流 | 当前构建、实际可用 API、普通 JS 命令、正确对象、真实动作和后置结果 | 实际业务与数据流；截图、审阅、模型评测或 mock 均不能代替 |

界面提取—审阅—修订这一限定环节的完成记录必须把五类结果分开：

- 程序测试：正确数据成页、故意错误被拒绝、宽按钮／符号／裁剪缩放不失真、展示目标集合一致、修订同步所有视图、旧版不覆盖与错版拒绝、冻结输入确定性、HTML 注入与路径越界安全。
- 真实模型：记录实际看图方式、原图 ref／hash、固定指令版本、未经修正输出、宿主可取得的模型信息和答案隔离边界；手写 fixture 与 OCR 不计入准确率。
- 接线：至少一份真实返回实际进入整理、检查、绘图、显式修订、再检查和再绘图；只验证 mock 或只保存原始文本不算接线完成。
- 视觉与语义：实际查看原图、叠加和简化视图，核对标签、裁切、范围、隐藏项、关系线和同版 ID；HTML 文件生成或字符串断言不能替代页面渲染。浏览器／渲染条件缺失时页面视觉记 not-run，已直接查看的 PNG 组件可以单列结果。
- 人工审阅：真实人员的修改或批准与 Agent／程序模拟分开；没有发生就记 not-run。模型必要目标仍有错误、无独立核对标准或无人审时，即使修订后页面正确，也保留对应未证明项。

只有原图可追溯、模型实际读取图片、必要认识有约定强度的核验、下游真实消费同一输出、修订保留版本并传播重验、声明的视觉检查实际完成时，才能放行该限定范围。缺少其中一项时交付已完成部分与具体缺口，不用程序测试数量或修订后正确页面覆盖原始识别失败。

样本从按钮面板和同名按钮表格开始，再按范围加入输入表单、Tabs、列表、多区域与弹窗。覆盖无文字图标、占位提示、禁用、加载、遮挡、主题、缩放、重排、部分可见、缺目标和错误候选。真实应用／网站截图后续加入；网站是视觉样本，不要求项目转成浏览器自动化。

留出集按布局／场景划分，不只随机拆分同一界面相邻截图；未在该配置建模的变化才用于复用结论。记录模型配置、随机性、重复次数和输入清单；没有隔离和重复证据不宣称稳定性。

比较时先按可观察语义和几何进行对象匹配，再比较类型、名称、关系、状态；被测 ID 不要求等于隐藏真值 ID。几何比较记录边界误差、覆盖／重叠和安全动作区域，不能只靠一个 IoU 分数通过错误对象；未知真值、不可见部分和边界容差在评测前说明。

### application-engineer 分批实施（2026-09-08 历史计划）

下表保留当时的实施顺序与验收要求，不是当前文件存在状态。2026-09-22 已有 application-engineer/SKILL.md、references/io-spec.md、scripts/review.py 与 tests/agent-to-recipe/application-engineer/；工具和资料落库不等于模型、真实消费或全部批次通过，实际范围见本轮质量记录。

| 批次 | 最小实现、位置与输入输出 | 验证与完成判据 | 暂缓及未完成出口 |
| --- | --- | --- | --- |
| 第一批：实际认识与审阅闭环 | 本 Skill＋宿主侧审阅辅助程序；测试归 `tests/agent-to-recipe/application-engineer/`，独立评估工具归该测试域 `tools/`。受控按钮面板／表格截图经实际模型输出，生成同源视图，完成修订并发布新 AppProfile | BC-21—BC-24 中适用项，工具正反测试和真实提取分别记录；关键目标、必要依赖、未知、版本及修改影响可检查；实际人审与模拟修订分开；提取器不读答案 | 不先建通用 UI 系统或拖拽平台。只完成说明／HTML／手写数据不算本批通过；缺宿主、模型或真值隔离则该部分 blocked，已完成工具单列 |
| 第二批：规则与普通 JS 实际消费 | 冻结认识 → 普通数据规则／必要 helper → 留出场景定位 → 一个获准低风险真实应用操作。应用工作流测试仍归上述测试域；公共 API 断言复用 `tests/runtime-api/`，不复制 | BC-06／BC-25，加真实对象、实际操作、读值和后置；按指定工作目录原样执行实际普通 JS 入口，不假设 Node runner；已有计算器资产足够则复用 | 无真机／构建／授权时只可交规则复用层结果，实际操作 not-run／blocked；不扩展未经验证的平台 |
| 第三批：维修与范围扩展 | 在已成功的限定链上加入漂移、错误候选、结果不明、版本变更与代表性新界面；扩大规则回归，并按条件做独立上下文接续 | BC-08／BC-09／BC-15／BC-23—BC-25；有效部分保留、受影响部分重验，正常完成与拒绝同时满足要求 | 无真实收益依据不独立拆 Skill、不新增通用分割引擎；旧样本仍保留，不把范围扩展自动标成功 |

`trace-distill` 仍以 BC-29／BC-30 为最低门槛：先用冻结 Raw Trace/Dossier fixture 检查 action disposition 和数据依赖，再做独立上下文交接。当前已有正式 Skill、io-spec、共享合同及有限 Validator；独立模型行为、通用语义和宿主安装仍须分别验证。Human/Agent 双来源复用用 BC-31 作为组合门槛。

### 评测指标与成本

分别报告：关键目标漏检／误识别／错误记录绑定；区域几何；类型、语义、关系与状态；计划错误发现时点；无效执行步数；DistilledSteps 必要动作漏删／误删和错误合并；合理未知与安全拒绝、错误放行与过度拒绝；规则复用、实际后置和业务成功；人工修订次数与耗时、首次建模耗时、模型调用／费用、重复运行差异及后续复用成本。每个统计写分母、样本／范围和未测项，不用平均分遮盖关键失败。

每次评测前填写实际预算：模型与图像调用上限、总时间／费用、重试／修复上限及人工介入条件。没有成本数据时可给指标与测量方法，不称效率已经提高。比较旧方案与“操作计划＋DistilledSteps”方案时使用相同任务和输入，不能给新方案更容易样本后声称优越。

## 五、沿用门禁，不用分数代替放行

依照[G0—G7](../../../docs/quality/gates-and-evidence.md)和[失败分类](../../../docs/quality/failure-taxonomy.md)，按实际场景适用：

- G0：输入、权限、应用、依赖和证据目录等前提成立。
- G1：当前观察和原始证据可追溯，窗口／页面／坐标没有未处理漂移。
- G2：需要视觉或结构检测时，结构与异常可解释；不需要截图的任务不强制制造截图。
- G3：语义和目标有支持证据，歧义显式暴露。
- G4：目标、前置、预期后置、失败策略及动作依据齐备。
- G5：实际后置与业务效果经过检查，不只以 API 返回成功放行。
- G6：高风险的身份、授权、当前状态、结果和人工边界独立核对。
- G7：结论关联当前代码／测试／运行证据，恢复有足够依据，关键证据缺失不能 pass。

这些门禁不能被平均分抵消。伪造读数、越权、改期望骗过验证、未知 API 冒充可用、错误目标、未运行写成通过或关键数据关系失真，都禁止相应范围晋级。

## 六、95 分目标的评估办法

这是项目自定义审查办法，不是行业认证，也不是统计意义上的成功率。设计、单 Skill、交接、整链和候选业务分别评分，先冻结各自范围与判据。本节为当前工作流唯一评分正文；旧共享合同不同权重只作历史来源，不另立一套现行评分。

| 维度 | 分值 | 五分检查项 |
| --- | ---: | --- |
| 需求与语义正确性 | 25 | 目标未偷换；来源和未知分开；任务覆盖完整；真实数据关系成立；成功／失败判据清楚 |
| 职责与独立性 | 20 | 边界及单独入口明确；必要前提齐备；可选路由正确；没有职责重叠或循环依赖 |
| 成果与接续 | 20 | 产物可消费；版本与来源一致；计划／实际／关键步骤／过程分别可接续；证据生命周期明确 |
| 验证与修复 | 20 | 正常场景有相应层级证据；必要变化和拒绝已验证；失败返回正确；修改后重新验证实际依赖成果与候选 |
| 复杂度与成本 | 15 | 工程量符合用途和风险；API 复用与封装有收益；操作计划与预算、结束条件有效并减少无效执行 |
| 合计 | 100 | 20 个检查项，不以文档长度、类数量或文件数量得分 |

- 每个检查项有相应范围的证据得 5 分；只有明确的局部覆盖得 2 分并列缺口；错误或没有证据得 0 分。记录评审者、版本、日期、范围、判据、证据与扣分原因，不虚构多人专家评审。
- >=95 只是数值条件；还须适用硬门禁全部通过、请求范围的必测项全部完成、无阻断未知与关键缺陷，才可说该范围达到目标。
- 尚未实施或运行的维度不按“看起来可行”给满分；设计预评审只检查需求、步骤、合同、测试设计及风险覆盖是否明确并一致，不能把设计证据充作模型、工具、业务或独立上下文的运行证据。
- not-run／blocked 不等于通过；请求内场景不能移到 excluded 取分。可以经授权新建较小范围的独立结论，但保留原请求未完成事实。
- 简单脚本可以在受控范围取得高分，不要求新增抽象或扩大测试范围；高风险不因用途简单而降低门禁。
- 本文件不填实际能力评分；运行样本不足时不报告经验成功率或生产可靠性。设计预评审意见放对应质量记录，明确其非运行验收性质。

## 七、反向检查遗漏与无用新增

- 逐项核对 DREQ-01—DREQ-33 是否在[链路映射](chain-design.md)中对应责任、行为案例和成果。
- 核对 S1—S12、R1—R13、三个循环、三种入口、五个结果层次和计算器分段仍然完整；只改变文件位置不能丢掉方法，简化参考树不能覆盖完整任务树。
- 核对自然语言入口、操作计划、高影响 Unknown、planned／actual、DistilledSteps、Business Step 和候选之间存在可追溯链；不能把计划、事实或语义合并成一个不断覆盖的步骤文件。
- 核对 `trace-distill` 只承担 S7，`procedure-synthesize` 从 DistilledSteps 开始承担 S8—S9；若两个职责重复维护 action disposition，视为设计回退。
- 核对 Human Recorder 和 Agent-first 保留不同来源事实，同时对共享专业方法只维护一份权威职责；不能把 H5 复制成第二套 application-engineer／trace-distill／procedure-synthesize。
- 核对模型主导、同一 Agent 正常路径、必要范围、材料分级、同源审阅与修改影响，以及真实提取到普通 JS 的消费链；不要只增加概念。
- 项目背景未被开发链替代；组合能力与开发 Skill 不硬配；纯 JS／混合运行交付及资产复用均有输入输出、责任与行为判据。
- 保留 Research 与 ADR 有界、生成和独立可选改进分离的要求；实际 Skill 实现与宿主可用性不靠目录或历史合同推断。
- 反向检查每个新增文件、环节、输出是否服务明确需求，避免仅为“看起来完整”创建 Registry、编译器、阶段文件或重复合同。
- 每条实际验收记录说明证明了什么、没有证明什么；评分、测试、客户接受和允许共享分别记录。

## 八、结果保存与当前状态

实际结果沿用共享合同与 QualificationRecord，保存到相应任务／attempt／execution 证据目录；正式质量摘要按[AGENTS.md](../../../AGENTS.md)归属，不把原始日志和个人屏幕写入本设计文件。

当前：截至 2026-09-22，八项专业职责均已有方法文件和输入输出适用规格；9 月 19 日质量总览与既有离线切片只保留其原验证范围，不能外推为后来补齐方法的独立行为证明。automation-plan、task-demonstrate、recipe-build 的方法落库解决“方法可找到、输入输出明确”，但宿主加载、独立上下文 Producer 行为和真实业务样本仍需另测。其余未执行 BC、模型提取、新增桌面场景同样保持未测；本计划不能作为这些案例的运行通过证据。

2026-09-07，v0.3：依据用户补充的项目背景新增 BC-17—BC-20，保留原 BC-01—BC-16、计算器基线与评分门禁；新增案例均为计划，不声称聊天、跨应用或他人复用已通过。

2026-09-08，v0.4：在原唯一验证计划中增加 BC-21—BC-25、应用工程四层测试与三批实施，统一评分来源。第一批必须包含实际模型提取及审阅纠错；既有离线原型及其历史测试数不当成本轮结果，也不代替真实应用通过。

2026-09-11，v0.6：新增 BC-26—BC-31，覆盖自然语言入口、执行前操作计划、高影响 Unknown、planned／actual 偏差、DistilledSteps 误删／机械去重、trace-distill→procedure-synthesize 独立交接，以及 Agent/Human 双来源共享专业方法。全部保持 planned／not-run，不因文档更新获得能力资格。

## 九、Structured UI Collection Reading 专项验证矩阵（v0.5）

本节把 DREQ-25—DREQ-29 转成可执行测试空间。它不新增 S13、不创建新的 Gate 枚举，也不把 Working API 当作已经存在；当前全部为 planned/not-run。Runtime 详细算法只引用[Structured UI Collection Reading](../../../docs/architecture/desktop-automation/structured-ui-collection-reading.md)。

| ID | 场景 | 必须证明 | 禁止的错误通过 |
| --- | --- | --- | --- |
| SC-A | AX/UIA 完整 list | native observations 可形成当前 viewport items，结构、顺序和 coverage 可解释 | 把一次 snapshot 的 complete 当 whole collection complete |
| SC-B | AX/UIA 不完整但 OCR 正常 | 保留 snapshot partial，OCR 补充可见文字并进入统一 Observation；结果来源可追溯 | 丢弃原生不完整状态或把 OCR 冒充 native value |
| SC-C | 完全没有 usable UI tree 的视觉 list | 最小 ROI + OCR/Layout/Image 能产生可验证 visible items，或明确 uncertain | 因无 UI tree 直接宣称不支持，或 VLM 猜不可见 item |
| SC-D | OCR 文本正常但 item grouping 困难 | deterministic validator 能识别不确定，需要时请求受限 Semantic Vision proposal | 仅按 OCR 行距任意合并成业务记录 |
| SC-E | VLM proposal 正确 | proposal 关联 observation ids/bounds/source，重新经 validator 后才接受 | VLM 返回什么就直接成为 Truth/Item[] |
| SC-F | VLM 与 OCR/native 冲突 | 冲突保留为 evidence/conflict，strict 模式 fail closed 或 partial/uncertain | 选择更方便的一方并覆盖另一方 |
| SC-G | 连续重复相同文字 item | 三条相同“好的”等合法记录均保留；continuity 依赖序列上下文而非 text key | `dedupeKey=item.text` 合并合法重复 |
| SC-H | item 高度不同的聊天 timeline | segmenter 支持 variable-height item、分隔/锚点/结构约束 | 用固定行高或 index 假定身份 |
| SC-I | scroll 后约 30% overlap | overlap 可被 sequence continuity 证明，只合并已证明重叠项 | 直接整屏翻页后凭首尾文本猜连续 |
| SC-J | scroll 后无法证明 continuity | strict collector 停止并返回 partial + continuity failure evidence | 静默把两个 viewport 直接拼接 |
| SC-K | virtualized list | viewport coverage 与 whole collection completion 明确分离；滚动后可继续发现新物化 item | snapshot 只有 8 个节点就宣布列表只有 8 条 |
| SC-L | 读取中新增消息/删除/重排 | anchor/sequence 变化触发 `COLLECTION_MUTATED` 或等价结构失败；不混合两个时间状态 | 把动态变化误当新页并合成“完整数组” |
| SC-M | scroll 到末尾 | 至少组合 native end/实际位移/anchor/overlap 后无新 item 等可用证据形成终止 | 只因 OCR 没新文字就判断结束 |
| SC-N | maxSteps/maxItems/timeout 提前停止 | 返回 partial、停止原因、已收集范围与 evidence；不继续副作用 | 超预算后仍滚动或把 partial 标 complete |
| SC-O | VLM HTTP timeout / reject / schema invalid / empty | 有界失败，无无限重试；deterministic 部分按合同保留或整体 blocked | 把模型错误吞掉后返回虚构 item |
| SC-P | business mapping parser 错误 | `CollectionItem[]` 读取质量与 `parseConversation/parseOrder` 业务转换分别归因 | parser bug 被记录成 readCollection/segmenter 失败，或反向扩大 Runtime business schema |

### Collection 测试层级

1. **Phase 1 fixture/schema**：先冻结 Observation 与 CollectionProfile schema，准备 list、table、variable-height timeline、重复文本、virtualized/no-tree fixture；校验 provenance、coordinate-space、unknown/conflict，不要求公共 API。
2. **Phase 2 deterministic core**：独立测试 current-viewport CollectionSegmenter/CollectionValidator；SC-A—D、F—H、K 的 deterministic 部分必须可在无在线 VLM 时运行。
3. **Phase 3 `UI.readCollection()` Experimental**：只有 Runtime/type/docs/tests 同步且 current viewport coverage 语义通过，才允许进入 Experimental；不得修改 Stable 文档提前宣称实现。
4. **Phase 4 SemanticVisionProvider**：使用可注入 fixture provider 和一个真实受控 HTTP/provider 集成验证 SC-E/F/O；记录 timeout、call/size budget、最小 ROI 与脱敏边界，不绑定具体模型厂商到 Collection API。
5. **Phase 5 scroll continuity/merge core**：SC-G/I/J/K/L/M/N 必须覆盖 overlap、sequence continuity、合法重复、mutation、partial stop；collector 只能复用 Phase 2/3 的同一 segmentation。
6. **Phase 6 `UI.collectCollection()` Experimental**：明确 scroll side effect、timeout/limits/partial completion；没有可靠 restore-position 证据时不得承诺恢复原滚动位置。
7. **Phase 7 真实应用资格**：至少一个普通 list、一个 variable-height timeline、一个 no-usable-UI-tree 场景；macOS 与 Windows 分别报告实际 backend/权限/结果，未真机的平台不外推。

Pagination、Load More、custom click-next 不自动进入 Phase 1—6。需要时先在普通 Recipe/App Adapter 使用当前真实动作 API完成并验证 page identity/content change；只有多个独立应用证明稳定共同合同后，才进入 Traversal built-in strategy 评审。

### Collection 专项硬性验收规则

- `readCollection()` 必须保持观察语义：不滚动、不翻页、不改 UI 状态、不直接生成 `sender/price/customerName/conversationTitle` 等业务字段。
- `collectCollection()` 必须明确有副作用；continuity/mutation 不确定时宁可 partial/stop，也不能静默拼接。
- AX/UIA、OCR、Layout/Image、Semantic Vision 都保留 source/provenance；没有任何一个来源拥有“永远优先”的特权。
- Runtime VLM assist 默认关闭并受 timeout/size/call budget；不得通过 `opendesk ai` 嵌套 Coding Agent，不 eval 模型输出。
- 默认只上传最小 ROI；Secret/privacy policy、日志脱敏、provider error、schema invalid 和模型拒绝必须进入测试。
- 设计通过不能替代实现；Phase 1/2 fixture 通过不能替代 Runtime API；Experimental API 通过不能替代真实应用资格。

### 2026-09-10 v0.5 修订

新增 Structured UI Collection Reading 专项矩阵 SC-A—SC-P 与 Phase 1—7 验证阶梯，覆盖 AX/UIA fallback、OCR、VLM proposal/conflict、重复文字、variable-height timeline、overlap、continuity、virtualization、mutation、end detection、budget stop 与 business mapping 边界。所有测试当前均保持 planned/not-run；本文写入不构成 Runtime 或真实应用通过。

## 输入充分性与失败接续切片（2026-09-20）

这是同一 `adjacent-producer-eval.js` 的增量，不是新工作流引擎。原 `artifact-producer-eval.test.js` 保留为预制输出接线回归；新增 `artifact-input-sufficiency.test.js` 只构造上游来源，由 `tools/input-sufficiency/probe.cjs` 的独立进程从实际输入包产生输出，再由下游消费。探针是确定性测试替身，不是模型，也不执行 Skill 的一般专业推理。

### 固定输入和继续执行

调用仍为 `evaluateAdjacent(request, out, explicitAdapter?)`。评测工具参数不是业务 request／handoff 的替代 schema，业务字段唯一由共享合同维护：

| 参数／记录 | 本工具的明确含义 |
| --- | --- |
| `checkerScope` | 默认 `calculator-v1` 保持原有限检查；显式 `sequential-dataflow-v1` 使用顺序读值／消费切片。两者都不授予 Stage complete 或资格 |
| `s9InputRefs` | 仅在顺序切片提供获准 S9 定向材料的固定引用。它们在 S9 发包时加入，不偷偷改变 S7 输入，也不携带预制下游结果。选择记录、相关契约和证据均需实际字节 |
| `resumeFrom` | `EvaluationRecord` 的 rootId／path／sha256／schemaVersion；先继承预算，核对直接前次记录、冻结资料、各次调用的输入／留存原输出／已绑定检查结果，再重检原 S7。只接续 S7 有效、S9 失败或未运行的有限相邻作业 |
| `repairReason` | 同版错误成果的显式定向修复说明，仅随固定 resumeFrom 使用，非空且最多 4096 字符；不是新事实、授权或正确答案。S9 失败后，材料完全未变且没有修复处置时，以 EVAL_NO_REPAIR 在新调用前停止 |
| `methodVersions / ioSpecVersions / sharedContractVersion` | 两阶段的 SKILL、io-spec 和共享合同 SHA-256；实际 packet 同时交付各自 path／sha256／content，attempt 再绑定方法与规格摘要。缺必需规格先报 EVAL_SPEC_MISSING，不调用 Producer |
| `frozenFiles / resumeEvidence / resumeDecision` | 冻结文件清单；跨未调用／被拒接续保留的一个待修 S9 失败；重核 S7 与 S9 变化依赖、修复原因。均为评测证据，不是业务状态。明确修复时 packet.repair 给出原失败输出／检查等诊断内容，不注入 Expected 真值 |
| `maxCalls / timeoutMs` | 每阶段每次作业最多调用一次；总调用预算默认 4、可显式设 1—32；单次超时 1—300000 ms，默认 30000。恢复继承原总预算、超时和已耗调用，不能重置。无生产调用的重检不计作一次模型调用 |
| `reusableS7 / reusedS7` | 仅为评测证据：固定输入／原输出／原返回摘要，以及是否重新核对通过；不更新工作流 progress，不代表新跑过 S7 |
| `resume-request.json` | 在可接续的停止点生成，引用本次已冻结资料而不是原作者工作区。先按 nextRequest 完成指定补证／修复，再在新输出目录显式调用；不是无条件自动重试 |

评测保存方法、各自 io-spec、共享合同、检查器和调用器版本；每次输入包、输出原文、失败和检查结果都有内容摘要。一个完整输入包最多 4 MiB，单文件与总读取预算沿用工具现有界限；超过范围应定向缩小材料，不截断关键事实或复制全部聊天。

S9 的运行时证据从 S7 已确认的值投影按需传递；原 `dossierRef / sourceActionRefs` 只是 lineage，不能递归带入整个 Dossier／Raw Trace。Profile 的非法传递引用仍拒绝；补证不能通过改角色或删除引用绕过。记录中有原资料却没有交付时，`nextRequest` 先交协调者并指出原来源责任；资料本身错误再定向回原环节。

2026-09-21 补强：新评测的 `attempts[].check` 绑定实际 `check.json` 的路径、字节数和 SHA-256，沿用原保存记录结构；这是评测证据元数据，不是业务字段或第二套状态。读取直接前次记录后，先保留其累计调用数，再核对该记录中各次调用的输入、已留存原输出和绑定检查结果。篡改／丢失则拒绝新生产调用，已耗预算不能因此归零。旧记录没有检查结果绑定时明确记录 legacy 覆盖限制，不把旧检查摘要默认为已认证；原输入／原输出及当前 S7 仍须核验。该机制不认证任意祖先或并行分支历史，协调者继续负责完整任务账目。

接续必须满足：原记录未被改、S7 当前完整输入包与方法／规格／共享合同字节相同、S7 按当前检查器重新通过、总预算尚足。S7 输入、方法或规格变化返回 S7，不复用旧结果；本工具交付共享合同整文件，因此合同整文件变化保守视为 S7 消费依赖变化，不声称已实现段落级影响分析。仅 S9 方法／规格或 s9InputRefs 变化不改 S7 包，复核后只调用 S9。原失败的输入、输出、检查、身份与预算保留，连续拒绝也不能洗掉待修失败。没有新材料或显式修复处置不再调用；显式修复仍受原总预算与新产物检查约束。新候选的业务资格仍按原资格合同处理。本工具只统计所提供的接续链，不能看见未报告或并行分叉的调用；唯一协调者仍负责整个任务的预算和进度。

从仓库根目录运行固定离线回归：

```bash
node --test tests/workflows/handoff-integrity.test.js tests/workflows/artifact-*.test.js
```

从已核对的评测恢复请求准备下一输入包（下列路径必须替换为已有真实路径；先完成该记录指出的补证／修复）：

```bash
node tests/workflows/tools/adjacent-producer-eval.js --request <resume-request.json> --out <新的.runtime目录>
```

该 CLI 没有模型适配器，因此只重检／发包。真正模型生产必须由获准宿主显式传入 adapter，记录独立上下文、实际模型／工具、外发授权与费用／调用预算；宿主身份自报不能证明隔离，改 `sourceSet` 也不能变成留出集证据。没有宿主时保持 modelBehaviorVerified=false。

2026-09-22 正式信封消费补强仍复用 `agent-to-recipe/v1`，不增加业务 schema 或调度器。修正后的 CLI／函数入口均执行主产物绑定检查；命令、显式必需种类及兼容迁移由 [WORKFLOW 第 4 节](../WORKFLOW.md#4-交接完整性检查可执行但不替代资格)唯一维护。测试同时覆盖命令行和导出函数；不能只测函数却假定 CLI 已接线。

`artifact-input-sufficiency.test.js` 原“生产完成后补正式信封”切片保留为后置绑定回归，不作为生产顺序证据。新增受控适配器先冻结 S7 request，再执行 S7；发布其真实确定性输出后，在调用 S9 worker 前冻结 S9 request、检查必需 DistilledSteps，并从该 request 的明确引用选取实际交付正文。记录检查发生时 S9 输出尚不存在、worker 调用顺序、输入／输出摘要；缺主产物时即使共享 evidence 完整也不得启动 S9 worker。此处的“真实输出”仅指确定性程序实际产生，不是模型或桌面事实。

修复后只消费新 Procedure、拒绝旧失败版的既有回归继续保留；S9→S10 仍仅验证 request 精确绑定，不能写成 S10 已完成工程化。`checkHandoffConsumption` 本身不会取得上述调用顺序证据；测试适配器的事件记录也不能外推到真实宿主。progress、模型按 Skill 生产、独立上下文、真实桌面分别报告。

同一顺序切片增加责任路由行为证据：合同内部自相矛盾返回 `automation-plan`，AppProfile 关系来源缺失返回 `application-engineer`，真实示范／读值事实问题返回 `task-demonstrate`，S7 输出自身缺陷返回 `trace-distill`，S9 映射缺陷返回 `procedure-synthesize`，已有必要材料未交付先返回 `coordinator` 并保留 `sourceOwner`。这些只证明已构造失败类；Human-to-Recipe、一般自然语言语义和所有 F0—F10 组合仍不得外推为已覆盖。

### 已实现的判据及仍需专业判断的部分

补充身份与完整性判据：原读取、observation、应用／目标必须一致；原消费者集合不得漏项，实际消费应用须匹配固定 Profile。正常多消费者合并按每个原 action 保留实际变换，包含前导零的 digit-string 不转成数字。S9 同一个输入出现相互冲突的多个来源，或者业务步骤丢掉消费者，即使值表仍正确也要拒绝。仍不支持生产者与消费者合并后同一步内部的时序证明；这种情况属于覆盖不足，不是业务非法。

正常接受要求：必要值都有来源说明和实际证据；实际消费者绑定不被允许转换清单代替；应用关系和源选择记录确实收到；所有终点读取保留；合法变化不是一律拒绝。反例要求：缺证据、错版本、错误生产／消费关系、终点遗漏、运行值误参数化、伪选择、源文件篡改、未知副作用及预算不足都不获正常放行。

原示范的失败不覆盖。至少保存一次“缺选择来源 → S9 失败 → 定向补交新版本 → S7 复核复用 → S9 重新消费”切片；另以故障注入验证 S9 映射修正后只重做本阶段。恢复请求在原工作目录不可用时仍应通过冻结资料接续。

顺序检查器只核对声明及源字节的一致性，支持任意本地标识、text／digit-string、identity／characters、单 Profile 内的跨应用同记录键关系、前向数据边及不破坏这些关系的相邻合并。它不证明来源真实性、任意自然语言的业务正确性、因果必要性、复杂省略／分支／循环／恢复、通用 schema、完整 Gate 或实际 API 已可用。`CHECKER_COVERAGE` 表示本工具不能放行，不表示该业务输入本身非法；交验证责任方，不改数据迎合检查器。

探针使用单独 Node 进程、stdin 输入及文件读取许可清单，并实际检查越界读取被拒绝；每次调用保存命令、工作目录、Node／探针版本、输入输出摘要、退出码和限制。它不是完整 OS／网络沙箱，也不建立模型上下文独立性。原相邻模型评测、真实宿主加载和真实业务资格继续分别记 not-run；2026-09-22 本轮版本、实际回归、缺陷复现、十对象二十项评审与未完成范围统一见[八方法最后接线复核](../../../docs/quality/agent-to-recipe/skill-closure-20260922.md)。9 月 19—21 日质量记录仅证明其原版本和范围，不继承为本轮评分，不把测试数量解释为生产成功率。

2026-09-22，v0.7：补强 S12 的 scope→scenario 证据绑定，并明确“一次 Fresh Run”“可重复运行”“参数化可复用”“普通 JS 不依赖 Agent 逐步点击”是不同声明；确定性 checker 只检查可由固定字节证明的关系，live 运行仍保持独立证据要求。

## 普通 JS 原字节执行与复用判据

本节落实 BC-04／BC-05／BC-11，不新增阶段、评分量尺或业务执行引擎。S12 先区分：生成者自检、静态检查、宿主合成接口执行、正式 Runtime 单元、真实桌面、Fresh Run、合法业务输入变化、人工接受和复用收益。每层只报告其实际证据；前一层通过不自动晋级。

当既有普通 JS 可读、真实桌面暂不可用时，可以执行**固定生产源码原字节**的宿主控制流／数据流测试，不复制另一套业务流程，不把它写成 Qualification pass。测试接口返回与预期答案不同、必要时故意不满足业务算术关系的合成标记；断言实际读值进入后续调用、终点读值原样返回、异步完成顺序、失败后不继续依赖动作。对“读取后仍用常量”“跳过首次读取”“最后输出 Expected”的受控坏副本，确认同一 Oracle 确实拒绝。坏副本只存在测试内存，不发布为 Candidate。

Calculator 实现入口是 `tests/workflows/artifact-calculator-production.test.js`：Node VM 只为原源码提供顶层 await 包装和显式合成 API，执行 `examples/agent-to-recipe/calculator.js`，并核对 `spec.json` 固定源码 hash。它不是 OpenDesk Runtime 或 OS 安全沙箱；不控制 Calculator，不生成真实 Observation，不证明原生 API 行为。两个独立 JS 上下文取得不同合成值，只能证明该测试环境未缓存；`0040`／`777` 等是数据流标记，不是合法业务变参或桌面 Fresh Run 证据。

```bash
node --test tests/workflows/artifact-calculator-production.test.js
```

真实复用必须使用同一冻结 Candidate 的**实际公开入口及 inputContract**。helper 接受数组不等于主入口提供业务参数；改变测试桩读值不等于改变用户输入；改源码／复制脚本再运行也不等于同一 Candidate 的变参资格。固定 Calculator 主入口仍为 25×4+10，再 6×本次读值，其历史通过范围不自动扩大。欲覆盖 BC-04 的 12×3+4 变化，先核对原任务包与支持范围，由 S8—S9 明确业务参数与运行时值，S11 发布可由真实入口配置的新候选，再由 S12 对固定候选完成基线、合法变化及独立 UI 观察；有效示范无需重做。

当前任务包缺失时先按 WORKFLOW 盘点规则补取原文件并核对，不能从源码、Expected 或测试 spec 倒填 Dossier／Procedure／资格。平台或依赖阻塞须保留实际失败、`inputStarted` 与缺口；不可删除平台、hash 或来源保护来取得绿色结果。
