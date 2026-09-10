# Desktop App Adapter Contract｜桌面应用适配层合同

## 一、目的

本文定义 OpenDesk 通用桌面能力与“某个具体应用的业务语义”之间怎样交接。

核心原则：

```text
通用 Runtime / Framework
负责：窗口、区域、AX/UIA、OCR、布局、通用 Collection、目标定位和动作原语

App Adapter
负责：把这些通用事实解释成某个应用里的会话、消息、订单、输入区、发送按钮等

Recipe
负责：本次业务流程接下来怎么办
```

因此：

```text
Collection core 负责“界面里可靠读到了什么”
App Adapter 负责“这些内容在这个应用里是什么”
Recipe 负责“拿到业务对象后接下来做什么”
```

关联：[结构化界面集合读取](structured-ui-collection-reading.md)、[Action Target Model](action-target-model.md)、[Native Accessibility](native-accessibility.md)、[Desktop UI API](../../api/desktop-ui.md)。

## 二、总体分层

```text
Layer A｜窗口 / Surface
        ↓
Layer B｜通用结构观察
        ├─ AX/UIA
        ├─ OCR
        ├─ Screenshot / Layout
        └─ CollectionItem[]（需要重复结构时）
        ↓
Layer C｜App Adapter
        应用语义解释
        ↓
Layer D｜Action / Guard / Verification
        ↓
Recipe
        业务流程控制
```

App Adapter 不创建第二套 Accessibility、OCR、Vision、Collection 或 Action Runtime。

## 三、Surface Snapshot｜窗口表面事实

Owner：Window / Surface 层。

示意输入：

```json
{
  "appId": "slack-desktop",
  "windowMatch": {
    "titleIncludes": ["Slack"],
    "exeIncludes": ["slack"]
  }
}
```

示意输出：

```json
{
  "appId": "slack-desktop",
  "windowId": "runtime-current-window-id",
  "title": "Slack | Workspace",
  "process": {
    "pid": 1234,
    "exeName": "Slack"
  },
  "bounds": { "x": 80, "y": 60, "width": 1280, "height": 860 },
  "scale": 1,
  "screenshotPath": ".runtime/temp/surface/slack-latest.png",
  "capturedAt": "2026-09-10T12:00:00.000Z"
}
```

必须保证：

- 窗口身份属于当前运行且可重新验证；
- screenshot 与窗口范围的坐标映射明确；
- scale / DPI 不能靠猜；
- 不在这一层声明联系人、订单、已发送等业务结论。

## 四、Layout / Region｜通用区域结构

Owner：通用 Layout / Region 层。

输出只使用结构名称，例如：

```json
{
  "regions": [
    { "id": "sidebar", "role": "sidebar" },
    { "id": "nav_list", "role": "nav_list" },
    { "id": "header", "role": "header" },
    { "id": "content_main", "role": "content_main" },
    { "id": "input_panel", "role": "input_panel" }
  ]
}
```

这一层可以说：

```text
这里像一个列表区域
这里像主内容区域
这里像输入区域
```

但不能直接说：

```text
这是微信消息列表
这是目标客户的会话
这里已经发送成功
```

几何置信度也不等于业务正确性。

## 五、Structured Collection｜重复界面的通用集合

页面包含 list / table / timeline / grid / cards / tree 等重复结构时，可以先消费[结构化界面集合读取](structured-ui-collection-reading.md)得到通用 `CollectionItem[]`。

例如通用层只能得到：

```js
[
  {
    elements: [
      { kind: "text", text: "张三", source: "ocr" },
      { kind: "text", text: "你好", source: "ocr" },
      { kind: "text", text: "10:32", source: "ocr" }
    ],
    evidence: []
  }
]
```

它还不能声称：

```text
张三 = 联系人名称
你好 = 最后一条消息
10:32 = 最后消息时间
```

这些解释属于 App Adapter。

### Collection 与 Recipe 的边界

App Adapter 只负责当前已取得数据的业务语义映射。

跨视口业务策略继续由 Recipe 决定：

```text
是否继续滚动
是否点击下一页 / Load More
怎样按业务 identity 去重
怎样判断业务上已经结束
下一步读取、点击、输入还是提交
```

不要把这些重新塞入 CollectionProfile 或 App Adapter 的通用结构合同。

## 六、Semantic Adapter｜应用语义适配

Owner：App Adapter。

它消费通用结构事实，然后映射成具体应用语义。

例如聊天应用：

```js
function mapConversationItem(item) {
  return {
    contactName: /* 依据已验证的应用规则从 item 取得 */,
    lastMessage: /* ... */,
    time: /* ... */,
    evidence: item.evidence
  };
}
```

订单应用则可能映射为：

```js
function mapOrderItem(item) {
  return {
    orderId: /* ... */,
    status: /* ... */,
    buyer: /* ... */,
    evidence: item.evidence
  };
}
```

### Adapter 可以负责什么

- 应用页面 / 状态的业务名称；
- 通用 region → 应用区域含义；
- `CollectionItem` 中哪些字段对应联系人、订单号、状态等；
- 应用版本、语言或布局特有的结构规则；
- 应用专属 locator / helper；
- 应用专属动作前置条件和业务结果验证；
- 经验证的应用专属替代路径。

### Adapter 不负责什么

- 自己实现 AX/UIA backend；
- 自己实现 OCR engine；
- 自己实现第二套截图/坐标系统；
- 把 VLM 输出直接当事实；
- 把通用 Collection core 复制一遍；
- 决定整个业务流程的滚动、翻页、终止和下一步控制流；
- 把一次 bbox 或一次 native ref 当永久身份。

## 七、来源与证据

新架构统一使用稳定的来源类别：

```text
accessibility
ocr/text
layout
image/template
manual evidence
semantic assist
```

`Vision.detectUI()` 已是 Deprecated，不再作为新的架构 provenance 名称。

Adapter 的每个关键业务语义必须能追溯到：

- source region / CollectionItem；
- Observation / evidence；
- 已验证规则版本；
- 必要 confidence 或明确 verification 状态。

如果 App Adapter 不能证明 `fieldA` 为什么是 `orderId`，应返回业务映射不确定，而不是修改底层 Collection 结果使它“刚好符合预期”。

## 八、Target / Locator 与 Adapter 的关系

App Adapter 解释出业务对象以后，如果 Recipe 要操作它，不能直接使用之前采集时的 bbox 点击。

正确链路：

```text
CollectionItem[]
    ↓
App Adapter
    ↓
业务对象
    ↓
Recipe 选定要操作的对象
    ↓
Target candidate
    ↓
LocatorBundle
AX/UIA + text/OCR + image + anchor/relative geometry
    ↓
TargetResolver
    ↓
动作前检查
    ↓
Action
    ↓
Verification
```

这保证“读一批数据”和“重新定位一个可执行目标”是两种不同职责。

## 九、Action Contract｜动作合同

通用动作至少表达：

- action id；
- risk level；
- target；
- preconditions；
- effect；
- postconditions；
- evidence。

示意：

```json
{
  "actionId": "write_draft",
  "riskLevel": "medium",
  "target": {
    "regionId": "input_panel"
  },
  "payload": {
    "text": "hello from opendesk"
  },
  "preconditions": [
    "window_frontmost",
    "input_anchor_resolved"
  ],
  "postconditions": [
    "draft_visible"
  ]
}
```

动作被原生后端接受不等于业务完成。业务后置条件仍需单独验证。

## 十、Verification Contract｜验证合同

Verification 是一等输出，不是日志里的附属说明。

可用来源包括：

```text
geometry
accessibility/native state
ocr/text
image/template
multi-source
manual-gated
business-specific oracle
```

不要再以 Deprecated `detect-ui` 作为新验证模式名称。

原则：

- 低风险可以使用足够的局部结构验证；
- 中高风险优先多源或明确业务 Oracle；
- 输入框清空、按钮被点击等只能证明对应 UI 状态，不能自动升级为后端业务成功；
- 结果不确定时不得盲目重做高副作用动作。

## 十一、Send Guard 等应用策略

例如聊天应用的发送保护可以建立在通用动作之上：

```json
{
  "guardId": "message-send-guard",
  "intent": {
    "targetConversation": "customer-a",
    "draftText": "hello"
  },
  "inputs": {
    "headerVerified": true,
    "draftVerified": true,
    "dedupPassed": true,
    "artifactPolicyPassed": false
  }
}
```

如果关键条件未满足：

```json
{
  "decision": "block",
  "blockingRisks": ["artifact-policy-failed"]
}
```

这属于应用/业务策略，不应下沉为所有桌面应用共享的 native Runtime 规则。

## 十二、长期稳定边界

最终保持：

```text
Desktop primitives
    ↓
Observation / Layout / Collection
    ↓
App Adapter
    ↓
Business Object
    ↓
Recipe
    ↓
Target / Locator / Action / Verification
```

其中：

- 通用层不认识微信、千牛或某个具体业务字段；
- Adapter 不重新实现平台原语；
- Recipe 不篡改底层事实，而是组织业务控制流；
- VLM 是辅助提案，不是自动真值；
- 定位目标时重新解析，不把一次采集坐标持久化成语义身份。