# EXPERT_REVIEW_RUBRIC

## 1. 评分目标
这里的分数评的是“方案质量”，不是“实现完成度”。
方案可以 95+，实现仍可能只有 30%。

## 2. 总分 100
- 结构识别正确性：15
- app/page inference 正确性：10
- semantic zones 完整性：10
- action target 可执行性：15
- replay / recovery：10
- evidence / observability：10
- failure taxonomy 可纠偏性：10
- prompt / orchestration 清晰度：8
- 成本效率：6
- 风险控制 / 红队抵抗：6

## 3. 单轮审查模板
每一轮都必须记录：
1. 参与专家
2. 正方观点
3. 反方攻击
4. 自我否决
5. 新增盲区
6. 外部资料影响
7. 本轮评分
8. 总分变化
9. 是否继续
10. 下一轮攻击重点

## 4. 反方优先规则
在分数低于 95 前：
- 先找误发风险
- 先找错页执行风险
- 先找 stale evidence 风险
- 先找 action target 脆弱点
而不是先讨论美观、镜像、像素精度。

## 5. 退出条件
只有同时满足才允许结束 strategy_review：
- 连续多轮反方攻击后总分稳定 `>=95`
- 关键 blindspots 已有对应 gate 或 stop policy
- 主链路已明确从 mirror/pixel 转向 structure/actionability
- 工程指导文档已落盘

## 6. 防虚高规则
以下情况必须扣分：
- 用“能跑通一次”替代可靠性
- 用旧 region report 代替实时判断
- 用 whole-window OCR 代替局部语义证据
- 用 pixel diff 代替动作可执行性
- 用裸坐标代替 action target model

