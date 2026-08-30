# WECHAT_STRUCTURED_SEND_V2

## 目标
基于当前更强的结构化工件与 OCR probe，执行微信聊天页的半受控自动回复：

1. 找到目标会话
2. 打开会话
3. 校验 header
4. 校验消息区上下文
5. 聚焦输入框
6. 输入回复
7. 发送
8. 检查草稿是否清空
9. 检查消息区是否出现新文本

## 脚本
- `examples/mac/wechat_structured_send_v2.js`

## 输入依赖
### 必需
- `temp/mac/wechat_region_map_latest.json`

### 可选
- `artifacts/runs/<run-id>/infer/chat_candidates.json`
- `config/wechat_structured_send_v2.config.json`
- `temp/mac/wechat_structured_send_v2.config.json`

脚本默认优先使用 artifact 候选；若未提供，则回退到 `wechat_region_map_latest.json` 中的 chat rows。

## 配置文件
可复制：
- `config/wechat_structured_send_v2.config.example.json`

到：
- `config/wechat_structured_send_v2.config.json`

说明：
- `config/` 下是长期保留的稳定配置位置
- `temp/mac/` 下仍可放本机临时覆盖配置，但不建议把关键模板长期放在这里

通过配置文件覆盖：
- `targetChatName`
- `expectedIncomingText`
- `replyMessage`
- `enableSend`
- `stepMode`
- `sendRetryCount`
- `sendDedupWindowMs`
- `sendAuditPath`
- `artifactChatCandidatesPath`

## 关键配置
脚本顶部 `CONFIG`：
- `targetChatName`
- `expectedIncomingText`
- `replyMessage`
- `enableSend`
- `stepMode`
- `regionReportPath`
- `artifactChatCandidatesPath`

## 输出
脚本执行后会写：
- `temp/mac/wechat_structured_send_v2_<timestamp>.json`
- `temp/mac/wechat_structured_send_v2_audit.jsonl`

报告中关键字段：
- `targetSelection`
- `headerCheck`
- `incomingCheck`
- `draftCheck`
- `draftAfterCheck`
- `messageAfterCheck`
- `draftCleared`
- `selfMessageObserved`
- `replyReadback`
- `sendAuditPath`

默认 `stepMode=full_non_send`，不会执行真实发送相关步骤。

如需执行真实发送闭环，建议显式设置：
- `enableSend: true`
- `stepMode: "full_send_guarded"`

### 判断是否接近完成
你至少要看：
- `headerCheck.ok`
- `incomingCheck.ok`
- `draftCheck.ok`
- `draftCleared`
- `selfMessageObserved`
- `replyReadback.text`

## 当前状态
这是面向真实微信闭环的脚本入口，但它仍然依赖：
- 当前微信窗口已经打开并可聚焦
- 当前 region map 与窗口尺寸匹配
- OCR 对目标上下文可读

## 与旧脚本的区别
- `wechat_structured_send.js`：偏旧式 region-map 驱动
- `wechat_structured_send_v2.js`：优先消费更强的 artifact candidate 与发送前后验证

## 注意
如果 `enableSend=true`，脚本会真实发送消息。

文件放置建议：
- 长期保留的提示词、说明文档、配置模板放在稳定目录，例如 `prompts/`、`docs/`、`config/`
- `temp/mac/` 只放执行报告、截图、调试输出、临时本地覆盖

相关资料：
- `docs/WECHAT_WX4PY_BORROWING_GUIDE.md`
- `prompts/wechat_send_workflow.md`
