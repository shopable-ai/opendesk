# DESKTOP_AUTOMATION_FRAMEWORK_EXPERIENCE

## 1. 适用范围

本文总结的不是某个微信脚本的临时技巧，而是面向真实桌面软件自动化框架的通用经验。

目标对象：

- 桌面聊天软件
- 多列布局的软件工作区
- 需要截图、OCR、模板匹配、点击、输入、滚动、回复读取的软件

## 2. 核心原则

### 2.1 结构优先，不要先做内容优先

前期最稳定的不是消息文本内容，而是结构信息：

- 主列布局
- 区域 bbox
- 区域宽高
- 边界
- 背景色
- 列比例
- 动作发生的大致区域

对于聊天场景，优先保证以下区域 contract：

- `search_area`
- `conversation_list`
- `chat_header`
- `input_area`
- `send_action_zone`

`message_list` 可以先做粗粒度。

### 2.2 小区域截图是第一目标，不是副产物

结构识别不是为了“看起来懂页面”，而是为了：

- 降低 token 消耗
- 降低 OCR 噪声
- 提高动作定位稳定性
- 提高 post-action verify 的精度

所以 capture contract 必须直接服务于小区域截图，而不是停留在 bbox 描述层。

### 2.3 框架层不等于开发便利层

开发时为了快速试错而设计的机制，不应该默认进入框架主链。

这是本轮反复暴露出的一个重要边界问题。

## 3. 三层边界

### 3.1 框架层应该沉淀什么

真正应该进入框架主链的是稳定、可复用、和业务执行直接相关的能力：

- structure-first detect
- semantic zones
- action targets
- capture contract
- template screenshots
- visual fingerprint
- template audit
- real screenshot validation
- send safety
- replay / checkpoint / recovery
- stop / retry / escalate

这些能力的共同特点：

- 可以跨多次运行复用
- 可以被多个 worker 消费
- 能产出统一 artifact
- 能进入统一 gate

### 3.2 worker 层应该放什么

worker 层负责具体软件的动作逻辑：

- 搜索流程
- 候选行选择
- open_chat
- header 校验
- focus_input
- type_draft
- click_send
- read_reply
- scroll_message_list

worker 不该承担框架契约设计，它应该消费框架工件。

### 3.3 调试层应该放什么

调试层只服务开发加速：

- `-script-text`
- `-script-stdin`
- 单步验证
- 渐进组合
- 临时 step mode
- 阈值试探
- 一次性探针脚本

这些内容不应该默认变成框架主链的一部分。

## 4. 文本驱动开发的正确位置

文本驱动执行是非常有价值的，但它属于开发方法，不属于框架主功能。

正确用途：

- 快速试一个最小假设
- 快速拿一个窗口状态
- 快速拿一个局部截图
- 快速试一个 OCR / 模板匹配阈值

正确顺序：

```text
script-text / script-stdin
-> 小脚本
-> 组合脚本
-> 框架晋升
```

错误顺序：

```text
为了开发方便的结构
-> 直接进入框架主链
```

## 5. 多文件 worker 比单大文件更合理

复杂桌面 worker 持续堆在一个文件里，会出现：

- 上下文爆炸
- 状态混杂
- 调试逻辑和正式逻辑搅在一起
- 单文件过大导致 agent 测试时更容易偏移

更合理的方式是：

```text
主入口 + 多个步骤文件
```

例如：

```text
examples/mac/wechat_steps/
  00_window_guard.js
  10_capture_helpers.js
  20_template_relocate.js
  30_search_flow.js
  40_open_chat.js
  50_focus_input.js
  60_send_guard.js
  70_read_reply.js
```

主入口只负责：

- 读取配置
- 组织步骤
- 决定组合方式
- 汇总报告

## 6. 模板匹配的正确定位

模板匹配不是“可选锦上添花”，而是 capture contract 的自然延伸。

关键区域 contract 至少应包含：

- bbox
- reference image
- background color
- avg color
- aspect ratio
- search window
- match threshold
- scale range
- match hints

然后再做：

- fresh screenshot
- 局部模板搜索
- OCR 二次验证

而不是只用老 bbox 直接点击。

## 7. 多屏与负坐标经验

桌面自动化在多屏环境中有一个常见误区：

- 以为 `activeWindow + clip` 一定是窗口局部坐标

但真实实现里，如果底层截图接口在 `clip` 路径上退化为桌面绝对坐标，那么：

- 副屏
- 负坐标窗口
- 焦点窗口漂移

就会让局部截图严重失真。

经验结论：

### 7.1 截图主体必须可证明

每次局部截图之前都要能回答：

- 当前截图主体是谁
- 当前窗口是不是目标窗口
- 当前窗口 bounds 是否稳定

### 7.2 不要把截图错误误判为结构错误

如果 OCR 读出的是浏览器标题，不应立刻怀疑布局解析逻辑，更可能是：

- 活动窗口漂移
- 截图主体错误
- 副屏坐标换算错误

### 7.3 对负坐标窗口要特别谨慎

当窗口位于副屏或负坐标区域时：

- 局部截图路径必须单独验证
- 不要默认沿用单屏主屏假设

## 8. 人工干预是一级运行风险

真实桌面自动化不是纯后台执行。

如果执行过程中用户：

- 切窗口
- 点击别处
- 移动鼠标
- 改变窗口尺寸

当前动作前提可能瞬间失效。

因此必须把以下能力做成 fail-fast guard：

- 前台窗口校验
- 窗口 bounds 漂移校验
- 关键动作前重新确认主体窗口
- 主体错误时 stop，不继续点击

## 9. 失败案例与运行期笔记要分开

这是另一条重要的工程经验：

- `失败案例库` 存高价值知识
- `运行期笔记` 存短期观察
- `原始日志` 留在 artifact 和终端输出

不要把三者混到一个文件里。

## 10. 当前最值得长期保留的硬规则

1. 不要把开发便利结构直接晋升为框架主链。
2. 先沉淀稳定 contract，再沉淀 worker。
3. worker 应优先消费框架 artifact，而不是自造真相源。
4. 多屏/负坐标下必须单独验证截图主体。
5. 任何人工干预都应视作 runtime 风险，而不是业务失败。
6. send 前必须有独立 send safety，不允许因为脚本“差一点通了”而放开。

## 11. 结论

桌面自动化框架真正的长期价值，不在于“把一个脚本跑通”，而在于把以下东西稳定沉淀下来：

- 结构级 contract
- 小区域截图策略
- 模板与 OCR 的组合验证
- 运行时保护机制
- 明确的框架边界

这比单次脚本成功更重要。
