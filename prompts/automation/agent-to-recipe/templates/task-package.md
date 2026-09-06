# 任务包初始化模板

本文件是人工／Agent 填写模板，不是 Runtime 配置，也不是实际 execution Evidence。仅在用户授权运行任务后创建本地任务包。所有 `<...>` 必须替换为真实值；未执行时不创建伪成功 handoff，不把模板提交为通过记录。

权威字段见[共享合同](../../../../docs/frameworks/agent-to-recipe-skill-contract.md)。下面的字段实例只是初始化辅助，不能覆盖共享定义。

## 1. 任务根目录

```text
.runtime/automation-authoring/<task-id>/
  user-task.md
  progress.json
  attempts/plan-001/request.json
```

taskId 应唯一。记录任务根的绝对解析基准但不对外泄漏本机路径。协调者登记 rootId 到获准目录的映射；输入的 rootId 不能由不可信产物擅自扩展。

`user-task.md` 写：用户目标、实际授权来源、scope、允许应用／对象、可执行与不可执行动作、预期业务结果、成功证据、环境边界、总预算与停止规则。用户期望不是已观察结果。

## 2. 首次规划 request

先保存 user-task，再核对其真实 hash。占位符未填不能派发。

```json
{
  "schemaVersion": "agent-to-recipe/v1",
  "taskId": "<task-id>",
  "workPackageId": "W010",
  "attemptId": "plan-001",
  "skill": "automation-plan",
  "mode": "plan/create",
  "planRevision": null,
  "contractRef": null,
  "inputRefs": [
    {
      "kind": "UserTask",
      "rootId": "task",
      "path": "user-task.md",
      "sha256": "<actual-sha256>",
      "schemaVersion": "text/v1"
    }
  ],
  "requiredOutputs": ["TaskContract", "WorkPlan"],
  "authority": {
    "source": "<actual-user-authorization>",
    "allowedObjects": [],
    "allowedActions": ["plan"],
    "readRoots": ["task"],
    "writeRoots": ["task"]
  },
  "capabilities": ["read-approved-files", "write-task-artifacts"],
  "budgets": {
    "maxElapsedSeconds": "<set-real-positive-number>",
    "maxToolCalls": "<set-real-positive-number>",
    "maxRetries": "<set-real-nonnegative-number>",
    "taskBudgetRef": "user-task.md"
  },
  "environmentRef": null,
  "evidenceRoots": []
}
```

首次规划可无现场观察；接触桌面的调用必须有真实环境、允许的工具／动作和停止方式。后续 request 使用确定的 contractRef、planRevision、handoff 和主产物引用；不要将前一步聊天全文当 inputRefs。

### 从已有普通 JS 接续

已有脚本接续也先建立真实用户目标和规划 request：对脚本及已有清单／证据使用实际 hash 引用，按[共享合同](../../../../docs/frameworks/agent-to-recipe-skill-contract.md)填写可选接续元数据，并在工作包中写清原样复用或最小修复边界、证据的实际作用及请求验收范围。这里不复制该字段定义。缺少旧合同、示范或资格记录时保持未知，不为完整模板补造；只路由真实缺口。若目标是完整新 Agent 示范／新生成，则仍初始化并执行完整链路。

## 3. 工作包说明模板

| 字段 | 要填写的实际内容 |
| --- | --- |
| workPackageId／skill | 稳定 ID 和唯一责任 Skill |
| goal | 当前子目标；不要写“完成整个项目” |
| dependsOn／inputRefs | 哪些已发布结果以及确定版本 |
| preconditions | 数据条件和当前现场条件分开 |
| requiredOutputs | 主产物、关键值、消费者 |
| successCriteria | 稳定 criterionId、期望、证据来源 |
| authority／sideEffects | 允许动作、禁止动作、结果不明时的核验 |
| budgets | 本次调用、探索、等待与修复上限 |
| resumePolicy | 可复用什么、必须重查什么、哪些动作不能直接重做 |

TaskContract、WorkPlan 等可保存在 plan attempt；消费者引用其实际位置。需要 `plan/r001/` 可建立引用索引，不复制两个可独立编辑的权威合同。

## 4. 发布前的 handoff 检查单

实际 handoff 由生产者在完成或失败时生成，不预填 completed／pass。必须包含：

```text
schemaVersion、taskId、workPackageId、attemptId、skill
producerVersion、requestRef、inputRefs
executionStatus
artifacts（kind、rootId、path、实际 hash、schemaVersion）
gate（scope、verdict、criterionRefs、evidenceRefs、reason）
facts、assumptions、unresolved
sideEffects、failures、planDelta、nextRequest
```

先保存并校验产物，再发布 handoff，再由协调者更新 progress。未知与不适用须区分；文件引用存在不等于内容证明业务成功。

## 5. 示范包关键数据模板

下面是字段说明，不是计算器实测记录。每项都由真实操作填入：

| runtimeValue 字段 | 内容 |
| --- | --- |
| name／type | 例如 firstResult／normalized-number-string |
| observedValue | 本次实际读取值，未读到就明确 unknown，不能用 expected 填入 |
| origin | 应用、业务对象、观察方式和当次节点 |
| evidenceRefs | 可核对的本次读取结果和必要截图引用 |
| consumers | 实际使用这个值的后续业务步骤 ID |
| validity | 这是当前示范事实；哪些变化要求重新读取 |
| reacquireOnFreshRun | 任务要求实时结果时为 true |

同时保存实际第二次表达式、模板与 firstResult 的使用关系。只存“计算正确”或最终数值不构成完整的数据交接证据。

## 6. 结果报告模板

```text
任务／scope：
合同、计划、候选版本：
实际宿主与上下文隔离方式：
实际命令及工作目录：
构建、OS、应用、provider 范围：
每个场景的期望／实际／pass|fail|not-run|blocked：
数据来源与消费者核对：
executionId、产物及证据引用：
失败分类与责任 Skill：
已消耗预算、未测项、下一步：
```

取消、缺工具或未执行时报告相应事实，不补造截图，不填写“全部通过”。失败包可供诊断；只有适用 scope 的 Gate pass 才能让正常消费者继续。
