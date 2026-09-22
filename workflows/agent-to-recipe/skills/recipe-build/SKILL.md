---
name: recipe-build
description: 将已确认 SemanticProcedure 和可消费应用规则实现为普通 OpenDesk JavaScript，冻结 CandidateManifest；用于 S11 初次构建、定向实现修复和明确范围的已有资产接续。
---

# recipe-build｜把已确认过程实现为普通 JavaScript

## 适用任务与边界

负责 S11：已确认业务过程＋应用操作规则 → 普通 OpenDesk JavaScript＋CandidateManifest。它不是工作流引擎、业务解释器或新的 Replay Runtime。可以初次构建、修复具体实现问题，或按共享合同复用已有资产；不为凑成果改合格代码。现有 Recorder／Replay 能力继续存在，Human 来源仍按自己的 plan 和权限进入生成。

开始时读取本方法、[输入输出适用规格](references/io-spec.md)、[共享合同](../../../../docs/frameworks/agent-to-recipe-skill-contract.md)的 Candidate 与发布／接续条款。API 从 [Agent API 短入口](../../../../docs/api/agent/README.md)按业务需要发现，取得实际选中方法的 canonical 正文和必要公共约束。需要定位／动作代码时读取 [定位修复方法](../../../../docs/frameworks/ui-locator-repair.md)；进一步的代码组织依据见 [代码重建设计](../../design/code-rebuild.md)，不要求每次通读全部应用工程资料。

## 进入条件与必要输入

固定本次 request、TaskContract、已确认 SemanticProcedure、适用 AppProfile／操作规则及真实存在的 helper、选中 API 契约、正常入口与依赖、本次输入／配置／Secret 引用及允许修改范围。取得实际正文并核对 hash、版本、来源、对象和支持范围。首次构建不要求已经有 Candidate 或 Qualification；初次候选检查同样不要求未来资格结论。

定向修复另需旧候选、具体失败和影响范围；旧资格只证明旧候选及其旧范围。已有资产按原合同的 continuation 处置，不能倒造 Dossier 或完整生成历史。`reuse-unchanged` 的有限例外不得套用到新生成或代码修订，以规避过程输入。

## 具体作业方法

1. **反向检查能否实现。** 逐个业务步骤确认目的、输入来源、运行时生产者与消费者、前后置、观察、停止及副作用；逐个操作确认规则、目标、实际 API、异步语义、环境和验证状态。业务关键含义缺失回 S8—S9，操作规则缺失回应用工程；不在代码里猜、补占位方法或静默选择新 fallback。工程待验证不等于已通过。关键工程规则未落实时，只能按共享合同保留明确限制的草案及失败／补强请求，不能发布满足原要求的正常候选交接；不得把本轮范围改小或只填写 limitations 来放行。
2. **画出最小代码结构与数据流。** 用业务函数或清楚代码区域承接 Business Step。区分业务动作、运行时安全门禁、资格断言和 Evidence；生产脚本保留保护本次控制流与对象的必要检查，不携带完整历史证据或测试 Oracle。按 Procedure 的来源映射组织，不重新维护原动作取舍。
3. **使用现有 Runtime 能力实现。** 先复用已选择且可用的 API／普通函数；只有真实复用或语义收益才抽 helper。遵守 canonical 的参数、返回类型、await、异常和平台约束。普通业务 Recipe 不使用 Node 的 require、process、fs 或 Node 启动方式作为默认宿主；宿主侧语法／合同测试与 Runtime 执行分开。不存在的方法、路线图名称、伪 helper 不进入可执行代码。
4. **落实真实数据依赖。** 后续消费者使用本次实际生产者返回值，不使用历史样例、Expected 或常量代替。按已确认政策保留类型、前导零、单位精度、实际需要的允许变换、有效期和重新获取规则。无输出步骤的 consumers 可以为空；终点读取与交付不得遗漏。变换或政策需要新增时先回对应责任，不临时改义。
5. **落实有限失败和安全停止。** 必要目标／窗口身份、唯一性、状态、权限及边界在动作前检查；结果 unknown 时停止依赖副作用。只使用获准且有依据的有界恢复，不能无限重试、重放未知前缀或换后端重复提交。错误保留原始业务原因与已知副作用，不用日志“完成”替代实际结果。
6. **检查实现并作最小修订。** 从每项合同要求和 Procedure 步骤追到源码区域，再反查每段业务代码是否有来源、权限和必要性。检查返回值流向、分支可达性、异步顺序、类型与停止条件；静态扫描只证明其实际覆盖。可选调用 code-rebuild 对精确基线独立作有依据的保留／改进评审；没有收益则不改。
7. **冻结候选而非授予资格。** 保存实际脚本与依赖字节，记录正常入口命令、工作目录、inputContract、支持范围、限制和 sourceMapping；映射继续引用 Procedure 的 capabilityDecisionRefs。计算实际 hash 后生成 CandidateManifest，再发布 handoff。候选不引用尚不存在的 Qualification，不把方法文档、语法检查或一次历史成功写成业务已通过。

## 检查、输出与失败接续

输出普通 JS＋CandidateManifest＋本次实际检查和未验证范围；可读说明引用同版主产物，不成为第二份过程。字段与资格失效仍由共享合同唯一维护。适用的分段检查是 `check-artifact-chain.js --through candidate`，完整命令与限制见 [code-rebuild](../code-rebuild/SKILL.md)；它只检查限定形状和源码模式，不执行候选，也不要求未来 Qualification。

实现错误由本职责修；动作取舍回 S7；业务含义、参数或数据关系回 S8—S9；应用定位、读取、等待或操作规则回 application-engineer；事实缺失按 Agent／Human 原来源返回；目标与授权变化回需求责任。测试／Oracle 缺陷留 S12，不降低成功标准。

每次修订保留原候选、原失败及有效上游。任何脚本或关键依赖字节变化生成新候选，列出受影响标准、依赖与重验要求，再交 S12；不把旧资格转移到新字节。无变化复用仍须核对输入、规则和范围适用性，不自动获得新环境资格。副作用未知先核对，不因代码修好就重放业务。

正常、拒绝、修复和不改版复用样例见 io-spec。方法文件存在、设计评审、合同测试、模型构建能力、宿主加载和真实业务资格分别记录，未运行不写运行分数。
