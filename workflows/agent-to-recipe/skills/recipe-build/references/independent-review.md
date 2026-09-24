# recipe-build｜独立 Skill 审查基线

七项分别检查：方法正确性、输入输出完整性、边界、失败处理、案例解释、下游消费、跨应用复制。

95+ 的最低条件：
- 主链明确为 Procedure→Business Step→JS，不在 S11 重做业务。
- runtime producer/consumer/transform 在真实代码中成立，不只 sourceMapping 好看。
- 不写死示范/Expected/最终答案。
- 参数化落实到真实 inputContract 与业务调用。
- unknown side effect 有停止路径。
- 代码变化产生新 Candidate，旧资格不转移。
- Calculator 特例不进入通用模板。