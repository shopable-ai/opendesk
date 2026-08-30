# wechat_desktop_requirements

## 1. 目标

本需求文档定义当前微信桌面应用 agent 的开发范围、主链、门禁和非目标。

系统目标不是“一次性自动发消息”，而是建立一套可验证、可回放、可渐进放开的桌面 GUI agent 执行框架。

主链固定为：

```text
golden baseline
-> runtime snapshot
-> compare gate
-> single-step validation
-> progressive guarded actions
-> evidence / replay / taxonomy
```

## 2. 一级需求

### R1. 黄金样本基准化

系统必须能够从已有黄金样本产物中提取：

- `golden_layout_baseline.json`
- `golden_semantic_baseline.json`

来源至少包括：

- `mirror/layout.html`
- `mirror/semantic.html`
- `infer/zones.json`
- `infer/action_targets.json`

### R2. 运行时归一化

系统必须能够把真实截图识别结果归一化为：

- `runtime_layout_snapshot.json`
- `runtime_semantic_snapshot.json`

### R3. compare gate

系统必须先完成结构和语义 compare，再决定是否允许进入动作阶段。

至少比较：

- zone completeness
- bbox ratio delta
- background color delta
- target-zone binding
- capture relocation availability
- search/header/input/message plausibility

### R4. 单步验证

系统必须支持以下单步能力独立运行：

- `locate_search_area`
- `focus_search_input`
- `type_search_query`
- `locate_conversation_list`
- `open_chat`
- `verify_chat_header`
- `focus_input`
- `read_reply`
- `scroll_message_list`

### R5. 渐进动作放开

系统只允许按顺序放开动作：

1. `open_chat`
2. `open_chat + verify_chat_header`
3. `open_chat + verify_chat_header + focus_input`
4. `read_reply`
5. `send_message` 单独冻结

### R6. 失败分类

每次失败必须输出：

- 当前失败阶段
- 根因
- 分类：`structure / recognition / validation / action / runtime`
- 下一步修什么
- `stop / retry / escalate`

## 3. 二级需求

### R7. fresh screenshot 原则

真实动作前必须重新截图，不允许仅依赖历史 bbox 或旧 region_map。

### R8. fail-fast 守卫

发现以下情况必须立即停止：

- 当前活动窗口不是微信
- 窗口位置或尺寸漂移
- template match 逃逸搜索窗
- header 未匹配目标会话
- send safety 未通过

### R9. 工件落盘

每轮运行至少应落盘：

- screenshot
- runtime snapshot
- compare report
- step evidence
- decision
- audit

### R10. 可人工审查

关键中间结果必须支持人工可视化审查：

- 原图
- 标注图
- 小区域裁剪图
- baseline JSON
- runtime JSON
- compare report

## 4. 架构约束

### C1. 文档与脚本分离

- 文档放 `docs/`
- 执行原型放 `examples/`
- 样本和运行结果放 `artifacts/`
- schema 放 `schemas/`

### C2. worker 分层

worker 必须拆分，不允许长期堆在单文件。

当前正确拆分方向：

- `examples/mac/wechat_steps/00_window_guard.js`
- `examples/mac/wechat_steps/10_capture_helpers.js`
- `examples/mac/wechat_steps/20_template_relocate.js`
- `examples/mac/wechat_steps/30_search_flow.js`
- `examples/mac/wechat_steps/40_open_chat.js`
- `examples/mac/wechat_steps/50_focus_input.js`
- `examples/mac/wechat_steps/60_send_guard.js`
- `examples/mac/wechat_steps/70_read_reply.js`
- `examples/mac/wechat_steps/main.js`

### C3. 调试逻辑不得污染主链

调试便利可以存在于 worker 原型层，但不能直接固化进 Go 主链和正式 contract。

## 5. 非目标

当前明确不做：

- 不先放开发送
- 不把 whole-window visual similarity 当唯一真相
- 不沉迷消息内容语义
- 不在真实 GUI 上长链盲执行
- 不把专家讨论直接塞进实时动作链

## 6. 验收标准

### A1. 黄金样本完成

满足以下条件即视为黄金样本阶段通过：

- baseline JSON 可从黄金样本稳定提取
- zones / action targets / capture refs 可被人工核对
- compare 输入字段稳定

### A2. 结构 compare 完成

满足以下条件即视为 compare 主链通过：

- runtime snapshot 可生成
- compare report 可生成
- pass / warn / fail 有明确标准

### A3. 动作阶段完成

满足以下条件才允许进入动作阶段：

- compare gate 为 `pass`
- 小区域单步 fresh screenshot 验证通过
- header identity 验证通过
- send 仍需单独审查

## 7. 当前优先级

1. baseline extractor
2. runtime snapshot schema
3. structural / semantic compare
4. search result row 识别
5. open_chat + verify_chat_header
6. focus_input
7. read_reply

## 8. 一句话总结

当前桌面应用需求的本质是：先把黄金样本和真实截图统一成可比较的数据层，再用这层去约束和放开真实 GUI 动作，而不是直接在真实微信里长时间试错。
