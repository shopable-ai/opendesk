# Semantic Execution

本文件描述 OpenDesk 当前 `pkg/semanticexec/` 的真实实现边界。它取代旧的 `semanticexec-core-skeleton.md` 施工 Spec；实现事实以当前源码与测试为最终依据。

## 当前定位

`pkg/semanticexec/` 目前提供的是：

```text
语义执行数据契约
+ 状态派生
+ verifier / false-success 判定
+ mock scenario runner
+ expected-outcome comparator
+ fixture loader
+ 最小资产生命周期规则
```

它**还不是**已经接管真实桌面自动化 runtime 的完整语义执行引擎。

特别是当前 `RunScenario()` 仍由 `ScenarioStep.MockOutcome` / `MockFailureClass` 构造 route attempt 与 verification result，用于验证 contract、状态机和失败语义，而不是直接调度真实 DOM / Accessibility / OCR / desktop action。

## 当前文件

```text
pkg/semanticexec/
├── types.go
├── status.go
├── verify.go
├── mock_runtime.go
├── comparator.go
├── fixture.go
├── lifecycle.go
├── status_test.go
├── verify_test.go
└── mock_runtime_test.go
```

## Schema

当前：

```text
SchemaVersion = 0.1.0
```

### Execution / Step status

```text
pending
running
succeeded
failed
blocked
degraded
partial
false_success_suspected
```

### Failure class

```text
precondition_failed
target_not_found
ambiguous
permission_blocked
verification_failed
driver_error
timeout
environmental_drift
false_success
```

空字符串表示当前没有规范化 failure class。

### Verifier kind

```text
ui_observable
state_observable
business_observable
evidence_observable
```

### Route kind

```text
dom
devtools
accessibility
region
ocr
anchor
template
ai_recovery
mock
```

这些 route kind 当前首先是语义 contract；`mock_runtime.go` 并没有因此实现真实 DOM / DevTools / Accessibility / OCR 调度。

## 核心数据模型

### `Scenario`

描述一个语义执行场景：

- `scenarioId`
- `scenarioType`
- `steps[]`
- `routePolicy`
- `recoveryBudget`
- optional metadata

### `ScenarioStep`

当前 step 同时包含真实语义字段和 mock 驱动字段：

- action / target
- preconditions
- expectedVerifiers
- `mockOutcome`
- `mockFailureClass`
- allowDegraded
- requiresHumanGate
- evidenceRefs
- metadata

因此当前 package 适合作为 contract/fixture validation 基础，不应宣传为生产级 planner/executor。

### `RoutePolicy`

当前字段：

```text
preferredOrder
allowFallback
maxAttemptsPerStep
```

### `ExecutionResult`

当前 canonical result 包含：

- schemaVersion
- scenarioId
- status
- steps
- recoveryBudget / recoveryUsed
- summary
- metadata

StepResult 进一步保留：

- routeAttempts
- verifications
- falseSuccessSuspected
- humanGateRequired
- failureClass

## 状态派生

### Step

`DeriveStepStatus()` 当前优先级大体为：

```text
false_success_suspected
-> human gate / blocked failure
-> partial
-> degraded
-> succeeded
-> failed
```

其中：

- false-success 判定优先；
- `ambiguous`、`permission_blocked`、`precondition_failed` 属于 blocked-like failure；
- 成功不仅要求 route attempt success，还要求至少一个 verifier pass，并且存在 business verifier pass；
- partial / degraded 有独立条件，不能和 succeeded 混用。

### Execution

`DeriveExecutionStatus()` 当前聚合优先级：

```text
false_success_suspected
-> blocked
-> failed
-> partial
-> degraded
-> succeeded
```

因此单个严重 step 会提升整个 execution 的最终状态。

## Human Gate

`RequiresHumanGate()` 当前在以下情况返回 true：

- step 显式 `requiresHumanGate=true`；
- route attempt failure 为 `ambiguous`；
- route attempt failure 为 `permission_blocked`；
- verifier metadata 显式要求 human gate。

这是一层 contract-level guard，不等价于具体业务场景已经实现完整人机确认 UI。

## Verification 与 false-success

`BuildVerificationChecks()` 当前根据 mock outcome 合成验证结果，用于测试语义：

- succeeded：UI + state + business pass；
- blocked：UI inconclusive；
- partial：UI/state pass，business fail；
- degraded：UI pass，evidence inconclusive；
- false_success_suspected：UI pass，business fail；
- 其他失败：UI fail，必要时 state fail。

`DetectFalseSuccess()` 的核心约束是：

```text
route/action reported success
+ state 或 business verifier 明确失败
=> false_success_suspected
```

如果 step metadata 显式标记 `partialProgress=true`，则该情况优先走 partial 语义，而不是误判为 false-success。

### Partial

当前 partial 需要：

- route success；
- `metadata.partialProgress=true`；
- UI pass；
- state pass；
- business 未闭环。

### Degraded

当前 degraded 需要：

- route success；
- `allowDegraded=true`；
- UI pass；
- evidence inconclusive / insufficient；
- business 未证明成功；
- 不属于 false-success。

## Mock Runtime

`RunScenario()` 当前：

1. 校验 scenarioId / steps；
2. 逐 step 调用 mock runner；
3. 根据 route policy 生成 mock attempt；
4. 根据 `MockOutcome` 生成 verifier；
5. 派生 step status；
6. 聚合 execution status；
7. 统计 fallback attempt 形成 `recoveryUsed`；
8. 生成文本 summary。

Fallback 当前仅在 blocked mock outcome + allowFallback + attempts > 1 时模拟 `ai_recovery` attempt，而且该 fallback 仍保持 blocked。

所以：

```text
RouteDOM / RouteOCR / RouteAccessibility 等枚举存在
!= RunScenario 已经调用对应真实 runtime
```

## Fixture Loader

`LoadScenario(path)`：

- 读取 JSON；
- 默认补 `schemaVersion=0.1.0`；
- 要求 `scenarioId`；
- 要求至少一个 step。

`LoadExpectedOutcome(path)`：

- 读取 JSON；
- 默认补 schemaVersion；
- 要求 scenarioId / expectedStatus；
- 默认 `expectedSuiteDisposition=pass`。

当前 loader 接受调用者提供的文件路径；本 package 本身不定义唯一 fixture 根目录。

## Expected Outcome Comparator

`CompareExpected()` 当前比较：

- execution status；
- 第一个非空 failure class；
- 是否需要 human gate；
- 是否出现 false-success suspicion。

输出 `ComparisonResult`，包括：

```text
passed
statusMatch
failureClassMatch
humanGateMatch
falseSuccessGuardPass
failures[]
```

当前 comparator 不比较完整 step tree、route trace、verifier payload 或 metadata。

## 资产生命周期

当前最小状态：

```text
draft
verified
deprecated
```

`CanPromoteToVerified()` 当前要求：

- 资产不是 deprecated；
- execution 为 `succeeded` 或 `degraded`；
- 所有 step 都没有 false-success suspicion；
- 所有 step 都不需要 human gate。

`ShouldDeprecate()` 当前在 execution 为：

```text
false_success_suspected
blocked
```

时返回 true。

这只是最小 lifecycle helper，不是完整版本图、兼容性矩阵或自动维护服务。

## 当前明确不存在的能力

不要根据旧 Spec 宣称以下能力已经实现：

- `cmd/semantic-maintenance` CLI；
- `pkg/semanticmaintenance` 治理包；
- 自动 fixture inventory / freshness audit；
- 自动 golden promotion pipeline；
- 生产级真实 route orchestration；
- DOM / DevTools / Accessibility / OCR 的 semanticexec runtime adapter；
- planner / AIReasoner 主环接入；
- replay viewer / operator UI；
- 完整跨版本 asset graph。

如果未来实现这些能力，应在源码和测试落地后再更新本文件，而不是提前写入当前实现说明。

## 测试

当前 package 自带：

```text
status_test.go
verify_test.go
mock_runtime_test.go
```

修改 semantic execution contract 后至少应执行：

```bash
go test ./pkg/semanticexec
```

涉及真正 desktop/runtime adapter 后，还需要对应 runtime / automation tests 与真实环境验证；不能用 mock semanticexec tests 证明桌面执行成功。

## 相关质量原则

语义执行层应继续遵循：

```text
action reported success
!= business success
```

以及：

```text
mock contract proof
!= real runtime proof
```

跨系统的当前 Gate / evidence 规则见：

```text
docs/quality/gates-and-evidence.md
```

历史施工 Spec 和不存在的 semantic-maintenance 设计已归档，不再作为当前实现入口。
