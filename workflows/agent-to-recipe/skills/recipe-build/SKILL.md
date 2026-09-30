---
name: recipe-build
description: 将已确认 SemanticProcedure 和可消费的应用操作规则实现为普通 OpenDesk JavaScript，并冻结 S11 CandidateManifest。用于首次构建、定向实现修复和原样复用审查；必须保持 Procedure→Business Step→JS 的来源映射、真实 runtime dataflow、失败停止和范围边界，不得重做业务设计、写死示范答案或提前授予资格。
---

# recipe-build｜把 SemanticProcedure 实现成普通 JavaScript（S11）

## 这个 Skill 负责什么

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

[求解策略空间](../../../../docs/frameworks/automation-problem-solving-framework.md#strategy-space)用于理解上游方法来源，不授权 S11 重新选型。所消费的[操作策略](../../design/application-operations.md#operation-strategy)仍是 AppProfile/规则/helper 的条件化做法，不是新 IR、Strategy Registry 或执行引擎。

## 方法

### 1. 先做“可实现性反查”

逐 Business Step 核对 purpose、inputs/inputSources、runtime producer/consumer/transform、pre/postconditions、observation、stopConditions、sideEffects，以及所需 AppProfile operation rules 与 selected API contract。

- 业务含义/参数/数据关系缺失：回 procedure-synthesize。
- 当前业务能力需要的 capabilityDecision / selectedMethod 本身尚未确定，或 SemanticProcedure 缺该选择：回 procedure-synthesize / S9；S11 不自行重新做 Capability Discovery 来补业务选型。
- selectedMethod 已确定，但 AppProfile / operation rule 尚未把它落实成可执行的 locator/read/wait/action、runtime guard 或适用范围：回 application-engineer / S10。
- 上游已经存在精确 canonical contract / shared constraint 绑定，只是本次 request 漏交正文或固定 ref：回协调者补交；不得把“漏交材料”误判成重新选型。
- locator/read/wait/action rule 缺失：回 application-engineer。
- 历史事实缺失：按来源回 demonstration/trace-distill。
- 不能因为代码“可以猜出来”就继续。

若 S10 的实际新选择与 S9 固定决定冲突，先让原责任更新有来源的精确引用；不能让代码默选其中之一。来源只有设计示意的应用方法名时，不生成仿佛已经存在的调用。

### 2. 每个 Business Step 建 source mapping

每段业务代码必须能回答“它实现哪个 Business Step，依赖哪条 capability/application rule”。可以抽 helper，但 helper 不能成为新的业务层。

sourceMapping 至少让审阅者从 Procedure 追到源码区域，并能反向检查每段业务代码为什么存在。重复日志、诊断或安全 guard 可以不等同于业务步骤，但必须有明确工程理由。

### 3. 使用当前已确认 API/规则实现

遵守 selected canonical 的参数、返回类型、await、异常和平台约束。不存在的 API、路线图名称、伪 helper 不进入可执行代码。普通 Recipe 不默认依赖 Node 专用宿主能力。

若工程规则只有 partial/not-run，不把它写成已验证。需要 S10 补强时保留明确限制，不能仅靠 Candidate limitations 把原任务缩小后宣称成功。

### 3.1 按需要内联、抽 helper 或复用应用操作

| 当前需要 | 最小合适实现 | 不应附加 |
| --- | --- | --- |
| 单次简单、直接可读且合同明确的操作 | 内联普通 JS | 为架构外观增加类、Registry 或文件 |
| 同合同的重复操作或清晰的读值/准备/保护边界 | 少量普通 helper | 在 helper 中重新决定业务目标、数据来源或偷偷插入重试 |
| 多个 Recipe 共享应用身份、页面、操作与验证 | 复用已批准应用 operation/helper/Adapter | 重新实现通用 Accessibility/OCR/输入 Runtime，或让 Adapter 接管整个业务流程 |
| 有真实跨文件维护需求且当前入口支持 | 按公开模块契约组织应用模块 | 所有 Recipe 强制 ESM，或未经核实复制 Node 代码 |

抽象仍须保留前后条件、真实数据流、失败停止和 source mapping。Calculator 可保持单文件与少量 helper；没有复用需要不强制创建 App Adapter。应用边界沿用[App Adapter 合同](../../../../docs/architecture/desktop-automation/app-adapter-contract.md)。

### 3.2 只实现上游批准的策略集合

上游只有一种做法时就实现一种，不为“健壮”添加未验证 fallback。多路径必须在输入中明确各自方法、适用范围、验证证据、选择条件与动作状态边界。需要业务配置 `strategy` 时，只有上游输入/配置合同已批准才提供该参数，验证枚举并让其流向实际 consumer；它不是新的 Runtime option。

`auto` 只在当前合格集合与预定条件内选择，不表示异常后循环尝试所有 backend。人工指定路径同样不能绕过身份、权限、取消、预算和 unknown 门禁。未经验证的想法保留为缺口，不维护大量注释备用代码。Runtime 内部 provider 协调不在 Recipe 中复制。

### 3.3 模块与实际入口必须对应

模块能力以[JavaScript Runtime](../../../../docs/api/runtime.md)与[Execution](../../../../docs/api/execution.md)当前契约为准。已公开的文件路径是 `.mjs` 入口、静态相对 `import/export` 和导出 `main()`；普通 `.js` 保持脚本级 await 方式，不因抽 helper 被迫换入口。不把 `.mjs` 文件入口的支持外推到内联 `-script-text`，不依赖非公开 CommonJS 全局、任意动态 import 或 Node built-ins。

模块化冻结源入口、实际 import graph/第三方依赖与所需 loader/build provenance。`Execution.scriptHash` 在模块入口下标识实际执行 payload，不等于原始 `.mjs` 内容 hash；两者应按现有 manifest/dependencies 与执行证据分别绑定。Node 或 bundler 检查不能证明 OpenDesk CLI/Runtime 运行通过；入口变化须进入受影响的 S12 验证。

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

切换规则按[应用操作判定表](../../design/application-operations.md#strategy-switching)实现：尚未发出动作且其他前提满足，才可走获准替代；已发出但效果未知时先对账并排除原动作仍在进行；部分完成保留前缀；业务成功已确认则返回，不为修复回执格式再次执行。暂未看到结果不等于没有发生。搜索、滚动、切页等状态准备也必须受控，不能归入无限只读重试。

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

存在策略分支时，逐路径核对固定上游、可达性、真实选择输入、范围和停止行为；不能只测试默认路径却声明全部备用通过。对当前生产字节可做控制流/数据流与故障注入检查，但须明示 mock 证明层，不代替实际 UI 验证。

### 8. 冻结 Candidate，不授予资格

冻结 script bytes、关键依赖、entry command、working directory、inputContract、supported/excluded scope、limitations、sourceMapping、apiRefs/dependencies，计算 hash 并生成 CandidateManifest。

任何脚本或关键依赖字节变化都是新 Candidate。旧 Qualification 不转移。S11 只能报告实际静态/宿主检查，不把未运行写成 Fresh Run pass。

## 不负责什么

不重新定义 Business Steps、不重新判断 S7 动作必要性、不改成功标准、不做 S12 verdict，不发布 Catalog。修复实现时保留有效上游；不要通过重做示范掩盖代码 bug。

## 完成条件

一个没有查看全量历史的 S12 审阅者，应能从 CandidateManifest + script +固定上游直接回答：每个 Business Step 映射到哪里、runtime dataflow 是否真实、参数入口在哪里、失败如何停止、范围是什么、哪些工程声明尚未实测。

S11 冻结源码、manifest 和依赖后，仍须按 [Workflow 阶段退出循环](../../WORKFLOW.md)与 [唯一五维评分](../../design/validation-plan.md)独立退出；高分若写死运行时值等 Hard Fail 仍不能进入 S12，Candidate 字节变化后必须重新资格化。
