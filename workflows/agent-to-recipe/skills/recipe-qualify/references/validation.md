# recipe-qualify｜正确性检查

| 检查 | 正确要求 | 典型错误 |
| --- | --- | --- |
| exact object | 实际运行 bytes/hash 与 Candidate 一致 | 临时改码/测试实现替代 |
| predeclared scope | scenario/scopeRefs 运行前固定 | 成功后扩大 scope |
| requested integrity | 未测 requested 保持 not-run/blocked | 移到 excluded 换 PASS |
| oracle separation | Expected 不进入 Candidate | 测试把答案喂回生产脚本 |
| actual observation | 独立结果来源 | 只凭 framework receipt/return code |
| dataflow | 中间 producer→consumer 有执行证据 | 最终值相同就认为数据链正确 |
| one run | 只证明一次 | 一次 run 声称 repeatable |
| parameterization | 同候选合法变参、无需改码 | helper 参数存在/改源码后算变参 |
| environment | 结论限定实际环境 | 单平台 pass 推到所有平台 |
| repair routing | 不在 S12 改 Candidate | qualification 中 patch 后继续 |
| formal entry | 经正常资格入口核验当前阶段记录、合同及候选绑定 | 只独立调用 Guard，却绕过实际入口 |
| validator object | 报告绑定当前被检对象，显式阻断被消费或由适用证据解除 | 借其他候选报告、顶层 pass 掩盖 dataflow unknown |

方法回归至少覆盖：来源／版本／当前审查齐全的正常请求接受；缺审查、失败上游、错候选或过期报告拒绝；合法分组／复用和等价真实字符串消费不因写法变化被拒；下游资格入口实际消费上述结论。宿主 fixture 只证明确定性拒绝和绑定，独立模型消费与 live 仍须分别验证。

## Calculator 反例

- 一次固定输入 run 得到 660：只支持该次/该范围成功，不证明任意表达式。
- 两次独立 Fresh Run 才可形成 repeatability 证据。
- 要声明 parameterized，必须用不同于示范值的合法输入，通过同一 frozen Candidate/inputContract 执行；不能修改 JS 常量后算“变参”。
- 即使 finalResult=660，如果 second expression 实际使用硬编码 110 而非 runtime firstResult，相关 dataflow criterion 应失败。
- 只有 checker PASS、语法 PASS 或 source review，没有 live execution 时，对 live criterion 只能 not-run/blocked。
