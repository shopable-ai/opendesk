# S8：业务分段与步骤输入输出

责任 Skill：[procedure-synthesize](../../../prompts/automation/agent-to-recipe/procedure-synthesize/SKILL.md)。专业依据：[任务求解方法](../../../docs/frameworks/automation-problem-solving-framework.md)。共同规则：[阶段约定](README.md)。

## 输入与进入条件

读取 S7 必要路径和证据映射、冻结合同、S6 实际数据流及相关应用认识。分段以真实子目标和状态转换为依据，不按点击数量、文件长度或应用名称拆分。

## 本阶段要做的事

把相邻必要动作组织为可解释、可验收的业务步骤。每步定义稳定 stepId、子目标、输入来源、数据类型、前置状态、允许副作用、输出、后置条件、验证、失败与重入边界。

先连接数据依赖，再检查现场状态依赖。例如前一步取数正确，并不保证后一步仍在正确账号／页面；下一步骤须明确哪些条件需要重新观察。

输出被后一步使用时记录 producer→consumer 关系，不能依赖隐含全局变量。等待、定位和临时坐标通常是步骤内部实现，不自动升为独立业务 Skill。

## 必须保存的输出与消费者

保存业务步骤草案，可使用 `procedure-draft.json`：orderedSteps、inputOutputBindings、preconditions／postconditions、verifiers、evidenceRefs、risk／failureSemantics 和未决事项。

草案只表示这份示范的业务理解，不是已泛化的可执行 IR。消费者 [S9](09-parameterize-and-generalize.md) 继续明确参数、控制流和支持范围，最终再发布完整 SemanticProcedure。

## 通过、阻塞与回退

每个步骤边界有业务意义、每个必要输出有消费者或明确用途、依赖无缺口时通过。不能只写“点击／等待／输入”，也不能因为分文件就宣称可独立运行。

必要动作解释不清返回 S7；缺真实数据来源返回 S6 定向补采。只修改受影响的步骤草案，不覆盖示范事实。

## 下一阶段与最小验收

进入 S9。检查：另一执行者只凭步骤草案及引用能画清数据流和现场要求；任意缺少上游值或前置状态时能指出具体阻塞位置，而非从头执行全部任务。
