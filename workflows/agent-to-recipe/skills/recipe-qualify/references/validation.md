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

## Calculator 反例

- 一次固定输入 run 得到 660：只支持该次/该范围成功，不证明任意表达式。
- 两次独立 Fresh Run 才可形成 repeatability 证据。
- 要声明 parameterized，必须用不同于示范值的合法输入，通过同一 frozen Candidate/inputContract 执行；不能修改 JS 常量后算“变参”。
- 即使 finalResult=660，如果 second expression 实际使用硬编码 110 而非 runtime firstResult，相关 dataflow criterion 应失败。
- 只有 checker PASS、语法 PASS 或 source review，没有 live execution 时，对 live criterion 只能 not-run/blocked。