# WECHAT_WX4PY_BORROWING_GUIDE

## 目标
把 `wx4py` 里值得借鉴的发送工程化思路，转换成适合当前 `testMonkey-go` macOS 方案的落地文档与提示词模板，服务于：

1. 单个环节测试
2. 问题定位
3. 提示词驱动的迭代修复
4. 最终串起完整发送闭环

参考仓库：
- `https://github.com/claw-codes/wx4py`

重点参考文件：
- `src/pages/chat_window.py`
- `src/core/window.py`
- `src/config.py`

文件落位建议：
- 借鉴文档放 `docs/`
- 工作流提示词放 `prompts/`
- 配置模板放在所属的 `examples/<domain>/` 场景旁
- `.runtime/temp/` 只放运行产物与临时覆盖

## 借鉴结论
`wx4py` 最值得借鉴的，不是它的 Windows UIAutomation 细节，而是它把“发送消息”拆成了可审计、可重试、可恢复、可去重的工程闭环。

当前项目应借鉴以下 8 点：

1. 发送参数归一化
2. 目标会话搜索与打开分离
3. 每个阶段都有独立成功判定
4. 失败后允许短抖动重试
5. 重复发送抑制
6. 审计日志记录
7. 前台窗口恢复与重新聚焦
8. 把单步验证结果回写到结构化报告

## 映射到当前项目
`wx4py` 的 Windows UIA 控件查找，不能直接搬到当前项目。

当前项目应保留自己的能力栈：
- 窗口定位：`window.*`
- 截图与区域采样：`page.screenshot`
- OCR 与文本验证：`Vision.runOCR`
- 模板重定位：`ImageColor.findPos`
- 输入与点击：`keyboard.*`、`mouse.*`

所以真正要借鉴的是“流程控制逻辑”，而不是底层 API。

## 可借鉴机制
### 1. 发送前归一化
借鉴点：
- 目标会话名不能为空
- 回复消息不能为空
- 在真正执行 UI 操作前先做参数检查

转成当前项目的实现要求：
- 配置文件必须显式给出 `targetChatName`
- 配置文件必须显式给出 `replyMessage`
- 若 `enableSend=false`，默认只做非发送验证

提示词模板：
```text
你正在完善微信发送自动化。先不要修改点击逻辑，先检查配置归一化：
1. targetChatName 是否为空
2. replyMessage 是否为空
3. enableSend=false 时是否仍会误发
输出：
- 风险点
- 建议修改字段
- 需要新增的保护判断
```

### 2. 打开会话与发送动作分层
借鉴点：
- `wx4py` 把 `open_chat` 和 `send_message` 分成独立阶段
- 每个阶段都能单独失败、单独重试

转成当前项目的实现要求：
- `open_chat`
- `verify_chat_header`
- `focus_input`
- `type_draft`
- `click_send`
- `verify_draft_cleared`
- `verify_post_send_message`

提示词模板：
```text
请把微信自动化流程拆成可单测步骤，不要写成一个大函数。
要求：
1. 每一步都要能独立执行
2. 每一步都要写回 context
3. 每一步都要有明确的成功条件
4. 输出 stepMode 建议值与最小回归路径
```

### 3. 搜索失败后的抖动重试
借鉴点：
- `wx4py` 在搜索/打开会话失败后不会立刻死掉
- 会做短时间随机抖动后再次搜索

转成当前项目的实现要求：
- `open_chat` 允许有限次重试
- 重试前清理搜索框残留输入
- 重试间隔加入 jitter，减少 UI 临界状态误判

提示词模板：
```text
当前微信脚本 open_chat 偶发失败。请只聚焦“搜索与打开会话”阶段：
1. 找出一次失败后为什么不能直接重试
2. 设计清理搜索框、重新聚焦、延迟抖动的策略
3. 给出适合脚本的重试次数和等待区间
输出必须包含：
- before
- after
- failure recovery path
```

### 4. 发送去重
借鉴点：
- `wx4py` 会抑制短时间内相同目标+相同内容的重复发送

转成当前项目的实现要求：
- 真实发送前检查近期成功发送记录
- 依据 `targetChatName + replyMessage` 组合键做时间窗口去重
- 避免脚本调试时重复轰炸真实联系人

提示词模板：
```text
我要给真实微信发送消息，必须防止重复发送。
请设计一个本地去重策略：
1. 唯一键怎么定义
2. 时间窗口多长合适
3. 成功发送后记录到哪里
4. 调试模式下如何绕过但必须显式开关
```

### 5. 阶段审计日志
借鉴点：
- `wx4py` 会记录发送阶段日志
- 出问题时能知道卡在 open / send / retry 的哪一段

转成当前项目的实现要求：
- 记录 `draft_input`
- 记录 `send_click`
- 记录 `draft_cleared`
- 记录 `message_observed`
- 记录 `send_complete`

提示词模板：
```text
请为微信发送流程设计审计日志。
要求：
1. 日志必须是结构化 JSONL
2. 每条日志带 timestamp、phase、success
3. 必须能区分 open_chat 成功但 send 失败
4. 日志字段要便于后续排查 OCR、点击点、模板匹配问题
```

### 6. 发送后双重验证
借鉴点：
- `wx4py` 不只按 Enter 就认为成功
- 更可靠的做法是发送后继续确认状态变化

转成当前项目的实现要求：
- 输入框里原草稿应该消失
- 消息区应该出现新消息文本
- 这两个条件最好都写回报告

提示词模板：
```text
微信脚本点击发送后不能直接判定成功。
请设计发送后的双重验证：
1. 输入框草稿是否清空
2. 消息区是否出现自己刚发的文本
3. OCR 误差下如何做宽松匹配
输出：
- 校验顺序
- 每一步的失败解释
- 应写入报告的字段名
```

### 7. 会话恢复能力
借鉴点：
- `wx4py` 在失败后会尝试重新激活窗口、重建连接

转成当前项目的实现要求：
- 每一步截图或点击前都重新确认微信仍在前台
- 发现窗口漂移立刻中断
- 重试前再次 bringToTop

提示词模板：
```text
请审查微信脚本的前台窗口稳定性保护。
要求：
1. 每个关键步骤前确认活动窗口仍然是微信
2. 若窗口位置尺寸漂移，应立即报错
3. 若只是失焦，应先恢复前台再继续
```

### 8. 单步调试优先
借鉴点：
- `wx4py` 的 public API 实际上天然支持单功能测试
- 当前项目更适合通过 `stepMode` 形成单环节调试路径

转成当前项目的实现要求：
- `open_chat`
- `open_chat_verify_header`
- `bundle_open_and_focus_input`
- `bundle_send_guarded`
- `bundle_read_reply`
- `full_non_send`
- `full_send_guarded`

提示词模板：
```text
不要直接优化整个微信自动化，请先按照 stepMode 做最小环节调试。
请给出：
1. 哪个 stepMode 适合验证搜索
2. 哪个 stepMode 适合验证输入框定位
3. 哪个 stepMode 适合验证真实发送闭环
4. 每个模式预期输出哪些报告字段
```

## 推荐调试顺序
1. `open_chat`
确认能否稳定打开目标会话。

2. `open_chat_verify_header`
确认打开后不是误入错误会话。

3. `bundle_open_and_focus_input`
确认输入框定位可靠。

4. `bundle_send_guarded`
确认输入、发送、草稿清空、消息出现这四段闭环。

5. `full_non_send`
跑完整条非发送链路，看报告中的各区域与 OCR 是否稳定。

6. `full_send_guarded`
仅在真实发送需要时启用。

## 建议报告字段
建议长期保留这些字段：
- `targetSelection`
- `openChatPoint`
- `headerCheck`
- `incomingCheck`
- `draftCheck`
- `draftAfterCheck`
- `draftCleared`
- `messageAfterCheck`
- `selfMessageObserved`
- `replyReadback`
- `sendActions`
- `sendAuditPath`

## 对当前脚本的直接建议
1. 默认 `enableSend=false`
2. 把真实发送相关步骤从 `full_non_send` 中排除
3. 发送前做去重检查
4. 发送过程写 JSONL 审计日志
5. 报告里同时保留发送前后 OCR 校验结果

## 一句话结论
`wx4py` 真正值得借鉴的是“把微信发送从一个 UI 操作变成一个可验证、可重试、可审计的流程机”，这套思想已经适合直接迁移到当前项目。
