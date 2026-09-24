---
name: recipe-build
description: 将已确认 SemanticProcedure 和可消费的应用操作规则实现为普通 OpenDesk JavaScript，并冻结 S11 CandidateManifest。用于首次构建、定向实现修复和原样复用审查；必须保持 Procedure→Business Step→JS 的来源映射、真实 runtime dataflow、失败停止和范围边界，不得重做业务设计、写死示范答案或提前授予资格。
---

# recipe-build｜把 SemanticProcedure 实现成普通 JavaScript（S11）

## 定位

本 Skill 负责把已经确认的 Business Steps、runtime data dependencies 和应用操作规则实现成普通 OpenDesk JavaScript，并冻结 Candidate。它是实现层，不是业务过程设计层，也不是资格层。

正确主链是：

```text
SemanticProcedure
→ Business Step
→ source-mapped JavaScript
→ frozen CandidateManifest
```

如果代码为了“更容易写”改变 Business Step、输入来源、producer/consumer、允许 transform、支持范围或 success semantics，应返回上游，而不是在 S11 重新设计业务。

## 开始作业时读取

必读 [input-spec](references/input-spec.md)、[output-spec](references/output-spec.md)、[validation](references/validation.md)、[failure-handling](references/failure-handling.md)。使用 [candidate 模板](templates/candidate.md) 组织新应用；[Calculator 示例](examples/calculator.md) 只解释映射与 dataflow。

正式字段和 Candidate 语义以 [共享合同](../../../../docs/frameworks/agent-to-recipe-skill-contract.md) 为唯一依据。原 [io-spec](references/io-spec.md) 仅兼容导航。

## 方法

### 1. 先做“可实现性反查”

逐 Business Step 核对 purpose、inputs/inputSources、runtime producer/consumer/transform、pre/postconditions、observation、stopConditions、sideEffects，以及所需 AppProfile operation rules 与 selected API contract。

- 业务含义/参数/数据关系缺失：回 procedure-synthesize。
- locator/read/wait/action rule 缺失：回 application-engineer。
- 历史事实缺失：按来源回 demonstration/trace-distill。
- 不能因为代码“可以猜出来”就继续。

### 2. 每个 Business Step 建 source mapping

每段业务代码必须能回答“它实现哪个 Business Step，依赖哪条 capability/application rule”。可以抽 helper，但 helper 不能成为新的业务层。

sourceMapping 至少让审阅者从 Procedure 追到源码区域，并能反向检查每段业务代码为什么存在。重复日志、诊断或安全 guard 可以不等同于业务步骤，但必须有明确工程理由。

### 3. 使用当前已确认 API/规则实现

遵守 selected canonical 的参数、返回类型、await、异常和平台约束。不存在的 API、路线图名称、伪 helper 不进入可执行代码。普通 Recipe 不默认依赖 Node 专用宿主能力。

若工程规则只有 partial/not-run，不把它写成已验证。需要 S10 补强时保留明确限制，不能仅靠 Candidate limitations 把原任务缩小后宣称成功。

### 4. 落实 runtime dataflow

对每个 runtime value：

```text
producer API/helper return
→ optional allowed transform
→ actual consumer call/input
```

后续消费者必须使用本次 producer 返回值，不能使用示范值、Expected、历史输出、硬编码答案或在 JS 中重新计算本应由 UI 读取的结果。

保留字符串前导零、类型、精度和 fresh-run reacquire 语义。运行时值不能开放成外部参数覆盖。

### 5. 参数化必须落到真实入口

caller parameter 必须沿：

```text
inputContract
→ validation
→ Business Step input
→ real function/API call
```

实际可变。内部 helper 有参数但入口仍写死，不算参数化。静态业务输入若声明可变，合法变参不应要求修改源码。

### 6. 失败停止

必要的目标身份、唯一性、状态、输入边界和高影响前提在副作用前检查。unknown side effect 时停止依赖动作；不得无限 retry、重放未知前缀或切后端重复提交。

代码中的即时安全 guard 与 S12 Qualification Gate 分开：前者属于运行控制流，后者属于验收结论。

### 7. 双向代码审查

正向：每个合同要求/Business Step 是否有代码实现。
反向：每段业务代码是否有来源和必要性。

重点检查：
- return value 是否真正流向 consumer；
- await/顺序是否保持；
- branch/stop condition 是否可达；
- 参数是否真消费；
- final read/output 是否存在；
- error path 是否停止，不继续副作用。

### 8. 冻结 Candidate，不授予资格

冻结 script bytes、关键依赖、entry command、working directory、inputContract、supported/excluded scope、limitations、sourceMapping、apiRefs/dependencies，计算 hash 并生成 CandidateManifest。

任何脚本或关键依赖字节变化都是新 Candidate。旧 Qualification 不转移。S11 只能报告实际静态/宿主检查，不把未运行写成 Fresh Run pass。

## 不负责什么

不重新定义 Business Steps、不重新判断 S7 动作必要性、不改成功标准、不做 S12 verdict，不发布 Catalog。修复实现时保留有效上游；不要通过重做示范掩盖代码 bug。

## 完成条件

一个没有查看全量历史的 S12 审阅者，应能从 CandidateManifest + script +固定上游直接回答：每个 Business Step 映射到哪里、runtime dataflow 是否真实、参数入口在哪里、失败如何停止、范围是什么、哪些工程声明尚未实测。