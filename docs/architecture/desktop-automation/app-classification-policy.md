# APP_CLASSIFICATION_POLICY

## 1. 目标
在执行任何动作前，先判断当前是不是“可操作聊天页”。
如果不是，宁可停机，不可误点。

## 2. 分类层级
### appClass
- `wechat-desktop`
- `desktop-chat-like`
- `generic-desktop-app`
- `unknown`

### pageType
- `wechat_chat_page`
- `wechat_chat_list_only`
- `wechat_search_mode`
- `wechat_contact_detail`
- `wechat_modal_blocking`
- `wechat_article_or_miniapp`
- `wechat_image_preview`
- `wechat_settings_or_misc`
- `unknown`

## 3. 证据模型
每次分类都必须输出：
- `signals[]`：支持证据
- `counterSignals[]`：反证
- `decisionTrace[]`：规则命中链
- `confidence`
- `uncertainties[]`

## 4. 关键正向信号
### 识别为 `wechat_chat_page` 的强信号
- 结构上存在左侧会话列表 + 中部消息区 + 底部输入区
- `chat_header`、`message_list`、`input_area` 同时存在
- header 区域有稳定会话身份文本
- 输入区呈可聚焦状态

### 强反信号
- 搜索结果页覆盖主区
- 联系人详情页替代消息区
- 弹窗遮挡发送路径
- 图片预览/文章页无输入区

## 5. 置信度阈值
- `>= 0.90`：允许进入 zones/action target 推导
- `0.75 - 0.89`：只允许 probe，不允许 send
- `< 0.75`：stop

## 6. 规则优先级
1. blocking page 检测优先于 chat page 判定
2. 多证据一致优先于单一 OCR 命中
3. 局部结构 + 局部 OCR 优先于整窗 OCR
4. 最新截图优先于历史 region report

## 7. 不允许的偷懒做法
- 只因窗口标题包含“微信”就进入 send
- 只因 OCR 看到了目标昵称就视为 chat page
- 只因旧 `wechat_region_map_latest.json` 存在就直接点击

## 8. WeChat 专项 stop 条件
- 同名会话无法消歧
- header 身份与会话列表目标不一致
- 输入区不稳定或不可聚焦
- 发送动作只有单一低置信候选

## 9. 推荐输出格式
```json
{
  "appClass": "wechat-desktop",
  "pageType": "wechat_chat_page",
  "confidence": 0.93,
  "signals": [],
  "counterSignals": [],
  "decisionTrace": [],
  "uncertainties": [],
  "canProceedToZones": true,
  "canProceedToSend": false
}
```

