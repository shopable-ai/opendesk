# Agent-to-Recipe｜执行入口与断点恢复协议

本文是 Agent / Codex 实际启动和接续 `workflows/agent-to-recipe` 的**执行入口**。

它不重新解释 S1—S12 的专业方法，也不保存业务事实。人类理解生命周期读 [WORKFLOW.md](WORKFLOW.md)；机器阶段映射读 [workflow.yaml](workflow.yaml)；request / handoff / artifact 合同读[共享合同](../../docs/frameworks/agent-to-recipe-skill-contract.md)。

## 1. 用户只需要一句中文触发

新任务示例：

```text
用 Agent-to-Recipe 完成：<自然语言需求>
```

中文别名：

```text
用需求转自动化脚本工作流完成：<自然语言需求>
```

接续任务示例：

```text
继续 Agent-to-Recipe：<task-id 或 .runtime/automation-authoring/<task-id>/>
```

这些是自然语言路由示例，不是必须精确匹配的命令语法。用户不需要复制长 Prompt、Skill 路径、S1—S12 规则或 checker 命令。

## 2. 触发以后 Agent 自动做什么

```text
AGENTS.md 识别 Agent-to-Recipe 意图
  ↓
读取 RUN.md + workflow.yaml
  ↓
新任务：创建 task root / user-task.md / compact progress.json
接续：读取已有 compact progress.json
  ↓
只加载当前阶段需要的 Skill + 正式 inputRefs
  ↓
执行当前阶段
  ↓
固定 artifact / evidence / handoff
  ↓
运行现有 checker
  ↓
更新 progress.json + stage-review.md
  ↓
继续下一阶段，或回真实 failure owner
```

**不要一次性读取所有 Skills、所有案例、所有历史 attempt 或完整 `stage-review.md`。** 默认采用按需加载：先读小状态，再读当前阶段，再在失败时下钻对应证据。

## 3. `progress.json` 只做“小状态索引”

`progress.json` 不是日志、不是聊天记忆、不是第二套证据库，也不能覆盖 checker。

推荐形状：

```json
{
  "schemaVersion": "agent-to-recipe/progress/v1",
  "taskId": "calculator-001",
  "workflow": "agent-to-recipe",
  "planRevision": "r001",
  "status": "running",
  "currentStage": "S7",
  "lastConfirmedStage": "S6",
  "firstInvalidBoundary": null,
  "activeAttemptId": "a008",
  "activeWorkPackageId": "W070",
  "reviewRef": "attempts/a008/review.json",
  "next": {
    "stage": "S7",
    "owner": "trace-distill",
    "mode": "normal"
  },
  "safety": {
    "sideEffectState": "known"
  }
}
```

只保存“现在在哪里、下一步找谁、关键引用在哪里”。以下内容不得塞进 `progress.json`：完整 artifact、Raw Trace、Evidence、聊天历史、阶段全文、长错误日志、全部历史状态。

历史已经由这些文件保存：

```text
attempts/*/request.json
attempts/*/handoff.json
阶段主产物
Execution evidence
stage-review.md（人工投影）
```

因此恢复时读取 `progress.json` 不应造成上下文膨胀。`workflow.yaml` 还给出 `maxProgressBytes` 防止它退化成事件日志。

## 4. 新任务启动协议

1. 固定当前仓库版本；不要依赖旧聊天中的 SHA。
2. 保存用户原始需求为 `<task-root>/user-task.md`。
3. 初始化 compact `progress.json`，当前阶段为 S1。
4. 加载 S1 对应 `automation-plan/SKILL.md` 和正式允许输入。
5. 完成 S1 后固定产物、发布 handoff、执行阶段 checker。
6. 只有 Gate 允许时才推进到下一阶段。
7. 后续阶段重复同一循环，直到 S12 对同一冻结 Candidate 完成 Qualification。

用户触发工作流，不等于自动授权任何敏感桌面副作用；实际权限仍来自 request / authority。

## 5. 断点恢复协议

恢复时**不要相信聊天说“执行到 S9”就直接从 S9 继续**，也不要默认从 S1 重跑。

恢复顺序：

```text
progress.json（快速定位）
  ↓
当前 request / handoff / artifact refs
  ↓
重新运行对应 stage checker
  ↓
得到 firstInvalidBoundary / failureOwner
  ↓
保留仍有效上游
  ↓
只失效真正依赖错误输出的下游
  ↓
创建新的 targeted request
  ↓
继续
```

如果 `progress.json` 与实际 artifact/checker 冲突，**checker + 固定证据优先**，并修正 progress。

恢复时默认不需要全文读取 `stage-review.md`；先由 checker 重建机器结论，需要人工诊断时才读取首屏或对应 `## Sx` 小节。

## 6. 中断发生在真实桌面动作附近

如果动作是否已经产生副作用不确定：

```text
unknown side effect
→ 停止自动重放
→ 先重新观察实际对象
→ 确认当前状态
→ 再决定 continue / repair / stop
```

不能因为进程崩溃、超时或没有收到返回值，就自动再次点击、提交、发送或删除。

## 7. 每个阶段的固定执行循环

协调层只做下面七件事：

```text
1. 定位当前阶段
2. 验证输入是否 ready
3. 加载当前阶段 Skill
4. 创建 / 固定 request
5. 等待专业职责产出 artifact / handoff
6. 运行现有 checker
7. 更新 compact progress 与人工 review
```

协调层**不代替 Skill 做专业判断、不修改业务事实、不为了 PASS 改验收标准**。

`workflow.yaml` 只拥有静态顺序、owner、mode、produces 和恢复策略；专业方法继续归 `skills/*/SKILL.md`，字段合同继续归共享合同，评分/Gate 继续归验证计划和 checker。

## 8. `workflow-runner.js` 的边界

`workflow-runner.js` 是确定性的薄工具，不是另一个 Agent：

- 初始化 compact progress；
- 读取/显示当前状态；
- 使用现有 `check-workflow-stage.js` 重算阶段结果；
- 用 checker 结果覆盖过期的进度索引；
- 重生成 `stage-review.md`；
- 给出下一阶段 / owner / mode。

它**不调用模型、不执行 Skill、不执行桌面动作、不自行判断业务正确性**。真正的 Agent 宿主仍由自然语言触发后按照本协议调用相应 Skill / 工具。

`workflow.yaml` 采用 YAML 1.2 允许的 JSON 兼容子集，这样 Node 可以零依赖读取，避免为了一个静态阶段表再引入 YAML 解析依赖。

## 9. 完成边界

只有下面条件同时成立，任务才是完整完成：

```text
S1—S11 的适用输入/产物/证据/Gate 有效
AND
S11 Candidate 已冻结
AND
S12 对同一个 Candidate 做 Fresh Run Qualification
AND
requested scope 没有被 not-run / blocked 冒充 PASS
```

Delivery / Publish 仍是 S12 后的外部边界，不新增 S13。
