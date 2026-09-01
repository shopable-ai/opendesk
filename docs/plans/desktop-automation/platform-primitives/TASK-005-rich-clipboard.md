# TASK-005 — Rich Clipboard

Status: TODO
Priority: P1
Depends on: TASK-003 recommended for change events

## Goal

在现有稳定文本 `clipboard.copy/paste/clear` 基础上补齐桌面自动化常用的富剪贴板能力，而不是替换当前接口。

## MVP 候选

```js
clipboard.read(options?)
clipboard.write(payload)
clipboard.getFormats()
```

Payload 至少评估：

```text
text/plain
text/html
text/rtf
image/png
files / file URLs
```

如 TASK-003 已完成，可增加：

```js
clipboard.onChange(callback)
```

但底层应尽量复用统一 Events 系统，而不是建立第二套 watcher。

## 必须解决

- 与现有 `copy/paste/clear` 向后兼容。
- 空剪贴板的真实语义；修复或明确当前 `clear()` 写入单个空格的历史行为。
- format negotiation。
- 图片字节与路径返回策略。
- 文件列表跨平台表示。
- 大对象内存限制。
- 隐私：默认日志/Evidence 不记录剪贴板正文。

## 非目标

- 不做 clipboard history 产品。
- 不持久化用户剪贴板内容。
- 不默认监控所有 clipboard 数据。

## 测试

至少覆盖：

1. 现有文本 API 回归。
2. plain text。
3. HTML/RTF（平台允许时）。
4. PNG image。
5. file list。
6. clear semantics。
7. unsupported format。
8. 大 payload 限制。
9. change event（如果 Events 已实现）。

## Done

- 现有文本 API 不破坏。
- 至少 macOS 对文本 + 图片/文件中的一种富格式有真实 evidence。
- 日志不泄露剪贴板正文。
- 文档、类型、机器索引同步。
