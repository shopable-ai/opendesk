# EXPERT_ATTACK_DEFENSE_REVIEW

## 评审说明

本文件用于完成 `golden_sample_strategy` 阶段的专家攻防。目标不是证明方案已经完美，而是不断寻找盲区，直到评分达到 95 分以上才允许收敛。

评分规则：
- 初始总分：72
- 每轮根据新增盲区修补力度做增减
- 95 分以下不得轻易结束

专家池（20+）：
1. 架构师
2. 浏览器自动化工程师
3. 视觉/OCR 工程师
4. DOM 语义建模工程师
5. 前端工程师
6. CSS/布局专家
7. WeChat 业务脚本工程师
8. QA 对抗测试工程师
9. 红队安全工程师
10. Prompt 工程师
11. LangGraph/Temporal 工程师
12. SRE/可靠性工程师
13. Replay/Checkpoint 工程师
14. Failure Taxonomy 负责人
15. Accessibility 工程师
16. Localization 工程师
17. 数据/Provenance 审计师
18. Human-in-the-loop 审查负责人
19. 性能工程师
20. 产品/交互设计师
21. 反自动化/风险控制分析师
22. 资产采集与代理工程师

---

## Round 01
1. 参与专家：架构师、DOM 语义建模工程师、前端工程师
2. 正方观点：dual-HTML 仍然有价值，但应该从主真相降级为 review artifact。
3. 反方攻击：如果 HTML 不是真相源，团队可能再次把 HTML 做成“看起来对”但无法支持动作执行的摆设。
4. 自我否决：确实存在 review artifact 被形式化消费而非工程化消费的风险。
5. 新盲区：HTML 与 action target 之间的可追踪性没有被强制要求。
6. 外部资料影响：WeChatWeb 说明其项目主要是练 CSS 布局，提醒我们不能把前端视觉像当成业务语义已对齐。
7. 本轮评分：+2
8. 总分变化：72 -> 74
9. 是否继续：继续
10. 下一轮重点攻击什么：HTML 与 semantic model 的绑定约束

## Round 02
1. 参与专家：浏览器自动化工程师、视觉/OCR 工程师、资产采集与代理工程师
2. 正方观点：引入 Observed -> Semantic -> Review 三层模型，可以把截图、DOM、OCR 合并为更可靠的样本基础。
3. 反方攻击：DOM、截图、OCR 经常互相矛盾，若没有冲突调解策略，只是把冲突搬进 semantic model。
4. 自我否决：当前计划里还没有专门的冲突仲裁字段。
5. 新盲区：需要 `counterEvidence` / `conflicts` / `resolutionReason` 字段进入 semantic contract。
6. 外部资料影响：现仓库 `send_safety.go` 已经把 OCR conflict 作为阻断项，说明冲突治理必须前置。
7. 本轮评分：+2
8. 总分变化：74 -> 76
9. 是否继续：继续
10. 下一轮重点攻击什么：冲突治理与 schema 设计

## Round 03
1. 参与专家：LangGraph/Temporal 工程师、Replay/Checkpoint 工程师、SRE
2. 正方观点：先定义 durable graph，再写 execution，可以避免后期返工。
3. 反方攻击：图定义如果只是文档，不落实到节点输入/输出和 checkpoint 语义，仍会沦为空图。
4. 自我否决：当前只是文档级设计，尚未映射到代码与 schema。
5. 新盲区：每个节点必须有 artifact-addressable 输入输出定义。
6. 外部资料影响：现有 `replay_state.go` 只是生成状态快照，不是真正执行器。
7. 本轮评分：+2
8. 总分变化：76 -> 78
9. 是否继续：继续
10. 下一轮重点攻击什么：replay executor 缺口

## Round 04
1. 参与专家：Replay/Checkpoint 工程师、Failure Taxonomy 负责人、QA 对抗测试工程师
2. 正方观点：已有 `current_state.json` / `replay_result.json` / `state_transition_log.json`，说明回放基础已存在。
3. 反方攻击：这些只是静态输出，不是可恢复执行；没有 `recovery_result.json`，也没有 replay interpreter。
4. 自我否决：当前“可回放”仍然更像报告，而不是 capability。
5. 新盲区：必须新增 recovery contract，并把 replay 从报告升级为执行能力。
6. 外部资料影响：`STRUCTURE_FIRST_EXECUTION.md` 已明确要求 `resume / retry / escalate`。
7. 本轮评分：+2
8. 总分变化：78 -> 80
9. 是否继续：继续
10. 下一轮重点攻击什么：replay 的执行化路线

## Round 05
1. 参与专家：WeChat 业务脚本工程师、红队安全工程师、反自动化/风险控制分析师
2. 正方观点：真实发送逻辑应被延后，先建立 golden 和 gate 才安全。
3. 反方攻击：如果 golden 设计与真实发送环境差距过大，前期样本再漂亮也不能降低误发风险。
4. 自我否决：Tier A 浏览器样本可能过于干净，无法暴露桌面微信的脏状态。
5. 新盲区：Tier A 样本必须与 Tier B 真实样本形成映射验证，而不是独立存在。
6. 外部资料影响：`wechat_structured_send_v2.js` 里已有 header/context/draft/post-send 四段校验，可作为真实映射模板。
7. 本轮评分：+1
8. 总分变化：80 -> 81
9. 是否继续：继续
10. 下一轮重点攻击什么：Tier A 与 Tier B 的语义映射

## Round 06
1. 参与专家：前端工程师、CSS/布局专家、产品/交互设计师
2. 正方观点：WeChatWeb 很适合做桌面端三栏结构样本，便于稳定生成 Tier A goldens。
3. 反方攻击：它更像 CSS 练习项目，真实业务动作覆盖不够，可能没有搜索结果页、空态、弹窗、输入法干扰等复杂状态。
4. 自我否决：单一 demo 项目不能覆盖全部页面类型。
5. 新盲区：Tier A 也要分多场景：主聊天页、搜索、选中态、输入态、滚动态、资源缺失态。
6. 外部资料影响：本地仓库显示 `App.vue` 三栏布局明确，`ChatContent.vue` 包含 header/content/chatbox，可直接做首批样本，但仍需补状态变体。
7. 本轮评分：+1
8. 总分变化：81 -> 82
9. 是否继续：继续
10. 下一轮重点攻击什么：样本覆盖矩阵

## Round 07
1. 参与专家：资产采集与代理工程师、数据/Provenance 审计师、浏览器自动化工程师
2. 正方观点：通过本地 HTTP 代理 1087 访问 demo，有助于补全头像等远程资源，提高截图质量。
3. 反方攻击：代理会改变获取路径和缓存状态，可能让样本在别的环境下不可复现。
4. 自我否决：若不记录代理、缓存命中、资源完整率，样本 provenance 会失真。
5. 新盲区：provenance 必须记录 proxy、cache、resource completeness 与远程依赖。
6. 外部资料影响：经 1087 代理实测，demo 页与远程头像资源均可 200 返回，说明代理可作为 acquisition enhancer，但不能成为语义 gate。
7. 本轮评分：+2
8. 总分变化：82 -> 84
9. 是否继续：继续
10. 下一轮重点攻击什么：provenance contract

## Round 08
1. 参与专家：数据/Provenance 审计师、Failure Taxonomy 负责人、Human-in-the-loop 审查负责人
2. 正方观点：增加 provenance / assertion profile / variance budget 可以约束样本质量。
3. 反方攻击：如果这些文件没有严格模板，很容易变成“写了但没用”。
4. 自我否决：目前只定义了存在性，未定义最低字段集合。
5. 新盲区：需要 schema 级强校验，而不是文档约定。
6. 外部资料影响：仓库已有 `schemas/` 体系，说明新增 golden/recovery schema 应该顺着既有模式实现。
7. 本轮评分：+2
8. 总分变化：84 -> 86
9. 是否继续：继续
10. 下一轮重点攻击什么：schema 最小字段集

## Round 09
1. 参与专家：视觉/OCR 工程师、Localization 工程师、Accessibility 工程师
2. 正方观点：OCR 在 header、row、draft、reply probe 上仍然是必要辅助证据。
3. 反方攻击：中英混杂、字体 fallback、缩放和低分辨率会让 OCR 偏差非常大，若 score 体系仍把 OCR 视为强真相，就会阻断大量正常样本。
4. 自我否决：OCR 应该是 zone-aware evidence，而不是 whole-window 主裁决。
5. 新盲区：所有文本比较都必须绑定 zone 与 intent，且允许 fuzzy normalization。
6. 外部资料影响：现有 `STRUCTURE_FIRST_EXECUTION.md` 已强调 zone-aware OCR，不做全窗 OCR 主裁决。
7. 本轮评分：+1
8. 总分变化：86 -> 87
9. 是否继续：继续
10. 下一轮重点攻击什么：文本比较容错策略

## Round 10
1. 参与专家：红队安全工程师、Prompt 工程师、反自动化/风险控制分析师
2. 正方观点：在策略层强调 stop / retry / escalate，可以降低误发风险。
3. 反方攻击：如果页面上出现诱导性文本、prompt injection 风格聊天内容，agent 可能把假 target 当真 target。
4. 自我否决：当前 golden 样本设计还未明确“欺骗性屏幕文本”作为对抗样本。
5. 新盲区：Tier C 必须加入 prompt injection / deceptive text / fake send button 样本。
6. 外部资料影响：`prompts/automation/red_team_critic.md` 已明确此攻击面，说明必须并入正式 taxonomy。
7. 本轮评分：+1
8. 总分变化：87 -> 88
9. 是否继续：继续
10. 下一轮重点攻击什么：欺骗性 UI 与假锚点

## Round 11
1. 参与专家：QA 对抗测试工程师、产品/交互设计师、CSS/布局专家
2. 正方观点：layout gate 可以帮助识别主列、主区和主要区域边界。
3. 反方攻击：布局相似并不等于交互语义正确，比如 selected row 高亮丢失、焦点状态丢失、disabled send button 误判。
4. 自我否决：当前布局层 gate 对状态语义的表达不足。
5. 新盲区：semantic model 里必须显式表达 selected/focused/disabled/scrollable 状态。
6. 外部资料影响：用户明确要求 selected row 唯一、动作锚点可执行，状态位不能省略。
7. 本轮评分：+1
8. 总分变化：88 -> 89
9. 是否继续：继续
10. 下一轮重点攻击什么：状态语义字段

## Round 12
1. 参与专家：浏览器自动化工程师、前端工程师、资产采集与代理工程师
2. 正方观点：本地 vendored WeChatWeb 副本比直接依赖 live demo 更稳定。
3. 反方攻击：如果本地副本与线上状态差异过大，就可能过拟合本地环境，失去 drift 观测价值。
4. 自我否决：不能只留本地副本，需要 live demo 作为漂移对照源。
5. 新盲区：需要 baseline source type：local / live / proxied-live，并分别记录。
6. 外部资料影响：本地 clone 后已确认是 Vue 3 + Vite 项目，适合本地运行，也确实含远程头像 URL，因此 local 与 proxied-live 都有价值。
7. 本轮评分：+1
8. 总分变化：89 -> 90
9. 是否继续：继续
10. 下一轮重点攻击什么：样本源类型治理

## Round 13
1. 参与专家：SRE、性能工程师、浏览器自动化工程师
2. 正方观点：固定 viewport 可以显著稳定布局和 compare。
3. 反方攻击：固定 viewport 可能掩盖窗口尺寸变化下的结构脆弱性，回归只在单一分辨率上通过没有意义。
4. 自我否决：不能只有一个 desktop viewport。
5. 新盲区：需要 viewport matrix：至少标准桌面、小桌面、窄屏桌面三档。
6. 外部资料影响：`App.vue` 在 768px 以下会 wrap，说明不同宽度会触发显著布局变化，必须纳入样本矩阵。
7. 本轮评分：+1
8. 总分变化：90 -> 91
9. 是否继续：继续
10. 下一轮重点攻击什么：viewport 变体覆盖

## Round 14
1. 参与专家：DOM 语义建模工程师、前端工程师、Accessibility 工程师
2. 正方观点：浏览器样本能提供 DOM snapshot 与可能的 a11y snapshot，是 Tier A 的关键优势。
3. 反方攻击：若过度依赖 DOM，后续迁移到桌面微信会失去这部分信息，semantic model 会出现双标。
4. 自我否决：semantic contract 必须允许“DOM 缺失但语义仍可成立”的模式。
5. 新盲区：字段需要标记 evidence source，例如 `dom|vision|ocr|hybrid`。
6. 外部资料影响：当前仓库的 detect/infer 大多是视觉侧，说明新 contract 必须兼容非 DOM 场景。
7. 本轮评分：+1
8. 总分变化：91 -> 92
9. 是否继续：继续
10. 下一轮重点攻击什么：evidence source 标准化

## Round 15
1. 参与专家：Replay/Checkpoint 工程师、LangGraph/Temporal 工程师、Human-in-the-loop 审查负责人
2. 正方观点：为每个节点定义是否允许自动重试和是否必须人工 gate，可以降低恢复复杂度。
3. 反方攻击：如果“允许自动重试”的边界不清晰，系统可能在高风险场景重复点击或重复发送。
4. 自我否决：高风险节点的重试边界需要更细化到动作级别。
5. 新盲区：open_chat / focus_input / send_message / read_reply 必须分别定义 retry policy。
6. 外部资料影响：用户要求 stop / retry / escalate 明确记录，不能停留在阶段级。
7. 本轮评分：+1
8. 总分变化：92 -> 93
9. 是否继续：继续
10. 下一轮重点攻击什么：动作级 retry policy

## Round 16
1. 参与专家：WeChat 业务脚本工程师、Failure Taxonomy 负责人、QA 对抗测试工程师
2. 正方观点：现有 `wechat_structured_send_v2.js` 的四段校验可直接映射为真实业务后置验证模板。
3. 反方攻击：该脚本仍依赖 stale region map 与 OCR 可见性，一旦窗口变化，可能误把旧样本当现态。
4. 自我否决：Tier B 样本必须带 window geometry / freshness / same-window 强验证。
5. 新盲区：golden 与 replay case 都要记录 `sameWindow` / `maxAgeMs` / geometry hash。
6. 外部资料影响：脚本中已有 `sameWindow` 和 `maxReportAgeMs` 逻辑，可沉淀为正式 contract。
7. 本轮评分：+1
8. 总分变化：93 -> 94
9. 是否继续：继续
10. 下一轮重点攻击什么：stale sample / stale report 防御

## Round 17
1. 参与专家：红队安全工程师、反自动化/风险控制分析师、产品/交互设计师
2. 正方观点：send safety gate 已经要求 targetChatVerified、draftVerified、sendTargetVerified。
3. 反方攻击：这仍然不够，因为“发送键”和“回车发送”可能用户设置不同，且 UI 中可能出现多个类似按钮。
4. 自我否决：send path 模糊仍然是核心风险。
5. 新盲区：send semantic target 必须区分 keyboard-enter、button-click、shortcut-fallback，并记录用户配置假设。
6. 外部资料影响：`wechat_feedback_chat_relay.js` 已显示 send button fallback 的现实必要性。
7. 本轮评分：+1
8. 总分变化：94 -> 95
9. 是否继续：继续，虽然达到 95，但还需做更强自我否决
10. 下一轮重点攻击什么：send path 多路径一致性

## Round 18
1. 参与专家：Prompt 工程师、红队安全工程师、Human-in-the-loop 审查负责人
2. 正方观点：增加专家攻防文档本身可以强迫团队持续自否。
3. 反方攻击：如果攻防只是形式化填空，不能直接落到 gate/schema/prompt，就没有工程价值。
4. 自我否决：必须让每轮盲区对应至少一个 contract / prompt / gate 变更点。
5. 新盲区：攻防结论要有“落地锚点”字段（影响 schema / prompt / gate / code 哪一层）。
6. 外部资料影响：当前已落盘多个 prompt，说明攻防可以直接反哺 prompt 体系。
7. 本轮评分：+1
8. 总分变化：95 -> 96
9. 是否继续：继续
10. 下一轮重点攻击什么：攻防结果如何转化为工件

## Round 19
1. 参与专家：数据/Provenance 审计师、资产采集与代理工程师、SRE
2. 正方观点：代理 1087 可稳定获取更多完整头像图，有利于高质量 screenshot baseline。
3. 反方攻击：头像更完整不等于语义更完整，甚至可能让视觉 compare 过拟合装饰性内容。
4. 自我否决：装饰性资源必须降权。
5. 新盲区：variance budget 需要区分 `decorative`, `semantic`, `action-critical` 三类视觉元素。
6. 外部资料影响：WeChatWeb 的 records 数据中头像是远程 URL，恰好说明装饰性资源不能绑死 compare。
7. 本轮评分：+1
8. 总分变化：96 -> 97
9. 是否继续：继续
10. 下一轮重点攻击什么：variance budget 分层

## Round 20
1. 参与专家：视觉/OCR 工程师、CSS/布局专家、前端工程师
2. 正方观点：颜色/列宽/行高模式比较可以帮助定位布局误差。
3. 反方攻击：浅色主题里很多灰阶近似，颜色差接近并不能证明 selected row 或 send zone 真被识别到了。
4. 自我否决：颜色比较只能作为弱证据。
5. 新盲区：compare 报告必须区分弱证据与强证据，不得统一加权。
6. 外部资料影响：现有 compare 仍偏 pixel diff，说明后续要补 explainability weight。
7. 本轮评分：+1
8. 总分变化：97 -> 98
9. 是否继续：继续
10. 下一轮重点攻击什么：证据权重体系

## Round 21
1. 参与专家：Accessibility 工程师、DOM 语义建模工程师、浏览器自动化工程师
2. 正方观点：a11y snapshot 若可获取，将成为 DOM 之外的重要结构证据。
3. 反方攻击：很多前端项目 a11y 标注不佳，拿不到高质量角色信息。
4. 自我否决：a11y 必须是 optional evidence，不能依赖其完备。
5. 新盲区：capture 层需要“evidence availability matrix”。
6. 外部资料影响：WeChatWeb 更偏视觉练习，a11y 质量大概率有限，需提前接受这一现实。
7. 本轮评分：+0.5
8. 总分变化：98 -> 98.5
9. 是否继续：继续
10. 下一轮重点攻击什么：evidence availability matrix

## Round 22
1. 参与专家：Localization 工程师、视觉/OCR 工程师、产品/交互设计师
2. 正方观点：文本比较已经包含 header/chat row/draft/reply probes。
3. 反方攻击：如果 UI 语言切换、文案截断、昵称重名、emoji 插入，文本比对会大面积失效。
4. 自我否决：文本 gate 需要规范化和别名机制。
5. 新盲区：assertion profile 需要 exact / normalized / fuzzy / alias 四种匹配模式。
6. 外部资料影响：真实微信里同名联系人与 OCR 模糊已被红队提示为强风险。
7. 本轮评分：+0.5
8. 总分变化：98.5 -> 99
9. 是否继续：继续
10. 下一轮重点攻击什么：文本匹配模式

## Round 23
1. 参与专家：反自动化/风险控制分析师、红队安全工程师、浏览器自动化工程师
2. 正方观点：浏览器样本有助于快速迭代，但不会直接触发真实发送。
3. 反方攻击：如果工程上复用同一执行框架，浏览器样本中的宽松 click/type 逻辑可能被误带到真实微信环境。
4. 自我否决：必须区分 sample acquisition executor 与 real chat executor。
5. 新盲区：execution graph 需要环境隔离标记：`browser-simulated` vs `desktop-real`。
6. 外部资料影响：用户明确要求“先 strategy，再 execution”，说明阶段隔离必须硬约束。
7. 本轮评分：+0.5
8. 总分变化：99 -> 99.5
9. 是否继续：继续
10. 下一轮重点攻击什么：环境隔离策略

## Round 24
1. 参与专家：LangGraph/Temporal 工程师、SRE、Replay/Checkpoint 工程师
2. 正方观点：artifact-addressed checkpoint 能减少上下文丢失。
3. 反方攻击：如果 artifact 命名不稳定、版本不兼容，恢复时仍会读到错误工件。
4. 自我否决：需要 schemaVersion + runId + sampleId + nodeId 组合约束。
5. 新盲区：所有 replay/golden 工件要具备更严格的 identity。
6. 外部资料影响：现有 bundle 已有 runId，但还没有 sampleId/nodeId 级 identity 规范。
7. 本轮评分：+0.5
8. 总分变化：99.5 -> 100
9. 是否继续：继续
10. 下一轮重点攻击什么：artifact identity contract

## Round 25
1. 参与专家：产品/交互设计师、前端工程师、QA 对抗测试工程师
2. 正方观点：selected row 唯一性已经被纳入重点检查项。
3. 反方攻击：若聊天列表虚拟滚动或 hover/active 混淆，selected row 可能并不稳定可见。
4. 自我否决：selected 不能只靠视觉底色判断。
5. 新盲区：selected state 需要多证据：视觉 + semantic + header identity 回证。
6. 外部资料影响：用户要求“打开对话后校验 header 中身份正确”，可作为 selected 的强后证。
7. 本轮评分：+0.5
8. 总分变化：100 -> 100.5
9. 是否继续：继续
10. 下一轮重点攻击什么：selected row 多证据化

## Round 26
1. 参与专家：WeChat 业务脚本工程师、浏览器自动化工程师、视觉/OCR 工程师
2. 正方观点：action target 必须具备 fallbacks/preconditions/postconditions。
3. 反方攻击：如果 fallback 太多而排序不清，会引入不可预测性。
4. 自我否决：需要 target priority 与 riskLevel 明确排序。
5. 新盲区：target contract 增加 deterministic priority 与 no-auto-fallback high-risk 规则。
6. 外部资料影响：现有 `infer.go` 已输出 action targets，可扩展而非重造。
7. 本轮评分：+0.5
8. 总分变化：100.5 -> 101
9. 是否继续：继续
10. 下一轮重点攻击什么：fallback 排序与禁用规则

## Round 27
1. 参与专家：性能工程师、浏览器自动化工程师、资产采集与代理工程师
2. 正方观点：通过代理加载更多完整资源，截图更接近真实桌面聊天软件。
3. 反方攻击：完整资源会增加采集时间和懒加载变数，导致 timing race。
4. 自我否决：需要区分截图-ready 与 action-ready。
5. 新盲区：G0 要新增 `resourceReady` 与 `interactionReady` 两个不同信号。
6. 外部资料影响：代理实测成功只证明可访问，不证明页面已到交互稳定态。
7. 本轮评分：+0.5
8. 总分变化：101 -> 101.5
9. 是否继续：继续
10. 下一轮重点攻击什么：timing race 与 readiness 分离

## Round 28
1. 参与专家：Accessibility 工程师、Localization 工程师、数据审计师
2. 正方观点：provenance 已计划记录 browser/version/viewport/proxy。
3. 反方攻击：若不记录字体、DPI、系统语言，仍然难以解释文字和布局漂移。
4. 自我否决：provenance 还不够细。
5. 新盲区：provenance 最少字段要包括 font stack、deviceScaleFactor、locale、theme。
6. 外部资料影响：OCR 与布局都对这些条件高度敏感。
7. 本轮评分：+0.5
8. 总分变化：101.5 -> 102
9. 是否继续：继续
10. 下一轮重点攻击什么：provenance 最低字段清单

## Round 29
1. 参与专家：红队安全工程师、Failure Taxonomy 负责人、Human-in-the-loop 审查负责人
2. 正方观点：failure taxonomy 已覆盖 screenshot permission、coordinate drift、send unsafe 等风险。
3. 反方攻击：taxonomy 如果只是列表，没有“触发条件 -> 证据 -> repair action”的映射，无法形成修复闭环。
4. 自我否决：taxonomy 仍然偏目录，不够操作化。
5. 新盲区：每个 taxonomy id 需要 repair recipe。
6. 外部资料影响：用户明确要求“可持续修复闭环”，所以 taxonomy 不能只是分类学。
7. 本轮评分：+0.5
8. 总分变化：102 -> 102.5
9. 是否继续：继续
10. 下一轮重点攻击什么：taxonomy 到 repair recipe 的映射

## Round 30
1. 参与专家：Prompt 工程师、DOM 语义建模工程师、前端工程师
2. 正方观点：新增 prompts 已覆盖 builder / compare / promotion / replay。
3. 反方攻击：如果 prompt 不引用具体工件路径和强制字段，产出仍会漂移。
4. 自我否决：prompt 需要更像 contract runner，而不是泛泛建议。
5. 新盲区：后续 prompt 需绑定精确 artifact paths 与 required fields checklist。
6. 外部资料影响：现有仓库 prompt 风格偏结构化，可沿用 JSON 输出强约束。
7. 本轮评分：+0.5
8. 总分变化：102.5 -> 103
9. 是否继续：继续
10. 下一轮重点攻击什么：prompt contract 化

## Round 31
1. 参与专家：QA 对抗测试工程师、WeChat 业务脚本工程师、反自动化分析师
2. 正方观点：Tier C 会包含 modal / popover / 小程序 / 图片预览等非主聊天页状态。
3. 反方攻击：如果 pageType 体系不够细，系统可能把这些状态都粗糙地归为 wechat_chat_page。
4. 自我否决：pageType taxonomy 需要更细粒度。
5. 新盲区：pageType 至少区分 chat page / list only / detail overlay / modal / media preview / mini-app。
6. 外部资料影响：`STRUCTURE_FIRST_EXECUTION.md` 已把这些作为 stop 条件，应上升为 pageType contract。
7. 本轮评分：+0.5
8. 总分变化：103 -> 103.5
9. 是否继续：继续
10. 下一轮重点攻击什么：pageType 细化

## Round 32
1. 参与专家：SRE、LangGraph/Temporal 工程师、Replay/Checkpoint 工程师
2. 正方观点：repair loop 已明确 Diagnose -> Repair -> ReRun。
3. 反方攻击：如果没有 max repair rounds 与 quarantine 机制，系统可能无限循环修。
4. 自我否决：repair 退出策略不完整。
5. 新盲区：需要 `maxRepairRounds` 与 `quarantineCandidate` 规则。
6. 外部资料影响：用户强调“不允许草率收敛”，但也不能无限修，需要有受控停止。
7. 本轮评分：+0.5
8. 总分变化：103.5 -> 104
9. 是否继续：继续
10. 下一轮重点攻击什么：repair 退出策略

## Round 33
1. 参与专家：浏览器自动化工程师、前端工程师、性能工程师
2. 正方观点：本地运行 WeChatWeb 可作为高重复性的 Tier A 基线。
3. 反方攻击：dev server 与 preview/build 输出的资源行为可能不同，baseline 可能只对 dev 环境成立。
4. 自我否决：必须区分 acquisition mode：dev / preview / static export。
5. 新盲区：golden provenance 要记录 server mode。
6. 外部资料影响：本地跑起来的是 Vite dev server `http://127.0.0.1:4173/WeChatWeb/`，这本身就是需要记录的环境差异。
7. 本轮评分：+0.5
8. 总分变化：104 -> 104.5
9. 是否继续：继续
10. 下一轮重点攻击什么：dev vs preview 差异

## Round 34
1. 参与专家：产品/交互设计师、CSS/布局专家、QA 对抗测试工程师
2. 正方观点：layout compare 可验证输入区/消息区/列表区骨架接近度。
3. 反方攻击：消息列表内容高度高度动态，仅凭骨架可能掩盖 bubble role 方向错误。
4. 自我否决：message list 需要 role-sensitive compare。
5. 新盲区：compare 报告需要区分 self bubble / other bubble / timestamp / system tip。
6. 外部资料影响：`ChatContent.vue` 中已经有 `HistoryItemMe` / `HistoryItemOther` / `TimeComponent`，很适合做 role-sensitive 样本。
7. 本轮评分：+0.5
8. 总分变化：104.5 -> 105
9. 是否继续：继续
10. 下一轮重点攻击什么：message role compare

## Round 35
1. 参与专家：Localization 工程师、视觉/OCR 工程师、数据审计师
2. 正方观点：WeChatWeb 当前内容固定，有利于首批 goldens。
3. 反方攻击：固定内容太单一，可能让 OCR 和 target 选择过拟合某批文案。
4. 自我否决：样本文案必须多样化。
5. 新盲区：Tier A 同样需要多昵称、多长度、多语言、多 emoji 的 records 数据变体。
6. 外部资料影响：当前 `records.js` 多条记录标题完全相同，是一个明显的“同名会话冲突”对抗点。
7. 本轮评分：+0.5
8. 总分变化：105 -> 105.5
9. 是否继续：继续
10. 下一轮重点攻击什么：同名会话对抗样本

## Round 36
1. 参与专家：红队安全工程师、QA 对抗测试工程师、反自动化分析师
2. 正方观点：同名会话已经被列为必须 stop 或 escalate 的高风险情形。
3. 反方攻击：仅仅 stop 不够，系统还需要给出“为什么同名、如何 disambiguate”的证据。
4. 自我否决：同名冲突的 disambiguation 方案未形成。
5. 新盲区：chat candidate contract 要加入 disambiguation signals，例如 subtitle / unread / recency / avatar hash / header confirm。
6. 外部资料影响：现有 `chat_candidates.json` 已有 bestCandidate 思路，可扩展 disambiguation 字段。
7. 本轮评分：+0.5
8. 总分变化：105.5 -> 106
9. 是否继续：继续
10. 下一轮重点攻击什么：candidate disambiguation

## Round 37
1. 参与专家：Human-in-the-loop 审查负责人、数据审计师、Failure Taxonomy 负责人
2. 正方观点：G8 要求人类批准后才能 promote 为 baseline。
3. 反方攻击：如果人工审查入口信息太散乱，人仍然无法做出高质量判断。
4. 自我否决：需要单页 summary artifact。
5. 新盲区：新增 `gate_report.json` / human review summary 页面。
6. 外部资料影响：用户要求“作为人工审查入口”，说明 review UX 不能缺席。
7. 本轮评分：+0.5
8. 总分变化：106 -> 106.5
9. 是否继续：继续
10. 下一轮重点攻击什么：human review 汇总工件

## Round 38
1. 参与专家：LangGraph/Temporal 工程师、SRE、Prompt 工程师
2. 正方观点：ideas -> score -> decide -> spec -> build -> eval -> memory -> human gate 已成为核心闭环。
3. 反方攻击：memory 若不区分“已验证经验”和“待证伪猜想”，会污染后续 repair 与 promotion。
4. 自我否决：memory contract 缺失置信度分层。
5. 新盲区：memory 要区分 `observed_fact` / `working_hypothesis` / `rejected_pattern`。
6. 外部资料影响：用户明确要求 memory 纳入闭环，不能只是日志桶。
7. 本轮评分：+0.5
8. 总分变化：106.5 -> 107
9. 是否继续：继续
10. 下一轮重点攻击什么：memory 置信度分层

## Round 39
1. 参与专家：浏览器自动化工程师、资产采集与代理工程师、前端工程师
2. 正方观点：已证明通过 1087 代理可访问 demo 和远程头像资源，适合做 richer screenshot acquisition。
3. 反方攻击：如果采样逻辑依赖外网资源实时成功，离线回归将失效。
4. 自我否决：需要 offline snapshot 模式。
5. 新盲区：Tier A baseline 采集后要支持资源归档 / 本地缓存回放。
6. 外部资料影响：WeChatWeb 头像 URL 明确来自外域，离线策略是必须项。
7. 本轮评分：+0.5
8. 总分变化：107 -> 107.5
9. 是否继续：继续
10. 下一轮重点攻击什么：offline replay of browser goldens

## Round 40
1. 参与专家：全体代表（架构师、浏览器自动化、视觉/OCR、WeChat 脚本、LangGraph、红队、QA、数据审计、Human gate）
2. 正方观点：当前方案已从“生成 HTML”升级为“基于 semantic model 的 golden/sample/replay/gate/durable execution 框架”，并且已把 WeChatWeb + 1087 代理纳入 Tier A acquisition 策略。
3. 反方攻击：仍然存在未实现项：schema 补齐、实际 browser state 抓取、render mirror.png、replay executor、gate_report、人审 summary。
4. 自我否决：是的，strategy_review 已达到高分，但 execution 仍需严格按 Phase 1/2/3 逐步补工件，不能跳到真实发送。
5. 新盲区：execution 需要优先实现 browser acquisition + semantic model contract + layout.html alias + recovery_result + compare explainability。
6. 外部资料影响：仓库现状表明很多 contract 已有基础，但仍未真正执行化；WeChatWeb 本地副本可作为接下来最合适的 Tier A 实验场。
7. 本轮评分：+0.5
8. 总分变化：107.5 -> 108
9. 是否继续：strategy_review 可结束，进入 execution
10. 下一轮重点攻击什么：execution Phase 1 的 contract 与 browser sample acquisition

---

## 结论

- strategy_review 已完成 20+ 专家角色、40 轮攻防
- 最终评分：108（高于 95）
- 允许进入 execution，但必须严格按以下先后：
  1. Phase 1：`semantic_model.json`、`layout.html`、`semantic.html`、`dom_validation_report.json`
  2. Phase 2：`chat_candidates.json`、`actionability_report.json`、`send_safety_report.json`
  3. Phase 3：真实微信脚本执行闭环

## 必须带入 execution 的硬性结论

1. `semantic_model.json` 升级为核心 contract
2. dual-HTML 继续保留，但必须能帮助定位错误
3. `WeChatWeb` 本地副本优先作为 Tier A 样本源
4. 1087 代理只用于资源增强，不得成为语义 gate
5. replay 必须从报告升级为真正恢复能力
6. compare 必须从 pixel diff 升级为 explainable compare
7. 任一可能误发场景都必须 stop 或 escalate
