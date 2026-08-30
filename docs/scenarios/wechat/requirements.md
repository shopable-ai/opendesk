# WeChat Desktop Automation Requirements

本文件定义 Clawdesk 面向微信桌面版自动化的**场景需求与验收边界**。

## 当前状态

截至 2026-08-31，仓库具备可复用的 Clawdesk 桌面能力、Vision/OCR、MCP `inspect -> find -> act` 工具和历史 WeChat 研究/报告，但**当前仓库没有独立维护的 WeChat production adapter / workflow 实现**。

当前不存在的旧路径包括：

```text
examples/mac/wechat_steps/
examples/mac/wechat_structured_send_v2.js
config/wechat_structured_send_v2.config.json
```

因此本目录描述的是场景 contract、质量要求和未来实现约束，不应被引用为“当前已经跑通 WeChat V1”的证据。

## 场景目标

目标链路：

```text
识别当前微信窗口
-> 找到目标会话
-> 打开并验证目标会话
-> 读取必要上下文
-> 聚焦输入区
-> 写入草稿
-> 独立评估发送安全
-> 可选发送
-> 回读并验证结果
```

其中 `send` 是高风险动作，必须与 open/focus/type 分离。

## 功能需求

### R1 当前窗口与应用身份

系统必须能判断：

- 当前目标窗口是否属于预期微信桌面应用；
- 窗口是否仍是同一个运行上下文；
- 截图/候选是否足够新鲜；
- 是否存在 blocking overlay、弹窗或异常页面。

无法确认时不得进入高风险动作。

### R2 会话发现

系统需要从 fresh evidence 中找到目标会话候选，而不是依赖历史固定坐标。

候选至少应携带：

- bounds / click point；
- 来源证据；
- confidence / match score；
- freshness；
- ambiguity 信息。

目标名称相同或相似时必须显式消歧。

### R3 会话身份验证

打开会话后必须重新验证 header / identity。

原则：

```text
点击了某一行
!= 已证明进入正确会话
```

header 无法验证时必须 stop / recovery。

### R4 输入焦点

输入前必须确认：

- 输入区存在；
- 当前焦点位于目标输入区；
- 没有输入法/浮窗等阻挡当前动作；
- 当前窗口仍匹配预期上下文。

### R5 Draft 验证

写入内容后、发送前，需要重新读取或以其他可验证方式确认 draft 与预期一致。

至少验证：

- 内容非空；
- 内容未被截断/污染；
- 当前会话仍正确；
- 本轮发送 payload 与用户意图一致。

### R6 Send Safety

真实发送必须独立通过场景级 Gate。

至少要求：

```text
fresh window identity
+ target chat identity
+ input focus
+ draft verification
+ send target evidence
+ no blocking overlay
+ action freshness
+ post-send verification plan
```

任何关键项不确定时：

```text
sendAllowed=false
```

### R7 Postcondition / Readback

如果执行发送，必须验证至少一种真实 postcondition，例如：

- draft 清空或进入预期状态；
- 消息列表出现本轮发送内容；
- UI 状态明确改变；
- 可读取的新消息/回复符合预期上下文。

只收到 click/type 调用成功不能视为业务成功。

### R8 Failure / Recovery

失败应分类到稳定 taxonomy，并优先局部恢复：

```text
environment / permission
perception / OCR
layout / semantic identity
target ambiguity / stale evidence
focus / action
send safety
postcondition / verification
recovery
```

连续重试但没有新增 evidence 时必须停止。

## 非功能需求

### 可审计

每个关键动作应保留：

- before / after evidence；
- target candidate trace；
- guard decision；
- failure classification；
- final decision。

### 可回放

关键 scenario 应可转化为 fixture / replay case，至少能复核：

```text
输入状态
-> 候选
-> decision
-> action plan
-> verifier
```

### 跨环境鲁棒性

不能把单一窗口尺寸、主题、Retina scale 或某次截图坐标写成场景长期事实。

## 当前可复用基础

当前实现可从以下通用能力起步：

```text
automation/                     # 窗口、截图、输入、OCR/Vision 等
pkg/mcpserver/                  # inspect/find/act 主链
docs/architecture/desktop-automation/
docs/quality/gates-and-evidence.md
docs/integrations/mcp/
```

WeChat-specific 适配应建立在这些通用能力之上，而不是复制一套独立 runtime。

## 当前不应宣称的能力

在新的 WeChat-specific implementation、fixtures 和真机 evidence 落地前，不应宣称：

- 已有稳定的 WeChat 会话搜索实现；
- 已有可直接使用的 WeChat send workflow；
- 已存在当前版本 frozen desktop golden；
- 已通过当前版本真实 macOS 端到端发送验证；
- 历史坐标/region map 可以作为当前动作真相。

## 验收路径

推荐逐级验收：

```text
A. inspect / window identity
B. find target chat without action
C. open_chat + verify header
D. focus_input + verify focus
E. type draft + verify draft
F. send preview / safety gate
G. controlled real send
H. postcondition / readback
I. replay / regression fixture
```

必须允许在 F 阶段长期保持 `sendAllowed=false`，而不把非发送能力判定为整体失败。
