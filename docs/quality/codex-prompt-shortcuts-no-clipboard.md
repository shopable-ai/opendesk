# 提示词快捷栏：输入成功不占用剪贴板

2026-10-29，基于工作区 `master` / `c65848c246c516d111b8cd12b947f33a6cbc70a7` 的未提交候选。工作区包含其他任务修改；本轮只修改提示词输入、结果反馈、对应测试和说明，未提交或推送。

| 交付项 | 本轮结果 |
| --- | --- |
| 代码已修改 | 完成：输入 helper 不依赖剪贴板，主入口按结果决定是否复制 |
| 实际已加载 | 最终 `main.js` 在独立库、精确 TextEdit 范围内加载；helper 另行在真实 Runtime 中求值成功 |
| 视觉已确认 | 未完成：没有本候选的真实按钮输入、旋转指示器或右下角消息截图 |
| 功能已验证 | 569 项离线回归通过；真实桌面输入与剪贴板不变尚未通过 |

## 当前行为

| 输入结果 | 剪贴板与反馈 |
| --- | --- |
| `inserted / VERIFIED_TEXT / verified:true / acknowledged` | 不访问剪贴板，静默结束 |
| `inserted / TEXT_OBSERVED / verified:false / acknowledged` | 不访问剪贴板；提醒正文未验证、检查草稿、尚未发送 |
| `rejected / not_started` | 复制完整正文并读回一致后，右下角提示“未写入，已复制完整正文（原因码）。” |
| `blocked / unknown` 或矛盾回执 | 保留剪贴板，锁止后续输入，不自动重试 |
| 复制异常或读回不一致 | 不报告复制成功；通知异常也不触发再次复制或输入 |

管理器“复制所选正文”和显式仅复制模式保留。默认输入成功时不显示复制反馈或广告演示。按钮仍仅在处理期间显示原生旋转指示器，保持原标签、悬停提示和无障碍名称；所有启用提示词继续纵向排列，不引入分页或滚动条。

`insert.js` 将一次普通粘贴改为一次公开 `keyboard.type(suffix)`。兼容字段 `inputMode:'paste'` 和内部函数名保留，配置无需迁移。已聚焦且选区折叠时插入完整正文；后备路径保留原来的聚焦、移至末尾及非空稿件分隔规则。输入前新增所有模型都执行的草稿/选区重读，保留前台、窗口、元素、组合态及生命周期守卫。

删除 Web 后备路径的全选/Copy/剪贴板探针及恢复光标流程。Claude/OpenCode 的 AX 投影不能核验精确全文，因此统一返回观察结果，不冒称全文验证成功，也不据此复制。Codex/plain 继续比较完整 AX value。输入 helper 不接收、读取或写入 clipboard 依赖。

本轮没有修改 `targets.js`，保留现有三应用选择、精确窗口隔离和 `editorPolicy`；没有修改原生 UI 或键盘后端。macOS 已有 `keyboard.type` 后端使用 Unicode CGEvent；其 Promise 完成不等于目标编辑器接受输入，仍由 helper 检查后续状态。其他平台后端未在本轮验证。

## 离线验证

从仓库根目录执行以下本机命令；外部 Browser model 路径只作本地 schema/model Oracle，不启动浏览器或访问服务：

```bash
OPENDESK_BROWSER_MODEL=/Users/shopme/Documents/workspace/opendesk-browser/examples/sidebar-tools/prompt-shortcuts/trusted/model.js node --test --test-timeout=10000 --test-reporter=tap tests/custom-ui/codex-prompt-shortcuts.test.cjs tests/custom-ui/codex-prompt-insert.test.cjs tests/custom-ui/codex-prompt-targets.test.cjs tests/custom-ui/codex-prompt-storage.test.cjs tests/custom-ui/codex-prompt-browser-compat.test.cjs
```

结果：**569 通过，0 失败，0 跳过，0 取消**。日志为本地 `.runtime/tests/prompt-shortcuts-no-clipboard-20261029/regression-browser-final.tap`。

覆盖四种编辑器模型的聚焦/未聚焦 Unicode、空白和多行输入，剪贴板方法被设为调用即失败；覆盖正文和既有稿件保留、全文不匹配、部分输入、重复点击、未知状态锁止、复制异常/读回失败和通知异常。主入口测试运行同一份完整业务脚本及真实 helper，以依赖模拟验证回调；它们不是桌面证据。同组测试继续覆盖三应用双同名窗口、陈旧引用、按钮数量/高度及无分页回归。主入口 async-wrapper 语法检查、helper `node --check` 和相关文件 `git diff --check` 通过。

## 构建与实际加载

使用固定开发入口 `./opendesk`，实际主程序为 `dist/OpenDesk.app/Contents/MacOS/opendesk`，配套 UI host 为该 bundle 的 `Contents/Helpers/opendesk-ui-host`。本轮仅改外部 JavaScript；二进制和相关 toolbar 源文件哈希与已有配套开发构建记录一致，`codesign --verify --deep --strict dist/OpenDesk.app` 通过，未重新构建或修改签名。

- 最终 `main.js` SHA-256：`ab1a317ffb274752237573173a41368deab4716ad95de1a2d615f5efd01695c1`，与 `final-load/script_snapshot.js` 一致。
- 主程序 SHA-256：`87276091384883f8eb132bae733e881db2ae571bc4180ea8b49903a55222f5b0`。
- UI host SHA-256：`3fe00561a1fdfffaa0e2d0c295517d752961dabdeee39e0b8da2096a8d974b35`。

最终加载使用独立合成库和本轮新建的 TextEdit 文档范围，主程序 PID 为 77005；记录 `FOLLOW` 和隐藏状态 `READY` 后由本轮受控取消。`insert.js` 的独立 Runtime 加载返回四个预期导出函数，没有调用输入。源码/构建哈希和时间保存在本地 `final-provenance.json`。这些结果只证明加载，不证明真实输入成功；带范围和独立库的命令也不代替 README 无配置一行命令验收。

## 现场限制与剩余验收

本地证据目录：`.runtime/tests/prompt-shortcuts-no-clipboard-20261029/`；它是忽略的运行产物，不随源码提交。

OpenCode 只读预检遇到 AX `TIMEOUT`，其窗口 handle 在观察期间变化；未点击提示词。随后新建空白 TextEdit 文档，初始窗口过小令工具栏隐藏，放大后独立 Runtime 的三次精确前台查询仍返回 null。同期其他任务占用桌面且剪贴板 changeCount 变化，不能取得可靠的连续输入证据，未继续输入。Codex 的 Computer Use 访问被工具安全策略拒绝，未改用其他自动化技术绕过。所有本轮快捷栏进程已受控停止，既有安装版和其他任务服务保留。

因此，本候选的真实输入、输入前后剪贴板不变、失败复制消息、旋转期间画面、8 条提示词的完整 60×472pt 实窗视觉，以及三应用双窗口/移动缩放组合验收均未通过。历史粘贴候选的截图、延迟和逐字结果仅作为历史证据，不转移给 Unicode 输入候选。后续需在可稳定确认的独占目标测试窗口内，经预检后执行最小真实按钮输入，再独立核验正文、剪贴板和画面；unknown 时停止，不重放。
