# 微信桌面自动化开源方案调研与可借鉴优化方案

- 日期：2026-05-18 23:50:46 CST
- 适用项目：`testMonkey-go`
- 当前优先目标：先把“电脑微信自动化”作为第 1 个真实测试用例跑通，再抽象为可复用桌面 agent runtime
- 参考已有文档：
  - `docs/research/2026-04-07-desktop-automation-landscape.md`
  - `docs/WECHAT_WX4PY_BORROWING_GUIDE.md`
  - `docs/wechat_desktop_requirements.md`
  - `docs/WECHAT_COMPLETE_SOLUTION_FRAMEWORK.md`
  - `docs/DESKTOP_AUTOMATION_SOLUTION_OPTIONS.md`

## 0. 一页结论

```text
目标
└─ 先做微信桌面自动化首个真实用例
   ├─ 短期不要追求“万能自动化”
   ├─ 先把 observe -> locate -> act -> verify -> audit 闭环做实
   └─ 再抽象成通用桌面 agent adapter

外部可借鉴项目
├─ app 专用层
│  ├─ wxauto
│  ├─ pywechat
│  ├─ WeChatFerry
│  └─ wxauto-mcp
├─ agent/computer-use 层
│  ├─ Peekaboo
│  ├─ OpenAdapt
│  ├─ Microsoft UFO
│  ├─ Agent-S
│  └─ OmniParser
└─ 观察/记忆/证据层
   └─ screenpipe

推荐落地主线
└─ Hybrid Runtime for WeChat on macOS
   ├─ AX / window / semantic controls 优先
   ├─ 视觉/OCR 做主观察与校验
   ├─ 坐标点击 / 剪贴板粘贴做兜底
   ├─ send 默认 fail-close
   └─ 每步必须产出证据与分类日志

V1 建议
└─ 只放开这些步骤
   ├─ detect wechat window
   ├─ locate search box
   ├─ search target chat
   ├─ open chat
   ├─ verify header
   ├─ focus input
   ├─ paste draft (可选)
   └─ send 继续冻结或单独 guarded
```

## 1. 这次调研重点回答什么

围绕你的最新目标，这次不是泛泛调“自动化工具大全”，而是聚焦：

1. 除了 Peekaboo，还有哪些值得借鉴的开源项目
2. 哪些适合“微信桌面自动化首个测试用例”
3. 哪些能力能直接借到 `testMonkey-go`
4. 怎么把这些外部经验转成后期可执行的落地方案

## 2. 外部开源项目清单（按借鉴价值分层）

### A. 微信/聊天应用专用自动化项目

#### 1) wxauto
- GitHub: https://github.com/cluic/wxauto
- 类型：Windows 微信桌面 UI 自动化
- 当前观测：约 7010 stars，Apache-2.0
- 特点：
  - 面向真实 PC 微信客户端
  - 以 UI 自动化/RPA 思路为主，不是纯逆向协议
  - 在“搜索会话 -> 打开聊天 -> 发消息 -> 读消息”这条链路上经验比较实战
- 最值得借鉴：
  - 会话打开与发送动作分层
  - 失败重试
  - 真实业务流程 API 化
  - 面向运营人员/脚本调用的能力封装方式
- 不建议直接照搬的部分：
  - Windows/UIA 强绑定
  - 对微信版本耦合明显
  - 难直接迁移到 macOS

#### 2) pywechat
- GitHub: https://github.com/Hello-Mr-Crab/pywechat
- 类型：Windows + pywinauto 的微信 RPA
- 当前观测：约 1452 stars
- 特点：
  - 明确走 pure UIAutomation 路线
  - 覆盖微信 4.x 系列经验较多
- 最值得借鉴：
  - 控件树优先，而不是纯截图点点点
  - 功能接口拆分比较细
  - 对“版本兼容性声明”的写法值得借鉴
- 对本项目的意义：
  - 不是拿来直接用
  - 而是作为“语义控件优先”的产品对照组

#### 3) WeChatFerry
- GitHub: https://github.com/lich0821/WeChatFerry
- 类型：更深层的微信控制/机器人方案
- 当前观测：约 6594 stars，MIT
- 特点：
  - 能力面更强
  - 常用于机器人/LLM 接入
- 风险：
  - 更高维护和账号风险
  - 不适合作为通用 GUI agent 的主底座
- 建议定位：
  - 作为能力上限参考
  - 不作为当前 macOS 微信 GUI 自动化主路线

#### 4) wxauto-mcp
- GitHub: https://github.com/barantt/wxauto-mcp
- 类型：把微信自动化能力封成 MCP server
- 当前观测：stars 较少，但方向很对
- 最值得借鉴：
  - “app-specific tool adapter” 的封装思路
  - 把 send/read/search/open 做成 agent 可调用工具
- 对本项目的意义：
  - 非常适合借鉴其接口形态
  - 未来可做 `wechat-macos-mcp` 或 `desktop-agent-mcp` 的前身

### B. 通用 computer-use / desktop agent 项目

#### 5) Peekaboo
- 类型：macOS 桌面自动化 + 可视化分析 + UI 交互工具化
- 价值定位：你当前路线最接近的外部参照物之一
- 最值得借鉴：
  - 原生桌面工具暴露方式
  - 截图 / see / click / type / dialog / menu / app / window 分层
  - “看见再行动”的工具链
  - 对 macOS 权限、窗口、焦点、对话框的工程化处理
- 对微信场景的关键意义：
  - macOS 桌面自动化不是只靠 OCR
  - 需要原生窗口、输入、焦点、权限、粘贴板、菜单、dialog 工具一起构成能力层

#### 6) OpenAdapt
- GitHub: https://github.com/OpenAdaptAI/OpenAdapt
- 当前观测：约 1588 stars，MIT
- 类型：AI-first process automation / Generative RPA
- 最值得借鉴：
  - 记录用户交互 -> 学习流程 -> 回放/泛化
  - 将传统 GUI 操作转成更高层过程自动化
  - 人类演示数据可用于 agent 学习与验证
- 对微信自动化的可借鉴点：
  - 后续可以录制人工微信操作形成 baseline
  - 可以作为“黄金样本 + 轨迹样本”补充来源

#### 7) Microsoft UFO
- GitHub: https://github.com/microsoft/UFO
- 当前观测：约 8671 stars，MIT
- 类型：Windows 桌面 agent 框架
- 最值得借鉴：
  - agent orchestration 思路
  - 多步骤规划、执行、验证链
  - 把桌面操作抽成任务级执行图
- 对本项目的意义：
  - 虽然平台不是 macOS，但很适合借鉴 agent runtime 层设计
  - 尤其适合借鉴 “planner/executor/verifier” 拆分

#### 8) Agent-S
- GitHub: https://github.com/simular-ai/Agent-S
- 当前观测：约 11390 stars，Apache-2.0
- 类型：像人一样使用电脑的 agent framework
- 最值得借鉴：
  - computer-use agent 的 benchmark 思维
  - grounding / planning / acting 之间的清晰分层
  - 更系统的 action abstraction
- 对本项目的意义：
  - 适合作为长线对标
  - 提醒我们不要只做脚本，而要做可扩展 agent runtime

#### 9) OmniParser
- GitHub: https://github.com/microsoft/OmniParser
- 当前观测：约 24771 stars
- 类型：纯视觉 GUI screen parsing
- 最值得借鉴：
  - 屏幕解析
  - GUI 元素检测
  - 对纯视觉场景下的 region parsing 能力
- 对微信自动化的意义：
  - 当 AX 树不完整、微信内部区域是自绘/半自绘时，它的思想很重要
  - 适合增强你当前 `layout/zones/action_targets` 路线

### C. 观察/记忆/证据链项目

#### 10) screenpipe
- GitHub: https://github.com/screenpipe/screenpipe
- 当前观测：约 18751 stars
- 类型：持续记录屏幕/音频/活动上下文
- 最值得借鉴：
  - 长时段观察
  - 时间线证据检索
  - 本地化上下文记忆
- 对微信自动化的意义：
  - 很适合借鉴其“持续证据流”思路
  - 后续可把运行失败前后的屏幕 OCR 轨迹转成 debug evidence

## 3. 这些项目里，真正适合当前微信首用例的“借鉴优先级”

### 第一梯队：最该借

1. Peekaboo
2. wxauto
3. pywechat
4. wxauto-mcp
5. OmniParser

原因：
- Peekaboo 解决 macOS 原生自动化工程问题
- wxauto / pywechat 解决微信业务流拆分问题
- wxauto-mcp 解决 agent tool 接口问题
- OmniParser 解决视觉解析与 GUI element grounding 问题

### 第二梯队：中期引入

1. OpenAdapt
2. Microsoft UFO
3. Agent-S
4. screenpipe

原因：
- 这些更偏“系统级 agent runtime 演进”
- 对首个微信案例不是最短路径
- 但对后续通用化、训练化、回放化很关键

### 第三梯队：谨慎观察，不作为主线

1. WeChatFerry

原因：
- 能力强，但风险模型和当前 GUI agent 主线不一致
- 更像“高权限特化方案”，不适合作为现在的稳定默认解

## 4. 对 `testMonkey-go` 最有价值的可借鉴能力地图

```text
外部项目 -> 本项目应借什么

Peekaboo
├─ app/window/dialog/menu 权限化工具层
├─ 粘贴板/输入/截图/聚焦分离
└─ macOS 原生桌面控制工程化

wxauto / pywechat
├─ 微信流程拆步
├─ open_chat 与 send_message 解耦
├─ 去重/重试/审计
└─ 版本兼容性披露

wxauto-mcp
├─ app-specific MCP tool surface
└─ 把微信能力变成 agent 可调用 primitive

OmniParser
├─ GUI screen parsing
├─ 文本/区域/组件检测
└─ 视觉 fallback 的结构化输出

OpenAdapt
├─ 人工演示录制
├─ 流程回放
└─ 学习型自动化样本沉淀

UFO / Agent-S
├─ planner / executor / verifier 分层
├─ 任务图与长链动作控制
└─ 更通用的桌面 agent runtime 方向

screenpipe
├─ 证据时间线
├─ 运行上下文回溯
└─ 长周期调试材料沉淀
```

## 5. 面向“macOS 微信自动化”的推荐技术路线

## 5.1 推荐结论

当前不建议走单一路线，而建议继续强化你仓库里已经接近成型的：

```text
Hybrid Runtime
= 原生桌面控制 + 视觉/OCR + 结构化 compare + guarded action + evidence
```

也就是：

1. 用 macOS 原生能力/桌面自动化能力做 window、focus、click、type、clipboard、dialog
2. 用视觉/OCR 做观察和验证
3. 用结构化 zone / target / baseline compare 做主 gate
4. 用 send fail-close 做最后安全阀

这和已有文档里的方向是一致的，但这次补上了外部开源项目可借鉴依据。

## 5.2 为什么不是单纯抄 wxauto

因为当前主目标是：
- 首先微信可用
- 但后面还要扩到其他桌面应用

如果只抄 wxauto，会把架构过早锁死在：
- 单应用
- Windows UIA
- 会话/消息模型强耦合

而你的项目长期目标更像：
- 微信只是第一个 app profile
- 后面还要支持更多桌面软件
- 还要被 agent/MCP 调用

所以正确做法是：
- 借 wxauto 的业务流程控制思想
- 不借它的底层平台耦合实现

## 6. 对当前微信首用例的具体优化建议

下面是可以直接转执行任务的建议。

### 6.1 能力层补强：补成“Peekaboo 风格的桌面能力面”

你当前已有视觉与步骤链基础，但如果要把微信作为真实桌面 app 跑稳，建议补齐以下原语：

#### 必补原语
1. `list_apps`
2. `focus_app`
3. `list_windows`
4. `focus_window`
5. `capture_window`
6. `capture_region`
7. `click_point`
8. `double_click_point`
9. `type_text`
10. `press_key`
11. `paste_text`
12. `read_clipboard`
13. `set_clipboard`
14. `wait_until`
15. `assert_frontmost_app`
16. `assert_window_bounds_stable`

#### 借鉴来源
- Peekaboo 的 app/window/dialog/click/type/paste/clipboard 分层
- 当前仓库已有 `window.* / mouse.* / keyboard.* / screenshot / OCR`，但建议统一到更稳定的 capability contract

#### 价值
- 微信只是第一个适配器
- 这组原语以后可以服务企业微信、飞书、客服台、浏览器、ERP 等其他应用

### 6.2 微信流程层补强：借 wxauto 的“工程闭环”而不是 UIA 细节

建议把微信首用例彻底固定成下面这条链：

```text
window_guard
-> capture_fresh
-> compare_gate
-> locate_search_area
-> focus_search_input
-> type_search_query
-> locate_conversation_list
-> open_chat
-> verify_chat_header
-> focus_input
-> type_or_paste_draft
-> verify_draft_visible
-> click_send_or_press_enter
-> verify_draft_cleared
-> verify_message_observed
-> audit_complete
```

其中：
- `send` 之前都可以逐步开放
- `send` 之后必须双校验

### 6.3 输入策略升级：优先“粘贴”而不是“逐字输入”

对于微信这类聊天工具，建议默认输入优先级改成：

1. clipboard paste
2. direct type
3. fallback key events

原因：
- 多行文本更稳
- 中文输入更稳
- 避免输入法状态扰动
- 对 Electron/富文本输入框通常更鲁棒

这点和 Peekaboo 技能文档里对聊天类/Electron 应用的 fallback 经验高度一致。

### 6.4 搜索与打开会话做成独立失败域

这部分你仓库里已经有雏形，建议继续强化：

1. `focus_search_input`
2. `clear_search_query`
3. `type_search_query`
4. `locate_search_result_row`
5. `open_chat`
6. `verify_chat_header`

每一步都需要：
- fresh screenshot
- OCR/模板/区域二次验证
- 独立错误分类
- 可重试

这是从 wxauto / pywechat 最应该借的流程经验。

### 6.5 发送保护升级：把“误发风险”做成一级对象

建议发送保护最少增加以下字段：

```text
sendSafety
├─ enabled
├─ gatePassed
├─ targetChatVerified
├─ draftVerified
├─ dedupPassed
├─ frontmostWechatConfirmed
├─ windowBoundsStable
├─ manualOverrideRequired
├─ blockingRisks[]
└─ decision = allow | block | escalate
```

这会比只保留 `sendAllowed` 更利于后期 agent 判断与人工审查。

### 6.6 证据链升级：借 screenpipe 思想，但不必先引入 screenpipe

先在本仓库落地轻量版本：

每一步落盘：
1. screenshot
2. cropped region
3. OCR text
4. chosen target
5. action point
6. post-action screenshot
7. verification result
8. error taxonomy

然后形成：
- `audit.jsonl`
- `step_evidence/*.png`
- `runtime_snapshot.json`
- `decision.json`

这会让后续问题排查成本显著下降。

### 6.7 视觉层升级：借 OmniParser 思路，不必一上来重模型

你当前已有：
- zones
- action_targets
- OCR map
- mirror / compare

下一步建议增强：

1. 把“聊天区 / 搜索区 / 输入区 / 发送区 / 头部区”做成更稳定的 screen parsing contract
2. 给每个 target 增加：
   - confidence
   - supportingEvidence
   - fallbackPath
   - forbiddenZones
3. 区分：
   - semantic target
   - visual target
   - action target

这样你的视觉链条会比单纯 OCR 更稳，也更接近 OmniParser 的可组合思路。

## 7. 建议的 V1 / V1.5 / V2 落地路线

## 7.1 V1：把微信首用例跑成“受控可验证闭环”

目标：
- 不是直接追求自动发消息成功率最大化
- 而是把误点、误发、误判风险压下来

V1 范围：
1. 确认微信窗口
2. fresh capture
3. compare gate
4. 搜索目标会话
5. 打开会话
6. 校验 header
7. 聚焦输入框
8. 粘贴草稿
9. 校验草稿可见
10. 发送默认冻结，或只在显式开关下启用

V1 通过标准：
- open_chat 稳定
- verify_chat_header 稳定
- focus_input 稳定
- draft 校验稳定
- send 未通过也可以接受

这是最合理的第一个里程碑。

## 7.2 V1.5：把 send 从“冻结”升级到“单独 guarded”

新增：
1. send dedup
2. send safety object
3. draft cleared verification
4. self-message observed verification
5. send audit trail

通过标准：
- 不允许 silent send
- 不允许未验证 target 就 send
- 不允许发送后没有 post-check

## 7.3 V2：抽象成通用 app adapter

目标：
- 微信不再是唯一特殊实现
- 抽象出可复用的 desktop action contract

V2 新增：
1. app adapter interface
2. desktop tool surface / MCP adapter
3. planner-executor-verifier 分层
4. baseline extraction 通用化
5. support for more apps

## 8. 推荐的抽象层设计

```text
L1 Platform Capability Layer
├─ app/window/focus
├─ screenshot/region capture
├─ click/type/paste/key
├─ clipboard
└─ dialog/menu/permission helpers

L2 Observation Layer
├─ OCR
├─ screen parsing
├─ UI tree (if available)
└─ baseline/runtime normalization

L3 Target Resolution Layer
├─ semantic target
├─ visual target
├─ action target
└─ fallback chain

L4 Execution Layer
├─ guarded step runner
├─ retry/jitter
├─ fail-fast
└─ send safety

L5 Verification & Evidence Layer
├─ compare gate
├─ post-action verification
├─ audit jsonl
└─ taxonomy / replay

L6 Agent Exposure Layer
├─ internal runtime API
├─ HTTP API
└─ MCP/tool interface
```

## 9. 立刻可执行的任务清单

### P0：本周最应该做

1. 固化微信首用例 step contract
   - `locate_search_area`
   - `focus_search_input`
   - `type_search_query`
   - `open_chat`
   - `verify_chat_header`
   - `focus_input`
   - `type_or_paste_draft`

2. 把 paste 设为默认输入策略

3. 将 sendSafety 从布尔值升级为结构化对象

4. 每个 step 写 JSONL 审计日志

5. 每个高风险 step 增加 post-action screenshot

### P1：下一阶段

1. 增加 app/window/clipboard 原语统一接口
2. 增强 compare gate 输出字段
3. 增加会话打开失败分类
4. 增加微信版本/窗口布局兼容声明

### P2：后续通用化

1. 抽出 MCP tool surface
2. 支持更多桌面 app
3. 引入演示录制 / 回放 / 学习能力
4. 建立 benchmark case 集

## 10. 推荐方案（最终拍板）

### 推荐 V1 路线

```text
主路线
= Peekaboo 风格的 macOS 桌面能力层
+ wxauto/pywechat 风格的微信业务流程拆步
+ OmniParser 风格的视觉 target 结构化
+ screenpipe 风格的证据链沉淀
```

### 不推荐的路线

1. 不建议直接走纯坐标脚本
   - 太脆
   - 不利于后续通用化

2. 不建议直接以 WeChatFerry 为主架构
   - 风险模型不适合当前目标

3. 不建议一开始就做超长链全自动发送
   - 首用例应先保证可观察、可审计、可阻断

## 11. 一句话执行建议

先把“微信桌面自动化”当成一个被严格门禁保护的 app adapter：
先跑通 `open_chat -> verify_chat_header -> focus_input -> verify_draft`，
再把 `send` 作为单独 guarded step 放开；
底层继续坚持 `macOS 原生控制 + 视觉/OCR + compare gate + evidence` 的 hybrid 路线，这条路最适合从微信扩展到后续更多桌面应用。
