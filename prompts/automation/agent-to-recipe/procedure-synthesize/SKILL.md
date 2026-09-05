---
name: procedure-synthesize
description: 仅根据 OpenDesk 任务合同、应用资料和真实示范交接包进行因果复盘、业务分段与参数化，交付 SemanticProcedure；缺证据时提出定向补采，不编造操作。
---

# 过程提炼

## 入口与依据

对应 S7—S9。先读[共享合同](../../../../docs/frameworks/agent-to-recipe-skill-contract.md)、[AGENTS.md](../../../../AGENTS.md)，按需使用[任务求解方法](../../../../docs/frameworks/automation-problem-solving-framework.md)的业务分段与数据交接规则。

本 Skill 默认只读业务现场与上游事实，写自己的提炼产物，不执行桌面操作、不修改 dossier、不生成最终候选。需要操作时返回具体补采请求。

## 输入核对

接收 request、冻结 TaskContract、AppProfile、DemonstrationDossier 及必要证据。先核对 taskId、版本、hash、适用范围与 Gate。只读明确引用的必要数据，不遍历完整聊天或所有截图。

成功路径提炼需要成功示范；失败包可以用于诊断或恢复候选研究，但不得被包装成成功程序的依据。缺少证据时明确列出哪一条主张无法支持。

## 工作方法

1. 重建任务叙事：业务子目标、输入来源、状态转换、实际结果、最终证明。区分事实、Agent 解释、假设和任务期望。
2. 按因果作用决定保留／排除。准备状态、读取数据和结果验证即使没有业务写入也可能必需；不能简单删除所有失败或重复动作。
3. 保留动作给出业务理由与证据；探索、误操作、无效绕路留在排除记录；恢复候选记录触发条件、风险及是否验证，不混入正常路径。
4. 按子目标和状态转换形成 BusinessStep。每步有输入、输出、前后条件、验证、副作用和失败语义，不以“点击坐标／等待一秒”命名业务步骤。
5. 分类 Input、Config、Secret 引用、Invariant、Runtime Value、Transient Value。写清类型、约束、来源、单位／精度（适用时）和消费者。
6. 明确真实数据依赖。示范 firstResult 的实际值只是样本；生成程序必须从当次 UI 重取并传递，不能把样本值当常量或使用期望值代替观察。
7. 分支、循环、恢复和跨平台适用性只声明有依据范围。单次示范欠定的内容列 unresolved／record-next，不为追求通用性补造规律。
8. 列出需要应用工程补强的目标、等待、验证等缺口，给出具体输入与验收；不要求重做整个应用分析。

## 必须保存的输出

`procedure.json` 按共享 SemanticProcedure：businessSteps、parameters、config、secretRefs、runtimeValues、dataDependencies、retainedReasons、omittedReasons、recoveryCandidates、supportedScope、unresolved、evidenceRefs。

业务步骤通过稳定 ID 关联 dossier 节点与证据。最终发布 handoff，消费者为 application-engineer（定向补强）和 recipe-build。过程说明不是 executable IR，不增加编译器或解释器。

## Gate 与失败

每个保留步骤和关键数据关系应有依据；无合理来源的业务值、不确定副作用、缺失任务结果证据不得放行生成。资料／引用问题映射 F7；业务解释 F3；验证缺口 F6；风险 F9。补采请求返回责任 Skill，不改写原观察。

## 最小独立验收

给一个不含前序操作聊天的 Agent dossier 及约定输入，它能输出业务步骤和 firstResult 的真实来源／消费关系。删除或替换关键证据时明确拒绝确认该关系，不通过算出正确数值来掩盖证据缺失。
