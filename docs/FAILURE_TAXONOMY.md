# FAILURE_TAXONOMY

- 更新时间：2026-04-03
- 目的：把“失败”正式化，便于 replay、回归、纠偏，而不是把失败留在对话里。

## 1. 分类规则

- `F0_*`：环境/前置条件
- `F1_*`：采集失败
- `F2_*`：OCR / 视觉识别失败
- `F3_*`：区域结构化失败
- `F4_*`：镜像恢复失败
- `F5_*`：比较与报告失败
- `F6_*`：动作恢复/发送阶段失败（后续阶段）

## 2. 失败类型

| ID | 类别 | 症状 | 主要证据 | 处理策略 |
| --- | --- | --- | --- | --- |
| F0_SCREENSHOT_PERMISSION_MISSING | 环境 | 无法截图/黑屏/空白图 | preflight、权限检查、截图日志 | 停止自动推进，转人工授权 |
| F0_AUTOMATION_PERMISSION_MISSING | 环境 | 无法 bringToTop / click / type | 自动化脚本日志、权限检查 | 停止发送类动作，保留 detect-only |
| F0_OCR_PROVIDER_UNAVAILABLE | 环境 | OCR 请求失败或超时 | OCR server 日志、HTTP 响应 | 降级到 layout-only；若关键链路依赖 OCR，则停止 |
| F1_WINDOW_NOT_FOUND | 采集 | 找不到微信窗口 | `window.list()` 输出、截图缺失 | 进入人工判断或重新定位窗口 |
| F1_WINDOW_DRIFT | 采集 | 上次 region map 与当前窗口尺寸不匹配 | window bounds 对比、旧 report | 作废旧 cache，重新 capture |
| F1_CAPTURE_COORDINATE_DRIFT | 采集 | 截图区域偏移/裁错屏幕 | clip 参数、displayIndex、截图 debug | 停止 compare，先修坐标映射 |
| F2_LAYOUT_UNDERSEGMENTATION | 识别 | 聊天列表/消息区/toolbar 等大块区域被合并 | separators/regions.json、标注图 | 调整 hint / tolerance / cellColorMode / boundary candidate selection |
| F2_LAYOUT_OVERSEGMENTATION | 识别 | 文本噪声被错误切成多个区域 | separators/regions.json、标注图 | 提高 minRegionArea，调整 median/mean |
| F2_OCR_TEXT_LOSS | 识别 | OCR 丢失关键聊天文本 | OCR 原图、OCR 输出、provider 原始响应 | 降级使用颜色/布局；必要时人工确认 |
| F2_TARGET_TEXT_FALSE_POSITIVE | 识别 | 错把其他区域识别为目标文本 | detect result、annotated image | 增加 role/relative-position 双重约束 |
| F3_ROLE_MISCLASSIFIED | 结构化 | input/chat_list/send_button 角色判错 | regions.json、role inference 日志 | 引入 layout role rules + OCR 关键词 |
| F3_SCHEMA_INCOMPLETE | 结构化 | regions.json 缺字段，无法进入 mirror | schema validation 结果 | 直接 fail，不进入下一阶段 |
| F4_HTML_MIRROR_LAYOUT_DRIFT | 镜像 | HTML mirror 块级布局失真 | mirror.png、diff.png | 回到 detect contract 修正 |
| F4_COLOR_RECOVERY_DRIFT | 镜像 | 颜色/间距近似错误，导致视觉差大 | mirror meta、diff report | 先修 token 与布局，不优先修细节 |
| F5_DIFF_FALSE_POSITIVE_THEME_SCALE | 比较 | 因字体/主题/DPI 造成误报 | compare report、环境信息 | 引入归一化阈值与 ignore rules |
| F5_NO_ACTIONABLE_DIFF | 比较 | diff 报告不能指导修复 | compare report | 视为失败，要求报告结构改进 |
| F6_SEND_ACTION_UNSAFE | 动作 | 未验证上下文就发送消息 | action log、pre-send checks | 强制停机，升级人工 |
| F6_STATE_RESTORE_UNVERIFIED | 动作 | 发送后状态未回读验证 | sent screenshot、OCR 回读 | 不允许判定成功 |

## 3. 统一处置规则

### 3.1 Stop

以下情况直接 stop：

- F0_SCREENSHOT_PERMISSION_MISSING
- F0_AUTOMATION_PERMISSION_MISSING（若当前阶段需要动作）
- F3_SCHEMA_INCOMPLETE
- F6_SEND_ACTION_UNSAFE

### 3.2 Retry

以下情况允许自动重试 1-2 次：

- F0_OCR_PROVIDER_UNAVAILABLE（短时失败）
- F1_WINDOW_DRIFT
- F1_CAPTURE_COORDINATE_DRIFT
- F2_LAYOUT_UNDERSEGMENTATION
- F2_LAYOUT_OVERSEGMENTATION

### 3.3 Escalate to Human

以下情况需要人工判断：

- 微信 UI 大改导致 role rules 普遍失效
- 连续 2 轮修正后 diff 无显著下降
- OCR 与 layout 结论相互冲突，无法自动裁决

## 4. Round 1 高优先 failure cases

1. `F0_OCR_PROVIDER_UNAVAILABLE`
2. `F1_WINDOW_DRIFT`
3. `F2_LAYOUT_UNDERSEGMENTATION`
4. `F3_ROLE_MISCLASSIFIED`
5. `F4_HTML_MIRROR_LAYOUT_DRIFT`
6. `F5_DIFF_FALSE_POSITIVE_THEME_SCALE`

## 5. Round 1 已观测样例

- `2026-04-03`：`TestLayoutWithTextNoise` 丢失第二条竖向分隔线，已修复并通过 targeted baseline
- `2026-04-03`：`TestLevel7_MixedContent` 期望 `y≈60` 的横向分隔线，当前观测 `y≈90`，仍归类为 `F2_LAYOUT_UNDERSEGMENTATION`
