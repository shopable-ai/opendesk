# procedure-synthesize 示例｜Calculator 的 Business Step 与数据关系

> 本例只解释 S8-S9 方法，不定义通用 Calculator 规则，也不把 frozen fixture 当作新的真实执行证据。

## 输入

S7 已经给出必要路径，例如：

```text
D010 prepare first expression
D020 enter first expression
D030 read actual first result
D040 prepare second expression
D050 consume actual first result
D060 read final result
```

S8 接收这些固定 DistilledSteps，先形成 Business Steps checkpoint；S9 消费已通过的 S8 结果再收敛复用规格。两者都不重新读取 Raw Trace 决定是否删动作。

## Business Step 映射

一种可消费的业务组织可以是：

```text
B010 准备第一段计算
B020 输入第一式
B025 读取第一次实际结果 → firstResult
B030 准备第二段计算
B040 使用 firstResult 输入第二式
B050 读取最终结果 → finalResult
```

这里的 Business Step 是对 S7 必要步骤的业务表达，不是最终 API 调用。

## 从通用地图裁剪到本例（填写后的教学视图）

依据是本页方法示例及[Calculator 演练](../../../cases/calculator-execution-walkthrough.md)的参考范围，不是本次现场输入；不得把表内内容复制为真实 S8/S9 Actual。隔离 Producer 不提前读取未来答案。

| 问题 | 本例决定及依据 | 成果/消费者 | 仍不能声称什么 |
| --- | --- | --- | --- |
| 任务形态 | 单窗口、两段串行；中间实际读数继续参与输入 | B010—B050；S9 过程顺序 | 不证明批量、分页、跨应用或长期运行 |
| 数据传递 | B025 真实读数给 B040；清空 UI 不清掉任务变量 | dataDependencies 与 S11 consumer | 不能用 Expected、固定 110 或调用者覆盖 firstResult |
| 复用边界 | B010/B030 共享准备目的；B020/B040 使用按钮输入意图；B025/B050 使用读取意图 | 应用规则/helper 的合同需求 | 名称相似不证明两个上下文前置相同，不能盲目合并 |
| 选型与证据 | 本页不持有本次 selected canonical 和现场验证；必须从固定上游取得 | capabilityDecisions；缺口交原责任 | 不能根据参考 JS 写本次 runtimeValidation=pass |
| 备用与兼容 | 本页不提供已验证备用；其他版本、布局、语言仍需实际规则与证据 | S10 scope/limits；S12 对应场景 | 不需要备用不等于默认方法已验证；不能默加坐标路径 |
| 模块组织 | 普通 helper 已可表达本例；是否跨文件由实际复用需求决定 | S11 Candidate | 不因总框架包含 ESM 就强制重构 |

### 操作合同怎样交给应用工程

以下是业务意图，不是已实现 API 或新的正式 ID。真正函数名与源码由 S11 在固定应用规则上落实。

| 操作意图 | 消费者与输入来源 | 应达到什么状态/输出 | 失败约束 |
| --- | --- | --- | --- |
| 准备下一表达式 | B010/B030；当前应用状态 | 足以开始相应表达式；B030 后 firstResult 仍存在 | 仅显示默认值不自动证明所有旧运算状态清除；缺证交 S10 |
| 按按钮输入 | B020 固定输入；B040 消费本次 firstResult 全部字符 | 正确目标中的有序操作及可核对后置 | 中途已执行前缀不能从头重放；效果未知先核对 |
| 读取当前显示 | B025/B050；正确结果区 | 实际值、来源和有效性，供 B040 或最终输出 | 读取失败停止依赖动作，不提供答案默认值 |

实际工作包从 `stage-review.md` 进入 S8 的 `business-steps.md`、S9 的 `procedure.md`，再查 S10 `operation-rules.md`、S11 `candidate-summary.md`；机器权威与版本对应关系见[产物链](../../../cases/calculator-artifacts.md)。本页是教学样本，不新建实际运行文件。

## firstResult 的 producer / consumer / transform

**Producer**

```text
producer = B025
source = D030
meaning = 第一次计算后的实际 UI 读取
```

producer 不是“25 × 4 + 10 的数学计算”，也不是 Expected 110。它必须来自实际 read。

**Consumer**

```text
consumer = B040
input = firstResult
```

consumer 是第二次计算业务步骤，而不是抽象的“后续逻辑”。

**Transform**

本次示范如果实际把字符串 `110` 逐字符输入，则：

```text
actual transform = characters/digit expansion
"110" -> ["1","1","0"]
```

它不是：
- 用 JS 重新计算 110；
- 用固定常量 110；
- 把 firstResult 当 parameter 默认值。

未来是否允许 identity、characters 或其他 transform，需要业务政策支持；一次 actual transform 不能自动定义所有未来允许策略。

## 参数化边界

Calculator 里的固定业务输入 25、4、10、6 是否做 caller parameters，要由 TaskContract/支持范围决定；即使参数化，也不能把 firstResult 变成调用者参数，因为它是运行过程中由 B025 产生的 runtime value。

错误：

```text
parameters.firstResult.default = "110"
```

正确：

```text
runtimeValues.firstResult.producer = B025
runtimeValues.firstResult.consumers = [B040]
dataDependencies = B025 -> firstResult -> characters -> B040
```

## 终点

B050 读取 finalResult 并映射到 final output。因为它没有后续计算消费者，并不意味着它可以被删除；终点输出本身就是消费目的。

## 错误案例

1. S9 发现 D040 看起来“多余”就删掉：越权，动作必要性属于 S7。
2. 因 Expected=110 就把 B040 输入写死 110：破坏 runtime provenance。
3. 只写 firstResult 的 producer，不写 B040 consumer：S11 无法知道业务数据流。
4. 用同一步第一个 consumer 的 transform 覆盖其他 consumer：多消费者数据关系不完整。
5. API 文档存在就把 capability runtimeValidation 写 pass：文档证明契约，不证明实际运行。

## 输出

最终 SemanticProcedure 应使下游无需看全量 Raw Trace，也能准确实现上述 Business Steps、runtime data dependency、参数边界、终点和支持范围。