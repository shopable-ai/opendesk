# procedure-synthesize｜独立 Skill 审查基线

七项分别审查：

1. 方法正确性：是否坚持 S7 取舍只读、S9 只拥有业务解释。
2. 输入输出完整性：是否能从 DistilledSteps 和必要定向材料生成 SemanticProcedure。
3. 责任边界：是否不重判历史动作、不生成 JS、不做 Qualification。
4. 失败处理：缺事实、缺政策、缺关系、错投影是否精确返回。
5. 案例解释：Calculator 是否明确 producer=read、consumer=second calculation、transform=digit expansion。
6. 下游消费：S10/S11 是否无需重读全历史即可消费。
7. 可复制性：模板是否支持多应用、多消费者、参数/runtime 分离，而无 Calculator 特例。

以下任一缺陷不得评为 95+：维护第二套 actionDecisions；runtime value 变成参数默认值；producer/consumer/transform 任一缺失；Expected 成为输入来源；终点读取被删除；API 文档被当作 runtime validation；S11 仍需猜关键业务数据流。