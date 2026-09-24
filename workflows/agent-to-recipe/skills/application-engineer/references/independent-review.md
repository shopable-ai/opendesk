# application-engineer 独立 Skill 审查基线

## 目的

用于审查 application-engineer 是否能够脱离完整 Workflow 被独立使用。

本文件不是新的 Skill，不改变 S1-S12，也不替代 SKILL.md。

## 核心判断

application-engineer 的责任：

```
任务需求
  ↓
需要认识的应用事实
  ↓
实际观察（截图 / Accessibility / UI 状态 / 执行证据）
  ↓
AppProfile 与应用规则
```

不能采用：

```
已有 JavaScript
  ↓
反推历史 Agent 行为
  ↓
生成 AppProfile
```

## Calculator 审查要求

必须能够说明：

- 为什么窗口尺寸、控件位置等代码信息不是现场应用认识。
- 为什么 AppProfile 必须来源于观察和验证。
- 为什么已有 Recipe 代码只能证明实现方式，不能证明 Agent 第一次探索过程。

## 与相邻 Skill 边界

- S1：目标、约束、业务成功条件。
- application-engineer：应用认识、定位、读取、等待、操作规则。
- trace-distill：动作事实取舍。
- procedure-synthesize：业务步骤和数据关系。
- recipe-build：JavaScript 实现。
- recipe-qualify：资格验证。

## 验收

独立审阅时必须能回答：

1. 输入是什么。
2. 输出是什么。
3. 什么证据可以证明输出正确。
4. 失败时返回哪个责任环节。
5. 哪些内容明确不属于本 Skill。
