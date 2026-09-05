# S6：验证完整任务并封存示范交接包

责任 Skill：[task-demonstrate](../../../prompts/automation/agent-to-recipe/task-demonstrate/SKILL.md)。这是从真实操作进入离线提炼的正式交接边界。共同规则：[阶段约定](README.md)。

## 输入与进入条件

读取冻结合同、当次计划与 AppProfile、S3—S5 的动作／验证／分类记录、实际关键业务值和所有必要证据。子目标完成只允许进入本阶段检查，不能提前代表完整业务成功。

## 本阶段要做的事

退出继续操作模式，对照全部成功条件重新核对最终对象和业务结果。检查部分完成、旧结果污染、重复副作用和仍未解释的失败；证据强度要符合合同，而不是只看工具调用返回。

核对关键数据从何处读取、怎样用于后续动作；区分输入样本、实际观察和期望值。必要证据缺失时交付缺口，不补造截图、时间线或 Agent 未实际进行的探索。

封存全部关键引用。隐私检查覆盖文本、截图、日志与路径；只收录任务所需内容，不复制完整环境变量。失败的示范也保留有用事实，但不能包装成成功样本。

## 必须保存的输出与消费者

发布 `dossier.json`：合同／计划／应用资料版本、executionRefs、actualInputs、initialState／finalState、actionsRef、runtimeValues、verification、evidenceRefs、unresolved、privacy 与 sideEffects。

关键值必须保留实际值、来源、类型、证据、消费者和 Fresh Run 重取要求。最后发布 scope 为完整 demonstration 的 handoff；消费者为 [S7](07-review-causal-path.md)／procedure-synthesize。

## 通过、阻塞与回退

完整示范成功条件有足够当前证据、没有未解决的关键身份或副作用问题时，才允许进入正常提炼／生成。局部 pass 不能替代此门禁。

不完整的失败包仅进入诊断；缺证据返回指定 S3／S4 节点补采，前提是重新核对现场和授权。合同本身不成立返回 S1，不为通过降低标准。

## 下一阶段与最小验收

进入 S7。把指定合同、AppProfile、dossier 和证据交给没有操作聊天的消费者，必须能还原事实；在副本中移除关键证据后，它应阻塞而不是猜出答案。完整聊天不是缺失产物的替代品。
