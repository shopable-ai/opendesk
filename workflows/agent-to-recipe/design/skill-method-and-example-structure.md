---
title: "Agent-to-Recipe｜Skill 方法、参考资料与黄金案例结构"
description: "定义 Workflow、Skill、Skill Example、End-to-End Case 与 Artifact 的职责边界。"
order: 40
---

# Agent-to-Recipe｜Skill 方法、参考资料与黄金案例结构

## 一、目标

Agent-to-Recipe 需要同时满足两个要求：

1. 方法可以跨应用、跨任务复用；
2. 读者可以通过具体案例理解方法怎样工作。

因此不把完整案例替代 Skill 方法，也不把 Skill 写成只有抽象定义。

核心关系：

```text
Workflow
  |
  +-- Skill（专业方法）
        |
        +-- references（输入、输出、验证、失败规范）
        |
        +-- examples（黄金案例：解释本 Skill 怎样工作）

End-to-End Case（完整业务链展示）

Artifact（真实执行产生的成果与证据）
```

## 二、职责边界

### Workflow

回答：

> 一次自动化生产任务如何从用户目标进入，到普通 JavaScript 和资格验证。

不保存某个应用的详细操作。

---

### Skill

回答：

> 某个专业职责如何完成。

必须说明：

- 负责什么；
- 不负责什么；
- 输入是什么；
- 输出是什么；
- 如何判断正确；
- 失败返回哪里。

Skill 不应该包含某个应用固定的窗口尺寸、按钮名称或业务数字作为通用规则。

---

### Skill Example

回答：

> 这个专业职责在真实案例中具体怎样表现。

Example 应展示：

```text
输入
→ 判断
→ 处理
→ 输出
→ 错误示例
→ 边界
```

例如 application-engineer 的 Calculator 示例应说明：

错误：

```text
直接从最终 JS 得到 width=232,height=321
```

正确：

```text
任务需要结果读取能力
→ 观察应用
→ 确认窗口、目标和读取方式
→ 形成限定应用认识
```

最终代码中的固定条件属于后续实现或验证材料，不应倒推为首次认识输入。

---

### End-to-End Case

回答：

> 一个完整业务任务最终怎样经过 S1-S12。

例如：

```text
用户任务
→ S1 合同
→ S2 应用认识
→ S3-S6 示范
→ S7 必要步骤
→ S8-S9 业务过程
→ S10 应用规则
→ S11 Recipe.js
→ S12 Qualification
```

它引用 Skill Example，而不复制所有 Skill 方法。

---

### Artifact

回答：

> 真实执行产生了什么证据。

包括：

- TaskContract
- AppProfile
- DemonstrationDossier
- DistilledSteps
- SemanticProcedure
- CandidateManifest
- QualificationRecord

Example 和 Artifact 必须明确区分：

```text
Example = 教学和审阅材料
Artifact = 某次实际生产证据
```

## 三、Skill 目录建议

每个成熟 Skill 推荐：

```text
skills/<skill-name>/

SKILL.md

references/
  input-spec.md
  output-spec.md
  validation.md
  failure-handling.md

examples/
  calculator.md

templates/
  *.md
```

不要求一次全部补齐，但新增 Skill 不应只增加一个孤立 SKILL.md。

## 四、Calculator 黄金案例规划

Calculator 不作为唯一方法定义，而作为第一个黄金案例。

建议拆分：

```text
skills/
  application-engineer/examples/calculator.md
  task-demonstrate/examples/calculator.md
  trace-distill/examples/calculator.md
  procedure-synthesize/examples/calculator.md
  recipe-build/examples/calculator.md
  recipe-qualify/examples/calculator.md
```

每个文件只解释对应专业职责。

同时保留：

```text
cases/calculator-end-to-end.md
```

作为完整 S1-S12 阅读入口。

## 五、当前迁移原则

- 不删除已有 Skill 方法正文；先增加职责边界和案例入口。
- 不把 Calculator 固定数字、窗口尺寸、控件名称提升为通用 Skill 规则。
- 不把最终 JS 反向作为早期阶段唯一输入。
- 已有质量报告和运行证据继续保留，来源等级不改变。
