# Agent-to-Recipe 第二、三批 Skill 独立内容审阅｜2026-09-24

## 范围与证据级别

本报告覆盖 task-demonstrate、procedure-synthesize、recipe-build、recipe-qualify。基线为上一批完成后的 master `e67ffd072202aed99ccc699c07e6f2d56be15fcf`。

本轮未修改总 Workflow、S1-S12 编号、共享 schema、Runtime、业务 JS、Calculator frozen fixture 或历史 Qualification。四个 Skill 均补齐/强化独立入口、input/output/validation/failure 四项规格、Calculator 教学案例、通用模板和独立审阅基线；旧 io-spec 保留为兼容导航。

分数是方法/文档独立可用性的修改者自审，不是模型行为、真机执行或独立审阅实测。未运行新的 macOS 桌面 Fresh Run、Producer 模型评测或完整 Node 回归；因此这些分数不写入 Gate/QualificationRecord，也不把历史通过迁移为本轮证据。

## task-demonstrate

### 修改文件

- `SKILL.md`
- `references/input-spec.md`
- `references/output-spec.md`
- `references/validation.md`
- `references/failure-handling.md`
- `references/independent-review.md`
- `references/io-spec.md`
- `examples/calculator.md`
- `templates/demonstration-dossier.md`

### 关键修改理由

把 planned / actual / expected / observation / runtime value / consumer 定义成六类不可互换的证据角色；建立 planned→actual→observation→verification 微循环；明确 action receipt 不等于业务 observation；runtime value 必须有真实 read origin，consumer 必须有 actual input/transform；最终 JS、Expected、fixture、历史 Qualification 都不能倒造执行历史。

Calculator 案例明确：Expected=110 不产生 firstResult；最终代码里存在 `readText` 不证明本次 A005 实际发生；第二式必须追到 firstResult 的真实读取与 actual consumer；最终 660 不能掩盖常量 110 的错误数据来源。

### 独立评分

| 维度 | 分数 | 扣分项 |
| --- | ---: | --- |
| 方法正确性 | 97 | 复杂并发/多应用交错执行尚未做本轮实测 |
| 输入输出完整性 | 97 | 旧版 Dossier 兼容仍需逐来源适配 |
| 责任边界清晰度 | 98 | 协调者能否真正隔离全量历史不由 Skill 文件强制 |
| 失败处理能力 | 96 | 非幂等副作用未做真实故障注入 |
| 案例解释能力 | 97 | Calculator 是教学/已有 fixture 语义，不是新 Live Run |
| 下游消费能力 | 97 | 未做冷上下文真实 S3-S6→S7 模型消费评测 |
| 可复制到其他应用 | 95 | 尚未用第二个真实应用验证模板 |

**均分：96.7/100。**

## procedure-synthesize

### 修改文件

- `SKILL.md`
- `references/input-spec.md`
- `references/output-spec.md`
- `references/validation.md`
- `references/failure-handling.md`
- `references/independent-review.md`
- `references/io-spec.md`
- `examples/calculator.md`
- `templates/semantic-procedure.md`

### 关键修改理由

把 S7 与 S8-S9 的责任边界明确为：S7 决定历史必要路径与 runtime 投影，S8-S9 只做 Business Step、参数和数据语义；禁止重读 Raw Trace 建第二套 actionDecisions。

把 runtime value 提升为显式三元关系：producer / consumer / transform。Calculator 明确 firstResult 的 producer 是第一次实际 UI read 映射的 Business Step，consumer 是第二次计算，actual transform 是 digit/character expansion；Observed 110 不是 parameter/default，也不是 Expected 输入来源。

### 独立评分

| 维度 | 分数 | 扣分项 |
| --- | ---: | --- |
| 方法正确性 | 97 | 复杂循环/分支/同一步内部读后用仍依赖专业判断 |
| 输入输出完整性 | 97 | 业务自然语言政策的充分性不能靠 schema 自动证明 |
| 责任边界清晰度 | 98 | 全量历史访问隔离仍需调用方/协调器落实 |
| 失败处理能力 | 96 | 多源政策冲突的真实恢复未做实测 |
| 案例解释能力 | 97 | Calculator 仍是有限顺序切片 |
| 下游消费能力 | 96 | 未做独立 S9→S10/S11 冷上下文实测 |
| 可复制到其他应用 | 95 | 第二真实应用尚未验证模板和多 consumer 模式 |

**均分：96.6/100。**

## recipe-build

### 修改文件

- `SKILL.md`
- `references/input-spec.md`
- `references/output-spec.md`
- `references/validation.md`
- `references/failure-handling.md`
- `references/independent-review.md`
- `references/io-spec.md`
- `examples/calculator.md`
- `templates/candidate.md`

### 关键修改理由

强制主链 `SemanticProcedure → Business Step → source-mapped JS → frozen Candidate`，禁止在 S11 为方便实现而改业务设计。sourceMapping 不仅要“写对”，实际代码的数据流也必须成立。

Calculator 反例明确：先 read firstResult 后仍使用常量 110 同样失败；用 JS 算术重算 UI 结果失败；直接 return 660 而没有 final UI read 失败；helper 有参数但公开入口写死不构成 parameterization。

### 独立评分

| 维度 | 分数 | 扣分项 |
| --- | ---: | --- |
| 方法正确性 | 97 | 通用 JS 可达性/别名/复杂控制流仍非文档可完全证明 |
| 输入输出完整性 | 96 | 部分 Runtime 宿主细节仍需 canonical API 文档 |
| 责任边界清晰度 | 98 | code-rebuild 与本 Skill 的工程评审仍需调用方按范围使用 |
| 失败处理能力 | 96 | 未对真实高风险外部提交做 failure injection |
| 案例解释能力 | 97 | 示例强调数据流，但不是执行证据 |
| 下游消费能力 | 96 | 未运行新的 exact Candidate→S12 真机验收 |
| 可复制到其他应用 | 95 | 尚未用非 Calculator 应用验证参数入口/side-effect 模板 |

**均分：96.4/100。**

## recipe-qualify

### 修改文件

- `SKILL.md`
- `references/input-spec.md`
- `references/output-spec.md`
- `references/validation.md`
- `references/failure-handling.md`
- `references/independent-review.md`
- `references/io-spec.md`
- `examples/calculator.md`
- `templates/qualification-record.md`

### 关键修改理由

强绑定 exact Candidate / contract / environment / requested scope / predeclared scenario / actual evidence。把 one Fresh Run、repeatability、parameterization 明确为三种不同 claim：一次成功只证明一次；重复运行至少两次独立 Fresh Run；参数化还要同一 Candidate/inputContract 在不同合法输入下无需改码执行，并证明 actual business consumer 真正使用变参。

明确 requested 中未测试项不能移入 excluded 换 PASS，成功后也不能扩大 scenario.scopeRefs 或推广到任意布局/平台/输入组合。S12 不 patch Candidate、不降低 success criteria。

### 独立评分

| 维度 | 分数 | 扣分项 |
| --- | ---: | --- |
| 方法正确性 | 98 | 复杂统计稳定性/概率性模型的资格设计不在当前有限切片内 |
| 输入输出完整性 | 97 | Human acceptance/发布批准仍由具体产品流程补充 |
| 责任边界清晰度 | 98 | 真实组织权限/发布治理不由本 Skill 控制 |
| 失败处理能力 | 97 | 本轮未做真实 Candidate mutation/环境漂移故障演练 |
| 案例解释能力 | 97 | Calculator 例只解释证据强度，不是新资格执行 |
| 下游/发布可用性 | 96 | 未做 Catalog/发布侧真实消费；本 Skill 本身也不负责发布 |
| 可复制到其他应用 | 96 | 对非确定性/LLM bounded judgment 的更复杂场景尚无第二应用实测 |

**均分：97.0/100。**

## 本轮结论与下一步

四个 Skill 的内容自审均达到目标线，且没有通过改 Workflow、改阶段编号、改 frozen fixture、写死 Calculator 规则或借历史 Qualification 抬分。

下一批可继续审查其余尚未按同一独立结构完全升级的 Agent-to-Recipe Skills（例如 automation-plan / code-rebuild 等），但它们不应继承本报告分数，仍需逐 Skill 单独检查和打分。
