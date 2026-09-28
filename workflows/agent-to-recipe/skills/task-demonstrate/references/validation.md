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

## 按正式阶段定位第一个错误

| 阶段 | 只在本阶段失败的典型反例 | 不应怎样修 |
| --- | --- | --- |
| **S3 Execute** | planned step 存在，但没有真实 action；actual target/request 来自后写脚本 | 不把计划补写成历史，不用 S4/S6 成功倒证 S3 |
| **S4 Observe / Verify** | action 真实发生，但 receipt 被当成业务 observation；Expected 被填入 actual | 不重放已发生动作来制造“更好看”的 observation |
| **S5 Classify / Decide** | S4=uncertain 仍 continue；side effect unknown 仍 retry；错误分类导致跳过必要恢复 | 不改写 S3/S4 事实，只修 decision / planDelta |
| **S6 Close** | S3—S5 事实正确，但 Dossier 丢 consumer、side effect、criterion 或把 partial 写 complete | 不回写上游 trace；修收口与覆盖范围 |

独立审阅必须能够指出 `last confirmed correct artifact → first invalid stage`。如果只能说“task-demonstrate 错了”而不能区分 S3/S4/S5/S6，阶段诊断仍不完整。

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