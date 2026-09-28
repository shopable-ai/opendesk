# task-demonstrate｜独立 Skill 审查基线

本页只审 task-demonstrate，不用整链成功替代本 Skill 正确性。

七项必须分别检查：

1. **方法正确性与阶段边界**：是否明确区分 S3 actual execution、S4 observation/verification、S5 classify/decide、S6 task close，并能定位第一个错误阶段；planned→actual→observation→verification 的事实闭环不能被压成一个综合结论。
2. **输入输出完整性**：是否能从固定合同/计划/规则生成可消费 Dossier，而不要求未来产物。
3. **责任边界**：是否不代做 S7 取舍、S9 语义、S11 实现、S12 资格。
4. **失败处理**：unknown/partial 是否停止依赖动作，历史缺失是否保持 unknown。
5. **案例解释**：Calculator 是否明确六类角色和“最终代码不是执行证据”。
6. **下游消费**：S7 是否能只靠交付包重建动作、值、consumer 和副作用。
7. **可复制性**：模板是否不含 Calculator 专用尺寸、按钮或答案。

以下任一缺陷都不能评为 95+：无法区分错误首先属于 S3/S4/S5/S6；从 JS 倒造 actual；Expected 写成 observation；runtime value 无真实 origin；consumer 只有理论描述；unknown 副作用仍重试；最终值正确却缺中间数据来源；案例或模板把 Calculator 特例写成通用规则。