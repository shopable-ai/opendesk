# OpenDesk × Codex Desktop Prompt Shortcuts R1.2

本例在已有 [quick-replies/main.js](../quick-replies/main.js) 的 `FloatingWindow` 快捷回复栏上增加 Codex 窗口跟随、相对位置保存和 Browser 提示词 JSON 导入。原生按钮、拖动、外观、tooltip 与回调由 OpenDesk 现有组件提供。

## 使用

在仓库根目录 `/Users/shopme/Documents/workspace/opendesk`，使用本地配套构建：

```bash
./dist/OpenDesk.app/Contents/MacOS/opendesk -ui -script examples/custom-ui/codex-prompt-shortcuts/main.js -console-mode script -log-dir .runtime/examples/custom-ui/codex-prompt-shortcuts
```

首次打开管理窗口。推荐继续在 OpenDesk Browser 的“提示词快捷按钮”中编辑：打开“导入与导出”→“导出 JSON”，取得下载文件的绝对路径，在桌面管理窗口中填写并预览、确认追加导入。工具安装包 `.opendesk-tool.json` 不是提示词备份。

已有桌面管理器保留本地编辑、排序、启停和导入/导出功能。本轮不扩展另一套编辑器，也不增加跨应用后台同步服务。

竖栏使用五个固定原生按钮：三个提示词槽位、“下一”和“管理”。每个按钮 40×40pt，短标签在按钮中央显示；没有图片、图标或红色角标。空槽显示“空”并禁用；悬停可查看完整名称、复制模式和正文摘要，分页进度在“下一”的 tooltip 中显示。超过三条时分页，末页空槽禁用；切页与保存只更新按钮状态，不重建窗口。最多保存 80 条。

点击提示词只复制完整正文，并显示反馈。当前模式始终为 `COPY_ONLY_PENDING_AX_VALIDATION`；不会粘贴、改写 Codex 草稿或触发 Enter。安全插入需在获准的 Codex 实窗验收后另行实现。

## 窗口与数据

- 默认从 `App.list()` 当前快照确认 `com.openai.codex`，再按 Bundle ID 取得进程组；自定义标识须先核验。窗口按 id、pid、handle 复核，不能仅靠标题或应用名匹配。
- 目标前台窗口或本例的确切原生快捷栏获得焦点时允许显示；其他 Host 窗口、管理器或其他应用不能冒充目标。Events 是框架现有 polling fallback；事件只触发重新观察。
- 根据目标窗口、显示器逻辑坐标及原生栏实际尺寸定位。内容区左边缘和输入区避让仍为几何估算，尚无 Codex AX 实测证明。显示后有界等待稳定读回；移动失败或读回不符会隐藏，避免在错误位置继续显示。
- 原生拖动保存相对偏移；重置会取消旧拖动回调。快捷栏原生关闭后打开已有管理器作为恢复/退出入口；保存可恢复栏。管理器关闭时未保存的草稿会在同一 execution 内重开恢复，不能当作进程崩溃后的草稿持久性保证。

唯一桌面数据文件为 `.runtime/examples/custom-ui/codex-prompt-shortcuts/library.json`，包含 `schemaVersion:1`、递增 `revision`、`prompts` 和 `settings:{appBundleId,offsetX,offsetY}`。运行日志与备份也在该目录，不进入版本控制。

导入仅接受正式 `format:"opendesk.prompt-shortcuts"` 的 v1/v2 JSON，文件上限 256 KiB。默认追加，按正文 trim 后去重，不覆盖原记录；图片项需确认降级为文字。保存与复制不会截断正文；tooltip 受原生 60 Unicode 字符上限约束，仅缩短展示文案。Browser 自身存储容量与桌面库容量不同，导出不能承诺一定可装回 Browser。

保存使用 `File.writeNew` 独占锁、revision/基线检查、`File.writeJSON` 原子替换及读回核验。检测到其他实例写入或结果不确定时，禁止重复保存和导出旧快照，须用“核对磁盘版本”处理。不能按锁文件年龄自动删除：先确认相关实例已停止且没有并发写入，再保留备份并移走遗留 `library.lock`。这些约束只保护遵循本例锁协议的实例，不是通用数据库事务或掉电持久性承诺。

## 验证状态

```bash
node --test tests/custom-ui/codex-prompt-shortcuts.test.cjs
```

Node 测试是内存 VM 回归，覆盖数据、导入、保存冲突、窗口身份、分页映射与失败恢复。它不证明真实桌面跟随或剪贴板集成成功。

纯文字模式使用 `FloatingWindow.addButton(id, label, {text:短标签}, callback)`，通过 `updateButton(id, {icon:{text:短标签}})` 更新；label 继续承担 tooltip 与 Accessibility 名称。原生图标模式仍兼容 quick-replies 等已有调用。vertical 隐藏放不下的标题文字和 mini/zoom，保留原生关闭与拖动。

独立 Runtime 文字契约验证（仅自有 OpenDesk 窗口）：

```bash
./dist/OpenDesk.app/Contents/MacOS/opendesk -ui -script tests/runtime-api/custom-ui-toolbar-text.js -console-mode script -log-dir .runtime/tests/custom-ui-toolbar-text/run
```

当前配套构建的自有 OpenDesk 提示词栏实窗，经独立五项 UI 评审平均 **95.4/100，通过**；正式文字 Runtime 和 192 个并发响应检查通过。构建来源、截图、分项评分及验证边界见下方验证记录；旧红色角标截图已按用户反馈判为视觉不通过。

Codex 自身界面访问受到当前 Computer Use 安全限制，本轮没有通过其他通道绕过。上述正式一行命令的完整 Codex 链路、前后台跟随、草稿、双屏/Retina/负坐标实窗、Space/全屏及真实 Browser 导出迁移仍为 **NOT_TESTED**。完整产品验收及五维评分为 **NOT_SCORED**。详见 [R1.2 验证记录](../../../docs/quality/codex-prompt-shortcuts-r12.md)。
