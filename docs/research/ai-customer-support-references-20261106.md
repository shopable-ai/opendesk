# AI 客服助手：上游参考与本轮目标

检索日期：2026-11-06。通过 GitHub connector 读取上游文档、源码和许可证。本轮只借鉴行为与测试方法，不复制实现或增加依赖；固定 SHA 是检索时源码快照，不代表稳定发行版。

| 项目与上游证据 | 可借鉴行为 | OpenDesk 的取舍 |
| --- | --- | --- |
| [Promptfoo：faithfulness 文档](https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/context-faithfulness/)、[当前 output 与 context 的审核绑定](https://github.com/promptfoo/promptfoo/blob/69f84c38377fb3a4d65de797c0c396804214045b/src/assertions/contextFaithfulness.ts#L37-L62) | 拆分声明并逐项对照提供的 context；检索与生成分开评估 | 每条候选只审核自身 `evidenceIds` 对应的原文，完整展示待核实分句。使用保守的确定性完整分句比对，未实现上游的模型语义审核，不声称相同准确率 |
| [Chatwoot：Captain Copilot](https://www.chatwoot.com/hc/user-guide/articles/1738110272-how-to-use-captain-copilot)、[交接工具的原因备注与新消息检查](https://github.com/chatwoot/chatwoot/blob/4893b4919358cbac886969214e8f1e716160acad/enterprise/lib/captain/tools/handoff_tool.rb#L35-L62) | 当前会话总结、拟稿、显式选用；交接包含原因和上下文，避免在新客户消息之后继续旧动作 | 在现有推荐页显式预览/复制交接摘要，使用当前客户、问题、选中版本和编辑稿。复制只准备材料，不代表已转接、建工单或发送 |
| [Dify：检索片段与 metadata](https://github.com/langgenius/dify-docs/blob/27d1aae2b67c5e8389788a150fcc12db3ec894a0/en/cloud/use-dify/nodes/knowledge-retrieval.mdx#L114-L134)、[会话筛选](https://github.com/langgenius/dify/blob/e994c3ffe9482797df8546a921142868db4dc6ac/api/services/conversation_service.py#L17-L34) | 来源能回到具体片段；会话按应用、来源、用户隔离 | 复用现有 Binding 和版本自带的 result，不让交接或审核借用其他候选、后续查询或其他客户的来源 |
| [RAGFlow：无可用内容时 fallback](https://ragflow.io/docs/v1.0.0-rc3/chat_configuration)、[检索测试](https://ragflow.io/docs/v1.0.0-rc3/retrieval_testing) | 缺证据时明确兜底；先验证命中片段，再排查生成 | 原文缺失、无引用、覆盖不足、冲突明确进入待核实提醒；“有引用”不升级为“业务已核实”。所引产品文档为 RC 版本，不移植参数默认值 |

候选 `evidenceIds` 的具体设计及“复制交接摘要”按钮是结合本地契约的实现选择，上游没有规定相同的数据结构或按钮。完整分句文字相同只能说明字面相同，不能证明语义支持、来源真实、时效或适用范围；本轮不引入新的 RAG 服务、模型调用、CRM 或发送权限。

许可证核对：[Promptfoo MIT](https://github.com/promptfoo/promptfoo/blob/69f84c38377fb3a4d65de797c0c396804214045b/LICENSE)；Chatwoot [根 MIT 边界](https://github.com/chatwoot/chatwoot/blob/4893b4919358cbac886969214e8f1e716160acad/LICENSE)与所引 `enterprise/` 的 [Enterprise License](https://github.com/chatwoot/chatwoot/blob/4893b4919358cbac886969214e8f1e716160acad/enterprise/LICENSE)需分开；[Dify 自定义许可证](https://github.com/langgenius/dify/blob/e994c3ffe9482797df8546a921142868db4dc6ac/LICENSE)含多租户及前端标识条件，不能简称纯 Apache-2.0；[RAGFlow Apache-2.0](https://github.com/infiniflow/ragflow/blob/cf34ed9b5243f00daf0df37efe2a7e523f4cb297/LICENSE)。本轮自行实现上述产品思想。

## 本轮可验收目标

1. 候选 A 不使用候选 B 的引用；重查后仍使用被选版本的原证据。缺失或不可解析来源明确待核实。
2. 去除原逐句审核静默 `slice(0,24)`，完整审核当前有限编辑稿；第 25 段以后的未知内容可见。否定句的子串不冒称完整分句相同。
3. 在约 380px、原六页内增加折叠的人工交接预览和复制。编辑、选版本、切客户后内容随当前上下文派生；暂停/撤权后不提供交接复制。
4. 完成领域/状态测试、类型检查、正式 HTML 构建、ego 浏览器交互和适用的原生窗口验证。分别说明真实来源、模型和原生草稿的验证边界。

后续候选工作：以真实获授权商家资料建立检索/生成独立评测和知识缺口反馈；补多意图澄清；最后在取得系统授权与接口后考虑工单接入。未纳入本轮实现，不用合成测试冒称生产质量提升。
