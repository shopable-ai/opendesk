# Semantic Maintenance Runbook

状态：P0 首批治理层

## 目标

给 semantic-exec 资产提供最小可运行治理面，避免系统变成“能跑但无人维护”。

## 当前治理入口

命令：

```bash
go run ./cmd/semantic-maintenance
```

可选指定 fixture 根目录：

```bash
go run ./cmd/semantic-maintenance ./fixtures/semantic-exec
```

## 当前审计项

1. scenario 数量与 expected 数量是否一致
2. schemaVersion 是否与当前 `semanticexec.SchemaVersion` 一致
3. outcome 覆盖是否齐全：
   - succeeded
   - blocked
   - degraded
   - partial
   - false_success_suspected
4. 是否至少存在 1 个 `fail_expected` 用例

## 当前 triage taxonomy

- `coverage_gap`
  - 缺少关键 outcome 象限覆盖
- `expected_contract_mismatch`
  - scenario / expected 数量不一致或 expected 丢失
- `false_success_regression`
  - 不再存在 `fail_expected` false-success 资产
- `schema_version_drift`
  - fixture schemaVersion 与当前 runtime contract 漂移
- `lifecycle_policy_gap`
  - 后续补充：资产状态无法依据运行结果稳定推进

## 退出码约定

- 0：审计通过
- 1：命令运行失败
- 2：命中治理问题，报告已输出但不通过

## 当前人工流程

### 1. 新增 scenario 时
必须同时补：
- `fixtures/semantic-exec/scenarios/<case>.json`
- `fixtures/semantic-exec/expected/<case>.expected.json`
- 对应测试或 smoke 验证

### 2. 新增高风险行为时
优先补：
- false-success case
- blocked / ambiguity case
- degraded 或 partial case

### 3. 何时允许 promote 为 verified
当前最小规则参考 `pkg/semanticexec/lifecycle.go`：
- result.Status 为 `succeeded` 或 `degraded`
- 不存在 falseSuccessSuspected
- 不存在 humanGateRequired

### 4. 何时建议 deprecate
- result.Status 为 `false_success_suspected`
- 或 result.Status 为 `blocked`

## 当前已知边界

1. golden fixtures 还未纳入本 runbook
2. lifecycle 还只是最小三态，不是完整版本图
3. maintenance 目前只审 fixture/expected，不审 execution/visionrun adapter

## 下一步优先扩展

1. maintenance test 扩展 triage 明细断言
2. smoke report 文件化落盘
3. fail_expected inventory 单独输出
4. lifecycle_policy_gap 真正进入审计逻辑
