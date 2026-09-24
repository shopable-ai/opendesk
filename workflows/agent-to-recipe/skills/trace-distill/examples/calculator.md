# trace-distill 示例｜Calculator 从原动作到必要步骤

> 本例解释方法，不定义通用规则，不是新的真实执行记录。业务来自 [Calculator 案例](../../../cases/calculator.md)：用按钮输入 `25 × 4 + 10 =`，读取 firstResult，再用按钮输入 `6 × 本次 firstResult =`，读取、打印并返回终值。
>
> 下表 A001—A010、D010—D060 来自 [冻结测试 fixture](../../../../../tests/workflows/fixtures/calculator-artifact-chain/source.json)。该 fixture 明确为 synthetic/fixture-only，不是历史 Dossier；110/660 在需求中是 Expected，在本表中只是合成 observedValue，均不能预填成新运行实际值。fixture 内其他标准产物供检查器测试使用，不能把整份文件交给被测 Producer 当输入；生产评测只交实际获准的合同、actions、Dossier 和必要证据。

## 一、输入：保留动作和数据关系

输入取固定 TaskContract/WorkPlan、Raw Trace/Dossier 的源字段及必要应用材料，不取最终 JS 或标准 Procedure。这里只展示教学切片；正式包还须具备 input-spec 要求的真实身份/观察/政策/固定引用。

| 原动作 | fixture 中的 actual/observation | 作用 |
| --- | --- | --- |
| A001 | 窗口范围记录 | 确认本路径对应哪个应用范围 |
| A002 | 第一段清空 AC 的输入及回执 | 建立第一段输入状态 |
| A003 | 读取 clean，原值 `0` | 检查第一段起点 |
| A004 | 顺序输入 `2,5,×,4,+,1,0,=` 及回执 | 第一式输入的合成记录 |
| A005 | first-result 两次读值均为 `110`，来源标为 UI.readText | firstResult 的读取生产者 |
| A006 | first-result screenshot 标记，fixture=true | 本 fixture 约定的辅助证据边界；不是附有真实截图 |
| A007 | 第二段清空 AC 的输入及回执 | 建立第二段起点，不等于 A002 |
| A008 | 读取 second-clean，原值 `0` | 检查第二段准备状态 |
| A009 | 顺序输入 `6,×,1,1,0,=` 及回执 | 消费 A005 的完整 firstResult |
| A010 | final-result 两次读值均为 `660` | 最终值的读取生产者 |

Dossier 声明 firstResult 来源为 A005、消费者为 A009、只在本 fixture execution 有效且 fresh run 必须重读；finalResult 来源为 A010、消费者为 final output。真实作业仍须交叉核对原 action/observation/目标，不能只信这份摘要。两个合成读值一致不证明真实读取可靠。

## 二、处理：三个不能机械删除的点

### firstResult 读取为什么不能删

A005 不只是“看看第一式有没有算对”，还是 A009 所需值的实际生产者。删除后即使仍然写出 `6×110`，输入也只能来自 Expected、历史值或代码常量，数据流已被替换。必须保留读取来源、完整值、消费者和失效/重读要求。

```text
A005 read → D030.outputs[firstResult]
          → A009 实际字符展开 → D050.inputs[firstResult]
```

这记录的是观察与消费关系，不是授权 S7 把任意数学表达式参数化。

### 第二次清空为什么不能简单删除

A002 是第一段清空动作，清空后的 `0` 来自 A003 的读取；这组证据只支持第一式前的状态。A004/A005 之后状态已经变化。A007/A008 为第二段建立并检查新的干净起点，同时先前保存的 firstResult 应仍可供消费。动作都叫 AC 不表示时刻/前提相同，清空回执本身也不是干净状态的读数。

删 A007/A008 后，原事实没有证明“在第一式结果状态直接输入第二式”仍满足同一过程前提。正确结论是保留；不是断言所有计算器永远需要清空两次。若要证明另一条路径，应取得独立新证据并按原职责修订，不能在 S7 猜测应用状态机。

### 连续数字为什么不能去重

A009 的本值输入片段是 `1,1,0`。两个 `1` 分别占一个数位；变成 `1,0` 已改变值与实际动作次数。即使 A009 仍在 sourceActionRefs 中，也不能算无损提炼。

可以把它们在文档中归到一个“输入 firstResult”步骤，但必须保留原顺序、次数和来源绑定。表示合并不授权改为一次文本粘贴或省略按钮；这种实现选择不由 S7 偷改。

## 三、输出：逐原动作取舍与有序必要步骤

本 fixture 的十项取舍均为 retain，不伪造其中已有 omit 或 recovery。多个 retain 同属一步是合法归组，不意味着物理动作被合并或删除。

| actionRef | decision / stepRef | 必要理由 |
| --- | --- | --- |
| A001 | retain / D010 | 窗口范围 |
| A002 | retain / D010 | 第一段状态准备 |
| A003 | retain / D010 | 第一段干净状态读取 |
| A004 | retain / D020 | 第一式输入 |
| A005 | retain / D030 | firstResult 生产者 |
| A006 | retain / D030 | 此 fixture 约定的辅助证据边界；不泛化为每次必须截图 |
| A007 | retain / D040 | 第二段状态准备 |
| A008 | retain / D040 | 第二段干净状态读取 |
| A009 | retain / D050 | 完整 firstResult 的实际消费者 |
| A010 | retain / D060 | finalResult 读取与最终交付 |

| DistilledStep | sourceActionRefs | 输入/输出、前提与验证 |
| --- | --- | --- |
| D010 准备第一段 | A001,A002,A003 | 范围确定；清空回执＋读取 0，得到第一段干净状态 |
| D020 输入第一式 | A004 | 依赖 D010；保持原顺序与输入回执，不能用回执冒充结果 |
| D030 读取首值 | A005,A006 | 依赖 D020；输出 firstResult，辅助证据不替代实际读值 |
| D040 准备第二段 | A007,A008 | 依赖 D030；保持 firstResult，清空并确认第二段起点 |
| D050 使用首值 | A009 | 依赖 D040 且消费 D030；本值片段 `1,1,0` 不变 |
| D060 读取终值 | A010 | 依赖 D050；输出 finalResult → final output |

这是可读节选，不含正式引用/hash 的完整 JSON；不能直接作为新任务产物发布。视图必须从正式 DistilledSteps 同版生成。

### runtime value 的独立消费说明

| 项目 | firstResult | finalResult |
| --- | --- | --- |
| producer | A005 → D030 的实际读取 | A010 → D060 的实际读取 |
| observedValue/type | fixture 合成 `110` / digit-string | fixture 合成 `660` / digit-string |
| consumer | A009 → D050 第二次输入 | final output（真实任务要求打印/返回） |
| transform | digit expansion：逐字符形成 `1,1,0` | 按实际交付格式保留，不从期望生成 |
| 下游不得替换 | 不能把 observedValue 变成参数/配置常量 | 不能删除终点读取并返回 660 常量 |
| 新运行 | 必须从本次读取重新取得 | 必须从本次终点重新读取 |

旧 fixture 使用字符串 origin，缺少正式结构化应用身份与 consumerBindings，不把这些教学说明倒填成其原始字段。新结构化输入充分性包应在有真实来源时保存 origin 的 action/application/target，以及每个 consumer 的 actionRef/targetId/transform/observedInput。缺这些来源就补交/补证，不按本例猜造。

## 四、merge/omit/recovery 的独立补充练习

以下 H-* 是**另外构造的教学条件，不存在于 A001—A010**，不是对原 Calculator 历史的改写：

| 条件输入 | 处理与输出 | 会使该判断失效的情况 |
| --- | --- | --- |
| H-M1/H-M2 是相邻的两个有据输入，目标不变，中间无读取/等待/检查边界 | 可在一个必要步骤中表示，逐项保留来源、顺序、输入和次数，记录 merge 的理由 | 合并时删重复字符、改操作类型或跨越数据/状态边界 |
| H-O1 是无 UI 副作用的额外诊断观察；所需验证已由其他证据覆盖，合同不要求它、也无消费者 | omit 其正常执行步骤，但保留原动作、已有证据及具体理由 | 它其实是唯一状态检查、安全门禁、必要读值或约定证据 |
| H-R1 是旧失败 attempt 的观察/恢复经验；另一个完整成功 attempt 有独立已验证起点 | 旧失败经验进入 recoveryCandidates，注明触发/效果/未知，不拼成正常路径 | 成功后缀仍依赖被移走的恢复动作、恢复值被当正常 producer |
| H-U1 输入超时、实际效果 unknown | unresolved/blocked，交原现场责任核对效果 | 不得按“估计没点到”直接重试或 omit |

不存在这些条件就不能照抄结论。此练习不证明运行时恢复策略已可靠，也不表示 S7 有桌面操作授权。

## 五、错误输出及返回

删 A005：由 S7 修必要读取/生产者映射；若原读取证据本来缺失则回 S3—S6。删 A007 或把 A009 去重：原事实完整时只修 S7，不重做业务。把 firstResult 参数化为 110：已进入 S9 的错误解释由 S8—S9 修，不能让 S10 用定位规则掩盖。

只保留 `prepare → calculate → finish` 不能交付：S9 仍不知道首值来源、第二段状态前提、具体消费者和字符变换。正确交接让 S9 取得这些必要内容，但不通过 lineage 偷渡整个历史。

迁移练习：把来源换成工单页面读取的 `0040`，一个动作按原文本查询、另一个动作按字符输入。仍需一个真实 producer、两个独立 consumerBindings，分别记录 identity/characters，保留前导零、必要等待和终点状态读取。应用按钮、表达式、数值与窗口尺寸不进入通用方法。
