# 提示词快捷栏 R22：跟随响应、拖动与双应用切换

日期：2026-10-28（Asia/Shanghai）。工作目录 `/Users/shopme/Documents/workspace/opendesk`，现有 master，HEAD `b7280bef765a4fe5c6076643d5c8313733d39e2b`。本轮没有创建分支、提交或推送。

## 范围与归属

保持原生五按钮及既有双栏管理器；本轮负责响应、拖动和配置内的 Claude Code / OpenCode 切换。用户已确认保留并行开发。`targets.js` / `insert.js` 的 paste 输入策略及 main.js 对应接线属于并行输入开发，本记录不将其作为严格安全追加通过的证据。R22 使用 `two-scopes.json` 明确配置两个精确 PID/executable 与 `inputMode:strict`，只使用合成库，未扩展观察范围。

严格安全追加仍未完成：空稿写全文，非空 D 逐字保留后追加两个换行及正文；IME、选区、并发修改、编辑器生命周期与提交状态须满足事务合同。普通粘贴和拒绝后复制不能替代此合同。本轮不点击提示词、不发送消息。实窗期间发现其他操作方触发了合成 1 / 2 点击，direct-01 回执均为 rejected/not_started；这些不计本轮输入验证。

## 实现

- main.js：每轮做一次完整 Code 场景和几何测量，显示结束前再做一次完整结构复核（省去全树 bounds 查询）；不跨轮缓存输入引用。摆位稳定帧只查工具栏自身，关键点只精确重验已选窗口的 PID/executable 和几何，不反复扫描全部 scopes。多 scope 只读观察并行收集，冲突仍拒绝。
- 独立前台/几何守卫在场景等待期间继续运行；变更时递增目标版本，先隐藏旧栏、废弃输入引用及拖动持久化，再资格化新目标。迟到结果及过期订阅错误不能重新显示旧栏。
- 拖动保留原生移动，160ms 合并持久化；最后再核对实际 bounds 与该 move 帧一致，按原 owner 保存隔离偏移，不等待保存 toast。屏幕边缘保存使用未 clamp 的锚点，恢复时才 clamp，修复部分离屏窗口松手后弹回的问题。
- native_darwin.m：原生工具栏禁用 AppKit 默认显示动画，避免中间缩放高度；windowDidMove 去掉重复 tooltip invalidation。

## 已有证据与当前状态

产物根 `.runtime/tests/codex-prompt-shortcuts-r22/`，只作本地运行证据。

接管核对：R21 旧候选随后退出；安装版 `/Applications/OpenDesk.app` PID84099/84111 保留。Claude PID42296、OpenCode PID19778 的 executable 已核对；窗口观察分别为170722、170075，坐标是现场值，不作永久目标。

原实现成本（cost-baseline）：Claude getAppWindow 130–254ms，完整场景576–636ms（3次）；非前台 OpenCode40–45ms。baseline-03 为原正式 main.js（SHA256 `fb8b861561081e1f7632ca8a8a710262b998fceb399a51568c8a628fad46be5e`）。其三组双应用切换中，Claude 正确位置首次出现约1226 / 972 / 2208ms；第一组随后回到旧 OpenCode 位置，标为不稳定失败。第二、三组为原始位置采样；未同步证明全程前台未被并行操作者改变，不能将其全部当作受控延迟分布。原生拖动初版 postToPid 探针未造成位移，不是有效拖动性能基线。

第一次优化 direct-01 已加载并截取 toolbar.png，外观与 R21 一致；但一次带前台核验的新计时仍为2292ms，性能未达本轮目标，因此继续修复重复窗口重验。direct-01 还发生了前台与按钮点击干扰，相关样本剔除。

固定构建命令：`GO_BIN=/Users/shopme/.local/opt/go1.25.13-amd64/bin/go ./scripts/build_macos_app.sh`。本次构建、签名验证通过，身份沿用 `-`、AppID `com.opendesk.cli`。主程序 SHA256 `5e7f606479d6f50cccada4900036addfe2a30b9c2b693b6a1210e5ee565116ec`；UI host `44e68f6db6cada6fd7c2de0344a4bfef3fffaddefde7dfe9b7bc2d3d83c98a09`。

公开 Runtime JS：从根目录原样运行 `./dist/opendesk -ui -script tests/runtime-api/custom-ui-toolbar-position.js -console-mode script -log-dir .runtime/tests/codex-prompt-shortcuts-r22/native-position`，四次 hide/move/show 位置与固定280pt高度通过；独立证据 `.runtime/tests/custom-ui-toolbar-position/1793185406992/result.json`。此 gate 不代替实际拖动或双应用验收。

最终四模块 `node-final-04.log`：393项，391通过、0失败、2个可选 Browser 路径测试跳过。覆盖深树等待中的前台/几何失效、迟到结果、过期 guard 错误、显示中场景切换、最终拖动帧失效、部分离屏偏移，以及发现几何变化后先隐藏再等待替代观察。独立只读审查发现的两处 MEDIUM 已定向修复和回归。`git diff --check` 通过。

私人库本次哈希仍为 `046f55a4cef84b8be6aa77e50158c441a18cc477146ece1c13880bf5bcf8a4e4`，未输出正文。没有访问 Codex UI/AX/窗口内容、全局窗口清单、全局桌面事件或全桌面截图；只查精确目标窗口和 front ASN/PID 标识。

## 最终分层状态与待完成

| 层次 | 结论 |
| --- | --- |
| 代码已修改 | 跟随、拖动持久化、场景结构复核和原生动画修复已写入；保留并行输入修改。 |
| 构建 | 固定入口构建、签名和公开原生位置 gate 通过。native 后续没有再改。 |
| 实际已加载 | direct-01/02 加载了中间版本；最终审查修复后的 JS 未重新加载，不声称最终已运行。 |
| 视觉已确认 | direct-01 五按钮截图通过；不作为最终 JS 的加载或功能证明。 |
| 功能已验证 | 最终 Node 回归通过；最终响应/拖动/双应用实窗验收未完成。 |

为了避免并行操作者继续触发点击和切换，已暂停本轮桌面动作，等待用户对短暂桌面独占的协调回答；并行源码开发继续。R22 自有 direct-02 候选已受控停止，避免留下过时脚本误导体验。安装版及两目标应用保留。最新哈希与分层状态见 `final-provenance.json`，不把仍运行的其他任务归为本轮。

最终候选当前源码加载核对、更新截图、受控前后响应样本、真实拖动/松手保存、各应用位置隔离、窗口移动/缩放与离开 Code 隐藏。实窗协调期间继续完成离线修复，不把旧截图或启动受理当作上述通过。安全追加的事务入口依赖仍未满足。

## 最终候选的一行入口

从仓库根目录 `/Users/shopme/Documents/workspace/opendesk` 执行：

```bash
OPENDESK_SHORTCUTS_TARGET_CONFIG=.runtime/tests/codex-prompt-shortcuts-r22/two-scopes.json OPENDESK_SHORTCUTS_LIBRARY_DIR=/Users/shopme/Documents/workspace/opendesk/.runtime/tests/codex-prompt-shortcuts-r22/synthetic-library ./opendesk -ui -script examples/custom-ui/codex-prompt-shortcuts/main.js -console-mode script -log-dir .runtime/tests/codex-prompt-shortcuts-r22/final-01
```

依赖本机已准备的合成库、明确 strict profiles 和当前两个 PID；进程重启后先重查身份再更新配置。此命令对应最终源码，**本次尚未运行**。direct-01/02 的同一正式入口已运行，但不能冒称最终候选已通过。续接时不要并开业务入口或扩大为全局观察。
