# OpenDesk Workflows

本目录存放面向作者的普通 JavaScript Workflow。Workflow 是可以阅读、审阅、版本控制并直接运行的业务任务程序；它不是新的 Runtime、DSL 或加载格式。

## 最小作者约定

每个 Workflow 都应在同一个 `.js` 文件中清楚表达：

- `taskContract` / `goal`：要完成的业务任务、应用身份和边界；
- `successCriteria`：什么可观察结果才算成功；
- `application` / `surface`：bundle id、PID、窗口身份或其他目标上下文；
- `verifiedLayout` / `configuration`：只在确有必要时声明，并在运行时重新验证；
- 业务语义函数：例如 `calculateExpression()`、`createAutomationReport()`；
- `verification` / `oracle`：动作后的 UI、OCR、剪贴板、文件或业务结果验证；
- `qualificationAssumptions`：权限、应用版本、布局和安全前置条件；
- `async function main()`：公开入口；`ai run` 会等待它的 Promise。

公开 Workflow 从仓库根目录直接运行：

```bash
./dist/opendesk ai run workflows/macos/calculator/calculate-and-reuse-result.js
```

脚本内写清正常任务数据是作者体验的主路径。`Execution.input` 默认为 `{}`，只有确实需要由部署覆盖的业务数据或配置才作为可选覆盖；它不是每个 Workflow 的强制 JSON 外壳。底层 recipe 或测试 harness 可以继续使用 `--input`，但不应成为 Workflow 的主要使用方式。

## 分层边界

- **Workflow**：表达 Goal、Success Criteria、业务步骤、验证和失败语义。
- **Recipe / App-specific helpers**：实现窗口解析、局部截图、相对 Geometry、语义控件点击和应用局部观察。第一阶段可以与 Workflow 放在同一文件中，因为当前 Runtime 没有 module/import 加载支持。
- **Qualification / live gate**：只负责真实场景、Fresh Run、移动/resize/旧状态等受控扰动，并把 executionId、`Execution.artifactDir` 和结果保存到 `.runtime/`。
- **Recorder / IR / Compiler / Replay**：架构文档中的长期方向；本轮不把它们加入 Workflow 执行链，也不伪装成当前已经完整实现的能力。

## 运行语义

Workflow 使用已有 Runtime 全局对象（`App`、`window`、`Geometry`、`page`、`mouse`、`keyboard`、`Vision`、`File` 和 `Execution`），不新增注册器、加载器、解释器或应用专用 Go API。

稳定路径遵循：确认应用和窗口 → 每次读取当前 bounds → 用窗口相对 Geometry 投影动作点/ROI → 执行真实 UI 动作 → 以最小相关观察验证 → 失败即停。坐标只是本次运行的投影，不是 Workflow 的业务身份。OCR 只读取必要 ROI；OCR 结果进入后续业务动作时，必须来自真实 UI 观察，不能用 `eval`、`Function` 或预先计算替代。

Workflow 应保持 fail closed：目标歧义、身份变化、权限缺失、布局不匹配、OCR 不唯一或业务 Oracle 不通过，都应写入当前 execution artifact 后抛错，而不是继续点击或返回未经证明的成功。

## 当前参考 Workflow

- [`macos/calculator/calculate-and-reuse-result.js`](macos/calculator/calculate-and-reuse-result.js)：macOS Calculator L1。默认执行 `125*8`，从 Display ROI OCR 得到 `firstResult`，再执行 `firstResult/4+37` 并验证 `287`。

当前切片只收录 Calculator 参考 Workflow；TextEdit 不在本轮执行链中。

## Agent 生成与后续验证

开发流程使用[六个独立 Skill](../prompts/automation/agent-to-recipe/README.md)，每个生产者按[共享合同](../docs/frameworks/agent-to-recipe-skill-contract.md)交付确定版本的产物。示范必须保存关键业务值、来源与证据，供提炼和生成使用，不能依靠旧聊天记忆。

分阶段开发与最终同文件 JS 并不矛盾。开发接续可以复用有效知识和代码；Fresh Run 必须重新取得真实业务数据。Skill 目录不会给 Runtime 增加 import、调度、暂停恢复或新的 execution 入口。

后续计算器基本测试使用[计算器验证规程](../docs/quality/agent-to-recipe/calculator-validation.md)。其中分别定义 BASIC、现有 LIVE-GATE 与六 Skill PIPELINE；参考脚本成功不能替代新候选或跨 Agent 交接验收。本次只补充作业文件与导航，不声明计算器已重新运行或所有场景已通过。

方法事实源是 [`docs/frameworks/demonstration-to-automation-pipeline.md`](../docs/frameworks/demonstration-to-automation-pipeline.md)。原架构路径仅为迁移入口。其中的 Flow 0.1、Distill、IR、Compiler 和 Replay 描述目标演进与当前有限基础之间的差距，不能被本目录的普通脚本冒充为已经完成的通用引擎。
