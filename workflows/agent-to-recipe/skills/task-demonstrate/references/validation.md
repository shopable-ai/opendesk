# task-demonstrate｜正确性检查

文件数量、schema 合法、最终代码可运行都不能单独证明示范正确。按以下反证顺序检查。

| 检查 | 正确要求 | 典型错误 |
| --- | --- | --- |
| planned vs actual | 每个 actual 有真实执行来源并关联当时计划 | 从最终 JS 倒造 action；未执行计划写成 actual |
| expected vs observation | Expected 只作比较，observation 来自真实读取 | 因为期望 110 就记录“观察到 110” |
| receipt vs result | 回执与真实 UI/业务后置分别留证 | click ok 就写计算成功 |
| runtime value origin | 值来自明确 read action/application/target | 直接用历史值、JS 算术或 Expected |
| consumers | 每个实际消费者保存 actual input/transform | 只写“firstResult 被使用” |
| repeated input | 保留顺序、次数和原始字符串 | 110 录成 10；前导零丢失 |
| terminal output | 最终实际 read 与 final output 对应 | 直接 return 660，没有终点观察 |
| side effects | unknown/partial 安全停止 | 超时后认为未发生并重试 |
| criteria | 每项 criterion 有实际证据 | 最终数字相同就忽略错误数据来源 |
| provenance | 新补采与旧 execution 时间边界明确 | 用今天的截图补写昨天的历史 |

## Calculator 必过反例

- 代码里写着 `const firstResult = await UI.readText(...)`：只能证明代码有这个调用，不证明本次示范真的执行和读到了值。
- Expected 为 110：不能填入 firstResult；只有实际读取证据才能生成 runtime value。
- 第二次输入出现 1,1,0：必须能追到 firstResult 的本次实际值和 consumer 输入；不能靠最终 660 反证。
- action receipt 全部 ok、但没有结果区 observation：示范不能据此声称业务完成。
- 最终显示 660、但第二式实际输入来自常量 110：违反 runtime data provenance，即使答案正确也应失败。

## 工具覆盖

现有检查器或测试只证明其声明字段/fixture 形状。它们不证明真实桌面发生过、模型 Producer 正确或业务语义无误。没有 Runtime/桌面授权时对应项为 not-run；不能用 fixture 替代。

## 放行

只有六类角色分离、事实来源闭合、consumer 集合完整、criterion 与副作用状态明确，才允许作为正常 S7 输入。关键事实缺失时按 failure-handling 返回。