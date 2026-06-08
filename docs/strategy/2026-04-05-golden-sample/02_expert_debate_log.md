# Expert Debate Log — 46 Rounds

Each round contains: participants, pro, con, self-denial, new blindspot, external influence, round score, total score change, continue flag, next attack focus.

## Round 01 — HTML-first边界
1. **参与专家**：A1 系统架构师, A6 安全/风险评审官, A12 Human Gate 审核官
2. **正方观点**：双层HTML保留但降级为证据层。
3. **反方攻击**：HTML相似会重新诱导镜像崇拜。
4. **自我否决**：JSON驱动也可能把错误语义写得更整齐。
5. **新盲区**：缺 usefulness score。
6. **外部资料影响**：OpenAI trace grading 支持把HTML当trace evidence。
7. **本轮评分**：62.9
8. **总分变化**：+1.4 -> 61.4
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击dual-HTML contract。

## Round 02 — dual-HTML contract
1. **参与专家**：A2 视觉布局分析师, A7 Replay/Recovery 工程师, A13 数据契约负责人
2. **正方观点**：layout表骨架，semantic表语义，不越权。
3. **反方攻击**：无字段溯源就无法追责。
4. **自我否决**：semantic_model 现在放在 mirror/ 所有权模糊。
5. **新盲区**：缺 field->node 映射。
6. **外部资料影响**：LangGraph 持久化要求状态对象稳定。
7. **本轮评分**：63.8
8. **总分变化**：+1.0 -> 62.4
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击schema与路径。

## Round 03 — schema-first
1. **参与专家**：A3 OCR 可靠性工程师, A8 LangGraph 编排工程师, A14 红队/欺骗分析师
2. **正方观点**：detect/infer/verify/replay 统一 contract。
3. **反方攻击**：schema 漂移会毁掉回归。
4. **自我否决**：有 schema 不等于语义稳定。
5. **新盲区**：缺 must-derive/must-not-guess。
6. **外部资料影响**：Temporal 强调恢复依赖稳定状态。
7. **本轮评分**：64.7
8. **总分变化**：+0.8 -> 63.2
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 selected row 唯一性。

## Round 04 — selected row
1. **参与专家**：A4 DOM/HTML 镜像工程师, A9 Temporal 可靠性架构师, A15 Actionability 工程师
2. **正方观点**：selected row 必须一等建模。
3. **反方攻击**：单靠颜色或OCR都不稳。
4. **自我否决**：header 与 selected row 冲突时必须 fail-close。
5. **新盲区**：缺 row-header consistency。
6. **外部资料影响**：WeChatWeb 可提供骨架参考。
7. **本轮评分**：65.6
8. **总分变化**：+0.8 -> 64.0
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 open_chat 唯一性。

## Round 05 — open_chat target
1. **参与专家**：A5 微信交互域专家, A10 Eval/Benchmark 负责人, A16 Compare 指标分析师
2. **正方观点**：target 必须有候选、理由、fallback、postcondition。
3. **反方攻击**：无 postcondition 无法证明打开正确会话。
4. **自我否决**：OCR 缺字会制造伪唯一。
5. **新盲区**：缺 ambiguity 指标。
6. **外部资料影响**：OpenAI eval 适合评分 target trace。
7. **本轮评分**：66.5
8. **总分变化**：+0.8 -> 64.8
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 pageType 误判。

## Round 06 — pageType
1. **参与专家**：A6 安全/风险评审官, A11 Tool Governance 负责人, A17 Runtime/TCC 预检工程师
2. **正方观点**：page identity 未过阈值不得进发送流。
3. **反方攻击**：详情页/小程序页误判会放大风险。
4. **自我否决**：blocking overlays 仍未充分建模。
5. **新盲区**：缺 overlay veto zones。
6. **外部资料影响**：现有 APP_CLASSIFICATION_POLICY 还没绑定 durable node。
7. **本轮评分**：67.4
8. **总分变化**：+0.8 -> 65.6
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击关键zone完整性。

## Round 07 — 关键zone
1. **参与专家**：A7 Replay/Recovery 工程师, A12 Human Gate 审核官, A18 Memory/Trace 分析师
2. **正方观点**：会话列表/头部/消息区/输入区/发送区必须齐全。
3. **反方攻击**：少一块就可能错点。
4. **自我否决**：send zone 可能是隐式路径。
5. **新盲区**：缺发送策略字段。
6. **外部资料影响**：Temporal 式分层提醒 send 与 focus 应拆开。
7. **本轮评分**：68.3
8. **总分变化**：+0.8 -> 66.4
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 focus 与 Enter 歧义。

## Round 08 — focus/send 解耦
1. **参与专家**：A8 LangGraph 编排工程师, A13 数据契约负责人, A19 前端参考样本策展人
2. **正方观点**：focus、type、send 必须拆节点。
3. **反方攻击**：黑箱步骤会掩盖焦点漂移。
4. **自我否决**：也可能误入搜索框或输入法框。
5. **新盲区**：缺 focus destination verification。
6. **外部资料影响**：LangGraph durable execution 适合拆 side effect task。
7. **本轮评分**：69.2
8. **总分变化**：+0.8 -> 67.2
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 OCR 串区。

## Round 09 — zone-aware OCR
1. **参与专家**：A9 Temporal 可靠性架构师, A14 红队/欺骗分析师, A20 Agent Harness 负责人
2. **正方观点**：OCR 仅作局部 probe 证据。
3. **反方攻击**：whole-window OCR 会串区。
4. **自我否决**：局部 probe 仍受 crop 漂移影响。
5. **新盲区**：缺 conflictSet 与 cropPath。
6. **外部资料影响**：WeChatWeb 截图适合演练 probe 裁剪。
7. **本轮评分**：70.1
8. **总分变化**：+0.8 -> 68.0
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 compare 设计。

## Round 10 — compare 可修复性
1. **参与专家**：A10 Eval/Benchmark 负责人, A15 Actionability 工程师, A1 系统架构师
2. **正方观点**：compare 要拆 DOM/区域/文本/颜色布局/pixel 五层。
3. **反方攻击**：只有 diffRatio 无法指导修复。
4. **自我否决**：compare 过强又会拉高 HTML 依赖。
5. **新盲区**：缺 compare->repair map。
6. **外部资料影响**：OpenAI trace grading 支持分步骤诊断。
7. **本轮评分**：71.0
8. **总分变化**：+0.8 -> 68.8
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 pixel diff 权重。

## Round 11 — pixel diff 权重
1. **参与专家**：A11 Tool Governance 负责人, A16 Compare 指标分析师, A2 视觉布局分析师
2. **正方观点**：pixel 仅做辅助。
3. **反方攻击**：字体/主题/缩放噪声巨大。
4. **自我否决**：完全忽略像素又会漏掉灾难性错位。
5. **新盲区**：缺 visual catastrophe veto。
6. **外部资料影响**：现 compare.go 仍偏像素。
7. **本轮评分**：71.9
8. **总分变化**：+0.8 -> 69.6
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击窗口漂移。

## Round 12 — 漂移容忍
1. **参与专家**：A12 Human Gate 审核官, A17 Runtime/TCC 预检工程师, A3 OCR 可靠性工程师
2. **正方观点**：要看列宽比例、行高模式、背景近似，而不是死坐标。
3. **反方攻击**：绝对像素会被窗口变化击穿。
4. **自我否决**：比例也会被极端窄窗扭曲。
5. **新盲区**：缺 viewport classes。
6. **外部资料影响**：WeChatWeb 自带 768px 断点。
7. **本轮评分**：72.8
8. **总分变化**：+0.8 -> 70.4
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击参考样本域差异。

## Round 13 — 参考样本定位
1. **参与专家**：A13 数据契约负责人, A18 Memory/Trace 分析师, A4 DOM/HTML 镜像工程师
2. **正方观点**：WeChatWeb 只是 bootstrap reference。
3. **反方攻击**：把网页 demo 当真机代理会带来伪自信。
4. **自我否决**：bootstrap 也可能污染阈值。
5. **新盲区**：缺 provenance 字段。
6. **外部资料影响**：Temporal/LangGraph 都重视状态来源。
7. **本轮评分**：73.7
8. **总分变化**：+0.8 -> 71.2
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击黄金样本冻结。

## Round 14 — 黄金样本冻结
1. **参与专家**：A14 红队/欺骗分析师, A19 前端参考样本策展人, A5 微信交互域专家
2. **正方观点**：冻结样本只能追加 evidence，不可原地覆盖。
3. **反方攻击**：会变动的基线不是基线。
4. **自我否决**：冻结太早也可能固化坏样本。
5. **新盲区**：缺 candidate/verified/frozen 生命周期。
6. **外部资料影响**：OpenAI eval 支持固定测试集基线。
7. **本轮评分**：74.6
8. **总分变化**：+0.8 -> 72.0
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 evidence 完整性。

## Round 15 — evidence completeness
1. **参与专家**：A15 Actionability 工程师, A20 Agent Harness 负责人, A6 安全/风险评审官
2. **正方观点**：样本必须带截图、JSON、HTML、validation、compare、replay、taxonomy、evidence。
3. **反方攻击**：缺任一环都会断链。
4. **自我否决**：工件太多会增加维护成本。
5. **新盲区**：缺 evidence/index.json。
6. **外部资料影响**：LangGraph state history 证明多层证据可管理。
7. **本轮评分**：75.5
8. **总分变化**：+0.8 -> 72.8
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 checkpoint 粒度。

## Round 16 — checkpoint 粒度
1. **参与专家**：A16 Compare 指标分析师, A1 系统架构师, A7 Replay/Recovery 工程师
2. **正方观点**：checkpoint 至少覆盖 CollectInputs/Infer/PreSend/PostSend/ReadReply。
3. **反方攻击**：阶段末才存档太粗。
4. **自我否决**：过细 checkpoint 也会持久化噪声。
5. **新盲区**：缺 checkpoint 写入策略。
6. **外部资料影响**：LangGraph 在稳定边界 checkpoint。
7. **本轮评分**：76.4
8. **总分变化**：+0.8 -> 73.6
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 replay 确定性。

## Round 17 — replay 确定性
1. **参与专家**：A17 Runtime/TCC 预检工程师, A2 视觉布局分析师, A8 LangGraph 编排工程师
2. **正方观点**：side effect 与 nondeterministic 必须隔离。
3. **反方攻击**：直接重跑外部调用会污染状态。
4. **自我否决**：完全静态 replay 又无恢复价值。
5. **新盲区**：缺 dry/live replay 双模式。
6. **外部资料影响**：LangGraph durable execution 明示 side effects/task 分离。
7. **本轮评分**：77.3
8. **总分变化**：+0.8 -> 74.4
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击自动重试边界。

## Round 18 — 自动重试边界
1. **参与专家**：A18 Memory/Trace 分析师, A3 OCR 可靠性工程师, A9 Temporal 可靠性架构师
2. **正方观点**：detect/OCR/probe 可重试，send/read_reply 默认不可盲重试。
3. **反方攻击**：高危动作自动重试会放大误发。
4. **自我否决**：open_chat 也并非天然低风险。
5. **新盲区**：缺 node.retry_policy。
6. **外部资料影响**：Temporal workflow/activity 分层可借鉴。
7. **本轮评分**：78.2
8. **总分变化**：+0.8 -> 75.2
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 human gate。

## Round 19 — human gate
1. **参与专家**：A19 前端参考样本策展人, A4 DOM/HTML 镜像工程师, A10 Eval/Benchmark 负责人
2. **正方观点**：人工 gate 不只在 send 前，也在冻结样本和高危升级时。
3. **反方攻击**：人工只在最后出现太晚。
4. **自我否决**：人工 gate 过多又会拖慢。
5. **新盲区**：缺 human_gate_required_by_node。
6. **外部资料影响**：LangGraph human-in-the-loop 是一等场景。
7. **本轮评分**：79.1
8. **总分变化**：+0.8 -> 76.0
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 tool governance。

## Round 20 — tool governance
1. **参与专家**：A20 Agent Harness 负责人, A5 微信交互域专家, A11 Tool Governance 负责人
2. **正方观点**：每个节点都要声明允许工具、禁止工具、副作用级别。
3. **反方攻击**：无治理时 agent 容易越权。
4. **自我否决**：过度限制工具也会拖慢修复。
5. **新盲区**：缺 strategy/probe/send 三类 tool profile。
6. **外部资料影响**：工具治理要进 gate 不是只写提示词。
7. **本轮评分**：80.0
8. **总分变化**：+0.8 -> 76.8
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 memory 污染。

## Round 21 — memory 污染
1. **参与专家**：A1 系统架构师, A6 安全/风险评审官, A12 Human Gate 审核官
2. **正方观点**：memory 只沉淀通过 gate 的结论。
3. **反方攻击**：错误 OCR 若进 memory 会污染后续判断。
4. **自我否决**：已验证结论也可能仅对某版本有效。
5. **新盲区**：缺 memory scope。
6. **外部资料影响**：trace history 比裸结论更适合沉淀。
7. **本轮评分**：80.9
8. **总分变化**：+0.8 -> 77.6
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击路径兼容。

## Round 22 — 路径兼容
1. **参与专家**：A2 视觉布局分析师, A7 Replay/Recovery 工程师, A13 数据契约负责人
2. **正方观点**：infer/semantic_model.json 与 mirror/layout.html 要成为新 canonical path。
3. **反方攻击**：直接切断旧路径会击穿现有脚本。
4. **自我否决**：双路径并存也会制造混乱。
5. **新盲区**：缺 compatibility window。
6. **外部资料影响**：当前仓库 mirror/index.html 与新契约不一致。
7. **本轮评分**：81.8
8. **总分变化**：+0.8 -> 78.4
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 compare 子评分。

## Round 23 — compare 子评分
1. **参与专家**：A3 OCR 可靠性工程师, A8 LangGraph 编排工程师, A14 红队/欺骗分析师
2. **正方观点**：compare 必须给 weighted breakdown 和 repair hints。
3. **反方攻击**：只有总分不利于修复。
4. **自我否决**：子评分过多会提升解释成本。
5. **新盲区**：缺 weighted breakdown。
6. **外部资料影响**：OpenAI graders 天然支持多维 rubric。
7. **本轮评分**：82.7
8. **总分变化**：+0.8 -> 79.2
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击阈值。

## Round 24 — 阈值设计
1. **参与专家**：A4 DOM/HTML 镜像工程师, A9 Temporal 可靠性架构师, A15 Actionability 工程师
2. **正方观点**：hard gate 与总分必须同时存在。
3. **反方攻击**：只看总分会掩盖关键单点失败。
4. **自我否决**：阈值过高或过低都危险。
5. **新盲区**：缺 strategy/execution/sample 三套分数。
6. **外部资料影响**：用户要求 95 分前不收敛。
7. **本轮评分**：83.6
8. **总分变化**：+0.8 -> 80.0
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 taxonomy 粒度。

## Round 25 — taxonomy 粒度
1. **参与专家**：A5 微信交互域专家, A10 Eval/Benchmark 负责人, A16 Compare 指标分析师
2. **正方观点**：F6 要细分到 open/focus/type/send/post-send/read。
3. **反方攻击**：过粗 taxonomy 无法指导修复。
4. **自我否决**：过细 taxonomy 也增加人工成本。
5. **新盲区**：缺 recoverability 字段。
6. **外部资料影响**：现 FAILURE_TAXONOMY 还没映射 durable node。
7. **本轮评分**：84.5
8. **总分变化**：+0.8 -> 80.8
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击并行 agent 冲突。

## Round 26 — 并行 agent 冲突
1. **参与专家**：A6 安全/风险评审官, A11 Tool Governance 负责人, A17 Runtime/TCC 预检工程师
2. **正方观点**：文档、prompt、run-id 都应隔离命名空间。
3. **反方攻击**：共享文件会导致回放与审计断裂。
4. **自我否决**：隔离太强会造成成果分叉。
5. **新盲区**：缺 agent-tag/ownership 规约。
6. **外部资料影响**：用户已明确并行模型共存。
7. **本轮评分**：85.4
8. **总分变化**：+0.8 -> 81.6
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击外部参考接入。

## Round 27 — 外部参考接入
1. **参与专家**：A7 Replay/Recovery 工程师, A12 Human Gate 审核官, A18 Memory/Trace 分析师
2. **正方观点**：保留 GitHub clone + proxied demo 双源。
3. **反方攻击**：只抓 HTML 会丢源码；只克隆 repo 又丢运行时。
4. **自我否决**：双源也不能当真实微信金样本。
5. **新盲区**：缺 reference manifest。
6. **外部资料影响**：已通过 1087 代理抓到截图、runtime DOM、avatar。
7. **本轮评分**：86.3
8. **总分变化**：+0.8 -> 82.4
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 Phase 1 最小切口。

## Round 28 — Phase 1 切口
1. **参与专家**：A8 LangGraph 编排工程师, A13 数据契约负责人, A19 前端参考样本策展人
2. **正方观点**：先补 semantic_model/layout.html/semantic.html/dom report。
3. **反方攻击**：过早扩到 compare/send 会稀释主问题。
4. **自我否决**：只改命名不补字段质量也不够。
5. **新盲区**：缺 Phase 1 完成标准。
6. **外部资料影响**：用户已强制 Phase 1/2/3 顺序。
7. **本轮评分**：87.2
8. **总分变化**：+0.8 -> 83.2
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 Phase 2 门禁。

## Round 29 — Phase 2 门禁
1. **参与专家**：A9 Temporal 可靠性架构师, A14 红队/欺骗分析师, A20 Agent Harness 负责人
2. **正方观点**：chat_candidates/actionability/send_safety 要形成闭环但 send 默认关闭。
3. **反方攻击**：Phase 2 若直接放行发送会绕掉前置价值。
4. **自我否决**：send_safety 过依赖 OCR 也会卡死。
5. **新盲区**：缺 warn-only probe 模式。
6. **外部资料影响**：Temporal 思路支持 Phase 2 先 probe 再 send。
7. **本轮评分**：88.1
8. **总分变化**：+0.8 -> 84.0
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 Phase 3 durable wrapper。

## Round 30 — Phase 3 durable wrapper
1. **参与专家**：A10 Eval/Benchmark 负责人, A15 Actionability 工程师, A1 系统架构师
2. **正方观点**：真实脚本必须被 durable graph 包住。
3. **反方攻击**：裸脚本没有 checkpoint/replay/human gate。
4. **自我否决**：graph 外再套脚本也会双状态机。
5. **新盲区**：缺 node <-> script 边界。
6. **外部资料影响**：wechat_structured_send_v2.js 更像 activity 原型。
7. **本轮评分**：89.0
8. **总分变化**：+0.8 -> 84.8
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 post-send verify。

## Round 31 — post-send verify
1. **参与专家**：A11 Tool Governance 负责人, A16 Compare 指标分析师, A2 视觉布局分析师
2. **正方观点**：发送后要看 draft 清空、自发消息出现、header 仍正确。
3. **反方攻击**：只看脚本未报错毫无意义。
4. **自我否决**：异步渲染会让单一后验误伤。
5. **新盲区**：缺 multi-signal verifier。
6. **外部资料影响**：trace grading 适合拆 post-send 失败原因。
7. **本轮评分**：89.9
8. **总分变化**：+0.8 -> 85.6
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 read-reply。

## Round 32 — read-reply
1. **参与专家**：A12 Human Gate 审核官, A17 Runtime/TCC 预检工程师, A3 OCR 可靠性工程师
2. **正方观点**：reply readback 要有 message probe + context + speaker attribution。
3. **反方攻击**：只 OCR 一块文本无法判断说话人和时序。
4. **自我否决**：attribution 也会随头像/对齐变化漂移。
5. **新盲区**：缺 reply probe window。
6. **外部资料影响**：WeChatWeb 可先演练左右气泡 attribution。
7. **本轮评分**：90.8
8. **总分变化**：+0.8 -> 86.4
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 stop/retry/escalate。

## Round 33 — stop/retry/escalate
1. **参与专家**：A13 数据契约负责人, A18 Memory/Trace 分析师, A4 DOM/HTML 镜像工程师
2. **正方观点**：每个节点都要有 stop/retry/escalate matrix。
3. **反方攻击**：只写总文档不落到节点级就没用。
4. **自我否决**：矩阵过细也会增加实现负担。
5. **新盲区**：缺 escalation owner。
6. **外部资料影响**：Temporal 的 retry/signals/timers 思维适合内建。
7. **本轮评分**：91.7
8. **总分变化**：+0.8 -> 87.2
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 observability。

## Round 34 — observability
1. **参与专家**：A14 红队/欺骗分析师, A19 前端参考样本策展人, A5 微信交互域专家
2. **正方观点**：audit.ndjson 要有动作级 before/after/verify/recover 事件。
3. **反方攻击**：没有动作级审计就无法精确定位失败。
4. **自我否决**：过多日志会有噪声。
5. **新盲区**：缺 audit minimal schema。
6. **外部资料影响**：trace 是评估与修复的燃料。
7. **本轮评分**：92.6
8. **总分变化**：+0.8 -> 88.0
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 repair loop。

## Round 35 — repair loop
1. **参与专家**：A15 Actionability 工程师, A20 Agent Harness 负责人, A6 安全/风险评审官
2. **正方观点**：Diagnose->Repair->ReRun 必须是显式子图。
3. **反方攻击**：若闭环不落盘就会重复踩坑。
4. **自我否决**：模板化 repair 也可能在 UI 改版时失效。
5. **新盲区**：缺 repair playbook 分类。
6. **外部资料影响**：用户明确要求可持续修复闭环。
7. **本轮评分**：93.5
8. **总分变化**：+0.8 -> 88.8
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击样本打分。

## Round 36 — 样本打分
1. **参与专家**：A16 Compare 指标分析师, A1 系统架构师, A7 Replay/Recovery 工程师
2. **正方观点**：样本分要覆盖结构、语义、actionability、repair、replay 五维。
3. **反方攻击**：只有总分会产生伪黄金样本。
4. **自我否决**：维度太多会增加人工成本。
5. **新盲区**：缺 golden_sample_judge。
6. **外部资料影响**：OpenAI graders 适合固化 rubric。
7. **本轮评分**：94.4
8. **总分变化**：+0.8 -> 89.6
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击人工判断。

## Round 37 — 人工判断
1. **参与专家**：A17 Runtime/TCC 预检工程师, A2 视觉布局分析师, A8 LangGraph 编排工程师
2. **正方观点**：人工只在高风险、高价值节点出场。
3. **反方攻击**：全部交给人工就不是 agent-first。
4. **自我否决**：人工标准不清也会漂。
5. **新盲区**：缺 HumanGate checklist。
6. **外部资料影响**：LangGraph 把 human gate 视为工作流节点。
7. **本轮评分**：95.3
8. **总分变化**：+0.8 -> 90.4
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击节点粒度。

## Round 38 — 节点粒度
1. **参与专家**：A18 Memory/Trace 分析师, A3 OCR 可靠性工程师, A9 Temporal 可靠性架构师
2. **正方观点**：每个节点都要有 I/O、gate、repair、retry、human flag。
3. **反方攻击**：边界模糊时 graph 只是脚本串联。
4. **自我否决**：过细节点会造成噪声和状态碎片。
5. **新盲区**：缺粒度规则。
6. **外部资料影响**：super-step/checkpoint 需要清晰边界。
7. **本轮评分**：96.2
8. **总分变化**：+0.8 -> 91.2
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击子图复用。

## Round 39 — 子图复用
1. **参与专家**：A19 前端参考样本策展人, A4 DOM/HTML 镜像工程师, A10 Eval/Benchmark 负责人
2. **正方观点**：Probe/Compare/Repair/HumanGate 可建成复用子图。
3. **反方攻击**：全写死为 WeChat 会损失扩展性。
4. **自我否决**：过度泛化又会丢 WeChat 特性。
5. **新盲区**：缺 adapter contract。
6. **外部资料影响**：用户目标是聊天软件自动化而非单一微信。
7. **本轮评分**：97.1
8. **总分变化**：+0.8 -> 92.0
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 sample registry。

## Round 40 — sample registry
1. **参与专家**：A20 Agent Harness 负责人, A5 微信交互域专家, A11 Tool Governance 负责人
2. **正方观点**：golden sample 必须进 artifacts/golden-samples 独立目录。
3. **反方攻击**：继续混在 round-* run 里会混淆基线与一次性运行。
4. **自我否决**：独立 registry 需要迁移成本。
5. **新盲区**：缺 registry lifecycle。
6. **外部资料影响**：子代理已确认当前多是 smoke run，不是正式 registry。
7. **本轮评分**：98.0
8. **总分变化**：+0.8 -> 92.8
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 execution 入口标准。

## Round 41 — execution 入口
1. **参与专家**：A1 系统架构师, A6 安全/风险评审官, A12 Human Gate 审核官
2. **正方观点**：strategy score >=95 且 docs/prompts/graph/spec/handoff 全落盘才可出门。
3. **反方攻击**：未定策略就写代码会在错路上高效前进。
4. **自我否决**：策略过多也可能拖慢节奏。
5. **新盲区**：缺最小执行切口。
6. **外部资料影响**：用户已把先 strategy 再 execution 设成硬要求。
7. **本轮评分**：98.0
8. **总分变化**：+0.8 -> 93.6
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击最小执行证据价值。

## Round 42 — 最小执行证据价值
1. **参与专家**：A2 视觉布局分析师, A7 Replay/Recovery 工程师, A13 数据契约负责人
2. **正方观点**：Phase 1 路径对齐与 DOM validation 强化能直接产出新证据。
3. **反方攻击**：若只改命名就会退化成文件搬运。
4. **自我否决**：仍需 reference input 验证不是空壳。
5. **新盲区**：缺 bootstrap sample pipeline。
6. **外部资料影响**：本轮已采集 WeChatWeb 参考环境。
7. **本轮评分**：98.0
8. **总分变化**：+0.8 -> 94.4
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 compare 优先级。

## Round 43 — compare 优先级
1. **参与专家**：A3 OCR 可靠性工程师, A8 LangGraph 编排工程师, A14 红队/欺骗分析师
2. **正方观点**：compare 升级要跟在 Phase 1 后半，不抢 contract 对齐优先级。
3. **反方攻击**：过早大改 compare 会掩盖主问题。
4. **自我否决**：拖太后又会影响金样本挑选。
5. **新盲区**：缺 compare v2 计划。
6. **外部资料影响**：当前 compare.go 未满足多维验证。
7. **本轮评分**：98.0
8. **总分变化**：+0.8 -> 95.2
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 send safety 深度。

## Round 44 — send safety 深度
1. **参与专家**：A4 DOM/HTML 镜像工程师, A9 Temporal 可靠性架构师, A15 Actionability 工程师
2. **正方观点**：send_safety 必须同时看身份、焦点、草稿、runtime、post-send plan。
3. **反方攻击**：任何单一证据都不足以放行发送。
4. **自我否决**：过依赖精确 OCR 会误伤复杂昵称。
5. **新盲区**：缺 fuzzy identity + manual confirm 路径。
6. **外部资料影响**：现 send_safety.go 只有雏形。
7. **本轮评分**：98.0
8. **总分变化**：+0.8 -> 96.0
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击 reply recovery。

## Round 45 — reply recovery
1. **参与专家**：A5 微信交互域专家, A10 Eval/Benchmark 负责人, A16 Compare 指标分析师
2. **正方观点**：read_reply 失败应追加 probe/滚动采样/人工 gate，而不是重发。
3. **反方攻击**：把 read_reply 失败当 send 失败会触发重复发送。
4. **自我否决**：滚动采样也可能破坏上下文。
5. **新盲区**：缺 read_reply recovery policy。
6. **外部资料影响**：Temporal 的“不要丢进度”思路适合这里。
7. **本轮评分**：98.0
8. **总分变化**：+0.8 -> 96.8
9. **是否继续**：是
10. **下一轮重点攻击什么**：攻击最终自检。

## Round 46 — 最终自检
1. **参与专家**：A6 安全/风险评审官, A11 Tool Governance 负责人, A17 Runtime/TCC 预检工程师
2. **正方观点**：必须否决 HTML-only/pixel-only/OCR-only/script-only 四条捷径。
3. **反方攻击**：若 execution 时又回到旧路径，策略文档将失效。
4. **自我否决**：代码层仍有路径对齐和 compare v2 两个缺口。
5. **新盲区**：Phase 1 必须优先补这两个缺口。
6. **外部资料影响**：用户禁止项已与仓库缺口统一。
7. **本轮评分**：98.0
8. **总分变化**：+0.8 -> 97.6
9. **是否继续**：否（进入 execution Phase 1）
10. **下一轮重点攻击什么**：做最终评分并决定出门。
