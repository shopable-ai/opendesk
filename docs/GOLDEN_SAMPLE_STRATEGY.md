# GOLDEN_SAMPLE_STRATEGY

## 1. 目标重述

当前阶段的目标不是直接把微信发消息跑通，而是先建立一套 **高可信黄金样本 + 中间工件 + gate + repair loop** 框架，支撑后续真实聊天软件自动化。

最终业务目标仍然是：找对话、打开对话、输入、发送、读取回复、恢复与回放。但在进入真实发送前，必须先把样本、结构、验证、回放和修复闭环做好。

## 2. 架构主张：Observed → Semantic → Review

不采用“纯 HTML-first”，也不采用“纯 DOM-first”。采用三层模型：

1. **Observed layer**
   - `capture/source.png`
   - `capture/dom_snapshot.json`
   - `capture/a11y_snapshot.json`
   - OCR raw results
   - 资源加载状态 / proxy metadata
2. **Semantic layer**
   - `detect/regions.json`
   - `detect/layout_model.json`
   - `infer/app_classification.json`
   - `infer/zones.json`
   - `infer/action_targets.json`
   - `infer/chat_candidates.json`
   - `infer/ocr_map.json`
   - `infer/semantic_model.json`
3. **Review layer**
   - `mirror/layout.html`
   - `mirror/semantic.html`
   - `mirror/dom_validation_report.json`
   - `compare/report.json`
   - `compare/diff.png`

结论：**HTML 是 review artifact，不是真相源；semantic model 才是 review 载体的核心驱动。**

## 3. dual-HTML 重新定位

### 3.1 Layout HTML
用途：
- 表达软件整体排版
- 表达列布局、区域宽高、位置、背景色、边界
- 用于布局骨架 compare 与 drift 定位

### 3.2 Semantic HTML
用途：
- 表达 conversation list / rows / selected row / chat header / message list / input area / send button / OCR probes / action targets / candidate texts
- 用于结构核查、target 可解释性、人工审查入口

### 3.3 强制约束
- 两层 HTML 都必须由 `semantic_model.json` / `layout_model.json` 驱动生成
- 不允许散乱手写
- 不允许“有 HTML 就算完成”
- compare 只能辅助，不得单独作为主 gate

## 4. 黄金样本 contract

每个黄金样本至少包含：

- 原始截图
- DOM / a11y snapshot
- 结构 JSON
- semantic model
- Layout HTML
- Semantic HTML
- DOM validation report
- compare / diff report
- replay case
- failure taxonomy
- evidence
- provenance
- assertion profile
- variance budget

建议目录：

```text
golden/<sample-id>/
  source/
    source.png
    dom_snapshot.json
    a11y_snapshot.json
  detect/
    regions.json
    layout_model.json
  infer/
    app_classification.json
    zones.json
    action_targets.json
    chat_candidates.json
    ocr_map.json
    semantic_model.json
  mirror/
    layout.html
    semantic.html
    dom_validation_report.json
  compare/
    report.json
    diff.png
  verify/
    actionability_report.json
    send_safety_report.json
  replay/
    replay_case.json
    replay_result.json
    state_transition_log.json
    recovery_result.json
  golden/
    provenance.json
    assertion_profile.json
    variance_budget.json
    failure_taxonomy.json
```

## 5. 样本分层策略

### Tier A：浏览器可控样本
使用 `WeChatWeb` 作为优先样本源。

理由：
- DOM 可访问
- viewport 可固定
- 能模拟桌面聊天布局
- 状态与截图可重复采集
- 适合先建立 dual-HTML 与 compare 基线

实施策略：
- **优先本地化仓库副本**，避免长期依赖 live demo
- live demo 作为对照采样源
- 如果通过本地 HTTP 代理 `127.0.0.1:1087` 访问，可补全头像与远程资源，提高截图质量
- 资源完整性写入 provenance，不把头像像素本身作为强 gate

### Tier B：真实微信桌面样本
- 来源：`examples/mac/wechat_region_map.js`、`examples/mac/wechat_structured_send_v2.js`
- 用于真实 UI 适配与 send/reply 约束验证

### Tier C：对抗/漂移样本
- 主题变化
- 字体变化
- 缩放
- modal / popover / 小程序 / 图片预览
- 头像缺失
- 滚动偏移
- 局部遮挡
- 慢加载 / stale state

## 6. Gate 设计

### G0 Acquisition / Runtime preflight
检查：
- 截图
- DOM snapshot
- OCR provider
- 资源加载率
- 代理状态
- 浏览器/窗口尺寸

### G1 Layout fidelity
检查：
- `layout_model.json` 存在
- 列比例合理
- 主区域覆盖合理
- `conversation_list/chat_header/message_list/input_area/send_action_zone` 可定位

### G2 Semantic completeness
检查：
- zones / targets / chat candidates / selected row / probes 完整
- target 唯一性合理
- pageType / appClass 可信

### G3 Dual-HTML validity
检查：
- `layout.html` 与 `semantic.html` 均由中间 JSON 生成
- DOM validation 通过
- semantic 节点结构完整

### G4 Compare explainability
检查：
- DOM / 结构 / 区域 / 文本 / 颜色 / 像素 diff 都有报告
- compare 不得只有 pixel diff
- 失败必须可定位到 zone / target / text / layout pattern

### G5 Actionability / send safety
检查：
- `verify/actionability_report.json`
- `verify/send_safety_report.json`
- 未通过只允许 probe，不允许 send

### G6 Replay recoverability
检查：
- checkpoint 完整
- replay 能 resume / retry / escalate
- recovery 结果可落盘

### G7 Golden promotion
检查：
- assertion profile 完整
- variance budget 完整
- provenance 完整
- 人工批准通过后才可升为 baseline

## 7. execution 前必须先完成的 strategy_review 项

1. 盲区审计
2. 外部资料检索
3. 自我否决
4. 专家攻防讨论
5. 量化评分
6. 工程文档落盘
7. prompt 文件落盘
8. gate 设计
9. golden sample 设计
10. LangGraph durable execution 图设计

## 8. 结论

- dual-HTML 保留，但定位为可审查、可比较、可诊断的 review artifact
- semantic model 升级为主 contract
- `WeChatWeb` 作为 Tier A 首选样本源，优先本地化；live demo + 1087 代理作为资源增强与 drift 对照
- compare 不再是唯一门禁，但必须存在并可解释
- 真正的主闭环是：

```text
ideas -> score -> decide -> spec -> build -> eval -> memory -> human gate
```
