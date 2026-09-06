---
name: recipe-build
description: 根据已确认过程，或既有脚本的有据接续处置，结合应用知识和当前 OpenDesk API 生成或登记普通 JavaScript 候选；不自行宣称验收通过。
---

# 普通脚本生成

## 入口与边界

对应 S11 的路线 A。先读[共享合同](../../../../docs/frameworks/agent-to-recipe-skill-contract.md)、[AGENTS.md](../../../../AGENTS.md)、[Workflow 作者约定](../../../../workflows/README.md)。API 签名与实际能力从当前 [API 文档](../../../../docs/api/README.md)、类型及必要源码核对。

只写本次候选和清单。不能为了让生成结果运行，顺手修改 OpenDesk Core、增加新入口、安装未获准服务或降低任务成功标准。

## 输入

共享 request；冻结 TaskContract；gate 可供正常消费的 SemanticProcedure；所需 AppProfile／helper；受支持入口与能力资料；业务输入合同。存在影响正常路径的 unresolved 时先阻塞。

完整新生成必须继续满足上述输入。已有脚本接续还需 hash 固定的源资产、明确接续／验收范围和按实际作用标注的证据：原样复用不要求为凑齐链路虚构 SemanticProcedure；最小修复只消费覆盖变更范围的已确认过程与证据。

原参考脚本可作为公开 API 和组织方式参考；是否读取过它须记录，不能把修改已有脚本伪称“完全从零生成”。引用来源不能代替本次真实示范。

## 生成要求

1. 检查本次生成或修复范围内的步骤和运行时值均有依据。完整新生成的范围必须覆盖合同要求的全部过程步骤和运行时依赖；只有已声明的接续最小修复才可窄于完整过程。目标／参数不明返回提炼，定位／等待缺口返回应用工程，缺真实证据返回示范。
2. 使用普通业务语义函数组织目标、输入校验、应用身份、状态准备、当前定位、动作、结果读取、断言及失败处理。公共入口和异步调用以当前 Runtime 合同为准。
3. 不因工具名相似而生成未支持 API；不假设 Node `process`、`require`、module/import、Recorder 注册器或额外执行引擎存在。当前不支持加载时可同文件逻辑分函数。
4. 每次执行重新取得窗口和必要业务状态；Geometry 规则只投影本次动作点。固定 sleep 只能是明确节奏控制，不是结果证明；等待必须有界。
5. Input、Config、Secret 引用、常量与 Runtime Value 分开。真实观察值传递到消费者；不能 hardcode 示范结果，也不能通过 eval／Function／JavaScript 算术替代任务要求的 UI 读取。
6. 重要失败写必要证据后抛错，不能 catch 后返回伪成功。最终成功条件在本次业务证据上检查，不只输出 passed: true。
7. 限制重复副作用；结果不明停止核对。不得把环境变量全集、原始凭据、无关屏幕或本机路径泄漏到公开日志。
8. 新生成或修复的候选放本次 attempt 并计算实际脚本 hash；接续中的原样复用则固定获准位置的现有 ref／hash，不覆盖、复制或重写它。明确工作目录、一行正常运行命令、输入方式、在线依赖、平台／布局范围和未测项。
9. 可以进行被授权的静态审阅；真实运行交给 recipe-qualify。仅保存代码不能标记真机通过。
10. 接续时先比较冻结脚本与实际需求。无需改动则保持同一 ref／hash，只建立清单和运行说明；需要改动则限制在已确认缺口，保留范围外代码，形成新候选、新 hash 与最小变更引用。两者都按共享合同记录真实来源和处置，不宣称从零生成。

## 必须保存的输出

普通 `.js` 候选与 `candidate.json`。CandidateManifest 按共享合同记录脚本路径／hash、合同和过程引用、应用知识版本、API 依据、entryCommand、workingDirectory、inputContract、dependencies、supportedScope、sourceMapping、limitations。接续所用可选元数据仍只按共享合同定义填写。

sourceMapping 使用业务步骤 ID 到函数名／代码区域的简表即可。不得为它引入编译器。最后发布 `handoff.json`，scope 明确为候选生成／静态检查，不是业务运行资格。

新生成或修复的候选放本次 attempt；原样复用可以直接引用获准位置的既有脚本，不复制、不重写。任何修改都产生新版本，原 QualificationRecord 不自动沿用。API 不存在、依赖不可用或输出不完整时返回具体缺口和 F0／F7／F10 等实际分类。

## 最小独立验收

只凭指定 procedure、AppProfile、合同和 API 资料，能生成普通入口可接收的候选与清单；新 Agent 能说明真实 firstResult 从哪读取、怎样进入后续计算。验证阶段必须另执行，不能用语法审阅替代。
