# Golden Sample Strategy Review — 2026-04-05

## 0. Metadata
- Workspace: `/Users/a0000/Documents/workspace/testMonkey-go`
- Mode: `golden_sample_strategy -> execution`
- Isolation namespace: `docs/strategy/2026-04-05-golden-sample/` and `prompts/strategy/2026-04-05/`
- Parallel-work rule: do not overwrite root strategy docs or another model's run directory.

## 1. Final decision
保留 dual-HTML，但把它降级为 **中间证据层**。真正的主链路是：

```text
真实截图/真实样本
-> detect + infer contracts
-> semantic model
-> layout HTML + semantic HTML
-> DOM/区域/文本/颜色布局/像素辅助比较
-> 评分与差异定位
-> Diagnose / Repair / ReRun
-> 通过后再进入真实自动化
```

## 2. Why this revision
仓库已经有 structure-first 雏形，但仍缺：
1. 正式 golden sample 机制与 registry。
2. LangGraph / durable execution 节点图。
3. 节点级 gate / repair / retry / human gate。
4. 20 专家、40 轮、量化评分的 strategy-review 落盘。
5. 对用户要求路径的契约对齐：`infer/semantic_model.json`、`mirror/layout.html`。
6. compare 的多维子评分体系。

## 3. Current repo baseline
### Already present
- `cmd/visionrun/main.go`
- `pkg/visionrun/detect.go`
- `pkg/visionrun/infer.go`
- `pkg/visionrun/mirror.go`
- `pkg/visionrun/mirror_dom_validate.go`
- `pkg/visionrun/chat_candidates.go`
- `pkg/visionrun/send_safety.go`
- `pkg/visionrun/replay_state.go`
- smoke runs under `artifacts/runs/round-20-*` to `round-23-*`

### Still missing or misaligned
- `mirror/index.html` should become canonical `mirror/layout.html`
- `mirror/semantic_model.json` should be promoted to canonical `infer/semantic_model.json`
- compare/report is still too pixel/frame oriented
- real send prototype is not yet bound to the artifact-driven durable flow

## 4. External reference environment captured
为避免只在抽象层争论，本轮已捕获外部参考环境：
- repo clone: `artifacts/external/wechatweb-ref-20260405/repo/`
- proxied remote HTML: `artifacts/external/wechatweb-ref-20260405/demo/index.remote.html`
- runtime DOM: `artifacts/external/wechatweb-ref-20260405/demo/runtime-desktop-1440x960.html`
- desktop screenshot: `artifacts/external/wechatweb-ref-20260405/demo/demo-desktop-1440x960.png`
- network log: `artifacts/external/wechatweb-ref-20260405/demo/network-requests.json`
- avatar cache: `artifacts/external/wechatweb-ref-20260405/demo/avatars/`
- manifest: `artifacts/external/wechatweb-ref-20260405/manifest.json`

### Capture choice
- proxy: `http://127.0.0.1:1087`
- strategy: keep **both** source clone and runtime snapshot
- role: bootstrap reference only, not a real WeChat send-approval sample

## 5. External materials summary
- **LangGraph**: durable execution needs persistence/checkpoints, stable thread ids, and careful handling of side effects.
- **Temporal**: durable workflows should survive failure and isolate retries in the right layer instead of burying them inside ad hoc scripts.
- **OpenAI trace grading / evals**: structured traces should localize where the agent failed, not only whether the final answer passed.

## 6. Self-denial
本策略明确否决 4 条捷径：
1. HTML-only
2. pixel-only
3. OCR-only
4. script-only

## 7. 20-expert roster
- A1 系统架构师
- A2 视觉布局分析师
- A3 OCR 可靠性工程师
- A4 DOM/HTML 镜像工程师
- A5 微信交互域专家
- A6 安全/风险评审官
- A7 Replay/Recovery 工程师
- A8 LangGraph 编排工程师
- A9 Temporal 可靠性架构师
- A10 Eval/Benchmark 负责人
- A11 Tool Governance 负责人
- A12 Human Gate 审核官
- A13 数据契约负责人
- A14 红队/欺骗分析师
- A15 Actionability 工程师
- A16 Compare 指标分析师
- A17 Runtime/TCC 预检工程师
- A18 Memory/Trace 分析师
- A19 前端参考样本策展人
- A20 Agent Harness 负责人

## 8. Quantitative result
- start score: 60.0
- exit threshold: 95.0
- final score after 46 rounds: 97.6
- decision: **允许退出 strategy_review，进入 execution Phase 1**
- hard restriction: **send 默认继续关闭，直到 Phase 2 gate 通过**

## 9. Final architecture choice
### Core loop
```text
ideas -> score -> decide -> spec -> build -> eval -> memory -> human gate
```

### Durable execution choice
- execution graph follows a LangGraph-shaped local orchestration
- recovery/retry semantics borrow Temporal-style workflow/activity separation
- screenshot / OCR / click / type / send / read_reply all become explicit side-effect boundaries

### Dual-HTML choice
- `layout.html`: 只表达布局骨架
- `semantic.html`: 只表达语义层、candidate、target、probe、selected row
- source of truth remains JSON contracts, not HTML

## 10. Rejected alternatives
1. 删除 HTML：拒绝，因为它仍有诊断价值。
2. 让 HTML 成为主工件：拒绝，因为它仍是派生物。
3. 直接把 WeChatWeb 当黄金样本：拒绝，因为它只是 web reference。
4. 现在就直奔真实发送：拒绝，因为 Phase 1 路径对齐与 compare v2 尚未完成。

## 11. Execution entry conditions
- blindspot audit 明确
- 外部资料检索完成
- 自我否决完成
- 20 专家 / 46 轮攻防已落盘
- 分数超过 95
- docs/prompts/graph/gates/golden sample spec/handoff 全部落盘
- 外部参考环境已采集

## 12. First execution target
只允许先做：
1. `infer/semantic_model.json`
2. `mirror/layout.html`
3. `mirror/semantic.html`
4. `mirror/dom_validation_report.json`
5. send 继续保持关闭
