# Calculator 反方审计记录｜2026-09-30

## 1. 审计对象

仓库：`shopable-ai/opendesk`

核心对象：

- `workflows/agent-to-recipe/cases/calculator.md`
- `examples/agent-to-recipe/calculator.js`
- `workflows/agent-to-recipe/design/task-decomposition.md`
- `workflows/agent-to-recipe/WORKFLOW.md`
- `workflows/agent-to-recipe/design/validation-plan.md`

本轮目标不是重新设计 S1—S12，而是检查 Calculator 是否真正具备“人工可读正确参考 + 反向审计工作流”的职责。

## 2. 本轮反方发现

### 2.1 S10 与历史 fresh candidate 曾存在清空语义冲突

`calculator.md` 的 S10 已经明确：仅看到显示 `0` 不能证明 Calculator 已彻底清除上一段计算状态；需要区分“清除 / 全部清除”等状态语义，并依据真实后置观察放行。

旧 `examples/agent-to-recipe/calculator-fresh-20260927.js` 仍采用单次“清除”后只检查显示为 `0` 的策略，因此不再适合作为正文当前 Candidate 参考。

本轮将正文当前参考切换到 `examples/agent-to-recipe/calculator.js`，历史 fresh candidate 只保留为历史材料。

### 2.2 S2 需要显式保留 Capability Discovery

Calculator 作为反向校准案例，不应只显示“找窗口 / 找按钮 / 找结果区”，还应让人工可以检查：

```text
当前业务问题
→ 发现已有能力
→ 比较候选方法
→ 读取 selected method canonical contract
→ 当前环境验证
→ 形成最小 AppProfile
```

本轮已把这条链补入 S2。

### 2.3 Reference fixture 与真实 Actual 必须显式隔离

A004/A005/A007 等编号用于说明“正确阶段产物应该怎样保留事实”，不是本文声称刚刚发生的一次新桌面 execution。

本轮在首次出现这些编号前增加了显式阅读边界。

### 2.4 需要业务真相层，避免用工作流证明工作流

如果 Calculator 只按 S1—S12 展开，再拿它反向证明 S1—S12 正确，会出现循环校准。

本轮新增 R1—R8：

- R1 第一次计算必须通过 Calculator 按钮输入；
- R2 firstResult 必须来自本次真实读取；
- R3 firstResult 必须保存为运行时数据；
- R4 清空 UI 不能删除 firstResult；
- R5 第二次必须真实消费 firstResult 全部字符；
- R6 finalResult 必须来自本次真实读取；
- R7 最终 print + return finalResult；
- R8 Expected 110/660 不得进入 production runtime data path。

这些事实直接来自原始需求，用来攻击 WORKFLOW、design 和 Skills。

## 3. 本轮修改结果

### calculator.md

保留完整 S1—S12 人工可读参考，不做阶段主线削弱。

新增：

- 不依赖 S1—S12 的业务真相 R1—R8；
- S2 Capability Discovery / Method Selection / Contract Reading / Runtime Validation；
- Reference fixture 与真实 Actual 的隔离说明；
- S10 “显示 0 不等于完整 reset”的关键反例；
- 反方测试矩阵，用故意破坏方式验证首错归属。

下沉：

- 具体历史环境；
- .runtime 路径；
- 旧 fresh candidate 身份；
- hash / execution 等历史证明细节。

### calculator.js

对齐原始业务要求：

```text
真实读取 finalResult
→ console.log(finalResult)
→ return finalResult
```

不再以调试对象作为最终业务返回值。

## 4. 当前人工审计评分

这不是 S1—S12 的正式运行 Gate，也不是对 Skill 成功率的声称；只是 Calculator 作为“黄金参考案例 / 反向审计工具”的文档质量评分。

| 维度 | 当前 |
| --- | ---: |
| 原始需求与业务真相独立性 | 25/25 |
| S1—S12 可读参考完整性 | 20/20 |
| Reference / Actual / Evidence 隔离 | 19/20 |
| 反向定位 WORKFLOW / Skill 错误能力 | 20/20 |
| 信息层级与维护成本 | 14/15 |
| **合计** | **98/100** |

保留扣分：

- 历史材料仍保留最小附录引用，避免完全丢失设计考古入口；
- 当前没有执行新的真实桌面 Fresh Run，因此不能把本轮静态修改称为新的 S12 Qualification。

## 5. 本轮没有证明的事情

本轮没有证明：

- 当前 Calculator 在所有 macOS / locale / layout 下都稳定；
- `calculator.js` 已经取得新的 Fresh Run Qualification；
- 所有 Skills 在新 Agent 独立上下文中都能稳定产生相同结果；
- WORKFLOW 所有阶段都已经有真实 L2/L3/L4 行为证据。

这些仍应由对应行为验证和 Qualification 独立完成。

## 6. 后续反向校准方式

后续优先使用以下顺序：

```text
原始需求
↓
R1—R8
↓
Calculator S1—S12 Reference
↓
反方测试矩阵
↓
逐个攻击：
  WORKFLOW
  task-decomposition
  acceptance-map
  Skills
↓
定位第一个无法保持 R1—R8 的 owner
↓
只修改真正责任方
```

不应再通过增加更多 Calculator 工程细节来提高“完整度”。
