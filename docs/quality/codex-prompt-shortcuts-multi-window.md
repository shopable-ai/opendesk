# 提示词快捷栏：多应用、多窗口兼容性修复

日期：2026-10-29；最后核对 22:08（本机时间）。

## 需求与版本边界

用户反馈 Codex 适配后 Claude / OpenCode 无法正常使用，要求多款 AI 桌面程序同时打开时，随当前前台精确窗口选择对应输入框，共用核心业务流程。最后确认本任务主要完成“位置、点击、多 AI 窗口适应”，不用等待另一任务的布局工作。保留其纵向展示全部启用提示词、栏高随条目增长的修改，不恢复旧五按钮分页；管理器、提示词库、原稿保护、不发送消息及 unknown 停止规则不变。本任务未修改 Runtime/native，也不覆盖另一任务的输入传输修改。

按用户确认，先在现有 `master` 提交本工具和对应测试/文档的检查点 **`6db7bf4adf46ad135bed56cee8ea31fa0ed04a5b`**，共 8 个文件，未推送。该检查点是恢复基线，不是功能验收通过。后续其他任务使 HEAD 更新为 **`c65848c246c516d111b8cd12b947f33a6cbc70a7`**；本任务没有再次提交或推送，`master` 相对远端 ahead 1。签名、权限、客服示例等其他改动未纳入本任务。

以下为该提交之上的增量修复；收口时未提交、未推送。没有 reset、切换或创建分支，也未处理其他任务的未提交改动。

**当前结论：代码和离线验证已完成；最新候选的多应用实窗位置、真实点击及同应用双窗隔离尚未完成验收。** 旧版本的截图、插入成功与本次只读预检分别记录，不能相互替代。

## 离线复现与定向修复

| 问题 | 修复 | 保护边界 |
| --- | --- | --- |
| 手工校准追踪器绑定旧 PID/handle/executable；切换到另一窗口后保留该追踪器，旧测量不断过期，导致新窗口快捷栏隐藏 | tracker 增加纯身份检查；切换到已有 selector/discovery 的 paste 适配时释放不属于当前窗口的手工测量，重新使用当前 profile | 仅依赖校准的未知/strict 应用仍需重新校准；同窗口移动、缩放继续重新测量；不把旧边界带到新窗 |
| 点击优先取缓存的 originalWin/profile；原生提示或轮询尚未到达时没有选择当前前台 | 点击先只读解析前台，应用/窗口变化时重新资格检查，再选择其独立输入模型与引用 | 输入 helper 仍逐动作核对精确窗口；没有激活记忆窗口，不向未配置应用输入 |
| 相同窗口标题改变，prepared ref 和 expectedWindow 仍包含旧 title，造成误拒绝 | ref 绑定同时包括精确 handle、title、应用身份、几何及场景签名；标题变化只让缓存失效 | 标题不作为选窗身份；同标题的多个窗口按 PID/native handle 区分 |
| 应用文本模型、查找深度与 selector 决策散落在主入口 | `targets.js.editorPolicy()` 集中返回 model、inputMode、selector/discovery、nativeRole 与 maxDepth；OpenCode 已知 bundle/executable 别名也不落入 plain | 这是示例内部适配，不增加公共 Runtime locator API；未知应用仍默认 strict，不据配置推定资格 |
| 自动模式的迟到 Claude 场景观察可能在关闭跟随后恢复旧绑定 | 自动选择和点击资格检查携带 followEpoch 失效守卫 | 过期结果不恢复场景；输入结果 unknown 的全局锁止不放宽 |
| 新增的只读前台检查失败可能被当成已输入但结果未知 | 仅该只读阶段返回 rejected / not_started，允许原有完整正文复制兜底 | 已派发的按键/粘贴及 release 失败继续沿用 unknown 锁止，不重试 |
| Claude“新窗口中的新会话”没有主工作区的 heading/Primary pane，旧场景规则不认识该独立 Code 窗口 | 增加同一 WebArea 内的匹配 heading、唯一 Prompt，以及 Environment/Folder/Permissions/Model/Usage 五组专属控件判据 | 不仅凭标题、应用身份或普通 text area 放行；缺失、重复、disabled、跨文档或混入主 pane 的反例仍拒绝；尚未取得最新候选的有效双窗实测 |

最先加入的跨应用/换窗校准与点击重选四项测试在旧代码上全部失败，修复后全部通过。另加入标题更新、前台读取超时恢复、迟到资格检查以及适配策略的测试。原有“strict 新 handle 必须重新校准”测试原样通过，没有为修复降低其断言。

## 配置限制与实际故障分开

- `settings.appBundleId` 非空原本就意味着单应用覆盖，不静默清空用户选择；多应用自动模式须留空。
- `OPENDESK_SHORTCUTS_TARGET_CONFIG` 替换默认目标范围。一个 `scope` 仅观察其明确 PID；三款应用同时使用应放入同一个 `scopes`，同进程的多个窗口无需重复 PID。
- 实窗使用独立合成库与三个已核对 PID/executable 的 scopes，没有读写生产用户库。不能据此断言用户普通配置的现场原因，也不能把隔离结果当成无配置命令通过。

## 验证与证据

从仓库根目录 `/Users/shopme/Documents/workspace/opendesk` 执行：

```bash
OPENDESK_BROWSER_MODEL=/Users/shopme/Documents/workspace/opendesk-browser/examples/sidebar-tools/prompt-shortcuts/trusted/model.js node --test --test-timeout=10000 --test-reporter=tap tests/custom-ui/codex-prompt-shortcuts.test.cjs tests/custom-ui/codex-prompt-insert.test.cjs tests/custom-ui/codex-prompt-targets.test.cjs tests/custom-ui/codex-prompt-storage.test.cjs tests/custom-ui/codex-prompt-browser-compat.test.cjs
```

22:08 固定候选的结果为 **569 项通过、0 失败、0 取消、0 跳过**。正式 Browser model 是本机已有依赖，未安装工具；源码、测试与二进制在本次回归前后指纹一致。定向 `git diff --check` 通过。

新增整合用例执行真实 `main.js`、`targets.js`、`insert.js`，只替换原生依赖和内存剪贴板：三款应用各两个同名窗口，覆盖自动识别和显式 scopes 两种模式；交替在同步后点击及通知前点击，逐个窗口核对完整原稿加正文、不同应用查找深度、返回原窗口、无关前台拒绝、同一快捷栏复用及最终全部引用释放。已有 Claude/OpenCode 的空稿、选区、Unicode、IME 拒绝、unknown 单次派发与数据/备份兼容回归继续通过。

这些是 Node 依赖模拟，**不是**当前三款桌面 UI 或 OpenDesk Runtime API 实测。早期证据位于 `.runtime/tests/codex-prompt-shortcuts-multi-window-20261029/`：

- `regression.tap`、`regression-r2.tap`：中间候选的完整结果，不覆盖为最终证据。
- `regression-final.tap`：早期 546 项输出，不是当前候选结果。
- `candidate.sha256`、`incremental.diff`：该早期候选指纹及增量。

后续证据位于 `.runtime/tests/prompt-multi-app-live-20261029/`：

- `regression-resume-final.tap`：旧五按钮候选 556/556。
- `regression-v3.tap`：纵向列表、剪贴板粘贴候选 558/558。
- `regression-v4-current.tap`：传输切换中加载了不一致的源码/测试，564 pass、1 cancelled（timeout），不是通过。
- `regression-v4-current-02.tap`：并行测试更新期间 566 pass、3 fail（通知 fixture 断言），不是通过；没有删除失败记录或放宽业务断言。
- `regression-v5.tap`、`v5-candidate.json`、`v5-regression.json`：最新 Unicode 输入候选 569/569 及前后相同的指纹。通知 fixture 的修正来自另一任务，本任务未覆盖其修改。

## 实际构建与加载

最新已核对开发构建来源是 `.runtime/tests/prompt-shortcuts-scroll-20261029/build.log` 与 `provenance.json`，生成时间约 21:31。主程序的 Go build info 为 `c65848c246c516d111b8cd12b947f33a6cbc70a7 +dirty`、darwin/amd64/cgo；构建使用固定开发签名身份 `6A3487D1D884CA77AB04B380E0186E23F8E1EE39`。本任务约 21:37 执行 `codesign --verify --deep --strict --verbose=2 dist/OpenDesk.app` 通过；22:08 二进制哈希未变，没有为本任务重建或重签名。

| 文件 | SHA-256 |
| --- | --- |
| `dist/OpenDesk.app/Contents/MacOS/opendesk` | `87276091384883f8eb132bae733e881db2ae571bc4180ea8b49903a55222f5b0` |
| `dist/OpenDesk.app/Contents/Helpers/opendesk-ui-host` | `3fe00561a1fdfffaa0e2d0c295517d752961dabdeee39e0b8da2096a8d974b35` |
| 当前 `main.js` | `1446cb17a17142b84a9259b652455f3262ff82f333ff253a3451e9167b3c3d24` |
| 当前 `targets.js` | `482081be29e6587e415960a12cd1703fcc8d4a47e87b52b3f2bc792fc6c81763` |
| 当前 `insert.js` | `b01310f9fbb26ce56fc417e3d87e91575054a78399d74955691fe48a8e964eb9` |

旧 `toolbar-03` 的实际加载脚本为 `main.js=4c70aa83…`（完整哈希见 `v3-stop-summary.json`），已确认三个 scoped watchers 及 Codex 跟随回执；其控制器未执行。该 execution 在 21:32 以 `canceled` 结束，时长 120662ms，原因未确认，不能称为 crash 或默认 30 分钟超时。

随后另一任务的同入口实例 PID 3115 / host 3187 使用相同旧脚本，实际仍加载本任务合成库和三个 scopes。用户允许复用后，本任务只做无输入预检；该进程最终记录为 **30 分钟 timed_out**（21:32:14–22:02:12，1800116ms），不是本任务结束。该终态不能与 `toolbar-03` 的 canceled 混为一谈。

22:08 观察到另一任务再次启动 PID 52513 / host 55629，入口日志为 `.runtime/tests/prompt-shortcuts-no-clipboard-20261029/business/`，加载最新 `main.js=1446cb17…`、另一独立库和 **仅 OpenCode 的 scope**。它不覆盖本任务三应用验收；本任务未结束或接管该进程，也未再启动第二份快捷栏。所有 PID/handle 仅为当时观察，后续必须重核。

## 实窗结果按候选分开

### 历史剪贴板粘贴候选

`accept-cross-app-console.log` 和 `accept-cross-app-02-console.log` 保留 Codex、Claude Code、OpenCode 每款两次 A/B 真实提示词按钮输入，共六次；有独立全文 Copy 的逐字相等结果及对应窗口截图，并检查跨应用返回后的正文。旧 `cross-app-results.json` 曾被覆盖，不作为六次汇总的权威证据。

这些成功只覆盖当时每应用一个窗口，不证明同应用双窗草稿隔离。OpenCode 成功前曾预加合成空格，**不证明原始 U+200B 空框可写**。旧额外 C/D 回调来源未明，未计通过、未清理草稿；21:04:55.932 / 21:04:59.695 Claude 的“试一/试二”回调后来由用户确认为手动点击，来源疑问已解决，但不计自动验收。

### 本次恢复预检（新增提示词点击 0 次）

用户明确同意独占桌面并复用旧实例后，执行 `v4-readonly.js`，结果见 `v4-baseline.json`：

| 专用测试窗 | 当前只读结果 | 输入资格 |
| --- | --- | --- |
| Codex `176293` / `176296`，PID 12898 | 精确窗口可刷新；两窗 AX 全文均为 `随心输入\n`、选区 `{0,0}`，与上次基线相等 | 仅具备后续预检基线；未证明写后另一窗不变 |
| OpenCode `176299` / `176307`，PID 44197 | 两窗全文均为 U+200B，未变；`textInputState` 为 `BACKEND_FAILED / phase=read / actionState=not_started` | 不准输入；可计划真实按钮安全拒绝，但本次尚未执行 |
| Claude `170731` / `176067`，PID 42296 | CG 窗口刷新后，精确 AX 观察仍为 `STALE_TARGET` | 停止；不凭旧截图、同标题或 native ID 继续输入 |

`v4-preflight` 已通过应用窗口切换到 Codex 专窗，随后 host application AX 树因菜单 `unmaterialized` 标记不完整而停止；没有忽略完整性检查或点击。只读诊断另取得当时栏的 60×280pt AX 边界和 logo＋四个真实提示词按钮名称；不是完整视觉或位置通过，也不是分页栏。`window.list({pid:host})` 因 layer 3 过滤返回空，不能当作栏不存在。

精确 CG/AX 窗口观察的替代预检仍未运行：下一次执行前源码守卫发现 `main.js` / `insert.js` 已被另一任务改为 Unicode `keyboard.type`，旧实例同时已到运行上限。`v4-preflight-02` 在任何提示词点击前停止。没有重放、没有清理草稿；`v3-controller.js` 也始终未执行，不能按旧 host/native ID 直接运行。原始停止证据见 `v4-stop-summary.json`、各 preflight 的 summary 和诊断树。

最新 `insert.js` 已改用 Unicode 输入，保留兼容配置名 `inputMode:'paste'`；这项输入传输变更由另一任务负责。此前 `VERIFIED_PASTE` / `PASTE_OBSERVED` 的实窗结果不自动变为新版 `VERIFIED_TEXT` / `TEXT_OBSERVED` 资格。

## 交付状态与剩余实窗验收

| 层次 | 本轮结论 |
| --- | --- |
| 代码已修改 | 是；窗口绑定生命周期、点击前重选、集中 editorPolicy、独立 Claude Code 场景及测试保留；未回滚并行布局/输入改动 |
| 实际已加载 | 旧三应用粘贴候选和纵向列表候选已加载；最新输入候选由另一任务加载到 OpenCode-only 实例，不算三应用加载验收 |
| 视觉已确认 | 历史三应用截图存在；当前候选没有完整无 tooltip 的多窗口/移动/缩放截图，未通过 |
| 功能已验证 | 最新候选 569 项离线通过；历史六次跨应用输入通过；当前候选同应用双窗隔离及真实按钮未验收完成 |
| 普通无配置一行命令 | 未验收；隔离库与 explicit scopes 不能替代 |

本次恢复未发送消息、未按 Enter、未全框 setValue、未预加空格绕过原始空框、未读取或改写生产提示词库、未清理任何草稿；未提交或推送。

后续只补核心缺项：

1. 固定一个不再修改/重启的三应用候选，确认桌面独占及唯一业务实例；不接管其他任务的 scope 或旧回调计数。
2. 重核专窗身份、全文、选区及全体真实按钮；Claude stale 目标先重新认识，不能复用旧资格。
3. Codex 逐次真实按钮输入、独立全文及另一窗口不变检查；OpenCode 原始空框保持原状，仅验安全拒绝，不能称可写。
4. 补切回、移动/缩放、管理器开关、无关前台隐藏/返回及移开指针截图；未知输入、额外回调、身份或候选变化立即停止。
5. 普通 README 无配置一行命令单独验收，不拿隔离启动代替。不得以“已启动”“源码通过”或历史截图声称核心实窗交付完成。
