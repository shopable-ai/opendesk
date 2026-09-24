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

S9 接收这些固定 DistilledSteps；不重新读取 Raw Trace 决定是否删动作。

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