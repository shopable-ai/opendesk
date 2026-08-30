# WeChat Failure Mapping

本文件保存 WeChat 领域失败代码与全局 `docs/quality/failure-taxonomy.md` 的映射。它不声明这些问题当前仍然存在。

| Domain code | Global class | Meaning | Current status |
| --- | --- | --- | --- |
| `WECHAT_ACTIVE_WINDOW_DRIFT` | F1 / F4 | capture 时 active window 被其他窗口替换 | historical; not revalidated in current audit |
| `WECHAT_CHAT_CANDIDATE_MISMATCH` | F4 / F6 | 候选对话与目标身份不一致，需 post-click verification | historical; not revalidated |
| `WECHAT_REGION_MAP_HEURISTIC_DRIFT` | F3 / F2 | app-specific region semantic rules 对 UI/layout 漂移脆弱 | historical; not revalidated |
| `WECHAT_OCR_TEXT_LOSS` | F2 | OCR 丢失关键文本 | taxonomy candidate; requires concrete case evidence |
| `WECHAT_ROLE_MISCLASSIFIED` | F3 | conversation/header/input/send 等角色推断错误 | taxonomy candidate; requires concrete case evidence |
| `WECHAT_SEND_UNSAFE` | F9 / F5 / F6 | 未完成 identity/draft/target/postcondition gate 就执行 send | safety rule; not a current incident claim |

## Domain rule

- WeChat-specific threshold、OCR keyword、UI region 与 send guard 留在本领域，不写入全局 failure taxonomy。
- 新增 domain code 时必须说明对应 F0-F10 class。
- 只有带具体 Failure Case ID 与 Evidence 的事件，才可写成“observed failure”。
