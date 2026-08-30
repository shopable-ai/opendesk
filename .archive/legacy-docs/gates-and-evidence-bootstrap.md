# GATES_AND_EVIDENCE

- 更新时间：2026-04-03
- 原则：**没有证据，不算通过；没有工件，不算完成。**

## 1. 总体原则

每一个“可以继续下一步”的结论，都必须回答：

1. 依据是什么？
2. 证据落在哪里？
3. 满足了哪个 gate？

## 2. 阶段门禁

### Gate P0：框架基线就绪（本轮目标）

**目标**：把持续化开发框架搭起来。

**必须工件**：
- `docs/ACTIVE_CONTEXT.md`
- `docs/SOLUTION_OPTIONS.md`
- `docs/RUNBOOK.md`
- `docs/FAILURE_TAXONOMY.md`
- `docs/GATES_AND_EVIDENCE.md`
- `artifacts/bootstrap-round-01/solution-scorecard.json`
- `artifacts/bootstrap-round-01/selection-decision.json`
- `.runtime/preflight/current/latest.json`
- `replays/round-01-minimal-loop.json`

**不通过条件**：
- 没有方案矩阵
- 没有 preflight
- 没有 stop / escalation 条件
- 没有 replay case

### Gate P1：最小闭环跑通

**目标**：跑通 `capture -> detect -> mirror -> compare`

**必须工件**：
- `capture/source.png`
- `detect/regions.json`
- `mirror/index.html`
- `mirror/mirror.png`
- `compare/report.json`
- `compare/diff.png`
- `decision.json`
- `audit.ndjson`

**不通过条件**：
- 只有截图，没有结构化 JSON
- 只有 mirror，没有 compare report
- compare report 不能定位问题

### Gate P2：恢复与发送前门禁

**目标**：在最小闭环稳定后，才允许扩展到自动发送。

**必须工件**：
- 至少 1 套真实微信 golden/replay 样本
- 至少 3 类 failure case 被记录并可复现
- pre-send verification 规则
- send 后回读验证

**不通过条件**：
- 没有上下文确认就发送
- 发送后没有状态回读
- 识别置信度不足却没有人工确认

## 3. 每次 run 的最低证据包

建议目录：

```text
artifacts/runs/<run-id>/
  requirement.json
  preflight.json
  capture/
  detect/
  mirror/
  compare/
  audit.ndjson
  decision.json
```

最低要求：

- 输入说明（目标窗口/截图来源/参数）
- preflight 结果
- 原始截图
- 结构化 region JSON
- mirror 输出
- compare 输出
- decision
- 失败时的错误分类

## 4. Hard Gate vs Soft Gate

### Hard Gate

- 关键 schema 可校验
- 关键产物存在
- preflight 非 fail
- 至少一个 deterministic verifier 可运行

### Soft Gate

- 视觉偏差持续下降
- role inference 趋稳
- diff 报告可直接指导修复

## 5. Stop Conditions

满足任一条件时，停止当前自动扩展：

1. preflight fail
2. 工件缺失，无法回放
3. 连续两轮无新增证据
4. 发送/恢复动作已进入高风险区但无验证护栏

## 6. Escalation Conditions

满足任一条件时，交由人工判断：

1. 权限/环境问题无法自动解决
2. UI 大改导致现有规则系统性失效
3. diff 与人工视觉判断长期冲突
4. 新信号源（如 Accessibility tree）可能改变主线选型
