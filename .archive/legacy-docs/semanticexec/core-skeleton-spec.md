# SemanticExec Core Skeleton Spec

状态：P0 implementation-ready
范围：仅覆盖首批 3 个核心文件与对应测试骨架
目标：让下一位工程 agent 直接开始写 `pkg/semanticexec/types.go`、`pkg/semanticexec/status.go`、`pkg/semanticexec/verify.go`

## 1. 本轮结论

当前最优先推进项不变：
- P0 = 统一 semantic execution contract 的 mock runtime 最小闭环

这份文件只把闭环里最先要写的核心 contract 压到：
- 字段级
- 常量级
- 函数签名级
- 测试用例名级
- 判定规则级

不在本轮内的内容：
- HTTP 新 endpoint
- operator UI
- replay viewer
- AIReasoner 主环接入
- 真正 Accessibility / DevTools / OCR 编排替换

---

## 2. 文件顺序

严格建议先按这个顺序写：

1. `pkg/semanticexec/types.go`
2. `pkg/semanticexec/status.go`
3. `pkg/semanticexec/verify.go`
4. `pkg/semanticexec/status_test.go`
5. `pkg/semanticexec/verify_test.go`
6. `pkg/semanticexec/mock_runtime.go`
7. `pkg/semanticexec/mock_runtime_test.go`

原因：
- `types.go` 定 contract
- `status.go` 定状态机
- `verify.go` 定 false-success 防线
- 这三者稳定后，mock runtime 才不会漂

---

## 3. `pkg/semanticexec/types.go`

### 3.1 常量

```go
package semanticexec

const SchemaVersion = "0.1.0"

const (
	StatusPending                = "pending"
	StatusRunning                = "running"
	StatusSucceeded              = "succeeded"
	StatusFailed                 = "failed"
	StatusBlocked                = "blocked"
	StatusDegraded               = "degraded"
	StatusPartial                = "partial"
	StatusFalseSuccessSuspected  = "false_success_suspected"
)

const (
	FailureClassNone               = ""
	FailureClassPreconditionFailed = "precondition_failed"
	FailureClassTargetNotFound     = "target_not_found"
	FailureClassAmbiguous          = "ambiguous"
	FailureClassPermissionBlocked  = "permission_blocked"
	FailureClassVerificationFailed = "verification_failed"
	FailureClassDriverError        = "driver_error"
	FailureClassTimeout            = "timeout"
	FailureClassEnvironmentalDrift = "environmental_drift"
	FailureClassFalseSuccess       = "false_success"
)

const (
	VerifierUI       = "ui_observable"
	VerifierState    = "state_observable"
	VerifierBusiness = "business_observable"
	VerifierEvidence = "evidence_observable"
)

const (
	RouteDOM           = "dom"
	RouteDevTools      = "devtools"
	RouteAccessibility = "accessibility"
	RouteRegion        = "region"
	RouteOCR           = "ocr"
	RouteAnchor        = "anchor"
	RouteTemplate      = "template"
	RouteAIRecovery    = "ai_recovery"
	RouteMock          = "mock"
)
```

### 3.2 类型定义

```go
type Scenario struct {
	SchemaVersion  string         `json:"schemaVersion"`
	ScenarioID     string         `json:"scenarioId"`
	ScenarioType   string         `json:"scenarioType"`
	Description    string         `json:"description,omitempty"`
	Steps          []ScenarioStep `json:"steps"`
	RoutePolicy    RoutePolicy    `json:"routePolicy"`
	RecoveryBudget int            `json:"recoveryBudget"`
	Metadata       map[string]any `json:"metadata,omitempty"`
}

type ScenarioStep struct {
	StepID             string         `json:"stepId"`
	Action             string         `json:"action"`
	Target             string         `json:"target,omitempty"`
	Preconditions      []string       `json:"preconditions,omitempty"`
	ExpectedVerifiers  []string       `json:"expectedVerifiers,omitempty"`
	MockOutcome        string         `json:"mockOutcome"`
	MockFailureClass   string         `json:"mockFailureClass,omitempty"`
	AllowDegraded      bool           `json:"allowDegraded,omitempty"`
	RequiresHumanGate  bool           `json:"requiresHumanGate,omitempty"`
	EvidenceRefs       []EvidenceRef  `json:"evidenceRefs,omitempty"`
	Metadata           map[string]any `json:"metadata,omitempty"`
}

type RoutePolicy struct {
	PreferredOrder   []string `json:"preferredOrder,omitempty"`
	AllowFallback    bool     `json:"allowFallback"`
	MaxAttemptsPerStep int    `json:"maxAttemptsPerStep"`
}

type RouteAttempt struct {
	AttemptIndex int            `json:"attemptIndex"`
	RouteKind    string         `json:"routeKind"`
	RouteSelector string        `json:"routeSelector,omitempty"`
	Success      bool           `json:"success"`
	FailureClass string         `json:"failureClass,omitempty"`
	Detail       string         `json:"detail,omitempty"`
	Metadata     map[string]any `json:"metadata,omitempty"`
}

type VerificationCheck struct {
	CheckID       string         `json:"checkId"`
	CheckType     string         `json:"checkType"`
	Passed        bool           `json:"passed"`
	Inconclusive  bool           `json:"inconclusive,omitempty"`
	EvidenceRef   string         `json:"evidenceRef,omitempty"`
	Message       string         `json:"message,omitempty"`
	Metadata      map[string]any `json:"metadata,omitempty"`
}

type StepResult struct {
	StepID                 string              `json:"stepId"`
	Status                 string              `json:"status"`
	RouteAttempts          []RouteAttempt      `json:"routeAttempts"`
	Verifications          []VerificationCheck `json:"verifications"`
	FalseSuccessSuspected  bool                `json:"falseSuccessSuspected"`
	HumanGateRequired      bool                `json:"humanGateRequired"`
	FailureClass           string              `json:"failureClass,omitempty"`
	Summary                string              `json:"summary,omitempty"`
}

type ExecutionResult struct {
	SchemaVersion  string         `json:"schemaVersion"`
	ScenarioID     string         `json:"scenarioId"`
	Status         string         `json:"status"`
	Steps          []StepResult   `json:"steps"`
	RecoveryBudget int            `json:"recoveryBudget"`
	RecoveryUsed   int            `json:"recoveryUsed"`
	Summary        string         `json:"summary,omitempty"`
	Metadata       map[string]any `json:"metadata,omitempty"`
}

type ExpectedOutcome struct {
	SchemaVersion          string `json:"schemaVersion"`
	ScenarioID             string `json:"scenarioId"`
	ExpectedStatus         string `json:"expectedStatus"`
	ExpectedFailureClass   string `json:"expectedFailureClass,omitempty"`
	ExpectedHumanGate      bool   `json:"expectedHumanGate"`
	ExpectedFalseSuccess   bool   `json:"expectedFalseSuccess"`
	ExpectedSuiteDisposition string `json:"expectedSuiteDisposition,omitempty"`
}

type EvidenceRef struct {
	Kind string `json:"kind"`
	Path string `json:"path"`
}
```

### 3.3 字段规则

必须写进注释或文档的硬规则：

1. `ExecutionResult.Status` 是 canonical
2. `StepResult.Status` 是 canonical
3. `FalseSuccessSuspected` 是 canonical，不允许只藏在 `FailureClass`
4. `Summary` 不是 canonical，只是衍生说明
5. `Metadata` 只能补充，不得承载核心判定
6. `ExpectedOutcome` 只校验 canonical 字段

### 3.4 不要现在加的字段

当前阶段不要加：
- tree / parent-child nested steps
- planner trace
- llm rationale blob
- retry strategy object graph
- multi-asset version graph
- cross-env calibration patch set

理由：都会拖慢主线。

---

## 4. `pkg/semanticexec/status.go`

### 4.1 目标

这个文件只做一件事：
把 step / execution 的状态派生逻辑写死，禁止各调用方自己发明语义。

### 4.2 函数签名

```go
package semanticexec

func DeriveStepStatus(step ScenarioStep, attempts []RouteAttempt, checks []VerificationCheck) string
func DeriveExecutionStatus(steps []StepResult) string
func RequiresHumanGate(step ScenarioStep, attempts []RouteAttempt, checks []VerificationCheck) bool
func IsTerminalStatus(status string) bool
func IsBlockedLike(status string) bool
func IsSuccessLike(status string) bool
func NormalizeFailureClass(raw string) string
```

### 4.3 Step 状态判定硬规则

优先级从高到低：

1. 若 `DetectFalseSuccess(...) == true`
- 返回 `false_success_suspected`

2. 若 `RequiresHumanGate(...) == true`
- 返回 `blocked`

3. 若存在 `permission_blocked / ambiguous / precondition_failed`
- 返回 `blocked`

4. 若 action success 且：
- 至少 1 个 verifier passed
- 且无 false-success
- 且 business verifier 满足预期
=> `succeeded`

5. 若 action success 且：
- 有进展
- 但主目标未闭环
=> `partial`

6. 若 action success 且：
- 主目标大体达成
- 但 verifier/evidence 不充分
=> `degraded`

7. 若 route/verification 明确失败
=> `failed`

### 4.4 Execution 状态判定硬规则

优先级从高到低：

1. 任一步 `false_success_suspected`
=> execution = `false_success_suspected`

2. 若存在 blocked 且无 false-success
=> execution = `blocked`

3. 若存在 failed 且无 blocked/false-success
=> execution = `failed`

4. 若至少一步 partial 且无更高优先级问题
=> execution = `partial`

5. 若至少一步 degraded 且无更高优先级问题
=> execution = `degraded`

6. 全部 succeeded
=> execution = `succeeded`

### 4.5 Human gate 规则

以下任一满足必须 `true`：
- step.RequiresHumanGate == true
- 任一 attempt.FailureClass == `ambiguous`
- 任一 attempt.FailureClass == `permission_blocked`
- verifier 明确表明业务确认必须人工执行

### 4.6 测试用例

文件：`pkg/semanticexec/status_test.go`

```go
func TestDeriveExecutionStatusSucceeded(t *testing.T)
func TestDeriveExecutionStatusBlockedWinsOverPartial(t *testing.T)
func TestDeriveExecutionStatusFalseSuccessWinsOverBlocked(t *testing.T)
func TestRequiresHumanGateOnAmbiguousFailure(t *testing.T)
func TestRequiresHumanGateOnPermissionBlocked(t *testing.T)
func TestIsTerminalStatus(t *testing.T)
func TestNormalizeFailureClass(t *testing.T)
```

### 4.7 预期断言重点

- false_success_suspected 优先级最高
- blocked 高于 partial / degraded / failed 的场景必须明确测试
- partial 与 degraded 必须拆开测，不能混在一个表驱动里偷懒

---

## 5. `pkg/semanticexec/verify.go`

### 5.1 目标

这是 false-success 防线核心。
这个文件必须限制住“动作成功 != 业务成功”的滥判。

### 5.2 函数签名

```go
package semanticexec

func BuildVerificationChecks(step ScenarioStep, attempt RouteAttempt) []VerificationCheck
func HasPassingVerifier(checks []VerificationCheck) bool
func HasVerifierType(checks []VerificationCheck, verifierType string) bool
func HasBusinessVerifierPass(checks []VerificationCheck) bool
func HasEvidenceVerifierPass(checks []VerificationCheck) bool
func HasAnyVerifierFailure(checks []VerificationCheck) bool
func DetectFalseSuccess(step ScenarioStep, attempt RouteAttempt, checks []VerificationCheck) bool
func ShouldMarkDegraded(step ScenarioStep, attempt RouteAttempt, checks []VerificationCheck) bool
func ShouldMarkPartial(step ScenarioStep, attempt RouteAttempt, checks []VerificationCheck) bool
```

### 5.3 false-success 判定硬规则

满足全部条件时，必须标记 `true`：

1. action / route reported success
2. 至少一个 verifier 明确失败，且该 verifier 为：
- `business_observable`
或
- `state_observable`
3. 该失败不是 purely inconclusive

也就是说：
- UI 看起来点中了
- 但业务状态没变 / 持久化没发生
=> 必须 false_success_suspected

### 5.4 degraded 判定硬规则

标记 degraded 的典型条件：
- route success
- UI verifier pass
- 但 state/business verifier 缺失或 inconclusive
- 并且 step.AllowDegraded == true

如果 `AllowDegraded == false`，则不要把这类情况默默吞成 degraded；优先落到 failed 或 false-success。

### 5.5 partial 判定硬规则

标记 partial 的典型条件：
- route success
- 至少一个子目标 verifier pass
- 但主目标 verifier 不通过
- 不属于 false-success

当前阶段简化实现：
- 用 `step.Metadata["partialProgress"] == true` 作为 mock 标志
- 未来再替换为更真实的子目标模型

### 5.6 BuildVerificationChecks 的 mock 规则

当前阶段允许按 `step.MockOutcome` 合成 verifier：

- `succeeded`
  - UI pass
  - state pass
  - business pass
- `blocked`
  - verifier 可为空或 inconclusive
- `partial`
  - UI pass
  - state pass
  - business fail
  - metadata 标记 partialProgress=true
- `degraded`
  - UI pass
  - evidence fail/inconclusive
- `false_success_suspected`
  - UI pass
  - business fail
- `failed`
  - UI fail 或 state fail

### 5.7 测试用例

文件：`pkg/semanticexec/verify_test.go`

```go
func TestHasPassingVerifierRequiresAtLeastOnePassed(t *testing.T)
func TestHasBusinessVerifierPass(t *testing.T)
func TestDetectFalseSuccessWhenActionSucceedsButBusinessVerifierFails(t *testing.T)
func TestDetectFalseSuccessWhenActionFailsDoesNotTrigger(t *testing.T)
func TestShouldMarkDegradedWhenEvidenceIsInconclusiveAndAllowed(t *testing.T)
func TestShouldMarkDegradedWhenNotAllowed(t *testing.T)
func TestShouldMarkPartialWhenProgressExistsWithoutMainGoalClosure(t *testing.T)
func TestBuildVerificationChecksForFalseSuccessFixture(t *testing.T)
```

### 5.8 必测反例

必须单测的两个反例：

1. route success + ui pass + business fail
- 不能算 degraded
- 必须算 false_success_suspected

2. route success + ui pass + evidence inconclusive + AllowDegraded=false
- 不能默默 degraded
- 必须失败或由上层判失败

---

## 6. 首批 mock fixture 对应的 verifier 约定

### 6.1 `browser_backoffice_happy_path`
- ui_observable: pass
- state_observable: pass
- business_observable: pass
- final status: succeeded

### 6.2 `native_permission_blocked`
- route attempt failureClass=permission_blocked
- humanGateRequired=true
- final status: blocked

### 6.3 `canvas_partial_success`
- ui_observable: pass
- state_observable: pass
- business_observable: fail
- partialProgress=true
- final status: partial

### 6.4 `false_success_save_without_persist`
- route success=true
- ui_observable: pass
- business_observable: fail
- final status: false_success_suspected
- suite disposition: fail_expected

---

## 7. TDD 顺序

### Task 1: `types.go`
- 先写常量
- 再写 struct
- 再跑 `go test ./pkg/semanticexec/...`
- 预期：编译失败，因为 status/verify 还没写

### Task 2: `status.go`
- 先写 `IsTerminalStatus`
- 再写 `RequiresHumanGate`
- 再写 `DeriveExecutionStatus`
- 再跑 `TestDeriveExecutionStatus...`

### Task 3: `verify.go`
- 先写 `HasPassingVerifier`
- 再写 `DetectFalseSuccess`
- 再写 `ShouldMarkDegraded`
- 再写 `ShouldMarkPartial`

### Task 4: 单测收口
- `status_test.go`
- `verify_test.go`

---

## 8. 本轮明确不做的事情

1. 不把 visionrun 全量迁进 semanticexec
2. 不写 adapter 复杂层
3. 不写 HTTP 层
4. 不写 maintenance CLI
5. 不写 lifecycle 复杂字段

原因：
- 当前先锁 core contract
- 先把最容易漂的状态机和 false-success 判定固定住

---

## 9. 开工完成定义

当以下条件满足，才算这 3 个核心文件完成：

1. `types.go` 编译通过
2. `status_test.go` 全绿
3. `verify_test.go` 全绿
4. `false_success_save_without_persist` 的判定在单测中被钉死
5. `partial` 与 `degraded` 的边界有独立测试
6. 没有把关键判定藏进 `Metadata`

---

## 10. 下一文件提示

当这份 skeleton 被实现后，下一文件必须是：
- `pkg/semanticexec/mock_runtime.go`

不要跳去：
- HTTP
- UI
- operator
- replay
- AI planner

因为那都会在 core contract 未稳时放大返工。
