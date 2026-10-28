# 提示词快捷栏：同窗焦点通知引起的闪烁修复

2026-10-28，工作目录 `/Users/shopme/Documents/workspace/opendesk`，现有 `master`，起点 HEAD `b7280bef765a4fe5c6076643d5c8313733d39e2b`。没有创建分支、提交或推送。工作树已有其他任务的未提交修改；本轮负责 `main.js` 的跟随状态、对应主入口回归和本文，不接管并行的输入回执策略。

## 需求与原因

用户反馈：快捷栏已浮在 Claude 上方时，再点击 Claude 或提示词按钮，整栏会闪烁，按钮点击后似乎闪两次。本轮保留五按钮、管理器、尺寸、布局、输入策略及不发送合同，只修正跟随与异步提交条件。

源码路径已经证明：旧 `watchAppWindow` 消费方把同一个窗口的 focus/layout 等通知直接升级为清目标和 `hide()`，之后完整资格化又执行 `show()`；提示词输入产生的多条通知也走这条路径。新增回归在修改前复现两项失败：同窗聚焦立即隐藏、按钮执行中的焦点/布局通知立即隐藏。它们证明错误路径，不证明用户现场恰好发生两次显隐。

原生浮动栏为 nonactivating panel，`hidesOnDeactivate=NO`，普通按钮不主动激活宿主。窗口被快捷栏覆盖不等于目标应用失去前台。沿用公开 `window.getAppWindow({pid,exePath})`，核对目标前台、精确窗口及 Code 页面；不以“最顶窗口是否是 Claude”、栏的 `alwaysOnTop` 或记忆中的目标作为新授权。

## 方案与并发规则

- 硬失效仍立即隐藏：当前 owner 的失活、终止/身份失效、窗口销毁，以及另一配置目标的激活。合并 reasons 含 `app-deactivated` 时，即使最终 `active:true` 仍保留失活，不被重复激活优化吞掉。
- focus/main-window/layout/create/resize 等软提示只使场景版本过期并唤醒限定查询，不直接清除已确认目标或隐藏。新查询发现 null、错误、身份或不可复用的几何变化时，先隐藏再资格化；新页面不合格时隐藏。同一窗口、相同有效页面不重复 show。
- 保留现有短期、同一窗口的纯平移例外；resize、换 native ID、过期场景及未满足条件的移动仍隐藏重验。其他 scope 的普通焦点/布局通知不取消当前 owner。
- `followEpoch` 管理硬目标生命周期；独立 `sceneVersion` 管理软重查。资格化读取局部候选，在版本与精确窗口检查通过后提交，不在等待 AX 前清空已确认 `codeScene`。
- dirty 由 `sceneVersion !== sceneVerifiedVersion` 表示；只有完整、当前的场景及最终窗口/位置检查成功才确认版本并更新 `sceneVerifiedAt`。延期、取消和失败不刷新1000ms结构复核的时钟，也不吞掉后续唤醒。
- 按钮输入开始时使在途背景场景过期。背景检查在输入期间不提交新 binding 或继续深读；前台/几何守卫和硬失效继续工作，helper 的独立输入校验保留。完成后合并重查。
- 过期 show 的完成路径不再自行 hide；新的模式、目标或管理器负责其显隐命令，旧检查不能覆盖新可见状态。管理器异步状态读取后也先核对当前版本。

独立首轮方案评审为88/100，要求补齐候选提交、dirty完成语义、先深读后输入、过期show清理及几何例外。本轮据此补齐并加入交错回归。第二轮独立复审为 **96/100，OKAY，无阻塞项**：正确性35/35、稳定性24/25、并发安全19/20、可验证性8/10、最小维护10/10；审查者另行执行19项定向回归，19/19通过。扣分保留在持续通知流的长时验证、真实prepared对象释放集成验证和原生/视觉证据，评分不代表真机通过。

## 离线验证

证据目录 `.runtime/tests/codex-prompt-shortcuts-flicker/`。从仓库根目录执行：

```bash
node --test --test-timeout=15000 tests/custom-ui/codex-prompt-shortcuts.test.cjs tests/custom-ui/codex-prompt-insert.test.cjs tests/custom-ui/codex-prompt-targets.test.cjs tests/custom-ui/codex-prompt-storage.test.cjs
node --check examples/custom-ui/codex-prompt-shortcuts/main.js
node --check tests/custom-ui/codex-prompt-shortcuts.test.cjs
git diff --check
```

`regression-before.log` 记录旧逻辑2失败、3通过。`follow-after-03.log` 中30项定向回归通过；完整 `final-node.log` 共480项，478通过、0失败、2项可选外部Browser oracle跳过。`final-test-provenance.json` 核对7份相关源码/测试在运行前后哈希一致。覆盖同窗聚焦、输入中焦点/布局、合并失活、真换窗、Code页面改变、show期间新提示、在途候选遇到输入、连续提示、无通知1000ms复核、迟到错误/show、模式重载与其他scope隔离。

实窗期间，并行输入任务仅给 `inputPhase` 日志增加可选 `detail` 字段；跟随修复未变。针对更新后的当前源码再次执行上述四模块回归，`verification-02-node.log` 仍为480项、478通过、0失败、2跳过；语法和 `git diff --check` 通过。`verification-02-provenance.json` 证明7份相关源码/测试在本次运行前后不变，当前main哈希 `e34e6a37d8d33433e437aa55879c5f424152a65f91c91203d2d0a216492d79fc`。

## 构建与实窗状态

本轮只改外部JS，无native变动。复用固定入口及既有匹配宿主：主程序SHA256 `9cf076cd3e67029f7dc7a5898093fb22e40e133bb2fed93e1b44699dbf270839`，UI host `44e68f6db6cada6fd7c2de0344a4bfef3fffaddefde7dfe9b7bc2d3d83c98a09`；`codesign --verify --deep --strict dist/OpenDesk.app` 通过。与R23记录的构建一致，不以重读源码代替加载。

首次实窗启动使用精确Claude/OpenCode范围与隔离合成库，原样执行正式入口：

```bash
OPENDESK_SHORTCUTS_TARGET_CONFIG=.runtime/tests/codex-prompt-shortcuts-flicker/scopes.json OPENDESK_SHORTCUTS_LIBRARY_DIR=/Users/shopme/Documents/workspace/opendesk/.runtime/tests/codex-prompt-shortcuts-flicker/synthetic-library OPENDESK_SHORTCUTS_TRACE_FOLLOW=1 ./opendesk -ui -script examples/custom-ui/codex-prompt-shortcuts/main.js -console-mode script -log-dir .runtime/tests/codex-prompt-shortcuts-flicker/live
```

该命令依赖本机已核对PID/path及合成库，不能作为通用安装命令。`live/` 确认当时main哈希 `3b3e07c46a912b370c8589743c3395b4f0016ec2eed61a4f0f8244c58234e889`。Computer Use的后台控件点击/Raise没有改变系统前台PID；目标守卫持续返回null，快捷栏正确保持隐藏。另有一次前台PID查询TIMEOUT，已保留。没有点击提示词、粘贴或发送消息；自有PID2038已用SIGINT停止，未停止其他实例。之后增加的管理器状态版本检查尚未在此启动中加载。

## 获准定向激活后的实窗证据

用户随后明确允许使用OpenDesk精确窗口激活API激活Claude/OpenCode，继续定向实窗验证。以相同正式入口启动 `live-02`，自有主进程26556、host26634、快捷栏native ID171604；summary及脚本快照确认实际加载main哈希 `114cc3a589cd8e738d28d3b5f2852c3e4f67fdee6629943d428df35456174a9d`，包含全部跟随修复。它与当前源码的差异仅为上述可选输入日志字段，当前源码未重新作按钮实测。

- `activation-claude-05.log`、`activation-claude-07.log` 和 `activation-opencode-02.log` 保留精确身份、激活及独立 `getAppWindow` 前台回读。激活API自身报告 `VERIFICATION_FAILED`，随后独立限定回读证明真实前台分别为Claude窗口170722和OpenCode窗口170075；不能把该API返回值写成成功。
- `live-02` 的FOLLOW回执证明同一快捷栏分别跟随Claude和OpenCode，native ID不变，位置与当次目标相符。`toolbar-before-02.png` 和 `toolbar-stable-claude-02.png` 为本轮自有快捷栏实窗截图：60×280逻辑尺寸，五按钮完整，未发现文字裁切或异常空白。这证明本次加载版本的可见布局，不证明按钮点击无闪烁。
- `observe-window.swift` 仅按已知自有PID/native ID只读采样WindowServer，不激活、不点击、不枚举其他窗口。`visibility-02/03.ndjson` 记录中存在真实应用失活导致的隐藏，不能算成同窗闪烁，也不能把整个采样段报为零闪烁。
- 一次有效的OpenCode现有编辑区重新聚焦由Computer Use执行。点击起止为 `1793197981700..1793197982927` ms；`visibility-04.ndjson` 中前后各约5秒，共483样本，0隐藏、透明度始终1，最大采样间隔57.424ms；`opencode-focus-result.json` 保留结论。它证明该次同窗聚焦在采样分辨率内保持可见，不覆盖更短瞬态、所有应用或提示词按钮。
- Computer Use不能绑定独立的非激活host；通过Claude窗口坐标点击没有触发快捷栏事件，属于无效尝试。Claude草稿已有其他任务的验证文字；本轮未点击提示词、未粘贴、未发送消息，未覆盖或清空草稿。一次Claude动作被工具的“用户已改变窗口”守卫拒绝，随后只读刷新，没有重放。
- 替代按钮调用的无输入预检保留在 `preflight-*`：应用范围find返回 `SEARCH_INCOMPLETE`，已知native窗口范围返回 `STALE_TARGET`。没有取得可用的唯一受管引用，未执行 `Accessibility.perform`。按钮点击后的连续可见性仍为**未验证**，没有以截图、评分或离线测试代替。

实窗期间其他任务重建了固定dist主程序；最后只读文件哈希为 `b5666e0fae42a80bc029c3a1a73e5bc91a8259fb9e087dbc91fb714790cbae86`，UI host哈希仍为 `44e68f6db6cada6fd7c2de0344a4bfef3fffaddefde7dfe9b7bc2d3d83c98a09`。这不改变既有PID的已加载映像，不把后续磁盘文件哈希冒充原进程证明。本轮没有修改或构建native源码。

已用SIGINT停止自有主进程26556，host26634随之退出，未停止其他运行实例。交付状态分别为：**代码已修改、跟随候选实际已加载、该候选五按钮布局已确认、离线功能回归通过；OpenCode单次同窗聚焦通过采样，真实提示词按钮无闪烁尚未验收**。96分只对应方案及实现审查，不对应完整实窗验收。
