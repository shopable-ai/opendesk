---
title: "code-rebuild｜独立、按需的普通 JavaScript 质量改进"
description: "定义已有普通 JavaScript 怎样在不重造业务语义的前提下进行有据、最小、可验证的改进。"
order: 60
---

# code-rebuild｜独立、按需的普通 JavaScript 质量改进

本文只回答一个问题：

> **已有普通 JavaScript 怎样按真实需求和应用规则进行必要改进，同时避免无依据重写？**

code-rebuild 是**可选、独立**的代码质量作业，不替代 recipe-build，也不负责补造上游业务事实。

## 30 秒总览

```text
冻结代码基线和允许修改范围
  ↓
确认业务要求 / Procedure / AppProfile / API 依据
  ↓
找真实问题
  ↓
选择最小修改
  ↓
检查实际数据流、异步、失败、安全和 API
  ↓
运行本次允许的静态 / 单元 / 集成检查
  ↓
原样保留
或
冻结新 Candidate
  ↓
把受影响范围交 S12 重验
```

原则：

1. **好代码可以不改。**
2. **缺业务事实时返回上游，不从代码猜。**
3. **实际读值不能被示范常量替代。**
4. **更短、更多类、更多抽象都不是质量证明。**
5. **Candidate 字节变化后旧 Qualification 不继续证明新候选。**

## 何时进入与职责边界

### 可以进入

- 已有 Recipe / 普通 JS 有明确缺陷；
- 需要局部结构整理；
- 需要可靠性增强；
- 需要依据当前 API 消除重复弱实现；
- 用户明确要求独立审查已有代码；
- recipe-build 已生成候选，且存在真实、独立的改进收益。

### 不应该进入

- 只是为了“流程完整”；
- 代码已经满足当前用途和风险；
- 缺的是用户目标、授权、业务语义或应用认识；
- 没有真实代码基线；
- 想用重写掩盖 qualification fail；
- 想把未实现 API 写成未来占位后声称完成。

## 输入、输出与完成条件

### 必要输入

至少需要：

- 精确源代码／Candidate ref；
- 当前业务要求；
- 允许修改范围；
- 相关 SemanticProcedure 或等价业务依据；
- 必要 AppProfile / helper；
- 当前真实 API contract；
- 已知失败／改进目标；
- 旧 Qualification 范围（如果存在）。

缺少关键业务依据时，返回对应 owner，而不是继续推断。

### 输出

二选一：

**A. 原样保留**

- baseline ref/hash；
- 为什么无需修改；
- 已完成检查；
- 未测范围；
- 仍需 S12 验证的内容。

**B. 修订 Candidate**

- 新源码；
- 新 hash / CandidateManifest；
- 每项变更的依据；
- source mapping；
- 受影响范围；
- 已完成检查；
- 未测范围；
- S12 重验请求。

### 完成条件

- 不再存在本次范围内已识别的 hard defect；
- 代码没有偷换业务语义；
- runtime values 与真实 consumers 保持；
- API / 依赖真实可用或明确 blocked；
- 新候选已冻结；
- 影响性修改已明确需要重验的范围。

## 生成时的框架复用复核

首次构建和已有代码改进都应该核对框架是否已有更合适能力，但复核必须基于当前业务需求。

```text
当前业务步骤
→ 找到一个或少数可能能力
→ 读 canonical API contract
→ 比较现有实现与正式能力
→ 保留 / 替换 / 组合
→ 记录理由和影响范围
```

不要：

- 因为方法名字相似就替换；
- 只看代码行数；
- 把低层组合强行替换成不能保留业务约束的高层 API；
- 把 API 文档存在写成 Runtime 验证通过。

能力发现细则见 [capability-discovery.md](capability-discovery.md)。

## 工作流任务分解树

这里的“任务树”只针对 code-rebuild 专业作业，不是新的 S1—S12。

### 1. 冻结代码必须完成什么、保持什么

记录：

- source / hash；
- entry；
- dependencies；
- input contract；
- supported scope；
- 当前 Qualification（如有）；
- 必须保留的用户修改；
- 允许变化的行为；
- 不允许变化的行为。

区分：

- 已验证行为；
- 设计意图；
- 已知缺陷；
- 推断；
- 未验证范围。

不能以“保持旧行为”为理由保留已知业务错误。

### 2. 分类本次修改

只在有依据时选择：

| 类型 | 目标 |
| --- | --- |
| 结构重构 | 保持约定可观察行为，提高可读／可维护性 |
| 缺陷修复 | 改变明确错误行为 |
| 可靠性增强 | 改进状态、等待、失败、恢复或诊断 |
| API 复用 | 用正式能力替换重复且更弱的实现 |
| 性能优化 | 基于真实测量改善成本／延迟 |

性能、复杂度和可读性不能覆盖业务正确性。

### 3. 找出真正需要修改的问题

#### 业务正确性

检查：

- 主流程是否表达真实业务步骤；
- actual runtime value 是否进入实际 consumer；
- Expected 是否只留在验证层；
- 输入、输出、pre/postcondition 是否一致；
- 代码有没有隐式扩大支持范围；
- 失败是否会被吞掉后继续副作用。

#### API 与运行条件

检查：

- 方法是否存在；
- 签名和返回值是否匹配；
- 是否需要 await；
- 平台／Runtime 是否支持；
- dependency / working directory / entry 是否真实；
- 是否凭想象使用 Node、import、global 或未发布 helper。

#### 状态与身份

检查：

- 正确窗口／页面／业务对象；
- 旧焦点、旧剪贴板、旧坐标、旧截图是否被误当当前事实；
- action 前是否需要重新确认 Target；
- Geometry 是否只是快照；
- helper/Profile 版本是否和 Candidate 一致。

### 4. 选择最小足够的代码结构

优先顺序：

```text
已有正式 API
→ 必要普通函数
→ 明确规则数据
→ 只有真实复用收益时再拆更多模块
```

避免：

- 为一个短脚本创建无收益类；
- 为每个按钮建立对象方法；
- 重新实现框架已有定位／等待；
- 用大量抽象隐藏业务顺序；
- 为了“统一”改写无关文件。

普通函数应承担明确价值，例如：

- 参数展开；
- 状态准备；
- 组合动作；
- 结果读取；
- verifier；
- strict parsing；
- 有界 recovery。

### 5. 保持完整、可追溯的业务数据流

关键值至少区分：

- user input；
- config；
- Secret reference；
- invariant；
- Expected；
- runtime observation；
- temporary geometry。

每个 runtime value 记录：

```text
producer
→ transform（如有）
→ consumer
→ validity / refresh condition
```

典型错误：

```text
firstResult = readActualResult()
...
clickExpression("6 × 110")
```

即使最终答案偶然正确，也必须拒绝。

严格规则：

- 不用 Expected 补现场读值；
- 不用默认值掩盖读取失败；
- 不用 JS 算术替代任务明确要求的 UI 计算；
- 不用宽松 parse 吞掉尾部错误；
- 输入适配和业务求值分开。

### 6. 补齐执行可靠性和失败诊断

#### 顺序

- 同一桌面交互按真实依赖顺序执行；
- 必要调用使用正确 await；
- 不并行点击同一应用；
- fixed sleep 不能作为业务结果证明。

#### 有界等待

等待必须有：

- condition；
- timeout；
- stop reason；
- failure handling。

不能无限轮询。

#### 副作用

动作可能已经发生但回执不明时：

```text
停止重复动作
→ 读取当前状态
→ 对账
→ 只有确认安全且获准时才恢复
```

不能默认“异常 = 没发生”。

#### 错误

错误应能定位到：

- business step；
- target；
- input summary；
- expected condition；
- actual condition；
- evidence ref。

日志失败不应覆盖原业务错误。

### 7. 检查是否真的提高了质量

至少比较：

| 检查 | 问题 |
| --- | --- |
| 需求 | 改后仍完成同一业务目标吗？ |
| 数据 | actual value 的 producer→consumer 还在吗？ |
| API | 仍使用真实支持的接口吗？ |
| 状态 | 身份／等待／错误边界更清楚了吗？ |
| 范围 | supported scope 有没有静默扩大？ |
| 复杂度 | 新抽象真的减少维护成本吗？ |
| 验证 | 修改过的行为有对应检查吗？ |

如果答案是“没有真实收益”，保留原代码是正确结果。

### 8. 冻结候选并交接独立验收

影响性改动后：

- 生成新 Candidate；
- 新 hash；
- 更新依赖／helper refs；
- 更新 source mapping；
- 列出 regression scope；
- 不继承旧 Qualification。

纯结构整理也应保留本次检查依据；如果确实不影响业务行为，S12 可按影响分析裁剪，但不能假装“Candidate 没变”。

## 独立质量门槛与责任返回

### Hard Fail

以下任一出现，不能靠高评分继续：

- 运行时读值被示范常量覆盖；
- 未支持 API；
- 读取失败后默认答案；
- 吞错继续副作用；
- 无界等待／重试；
- 错业务对象；
- helper/Profile 与 Candidate 版本不一致；
- Candidate 字节改变却沿用旧 Qualification；
- Expected 注入 production path；
- 为绕过工程缺口改写用户业务要求。

### Failure Owner

| 问题 | 返回 |
| --- | --- |
| 目标、授权、成功标准 | S1 |
| 缺真实执行事实 | S3—S6 |
| 必要动作取舍 | S7 |
| 业务语义、参数、数据依赖 | S8—S9 |
| 应用定位／读取／等待规则 | S2 / S10 |
| Candidate 代码问题 | code-rebuild / recipe-build |
| Qualification setup / evidence | S12 |
| 真正 Runtime primitive 缺失 | Runtime capability owner |

code-rebuild 不能靠“顺便补全”跨越这些 owner。

## 用反例评估此环节，而不只评价输出文风

至少覆盖：

1. 读 firstResult 但后续仍用固定示范值。
2. 读取失败后默认成功。
3. 吞错打印 success。
4. 把多位数当单按钮。
5. 重复等号／错误顺序。
6. 并行点击同一应用。
7. 旧坐标改名成语义变量但仍无定位依据。
8. 自造未发布 API。
9. Node / module / global 假设无依据。
10. 好代码已经满足需求，评审者应允许不改。
11. Candidate 修改后试图复用旧 Qualification。
12. 不同用途下，优化预算应不同，不能无限“继续提高质量”。

正例和反例都要测。一个评审器只会挑错、不能正确保留好代码，也不算可靠。

## 后续细化与迁移

本 canonical 方法不维护某一轮“下一步 P0/P1”、Calculator 当前评审状态或 Skill 宿主状态。

需要：

- 实际 code-rebuild 质量数据 → `docs/quality/`
- 具体 Skill 使用说明 → [code-rebuild/SKILL.md](../skills/code-rebuild/SKILL.md)
- 输入输出字段 → [共享合同](../../../docs/frameworks/agent-to-recipe-skill-contract.md)
- Qualification 方法 → [validation-plan.md](validation-plan.md) / recipe-qualify
- 历史设计演变 → Git history

## 迁移与决定演变

该标题保留为历史兼容入口。当前方法不再维护逐日期迁移日志；旧“是否改名 recipe-build”“某个 blob 从哪里迁来”等信息由 Git history 提供，不属于今天执行 code-rebuild 必须知道的内容。

## Recorder 语义生成与 Runtime 定位协作

Recorder / semantic candidate / action mapping 属于专项来源与架构问题。code-rebuild 只遵守两条工作流边界：

1. Recorder 事实不能被代码重构改写；
2. 若修改 Locator / Target / Read / Wait / Action 策略，必须更新对应应用依据并重新验证受影响 Candidate。

Recorder / Compiler / IR 的详细设计见其专项架构，不在 code-rebuild 复制第二套正文。
