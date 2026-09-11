# Notifications 示例

本目录保存系统通知的 canonical public examples。通知会真实出现在当前桌面，并可能播放声音，因此在 Example Explorer 中保持 `manual`。

## Send Notification

```bash
./dist/opendesk -script examples/notifications/send.js -console-mode script
```

发送带标题/消息/声音/timeout 的通知，然后再发送一个短文本通知。

## Notification Lifecycle

```bash
./dist/opendesk -script examples/notifications/lifecycle.js -console-mode script
```

先等待本应用即将发送的通知，读取 delivery metadata，再按返回 id 关闭该通知。

## 旧路径已退休

旧根目录通知入口已删除。新命令只使用本目录 canonical 文件；Catalog `legacyNames` 只保留历史名称/搜索上下文。

## 边界

- 示例会触发真实系统通知；不要用于敏感文本。
- 操作系统权限或平台 backend 不支持时应明确失败，不把“文件存在”当成能力可用证明。
- Example Explorer 用于发现和阅读这些 `manual` 示例；正式 contract 仍由 `tests/runtime-api/` 和相应平台验证负责。
