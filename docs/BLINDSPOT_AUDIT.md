# BLINDSPOT_AUDIT

## 1. 总原则
只记录会直接伤害“找对话 / 点击 / 输入 / 发送 / 回复”的盲区。

## 2. 当前已识别盲区
| ID | 盲区 | 风险 | 当前状态 | 处理策略 |
|---|---|---:|---|---|
| B01 | 把 compare 当主 gate | 高 | 已确认存在 | 降级为辅助层 |
| B02 | `layout_model.json` 未主干化 | 高 | 已存在脚本雏形 | 升级为一级工件 |
| B03 | `action_targets.json` 缺失 | 高 | 未完成 | 作为 execution 第一优先级 |
| B04 | `ocrText` 在 detect contract 中为空串基线 | 中高 | 已确认 | 改为 zone-aware best-effort OCR |
| B05 | 历史 region report 驱动发送 | 高 | 现有示例存在 | 禁止作为主链路 |
| B06 | whole-window OCR 串区 | 高 | 现有示例存在 | 改为局部 message/header/input OCR |
| B07 | replay 只有 contract 没有 executor | 高 | 已确认 | 建立 checkpoint / resume 语义 |
| B08 | action evidence 只有阶段级无动作级 | 高 | 已确认 | 增加 before/after/action log |
| B09 | failure taxonomy 未细化到 chat 动作 | 高 | 已确认 | 扩展 F6 子类 |
| B10 | 同名会话消歧不足 | 高 | 未解决 | 在 page inference + action review 里强制校验 |
| B11 | 弹窗/详情页/图片预览误判为聊天页 | 高 | 未解决 | blocking page 优先判定 |
| B12 | 输入焦点丢失 | 高 | 未解决 | focus gate + postcondition |
| B13 | 发送动作多路径（按钮/Enter）不受控 | 中高 | 未解决 | 发送策略显式配置 |
| B14 | 主题/缩放/窗口尺寸变化导致 zone 漂移 | 中高 | 未解决 | replay stability gate |
| B15 | clipboard 污染 | 中高 | 原型中存在 | 降级为调试手段 |
| B16 | 红队 deception / prompt injection | 中高 | 未系统覆盖 | red team attacks 文档化 |

## 3. 仍未充分覆盖的未知数
- WeChat 新 UI 版本对 column topology 的影响
- 群聊、服务号、置顶、折叠分组带来的 chat list 变化
- 输入法候选框、系统通知、浮窗遮挡
- 多显示器与 DPI 缩放

## 4. 结论
当前最大盲区不是识别精度本身，而是：
- 语义层断裂
- 动作目标未建模
- 门禁错位
- 恢复与证据粒度不够

