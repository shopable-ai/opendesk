# WECHAT_COMPLETE_SOLUTION_FRAMEWORK

## 1. 核心解决思路

本项目的正确主线，不应该再是“在真实微信里长时间连续试错”，而应该是：

```text
黄金样本提取
-> baseline JSON
-> 运行时 screenshot 识别
-> runtime snapshot JSON
-> structural / semantic compare
-> 小区域单步验证
-> 渐进式动作放开
-> replay / taxonomy / evidence
```

核心思想只有 6 条：

1. 结构先行，不以整图相似度为主 gate
2. 动作目标不是裸坐标，而是带证据、带验证、带 fallback 的 target
3. 先做 baseline compare，再做真实动作
4. 真实 GUI 只做最终验证，不做主要调试场
5. 每一步都必须 fresh screenshot + fail-fast
6. send 默认冻结，只有所有前置 gate 通过才允许单独评估

## 2. 执行大纲

建议执行顺序固定为：

### Phase A: 黄金样本提取

从已有黄金样本目录中提取：

- `golden_layout_baseline.json`
- `golden_semantic_baseline.json`

输入来源：

- `mirror/layout.html`
- `mirror/semantic.html`
- `infer/zones.json`
- `infer/action_targets.json`

### Phase B: 运行时归一化

对 fresh screenshot 识别结果输出：

- `runtime_layout_snapshot.json`
- `runtime_semantic_snapshot.json`

### Phase C: compare gate

先比较：

- zones completeness
- bbox ratio delta
- background color delta
- target-zone binding
- capture relocation
- header / input / message / conversation plausibility

结论分三类：

- `pass`
- `warn`
- `fail`

### Phase D: 单步验证

只在 compare 通过后验证：

- `locate_search_area`
- `locate_conversation_list`
- `open_chat`
- `verify_chat_header`
- `focus_input`
- `read_reply`

### Phase E: 渐进组合

只允许按这个阶梯放开：

1. `open_chat`
2. `open_chat + verify_chat_header`
3. `open_chat + verify_chat_header + focus_input`
4. `read_reply`
5. `send_message` 继续冻结

## 3. 已验证的关键经验

下面这些不是假设，而是当前仓库和最近执行中已经验证过的经验：

1. `layout_model -> app/page inference -> zones -> action_targets` 这条结构主链是正确的
2. `mirror / compare` 不应作为唯一 gate，但 HTML 仍然适合做 baseline 提取来源
3. send 必须 fail-close，当前 `sendAllowed=false` 是正确状态
4. 真实执行必须 fail-fast，前台窗口变化、模板逃逸、header 校验失败都必须立刻 stop
5. worker 不能继续堆在单文件，已经拆分成 `examples/mac/wechat_steps/*.js`
6. macOS Retina 小区域截图会返回 2x 像素尺寸，必须先归一化再做模板匹配
7. search flow 是当前真实动作链最主要瓶颈，不是布局识别本身
8. 黄金样本当前仍缺少统一 baseline JSON，这就是下一步最重要的补位

## 4. 当前已经执行的正确拆分方向

下面这组拆分已经是当前正确方向，应保留并继续扩展，而不是回退到单文件：

- `examples/mac/wechat_steps/00_window_guard.js`
- `examples/mac/wechat_steps/10_capture_helpers.js`
- `examples/mac/wechat_steps/20_template_relocate.js`
- `examples/mac/wechat_steps/30_search_flow.js`
- `examples/mac/wechat_steps/40_open_chat.js`
- `examples/mac/wechat_steps/50_focus_input.js`
- `examples/mac/wechat_steps/60_send_guard.js`
- `examples/mac/wechat_steps/70_read_reply.js`
- `examples/mac/wechat_steps/main.js`

拆分原则：

1. 主入口只组装，不承载细节
2. 单步能力独立，可单独验证
3. 调试策略不固化进 Go 主链
4. 真实动作和 baseline compare 解耦
5. 每个高风险动作都要有 stop / retry / escalate 结果

## 5. 目标

本文件用于把当前仓库中与微信 GUI agent 相关的经验、产物、失败教训、架构约束和下一步完整方案统一沉淀下来，避免后续执行继续以零散试错为主。

目标不是“再写一个脚本”，而是建立一条稳定主链：

```text
golden baseline extraction
-> runtime snapshot normalization
-> structural / semantic compare
-> small-region validation
-> progressive guarded actions
-> replay / taxonomy / evidence
```

## 6. 当前仓库里已经存在的有效资产

### 2.1 黄金样本 / Phase 1 候选

目录：

- `artifacts/golden-samples/wechat/wechatweb-bootstrap-phase1-candidate-20260405/`

已存在关键产物：

- `capture/source.png`
- `detect/regions.json`
- `detect/layout_model.json`
- `infer/app_classification.json`
- `infer/zones.json`
- `infer/action_targets.json`
- `infer/ocr_map.json`
- `infer/semantic_model.json`
- `mirror/layout.html`
- `mirror/semantic.html`
- `mirror/dom_validation_report.json`
- `verify/actionability_report.json`
- `manifest.json`

事实：

- 当前样本是 `candidate`
- `phase1=pass`
- `phase2=not_ready`
- 还没有冻结成 full golden sample

### 2.2 当前运行链中最有价值的真实产物

目录：

- `artifacts/runs/codex-audit-send8/`

关键文件：

- `run_report.json`
- `infer/zones.json`
- `infer/action_targets.json`
- `verify/capture_contract.json`
- `verify/actionability_report.json`
- `realapp/validation_report.json`

事实：

- `goldenPassed=true`
- `realScreenshotValidationPassed=true`
- `actionStageAllowed=true`
- `sendAllowed=false`

### 2.3 已有核心设计文档

- `docs/WECHAT_STRUCTURED_SEND_V2.md`
- `docs/EXECUTION_FAILURE_CASES.md`
- `docs/ACTION_TARGET_MODEL.md`
- `docs/GATES_AND_EVIDENCE_V2.md`
- `docs/STRUCTURE_FIRST_EXECUTION.md`
- `docs/strategy/2026-04-05-golden-sample/06_execution_handoff.md`

## 7. 当前可复用经验总结

### 3.1 已验证正确的方向

1. 结构先行是对的
   - 当前仓库已明确 `layout_model -> app/page inference -> zones -> action_targets` 是主链
   - `mirror / compare` 不应继续作为唯一主 gate

2. 动作目标不能是裸坐标
   - `ACTION_TARGET_MODEL.md` 已经给出正确抽象：target 必须包含 evidence / fallbacks / preconditions / postconditions / riskLevel

3. send 必须 fail-close
   - 历史设计和当前产物都明确：send 不允许盲重试
   - `sendAllowed=false` 是当前正确状态

4. 真实执行必须 fail-fast
   - 当前已经在 worker 层验证：前台窗口变化、模板逃逸、header 校验失败都应立即 stop

### 3.2 已暴露出来的问题

1. worker 长期过载在单文件中
   - 之前 `examples/mac/wechat_structured_send_v2.js` 单文件超过 800 行
   - 当前已拆分为 `examples/mac/wechat_steps/*.js`

2. 真实 GUI 上持续试错太慢
   - 识别、截图、OCR、搜索、前台窗口守卫叠加后，单轮耗时过长
   - 容易受人工鼠标操作影响

3. 黄金样本还没有被提炼成统一 baseline JSON
   - 当前有 HTML、zones、action_targets，但还缺少稳定 compare 所需的统一结构基准

4. search flow 仍是主要瓶颈
   - 真实环境中 `locate_search_area` / `locate_conversation_list` 已经显著收敛
   - 当前真正阻塞已经收缩到“搜索结果列表的目标会话识别和点击”

## 8. 从已有黄金样本中应提取什么

不能再只把 `layout.html` / `semantic.html` 当成展示层。应从黄金样本中提取两份标准化 baseline。

### 4.1 `golden_layout_baseline.json`

只保留结构骨架与视觉框架：

- screen size
- zones
- zone bbox
- zone bbox ratio
- zone background color
- major separators
- panel topology
- key region hierarchy

建议字段：

```json
{
  "baselineId": "",
  "sourceRunId": "",
  "screen": { "width": 0, "height": 0 },
  "zones": [
    {
      "id": "",
      "role": "",
      "bbox": { "x": 0, "y": 0, "width": 0, "height": 0 },
      "bboxRatio": { "x": 0, "y": 0, "width": 0, "height": 0 },
      "backgroundColor": "",
      "confidence": 0,
      "requiredForAction": []
    }
  ],
  "topology": {
    "columns": [],
    "bands": []
  }
}
```

### 4.2 `golden_semantic_baseline.json`

只保留可动作语义和约束：

- action targets
- target zone binding
- candidate row layout
- fallback graph
- preconditions
- postconditions
- high-risk constraints
- capture refs / anchor refs

建议字段：

```json
{
  "baselineId": "",
  "targetApp": "WeChat",
  "pageType": "chat_page",
  "actionTargets": [],
  "captureRefs": [],
  "criticalGuards": {
    "sendDisabledByDefault": true,
    "headerMustMatchBeforeInput": true,
    "focusMustBeVerifiedBeforeDraft": true
  }
}
```

## 9. 运行时应输出什么

真实截图识别后，必须输出与 baseline 同构的数据，而不是直接进入动作：

### 5.1 `runtime_layout_snapshot.json`

- fresh screenshot derived zones
- bbox ratios
- dominant colors
- region confidence
- layout anomalies

### 5.2 `runtime_semantic_snapshot.json`

- inferred action targets
- capture relocation result
- OCR row/header evidence
- search result candidate set
- risk flags

## 10. 新主 gate：先 compare，再动作

### 6.1 结构 compare

比较维度：

- zone completeness
- zone bbox ratio delta
- background color delta
- parent/child topology
- overlap / missing / spill

输出：

- `compare/structural_report.json`

### 6.2 语义 compare

比较维度：

- target zone membership
- capture ref relocatability
- candidate count sanity
- header strip plausibility
- input area plausibility
- message list plausibility

输出：

- `compare/semantic_report.json`

### 6.3 gate 规则

1. compare fail
   - 只允许 stop 或修识别
   - 不允许进入真实点击

2. compare warn
   - 只允许 probe 和单步验证
   - 不允许 send

3. compare pass
   - 才允许进入 `open_chat -> verify_chat_header -> focus_input -> read_reply`

## 11. 动作执行梯度

动作仍然必须按梯度放开：

1. `locate_search_area`
2. `locate_conversation_list`
3. `open_chat`
4. `open_chat + verify_chat_header`
5. `open_chat + verify_chat_header + focus_input`
6. `read_reply`
7. `send_message` 仍然单独冻结

规则：

- 每一步都基于 fresh screenshot
- 每一步失败都必须输出 taxonomy
- 绝不允许越过 header verify 去执行后续动作

## 11A. Frozen Desktop Golden Promotion 主线

当前仓库已经有：

- `dev_reference` candidate
- run-scoped `desktop_reference`
- run-scoped `desktop_action`

但这三者都不等于正式 frozen desktop golden。

正确 promotion 主线应固定为：

```text
run-scoped desktop baseline
-> schema non-null audit
-> capture contract completion
-> compare report completion
-> send safety explicit freeze/pass
-> human review
-> promote to artifacts/golden-samples/wechat/<sample-id>-frozen/
```

### 11A.1 Promotion 前必须满足

1. baseline JSON 字段非空
2. runtime guards 字段非空
3. `capture_contract.json` 完整
4. `compare/summary_report.json` 可解释且含 hard gates
5. `failure_taxonomy.json` 已存在
6. `send_safety_report.json` 已显式声明 send 状态
7. reviewer / reviewedAt / promotionDecision 已写入 manifest

### 11A.2 Promotion 后才允许说“冻结样本”

只有当样本已经脱离 `artifacts/runs/...`，进入独立目录：

- `artifacts/golden-samples/wechat/<sample-id>-frozen/`

并且带上：

- baseline
- verify
- compare
- replay
- failure
- evidence

才允许把它当作真正的 frozen desktop golden 使用。

### 11A.3 Promotion 后的用途边界

- `desktop_reference frozen`
  - 可作为动作前结构/语义 gate 的稳定参考
  - 不能自动推出 send 放开
- `desktop_action frozen`
  - 可作为同窗口/同几何条件下的强动作参考
  - 仍需 `sameWindow + geometryHash + maxAgeMs` 才允许进入动作链

### 11A.4 当前仓库的明确结论

截至当前审查：

- `artifacts/golden-samples/wechat/wechatweb-bootstrap-phase1-candidate-20260405/` 仍是 candidate
- `artifacts/runs/codex-audit-send8-real/desktop-baseline/` 只能算 run-scoped `desktop_reference`
- `artifacts/runs/codex-audit-send8/desktop-baseline/` 只能算 run-scoped `desktop_action`

因此：

- 当前仓库**没有正式 frozen 的 WeChat desktop golden**
- 当前仍应优先补 promotion，而不是继续扩大真实动作范围

更新：

- 当前仓库已补出 frozen `desktop_action` 样本
- 当前仓库已补出 frozen `desktop_reference` 样本
- 当前仓库已建立 `artifacts/golden-samples/wechat/registry.json`
- 当前仓库已建立 `scripts/validate_wechat_frozen_samples.py`

因此下一阶段的主线已从“先定义 frozen”进入“基于 frozen 样本约束后续实现与验证”。

## 12. worker 侧结构原则

当前已经执行的正确拆分方向：

- `examples/mac/wechat_steps/00_window_guard.js`
- `examples/mac/wechat_steps/10_capture_helpers.js`
- `examples/mac/wechat_steps/20_template_relocate.js`
- `examples/mac/wechat_steps/30_search_flow.js`
- `examples/mac/wechat_steps/40_open_chat.js`
- `examples/mac/wechat_steps/50_focus_input.js`
- `examples/mac/wechat_steps/60_send_guard.js`
- `examples/mac/wechat_steps/70_read_reply.js`
- `examples/mac/wechat_steps/main.js`

原则：

- 主入口只组装
- 单步逻辑独立
- 调试便利不能固化进 Go 主链
- 真实 GUI 逻辑必须与 baseline compare 解耦

## 13. 历史失败案例提炼

来自 `docs/EXECUTION_FAILURE_CASES.md` 的核心经验：

1. activeWindow 可能漂移到浏览器
   - 结论：动作前必须检查前台窗口与 bounds

2. 副屏 / 负坐标窗口导致 clip 失真
   - 结论：必须记录 display scale / logical vs pixel coordinates

3. targetChatName 明确时仍可能误点
   - 结论：open_chat 只能在目标名已消歧时执行

4. 旧 region_map 对窗口变化脆弱
   - 结论：region_map 只能是辅助，不是唯一 gate

新增经验：

5. macOS Retina `clip` 返回 2x 像素尺寸
   - 结论：worker 小区域截图必须统一做 logical-size normalization

6. template match 逃逸 searchWindow
   - 结论：模板命中坐标必须校验是否仍在搜索窗内

## 14. 顶级 AI 公司公开方案的可借鉴点

以下是基于公开资料的工程归纳，不是逐字照搬。

### 10.1 OpenAI CUA / Operator

公开信息强调：

- advanced GUI grounding
- structured problem-solving
- adaptive self-correction
- sensitive action gating
- human oversight

工程结论：

- GUI agent 不能只靠单次 perception
- 必须用 observation -> decision -> action -> verification 闭环
- 高风险动作必须强制单独 gate

公开来源：

- https://openai.com/index/computer-using-agent/
- https://openai.com/index/operator-system-card/

### 10.2 Anthropic Computer Use

公开信息强调：

- agent loop
- tool execution after model decision
- bounded autonomy
- environment isolation

工程结论：

- 不应在一个超长脚本里把所有动作一次性跑完
- 每一步都要把结果回传给 planner / judge

公开来源：

- https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool

### 10.3 Google Project Mariner

公开信息强调：

- observes
- plans
- acts
- user remains in control

工程结论：

- compare / review 层必须存在
- 真实用户界面动作应该只在计划足够可信时发生

公开来源：

- https://deepmind.google/models/project-mariner/
- https://blog.google/innovation-and-ai/models-and-research/google-deepmind/google-gemini-ai-update-december-2024/

## 15. 推荐的完整解决方案

### 11.1 主线

```text
golden sample assets
-> baseline extractor
-> golden_layout_baseline.json + golden_semantic_baseline.json
-> runtime snapshot builder
-> runtime_layout_snapshot.json + runtime_semantic_snapshot.json
-> compare gate
-> single-step validation
-> progressive guarded actions
-> evidence / replay / taxonomy
```

### 11.2 为什么这比当前真实 GUI 调试更优

1. 识别问题前移到离线 compare
2. 真实 GUI 只承担最终验证，不再承担主调试职责
3. 专家讨论可以直接围绕 baseline schema / compare thresholds / gate policy 展开
4. 经验可沉淀到 JSON contract 和文档，不再依赖口头传递

## 16. 专家讨论建议议题

建议后续多专家评审时，聚焦这些问题：

1. `golden_layout_baseline.json` 的字段是否足够表达结构约束
2. `golden_semantic_baseline.json` 是否应包含更多 action safety 规则
3. compare 阈值如何分 `strict` / `soft`
4. 哪些 zone 允许 soft pass
5. search result row 的 OCR 匹配应采用什么评分函数
6. 哪些失败必须 `stop`
7. 哪些失败可以 `retry`
8. 哪些失败必须 `escalate`
9. send 的唯一放开条件是什么
10. replay / memory 是否应在动作层之前就纳入

## 17. 下一步落地建议

优先级顺序：

1. 实现 `golden baseline extractor`
2. 定义 `runtime snapshot` schema
3. 实现 `structural compare` 和 `semantic compare`
4. 让 compare gate 成为真实动作的前置条件
5. 再继续修 search result row 识别

### 当前不该继续做的事

- 不应继续把识别问题主要放在真实 GUI 上调
- 不应直接放开 `focus_input`
- 不应直接放开 `send_message`
- 不应再把 HTML 仅当展示层

## 18. 当前状态一句话总结

当前仓库已经具备黄金样本、结构识别、动作目标、capture contract、真实验证和 worker 拆分这些基础，但还缺少一个统一的 baseline extraction + compare gate 层。这个层补齐后，整个系统才会从“零散修补”进入“可沉淀、可专家评审、可持续迭代”的状态。
