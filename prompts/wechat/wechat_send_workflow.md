# WeChat Send Workflow

## Role
You are improving the macOS WeChat automation flow in this repository. Work within the project's existing runtime:
- `window.*` for window management
- `page.screenshot` for captures
- `Vision.runOCR` for text validation
- `ImageColor.findPos` for template relocation
- `keyboard.*` and `mouse.*` for input

Do not redesign the stack around Windows UI Automation. Borrow process logic, not platform-specific APIs.

## Goal
Build or debug a guarded WeChat send flow that can:
1. Find the target chat
2. Open the chat
3. Verify the header
4. Verify message context
5. Focus the input
6. Type the draft
7. Send only when explicitly enabled
8. Verify the draft cleared
9. Verify the sent message appeared

## Non-Negotiables
- Default to non-send mode.
- Real send must require explicit `enableSend=true`.
- Every major step must be independently testable via `stepMode`.
- Every major step must write structured evidence into the final JSON report.
- Real send must be protected by duplicate-send suppression.
- Failures must be diagnosable from report fields and JSONL audit logs.

## Engineering Pattern To Borrow From `wx4py`
Borrow these ideas:
- normalize target and message before UI work
- separate `open_chat` from `send_message`
- retry unstable UI steps with short jitter
- restore foreground before capture/click
- treat send as a multi-phase transaction, not a single Enter key
- add audit logs for each send phase
- suppress duplicate sends within a short time window

Do not borrow:
- Windows UIA control locators
- Win32 hotkeys or HWND-specific assumptions
- control tree traversal patterns that do not exist in this repo

## Preferred Debug Order
1. `open_chat`
2. `open_chat_verify_header`
3. `bundle_open_and_focus_input`
4. `bundle_send_guarded`
5. `full_non_send`
6. `full_send_guarded`

## Expected Report Fields
Ensure the flow reports:
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

## Tasking Template
When asked to improve the flow, use this structure:

```text
目标：
完善 examples/mac/wechat_structured_send_v2.js 的某个环节或完整闭环。

约束：
1. 不要引入新的平台栈
2. 默认不能误发消息
3. 优先复用现有 step 化结构
4. 保留 OCR 和模板匹配双路径

执行要求：
1. 先指出当前失败或风险属于哪个 step
2. 只修改与该 step 强相关的代码
3. 写清新增保护逻辑
4. 更新对应文档或提示词
5. 给出最小验证方式
```

## Step-Specific Prompt Snippets
### Search / Open Chat
```text
请只检查微信自动化的 open_chat 阶段。
要求：
1. 判断候选模板、搜索框 OCR、region map 回退三条路径是否合理
2. 给出失败后如何清理搜索框并重试
3. 输出最小 stepMode 和预期报告字段
```

### Focus Input
```text
请只检查 focus_input 阶段。
要求：
1. 判断输入框区域定位是否可靠
2. 如果 probe point 不可用，给出回退点击点策略
3. 输出需要写入 context 的字段
```

### Guarded Send
```text
请只检查 guarded send 阶段。
要求：
1. 发送前必须做去重检查
2. 发送动作要记录 sendActions
3. 发送后要验证 draftCleared 和 selfMessageObserved
4. 输出失败时应该怎样记录 audit log
```

### End-To-End Review
```text
请评估当前 wechat_structured_send_v2 流程是否达到可用闭环。
按以下维度输出：
1. 会话定位
2. header 校验
3. 消息上下文校验
4. 输入框聚焦
5. 草稿输入
6. 发送动作
7. 发送后验证
8. 审计与去重保护
```

## File Placement Rule
Important long-lived files should stay in stable repo paths:
- prompts in `prompts/`
- docs in `docs/`
- domain-owned config examples beside the maintained scenario under `examples/`

Only disposable runtime artifacts should go to `.runtime/temp/`:
- screenshots
- execution reports
- temporary local overrides
- OCR probe outputs
- JSONL audit logs if they are execution artifacts rather than templates
