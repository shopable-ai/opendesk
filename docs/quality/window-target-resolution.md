# Window target 交付记录

## 实施范围

以 `db02cd29d00d955646981d426e4d5b484ac536d4` 为基线，向现有 Window facade 增加只读目标查询；不引入独立 Runtime、应用别名库或窗口句柄缓存。

| 文件 | 本轮修改 |
| --- | --- |
| `polyfills/003-window.js` | 复用 native Window.list / App.get 实现同步 list(target?)、异步 get(target) 和 wait(target, options?)。 |
| `types/window.d.ts` | 明确目标联合类型、等待选项、同步列表返回值与取消错误。 |
| `automation/recorder_actions.go` | 生成器调用公共 window.get；仅成功枚举后无匹配时允许唯一 executable-only 回退。 |
| `docs/api/window.md` | 公共参数、返回值、错误、平台边界与独立接口条目。 |
| `tests/runtime-api/window-target.js` | 独立目标查询与等待测试入口；使用实际 polyfill 源码与模拟 backend，提取实际生成器 helper 进行回归。 |
| `tests/human-to-recipe/coordinate-recipe.js` | 原有生成回放测试接入实际公共查询实现，不再只模拟旧 list 接口；断言结构化歧义错误。 |

## 有效决定

- `WindowTarget` 是查询条件，`WindowInfo` 是当前观察快照；不把录制 PID、handle、窗口 id 当作跨运行的永久身份。
- 一个 target 使用 `id/pid/app/exePath/exeName` 中至多一个身份字段，可叠加精确 title；title 可单独使用。不会猜测裸字符串的含义。
- `app` 复用已有 App target 解释及平台别名；`exePath/exeName` 精确匹配窗口元数据，不能误转为应用包路径/显示名称。
- `list()` 保持同步及无参数行为，返回 0..N 项；`get()` 要求恰好一个身份和几何有效的匹配。
- 先计数后验证唯一行，不能丢掉几何错误或 unresolved 行后假装唯一。负桌面坐标允许。
- `get()` 不隐式启动、聚焦、恢复、等待或放宽条件。旧动作 API 参数不变。
- `wait()` 只重试成功查询的空结果；backend 同名 NOT_FOUND、歧义、权限、几何错误均终止。超时/取消/完成均清理自有 timer 和监听器。
- 等待使用当前 Execution 的受管 timer。同步原生调用无法被 JS timeout 强制抢占；Runtime 销毁后不承诺 Promise 回调仍会执行。
- Recorder 的标题回退仍属业务恢复策略；未知 identityKind 明确失败，不默认解释成 exeName。

## 验证状态

本次任务为将变更直接提交现有远端分支。已进行源码与 Git 差异核对；**未在本轮运行测试、构建、lint、代码生成或真机桌面操作**。此前其他会话的测试数量与评分不作为本次提交的验收证据。

新 API 当前标记为 Experimental。测试文件存在不等于测试通过；模拟 backend 也不等于 macOS/Windows 真机通过。现有机器索引/总测试门禁未在本轮重新生成；新增专项入口需按下方命令单独运行。后续更新总索引时应从当前源码/类型重新生成，不沿用旧的 list Promise 声明。

## 后续验证入口

在仓库根目录，使用包含本次改动的 OpenDesk 构建：

```bash
./dist/opendesk -script tests/runtime-api/window-target.js -console-mode script
./dist/opendesk -script tests/human-to-recipe/coordinate-recipe.js -console-mode script
```

专项测试检查精确匹配、应用多 PID、参数拒绝、无匹配/歧义、负坐标、无效几何/身份、后台错误、等待期限、取消及资源清理、Recorder 回退边界。Recorder 组合测试仍使用合成录制文件并替换全部输入对象，不操作真实业务。

真机验收另需覆盖 macOS 和 Windows 可枚举范围、平台 App 名称解析、启动后窗口出现、窗口移动/关闭重建、同应用多窗口，以及真实生成/回放。尚未执行这些验证。

## 明确不包含

不扩展旧 focus/maximize/restore 等动作的 target 参数，不增加 window.resolve，不扩展 UI.within 或 Accessibility scope，不修改另一个 agent-to-recipe 工作流，不自动重新生成、覆盖或执行已有录制产物。

## 2026-09-10 增量：等待收尾与 UI.tapTexts 默认时序

上文保留最初 WindowTarget 提交的历史记录。以下是新的增量，不把历史未运行事项改写为已通过，也不继承其他会话的旧测试数量。

### 基线和范围

读取并合并基线：`2767724e278e23ccfeb4597e2aab625891725419`，tree `44c2593ae6e32b15e391fd606cb432b90a23b297`。相对旧方案基线的后续 Recorder 和 Custom UI 修改保留，不覆盖 `automation/recorder_actions.go`、`tests/human-to-recipe/coordinate-recipe.js` 或公共审查台账。当前环境仅有远端访问及隔离测试材料，没有用户本地工作树，不能判断其未提交修改。

用户明确要求直接写入，并要求普通 `await UI.tapTexts(['下一步', '确认'])` 可以使用默认参数。因此本批有明确的默认行为变化：默认 `intervalMs` 从 0 改为 300 ms，默认 `waitForEach` 为 true。不是无行为变化的兼容补丁。

| 文件 | 本批实施 |
| --- | --- |
| `polyfills/003-window.js` | Window wait 逐项清理；清理异常仍结算并保留 cleanupError；注册时取消后不再调度；观察前后检查 deadline。 |
| `polyfills/006-ui.js` | tapTexts 默认间隔/逐目标等待；signal；步骤快照；同一活动窗口绑定；输入前 guard；失败阶段和已完成前缀；不重试输入。 |
| `types/window.d.ts` | cleanupError 声明。 |
| `types/UI.d.ts` | OpenDeskUITapTextsOptions、默认值、scope 联合类型、signal、失败阶段及错误声明。 |
| `tests/runtime-api/manifest.js` | get/wait 登记和 unit 接入；保留新版 Recorder native-stop 入口；修正 UI 菜单文档路径与方法状态。 |
| `tests/runtime-api/window-target.js` | 复用已有 selected runner 的薄直接入口。 |
| `tests/runtime-api/unit/window-target.test.js` | 共享 Window 用例及清理/deadline 回归；精确声明方法覆盖。 |
| `tests/runtime-api/unit/ui-sequence.test.js` | 共享序列测试，包含省略 options 的默认行为。 |
| `docs/api/window.md` | 等待清理/期限合同；getFocusWindow 同步声明。 |
| `docs/api/desktop-ui.md` | 序列参数、默认值、结果对象、错误和示例；保留同一 UI 主文档。 |
| `docs/api/runtime-api.ai.json` | Window 查询和 UI 默认序列规则；其余对象的已有记录保留，不据此宣称重新验证。 |
| 本文件 | 追加本批证据、兼容影响和接续入口。 |

### 默认合同与取舍

`UI.tapTexts()` 默认间隔 300 ms、每步等待 10000 ms、轮询 200 ms。首步前和末步后不额外等待；每步预算从其间隔结束后开始，到输入开始前持续检查，不是整个批次总时长。

默认等待固定第一次解析的活动窗口 id/PID/title/可用 handle，仅接受同一窗口的新 bounds。明确 within 必须为已解析 WindowInfo，不接受 WindowTarget 查询条件。若流程打开另一个窗口，必须拆开调用、重新选择并核对，不能静默放宽目标。

只轮询成功零匹配观察；权限/截图/OCR、歧义、索引越界、身份变化或输入错误停止。文字可见不是 enabled 状态证明。只有实际业务后置条件验证通过才能宣称任务完成，不能把 completed 输入数量等同于成功保存/发送。

需要旧行为时用 `{ intervalMs: 0, waitForEach: false }`；Display/ScreenRegion scope 也要求显式关闭等待。未知字段/symbol 和非法时序在输入前拒绝，避免拼错参数被忽略。已有 UI 的其他等待方法不在这次改变默认值的范围内。

取消与 timeout 不强制撤回同步 native 工作。已经调用的输入不得自动重试。输入返回后才发现取消，该项仍在 completed 中。failedPhase 仅定位失败阶段，不表示失败动作肯定没有副作用。

### 本轮实际验证

在交付隔离目录中执行了以下宿主检查：

```text
node --check changes/polyfills/003-window.js
node --check changes/polyfills/006-ui.js
node --check changes/tests/runtime-api/unit/window-target.test.js
node --check changes/tests/runtime-api/unit/ui-sequence.test.js
node checks/run-isolated.cjs
```

上述 `changes/` 与 `checks/` 是本轮隔离材料路径，不是项目的新公开入口。结果：四份 JS 语法检查通过，54 个隔离检查通过、0 失败（31 个 UI 序列用例和 23 个 Window 用例；其中一个只是替身环境中的方法存在性检查）。测试加载完整 Window/UI polyfill；时钟、native backend、截图、OCR、mouse 和 Geometry 为替身。Recorder resolver 的 write-lines 已对照当前基线，但没有执行原生生成器。没有网络业务请求或实际桌面输入。

**未运行：OpenDesk Runtime、完整现有 UI 回归、catalog 全量合同 gate、原生 Recorder 生成组合、macOS/Windows 真机、实际权限与资源归零。** 新测试源码已经登记不等于这些验收已经通过。类型、文档和 catalog 的源码核对也不替代全量实际导出验证。

### 本地接续入口

先核对实际工作树、分支、HEAD/status/diff，保留已有修改；读取 AGENTS.md、docs/api/.rules.md 和 tests/runtime-api/README.md。使用当前源码构建并核对二进制路径、构建来源与 SHA-256，不能使用旧 dist 冒充新实现。

从仓库根目录先运行无需真实桌面操作的合同与组合用例。POSIX 示例：

```bash
./dist/opendesk -script tests/runtime-api/window-target.js -console-mode script
OPENDESK_RUNTIME_API_UNIT_FILTER=ui-sequence ./dist/opendesk -script tests/runtime-api/unit-selected.js -console-mode script
OPENDESK_RUNTIME_API_UNIT_FILTER=ui ./dist/opendesk -script tests/runtime-api/unit-selected.js -console-mode script
./dist/opendesk -script tests/human-to-recipe/coordinate-recipe.js -console-mode script
```

Windows 使用当前构建的 opendesk.exe 和 PowerShell 对应环境变量写法。固定 window-target 入口执行前应移除 OPENDESK_RUNTIME_API_UNIT_FILTER，避免与固定 scope 冲突。正式记录写入 `.runtime/tests/runtime-api/`，不提交日志/截图。

旧 `tests/runtime-api/ui.js` 包含原先 fail-fast 及固定观察顺序的 fixture；必须实际执行后区分默认变化与兼容回归。只为明确验证旧行为的用例设置显式旧选项；新默认必须继续由省略参数的用例验证，不能通过统一替身覆盖新默认来让测试变绿。全部 UI 原有方法仍要回归。

真机验收使用本轮创建或现有仓库自有、无真实业务的可见 fixture：同一窗口先显示“下一步”，点击后延迟显示“确认”，第二次点击后显示“完成”且计数恰好为 2。普通脚本必须原样执行 `await UI.tapTexts(['下一步', '确认']);`，事前核对 fixture 为实际前台窗口，事后从独立状态/界面读取最终结果并保存截图。再验证窗口平移、歧义、缺目标超时、取消后无后续输入。不能用 Node mock、直接触发 fixture 回调或旧二进制冒充真实 OCR/鼠标链路。

发现问题时按实现→类型→文档→索引→调用方→测试修到闭环；不得删除失败断言、扩大点击区域、默认取首候选、增加输入重试来掩盖错误。无目标平台或权限时明确列出阻塞，不自动更改系统设置或接触用户业务窗口。

### 后续未实施

通用 UI.waitText/UI.waitTextGone 的错误分类和取消合同、UI 所有读方法的窗口新鲜度、HTTP/axios 参数与头部问题仍待各自批次处理；本批没有声称完成整个公共 API 审查。

## 2026-09-10 增量：current-source Runtime 与 macOS 原生序列验收

本节记录对上一个增量的本地接续验证；不改写其隔离环境结论。验证机器为 macOS 12.7.6
x86_64。验收启动和构建时，工作树位于 `master`，HEAD 为
`f22750eff20db822aa3bae227aef01bb52608da1`，目标提交
`cbf16856c935dcec7b23779487a69bcd4b8c21ca` 是其祖先。fetch 后一度发现远端新增提交涉及已有
本地修改，因而没有冒险快进。原生验收结束后，共享工作树由并行会话推进并推送至
`1d5404e89bb4c1587566b11382b7dff8aed71d7d`；当前本地 `master` 与 `origin/master` 一致，目标提交
仍是祖先。`f22750e..1d5404e` 没有修改本批 Window/UI polyfill、类型、API Reference 或 catalog，
所以已验收二进制中的目标实现与当前 HEAD 相同。本会话没有切分支、reset、clean、stash、提交
或推送，也没有覆盖并行会话的修改。

### 构建来源

原 `dist` 早于目标提交，因此从当前工作树执行 `./scripts/build_macos_app.sh`，刷新成套的
OpenDesk.app 主程序、UI host 和 Apple Vision helper。最终主程序的 Go build info 记录
revision `f22750eff20db822aa3bae227aef01bb52608da1`、`vcs.modified=true`、Go 1.25.13、
darwin/amd64；ad-hoc bundle 通过 `codesign --verify --deep --strict`。

| 构建物 | SHA-256 |
| --- | --- |
| `dist/OpenDesk.app/Contents/MacOS/opendesk`（`dist/opendesk` 指向此文件） | `fcd28ca2c1536e004590f5d46fd1852e6c04839e76c7859f84be395105bdfabe` |
| `dist/OpenDesk.app/Contents/Helpers/opendesk-ui-host` | `f1f15c3274fe0a0d944ab9e20f7aa55ace7761adf126836aae79460b62b6c1c9` |
| `dist/OpenDesk.app/Contents/Resources/NativeExtensions/com.example.macos-vision/bin/native-ext-macos-vision` | `5882fe5170259a196e8489808f5766eb2a83c2f8b756f661b75bd6579af075ba` |

### Runtime 与一致性结果

以下命令均从仓库根目录使用上述当前源码构建执行，而不是 Node runner：

```bash
unset OPENDESK_RUNTIME_API_UNIT_FILTER
./dist/opendesk -script tests/runtime-api/window-target.js -console-mode script
OPENDESK_RUNTIME_API_UNIT_FILTER=ui-sequence ./dist/opendesk -script tests/runtime-api/unit-selected.js -console-mode script
OPENDESK_RUNTIME_API_UNIT_FILTER=ui ./dist/opendesk -script tests/runtime-api/unit-selected.js -console-mode script
./dist/opendesk -script tests/human-to-recipe/coordinate-recipe.js -console-mode script
OPENDESK_RUNTIME_API_MODE=contract OPENDESK_BINARY="$PWD/dist/opendesk" ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

结果依次为 23/23、31/31、42/42、7/7 与 contract 375/375，通过 catalog、类型声明、API 文档
索引和 Runtime 导出一致性检查。正式 contract 证据位于
`.runtime/tests/runtime-api/direct-20260910-014845-422000/`，catalog fingerprint 为
`fnv1a32:fad05d20`；四次直接专项运行的 Runtime 日志已汇总到
`.runtime/tests/window-ui-sequence-20260910/direct-runtime/`（原始自动日志仍位于对应
`.runtime/runs/direct-*/`）。

首次执行暴露的是测试 fixture/旧预期问题，不是通过删断言掩盖：

- `unit/ui-sequence.test.js` 的伪 display 缺少当前坐标映射所需的 pixel dimensions；补齐后默认
  序列 31/31 通过。
- `ui.js` 中明确验证旧 fail-fast 的用例改为显式
  `{ intervalMs: 0, waitForEach: false }`；默认序列用例仍省略 options，并按绑定活动窗口、每步
  新观察和输入前 guard 更新精确调用顺序。完整 UI scoped test 随后 42/42 通过。
- 目录审计发现 unit manifest 新增的 `window-target`/`ui-sequence` 尚无对应 `single/` 固定入口；
  按现有生成合同补齐两个只委托固定 ID 的 JavaScript 文件及 README 清单。随后
  `node scripts/audit_test_architecture.js` 通过，证据位于
  `.runtime/tests/test-architecture/audit.json`。

未修改 `polyfills/006-ui.js`、Window 实现、类型、API Reference 或 catalog：current-source
实现已经满足本批合同，必要修复只发生在过时测试预期和原生验收资产。

### macOS 可见 fixture 结果

新增的 `tests/runtime-api/ui-taptexts-native-macos.js` 使用仓库自有 AppKit fixture，每个场景先
核对精确 PID、可执行路径、窗口 id 和前台窗口，只允许 fixture 自行停止。最终完整运行命令为：

```bash
run_id="ui-taptexts-native-macos-final-$(date +%Y%m%d-%H%M%S)"; evidence="$PWD/.runtime/tests/ui-taptexts-macos/$run_id"; mkdir -p "$evidence/runtime-logs"; OPENDESK_UI_TAPTEXTS_EVIDENCE_DIR="$evidence" ./dist/opendesk -script tests/runtime-api/ui-taptexts-native-macos.js -console-mode script -timeout 300 -log-dir "$evidence/runtime-logs"
```

证据目录为
`.runtime/tests/ui-taptexts-macos/ui-taptexts-native-macos-final-20260910-020538/`，9 个场景全部
通过：默认无 options、显式 `within`/700 ms interval、显式旧模式、同窗平移、缺目标超时、
多候选、切换窗口、间隔取消、真实观察后取消。默认场景执行的调用文本原样为
`await UI.tapTexts(['下一步', '确认'])`；Apple Vision OCR 返回两项完成结果，fixture 独立状态为
`nextClicks=1`、`confirmClicks=1`，且 `confirmClickedAtMs` 晚于 `confirmShownAtMs`。最终又通过真实
OCR 确认“完成”可见，不只依赖返回对象。

开始、中间和完成截图分别为 `screenshots/default-start.png`、
`screenshots/default-middle.png`、`screenshots/default-complete.png`；人工检查未见裁切、异常拉宽、
大面积空白或控件错位。安全场景分别证明：超时/歧义没有点击，切窗没有转点新窗口，两个取消
时机没有后续输入；旧模式只完成首项并立即以 TARGET_NOT_FOUND 停止。所有 fixture 均
`fixtureStopped=true`。最终 `events.ndjson` cleanup event 的 timers、eventSubscriptions、
uiListeners、uiHostProcesses、promiseCallbacks、commandProcesses、workers 及其他受管资源字段均为 0。

本机窗口枚举的 AppleScript 快路径偶发 3 秒超时并安全降级到 CoreGraphics；一个早期平移场景因
单次截图约 11 秒超过 10 秒预算而失败，因此仅对非默认的专项场景把显式 timeout 调至 30000 ms。
默认无 options 场景保持每步 10000 ms 合同，并在两次真实运行中完成。该性能现象不改变默认值，
也没有通过扩大范围、选首候选、自动聚焦未知窗口或重试点击规避。

Windows 和 Linux 未进行目标系统 live Runtime 验证：当前只有 macOS 主机，且本轮按范围没有安装
VM、Wine 或平行 Runtime。它们不是本次 macOS 结论的一部分；若要验证，需要对应真机及平台权限。

最终静态复核还包括 `git diff --check`、fixture `Info.plist` lint、AppKit 源码在
`-Wall -Wextra -Werror` 下的 clang syntax-only、fixture JavaScript/unit JavaScript 的
`node --check`，以及 OpenDesk.app 的 deep/strict codesign 验证，均通过。
