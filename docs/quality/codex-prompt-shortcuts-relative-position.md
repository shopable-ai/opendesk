# 提示词快捷栏：拖动后的相对位置

2026-10-29，基于 `master` / `c65848c246c516d111b8cd12b947f33a6cbc70a7` 的未提交候选。需求唯一正文为 `examples/custom-ui/codex-prompt-shortcuts/README.zh-CN.md` 的“拖动后的相对位置需求”。本轮按自动化脚本工作流的 `code-rebuild` 受限续接；未找到完整历史正式阶段链，不补造上游或 S12 资格，不恢复已延期的输入验收或评分。

| 交付项 | 本轮结果 |
| --- | --- |
| 代码已修改 | 修复回拖被过滤，以及迟到移动通知取消有效拖动的竞态 |
| 实际已加载 | 固定 `./opendesk` 入口加载当前原始 `main.js`，脚本快照与源码逐字节一致；仅达到隐藏的 READY |
| 视觉已确认 | 未完成；未取得本候选真实拖动及恢复截图 |
| 功能已验证 | 577 项离线回归通过；真实拖动、目标移动/缩放后及重启恢复未运行 |

## 实现与发现

位置合同保持为默认内容区左侧、垂直居中基准加 `offsetX/offsetY`（pt）。`frame/placement` 按当前目标、栏高及有效 composer 重算基准，显示时裁切；`targetOffset/saveOffset` 按 profile 和稳定应用身份读写偏移，既有 Codex Bundle ID 兼容值仍用顶层 settings。自动移动不写偏移。同应用窗口共用偏移，跨应用隔离。以上几何与存储逻辑本轮保留。

原 `drag` 在核验用户位置后没有更新 `expectedPosition`。因此拖出并保存后，再拖回原程序定位点会被直接过滤；160ms 内拖出又拖回也丢失最后通知。新增回归在修复前分别失败，证据为本地 `before.tap`。

接纳经原生读回核验的位置后更新过滤标记，允许回拖。读回阶段用 `dragReads` 暂时阻止同目标跟随弹回，只有有效的新读回才取得 `dragVersion`、取消前一保存定时器并成为持久化 owner。迟到或与当前原生坐标不符的通知不再取消有效保存；读回倒序完成时，较旧请求不能夺回保存权。`cancelDrag` 同时失效所有在途读回，保留原来的目标变化、管理器、关闭跟随、重置及退出守卫。补查的迟到通知回归在中间候选失败，见 `stale-before.tap`；最终候选通过。独立代码审查另复现“已接纳 A → B 读回挂起 → 回到 A”：重复值过滤会丢失最后的 A，使迟到 B 取代它。现仅在没有在途读回时跳过重复坐标；新增回归先失败（`overlap-before.tap`）再通过，最后 A 能阻止旧 B 取得保存权。

未改输入策略、提示词顺序、库 schema、目标 registry 或原生 owner；没有增加依赖。实际改动范围为 `main.js`、`tests/custom-ui/codex-prompt-shortcuts.test.cjs`、需求说明及本记录。其他任务和此前未提交修改保留，未提交、推送、创建分支或 worktree。

原生 `FloatingWindow.on('move')` 只提供移动通知，不提供 origin 或 mouse-up 标记，程序定位也可能产生事件。160ms 无新移动、程序位置过滤与原生最终帧核验是脚本层判断，不能把单条事件称为物理松手证明。本轮没有扩展原生 API。

## 离线验证

从仓库根目录运行：

```bash
OPENDESK_BROWSER_MODEL=/Users/shopme/Documents/workspace/opendesk-browser/examples/sidebar-tools/prompt-shortcuts/trusted/model.js node --test --test-timeout=10000 --test-reporter=tap tests/custom-ui/codex-prompt-shortcuts.test.cjs tests/custom-ui/codex-prompt-insert.test.cjs tests/custom-ui/codex-prompt-targets.test.cjs tests/custom-ui/codex-prompt-storage.test.cjs tests/custom-ui/codex-prompt-browser-compat.test.cjs
```

最终结果：**577 通过、0 失败、0 跳过、0 取消**。外部 Browser model 仅作为本地兼容 Oracle，不启动浏览器。新增八项测试覆盖非零偏移连续保存、回拖、去抖期间回拖、迟到程序通知、两种读回完成顺序、平移/缩放、8 条提示词栏高、同应用新窗口、进程重启、裁切与空间恢复、隐藏/管理器往返及独立复制模式；既有测试继续覆盖跨应用恢复、重置隔离和取消后迟到回调。

Runtime async-wrapper 语法解析、测试文件 `node --check`、相关文件 `git diff --check` 通过。测试使用同一完整业务脚本和内存依赖，未把写入模拟期望值称为真实拖动。没有修改原生源码，因此未扩大到原生重构、全平台构建或完整 Runtime catalog。

独立原生子 agent 已复核最终补丁及失败/通过记录，先前发现的阻断已修复，本轮范围未发现其他阻断。该审查只读源码和留档，未重新操作桌面；没有可用的 LSP 诊断，不作完整静态诊断通过声明。

## 实际加载与现场边界

本地证据目录为 `.runtime/tests/prompt-shortcuts-position-20261029/`，包括基线源码/helper 快照、需求与作业范围、失败和最终 TAP、两次只读预检、加载快照、运行日志及 `final-provenance.json`。这些均为忽略的运行产物。

固定开发主程序与配套 UI host 的哈希分别为 `87276091384883f8eb132bae733e881db2ae571bc4180ea8b49903a55222f5b0`、`3fe00561a1fdfffaa0e2d0c295517d752961dabdeee39e0b8da2096a8d974b35`，与上一轮记录一致；相关 toolbar 源文件也一致，`codesign --verify --deep --strict dist/OpenDesk.app` 通过。本轮只更改外部 JS，复用固定签名开发构建，没有刷新或覆盖签名包。

当前 `main.js` SHA-256 为 `48b10e8efec88d2e907b72a20b676b09e1e9b267926a48c1a45f4a0a18ad0c9b`。通过原始脚本路径运行，使用本轮独立合成库（8 条提示词、初始偏移为零）及 PID 56350 的精确 TextEdit 范围。最终加载目录为 `final-load-02`，主程序 PID 3582 达到 FOLLOW / hidden READY，库 revision 始终为 0；未实例化可见工具栏，也未启动本轮开发 UI host。随后由本轮受控取消并确认进程退出。取消产生的 CANCELED 日志不是运行成功。既有安装版主程序 53819 和 UI host 53829 保留。

CUA 能读取空白 TextEdit 窗口，执行 Raise 和标题激活后，Runtime 的 `window.getAppWindow` 两次仍返回 null；不能确认目标前台，按停止条件结束实测分支。未点击提示词、输入正文、发送消息或改用户库；未通过其他技术访问被禁止的 Codex UI。

README 无配置的一行公开命令未验收；带独立库和精确范围的加载不替代它。正式拖动自动化 gate、拖前/拖后截图、目标移动/缩放后的独立位置读回、持久化读回及受控重启恢复均未运行。当前三应用组合与视觉仍需可靠前台现场验证，旧 R22 或旧输入截图不转移到本候选。
