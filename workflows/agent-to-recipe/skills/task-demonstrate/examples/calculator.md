# task-demonstrate 示例｜Calculator 的计划、执行、观察与数据消费

> 本例解释方法，不定义 Calculator 通用规则，也不是新的真实桌面证据。业务是：通过按钮输入 `25 × 4 + 10 =`，实际读取 firstResult，再以本次 firstResult 输入 `6 × firstResult =`，实际读取并返回终值。

## 输入

进入 S3-S6 时已有固定 TaskContract、WorkPlan 和当前应用规则。计划可写：

```text
P10 准备第一段状态
P20 输入第一式
P30 读取 firstResult
P40 准备第二段状态
P50 用 firstResult 输入第二式
P60 读取并交付 finalResult
```

这只是 planned，不证明任何一步已发生。

## 六类事实如何分开

| 角色 | Calculator 教学示例 |
| --- | --- |
| planned | P30 要读取第一次结果 |
| expected | 合同本例可预期第一次结果应满足对应 criterion；即使写明 110，也只是 Expected |
| actual | 真正调用结果读取 API 的 action A005 及其回执 |
| observation | A005 从结果区实际读到的原始文本，例如本次证据中的 `110` |
| runtime value | 将这次 observation 保存为 firstResult，origin=A005，fresh run 必须重读 |
| consumer | A009 实际第二式输入中把 firstResult 按字符 `1,1,0` 使用 |

Expected=110 不能生成 observation=110；代码中存在 readText 也不能生成 A005。只有真实执行/读取材料才可以。

## 微循环

P20 输入第一式时，实际输入顺序、目标和 completion receipt 记录为 actual。随后 P30 真正读取结果区，把读到的文本作为 observation。若实际读到 `110`，它既可以参与“第一式结果是否符合 Expected”的验证，也成为 runtime value firstResult。

P40 的第二次状态准备必须记录它真实做了什么以及后置 observation；不能因为最终代码里有 clear 就假定当时真的清空。

P50 的 consumer 记录应足以表达：

```text
value: firstResult
producer: A005 / result display
consumer: A009 / second expression
actualTransform: characters
actualInput: ["1","1","0"]
```

这说明“本次怎么用了值”，但不决定未来通用 Procedure 是否允许 characters；允许策略由后续业务过程确认。

## 错误案例

**错误 1：从最终代码反推执行。**

```text
calculator-current.js 有 clear/read/click
→ 所以示范一定按这些步骤发生
```

错误。代码是实现资产，不是本次 historical actual/evidence。

**错误 2：用答案补读值。**

最终结果 660 且 Expected 首值 110，因此把 firstResult 写成 110。错误。缺 A005 真实读取时，应返回补证或 unknown。

**错误 3：只记录“使用 firstResult”。**

如果没有 A009 的 actual input/transform，就无法知道是字符展开、identity、复制粘贴还是常量替换。下游不能猜。

**错误 4：receipt 当 observation。**

按钮 API 全部返回 ok，但没读结果区。只能证明动作回执，不证明第一次结果或最终业务结果。

## 输出

完整 Dossier 应让 S7 看见 P10-P60 与 actual 的对应、所有 observation、firstResult/finalResult 的 origin 与 consumers、sideEffects、偏差和 criterion 证据。

example 只解释上述关系。110/660、按钮名称、窗口限制都不进入通用 Skill。