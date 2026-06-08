# 2026-04-05 Expert Attack-Defense Review

## Expert roster

1. Agent Architect
2. CV Researcher
3. OCR Engineer
4. DOM Mirror Engineer
5. UI Automation Engineer
6. WeChat Domain Expert
7. Red Team Operator
8. Reliability Expert
9. LangGraph Orchestrator
10. QA/Eval Engineer
11. Product/Risk Owner
12. Human Factors Reviewer
13. Observability Engineer
14. Tool Governance Reviewer
15. Security/Privacy Reviewer
16. Frontend Reverse Engineer
17. Data/Schema Engineer
18. Performance Engineer
19. Recovery/Replay Engineer
20. Network Capture Engineer

## 40 rounds

| Round | 参与专家 | 正方观点 | 反方攻击 | 自我否决 | 新盲区 | 外部资料影响 | 本轮评分 | 总分变化 | 是否继续 | 下一轮重点攻击什么 |
|---:|---|---|---|---|---|---|---:|---:|---|---|
| 1 | Agent Architect, CV Researcher | 先以截图->JSON->双层HTML建立可回归骨架。 | 反方指出 HTML 可能伪理解。 | 承认 HTML 不能当主 gate。 | HTML 产物可能脱离真实动作。 | 无 | 61.0 | +1.0 | 继续 | 攻击 HTML-first 是否过度中心化 |
| 2 | DOM Mirror Engineer, UI Automation Engineer | Layout HTML 可做布局偏差定位。 | 仅有布局骨架无法证明可点可发。 | 接受布局层只做诊断。 | 骨架正确但 target 仍可能错。 | 无 | 62.0 | +1.0 | 继续 | 攻击语义层是否可执行 |
| 3 | WeChat Domain Expert, OCR Engineer | Semantic HTML 可显式表达会话列表/输入区/发送区。 | OCR 探针文本可能漂移。 | 承认探针文本必须 zone-aware。 | whole-window OCR 串区风险。 | 无 | 63.0 | +1.0 | 继续 | 攻击 OCR 是否会把左列当右列 |
| 4 | Red Team Operator, QA/Eval Engineer | compare 可以帮助发现大偏差。 | 把 compare 当门禁会误杀有效动作链。 | 同意 compare 退居辅助层。 | 辅助层被误用为主裁决。 | 无 | 64.0 | +1.0 | 继续 | 攻击 gate 错位 |
| 5 | Reliability Expert, Replay Engineer | checkpoint/replay 必须主干化。 | 没有 durable 语义，失败只能重来。 | 承认当前仓库 replay 仍偏轻。 | 缺少从节点级恢复语义。 | LangGraph durable execution 强调 checkpointer/thread id/tasks 与 deterministic replay。 | 65.5 | +1.5 | 继续 | 攻击恢复模型 |
| 6 | LangGraph Orchestrator, Tool Governance Reviewer | 先定义节点图再执行，可约束 agent 漂移。 | 如果节点输入输出不刚性，图只是装饰。 | 接受必须把节点工件写死。 | 节点 contract 不足会导致回放无意义。 | LangGraph 文档要求 persistence + thread id + tasks。 | 67.0 | +1.5 | 继续 | 攻击节点 contract |
| 7 | Temporal Expert, Replay Engineer | 将每个动作视为 workflow step，有历史与恢复点。 | 若动作副作用不可重放，会导致误发。 | 同意发送前后必须 idempotency-style guard。 | send 是最高风险 side effect。 | Temporal 工作流强调 resilient execution、Event History、deterministic constraints。 | 68.5 | +1.5 | 继续 | 攻击发送幂等与误发 |
| 8 | Product/Risk Owner, Security/Privacy Reviewer | send_safety 必须独立 gate。 | 若只靠 actionability，仍可能误发到同名群。 | 承认身份校验必须双证据。 | 同名会话消歧不足。 | 无 | 70.0 | +1.5 | 继续 | 攻击目标会话唯一性 |
| 9 | Human Factors Reviewer, WeChat Domain Expert | header 文本 + selected row + message context 共同确认目标。 | header 可能截断、selected row 可能样式接近。 | 接受必须三证合一。 | 需要上下文一致性 gate。 | 无 | 71.0 | +1.0 | 继续 | 攻击 header/row 不一致 |
| 10 | Frontend Reverse Engineer, DOM Mirror Engineer | 在线演示页可作为高质量黄金样本来源。 | 若本地保存不完整，样本会被污染。 | 承认必须保存页面资源与来源清单。 | 外链头像/字体缺失会导致伪差异。 | 无 | 72.5 | +1.5 | 继续 | 攻击资源镜像完整性 |
| 11 | Network Capture Engineer, Tool Governance Reviewer | 通过 1087 代理抓取在线 demo 可保留更多头像资源。 | 若只保存 HTML 而不保存 JS/CSS/字体/头像，离线不可复现。 | 同意必须镜像资源并落盘 manifest。 | 资源镜像 contract 尚未定义。 | Playwright 截图文档支持页面/元素截图，适合稳定采样。 | 74.0 | +1.5 | 继续 | 攻击样本可复现性 |
| 12 | Performance Engineer, QA/Eval Engineer | 使用本地镜像再截图，可减少线上抖动。 | 但镜像脚本若重写错误，截图不再代表原站。 | 承认必须保留原始 URL 映射与来源证据。 | 镜像重写本身需要校验。 | 无 | 75.0 | +1.0 | 继续 | 攻击镜像重写正确性 |
| 13 | Data/Schema Engineer, Agent Architect | 先定义 golden_sample manifest schema，再填工件。 | 没有 schema 就会散乱补文件。 | 承认当前缺少 golden-sample 顶层 manifest。 | 样本不可检索不可比较。 | 无 | 76.5 | +1.5 | 继续 | 攻击 schema 完整性 |
| 14 | Observability Engineer, Playwright Specialist | capture 阶段保留 DOM snapshot / network / console。 | 只保留 screenshot 无法追责资源缺失。 | 接受证据必须多模态。 | 缺少 provenance。 | Playwright Trace Viewer 文档强调 screenshots/snapshots/network/console 对调试有价值。 | 78.0 | +1.5 | 继续 | 攻击证据粒度 |
| 15 | QA/Eval Engineer, Red Team Operator | 必须把验证拆成 DOM/区域/文本/颜色/视觉五层。 | 如果评分只看单层，会被作弊。 | 承认需要分层评分与 fail taxonomy。 | 缺少量化拆项。 | 无 | 79.0 | +1.0 | 继续 | 攻击评分模型 |
| 16 | Reliability Expert, Product/Risk Owner | warn 只能 probe，不能 send。 | 若 warn 仍允许发送，风险不可控。 | 同意 pass/warn/fail 必须与动作权限绑定。 | gate 状态与动作权限映射不清。 | 无 | 80.0 | +1.0 | 继续 | 攻击 gate->action 权限映射 |
| 17 | Recovery Engineer, Temporal Expert | 每个节点写 repair policy 与 auto-retry policy。 | 无 repair 只会无限重试。 | 接受必须区分 auto-retry 与人工 gate。 | repair 策略粒度不够。 | Temporal 的 Event History 思想支持按步骤恢复而非整体重做。 | 81.5 | +1.5 | 继续 | 攻击 repair 细化 |
| 18 | OCR Engineer, CV Researcher | header/message/draft/reply 分区 OCR 比整窗 OCR 更稳。 | 低清晰度时局部 OCR 也会失败。 | 承认需要 OCR probe 失败回退策略。 | probe 失败后的回退路径未固定。 | 无 | 82.5 | +1.0 | 继续 | 攻击 OCR fallback |
| 19 | WeChat Domain Expert, UI Automation Engineer | 动作 target 应显式包含 pre/post conditions 与 fallbacks。 | 只给 bbox/point 仍然脆弱。 | 同意 selectorLogic 与 fallback 链必须存在。 | target contract 不足。 | 无 | 83.5 | +1.0 | 继续 | 攻击 action target schema |
| 20 | Security/Privacy Reviewer, Product/Risk Owner | 真实发送前必须 stop/retry/escalate 策略落地。 | 若只有日志没有 stop policy，误发仍会发生。 | 接受 send 前置 gate 与人工确认位。 | stop condition 未工程化。 | 无 | 84.5 | +1.0 | 继续 | 攻击 stop policy |
| 21 | Agent Architect, LangGraph Orchestrator | CollectInputs->BuildGoldenSample 必须先于推理。 | 如果直接 infer，样本 provenance 不完整。 | 承认需要先固化 capture provenance。 | source provenance 缺失。 | LangGraph 持久化要求 execution state 可追踪。 | 85.2 | +0.7 | 继续 | 攻击 provenance gate |
| 22 | DOM Mirror Engineer, Data/Schema Engineer | Layout HTML 与 Semantic HTML 都必须由同一 semantic_model/region contract 驱动。 | 若手写 HTML，就失去可修复性。 | 同意禁止散乱手写。 | 模板外逸风险。 | 无 | 86.0 | +0.8 | 继续 | 攻击 HTML 生成一致性 |
| 23 | Frontend Reverse Engineer, Performance Engineer | 在线 demo 是 Vue SPA，必须保存 JS/CSS/font/image。 | 若忽略字体，会影响 icon 区布局。 | 承认字体也属于黄金样本资源。 | 字体缺失导致骨架误判。 | 无 | 86.8 | +0.8 | 继续 | 攻击字体与图标依赖 |
| 24 | Network Capture Engineer, Playwright Specialist | 外链头像来自 cdn.v2ex.com，需镜像或至少记录请求清单。 | 若直接在线渲染，不利于后续离线回归。 | 同意优先镜像。 | query/path 映射可能出错。 | Playwright network/trace 文档支持保留网络证据。 | 87.6 | +0.8 | 继续 | 攻击外链资源本地化 |
| 25 | QA/Eval Engineer, Observability Engineer | golden sample 要包含 compare diff 与 DOM validation。 | 只有截图和 HTML 不足以支撑修复闭环。 | 承认 compare 仍需保留。 | 辅助层证据仍未系统聚合。 | 无 | 88.3 | +0.7 | 继续 | 攻击 compare/DOM 联合报告 |
| 26 | Red Team Operator, WeChat Domain Expert | selected row 必须唯一，否则不允许 open_chat/send。 | UI 高亮可能视觉接近导致误判。 | 接受 selected uniqueness 必须单独校验。 | selected row 唯一性 gate 需硬性化。 | 无 | 89.0 | +0.7 | 继续 | 攻击 selected uniqueness |
| 27 | Human Factors Reviewer, OCR Engineer | reply readback 不能读取左侧摘要，必须限定 message_list local probe。 | whole-window 读取会把会话摘要当回复。 | 承认 reply probe 必须局部化。 | reply readback 假阳性。 | 无 | 89.7 | +0.7 | 继续 | 攻击 reply probe 假阳性 |
| 28 | Recovery Engineer, QA/Eval Engineer | checkpoint/current_state.json 要描述可 resume 节点。 | 只有 replay_result 没有 current_state 语义太弱。 | 承认 current_state 必须可读。 | resumeFrom 语义还要更清晰。 | 无 | 90.4 | +0.7 | 继续 | 攻击 checkpoint 语义 |
| 29 | Tool Governance Reviewer, Agent Architect | 执行时输出固定 10 字段，可降低 agent 漂移。 | 若不强制字段，轮次日志无法回归。 | 同意 execution prompt 固化。 | 执行日志结构不稳定。 | 无 | 91.1 | +0.7 | 继续 | 攻击 execution 输出 contract |
| 30 | Schema Engineer, Reliability Expert | failure taxonomy 要把 blocked/warn/fail 与可恢复性绑定。 | 分类若只描述现象，无法驱动 repair。 | 接受 taxonomy 必须含 repair hints。 | taxonomy 仍偏文档化。 | 无 | 91.8 | +0.7 | 继续 | 攻击 failure taxonomy 工程化 |
| 31 | Temporal Expert, Product/Risk Owner | send_message 节点应默认人工 gate，直到真实微信样本通过。 | 若自动发送过早启用，风险过高。 | 同意 demo 样本阶段只 build，不真实发送。 | Phase 3 需要独立授权策略。 | Temporal 的 deterministic + event-history 思想支持对高风险 side effect 做延后提交。 | 92.5 | +0.7 | 继续 | 攻击真实发送前提 |
| 32 | Playwright Specialist, Observability Engineer | 元素级截图可用于 mirror.png 与 source region 验证。 | 如果只截 viewport，边界噪声会放大 compare diff。 | 承认 compare 前要优先元素截图。 | viewport 噪声。 | Playwright screenshot 文档支持 element screenshot。 | 93.0 | +0.5 | 继续 | 攻击 compare 采样方式 |
| 33 | CV Researcher, DOM Mirror Engineer | 区域比较要关注 bbox/覆盖率/列宽比例。 | 只看像素 diff 会忽略结构正确性。 | 接受 region metrics 与 pixel diff 并存。 | compare 报告尚缺颜色/列宽。 | 无 | 93.4 | +0.4 | 继续 | 攻击 compare 指标丰富度 |
| 34 | Frontend Reverse Engineer, UI Automation Engineer | WeChatWeb demo 可先作为桌面排版类样本，而非真实微信动作样本。 | 若误把 demo 当真实微信，会高估动作成功率。 | 承认 demo 仅用于黄金样本/识别训练，不直接证明真实发送。 | 样本代表性边界。 | 无 | 93.8 | +0.4 | 继续 | 攻击 demo 与真实业务差距 |
| 35 | Product/Risk Owner, Human Factors Reviewer | 需要 human gate 明确判断何时从 demo 过渡到真实微信。 | 没有迁移 gate 就会过度外推。 | 接受 demo 与真实微信双基线。 | 缺少迁移条件。 | 无 | 94.2 | +0.4 | 继续 | 攻击从 demo 到真实微信的迁移 |
| 36 | Agent Architect, LangGraph Orchestrator | LangGraph JSON 图中每个节点必须声明 humanGateRequired。 | 否则高风险节点容易被自动化穿透。 | 同意图中显式布尔字段。 | 人工门位置不清。 | LangGraph durable execution 与 interrupts 非常适合 human gate。 | 94.6 | +0.4 | 继续 | 攻击 human gate 精确位置 |
| 37 | Network Capture Engineer, Security Reviewer | 样本目录必须隔离，避免与另一模型/未提交改动冲突。 | 若共用旧 run-id，会互相覆盖。 | 承认所有新增工件用新目录/新 run-id。 | 并发写冲突。 | 无 | 94.9 | +0.3 | 继续 | 攻击目录隔离 |
| 38 | QA/Eval Engineer, Red Team Operator | 在 95 分前不收敛，继续攻击 replay 与 compare 闭环。 | 如果过早结束，会留下恢复盲区。 | 接受继续。 | repair 后再 compare 的回环尚未演示。 | 无 | 95.1 | +0.2 | 继续 | 攻击 repair->rerun->judge 回环 |
| 39 | Recovery Engineer, Observability Engineer | 需要 golden manifest 把证据/回放/差异报告串起来。 | 没有 manifest，人和 agent 都难以检索样本。 | 承认 manifest 是一级入口。 | 样本索引缺失。 | 无 | 95.4 | +0.3 | 继续 | 攻击 manifest 可读性 |
| 40 | All 20 experts | 结论：采用 proxy 抓取 online demo + 本地镜像 + screenshot -> structure JSON -> dual HTML -> compare/DOM/actionability/replay 的主链，并把 send 保持 gated。 | 反方最后攻击：HTML 仍可能误导。 | 最终否决“HTML 即完成”，只保留其辅助定位价值。 | 必须持续检查 HTML 是否真的提升找对话/点击/输入/发送/回复准确性。 | LangGraph/Temporal/Playwright 外部资料共同支持 durable + evidence + replay 的工程方向。 | 95.6 | +0.2 | 达到阈值后收敛 | 进入 execution Phase 1 |
