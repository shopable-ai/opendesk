# recipe-qualify｜输出规格

## 主产物

唯一权威结果是 QualificationRecord；human-readable Review/Run Summary 只投影同版记录，不创造第二套 verdict。

## 必须绑定

| 内容 | 要求 |
| --- | --- |
| candidate | exact candidateRef/scriptHash/dependencies |
| contract | exact contractRef/criteria |
| environment | build/platform/application scope |
| actual run | command/workingDirectory/executionRefs |
| scenario | predeclared input/oracle/scopeRefs |
| observation | independent actual result/evidence |
| scope | requested/exercised/qualified/excluded |
| result | pass/fail/not-run/blocked + failedCriteria/skipped |
| repair | precise responsible stage + affected scope |

## Scope 规则

- qualified ⊆ exercised ⊆ requested（除非合同另有明确允许的附加观察项）。
- requested 内未运行/阻塞/失败项不能改写成 excluded 来获得 overall pass。
- 每个 qualified item 都需 passing scenario + evidence。
- PASS 只覆盖证据实际支持的环境、输入和能力边界。

## Claims

- one-run claim：明确写“一次成功”。
- repeatability claim：至少两个独立 Fresh Runs。
- parameterization claim：同一 Candidate + 同一 inputContract + 至少一个不同合法输入 + actual consumer 使用证据。
- ordinary Recipe claim：不得由 Agent 逐点击实时控制。