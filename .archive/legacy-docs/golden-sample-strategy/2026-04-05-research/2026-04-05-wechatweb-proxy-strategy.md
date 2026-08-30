# 2026-04-05 WeChatWeb Proxy Golden Sample Strategy

## 1. Strategy decision
本轮 strategy_review 的最终结论：

1. **采用 online demo -> 代理抓取 -> 本地镜像 -> 本地截图 -> structure-first 推理** 的主链。
2. **双层 HTML 保留，但降级为高价值诊断/回归层，不是最终门禁**。
3. **主 gate 仍是结构识别、动作可执行性、send safety、replay/recovery**。
4. **先用 WeChatWeb demo 做高可信黄金样本，再把同一架构迁移到真实微信**。
5. **为了避免与另一模型或当前脏工作区冲突，所有新增工件放入全新目录，不覆盖现有 round-19~23 工件。**

推荐新增目录：

```text
artifacts/fixtures/golden-samples/wechatweb-demo-proxy-20260405/
docs/golden_sample_strategy/
scripts/golden_sample/
```

推荐 run-id：

```text
gs-wechatweb-demo-proxy-20260405
```

## 2. Anti-conflict / anti-overwrite policy

- 不改现有 `artifacts/runs/round-*` 目录。
- 不复用已有 run-id。
- 新文档统一落在 `docs/golden_sample_strategy/`。
- 新 prompt 不改现有 prompt pack，只新增文件。
- 新脚本放在 `scripts/golden_sample/`，不覆盖现有脚本。
- 黄金样本目录与运行目录分离：
  - `artifacts/fixtures/golden-samples/...` 保存来源、清单、回放用索引。
  - `artifacts/runs/<run-id>/...` 保存 detect/infer/verify/replay 过程工件。

## 3. Why not HTML-first only

被否决方案：

### 3.1 HTML-first only
- 优点：可视化强，便于人工审查。
- 缺点：容易“看起来像理解了”，但并不能证明 selected row 唯一、send target 可执行、reply readback 正确。
- 结论：**拒绝作为主链**。

### 3.2 Screenshot + OCR only
- 优点：实现快。
- 缺点：whole-window OCR 容易把左侧摘要、顶部 header、右侧消息串起来，导致假阳性。
- 结论：**拒绝作为主链**。

### 3.3 DOM-first only without capture provenance
- 优点：结构化强。
- 缺点：如果没有来源截图、资源清单、窗口尺寸与网络证据，后续 replay 和人工审查无法复现。
- 结论：**拒绝**。

### 3.4 Chosen approach
- online demo 通过 **本地 HTTP 代理** 拉取完整资源；
- 保留 **原始截图 + 本地镜像页面 + 结构 JSON + 双层 HTML + compare/diff + replay artifacts**；
- 用 **LangGraph/Temporal 风格的 durable execution 思想** 组织节点、checkpoint、repair 与 human gate。

## 4. Refreshed blindspots

| ID | Blindspot | Why it matters | Strategy action |
|---|---|---|---|
| GS-B01 | 把 layout.html 当“理解完成” | 会导致错误收敛 | 明确降级为诊断层 |
| GS-B02 | 资源镜像不完整 | 字体/头像缺失会污染 compare | 保存 HTML/JS/CSS/font/avatar manifest |
| GS-B03 | compare 没有 mirror.png | 无法形成视觉 diff 回路 | 先渲染 layout.html，再执行 compare |
| GS-B04 | selected row 不唯一 | 真实发送会误投 | DOM validation + actionability 必须硬性校验 |
| GS-B05 | reply probe 读取左栏摘要 | 会把摘要误判为回复 | 只允许 message_list local probe |
| GS-B06 | send side effect 无 durable 设计 | retry 可能重复发送 | send 节点默认人工 gate，直到真实样本通过 |
| GS-B07 | 多模型并发写工件 | 会造成样本污染 | 新 run-id + 独立目录 |
| GS-B08 | demo 样本代表性外推过度 | 会高估真实微信成功率 | 明确 demo 仅作黄金样本，不证明真实发信 |

## 5. External material review and impact

### 5.1 LangGraph durable execution
来源：官方 LangGraph 文档（durable execution）指出：
- durable execution 依赖 **checkpointer**、**thread identifier**、**deterministic replay**；
- side effects 和 non-deterministic operations 需要封装为 task；
- resuming 不是从同一行代码继续，而是从可重放的起点继续。

工程影响：
- 我们的 `send_message`、`capture_source`、`mirror_render`、`reply_readback` 都应被视为可恢复节点；
- `current_state.json` 不能只是快照文件名，必须描述 **可恢复节点**；
- 真实 side effect（send）必须具备 idempotency-style guard 和人工 gate。

### 5.2 Temporal workflow docs
来源：Temporal 官方 workflows 文档指出：
- workflow execution 是代码驱动的长期执行单元；
- workflow 是 resilient 的，可在底层基础设施失败后恢复；
- execution 通过 **Event History** 前进；
- deterministic constraints 是一致 replay 的前提。

工程影响：
- `replay/state_transition_log.json` 应成为 mini event history；
- `failure taxonomy` 不能只描述错误，要能驱动 `resume_from / retry / escalate`；
- 我们的 graph spec 需要把 **history / resume / repair** 明确到节点。

### 5.3 Playwright screenshots + trace viewer
来源：Playwright 官方文档说明：
- 支持 page screenshot、full-page screenshot、element screenshot；
- tracing 可以记录 screenshots、snapshots、console、network；
- trace/snapshot 非常适合定位“为何这一步失败”。

工程影响：
- 黄金样本 capture 阶段至少保留：screenshot、rendered DOM、network request log；
- compare 前优先使用 **element/稳定 viewport screenshot**；
- 后续真实自动化阶段可用 trace 扩展动作级证据。

## 6. Golden sample contract

### 6.1 Required package
每个黄金样本至少具备：

1. 原始截图
2. 结构 JSON
3. Layout HTML
4. Semantic HTML
5. DOM validation report
6. compare / diff report
7. replay case
8. failure taxonomy
9. evidence bundle

### 6.2 Concrete directory contract

```text
artifacts/fixtures/golden-samples/wechatweb-demo-proxy-20260405/
  source_site/
    site_root/
      WeChatWeb/
      __mirror__/cdn.v2ex.com/
    source_manifest.json
  capture/
    source.png
    rendered_dom.html
    network_requests.json
    console.log
  golden_sample_manifest.json
  replay_case.json
  failure_taxonomy.json
  evidence.json
```

而运行生成的结构工件放入：

```text
artifacts/runs/gs-wechatweb-demo-proxy-20260405/
  capture/source.png
  detect/regions.json
  detect/layout_model.json
  infer/app_classification.json
  infer/zones.json
  infer/action_targets.json
  infer/chat_candidates.json
  infer/semantic_model.json
  mirror/layout.html
  mirror/semantic.html
  mirror/dom_validation_report.json
  mirror/mirror.png
  compare/report.json
  compare/diff.png
  verify/actionability_report.json
  verify/send_safety_report.json
  checkpoints/current_state.json
  replay/replay_result.json
  replay/state_transition_log.json
```

## 7. Gate design

| Gate | Purpose | Pass | Warn | Fail | Repair |
|---|---|---|---|---|---|
| G0 Capture provenance | 来源可信、代理抓取成功、窗口尺寸固定 | screenshot+manifest+network齐 | screenshot有，network缺 | 资源缺失/窗口不稳定 | 重抓/固定窗口 |
| G1 Structure detect | regions/layout_model 合理 | 主列/主区齐全 | 局部区域边界偏差 | 关键主区缺失 | 调参数重跑 detect |
| G2 Semantic model | semantic_model 可驱动双层 HTML | zone/target/probe 齐 | probe 文本缺失 | 必需 zone 缺失 | 修 infer/zones/targets |
| G3 DOM validation | DOM 字段完整 | selected 唯一/zone齐 | 候选去重不足 | selected 非唯一 | 修 semantic_model 生成 |
| G4 Compare validation | 发现视觉与骨架偏差 | frame similarity 达标 | 辅助层轻微偏差 | 大面积偏差 | 重新渲染 mirror / 修 detect |
| G5 Actionability | open/focus/send/read 可执行 | canProceed=true | canProceed=true 但 canSend=false | 关键 target 缺失 | 修 action target / OCR probe |
| G6 Send safety | 真实发送保护 | 仅真实微信阶段通过 | probe-only | 默认 block | 人工确认/补证据 |
| G7 Replay | resume/retry/escalate 可用 | current_state + replay ok | drift 可恢复 | 无法恢复 | 修 checkpoint / repair policy |
| G8 Human gate | 防止过度外推 | demo->real 迁移批准 | 待更多样本 | 拒绝迁移 | 补真实样本 |

## 8. LangGraph / durable execution mapping

执行图 JSON 已落盘：
- `docs/golden_sample_strategy/2026-04-05-langgraph-execution-graph.json`

设计原则：
- capture、mirror_render、compare、actionability、send_safety、replay 都是显式节点；
- 每个节点写明 inputs / outputs / gates / repair / autoRetry / humanGateRequired；
- `RunWechatExecution`、`VerifyPostSend`、`ReadReply` 默认人工 gate；
- demo 阶段只构建到 verify/replay，不默认真实发送。

## 9. Execution plan

### Phase 1
先补：
- `infer/semantic_model.json`
- `mirror/layout.html`
- `mirror/semantic.html`
- `mirror/dom_validation_report.json`

### Phase 2
再补：
- `infer/chat_candidates.json`
- `verify/actionability_report.json`
- `verify/send_safety_report.json`

### Phase 3
再进入真实微信脚本：
- 找对话
- 打开对话
- 输入
- 发送
- post-send verify
- read reply

## 10. Quantitative scorecard

| Dimension | Weight | Score |
|---|---:|---:|
| Golden sample provenance | 15 | 14 |
| JSON / schema contract | 15 | 15 |
| Dual HTML diagnostic value | 10 | 9 |
| Gate completeness | 15 | 15 |
| Durable execution / replay | 15 | 14 |
| Failure taxonomy / repair loop | 10 | 9 |
| Anti-conflict / artifact isolation | 10 | 10 |
| Migration path to real WeChat | 10 | 9 |
| Total | 100 | **95.6** |

## 11. Final decision

**允许进入 execution，但仅限：**
- proxy 镜像 online demo；
- 构建黄金样本目录；
- 运行 Phase 1 / Phase 2 工件生成；
- 生成 compare/diff、actionability、send_safety、replay 工件；
- 暂不把 demo 样本视为真实微信发送通过凭证。
