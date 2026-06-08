# GOLDEN_GATES

## 总则

主 gate 仍以 structure-first 为主，但在黄金样本阶段必须补齐 review / replay / promotion gate。

## Gate 列表

### G0 Runtime / Acquisition Preflight
通过条件：
- 目标环境可截图
- OCR provider 可用
- DOM snapshot 可获取（浏览器样本）
- viewport 固定
- 资源加载率达标
- 代理状态记录完整

### G1 Layout Model Gate
通过条件：
- `detect/layout_model.json` 存在
- column topology 合理
- 主区域 bbox 覆盖率合理
- 关键 zone 骨架存在

### G2 Semantic Completeness Gate
通过条件：
- `infer/app_classification.json` 可信
- `infer/zones.json` 完整
- `infer/action_targets.json` 可执行
- `infer/chat_candidates.json` 有唯一或可解释最优候选
- `infer/semantic_model.json` 字段齐全

### G3 Dual-HTML Gate
通过条件：
- `mirror/layout.html`
- `mirror/semantic.html`
- `mirror/dom_validation_report.json`
- HTML 均由中间 JSON 驱动生成
- semantic DOM 结构完整

### G4 Compare Explainability Gate
通过条件：
- `compare/report.json`
- `compare/diff.png`
- DOM / 区域 / 文本 / 颜色 / 像素 diff 均有输出
- 失败能定位到 zone / target / text / layout pattern

### G5 Actionability Gate
通过条件：
- `verify/actionability_report.json`
- open_chat / focus_input / send_message / read_reply 均有 target
- 每个关键 target 有 fallback
- preconditions/postconditions 完整

### G6 Send Safety Gate
通过条件：
- `verify/send_safety_report.json`
- header 身份可信
- input draft 验证可信
- send target 可信
- runtime 与 actionability 均允许 send

### G7 Replay / Recovery Gate
通过条件：
- `checkpoints/current_state.json`
- `replay/replay_result.json`
- `replay/state_transition_log.json`
- `replay/recovery_result.json`
- 支持 stop / retry / escalate

### G8 Golden Promotion Gate
通过条件：
- provenance 完整
- assertion profile 完整
- variance budget 完整
- failure taxonomy 完整
- 人工批准完成

## Gate 规则

- G0/G1/G2/G5/G6/G7 fail：主链路 fail
- G3/G4 fail：不能忽略，至少 warn；若无法帮助诊断则视为设计缺陷
- G8 未过：样本只能作为 candidate，不能进入回归基线

## Pass / Warn / Fail 语义

- `pass`: 允许进入下一阶段
- `warn`: 只允许 probe，不允许 send / promote
- `fail`: 必须 stop 或进入 repair
