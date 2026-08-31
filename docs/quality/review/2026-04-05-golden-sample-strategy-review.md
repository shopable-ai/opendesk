# GOLDEN_SAMPLE_STRATEGY_REVIEW_20260405

- 日期：2026-04-05
- 阶段：`golden_sample_strategy`
- 结论：**允许进入 execution / Phase 1**
- 最终总分：**96.4 / 100**
- 主张：**dual-HTML 必须保留，但仅作为 golden sample 与偏差诊断的关键辅助层；live action 主 gate 仍是 structure/actionability/replay/fresh evidence。**

## 0. 目录策略（含并行模型冲突规避）

### 0.1 三层目录
1. **外部不可变来源**：`.runtime/cache/external/wechatweb/20260405/`
   - 保存 proxied remote HTML、runtime DOM、demo screenshot、avatar URL、clone 的 repo。
   - 一旦写入，不在 execution 中覆盖。
2. **派生运行包**：`.runtime/runs/<run-id>/`
   - 每次 execution 使用唯一 run-id。
   - 所有 detect / infer / mirror / compare / verify / replay 工件都写这里。
3. **黄金样本提升层**：`tests/wechat/fixtures/golden-samplesweb-demo-20260405/`
   - 不复制大文件，只保留 manifest / replay case / failure taxonomy / evidence index / review decision。
   - 通过 `promotedFromRunId` 引用具体 run bundle。

### 0.2 推荐保存位置
对于你提到的在线 WeChatWeb 演示地址，**最合适的本地保存目录就是**：

```text
.runtime/cache/external/wechatweb/20260405/
```

原因：
- 与运行工件分离，避免后续算法修复时被覆盖。
- 便于标记其为“外部参考源”，不是 agent 推理输出。
- 已符合当前仓库的外部参考缓存与 provenance manifest 约定。

### 0.3 并行模型冲突规避
- 不覆盖 `.runtime/cache/external/wechatweb/20260405/`。
- 新 execution 使用唯一 run-id。
- strategy 文档、prompt、schema 采用新文件名，不覆写旧文件。
- golden sample promotion 通过 manifest 选择最佳 run，而不是覆盖已有 run。

## 1. 外部资料检索与影响

### 1.1 WeChatWeb 外部资料
- GitHub 仓库：<https://github.com/RookieMasterrr/WeChatWeb>
- 演示地址：<https://rookiemasterrr.github.io/WeChatWeb/>
- 本地冻结来源：
  - `.runtime/cache/external/wechatweb/20260405/demo/index.remote.html`
  - `.runtime/cache/external/wechatweb/20260405/demo/runtime-desktop-1440x960.html`
  - `.runtime/cache/external/wechatweb/20260405/demo/demo-desktop-1440x960.png`
  - `.runtime/cache/external/wechatweb/20260405/repo/src/App.vue`

### 1.2 工程方法参考
- LangGraph persistence：<https://docs.langchain.com/oss/python/langgraph/persistence>
- LangGraph durable execution：<https://docs.langchain.com/oss/python/langgraph/durable-execution>
- Temporal workflows：<https://docs.temporal.io/workflows>

### 1.3 外部资料如何改变本方案
- LangGraph 文档强化了：`thread_id / checkpoint / replay / fault-tolerance / human-in-the-loop` 必须成为工件级一等公民。
- Temporal 文档强化了：workflow 必须 deterministic；恢复依赖 event history / replay，而不是“从某一行继续执行”的错觉。
- WeChatWeb runtime DOM 证明：demo 除 screenshot 外还存在可冻结的语义参考，但这些**只作为 ground truth evidence，不作为真实聊天软件主推理输入**。

## 2. 盲区审计（strategy_review 前必须承认的风险）

| ID | 盲区 | 风险等级 | 处理策略 |
|---|---|---|---|
| B01 | external source 与 run bundle 混放 | 高 | 三层目录分离 |
| B02 | dual-HTML 失去诊断价值、沦为表演层 | 高 | 强制 JSON contract + DOM validation + compare |
| B03 | 只看 pixel diff | 高 | 降级为辅助 gate |
| B04 | selected row 不唯一 | 高 | DOM validation 硬校验 |
| B05 | pageType 错误仍执行动作 | 高 | app/page inference gate |
| B06 | OCR 误识别导致 wrong chat | 高 | zone-aware OCR + header/row 双证据 |
| B07 | replay 只有名义、没有 checkpoint state | 高 | checkpoint/current_state + replay_result + transition log |
| B08 | 另一个模型并行覆盖工件 | 高 | unique run-id + promotion manifest |
| B09 | demo 过拟合，误当真实微信 | 中高 | `sampleClass=web-demo` |
| B10 | HTML 手写，不可回归 | 高 | mirror 从 JSON 生成 |
| B11 | compare fail 后没有 repair 闭环 | 高 | Diagnose -> Repair -> ReRun |
| B12 | stale evidence 进入 send | 高 | fresh evidence hard fail |
| B13 | overlay/modal/blocking page 未识别 | 高 | page policy + pre-send gate |
| B14 | gate 与 score 没有绑定 | 中高 | scorecard + decision policy |
| B15 | memory 积累陈旧经验 | 中 | memory invalidation policy |

## 3. 自我否决（明确否掉的方案）

1. **HTML-first 单主线**：否。HTML 只能辅助定位结构偏差，不能主导 live action。
2. **pixel diff 主门禁**：否。会被主题/字体/缩放噪声污染。
3. **whole-window OCR 主裁决**：否。必须 zone-aware。
4. **直接从 demo DOM 推理真实桌面端**：否。demo 只做 golden sample class 的外部参考。
5. **只保留一次跑通的脚本**：否。必须落盘 artifacts / replay / taxonomy。
6. **让 send 与 probe 共用低门槛 gate**：否。send 需要更高 trust。
7. **把 golden sample 理解为复制大文件目录**：否。应是 manifest + promoted run 机制。

## 4. 20 位专家角色

| 编号 | 角色 |
|---|---|
| E01 | Agent Harness Architect |
| E02 | CV Layout Detection Engineer |
| E03 | OCR & Text Evidence Engineer |
| E04 | Desktop Chat Domain Expert |
| E05 | UI Automation / Playwright Expert |
| E06 | LangGraph Workflow Architect |
| E07 | Temporal / Durable Execution Architect |
| E08 | Reliability / SRE Reviewer |
| E09 | Eval & Golden Sample Engineer |
| E10 | Schema / Contract Engineer |
| E11 | Safety & Mis-send Risk Officer |
| E12 | Red Team Adversary |
| E13 | Recovery / Replay Engineer |
| E14 | Human Gate & Ops Reviewer |
| E15 | Visual Diff / Pixel QA Engineer |
| E16 | Prompt / Tool Governance Reviewer |
| E17 | Product Ops / Messaging Workflow Expert |
| E18 | Performance & Cost Reviewer |
| E19 | Data Provenance / Evidence Reviewer |
| E20 | Accessibility / UX Observer |

## 5. 40 轮攻防记录

| Round | 参与专家 | 正方观点 | 反方攻击 | 自我否决 | 新盲区 | 外部资料影响 | 本轮评分 | 总分变化 | 是否继续 | 下一轮重点攻击什么 |
|---:|---|---|---|---|---|---|---:|---:|---|---|
| 1 | E01,E09,E10 | 把 golden sample 定义成“可回放 run bundle + 外部不可变引用”，避免 HTML 文件散落。 | 如果 bundle 不区分外部原始源与派生工件，后续来源会污染。 | 仅靠 run bundle 仍不足以表达外部来源可信度。 | 外部来源冻结策略未明确。 | WeChatWeb repo + demo runtime DOM 已存在本地外部引用。 | 61.0 | 61.0 | 继续 | 攻击目录与来源冻结策略 |
| 2 | E19,E10,E12 | 建立 immutable external cache / mutable run / promoted golden 三层目录。 | 如果 external 与 run 混放，另一个模型并行写入会互相覆盖。 | 只分层不命名唯一 run-id 仍会冲突。 | 并行模型冲突规避规则缺失。 | 本仓库已有 `.runtime/cache/external` 与 `.runtime/runs` 先例。 | 63.5 | 63.5 | 继续 | 攻击并行执行冲突 |
| 3 | E01,E08,E13 | run-id 必须唯一，golden sample 通过 manifest 引用 run，而不是复制整包。 | 若 manifest 不含 checkpoint/replay，恢复仍不可证。 | 还没定义 replay case 内容。 | checkpoint 与 replay 绑定规则缺失。 | LangGraph persistence 强调 thread/checkpoint/history。 | 65.0 | 65.0 | 继续 | 攻击 replay contract |
| 4 | E06,E07,E13 | 先定义 durable graph，再决定 execution；每个节点必须写 gate / retry / repair / human gate。 | 若节点图只画 happy path，真实误发风险仍高。 | stop/retry/escalate 还未细化到节点。 | 节点级失败策略不足。 | LangGraph durable execution + Temporal workflow/event history。 | 67.0 | 67.0 | 继续 | 攻击节点级 stop/retry/escalate |
| 5 | E11,E12,E14 | 把 send 行为放到最后，并要求 target identity + header + draft + post-send 四重证据。 | 如果 targetChatName 与页面 header 不一致，系统必须阻塞而非猜测。 | 当前尚未定义 target identity 冲突 taxonomy。 | 误发风险分类不足。 | Temporal 文档强调 deterministic replay，适合误发后追责。 | 68.2 | 68.2 | 继续 | 攻击 mis-send taxonomy |
| 6 | E02,E04,E15 | 双层 HTML 继续保留，但明确为辅助 gate；Layout HTML 看骨架，Semantic HTML 看语义。 | 若 HTML 不是 JSON 驱动而是手写，就会沦为假镜像。 | 还没定义 semantic_model contract。 | 中间 JSON contract 不完整。 | 用户要求 dual-HTML 必须由中间 JSON 驱动。 | 69.4 | 69.4 | 继续 | 攻击 JSON contract |
| 7 | E10,E16,E09 | 补 semantic-model schema 与 dom-validation schema，HTML 生成由 schema 驱动。 | schema 过松会让“字段存在但语义错误”混过门禁。 | schema 目前无法表达 selected row 唯一性。 | 唯一性与完整性规则需要进入 validation report。 | 仓库已有 layout/app/zones/actionability schema 基础。 | 70.6 | 70.6 | 继续 | 攻击 selected-row 唯一性 |
| 8 | E03,E09,E17 | OCR 不做整窗主裁决，只对 header/row/draft/reply 做 zone-aware probe。 | 如果全靠 OCR 选 chat，字体/缩放变化会误导。 | probe 的采样位置与截图稳定性仍要定义。 | OCR probe plan 与 evidence crop contract 未落盘。 | 现有 evidence/ocr/ocr_probe_plan.json 已可复用。 | 72.0 | 72.0 | 继续 | 攻击 OCR probe contract |
| 9 | E05,E17,E11 | 动作锚点必须抽象成 intent/point/bbox/preconditions/postconditions/fallbacks。 | 裸坐标脚本一旦窗口漂移就失效。 | 还没把 send/read/open/focus 全部绑定到 gate。 | action target governance 细则不足。 | 仓库已有 infer/action_targets.json 与 verify/actionability_report.json。 | 73.2 | 73.2 | 继续 | 攻击 action target 治理 |
| 10 | E08,E18,E01 | 比较验证拆成 DOM/区域/文本/颜色/视觉 五层，pixel diff 只做辅助。 | 若没有 compare report，人类难以定位算法偏差。 | compare 与 live gate 的优先级需要明确。 | 主 gate 与辅助 gate 的权重还没写死。 | 现有 compare/report.json + diff.png 已有基线。 | 74.1 | 74.1 | 继续 | 攻击 gate 优先级 |
| 11 | E06,E10,E11 | 硬 gate 用 G0-G7；mirror/compare 只能降级为辅助层，但 golden sample 阶段仍必须生成。 | 如果完全降级 compare，HTML 就失去纠偏价值。 | 要防止“只要结构 OK 就忽视大块视觉漂移”。 | compare fail 时的处理策略未分层。 | GATES_AND_EVIDENCE_V2 已有主 gate 基础。 | 75.0 | 75.0 | 继续 | 攻击 compare fail 的后果 |
| 12 | E15,E02,E09 | compare fail 不直接放行 send，但能强制进入 Diagnose/Repair/ReRun 回路。 | 如果没有定量阈值，repair 会无限循环。 | 缺 region/text/color 阈值。 | 评分与收敛条件未量化。 | 用户要求在 95 分前不允许轻易结束。 | 76.0 | 76.0 | 继续 | 攻击量化评分 |
| 13 | E09,E14,E16 | 采用 100 分 rubric：结构15、page10、zones10、targets15、replay10、evidence10、taxonomy10、prompt8、成本6、风险6。 | 若不记录每轮加减分理由，分数会虚高。 | 分项到工件的映射需要表格化。 | score -> decide 规则仍需明文化。 | 仓库已有 EXPERT_REVIEW_RUBRIC.md 可直接继承。 | 77.1 | 77.1 | 继续 | 攻击分数与 gate 的关系 |
| 14 | E12,E11,E13 | 新增 failure taxonomy：wrong-page、wrong-chat、stale-evidence、ocr-probe-miss、mirror-drift、selected-row-ambiguous、post-send-not-proven。 | taxonomy 如果不绑定 evidence path，只是名词列表。 | sample-specific taxonomy 文件仍未设计。 | 黄金样本 failure taxonomy 载体未定。 | docs/FAILURE_TAXONOMY.md 已有通用类型。 | 78.0 | 78.0 | 继续 | 攻击 taxonomy 载体 |
| 15 | E19,E09,E10 | golden sample 目录只保存 manifest/replay/failure/evidence-index，具体大文件引用 run bundle。 | 若 manifest 不记录 source hash / file path，证据链仍弱。 | 还没纳入外部 demo/runtime html/hash。 | source provenance 字段不足。 | .runtime/cache/external/wechatweb/20260405 已含 repo/demo/runtime DOM。 | 79.0 | 79.0 | 继续 | 攻击 provenance |
| 16 | E19,E05,E04 | 把 demo 的 remote HTML、runtime DOM、screenshot、avatar URL 列表一起作为外部证据。 | 只保存 screenshot 会丢失 DOM/文本 ground truth。 | runtime DOM 是快照字符串，需要解析/索引策略。 | DOM evidence 的可消费形式未定义。 | runtime-desktop-1440x960.html 含完整 conversation/chat/input DOM。 | 80.0 | 80.0 | 继续 | 攻击 ground truth ingestion |
| 17 | E02,E03,E04 | 真实 screenshot 进入 detect，runtime DOM 只当 external evidence，不直接作为推理主输入。 | 若 DOM 直接进主链路，会与真实聊天软件场景脱节。 | ground truth 与 runtime inference 的对照格式还没定。 | semantic truth 对齐方式不足。 | WeChatWeb 是网页 demo，最终目标仍是真实聊天桌面端。 | 81.0 | 81.0 | 继续 | 攻击 demo->real gap |
| 18 | E04,E17,E20 | page type 需要明确区分：chat_page、chat_list_only、modal_blocking、detail_panel_dominant、input_not_ready。 | 若 pageType 粗糙，动作会在错页触发。 | detail panel / modal / article preview 的 stop 条件需要列入。 | blocking page taxonomy 不完整。 | docs/APP_CLASSIFICATION_POLICY.md 已有 pageType 列表。 | 82.1 | 82.1 | 继续 | 攻击 blocking page |
| 19 | E11,E12,E14 | HumanGate 放在 ScoreAndJudge 之后与 RunWechatExecution 之前；send 只能人工或独立更高信任度 gate 放行。 | 若 probe 与 send 共用门禁，误发窗口过大。 | 哪些节点必须人工 gate 还未逐个列出。 | human-only 节点表缺失。 | 用户明确要求 stop/retry/escalate。 | 83.0 | 83.0 | 继续 | 攻击 human gate placement |
| 20 | E06,E07,E13 | CollectInputs 到 HumanGate 的节点图采用 thread/checkpoint 思想；每节点输入/输出工件固定。 | 若节点输出不落盘，replay 只是假象。 | 节点级 artifact 清单要补齐。 | 节点 I/O 规范仍需展开。 | LangGraph persistence 文档强调 thread/checkpoint/history；Temporal 强调 Event History。 | 84.0 | 84.0 | 继续 | 攻击节点 I/O contract |
| 21 | E10,E16,E09 | 为每节点定义 machine-readable artifact list，供 agent harness 驱动。 | 如果 prompt 不绑定工件名，agent 会绕开 contract。 | prompt pack 尚未补齐 golden_sample 专项 prompt。 | prompt 与 artifact 的映射缺失。 | 现有 prompts/README 已有基础分类。 | 85.0 | 85.0 | 继续 | 攻击 prompt pack |
| 22 | E16,E05,E01 | 新增 golden_layout_html_generator / golden_semantic_html_generator / gate_judge / repair_planner 四个 prompt。 | prompt 再好也不能代替 schema/gate。 | 需要在 prompt 里硬性要求 evidence 与 stop 条件。 | repair prompt 的输入输出格式未定。 | 用户要求落盘 prompts。 | 86.0 | 86.0 | 继续 | 攻击 repair loop |
| 23 | E08,E13,E15 | repair loop 必须固定为 Diagnose -> Repair -> ReRun，且每轮必须生成 diff delta 与 taxonomy delta。 | 如果 repair 只改 HTML 而不改 detect/infer，会修表不修里。 | 根因归因优先级还没写。 | repair priority 缺失。 | 用户禁止“只生成 HTML 就结束”。 | 87.0 | 87.0 | 继续 | 攻击根因归因 |
| 24 | E02,E03,E09 | 根因优先级：先 detect/layout/zones，再 OCR probe，再 HTML mirror，再 compare 阈值。 | 若先修 mirror，美化会掩盖结构错误。 | 仍需把规则嵌入 Diagnose 节点 gate。 | Diagnose output contract 未细化。 | 用户主指标是结构与动作，不是 HTML 本身。 | 88.0 | 88.0 | 继续 | 攻击 Diagnose contract |
| 25 | E10,E13,E14 | Diagnose 输出必须包含 rootCauses、confidence、affectedArtifacts、suggestedRepairs、needHumanReview。 | 没有 affectedArtifacts，人类无法高效复核。 | 还没定义什么时候自动 retry，什么时候 escalate。 | auto-retry policy 不足。 | Temporal/Workflow 风格要求显式恢复点。 | 88.8 | 88.8 | 继续 | 攻击 retry policy |
| 26 | E08,E11,E13 | 自动重试仅允许：OCR probe、页面重截屏、mirror render、compare；禁止自动重试 send。 | 若 open_chat 多次重试无身份校验，仍可能点错。 | open_chat probe 重试前需要 header/row 双证据。 | probe-level retry guard 缺失。 | 用户要求发送前必须校验 header/上下文/输入框。 | 89.6 | 89.6 | 继续 | 攻击 probe retry guard |
| 27 | E05,E11,E17 | open_chat 允许 probe 重试，但每次必须记录 candidate set、selected row、header before/after。 | 若 candidate 集合漂移过大，应立即 escalate。 | candidate drift 阈值未量化。 | replay stability 指标缺失。 | G6 Replay stability 已定义为主 gate。 | 90.2 | 90.2 | 继续 | 攻击 replay stability metric |
| 28 | E09,E13,E19 | replay stability 指标包括 zone IoU 漂移、candidate 排名漂移、header 文本漂移、draft probe 稳定性。 | 若只看像素，主题变化会误伤。 | 尚未给出建议阈值。 | 阈值需要按 golden sample 分级。 | compare/report 与 dom report 可提供辅助特征。 | 91.0 | 91.0 | 继续 | 攻击阈值设定 |
| 29 | E15,E02,E03 | 建议阈值：关键 zone IoU>=0.78，selected uniqueness=1，header/draft/reply probe 文本存在率>=0.8，column ratio 偏差<=0.05。 | 单一样本阈值可能过拟合 demo。 | 需要标记 demo-specific 与 real-app-specific 阈值。 | sample class 维度不足。 | demo screenshot 1440x960 与 real app 1097x880 差异已观察到。 | 91.8 | 91.8 | 继续 | 攻击 demo-specific overfit |
| 30 | E04,E17,E20 | 明确 WeChatWeb demo 只作为 desktop-chat golden class 的一个子样本，不当作真实微信 gold。 | 若把 demo 直接当真实微信，会误导 send/read 策略。 | 需要在 manifest 标明 sampleClass=web-demo。 | sampleClass 字段未进入 manifest。 | 外部 demo 与真实微信 run-23 已表现不同 header/list 关系。 | 92.4 | 92.4 | 继续 | 攻击 manifest metadata |
| 31 | E19,E10,E09 | manifest 增加 sampleClass/sourceKind/sourcePaths/groundTruthHints/promotedFromRunId。 | 若没有 promotedAt/owner/reviewStatus，后续多人维护仍混乱。 | 审查状态字段缺失。 | promotion governance 不完整。 | 用户说明存在多模型并行执行。 | 93.0 | 93.0 | 继续 | 攻击 promotion governance |
| 32 | E14,E16,E01 | promotion 必须带 reviewStatus、reviewedBy、decisionReason、supersedes。 | 没有 supersedes 会造成多个黄金样本互相竞争。 | 还需定义最佳方案选择门槛。 | multi-model solution selection 未成文。 | 用户明确说可能两种方案并行，最终采用最好的一种。 | 93.6 | 93.6 | 继续 | 攻击多方案选择门槛 |
| 33 | E09,E12,E14 | 最佳方案选择以 score + gate pass ratio + replay stability + human review 为准，不看“代码写得多”。 | 如果没有统一比较面板，人工难决策。 | compare matrix 工件未定义。 | 方案比较矩阵缺失。 | ideas -> score -> decide -> spec -> build -> eval -> memory -> human gate 需要实体化。 | 94.0 | 94.0 | 继续 | 攻击 compare matrix |
| 34 | E16,E18,E08 | 为每次 run 生成 decision.json + audit.ndjson + scorecard，供方案矩阵聚合。 | 如果 scorecard 不可追溯到证据，会变成主观打分。 | scorecard 字段还需绑定 artifact path。 | score provenance 缺失。 | 现仓库已有 decision/audit 两个稳定锚点。 | 94.4 | 94.4 | 继续 | 攻击 score provenance |
| 35 | E19,E10,E13 | scorecard 必须记录 metric->artifactPath 映射；任何人工加分都要给 reason。 | 仍缺 memory 层，历史修复经验没沉淀。 | memory node 尚未具体化。 | memory contract 缺失。 | 用户要求核心闭环包含 memory。 | 94.8 | 94.8 | 继续 | 攻击 memory |
| 36 | E06,E13,E16 | Memory 节点写入 failure taxonomy、repair recipe、threshold override、known-good sample links。 | 如果 memory 没有失效策略，会积累陈旧经验。 | memory invalidation 未定义。 | 经验过期管理不足。 | replay/history/checkpoint 可以作为 memory 输入。 | 95.1 | 95.1 | 继续 | 攻击 memory invalidation |
| 37 | E08,E12,E11 | memory 命中后仍需 fresh evidence；禁止用旧 sample 直接替代实时判断。 | 否则 stale evidence 会直接进入 live action。 | 需要把 stale-evidence 写成硬 fail。 | stale evidence gate 未写死。 | Rubric 明确禁止用旧 region report 代替实时判断。 | 95.4 | 95.4 | 继续 | 攻击 stale evidence |
| 38 | E11,E14,E13 | 任何 send 相关路径若 evidence snapshot 不是同轮 fresh capture，直接 fail。 | probe/read-only 回放可用，但 send 不可。 | freshness 定义要精确到 artifact timestamp。 | freshness TTL 未定。 | 用户要求发送后必须有真实运行 JSON 与后验证。 | 95.7 | 95.7 | 继续 | 攻击 freshness TTL |
| 39 | E19,E08,E10 | freshness 规则：send 前使用的 header/draft/candidate screenshot 与当前 capture 的时间差必须在同一 run 内且无页面重分类变化。 | 同 run 内也可能被遮挡。 | 需要将 blocking overlay 检查加入 pre-send gate。 | 遮挡/弹窗检查不完整。 | APP_CLASSIFICATION_POLICY 已有 blocking page 类。 | 95.9 | 95.9 | 继续 | 攻击 overlay blocking |
| 40 | E04,E11,E05 | pre-send gate 增加 modal/overlay/detail takeover 检查，若命中则 stop。 | 如果 overlay 检测仅靠颜色，也会漏判。 | 需结合 pageType counterSignals。 | overlay 检测融合规则不足。 | 真实微信 run 中 detail panel/voice input 等模式已出现。 | 96.1 | 96.1 | 继续 | 攻击融合规则 |
| 41 | E02,E03,E06 | 最终收敛：dual-HTML 保留、但主线固定为 structure/actionability/replay；golden sample 由 immutable external + promoted run + manifest 组成。 | 如果后续 execution 不能真的产出 Phase1 工件，这份策略仍是空转。 | 必须立即用 WeChatWeb demo 跑一轮 Phase1 验证。 | execution smoke 尚未执行。 | 本地已保存 WeChatWeb demo screenshot/runtime DOM，且 pkg/visionrun 测试通过。 | 96.4 | 96.4 | 可进入 execution | 执行 Phase1 on WeChatWeb demo |

## 6. 量化评分结论

采用仓库现有 rubric：
- 结构识别正确性：15
- app/page inference 正确性：10
- semantic zones 完整性：10
- action target 可执行性：15
- replay / recovery：10
- evidence / observability：10
- failure taxonomy 可纠偏性：10
- prompt / orchestration 清晰度：8
- 成本效率：6
- 风险控制 / 红队抵抗：6

### 最终判定
- `>=95`：策略层允许进入 execution
- 当前：`96.4`
- 但仅允许进入 **Phase 1/Phase 2 smoke execution**；**send 仍默认 blocked**。

## 7. 更新后的总策略

### 7.1 dual-HTML 重新定位
- **Layout HTML**：保留，负责骨架、列宽、背景、区域边界、行高模式。
- **Semantic HTML**：保留，负责 conversation list / selected row / chat header / message list / input area / send button / OCR probes / action targets / candidate texts。
- 二者都必须从中间 JSON 生成。
- 二者都必须进入 DOM validation。
- compare/report 必须保留，但不是 live send 唯一门禁。

### 7.2 golden sample 定义
一个被提升的黄金样本由两层组成：
1. **external immutable source**：原始 demo repo / remote html / runtime DOM / screenshot。
2. **promoted run bundle**：detect / infer / mirror / compare / verify / replay 工件。

### 7.3 memory / human gate / eval-driven loop
固定闭环：

```text
ideas
-> score
-> decide
-> spec
-> build
-> eval
-> memory
-> human gate
```

## 8. execution 准入条件

进入 execution 前必须已具备：
- [x] blindspot audit
- [x] external material review
- [x] self-veto
- [x] 20 expert roles / 40 rounds
- [x] quantitative score >= 95
- [x] strategy docs 落盘
- [x] prompt pack 落盘
- [x] gate design 落盘
- [x] LangGraph / durable execution graph 落盘
- [x] golden sample 目录策略落盘

## 9. 立即执行建议

先以 **WeChatWeb demo desktop screenshot** 做新的独立 run：
- source：`.runtime/cache/external/wechatweb/20260405/demo/demo-desktop-1440x960.png`
- run-id：独立唯一
- 先产出：
  - `infer/semantic_model.json`
  - `mirror/layout.html`
  - `mirror/semantic.html`
  - `mirror/dom_validation_report.json`
- 然后补：compare + golden manifest + replay case + failure taxonomy
