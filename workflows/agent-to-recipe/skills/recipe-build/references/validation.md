# recipe-build｜正确性检查

| 检查 | 正确要求 | 典型错误 |
| --- | --- | --- |
| Procedure mapping | 每个 Business Step 有实现 | JS 重设计/删业务步骤 |
| runtime producer | 真实 read/helper return | hardcoded/Expected/历史值 |
| consumer binding | consumer 实际接收 producer 值 | sourceMapping 写对但调用仍用常量 |
| transform | 只做 Procedure 允许的变换 | 临时 number cast/重算改变业务含义 |
| parameter entry | inputContract 真流到业务 call | helper 参数化但主入口写死 |
| failure stop | unknown/invalid 在副作用前后正确停 | catch 后继续点击/提交 |
| async order | await 与顺序保持语义 | 未等待读取完成就消费 |
| terminal | final read/return/print 可达 | 只输出 Expected/常量 |
| candidate freeze | hash 对应实际 bytes | 改码后继续引用旧 Candidate |
| scope | 实现与原支持范围一致 | limitations 偷偷缩任务 |

## Calculator 反例

- 正确：`const firstResult = await read...; ...firstResult...`
- 错误：`const firstResult = "110"`
- 错误：先真实 read，但第二式仍使用常量 `110`
- 错误：`const firstResult = 25*4+10`
- 错误：return 660 但没有 final UI read
- 错误：函数接收参数，但 entry 永远调用 `run(25,4,10,6)` 却宣称 parameterized。

静态 checker 只能证明其覆盖的代码模式/引用关系，不能证明真实 Runtime、UI 或 Fresh Run。