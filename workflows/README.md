# 工作流入口

本目录保存从需求到可复用自动化、以及普通 JavaScript 质量改进的作业框架。状态：框架文档；写入日期 2026-09-07。文档存在不表示 Skill 已注册、调度已实现、脚本或桌面业务已验收通过。

## 从当前目标进入

- 从真实任务、人工开发目标或已有自动化资产推进。
  - 阅读 [Agent-first Recorder｜工作流任务分解树](agent-to-recipe/WORKFLOW.md)。
  - 按业务子目标拆解需求，再选择观察、操作、验证和实现方法。
  - JS 执行已明确、可验证的步骤；Agent 只参与必要的理解和动态判断。
- 将应用认识转成可靠操作。
  - 阅读 [应用操作建模与封装](agent-to-recipe/application-operations.md)。
  - 区分布局、区域、UI 组件、目标身份、定位规则和本次动作坐标。
  - 优先复用公开 API，必要时使用普通函数，不强制应用类或 `calc` 对象。
- 对已有或新生成的普通 JS 独立改进质量。
  - 阅读 [code-rebuild｜普通 JavaScript 构建与质量改进](code-rebuild/WORKFLOW.md)。
  - 保持需求和真实数据流，区分结构重构、修复、可靠性增强和优化。
  - 代码已经满足要求时允许不改；rebuild 不等于推倒重写。
- 用具体任务检查上述环节能否衔接。
  - 阅读 [计算器案例与设计记录](agent-to-recipe/cases/calculator.md)。
  - 案例保留任务树、十三节点展开、数据流、布局备选方案、设计决策、反例和待验证事项。
  - 计算器是目标应用与技术基线，不是另一个通用工作流或完整产品。

## 文件与职责

- `agent-to-recipe/WORKFLOW.md` 是本目录唯一主流程，保存五个结果层次、阶段关联、执行闭环和交接。
- `agent-to-recipe/application-operations.md` 展开从界面认识到可靠操作的专业任务，不重复定义底层 API。
- `code-rebuild/WORKFLOW.md` 保存可以独立调用的代码改进框架，尚不是详细 `SKILL.md`。
- `agent-to-recipe/cases/calculator.md` 是可维护的案例和设计记录，不是一次真实运行报告。
- 本目录按嵌套无序列表表达“需要完成什么”。树中的缩进表示任务归属，不自动表示所有子任务串行；执行与同步采集并行，失败按原因返回。

## 与既有文档和 Skill 的关系

- [框架导航](../docs/frameworks/README.md)负责方法与架构分类；[示范到自动化主方法](../docs/frameworks/demonstration-to-automation-pipeline.md)和[任务求解方法](../docs/frameworks/automation-problem-solving-framework.md)提供阶段与业务拆解依据。
- [应用开发框架](../docs/frameworks/app-development-framework.md)、[能力成熟度](../docs/frameworks/capability-development.md)及[扩展框架](../docs/frameworks/runtime-api-extension-framework.md)继续负责原有领域，不在这里复制另一套正文。
- [共享合同](../docs/frameworks/agent-to-recipe-skill-contract.md)继续负责 request、handoff、版本、权限、进度和资格范围。本文不新增可执行 schema、Gate 或 Runtime 状态。
- [现有六个 Agent Skill](../prompts/automation/agent-to-recipe/README.md)仍保持原路径与调用名。本次不改名、不覆盖原 `recipe-build`，不假装新增的工作流文件已经安装为 Skill。
  - `code-rebuild` 是拟升级的专业环节名称；后续统一细化、评估并迁移原 `recipe-build` 的职责和引用。
  - 迁移前，正式 Skill 请求仍使用现有合同允许的名字；需要时在其 S11 作业内引用代码改进框架。
  - 不长期维护两份职责重叠的生成 Skill，也不把独立业务函数误认为独立 Agent Skill。
- [当前 API 文档](../docs/api/README.md)定义实际调用；框架示意、历史源码或相似工具名称不能证明某个 API 存在。
- 普通 JS 路线不以前置建设 Recorder Session、Compiler、可执行 IR、独立 Replay Runtime、LangGraph 或平台为条件。完整 Recorder／编译专项仍遵守其独立规格与验证要求。

## 保留计算器资料，而不混淆知识和运行证据

- 长期保留本目录案例中的需求、设计理由、候选方案、反例、支持边界和未决事项，后续故障可以回查，不仅存放在会被清理的临时目录。
- 实际操作时，在 `.runtime/automation-authoring/<task-id>/` 保存任务包、尝试和证据索引；真实 JS 的截图、日志和输出优先使用当次 `Execution.artifactDir`。路径规则沿用共享合同。
- 探索、失败和未完成资料不因成功而被覆盖；先保存事实，再建立成功路径或新修订。不存在的截图、脚本或历史运行不得补造。
- 临时试验可留下设计摘要、选择依据和待验证项；摘要不是原始执行证据，也不要求记录模型私有思维过程。
- `.runtime/` 可清理，不是永久证据库。清理前核对活动任务引用；需要长期复现时，经授权保留脱敏材料或稳定 fixture，并记录实际归档位置与内容版本。证据丢失后相关旧结论不能继续假装可复核。
- 遵守 [AGENTS.md](../AGENTS.md)：不提交凭据、个人屏幕、运行日志或无关临时文件，不删除已有用户资料，不新建根级 `temp/`、`test/` 或计算器专用工作流目录。

## 本次建立范围与后续顺序

- 先保存五个框架文件，保留完整任务树和计算器设计资料。
- 再按这些框架审查实际计算器脚本，形成保留项、最小改动、API 复用与回归范围。
- 随后独立细化并评估 code-rebuild Skill，统一处理旧名称与链接迁移。
- 最后对指定候选执行获准的真实验收；文档、静态检查、Skill 评估和桌面通过分别报告。

本轮文档基线为远端 `master` 提交 `6d04b6f01fcc652470d5fd3888c8b8ae84aabffe`。该快照不包含 `workflows/`；本次仅建立获准的五个文件，不恢复全部历史目录，不声明已查看或修改用户本地工作树。以下方法的新增细化来自本轮需求讨论；仓库已有合同与设计通过相应链接追溯。
