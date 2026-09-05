# S2：最小应用认识与起点确认

责任 Skill：[application-engineer](../../../prompts/automation/agent-to-recipe/application-engineer/SKILL.md)，discover。专业依据：[应用开发框架](../../../docs/frameworks/app-development-framework.md)。共同规则：[阶段约定](README.md)。

## 输入与进入条件

读取 S1 合同和当前工作包、已存在的 AppProfile、实际能力和环境资料。只研究本任务所需的应用区域与操作；测试目标说明不是已验证的 AppProfile。

## 本阶段要做的事

核对真实运行入口、权限、应用／账号／窗口身份、当前状态和证据目录。先复用适用的已验证知识，再做最小观察；根据当前真实公开能力选择结构、截图、图色或 OCR 等信号，不因为架构提到 AX／UIA 就假设当前入口已经支持。

形成任务相关的状态、区域、目标候选及观察方式。说明下一动作怎样定位、预期改变什么，以及如何读取结果。区分观察事实、状态解释、假设和不支持条件；记录坐标空间和失效条件，不能把旧截图点当当前可点击目标。

必要准备操作须在任务授权内；不为方便识别关闭其他应用、丢弃未保存数据或修改系统权限。新的重要发现以 planDelta 交给协调者，不重写用户目标。

## 必须保存的输出与消费者

保存 `app-profile.json` 和必要证据引用：应用身份、environmentScope、当前状态、相关区域／目标、geometryRules、操作与结果读取线索、preconditions、limitations、maturity。

条目按实际证据标 observed／demo-confirmed／qualified，不能整份资料默认 qualified。S3 使用当前任务所需操作；S10 在示范提炼后按具体缺口补强，不重复研究整个应用。

## 通过、阻塞与回退

正确对象和起点可确认、下一动作可安全执行且结果可观察时通过。权限缺失、窗口歧义、目标不可观察或 API 不支持时交付具体阻塞，不用未知假设放行动作。

业务对象或授权错误返回 S1；仅缺局部观察就在本阶段有界补采。已有知识仍适用时可复用，但动态现场必须重新确认。

## 下一阶段与最小验收

进入 [S3](03-demonstrate-actions.md)。检查：更换目标应用只改变本次输入与 AppProfile，不修改通用流程；已保存资料足以支持下一步而没有假装覆盖整个应用。
