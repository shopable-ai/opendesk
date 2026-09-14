# 知识库 × 智能客服 × 业务自动化：中立应用架构

日期：2026-09-14。版本：设计 v0.1。代码审查基线：`07fd2cf4f151aa8142b115645dbc4fa9c8186cf4`（读取时的 `master`）。

**结论：建设客服业务协同应用，不建设客服平台；以中立 Adapter、封装既有 RAG 的 KnowledgeProvider、固定可信业务能力、绑定批准、独立验证和业务操作台账组成闭环。**

本文件定义应用内部合同，不发布新的 OpenDesk Runtime API。合同、模拟交互、真实集成、真机验证是四种不同证据。当前没有真实客户系统、RAG 入口、目标业务账号与授权，不宣称已接通生产系统。

接续：[已有框架就绪评估](README.md) · [既有商业方案](../../research/commercialization/knowledge-customer-service-automation.md)。本轮增量：[四家官方接口比较](provider-api-comparison.md) · [实施、证据与下一轮入口](implementation-handoff.md) · [中文交互样机](prototype/index.html)。本文件细化原方案，不覆盖原商业判断。

## 1. 所有权结构树

```text
Customer Service Application〔应用所有者：客户项目／集成应用〕
├─ Channel / Customer Service Adapter
│  ├─ 输入：认证后的渠道事件、会话引用、待发送交互
│  └─ 输出：标准事件、会话快照、发送回执；厂商协议留在 Adapter，不进 Framework
├─ Knowledge Provider
│  ├─ 输入：问题、已授权知识范围、适用地区／时间／产品
│  └─ 输出：答案依据、来源与版本、适用性和缺口；接已有 RAG，不重建 RAG
├─ Business Context
│  ├─ 输入：可信身份与待解析客户／订单／商品引用
│  └─ 输出：归属已校验的对象、真实状态、读取时间和版本；客户服务／业务 Connector 拥有
├─ Decision
│  ├─ 输入：客户请求、知识证据、实时数据、已批准业务规则
│  └─ 输出：回答／补信息／人工处理／动作提议；应用拥有，Agent 不授予权限
├─ Capability Resolver
│  ├─ 输入：动作提议与当前受信能力清单
│  └─ 输出：固定版本的执行计划，或 clarify／blocked／gap；应用拥有，接续既有 Lifecycle
├─ Approval
│  ├─ 输入：对象、参数、影响、能力与政策版本、前置状态
│  └─ 输出：可审计、限时、绑定精确操作的批准／拒绝；应用／客户原审批系统拥有
├─ Execution
│  ├─ 输入：已授权、已校验、版本冻结的业务操作
│  └─ 输出：动作观察与 execution 关联；API／协议 Connector 或普通 JS Recipe 执行
├─ Verification
│  ├─ 输入：原操作契约、目标对象、动作观察
│  └─ 输出：重新读取的实际结果及证据；业务验证器拥有，不接受执行器自报成功
├─ Result / Reply
│  ├─ 输入：验证结果、允许公开的事实、原会话路由
│  └─ 输出：内部记录、工单更新、准确回复及各自回执；应用＋渠道 Adapter 拥有
└─ Evidence / Maintenance
   ├─ 输入：事件／操作／尝试／执行／批准／结果／回填记录
   └─ 输出：恢复依据、脱敏失败包、维护指标；应用留存，开发期复用 Agent/Human-to-Recipe

OpenDesk Runtime〔通用执行底座，不属于客服业务层〕
└─ 复用 JS、Execution、HTTP、Webhook、Command、SQLite、UI/AX/OCR、取消及 artifacts
   条件性增量仅限：确有证据缺口的跨入口桌面资源 owner；不新增客服 namespace
```

应用中所有层不因为可复用就自动进入 Framework。客户政策、ERP 字段、回复风格、价格和客服厂商协议分别属于 Application／Config／Connector。只有跨场景稳定复用、涉及公共资源或生命周期、且已有组合无法解决，才申请框架变更。

## 2. 先固定实体与可信边界

`ConversationRef` 是原渠道交互上下文，不等于 OpenDesk 的业务任务。`WorkItemRef` 可指原厂 ticket／case，缺失合法。`BusinessObjectRef` 指订单、客户账户、商品、售后申请或报价。`requestId` 关联一次应用请求；`operationId` 标识一个明确业务意图；`attemptId` 标识一次获准尝试；`executionId` 关联真实 Runtime，彼此不能混用。

认证连接产生可信 `connectionId / principalRef / isolationScope / allowedTargets`；正文的 customerRef、businessRefs 只是待核实线索。姓名、邮箱相同、客户在消息中提供订单号，都不能直接证明对象归属。跨渠道客户合并必须经过客户主数据映射，不能靠模型推测。

外部消息、历史对话、附件、RAG 文档和模型输出均为数据，不得获得路径选择、执行代码、政策发布或批准权限。读取客户价格等只读行为也必须做对象级授权。

## 3. Provider-neutral Adapter：小公共核＋显式能力差异

四家样本及来源见比较文件。公共语义是“有出处的交互上下文＋客户引用＋明确可见性的消息＋可选工作项变更”，不是统一四家完整对象模型。

以下名称是应用模块建议，不是现成 Runtime 方法：

| 合同职责 | 输入 → 输出 | 必需性／副作用 |
| --- | --- | --- |
| `describe()` | 固定安装配置 → provider、API/adapter 版本、支持的交互/读写能力 | 必需；纯描述，不加载任意脚本探测 |
| `normalizeEvent(verifiedEvent)` | 已在传输边界验真的事件 → 标准事件或 ignore/reject | 必需；纯转换。原始验签发生在解析/重排 JSON 前 |
| `readConversation(ref, cursor?)` | 可信连接＋引用 → 消息页、参与者、原状态、revision、nextCursor、completeness | 按工作流需要；只读。事件本身是完整快照时可以使用注明时间的快照 |
| `readCustomer(ref)` | 渠道客户引用 → 渠道身份属性与业务关联线索 | 可选；不是授权裁决，不强求渠道拥有完整客户画像 |
| `writeInteraction(command)` | 会话、明确 visibility、内容、允许的证据引用、commandId → 写入/发送回执 | 写入能力按渠道声明；public 与 internal 明确区分，无默认可见性 |
| `patchWorkItem(command)` | 原工作项＋受支持字段意图＋预期 revision → 逐项结果 | 可选；不支持必须返回 unsupported，不偷偷改成公开回复 |
| `inspectDelivery(ref)` | commandId／providerMessageId → recorded/sent/delivered/unknown 等回执 | 可选；缺失时不能承诺可安全重复发送 |

不单独强制 `attachActionResult()`：应用把可公开结果投影成结果摘要／内部备注／受控链接，再由支持的 writeInteraction 或工作项扩展写入；完整证据留在应用受控存储。不能把内部备注降级成公开消息来模拟成功。

`writeInteraction` 至少明确 `visibility: customer | internal`、`intent: reply | note`、body、附件/证据引用、原会话路由与 commandId。外部邮件地址、抄送人和渠道不是模型可随意改写的路由。Adapter 校验发送者身份、回复窗口、原线程引用、渠道内容限制，并返回 `effectState: not_started | submitted | unknown` 与 providerRef，而非只给 HTTP 码。

`extensions` 使用预先登记的 provider＋schemaVersion 命名空间；可表达品牌、ticketType、渠道路由、自定义状态等差异。未知扩展拒绝，不支持任意 URL、method、脚本或原厂自由 JSON 透传。`describe()` 是厂商可表达范围，实际可用范围还要与安装授权及本次身份取交集。

标准快照保留 provider 原状态，不把 closed、solved、resolved 等强制合并成“业务完成”。附带 `observedAt / sourceRevision / completeness`，分页不完整不得暗示已读全部历史。事件乱序／编辑／删除触发重读和批准失效检查；没有可信单调序列时不靠 eventId 字典序重排。应用自己发出的备注和回复通过来源/回执映射抑制回环，不让系统自我触发无限执行。

## 4. Generic HTTP / Webhook 接入

### 4.1 提议的业务 JSON envelope

这是应用入站合同 v1 示例，不是修改 `OpenDeskWebhookRequest`。外层 Runtime request 保持原样；此 JSON 放在 `request.body`。

```json
{
  "schemaVersion": "cs.event.v1",
  "source": "generic-demo",
  "eventId": "evt-demo-001",
  "type": "customer.message",
  "occurredAt": "2026-09-14T08:00:00Z",
  "conversationRef": { "kind": "thread", "id": "thread-demo-001" },
  "customerRef": { "id": "customer-demo-001" },
  "message": { "id": "msg-demo-001", "text": "订单收到后有破损，申请售后。", "format": "plain" },
  "attachments": [{ "id": "photo-demo-001", "mediaType": "image/jpeg", "name": "破损照片.jpg" }],
  "businessRefs": [{ "system": "erp", "kind": "order", "id": "DEMO-123" }],
  "metadata": { "locale": "zh-CN" }
}
```

根字段严格校验，P0 customer.message 必须有 eventId、会话引用和消息；其他事件类型各有 schema，不能凭空补一条客户消息。ID 统一作为不透明字符串，保留原厂命名空间。`source` 仅用于分流与诊断，必须匹配已安装连接的允许值，不能选择另一客户的凭据。

`receivedAt / requestId / connectionId / principalRef / isolationScope` 由可信入口生成，外部不得覆盖。拒绝根级 tenantId、approved、scriptPath、sourceCode、shell、qualification 等控制字段；metadata 中即便出现类似文字也永远不进入授权/执行数据流，且仅保留白名单键。

附件先作为引用：限制数量、大小、类型，读取时经允许的 provider adapter 重新取回并验证；不携带随意外链、原机路径或整段 base64。确需 URL 的连接必须执行域名/IP/重定向和出站策略，避免访问本机/私网/云元数据，不向第三方转发渠道凭据。解析器隔离、内容按不可信输入处理。

### 4.2 两种部署，不添加 Webhook mode

```text
本地客户程序 → 既有 Webhook.listen → 当前可信 Execution 内的应用 handler
远端客服 SaaS → 客户已有公网集成服务〔验签＋必要持久收件〕
             → 本地受控 Integration Program → 既有 loopback Webhook／可信 CLI bridge
```

现有 Webhook 仅绑定 loopback、当前 Execution，等待 handler/Promise 真正结束；single-flight 和去重仅在当前 listener 内有效。原厂签名所需 raw body/header 不在普通业务 envelope 中重构：公网 adapter 先用原始字节验签，再转成已认证内部消息；两跳分别认证。[R1]

不要直接开放 Runtime script/management HTTP 接口，不开放 HTML 样机到 localhost Webhook 的 CORS。真实 App UI 通过已有 App Mode 受控桥接调用宿主；`Origin` 被拒绝是边界，不是待移除障碍。[R1][R3]

P0 优先“收件/读取/返回预览”或“已批准的短业务执行”，不要把人工等待塞进一次 HTTP 请求。批准前落业务状态、释放桌面；后续批准请求重新校验，并在当前受管执行内调用固定模块，或由可信外部宿主通过已有 bridge 启动明确的新执行。不得在一个 JS Execution 内偷偷嵌套启动独立 executions。

需要自动收取远端事件时，先复用客户服务端已有 inbox/任务能力；若没有而确需可靠接入，增加应用层最小 inbox/outbox，不改变 Runtime Webhook 为异步队列。只有事务提交了可恢复任务，才允许返回表示“已持久接收”的 202；明确它不是执行成功。此持久接入并未在本轮实现。

## 5. KnowledgeProvider：接已有 RAG，不把知识当授权

建议内部 `retrieveEvidence(request)`：输入 query、产品/地区/渠道/业务时间、授权知识范围、用途及可外发字段。授权范围由应用生成，不接受模型扩张。输出至少：

```text
knowledgeRequestId
status: supported | insufficient | conflict | unavailable
suggestedAnswer（可选，不是最终回复）
evidence[]:
  evidenceId、sourceRef、excerpt、documentVersion（未知为 null）
  policyRef（只是关联）、effectiveFrom/effectiveTo、retrievedAt
  applicability: matched | unknown | mismatch
  scope、accessScopeRef、用于支持哪些 claim
missingFacts[] / conflicts[] / limitations[]
```

检索分数不是正确率，`confidence` 若存在必须带评分类型/来源，不能用“高于 0.8”代替政策批准。旧 RAG 只有文本时，封装为证据不足、不可用于写入放行；不杜撰文档版本和来源。RAG 无法做检索前权限过滤时，不通过“检索后删除几段文字”冒充完整隔离；敏感知识接入保持阻塞，或使用客户已明确隔离的知识集合。

知识、实时事实和正式业务规则分别归属：RAG 提供“30 天售后”的资料；ERP 提供订单、交付日和当前状态；客户批准的政策配置决定地区、商品类型、渠道、材料、权限和例外。政策发布时间、业务适用时间与执行时的授权有效性分别检查，不能一律“取最新文档”。政策冲突/版本未知时转人工，不自动发起资金或出库。

已有 RAG 的位置、部署、鉴权、会话模型、schema、ACL 和引用能力仍待定位；不得据空搜索判定其不存在，也不得本轮重建。

## 6. Customer Service Action Pipeline

这是一条应用状态机，不是新 Workflow Engine。每个阶段都关联 requestId；写入阶段另关联 operationId/attemptId。内部记录本身属于受控持久副作用，下表的“外部副作用”指对客户业务/渠道系统的改变。

| 阶段 | 输入 → 输出 | Owner | 外部副作用 | 失败与重试 |
| --- | --- | --- | --- | --- |
| Receive | 原始投递＋认证 → 标准事件/收件回执 | Ingress/Adapter | 无 | 验签/格式失败拒绝；重复复用收件，不重启业务 |
| Normalize | 标准事件 → 请求上下文＋原始引用 | Adapter | 无 | 未知类型 ignore/unsupported；确定性重放可行 |
| Resolve objects | 身份＋引用 → 授权客户/业务对象 | Business Context | 无 | 歧义/越权/不存在分开；先澄清，网络读可有限重试 |
| Retrieve knowledge | 问题＋授权范围 → 证据/冲突/缺口 | KnowledgeProvider | 无业务写入；存在数据外发 | 只在既定外发策略内重试；不可用不编造答案 |
| Query state | 已授权对象 → 实时事实、时间、revision | Business Connector/只读 Recipe | 无业务写入 | stale/权限/不可达；只读且现场允许时有限重试 |
| Decide | 请求＋证据＋事实＋规则 → reply/clarify/manual/proposal | 应用规则＋有限 Agent | 无 | 模型 schema 不合格有界重试，越权提议拒绝 |
| Resolve capability | 提议＋固定清单 → 冻结计划或 blocked/gap | Resolver | 无 | 无资格/不匹配转阻塞；不在线生成 Recipe |
| Validate | 参数＋对象＋版本 → typed input＋前置条件 | 应用＋能力校验器 | 无 | 参数/归属不符拒绝；不让模型静默修正有意义字段 |
| Preview | 冻结输入＋影响 → 可读预览＋binding | 应用受信模板 | 无 | 信息不全则不可批准 |
| Approve | 预览＋当前操作者权限 → 批准/拒绝/过期 | 应用/客户审批 | 无业务写入 | 不自动重试批准，不保持桌面锁等待人工 |
| Preflight/claim | 批准＋当前状态 → 原子 claim＋执行许可 | 应用台账＋资源 owner | 尚未业务写入 | stale/争用/权限变更失效；未获许可绝不执行 |
| Execute | 获准操作 → action observation＋execution 关联 | API/协议/普通 Recipe | 有，按能力声明 | 未提交且可证明时才可重新预览；已提交/未知禁盲重试 |
| Verify | 原契约＋观察 → 实际对象、字段、状态与证据 | 独立业务验证器 | 只读 | pending 有界重查；unknown 对账；矛盾转人工 |
| Write back | 已核验投影 → 备注/工作项/结果附件各自回执 | 应用 outbox＋Adapter | 渠道写入 | 只修复失败命令；发送未知先查回执，不能重做原业务 |
| Reply | 允许公开的实际 claim → 回复＋发送回执 | 回复模板/受限 LLM＋Adapter | 向客户发消息 | 路由/内容重检；无证据不宣称成功；未知发送不盲发第二条 |

只回答/补信息分支跳过业务写入与业务批准，但仍需要数据授权、来源和回复路由校验。写入型 P0 的最终客户回复需客服审阅或采用预先批准的严格状态模板；动作批准不自动批准任意后续话术。

## 7. 最小业务能力合同

沿用既有 Lifecycle 的无环引用：Definition → 被 Candidate 固定；Qualification 引用 Candidate；可信 CatalogEntry/固定清单引用三者。不把 candidateRef 填回 Definition，也不接受 `qualified: true`。[R4]

| Definition 信息 | 应表达内容 |
| --- | --- |
| 业务身份/版本 | capabilityId、version、name、description |
| 输入/输出 | 严格 schema＋业务语义；money 用明确币种及十进制字符串/最小货币单位，禁止含混浮点金额 |
| 支持范围 | 目标软件、账号/渠道、平台、版本、locale、支持输入子域；声明域∩实际资格域∩宿主策略∩本次授权 |
| 对象/影响 | requiredObjects、read/write 字段、实际副作用；低风险标签不能替代影响清单 |
| 确认/策略 | risk、approvalPolicy、可信 preview、policyRefs |
| 执行/验证 | executor/verifier/reconciler 逻辑标识；实际代码及依赖 hash 由 Candidate 固定 |
| 运行边界 | 超时、取消边界、幂等能力、失败处理、桌面需求、资源释放规则 |

P0 只登记少数可信条目，例如 `order.lookup / shipment.lookup / after_sale.create_draft / crm.add_note / quote.create_draft`；这些是目标业务标识，不代表仓库当前已实现。写入示例只选一个动作，不把固定清单扩大成任意 DAG。

`after_sale.create_draft` 明确排除退款、出库和补发；`quote.create_draft` 明确排除正式发送、锁库存和成交承诺。目标系统“建草稿”若会触发这些影响，该实现不符合本能力，必须阻塞或另行设计授权，不靠名称宣称安全。

API 优先；协议只限合法授权且语义稳定的连接；无适用接口才使用已验证的 OpenDesk Recipe。找不到相应 Catalog 实现时使用维护者登记的不可变固定清单，不阻塞首单，也不伪造资格。

## 8. Action Preview / Approval

预览展示客户、精确订单/商品/业务账号、动作、全部实质参数、目标系统、已知影响与明确排除、能力/候选/政策版本、数据读取时间、前置状态和有效期。来源不明的字段显示“待确认”，不能隐藏后批准。

```text
准备执行：客户 演示客户；订单 DEMO-123
动作：创建待审核售后申请；原因：商品破损
退款金额：无；出库：无；目标系统：演示 ERP
能力：after_sale.create_draft@0.1.0-demo
[确认执行] [拒绝]       所有数据为模拟，不连接真实系统
```

生产批准由可信宿主持有，不是前端布尔值：绑定 isolationScope、操作者/角色、customer、businessObject、目标账号、operationId、规范化 arguments、capability/候选 hash、政策版本、前置条件摘要、有效期和 nonce。参数、客户、目标、版本或实质前置状态变化，旧批准失效。单纯重新读取时间变化不必失效，但需重新满足 freshness 窗口。

批准记录一次性绑定操作，原子 claim 防双击/多坐席重复启动。过期、撤销、角色权限变化、客户撤回请求或关键新消息到达时再检查。批准和外部提交之间仍可能有并发修改：API 有条件写入就使用；GUI 无事务条件写入时紧贴提交做重读，不能消除的风险必须在资格范围/部署中限制并接受，不能把预检宣称原子事务。

P0 退款、补发、地址/权限/金额变更、删除不自动放行；本轮不提供这些执行能力。等待人工不保持执行栈/桌面资源；恢复时从业务阶段重校验，不从任意脚本行续跑。

## 9. Result / Verification Contract：四个业务轴＋独立通信轴，不用单一 success

```json
{
  "schemaVersion": "cs.result.v1",
  "requestId": "req-demo-001",
  "operationId": "op-demo-001",
  "attemptId": "attempt-demo-001",
  "execution": { "id": "exec-demo-001", "status": "completed" },
  "action": { "state": "submitted", "capabilityId": "after_sale.create_draft", "version": "0.1.0-demo" },
  "verification": { "status": "verified", "evidenceRefs": ["evidence-demo-reread-001"], "observedAt": "2026-09-14T08:02:00Z" },
  "business": { "status": "pending_review", "object": { "system": "erp", "kind": "after_sale", "id": "DEMO-AS-1001" }, "actual": { "orderId": "DEMO-123", "reason": "商品破损" } },
  "communication": { "internalNote": "recorded", "ticketUpdate": "not_requested", "reply": "pending_review" },
  "allowedClaims": ["after_sale.application_created", "after_sale.waiting_for_review"],
  "timestamp": "2026-09-14T08:02:00Z"
}
```

枚举属于拟议应用合同。execution 描述脚本是否结束；action 描述是否提交；verification 描述证据是否足够；business 保留实际目标状态。业务“待审核”可被成功核验，但不是退款完成。公开摘要另保存完整能力/候选/政策版本和每次 attempt 关联。

界面投影明确区分：Execution Success、Action Submitted、Business Verified、Pending、Partially Completed、Result Unknown、Failed。比如“脚本正常结束＋未回读”只能显示已提交/待核验；“查询成功＋业务仍 pending”不是失败；“请求已取消＋可能已提交”必须 unknown 或实际已核验状态，不虚报撤销。

证据包括来源系统、对象、读取方法、读取时间、revision/字段、保留引用及访问范围。验证器根据原任务检查对象归属、关键字段、实际单号、状态及禁止影响；不得拿 expected、写入回包、点击日志或 LLM 自述充当独立回读。UI 重开详情核对可作为有限强度证据，但须说明弱于独立后台记录及可能遗漏隐式副作用。

回复只允许已核验且可公开的 claim：

- 正确：“售后申请已登记，编号 DEMO-AS-1001，目前等待审核。”
- 未知：“系统尚不能确认申请是否登记，已转人工核对；请勿重复提交。”
- 报价：“已创建报价草稿 DEMO-Q-1001，价格/交期仍待确认，尚未发送正式报价。”

内部政策备注、客户专属价格、完整截图、秘密和其他客户信息不随结果一并公开。先生成允许公开事实投影，再润色；改写不得扩大动作阶段、金额、期限或承诺。

## 10. Idempotency / Recovery

交付去重、业务防重、回复防重分别管理：

```text
deliveryKey = 可信 connectionId + source eventId
operationKey = 可信隔离范围 + 已确定的业务意图标识
outboundKey = operationId + 目标会话 + 交互类型 + 内容版本
```

operationKey 不是 eventId，也不是把订单号永久去重。不同消息可能表达同一售后意图；同一订单也可以有不同合法申请。应用在可信解析/人工确认后绑定意图；语义不确定时合并为待审提议或要求确认，不盲目自动新建。相同 key 的参数不同报冲突，不覆盖旧动作或另发新 key 绕过。

选择一个业务状态权威源：客户现有服务数据库优先；本地交付需要时用已有 SQLite 建独立应用库。不开两套可写权威状态、不使用 Scheduler 内部表。最小实体是 inbox、operation、attempt、approval、outbox；不必五个服务，也不新建执行管理器。

写前事务记录已批准意图并 CAS claim；外部副作用不在本地数据库事务内。目标 API 支持幂等键/唯一外部引用时传同一稳定业务 key；GUI 能保存外部关联号时使用。提交后重新读取实际对象，事务记录结果并生成 outbox。没有足够检索/唯一性能力的写入不承诺跨系统 exactly-once；首个自动写入的资格必须包含恢复策略。

```text
ERP 已提交 → 应用在记结果前崩溃
→ operation/attempt 仍标执行中或未知
→ 先确认旧 executor 已停止（不能与旧运行争用）
→ 按外部关联号、对象、输入与时间范围进行只读对账
→ 唯一匹配且字段吻合：恢复为 verified，继续回填
→ 仍 pending：等待并有界重查
→ 多个匹配／无法证明未发生／字段矛盾：unknown 或 partial，人工处理
→ 只有确证未提交且原运行已终止，才重新授权尝试
```

超时、连接断开、取消、进程退出本身都不是“未提交”证据。补偿不是通用 undo，更不能自动退款/删除以“恢复一致”。UI 停止按钮先表示停止请求，实际结束后才能释放执行资源。

业务写入已 verified、内部备注失败时只恢复对应 outbox command；不能重建申请。渠道写入也有“已写但回执丢失”的未知窗口：优先原厂幂等或查询消息 ID/关联标记；能力不足时交人工，不保证绝不重复发消息。公开回复、内部备注、工单 patch 逐项记录，无跨厂商原子批量成功假设。

## 11. Desktop Resource Ownership：当前不具备跨入口放行证据

本轮静态审查不能证明跨 CLI/HTTP/Scheduler/App/Webhook 的整桌面独占已满足，故 GUI 生产写入暂不放行。不是断言所有代码中不存在任何相关锁。

| 已读证据 | 能证明什么 | 不能证明什么 |
| --- | --- | --- |
| `automation/webhook.go:1–150`＋Webhook Reference | listener active/queue/dedupe 属于 execution-owned host | 不同 listener、execution、进程共享一个桌面 owner |
| `pkg/execution/manager.go` | 进程内多执行记录、取消请求、Done/WaitAll | register 不做整桌面互斥；Cancel 返回不表示已结束 |
| `pkg/execution/runner.go:1–210` | CLI/App/HTTP/Scheduler 的能力注入不同，资源按 Execution 配置 | 一个入口有能力不等于所有入口有能力或统一独占 |
| `scheduler-runtime-concurrency.md:1–200` | 每个 Scheduler Store 单 active runner、OS 文件锁 | 两个不同 Store 或非 Scheduler 执行被同一桌面锁覆盖 |
| HTTP Reference | 可创建独立 execution；script 管理入口不是客服入口 | 不能据此认为远程脚本拥有本地 AX/SQLite/Command |

本轮不修改 Runtime，不发布 DesktopLock/DesktopSession/DesktopMutex。API-only 路线不因桌面门槛受阻；首次 GUI 试点可以在隔离的交互 OS 会话/专用工作机、单受控 worker、关闭其他自动化入口并禁止人工同时操作的部署中进行，但这只是部署约束，不是通用锁已实现。

确需多入口共存时的最小框架候选：

```text
宿主内部 resource identity = 机器 + OS 交互会话/desktop（不是窗口或 scheduler.db）
获准桌面操作段 → 跨进程 owner → 所有受管输入/焦点/AX mutation 入口检查 generation
active → stopping → 实际输入、回调和受管 helper 已静止 → release
无法证明静止 → quarantined / 拒绝新动作，不靠 TTL 到期或删除锁文件强抢
```

按短“桌面操作段”拥有资源，不锁住整个长寿命 App/等待审批的 Execution；业务 key 的未知状态可继续保留，而已安全停机的桌面可以服务无关任务。只加 App JS mutex、只锁 Scheduler 或只检查一次窗口不满足跨进程要求。

复用已有 OS lock/生命周期原语，先内部接入共同执行与输入路径，不引入新公开 namespace。OS 锁释放不等于脱离管理的 helper 已停止；迟到回调必须拒绝旧 generation。该模型只能约束受管代码，不能声称阻挡系统用户或任意恶意原生程序。

必须验证五类入口两两争用、不同 Scheduler DB、多进程、取消未结束、崩溃遗留 helper、同桌面不同窗口、等待批准不持锁、资源隔离与恢复。完整接口和实现位置在定向代码审查后确定，不能从本设计直接宣布实现。

## 12. 两条案例贯通（全部为合成业务数据）

| 环节 | Case A：售后申请 | Case B：专业咨询/报价 |
| --- | --- | --- |
| 收件与对象 | generic 事件提取 DEMO-123；核实客户与订单归属 | 客户描述设备需求；核实客户账号及价格访问权 |
| 知识 | RAG 返回售后材料/适用政策证据 | RAG 返回型号规格、兼容表、版本与引用 |
| 补信息 | 缺破损照片/商品序列号则停在 needs_information | 缺供电/数量/环境则澄清，不猜兼容性 |
| 实时数据 | ERP 读取交付日、商品类型、原售后申请、状态 | 查询实时库存/交期/客户价格、币种、税费、有效期 |
| 规则判断 | 客户批准政策决定能否创建待审核申请 | 业务规则/专业复核决定型号与价格可否使用；库存不等于承诺可交货 |
| 能力选择 | 固定 after_sale.create_draft；资金/出库明确禁止 | 仅建议可直接走回复；确需建单才选 quote.create_draft |
| 预览/批准 | 展示订单、原因、材料、版本和影响；客服批准 | 展示规格证据、数量、客户价、税费、期限；批准仅授权草稿 |
| 执行 | preflight 再查旧申请/订单；一次建单并保留关联号 | 再查价格/库存新鲜度；一次建草稿，不锁库存、不发正式报价 |
| 验证 | 重新读取实际申请号、订单、原因、pending_review | 重新读取实际报价号、客户、行项目、币种、草稿状态 |
| 回填/回复 | 内部备注＋原工单可选更新；只说已登记、等待审核 | 回填依据和草稿号；明确尚未形成正式报价或履约承诺 |
| 恢复 | 提交后超时先按关联号查，不能重复点击 | 价格变动旧批准失效；草稿已建但备注失败只补回填 |

案例是设计推演；HTML 与自动交互测试仅验证模拟路径。没有真实 RAG/ERP/CRM/客服账号，不能认定两条业务已集成通过。

## 13. 最小产品与 apps 决定

**本轮不建立 `apps/customer-service-automation/`。** 先交付 `docs/scenarios/customer-service/prototype/` 下可离线打开的中文 HTML 与自动交互测试。它是合同/交互验证器，不是正式应用，不调用模型、Runtime、渠道或真实业务接口。

未来真实应用只包括：一个受控请求入口、当前请求详情、知识/实时数据/规则分栏、动作预览、批准/拒绝/停止、执行/业务/回填分离状态、证据详情。优先嵌入客户现有客服侧边栏或独立小窗口；不复制坐席排队、IM、工单系统和组织管理。

样机经用户审阅，且至少一个真实 KnowledgeProvider 或业务只读接入能稳定返回数据后，再将真实应用级实现放入 apps；设计样机继续留作基准。正式写入前还必须通过身份、批准、防重、恢复、独立验证及对应运行入口能力门槛。后续具体执行指令见实施交接文件。

## 仓库证据索引

以下链接指现有仓库文件；本轮读取范围见第 11 节与 implementation-handoff。引用存在不等于本轮运行过测试。

[R1] [Webhook](../../api/webhook.md)、[native owner](../../../automation/webhook.go)。
[R2] [Execution Manager](../../../pkg/execution/manager.go)、[Runner](../../../pkg/execution/runner.go)。
[R3] [HTTP Server](../../api/http-server.md)、[External Workflow Integration](../../architecture/external-workflow-runtime-integration.md)。
[R4] [Capability Lifecycle](../../architecture/desktop-automation/task-capability-lifecycle.md)。
[R5] [Scheduler concurrency](../../architecture/scheduler-runtime-concurrency.md)。
