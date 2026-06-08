# LANGGRAPH_EXECUTION_GRAPH

## 目标

定义 durable execution 图，确保黄金样本、真实执行、回放与修复都能 checkpoint、resume、retry、escalate。

## 节点图

```text
CollectInputs
-> AcquireBrowserState
-> BuildGoldenSample
-> GenerateStructureJSON
-> GenerateSemanticModel
-> GenerateLayoutHTML
-> GenerateSemanticHTML
-> RunDOMValidation
-> RunCompareValidation
-> ScoreAndJudge
-> Diagnose
-> Repair
-> ReRun
-> BuildExecutionArtifacts
-> RunWechatExecution
-> VerifyPostSend
-> ReadReply
-> RecordReplayAndMemory
-> HumanGate
```

## 节点定义

### 1. CollectInputs
输入：需求、目标 chat、样本源、viewport、proxy 配置
输出：requirement.json、provenance 初稿
Gate：输入完整性
失败修复：补 requirement / 参数
自动重试：否
人工 gate：否

### 2. AcquireBrowserState
输入：样本源 URL / 本地副本、viewport、proxy
输出：`capture/source.png`、`capture/dom_snapshot.json`、`capture/a11y_snapshot.json`
Gate：G0
失败修复：重载页面、等待资源、切换代理、固定 viewport
自动重试：是（有限次）
人工 gate：否

### 3. BuildGoldenSample
输入：capture 层工件
输出：golden skeleton、provenance、assertion seed
Gate：样本可归档性
失败修复：补元数据
自动重试：否
人工 gate：否

### 4. GenerateStructureJSON
输入：source.png
输出：`detect/regions.json`、`detect/layout_model.json`
Gate：G1
失败修复：调布局检测 / 重采样
自动重试：是
人工 gate：否

### 5. GenerateSemanticModel
输入：detect + DOM + OCR
输出：`infer/app_classification.json`、`infer/zones.json`、`infer/action_targets.json`、`infer/chat_candidates.json`、`infer/ocr_map.json`、`infer/semantic_model.json`
Gate：G2
失败修复：schema 修正、zone/target 推断修正
自动重试：是
人工 gate：否

### 6. GenerateLayoutHTML
输入：layout_model + semantic_model
输出：`mirror/layout.html`
Gate：G3
失败修复：模板修正
自动重试：是
人工 gate：否

### 7. GenerateSemanticHTML
输入：semantic_model
输出：`mirror/semantic.html`
Gate：G3
失败修复：模板修正
自动重试：是
人工 gate：否

### 8. RunDOMValidation
输入：layout.html、semantic.html、semantic_model
输出：`mirror/dom_validation_report.json`
Gate：G3
失败修复：节点缺失修正、字段补齐
自动重试：是
人工 gate：否

### 9. RunCompareValidation
输入：source.png、rendered mirror、semantic/layout models
输出：`compare/report.json`、`compare/diff.png`
Gate：G4
失败修复：render/compare 策略修正
自动重试：是
人工 gate：否

### 10. ScoreAndJudge
输入：全部中间工件与报告
输出：score、gate decision、failure taxonomy id
Gate：综合评分阈值
失败修复：进入 Diagnose
自动重试：否
人工 gate：可选

### 11. Diagnose
输入：compare/dom/gate failures
输出：诊断报告、repair plan
Gate：诊断充分性
失败修复：人工补充
自动重试：否
人工 gate：否

### 12. Repair
输入：诊断报告
输出：修正后的 detect/infer/mirror/compare 配置或代码
Gate：修复完成度
失败修复：回 Diagnose
自动重试：否
人工 gate：否

### 13. ReRun
输入：修复后的实现
输出：重跑工件
Gate：与 ScoreAndJudge 相同
失败修复：继续 repair loop
自动重试：是（有限次）
人工 gate：否

### 14. BuildExecutionArtifacts
输入：通过的 semantic/actionability/send safety 工件
输出：执行脚本输入、pre-send baseline、checkpoint
Gate：G5/G6
失败修复：补证据
自动重试：否
人工 gate：否

### 15. RunWechatExecution
输入：执行工件
输出：动作级 evidence、before/after 截图、action logs
Gate：动作级后置验证
失败修复：retry 或 escalate
自动重试：有限动作可重试
人工 gate：高风险动作前后都建议

### 16. VerifyPostSend
输入：post-send capture + baseline
输出：post-send verification report
Gate：draft 清空、新消息出现、状态一致
失败修复：stop / escalate
自动重试：有限次 readback 可重试
人工 gate：必要时

### 17. ReadReply
输入：message list / OCR probes
输出：reply readback report
Gate：读回可信度
失败修复：retry OCR / wait / recapture
自动重试：是
人工 gate：必要时

### 18. RecordReplayAndMemory
输入：完整 run artifacts
输出：checkpoint、replay、memory、failure taxonomy
Gate：G7
失败修复：补 replay state / recovery result
自动重试：否
人工 gate：否

### 19. HumanGate
输入：全量报告
输出：approve / reject / quarantine / promote
Gate：G8
失败修复：回 Diagnose 或退回 candidate
自动重试：否
人工 gate：是

## 自动重试原则

允许自动重试：
- 资源加载失败
- OCR 轻微不稳定
- 页面截图短暂不完整
- compare render 临时失败

不允许自动重试：
- target 不唯一
- pageType 不可信
- 任何可能误发的 send 步骤
- recovery 路径不明确

## 必须人工 gate 的节点

- 高风险 send 前
- Golden promotion 前
- 多轮 repair 仍未稳定时
- failure taxonomy 命中误发/误点类高风险项时
