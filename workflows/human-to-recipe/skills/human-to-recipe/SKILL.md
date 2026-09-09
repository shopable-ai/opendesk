---
name: human-to-recipe
description: 将 OpenDesk Recorder 的固定 actions 包加工为可读生产 Recipe、独立资格 Gate 和分离 Evidence。用于人工录制后的语义提炼与生产化；不负责扩展 Recorder、猜测缺失业务意图或未经授权运行桌面动作。
---

# human-to-recipe

版本：0.1，2026-09-10。当前仓库提供 Skill 源码、`SemanticBuildPlan` schema、validator 和 Calculator golden；通用 renderer 尚未实现。Skill 源码存在不表示已安装到当前 Codex 的用户级 Skill 目录，也不表示任何生成物已经 live verified 或 qualified。

## 输入与停止条件

开始前取得并固定以下输入：

- `repository/workdir`、`recordingDir`、`actionsFile`；
- actions 的 revision、readiness、调用方提供的 hash（若有）、raw reference；
- 可选 basic `scriptFile`／`candidateFile`；
- 用户明确给出的业务目标和成功条件；
- 允许的副作用、禁止触碰的对象；
- 应用、语言、布局和环境约束；
- 当前 `semanticStatus`、`semanticReason` 和 issues 的结构化摘要。

业务目标或成功条件缺失时，先提出分别针对目标和结果 Oracle 的具体问题；在用户回答前可以审计事实和列缺口，但不得生成生产 Recipe。没有动作授权时只做静态工作，不运行 Recorder、candidate、生产 Recipe、资格 Gate或任何真实桌面输入。

## 固定工作流

1. 阅读仓库 `AGENTS.md`、本 Skill、相关工作流文档和将要调用的 `docs/api/` 当前 API Reference。修改前核对工作树，保留既有和并行修改。
2. 从磁盘读取 `actionsFile` 的实际字节，不信任 UI 内存摘要。计算 SHA-256；核对 revision、readiness、raw file/hash/bytes、action ID 和 source event ID。把 repository/workdir、recordingDir、actions 路径、hash 与可选 candidate 路径写入 plan。
3. 每个 action 恰好归入一个 disposition：`business`、`runtime-guard`、`qualification`、`evidence`、`excluded` 或 `unknown`。建立 action → raw event → consumer 的 source map。遗漏、重复消费、冲突或任何 `unknown` 都是 production blocker。
4. 将连续低层业务动作整理为有业务目的和可观察状态转换的 Business Episode。名称使用用户业务语言；禁止以 `a0001`、`click1`、`action2` 等事件编号命名业务函数。单次示范不能证明的参数、分支、循环和业务规则保持 unknown。
5. 分开记录：应用知识／业务规则；Target／Locator／Geometry；动作策略；运行时安全门禁；Qualification Oracle；Evidence。生产 Recipe 只消费已解决的生产输入。
6. 当应用认识或 locator 需要加固时，完整读取并遵循 `workflows/agent-to-recipe/skills/application-engineer/SKILL.md`。只接收其 `target`、`locator`、`geometry`、`actionStrategy`、`runtimeGuards`、`recoveryRule`、`qualificationClaims`、`sourceRefs` 和 `unknowns`；最终 plan、Recipe 和 Gate 仍由本 Skill 负责。
7. 先形成 `SemanticBuildPlan`，再运行 validator。schema 位于 [references/semantic-build-plan.schema.json](references/semantic-build-plan.schema.json)，validator 位于 [scripts/validate-semantic-build-plan.js](scripts/validate-semantic-build-plan.js)。从仓库根目录执行：

   ```bash
   node workflows/human-to-recipe/skills/human-to-recipe/scripts/validate-semantic-build-plan.js <plan.json> --check-source
   ```

   只有 `valid: true` 且 `productionReady: true` 才能进入生产生成。Calculator 校准输入见 `workflows/human-to-recipe/golden-samples/calculator-115.semantic-build-plan.json`。
8. 通用 renderer 尚未实现。当前由 Agent 严格按同一 plan 生成：来源和正常命令注释 → 应用／布局常量 → 目标或控件表 → 安全 helper → 业务 Episode → 顶层业务顺序 → 简明完成结果。生成期间不得重新解释业务、补写 unknown、引入新 fallback 或覆盖已有文件；有冲突先停下并报告。
9. 生产 Recipe 只保留业务步骤、决定本次控制流的状态判断，以及防止误操作所需的目标、权限、布局和边界门禁。来源 hash、逐步固定 Oracle、截图矩阵和 evidence 写入独立 Gate／Evidence。
10. Qualification Gate 必须固定 production path/hash，并读取和执行该文件的实际源码；允许 instrument 现有动作边界以观察结果，不得维护第二份隐藏业务动作实现。候选变化后旧资格失效。

## 语义缺失与定位边界

- AX label、role 或 identifier 不存在时保留 `unavailable`，不得从坐标、图标常识或相邻文字补造语义。
- WebView 先检查是否存在获准且可查询的 DOM／Browser 或 Accessibility 表面；Canvas、远程桌面和权限不足同样可以正常得到 `unavailable`。
- DOM／AX 不可用时，只能对获准窗口范围提出或执行定向截图、OCR、图像或人工标注补采。保留来源、范围、映射和未决项。
- OCR、图像和坐标只是有来源的 locator 候选，不自动成为业务事实。禁止 AX → OCR → 坐标 → keyboard 的静默 fallback；每条获准替代策略必须在 plan 中显式排序、限定失效条件并独立资格。
- 窗口或显示器相对点使用已实现的 `Geometry` API，并保留越界拒绝；不得长期输出 `win.x + offset` 样板。
- 代码只使用当前 `docs/api/` 已实现的方法。路线图名称、设计草案或 application-engineer 中的未来 helper 不得写成可调用 API。

## 交付与状态用语

至少交付 plan、生产 Recipe、独立 Qualification Gate、Evidence 位置和 source map；blocked 时交付可复核的 plan 与 blockers，不伪造代码。最终报告分别使用并解释：

- `generated`：工件已经产生，不表示审阅或运行；
- `statically reviewed`：schema、source map、API 和分层规则已核对；
- `synthetically verified`：只用 fake／fixture 验证可观察逻辑；
- `live verified`：在明确授权的真实环境执行过指定入口；
- `qualified`：冻结 production 源码通过预定独立 Gate。

普通用户命令、正式 Gate 和视觉证据分别报告。没有实际运行就写 `not-run`；synthetic、旧 hash 或模型自述不得升级为 live／qualified。
