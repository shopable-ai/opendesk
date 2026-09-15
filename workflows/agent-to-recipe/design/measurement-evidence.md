# Measurement Evidence 在 Recipe Authoring 中的位置

> 本页同时约束 Agent-to-Recipe 与 Human-to-Recipe。Measurement 是可保存、可重读、可维修的证据增强层，不是新的 Recipe Runtime，也不是坐标优先代码生成器。

## 1. 正式链路

```text
真实任务 / Human demonstration / Recorder action
  ↓
已有 semantic evidence
  +
按需 MeasurementEvidence
  ↓
AuthoringMeasurementInput
  ↓
普通 OpenDesk JavaScript Recipe
  ↓
正式 Execution
  ↓
独立 business verification
  ↓
qualified
```

Measurement 只有在录制/Agent 已有 evidence 不够稳定、需要布局约束或视觉验证时才附加。不得要求每次录制都进入 Measurement。

## 2. Artifact 位置

继续使用现有 task package：

```text
.runtime/automation-authoring/<task-id>/measurement/
  evidence.json
  snapshot.png
  handoff-recorder.json
  handoff-human-to-recipe.json
  handoff-agent-to-recipe.json
  handoff-qualification.json
  handoff-repair.json
  repair-history.jsonl
```

所有文件必须能够跨阶段重新读取。不要把 Measurement artifact 放进单独的隐藏体系，也不要要求 Authoring 从零重新测量。

## 3. 策略优先级

`pkg/measurement/authoring.go` 的 handoff 按以下原则生成提示：

```text
semantic evidence available
→ semantic-first

region evidence
→ constrained-region

frozen point/color evidence
→ visual-verification

spacing evidence
→ layout-verification

two-point evidence
→ distance-verification
```

因此推荐生成的 Recipe 仍然类似：

```js
const app = UI.within(win);
const save = app.locator({ text: "保存", role: "button" });
await save.tap();
```

而不是：

```js
await mouse.click(742, 518); // 禁止仅因为测量过就退化为唯一绝对坐标策略
```

当 semantic locator 不够强时，可以使用 Measurement 提供的 Reference-relative Region 约束搜索、消歧或 qualification；绝对坐标只作为明确证据的一部分。

## 4. Recorder

Recorder action 可以通过 `pkg/recorder/measurement_evidence.go` 将 evidence ref 附加到一个现有 `LocatorCandidate`。

附加规则：

- 保留原 candidate Kind / Role / Name / Identifier。
- 已有更高 semantic confidence 时，不用 Measurement 覆盖 confidence。
- 可补 ExpectedWindow / ExpectedProcess 和 reference-relative measurement metadata。
- evidence 只附加到选择的 candidate，不泄漏给其他 action/candidate。
- Measurement artifact ref 必须是安全相对路径。

录制证据足够时不需要 Measurement；定位薄弱时才由用户或 Agent 打开同一个 Measurement Session 补强。

## 5. Human-to-Recipe

Human demonstration 后可以把人工 Region / Reference / Point / Spacing 保存为 MeasurementEvidence。Authoring 读取：

```text
action intent
+ semantic evidence
+ measurement handoff
```

再生成普通 OpenDesk JS。

Human Measurement 的 provenance 必须保留 `manual`。人工选择 Region 并不意味着最终 Recipe 必须使用坐标；它优先成为 constrained search / validation evidence。

## 6. Agent-to-Recipe

Agent 可以读取已经存在的 evidence，而不是重新探索 UI：

```text
semantic available
→ 使用 semantic locator
→ 用 geometry evidence 约束/验证

semantic ambiguous
→ 使用 measurement region + reference 做消歧

visual drift concern
→ 使用 frozen pixel / region 做 qualification

layout relation is business-relevant
→ 使用 spacing / distance 做 layout verification
```

Agent 不得把 evidence 中的 confidence 当成成功证明。生成 Recipe 后仍必须真实执行并做独立业务验证。

## 7. Qualification

Qualification 可以消费：

- reference identity
- reference/target geometry drift
- frozen pixel plausibility

但 Qualification 不得仅因为单像素不同就自动判定业务失败，也不得仅因为像素相同就宣称业务成功。业务验证仍由对应工作流定义。

## 8. Measurement-assisted Repair

失败先分类：

```text
适合 Measurement:
  target-not-found
  ambiguous-target
  window-changed
  geometry-drift
  OCR mismatch
  Accessibility unavailable
  visual mismatch

不自动进入 Measurement:
  state mismatch
  permission
  business verification failure
```

适合时产生 `RepairRequest`，只请求必要的新 evidence，例如：

```text
重新选择 target region
重新确认 reference
取一个 point/color
测两个 region spacing
获得新的 semantic candidate
```

新 Evidence 形成结构化 `RepairCandidate`。必须经过：

```text
existing Execution retry PASS
+
business verification PASS
```

才成为 `qualified`。

Repair API 本身不写黄金 Recipe。qualified candidate 只是允许后续 authoring 显式升级；失败 candidate 连同 failure / old evidence / new measurement / outcomes 写进 `repair-history.jsonl`。

## 9. 不变量

整个 Authoring / Repair 链必须保持：

1. 一套 `pkg/measurement` Geometry。
2. 一个 `CaptureMapping`。
3. 一个 `Result` model。
4. 一个 `MeasurementEvidence` schema。
5. 一个 Automation Authoring task package。
6. 一个正式 OpenDesk Execution path。
7. 成功必须有独立 business verification。

不新增 Replay Runtime，不新增 Measurement Runtime，不新增 AgentGeometry/RepairGeometry。
