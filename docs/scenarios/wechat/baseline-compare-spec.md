# WeChat Baseline Compare Contract

本文件定义 WeChat 桌面场景中 baseline/reference 与 fresh runtime evidence 的 compare contract。

## 当前状态

截至 2026-08-31，本仓库当前树中**没有已经验证并冻结的 WeChat desktop golden fixture**，也没有当前 production WeChat compare runner。

因此本文件是未来 fixture / compare 实现应遵循的规范，不是“当前脚本已经生成这些文件”的声明。

## Compare 的两种用途

必须显式区分：

### `algorithm_validation`

用于：

- 算法开发；
- fixture regression；
- topology / OCR / layout 稳定性检查。

它不能直接裁决真实高风险动作。

### `action_support`

用于真实桌面上下文中辅助判断 drift 和结构合理性。

即使 compare 为 pass，仍必须通过 fresh action-specific guards；尤其不能自动推出 `sendAllowed=true`。

## 输入模型

### Reference

推荐结构：

```text
manifest.json
baseline/layout.json
baseline/semantic.json
verify/capture-contract.json
```

Reference 至少声明：

- sampleId / baselineId；
- schemaVersion；
- status：candidate / frozen；
- sourceKind；
- target app / scenario；
- screen / window geometry；
- critical zones；
- critical action intents；
- provenance。

### Runtime

必须来自 fresh 当前上下文，至少包含：

- capturedAt；
- current window identity；
- geometry；
- zones / candidate targets；
- evidence freshness；
- blocking conditions。

运行时 evidence 不应因为存在 frozen reference 而省略。

## Capture Contract

用于动作相关 compare 时，建议包含：

```json
{
  "schemaVersion": "0.2.0",
  "capturedAt": "",
  "sameWindow": true,
  "geometryHash": "",
  "maxAgeMs": 1500,
  "captures": [
    {
      "id": "chat-header",
      "zoneId": "chat_header",
      "bbox": {"x": 0, "y": 0, "width": 0, "height": 0},
      "bboxRatio": {"x": 0, "y": 0, "width": 0, "height": 0},
      "evidence": []
    }
  ]
}
```

具体 `maxAgeMs` 不应被本模板视为全局固定产品参数；实现应根据动作风险和 runtime 约束确定。

## Evidence 强度

建议分层：

### Strong

- current window identity；
- same-window/freshness；
- header identity verification；
- input focus verification；
- required action target identity。

### Medium

- topology / zone completeness；
- bboxRatio consistency；
- local visual anchor；
- capture reference relocation。

### Weak

- 单一 OCR probe；
- color proximity；
- icon hint；
- row clustering score。

### Decorative

- avatar completeness；
- 非关键装饰视觉一致性。

规则：弱证据可以用于 ranking / repair hint，不应该单独承担高风险动作 hard gate。

## Structural Compare

至少关注：

- 关键 zone 是否存在；
- zone topology 是否合理；
- bboxRatio 漂移；
- overlap / spill / missing；
- 当前 window geometry 是否可比。

WeChat chat 场景常见关键 zone：

```text
conversation_list
chat_header
message_list
input_area
```

`search_area` / `send_action_zone` 是否属于必需 zone，应由当前实现和任务目标决定，而不是永久写死。

## Semantic Compare

至少关注：

- page/context identity；
- target-zone binding；
- required intent 是否有候选；
- chat identity evidence；
- input area plausibility；
- blocking overlay；
- candidate ambiguity / freshness。

## 输出建议

未来 compare 实现可以输出：

```text
structural-report.json
semantic-report.json
summary-report.json
```

`summary-report` 最少应解释：

```text
purpose
status: pass / warn / fail
blockingReasons[]
repairHints[]
sourceKindMismatch
hardGates[]
evidenceRefs[]
```

不要只有一个不可解释的综合分数。

## Decision 语义

### fail

- reference/runtime 不可比；或
- 关键结构/身份存在 blocking mismatch。

动作层必须重新获取 evidence 或恢复上下文。

### warn

- 允许进一步 probe；
- 不能因为 warn 自动作出高风险行为。

### pass

只表示 compare contract 没有发现 blocking drift。

仍然：

```text
compare pass
!= action preconditions pass
!= sendAllowed
```

## Source-kind 边界

不能用：

```text
web/dev reference
```

直接证明：

```text
desktop action geometry / target identity
```

如果 reference 来自不同平台、渲染方式、主题或窗口布局，必须显式声明 source mismatch，并限制其用途为 algorithm/reference evidence。

## Failure / Repair

Compare fail 应尽量输出可操作 repair layer，例如：

```text
window identity
capture freshness
layout extraction
zone mapping
OCR/local evidence
target ranking
reference stale
```

不要默认通过降低阈值或放宽 guard 来“修复” compare。

## 与 Golden 的关系

只有经过当前 `golden-template.md` 所定义的 provenance、review、quality gate 后，reference 才能被称为 frozen golden。

但 frozen 仍然只是稳定 reference，不替代 fresh runtime evidence。

## 验证原则

未来实现 compare runner 后，需要同时验证：

- candidate fixture；
- frozen fixture；
- source-kind mismatch；
- geometry drift；
- missing zones；
- ambiguous target；
- stale runtime evidence；
- compare pass 但 send gate fail 的场景。
