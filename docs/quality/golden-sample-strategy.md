# Golden Sample Strategy

Golden Sample 是经过审查、可重放、带明确断言与容差的回归基线；历史 screenshot、某次成功运行或一组漂亮 artifact 本身都不是 Golden Sample。

## Lifecycle

```text
Candidate → Reviewed → Frozen → Deprecated
                     ↘ Invalidated
```

### Candidate

已收集输入与预期方向，但尚未完成完整审查。不能作为强制回归真相源。

### Reviewed

人工/自动 review 已记录，关键 assertions、environment 与 failure mappings 已明确；仍可在冻结前修改。

### Frozen

可以作为正式回归 baseline。任何影响 expected output/assertions/variance 的修改必须产生新的 review/promotion decision。

### Deprecated

仍保留历史价值，但不再参与默认 regression gate；必须记录替代样本或弃用原因。

### Invalidated

发现 provenance、expected result、environment assumption 或 assertions 错误，不能继续作为可信 baseline。

## Minimum contract

每个要进入 `Reviewed` / `Frozen` 的样本至少需要：

- `provenance`: 来源、创建/审核信息、代码版本或 commit、许可/隐私边界；
- `input`: 可重放的输入或稳定引用；
- `environment`: OS/runtime/app/version/viewport 等实际影响结果的条件；
- `expected output`: 预期结构/状态/结果；
- `assertions`: 哪些字段/区域/状态必须成立；
- `variance budget`: 哪些差异允许、阈值是什么；
- `failure mappings`: 失败映射到 F0-F10/领域 code；
- `promotion decision`: 谁/什么规则把 Candidate 升级到 Reviewed/Frozen；
- `replay evidence`: 至少一次针对冻结 contract 的可复核 replay 结果。

## Artifact policy

Artifact 应按 scenario 需要选择，不设“一刀切目录”。例如：

- desktop/layout: source image、annotation、separator/region result；
- browser routing: request、stack、execution summary/event log；
- semantic target: candidate trace、support/counter-signals；
- high-risk action: before/after、authorization/gate、postcondition readback。

DOM snapshot、a11y snapshot、OCR map、HTML mirror、diff image 都是**可选 scenario artifacts**。只有当前 runtime 能稳定生成且 assertion 需要时，才进入 sample contract。

## Promotion gates

### Candidate → Reviewed

必须：

- provenance/input/environment 可重放；
- expected result 明确；
- assertions 与 variance budget 不为空；
- review 记录具体通过/拒绝理由。

### Reviewed → Frozen

必须：

- replay 在目标环境通过；
- failure mapping 已建立；
- 没有 unresolved ambiguity；
- promotion decision 明确记录 baseline version。

### Frozen → Deprecated / Invalidated

必须说明：

- 原因；
- 最后可信版本；
- 是否有 replacement；
- 哪些 regression suites 需要更新。

## Evidence boundary

- `Candidate` 不得被写成“golden passed”。
- 单次 screenshot 成功不等于 Frozen。
- 单个算法输出与人工直觉一致，不等于 Frozen。
- 旧样本如果无法确认 provenance 或环境，应降为 Candidate/Historical，而不是继续充当真相源。

## Recommended storage shape

当需要落盘时，可以使用：

```text
golden/<domain>/<sample-id>/
  metadata.json
  input/
  expected/
  evidence/
  replay/
  review/
```

目录只是组织方式；真正 contract 由 provenance、assertions、variance budget、promotion decision 和 replay evidence 决定。
