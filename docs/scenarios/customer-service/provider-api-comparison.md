# 四类客服系统公开接口比较与中立合同推导

查阅：2026-09-14。用途：抽取应用集成语义；不是 Connector 实现、厂商推荐、价格研究或真实账号验收。总设计见 [provider-neutral-architecture.md](provider-neutral-architecture.md)。仅依据以下官方材料；未使用第三方聚合接口作为合同依据。

## 1. 四类样本

| 样本/类型 | 会话与工作项 | 客户关联 | 回复/内部记录 | 事件接入与认证 | 不能抹平的差异 |
| --- | --- | --- | --- | --- | --- |
| Zendesk／工单型 | Ticket；comments 形成对话记录 | requester/用户引用；不能把用户 ID 当 ERP 账户授权 | 通过 Tickets 创建/更新时加入 comment；`public=false` 表示内部备注。Ticket Comments API 本身没有创建 comment 的端点 [Z1][Z2] | Webhooks；API token 或 OAuth；入站官方签名使用时间戳和原始 body [Z1][Z3][Z4] | 工单字段变更与评论可能同一个原厂调用；公开可见性须每次明确，不能沿用上次值 |
| Intercom／会话型 | Conversation＋parts；另有 Tickets 和 linked objects，不能强行一一等同 | contacts 列表、company 等；群组会话可有多个客户 [I1] | 对话 reply 支持客户可见消息和 admin note；note 指内部评论。会话 open/close/snooze/assignment 有独立管理语义 [I1][I2] | Webhook topics；token/OAuth；`X-Hub-Signature` 验证原始通知 [I2][I3] | 发送者 admin 身份、contacts 多值、会话状态和 ticket 状态分别处理；读取需标注历史完整性 |
| Gorgias／电商客服型 | Ticket＋message；围绕客户、渠道与业务集成 | customer 与 ticket 关联；HTTP integration 可引用 customer 字段 [G3] | create message 带 public、source/channel/via；内部备注为非 public。`sent_datetime` 的含义会影响记录导入与发送 [G1] | Ticket 事件驱动 HTTP integrations；可设置鉴权 header/OAuth；REST 私有集成使用 email＋API key 的 Basic [G2][G3] | “写入一条历史消息”不等于真正发送；不能盲传 actions、发送时间和渠道字段；密钥绑定用户 |
| Salesforce Service Cloud／CRM 记录型 | Case＋EmailMessage/CaseComment 等关联记录，而不是单一 conversation 对象 [S1–S3] | Case 与 Contact/Account 等业务记录关联；须核验具体 org schema、共享与字段权限 | CaseComment 可见性与实际客户渠道发送分开建模；EmailMessage/实际发送链路需按客户 org 与渠道确认，不能假定插入记录就发送 [S2][S3] | OAuth；CDC/Platform Events 可经 Pub/Sub（gRPC/HTTP2/Avro）订阅 [S4][S5] | 事件接入不一定是 HTTP webhook；对象、字段、状态和自动化可能由 org 定制，不能直接统一成 `sendReply(caseId,text)` |

Salesforce 的对象详情页面在本轮浏览器提取中主要取得官方索引摘要，Pub/Sub/CDC 正文可读。其具体字段可写性、邮件发送动作与 org 自动化未完成逐字段验证：保留为 Provider-specific 待核验项，不用猜测补齐。此限制不影响已确认的“Case 记录模型与事件订阅不同于普通 Ticket Webhook”结论。

Intercom 官方页面本轮显示 v2.16；实际 Connector 应固定经测试版本，不能追随网页默认版本自动升级。Gorgias 的旧 `list-ticket-messages` 页面明确标为 deprecated，不能照旧示例冻结实现 [G4]。四家全部未做真实账号调用。

## 2. 从样本抽出的公共合同

**公共核不是“大一统客服对象”，而是可追踪交互与可验证写入。**

| 公共语义 | 推导理由 | 落点 |
| --- | --- | --- |
| connection-scoped reference | 不同厂商同一个数字 ID 不同含义；CRM Case 不等于 message thread | `{kind,id}`＋可信 connectionId；原厂引用保留 |
| conversation snapshot | 需要上下文但分页、parts、记录种类不同 | messages、participants、原状态、revision、observedAt、completeness |
| customer reference | user/contact/customer/CRM record 并不共享身份模型 | 渠道引用＋可信客户主数据映射；不硬塞单一 userId |
| explicit interaction visibility | 四家表达内部/外部记录的方式不同 | writeInteraction 必须声明 internal/customer；不支持时拒绝 |
| optional work-item mutation | 工单、case 和对话管理不等价 | patchWorkItem 可选；支持字段/状态逐个声明 |
| per-command result receipt | API 成功、记录保存、邮件发送/送达不是同一事实 | providerRef、effectState、deliveryState、observedAt |
| event source abstraction | Webhooks、HTTP integrations、订阅事件流都存在 | 验真的事件交给 normalizeEvent；不要求每家实现 HTTP receiveEvent |
| capability declaration | 不能承诺每个安装和渠道支持同样操作 | describe 与宿主授权交集；unsupported 不是悄悄降级 |

因此不把 `getConversation/getCustomerContext/sendReply/addInternalNote/updateTicket/attachActionResult` 六个名字全部设为强制方法。推荐最小读写语义见主架构第 3 节；readCustomer、patchWorkItem、inspectDelivery 均按实际工作流和 provider 能力启用。

## 3. Provider-specific Extension 与出站安全

扩展承载 ticketType、品牌、原生状态、自定义字段、原渠道发件身份和 threading。使用预登记、版本化 schema，不能通过扩展透传任意原厂 API 请求。所有外部写入受同一应用批准/副作用规则约束，不能因为叫“备注”就绕开策略。

渠道只支持公开回复而不支持内部记录时，内部证据仍保留在应用，不公开发布来“兼容”。无法查询消息发送结果时，记录 delivery unknown 并交人工，而不是用重复发送逼近成功。

附件的可访问链接不代表安全可访问，Zendesk 官方明确提醒不要向外部附件地址泄露其认证凭据 [Z1]。公共合同保留附件引用，不把任意 URL 直接交给通用下载器。

企业已有客服服务/自研系统先使用 Generic HTTP/本地集成程序，真实第一个客户决定最先实施哪种 Adapter；本轮不创建四家 Connector 空目录。

## 4. 官方来源与查阅边界

所有 URL 查阅日期均为 2026-09-14。以下是参考资料，不是 OpenDesk 已实现的证据。

- [Z1] Zendesk Ticket Comments：`https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_comments/`。创建归 Tickets、public、附件/凭据边界。
- [Z2] Zendesk Tickets：`https://developer.zendesk.com/api-reference/ticketing/tickets/tickets/`。Ticket 与调用者视角。
- [Z3] Zendesk Webhooks：`https://developer.zendesk.com/api-reference/webhooks/webhooks-api/webhooks/`。活动触发 HTTP 请求。
- [Z4] Zendesk Verifying webhook authenticity：`https://developer.zendesk.com/documentation/webhooks/verifying/`。签名、时间戳和原始 body。
- [I1] Intercom Manage a conversation：`https://developers.intercom.com/docs/references/rest-api/api.intercom.io/conversations/manageconversation`。管理语义、contacts、parts、版本。
- [I2] Intercom developer FAQs（官方帮助，页面日期 2026-08-27）：`https://www.intercom.com/help/en/articles/9071694-intercom-developer-faqs`。token/OAuth、回复及内部 note。
- [I3] Intercom Webhook Topics：`https://developers.intercom.com/docs/references/webhooks/webhook-models`。通知、topics 和签名。
- [G1] Gorgias Create a message：`https://developers.gorgias.com/reference/create-ticket-message`。消息可见性、source/via、发送时间。
- [G2] Gorgias REST API credentials：`https://docs.gorgias.com/en-US/rest-api-208286`。Basic 与个人 API key。
- [G3] Gorgias HTTP Integrations：`https://docs.gorgias.com/en-US/connect-external-apps-to-gorgias-and-create-sidebar-widgets-81822`。事件类型、鉴权、侧栏/业务数据集成。
- [G4] Gorgias List messages of a ticket：`https://developers.gorgias.com/reference/list-ticket-messages`。已标记弃用。
- [S1] Salesforce Case：`https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_case.htm`。官方索引摘要。
- [S2] Salesforce CaseComment：`https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_casecomment.htm`。官方索引摘要，具体 org 需复核。
- [S3] Salesforce EmailMessage：`https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_emailmessage.htm`。官方索引摘要，不证明发送链路。
- [S4] Salesforce Pub/Sub：`https://developer.salesforce.com/docs/platform/pub-sub-api/guide/intro.html`；CDC：`https://developer.salesforce.com/docs/platform/change-data-capture/guide/cdc-intro.html`。事件机制。
- [S5] Salesforce OAuth flows：`https://help.salesforce.com/s/articleView?id=remoteaccess_oauth_flows.htm&language=en_US`。官方索引摘要，具体流待安装环境确认。
