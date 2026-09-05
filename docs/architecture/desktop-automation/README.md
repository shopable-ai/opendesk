# 桌面自动化专项架构导航

## 先读方法，需要设计细节时再进入本目录

日常框架与方法集中在 [docs/frameworks/](../../frameworks/README.md)：总体框架 → 任务求解 → 应用分析 → 示范到自动化。这里保存专项模型和设计合同，不要求普通 Recipe 作者逐篇阅读。

[示范到自动化执行方法](../../frameworks/demonstration-to-automation-pipeline.md)的正文已迁入 `docs/frameworks/`；原路径只保留迁移入口，第 10 节千牛案例仍在同一份主流程正文中维护。

## 按问题直接进入

| 文件 | 回答的问题 | 什么时候需要读 |
| --- | --- | --- |
| [Action Target Model](action-target-model.md) | 目标、候选、定位依据、动作前后条件与安全失败如何表达？ | 设计相对定位、候选消歧、动作保护和结果验证时；一般调用先看公开 API |
| [App Adapter Contract](app-adapter-contract.md) | 通用窗口／区域结构与应用专属语义怎样交接？ | 封装应用 helper／adapter 或划分通用与业务职责时 |
| [App Classification Policy](app-classification-policy.md) | 应用类型怎样影响架构划分与适配范围？ | 选择或设计应用适配方案时 |
| [Agent-first Recorder](agent-first-recorder.md) | 示范采集、Trace、蒸馏、IR、Compiler 与 Replay 怎样组织？ | 明确研究或实施 Recorder／编译路线时；普通 Recipe 不以此为前置条件 |

## 另外两份是否必读？

**Action Target Model：定位和动作设计时按需读。** 重点看目标与坐标的区别、候选选择、前置／后置条件及安全失败去向。它是设计模型，不是当前 Runtime 的强制参数 schema；其中示意对象不能直接当作 Geometry／mouse 输入。

**Agent-first Recorder：做录制、蒸馏、编译和回放时再深入读。** 先看“适用范围与相关入口”和 Current／Validated／Target 的区分。普通业务脚本或单个 UI helper 不必因为本文件存在而建设 Recorder、IR 或新运行时。

## 与实际接口和验证的边界

实际调用以 [Desktop UI API](../../api/desktop-ui.md)、[Geometry API](../../api/geometry.md) 及对应当前源码、类型与测试为准。设计模型和历史验证记载不自动等于当前所有平台已支持。

业务对象、授权、步骤交接与成果失效条件见[自动化任务求解方法](../../frameworks/automation-problem-solving-framework.md)。方法阅读不替代业务成功验证；目录迁移不代表本目录模型重新通过源码或真机审计。

## 目录与维护规则

本目录的 Target、Adapter、应用分类与 Recorder 文档继续保留唯一正文；不为集中阅读把技术细节全部搬进 `frameworks/`，也不在两处复制维护。

主流程迁移映射：`docs/architecture/desktop-automation/demonstration-to-automation-pipeline.md` → `docs/frameworks/demonstration-to-automation-pipeline.md`。新引用使用新路径；旧路径仅为过渡导航，不是第二份方法文档。
