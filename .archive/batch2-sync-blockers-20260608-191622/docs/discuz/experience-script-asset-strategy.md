# 自动化经验沉淀与智能脚本资产策略（降 Token / 少现写代码）

更新时间：2026-03-02
适用对象：testMonkey-go 自动化框架与 AI Agent 执行层

---

## 1. 核心结论
是的，这个方向必须做，而且应作为 v2 的核心能力之一：

- 不要让 AI 每次都“从零生成脚本代码”。
- 要让 AI 优先复用“经验资产”（模板脚本、流程配方、策略规则）。
- 让 AI 从“代码生成器”转为“资产选择器 + 参数填充器 + 异常修正器”。

这样可以显著降低：
1. Token 成本
2. 执行不稳定性
3. 每次任务的冷启动时间
4. 因随机生成导致的行为漂移

## 2. 目标场景

### 2.1 典型痛点
- 同一个软件（如客服工具、ERP、浏览器后台）每次都做类似操作。
- 目前流程是“让 AI 现写脚本 -> 执行 -> 失败再改”。
- 大量重复 prompt 与重复代码生成消耗 token。

### 2.2 目标状态
- 同类任务优先匹配已有脚本资产。
- AI 只做：
  - 参数补全
  - 小范围策略调整
  - 异常 fallback 选择
- 仅在资产库找不到可用方案时才生成新脚本。

## 3. 资产分层模型（建议）

### L0：基础动作片段（Snippet）
- 例如：点击、输入、截图、窗口聚焦、等待条件。
- 特点：小、稳定、可组合。

### L1：软件级配方（Recipe）
- 面向某个软件/页面场景（如“打开会话窗口并发送文本”）。
- 参数化：账号、关键词、窗口标题、重试策略。

### L2：任务工作流（Workflow）
- 多步骤串联（含条件分支、失败补偿、人工接管节点）。
- 适合“长期分步执行”的业务流程。

### L3：策略与经验规则（Policy/Heuristic）
- 哪些操作高风险需二次确认。
- 哪些 UI 变化可自动降级处理。
- 哪些错误可重试、哪些必须停止。

## 4. 元数据与索引设计（让 AI 能检索）

每个 Recipe/Workflow 必须有 manifest（建议 JSON/YAML）：

```yaml
id: qn_send_goods_v3
name: "千牛-发送商品流程"
app: "qianniu"
app_version: ">=9.40"
platform: ["windows", "macos"]
intent_tags: ["send_goods", "chat_reply", "order_panel"]
inputs:
  - name: customer_name
    type: string
  - name: product_keyword
    type: string
preconditions:
  - "window.title contains '千牛'"
  - "network.ok == true"
steps_ref:
  - "snippets/window_focus"
  - "snippets/search_customer"
  - "snippets/copy_and_send_product"
fallbacks:
  - on: "E_UI_SELECTOR_NOT_FOUND"
    use: "qn_send_goods_v2"
success_signals:
  - "message_panel has product_card"
risk_level: "medium"
owner: "automation-team"
last_verified_at: "2026-03-02"
success_rate_7d: 0.93
avg_duration_sec: 18
```

### 检索键
- `app`
- `intent_tags`
- `platform`
- `risk_level`
- `success_rate_7d`
- `last_verified_at`

## 5. Agent 执行策略（先检索，后生成）

### 5.1 决策顺序
1. 解析用户意图 -> 映射 `intent_tags`。
2. 查询资产库（按 app/platform/version 过滤）。
3. 选择“成功率高 + 最近验证通过”的 Recipe。
4. 仅填参数执行，不生成新代码。
5. 若失败：尝试 fallback Recipe。
6. fallback 全失败，才触发 AI 生成新脚本，并回写为候选资产。

### 5.2 Token 优化收益来源
- 长上下文替换为短 `recipe_id + params`。
- 不再每次给模型大量 API/示例代码。
- 只在变更场景发送局部差异信息。

## 6. 经验沉淀闭环（执行后自动学习）

每次任务结束后自动写入 Experience Record：
- `taskId/sessionId`
- `recipe_id`
- 参数摘要（脱敏）
- 失败点（step + errorCode）
- 修复动作
- 最终结果
- 耗时与重试次数

### 自动升级机制
- 连续 N 次成功：提升 recipe 权重。
- 连续 N 次失败：标记 `stale`，进入复核队列。
- AI 新生成脚本先进入 `candidate`，人工/评测通过后再升为 `stable`。

## 7. API 与目录建议

### 7.1 API
- `GET /v1/recipes?app=&intent=`：检索配方。
- `POST /v1/recipes/:id/run`：按配方执行（参数化）。
- `POST /v1/recipes/:id/verify`：回归验证。
- `GET /v1/recipes/:id/stats`：查看成功率与稳定性。
- `POST /v1/experience/ingest`：写入执行经验。

### 7.2 目录

```text
automation/
  assets/
    snippets/
    recipes/
    workflows/
    policies/
  experience/
    records/
    rollups/
```

## 8. 治理机制（避免资产库劣化）

### 8.1 版本化
- `recipe_id@semver`
- 兼容窗口与废弃时间明确。

### 8.2 审核流
- `candidate -> verified -> stable -> deprecated`
- 高风险流程必须人工审核后 `stable`。

### 8.3 质量门禁
- 每次发布至少回归 Top20 高频 Recipe。
- 低于阈值（如 85%）自动降级或冻结。

## 9. 与 AGENTS.md 的协同

`AGENTS.md` 不应只写 API 文档，还应注入：
- 推荐优先使用的 `recipe_id` 列表。
- 各软件高成功率流程清单。
- 常见失败与 fallback 指南。

这样 AI 读取后会优先复用资产，而不是重新生成脚本。

## 10. 可执行路线（4 周）

### Week 1
- 建立 Recipe manifest 规范。
- 先录入 10 个高频流程（手工整理也可）。

### Week 2
- 增加 Recipe 检索与参数执行 API。
- Agent 决策链改为“检索优先”。

### Week 3
- 加入 Experience Record 采集。
- 增加成功率统计与 stale 检测。

### Week 4
- 将 Top20 流程纳入回归门禁。
- `AGENTS.md` 自动注入“推荐 Recipe 清单”。

## 11. 验收指标（量化）
1. `recipe_reuse_rate`：复用率（目标 > 70%）。
2. `token_per_task`：单任务 token 消耗下降比例（目标 > 40%）。
3. `first_run_success_rate`：首轮成功率提升（目标 +15%）。
4. `manual_intervention_rate`：人工介入率下降。
5. `avg_repair_rounds`：失败后平均修复轮次下降。

## 12. 风险与对策
- 风险：资产过时导致误执行。
  - 对策：`last_verified_at` + 定期回归。
- 风险：资产过多检索混乱。
  - 对策：按 app/intent/risk 分层索引。
- 风险：AI 仍偏向生成代码。
  - 对策：在策略层强制“检索优先，生成兜底”。

## 13. 给当前项目的直接动作
1. 在 v2 清单中新增“经验资产库”任务。
2. 先把现有 `examples/app/*.js` 转成 Recipe 原型。
3. 定义最小 metadata 字段并存到仓库。
4. 将失败任务自动沉淀为 Experience Record。

---

一句话策略：
- 把“经验”做成结构化资产，把 AI 从“每次写代码”升级成“优先复用资产 + 智能修正”。
