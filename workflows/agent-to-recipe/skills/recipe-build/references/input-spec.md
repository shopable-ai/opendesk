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

## 操作策略与封装输入

所消费策略须有固定规则/helper、实际 API/契约、目标绑定、适用范围、局部验证及停止语义。只有一种实现时，不要求多个策略、App Adapter 或模块；已有获准 helper 可直接复用，不重新实现 Runtime 的 provider 协调。

多路径还需每条已批准路径的证据、选择条件、允许切换的动作状态与预算。未验证备用不进入生产集合；`auto` 或手工选择均不能绕过身份、权限、取消、unknown 和部分完成边界。上游没有批准策略参数时，S11 不自行增加调用入口。

S10 实际选择与 S9 固定决定矛盾时，由原责任带来源更新引用；选型缺失回 S9，工程规则缺失回 S10，材料漏交回协调者。不能在 S11 静默选一个版本，也不能把设计中的操作名称当已有 API。

模块化只在确有需要时核对实际入口的 Runtime 合同、源文件、依赖图及必要构建来源；不要求简单 JS 先变为 `.mjs`，不把文件 ESM 支持外推到内联入口或 CommonJS。模块源文件 hash 与实际 payload 的 Execution.scriptHash 分开取得，缺少必要依赖绑定不能冻结为已完整 Candidate。方法见 [SKILL](../SKILL.md)。

## 参数化输入

若 Procedure 声明参数化，必须拿到参数含义、类型/格式/边界、默认策略、消费者和验证时点。inputContract 必须映射真实入口；不能仅看到 helper signature 就认定已参数化。
