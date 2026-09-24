# recipe-build｜输入规格

## 必需输入

实际读取 request、TaskContract、确认版 SemanticProcedure、当前需要的 AppProfile/operation rules、真实 helper、selected API canonical/public constraints、正常 Runtime 入口、input policy/config/secret refs、依赖和允许修改范围。

首次构建不要求 Candidate/Qualification。定向修复另需旧 Candidate、具体失败、影响范围与可修改对象。旧 Qualification 只证明旧字节/旧范围。

## 实现前必须回答

1. 每个 Business Step 的 inputs 来源是什么？
2. 哪些是 caller parameter，哪些是 runtime value？
3. 每个 runtime value 的 producer/consumer/transform 是什么？
4. 每个 UI/业务操作用哪条 operation rule 和 API？
5. 哪些 stopConditions/sideEffects 必须在代码中即时处理？
6. 哪些工程规则仍 not-run/partial？

任何一项关键答案缺失，不在 S11 猜。

## 参数化输入

若 Procedure 声明参数化，必须拿到参数含义、类型/格式/边界、默认策略、消费者和验证时点。inputContract 必须映射真实入口；不能仅看到 helper signature 就认定已参数化。