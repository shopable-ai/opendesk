---
title: "人工 Recorder｜实施与验收计划"
description: "当前 Recorder 实施状态、分层命令、证据、未运行项目与下一批语义交接。"
order: 30
---

# 人工 Recorder｜实施与验收计划

状态：Recorder 数据合同 v2、合成文件闭环、macOS Calculator 真实 native capture／按钮语义、用户 simple console 录制包独立回放／业务 oracle，以及该录制包的可维护语义优化 recipe 已实施并验收，2026-09-10。当前工作树另已实现仓库内 human-to-recipe Skill、最小 `SemanticBuildPlan` schema／validator、Calculator plan golden 和 simple console 的去正文提示词交接；通用 renderer、用户级 Skill 安装、当前生产 hash 的 live Gate 和视觉验收均未实施或未运行。旧 hash 的 live 证据不能自动转移。本文只记录当前工作树的真实完成与验收边界；H1—H8 完整作业仍以 [任务分解](task-decomposition.md) 为准，DQ-01—DQ-08 规范性决定和唯一技术方案见 [Recorder 工程设计](recorder-design.md)。

## 1. 本轮验收目标

本轮基础链固定为：明确本地授权 → libuiohook native 事件 → hover 降噪 raw writer＋动作上下文 resolver → 独立 stop → `Recorder.buildActions()` → 独立 `Recorder.generateScript()` → 窗口／显示器相对 basic JS → 另一次明确授权回放和独立结果核对。

实现和测试不能把下列事项合并为一个“录制成功”：

1. listener 是否真实就绪并属于当前 execution；
2. stop 是否确认 callback 退出并保存已接收事件；
3. raw／manifest 是否完整可校验；
4. actions 是否 ready；
5. basic candidate 是否生成且未覆盖旧文件；
6. candidate 是否在独立 invocation 实际运行；
7. fixture 业务结果是否由独立 oracle 通过。

当前 1—5 已在 macOS Calculator fixture 完成真实 listener、动作级窗口上下文、按钮标签语义和文件链验收；用户提供的 simple console 录制包 `rec-20260909T113509.231387000Z-e2232547fa4e` 另已完成 6、7 的独立真实回放与显示值 `115` 业务 oracle。早先专用 pause/resume gate 生成的 candidate 仍未单独回放，不能把新包的资格转移给它。合成 raw 和替身执行不标作真人输入，Calculator evidence 分别保留真实 native capture、用户录制和受控回放来源。

### 1.1 数据质量门槛

本轮使用固定 100 分量表，结果为 **98/100**，达到用户要求的 95 分门槛。评分维度固定为输入降噪 15、动作完整性 15、应用／多窗口身份 20、坐标迁移 20、控件语义与隐私 15、fail-closed 生成 10、文档／兼容／验证 5。扣 1 分是 basic 尚未把 AX 证据自动提升为通用 locator；另扣 1 分是 Windows/Linux 目标系统 live 未运行。详细量表和可清理运行证据见 [Recorder 数据质量 v2 验收](../../../docs/quality/recorder-data-quality-v2.md)。

## 2. 实际工作包状态

| 工作包 | 当前状态 | 实际成果 | 未完成或未运行 |
| --- | --- | --- | --- |
| WP0 源码和规则核查 | 完成 | 核对 Runtime 初始化、polyfill 顺序、File/path、mouse/keyboard/window/display、execution 生命周期、Agent MCP Recorder 和下游现有方法 | 无附件包可读取；未声称读取不存在附件 |
| WP1 native capture owner | 已实施，macOS live 通过 | libuiohook 1.2.2、单 adapter、process lease、真实 ready、desktop capture、button-held-only motion policy、bounded event/context queues、deadline、stop/drain、manifest、resource counts | Windows 真实 listener、X11 live |
| WP2 动作上下文与 actions | 已实施并通过合成与 macOS live | application/window/element 分层；稳定应用身份与瞬态 PID/handle 分离；窗口 offset/ratio；AX point-hit＋最多 6 层 actionable ancestor；fixed raw/hash、唯一 grouping、pause boundary、revision、disposition/readiness/issues | 键盘 focused-element 语义、Windows/Linux target semantics live |
| WP3 basic JS 生成 | 已实施；原版本隔离／用户回放通过，Geometry 收敛版正式 JavaScript 合成 Gate 通过 | 每动作用 `window.get` 重新解析当前应用窗口；同应用多窗口无歧义门；以 `Geometry.pointOffset/contains` 按新 bounds＋offset 重算并用 tagged point 输入；strict actions/hash、白名单 JS、candidate、exclusive create、替身执行 | 语义 locator、resize/layout adaptation、窗口解析到动作提交的原子性；旧 candidate 资格不转移给新生成源码 |
| WP4 正常用户入口 | 已实施；新增提示词按钮仅合成通过，当前 UI 视觉未重跑 | `record.js` 快捷键；完整和 simple 原生控制台；simple actions ready/blocked/generation-error 均可复制去正文 Agent handoff；Calculator 既有真实 listener、制作、生成和用户包独立试运行 | 本次六按钮工具条 live／视觉；完整 Custom UI 的人工业务采集；其他 candidate 的真实回放 |
| WP5 下游语义增强交接 | 最小可复用链已实现；renderer 未实现 | 仓库内 Skill、schema、source-check validator、Calculator plan golden；human lineage 的 disposition／Episode／target／gate 分层；AX 标签只作证据 | 用户级 Skill 安装、通用 renderer、focused-element、显式 target-crop OCR、第二个应用的 human golden |

## 3. 正常用户命令

全部命令从仓库根目录执行。

macOS 的交互录制：

```bash
./dist/opendesk -allow-recorder-capture -script examples/human-to-recipe/record.js -console-mode script
```

F8 在获准非敏感 fixture 前台时开始；F9 由示例串行 UI 根据状态调用显式 pause/resume；F10 stop 并制作 actions；只有 `ready` 时 F11 生成；F12 不生成结束。关闭 execution 或 Ctrl+C 触发 native owner stop。该命令不回放。

macOS 的原生窗口录制入口：

```bash
./dist/opendesk -ui -allow-recorder-capture -script examples/custom-ui/recording-console.js -console-mode script -log-dir .runtime/examples/custom-ui/recording-console
```

点击开始后的倒计时用于选择起始窗口；PID＋title 只保存为 provenance，不会冻结采集范围。
暂停／继续分别分派到公开 `session.pause()`／`session.resume()`，用户可在任意窗口继续；录制期间可自由切换窗口和应用。
停止保存后自动制作 actions，生成仍需另一次明确点击且不回放。取消或关闭窗口是用户显式停止路径，只沿 native lifecycle 停止并保留可用事实。

macOS 的简化原生工具条入口：

```bash
./dist/opendesk -ui -allow-recorder-capture -script examples/custom-ui/recording-console-simple.js -console-mode script -log-dir .runtime/examples/custom-ui/recording-console-simple
```

该入口停止后自动制作 actions 和生成普通 JS，但仍不会自动回放；回放按钮需要独立点击。开始时使用 `target-semantics`，普通 hover 不写 raw，动作可跨应用／窗口并分别解析上下文。

Windows 的交互录制：

```powershell
.\dist\opendesk.exe -allow-recorder-capture -script examples\human-to-recipe\record.js -console-mode script
```

Linux/X11 native adapter 已接线，但当前 `record.js` 的 F8/F9 控制面依赖仅支持 macOS／Windows 的 `globalShortcut`，因此本轮没有把该示例命令宣称为 Linux 用户入口。Wayland 全桌面采集不支持。

独立生成：

```bash
OPENDESK_RECORDER_ACTIONS_FILE=.runtime/recordings/<ID>/actions.json ./dist/opendesk -script examples/human-to-recipe/generate.js -console-mode script
```

```powershell
$env:OPENDESK_RECORDER_ACTIONS_FILE='.runtime\recordings\<ID>\actions.json'; .\dist\opendesk.exe -script examples\human-to-recipe\generate.js -console-mode script
```

生成后只在另一次明确回放授权和已恢复测试起点下运行：

```bash
./dist/opendesk -script .runtime/recordings/<ID>/generated/basic.recipe.js -console-mode script
```

回放命令 resolve、进程退出或 mouse/keyboard API 成功都不是业务成功；必须另查 fixture 约定状态。

## 4. 分层测试

### 4.1 无桌面副作用的 native 白盒

```bash
go test ./automation -run '^TestRecorder' -count=1
```

覆盖私有 backend/writer seam：ready、重复 stop、截止后 late callback、积压排空、下一次 start、context cancel、queue overflow、Write／Flush／Sync／Close／manifest 失败、process lease、普通 hover 过滤、button-held motion 保留、动作级窗口上下文和 click/text/drag/control/composition 边界。不调用真实 hook。

### 4.2 Runtime 公共面

```bash
./dist/opendesk -script tests/runtime-api/recorder.js -console-mode script
```

覆盖：全局对象、`none/target-semantics` 能力、未授权 start 无 side effect、无 capture 权限仍能 build/generate、recording/actions v2、窗口和语义状态、实际 raw 文件重读、manifest/count/cutoff/display 交叉校验、revision、strict schema、candidate/hash、二次生成拒绝。该命令不加 `-allow-recorder-capture`，因此不会监听桌面。

正式 selected 入口：

```bash
OPENDESK_RUNTIME_API_MODE=unit-selected OPENDESK_RUNTIME_API_UNIT_FILTER=recorder ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

另有 `pkg/execution/recorder_runtime_api_test.go` 通过现有 Goja execution host 注入私有内存 backend，覆盖真实 `start → status → 并发 stop → buildActions` 句柄链和清理；普通 Runtime 不暴露事件注入方法。

### 4.3 actions 与生成反例及隔离执行

```bash
./dist/opendesk -script tests/human-to-recipe/coordinate-recipe.js -console-mode script
```

覆盖：窗口从 `(0,0)` 平移到 `(100,80)` 后 click 从 `(20,30)` 重算为 `(120,110)`；同应用两个同标题窗口在输入前拒绝；另覆盖 CLICKED 唯一消费、drag 不降 click、double/control-click、缺 release、composition、相同 timestamp 按 source sequence、伪造几何、悬空 ref、缺失 disposition、错误 basis、empty text 和额外 args。生成代码在同一 OpenDesk Runtime 内替换 `System`、`window`、`mouse` 和 `keyboard` 全部入口后执行；不会触达真实桌面。

### 4.4 Custom UI 合成状态机与实窗证据

```bash
OPENDESK_RUNTIME_API_MODE=custom-ui ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

正式 JavaScript 测试使用真实 Custom UI host、ControlHandle 点击和窗口截图，但注入合成 Recorder
fixture，因此不会启动 libuiohook。它覆盖准备、录制、暂停／继续、停止、保存、actions、显式生成、
按钮防重入、部分保存／blocked、启动过程中关闭的唯一 stop，以及 `verification: "not-run"`／零回放。
证据写入 `.runtime/tests/runtime-api/<run-id>/runtime-logs/custom-ui/floating-toolbar/recording-console/`。

### 4.5 macOS 计算器真实 pause/resume

从仓库根目录显式授权一次性、非敏感、可恢复的系统计算器 fixture：

```bash
OPENDESK_RECORDER_CALCULATOR_CONFIRM=authorized-calculator-fixture ./dist/opendesk -allow-recorder-capture -script tests/runtime-api/recorder-native-calculator-macos.js -console-mode script
```

该 JavaScript gate 先用 Accessibility 树验证 PID、窗口与按钮，再用 `mouse.click()` 产生真实全局输入。Calculator 从 `0` 依次显示 `9 → 98 → 987`：`9` 在 recording、`8` 在 paused、`7` 在 resumed。断言普通 move 被 filtered、raw 只有一对相邻 pause/resume 边界、Actions 只有 `9` 和 `7`，两个动作都带 `semanticStatus: "verified"`、`role: "button"`、对应名称与 `AXPress`，并生成保持 `verification: "not-run"` 的 candidate。截图和摘要写入 `.runtime/tests/human-to-recipe/calculator-live-*/`；不会回放 candidate。

### 4.6 架构与文档检查

```bash
node scripts/audit_test_architecture.js
node --test tests/test-architecture/layout.test.js
git diff --check
```

修改 Runtime catalog 后还应运行对应 catalog／selected gate；运行证据落在 `.runtime/tests/runtime-api/`。公开示例只有从根目录原样运行文档命令后才能标通过。

### 4.7 平台 build

当前主机已用 `bash scripts/build_macos_app.sh` 刷新主程序、配套 UI host、status helper 和签名 app bundle，且 `codesign --verify --deep --strict` 通过。最终 Recorder Go 源码时间早于 19:29 app/host 构建时间；Custom UI 的脚本从当前工作树按入口加载。Windows 与 Linux 目标机 CGO toolchain/headers 当前不存在，目标平台 package 和 live 均标未运行。本轮不自动下载编译器、VM、Wine 或系统镜像；cross build 不能写成目标系统 live。

### 4.8 2026-09-09 当前证据

| 层 | 结果 | run-scoped 证据／说明 |
| --- | --- | --- |
| macOS bundle | 通过 | `bash scripts/build_macos_app.sh`；`OpenDesk.app/Contents/MacOS/opendesk` 与 UI host 于 19:29 从当前源码刷新并 ad-hoc codesign |
| Go Recorder＋execution owner | 通过 | `go test ./automation ./pkg/execution`；只出现 vendored libuiohook 的既有编译 warning |
| Runtime direct | 8/8 通过 | `.runtime/runs/direct-20260909-192935-169000/`；未授予 capture，不启动 listener |
| 坐标迁移／多窗口歧义／strict generation | 6/6 通过 | `.runtime/runs/direct-20260909-192936-786000/`；验证平移重算和歧义零输入 |
| 测试架构审计 | 通过 | `.runtime/tests/test-architecture/audit.json`；所有当前 Go tests 已分类，禁止公共调用未出现 |
| simple console 公开命令与视觉 | ready 和实窗视觉通过 | 从仓库根目录原样启动；`.runtime/tests/human-to-recipe/ui/recording-console-simple-current.png`；截图后 Ctrl+C 清理，所以 execution 为预期 canceled，不冒充完整交互通过 |
| macOS Calculator 真实 native capture＋受控输入 | 通过 | `.runtime/tests/human-to-recipe/calculator-live-1788953384136-direct-20260909-192943-906000/`；现场包 `rec-20260909T112946.465966000Z-112176b826ec` 为 `stopped/saved`、actions `ready`、issues 空；按钮“9”／“7”语义 verified，暂停“8”未进入 raw/actions |
| 用户 simple console 真实回放／回放后业务 oracle | 通过 | 包 `rec-20260909T113509.231387000Z-e2232547fa4e`；独立 candidate execution `direct-20260909-201420-726000` 成功，随后新 invocation 读取 AX display=`115`；证据见 `.runtime/tests/human-to-recipe/recording-replay-rec-20260909T113509.231387000Z-e2232547fa4e/`。candidate 文件仍原样声明 `verification: "not-run"`，资格记录不回写生成物 |
| 精简生产 recipe 用户命令 | 完成，不冒充 oracle | 根目录原样命令 execution `direct-20260909-211128-373000`，recipe SHA-256 `ef1b71093324ab2f1f0792ed07785eb6bbf70717f94033f78290f6bfa1ced051`；只输出 `[DONE]`，没有逐步 assert 或 evidence 写入 |
| 独立语义资格测试 | 通过 | execution `direct-20260909-211144-186000`；`.runtime/tests/runtime-api/calculator-115-qualification-direct-20260909-211144-186000/result.json` 固定 source actions hash、当前 recipe hash、13 个 display transition 和最终 `115`，`before.png`／`after.png` 实窗证据完整 |
| 本线程 A.1 Recorder 正式 JavaScript 合成 Gate | 8/8 通过 | `.runtime/tests/runtime-api/direct-20260909-230816-233000/`；在并行单元用例最后更新后重跑，覆盖 `window.get` fail-closed 解析、Geometry offset／contains、tagged `mouse.clickPoint` 生成，未启动 listener 或真实输入 |
| 本线程 human-to-recipe 合成命令 | 6/7，整套未通过 | `.runtime/runs/direct-20260909-224957-170000/`；Calculator production/golden 冻结和 Geometry 平移／越界／歧义用例通过；唯一失败是并行新增 straight-drag 行为已返回 ready，而旧用例仍期待 `drag-unsupported`，不把部分通过写成整套通过 |
| 本线程 Calculator 新生产源码静态冻结 | 通过 | production 与 golden 字节一致，SHA-256 `751d25b682c9d1591507cddacee298a51d298ef9658d6c8b03e96a996c8a7e96`；Gate 固定该 hash 并 instrument／执行实际生产源码，不维护第二份点击序列 |
| 本线程 Calculator 新生产源码普通命令 | 未运行 | 本线程没有获得或触发真实 Calculator 桌面动作；旧 hash 的普通命令结果不转移 |
| 本线程 Calculator 新生产源码资格 Gate／视觉 | 未运行 | 没有运行显式授权的 live Gate，也没有产生当前 hash 的新窗口截图；旧 `before.png`／`after.png` 不作为本版本证据 |
| human-to-recipe Skill／schema／validator | 静态与单元通过 | `quick_validate.py` 通过；`node --test tests/human-to-recipe/semantic-build-plan.test.js` 为 7/7；Calculator plan 以 `--check-source` 重新读取实际 actions 并得到 `valid=true`、`productionReady=true`、`sourceChecked=true`；renderer 明确未实现 |
| simple console Agent 提示词 synthetic | 通过 | `./dist/opendesk -script tests/runtime-api/recording-console-simple.js -console-mode script`；execution `direct-20260910-002458-864000`，fake clipboard 三场景各调用一次，未启动 listener／真实输入或系统剪贴板写入 |
| 本次 six-button simple console live／视觉 | 未运行 | 未启动公开 `-ui -allow-recorder-capture` 命令，未刷新或核对新的主程序／UI host provenance，也未产生当前六按钮截图 |

用户提供的旧包 `rec-20260909T102712.649528000Z-a299028412fa` 是 v1：70 条 raw 中 67 条为普通 move、只有一组 click，且 `scope-changed` 令状态为 failed。它用于证明问题基线，不计作 v2 通过证据，也不会被原地改写。

### 4.9 用户录制包的独立回放接续方案

用户于 2026-09-09 提供 `rec-20260909T113509.231387000Z-e2232547fa4e/actions.json` 作为后续执行输入。接续前固定读取实际文件，而不是沿用 UI 内存：该包为 `opendesk.recorder.actions/v2` revision 1、readiness `ready`、issues 为空，actions SHA-256 为 `9238fad978581a6f6308b931dd91cd5ced76ad2d2f892f5ebf0965b3143c9574`；12 个 click 均属于系统 Calculator 的唯一窗口并带 verified AXButton 名称。按标签解释出的示范序列是 `AC → 25 × 4 = → + 20 → − 5 =`，本次冻结的预期显示值为 `115`。这是根据录制事实得到的本次 fixture 解释，不上升为通用业务规则。

本包采用下列最小、可审计的三 invocation 方案，不新增 Replay Runtime，也不修改生成文件：

1. 独立预检只读当前 Calculator：确认可执行路径和标题唯一、窗口尺寸仍为录制时的 `232×321`，并按录制 AX identifier 确认每个目标仍唯一、可调用且包含对应窗口内点击点；数字和运算符还需保持原名称。首个清除键的 `AC/C` 名称随当前 Calculator 状态变化，不作为固定前置条件，由相同 identifier、位置和可调用性确认后用该动作恢复起点。尺寸或语义不一致时不发送输入。
2. 从仓库根目录原样运行 `.runtime/recordings/rec-20260909T113509.231387000Z-e2232547fa4e/generated/basic.recipe.js`。candidate 的第一个动作是 `AC`，因此它负责恢复本次计算起点；仍须保留其 OS、唯一窗口和窗口内 offset fail-closed 检查。
3. candidate 退出后用新的只读 invocation 重新取得 Calculator AX display，独立断言规范化值严格等于 `115`。命令退出 0 只证明脚本调用完成，不能替代这一步业务 oracle。

预检、回放命令输出和 postflight oracle 摘要统一写入 `.runtime/tests/human-to-recipe/recording-replay-<run>/`。raw、actions、`basic.recipe.js` 和 `basic.candidate.json` 保持不可变；本次资格另写 run-scoped summary，不把 candidate 内原有的 `verification: "not-run"` 原地改成通过。只有 actions/hash、预检、独立 candidate invocation 和 postflight `115` 全部成立，才把这个录制实例记为通过；任一项不成立都停止并保留明确失败。

实际执行结果：前两次只读预检分别因 Calculator 未处于前台、清除键动态名称不能固定而 fail closed，均未启动 candidate 或发送输入。规则按上文修正后第三次预检通过；candidate execution `direct-20260909-201420-726000` 使用脚本 hash `6c06db8ebc0ab3931c0a76e0e7655d6aba790d53c1d7cb401d7a720df8cdbe7e`，43.899 秒后 exit code 0；新的 postflight invocation 读取 display=`115` 并保存实窗截图，故本录制实例通过。运行期间 `window.list()` 多次出现 AppleScript 3 秒超时并明确降级到 CoreGraphics，造成时延但未改变窗口唯一性或结果；这是后续性能诊断项，不把它误报为本次功能失败。

### 4.10 生产自动化、资格测试与证据分层

本录制包的语义交付固定分为三层，不能再由一个日常 recipe 同时承担执行、测试和取证：

| 层 | 正式位置 | 责任 | 明确不负责 |
| --- | --- | --- | --- |
| 生产自动化 | [`examples/human-to-recipe/calculator-115.semantic.recipe.js`](../../../examples/human-to-recipe/calculator-115.semantic.recipe.js) | 表达 `AC → 25 × 4 = → + 20 → − 5 =`；只保留平台、目标窗口、录制布局、前台身份和 PID-scoped AXPress 所需的安全门禁 | 不逐步断言显示值，不实现独立 oracle，不写测试 evidence，不把“已发出动作”打印成 `[PASS]` |
| 资格测试 | [`tests/runtime-api/calculator-115-semantic-recipe-macos.js`](../../../tests/runtime-api/calculator-115-semantic-recipe-macos.js) | 只在显式授权的 macOS Calculator fixture 上冻结来源与生产源码 hash，instrument 实际生产源码的 native 动作边界，并核对按钮 AX identity、每一步 display transition、最终 `115` 和截图 | 不是普通用户命令，不作为 recipe 的运行时依赖，不用第二份点击流程冒充正式文件已测 |
| 来源与运行证据 | `.runtime/recordings/rec-20260909T113509.231387000Z-e2232547fa4e/` 与 `.runtime/tests/runtime-api/calculator-115-qualification-*/` | 保存原始 actions/basic candidate、run-scoped result、源码 hash、逐步 observation 和实窗截图 | 不进入版本控制，不回写 raw/actions/candidate，不因旧证据存在而跳过新的验证 |

生产 recipe 只解析一次系统 Calculator 的可执行路径、标题和唯一 `232×321` 窗口；布局是窗口相对点能够安全复用的必要前置条件。`allClear()` 最多发送两个同一 clear 控件的幂等动作，以同时覆盖初始按钮处于 `C` 或 `AC` 的正常 Calculator 状态。其余代码按业务段直接发送 `25 × 4 =`、`+ 20`、`− 5 =`。每次发送前只重新确认同一窗口仍在前台；窗口内点由 `Geometry.pointOffset()` 投影并用 `Geometry.contains()` 拒绝越界，`mouse.clickForPID()` 自身再检查 PID、点命中元素和 `AXPress`，并且不降级为普通全局 click。

严格按钮名称／identifier、逐步序列 `0, 0, 2, 25, 25, 4, 100, 100, 2, 20, 120, 5, 115` 和最终业务 oracle 全部属于资格测试。Gate 必须先固定当前生产 Recipe hash，再把该文件的实际字节放入受控 async wrapper；wrapper 只拦截现有 `mouse.clickForPID()` 边界以核对动作参数和读取逐步状态，不实现第二条业务点击序列。测试必须从仓库根目录直接运行正式 JavaScript 文件，并将证据写入 `.runtime/tests/runtime-api/`：

```bash
OPENDESK_CALCULATOR_115_CONFIRM=authorized-calculator-fixture ./dist/opendesk -script tests/runtime-api/calculator-115-semantic-recipe-macos.js -console-mode script
```

日常用户命令仍然只有：

```bash
./dist/opendesk -script examples/human-to-recipe/calculator-115.semantic.recipe.js -console-mode script
```

两条命令必须分别报告。用户命令 exit 0 只表示自动化完成；只有独立资格文件在当前源码和来源 hash 上重新运行成功，才可报告逐步语义与最终 `115` 通过。该交付只对已验证的系统 Calculator identity 和 `232×321` 布局负责；窗口可以平移，resize、模式变化或目标歧义都会 fail closed。它不冒充通用 Calculator 引擎或自动 human lineage compiler。

### 4.11 本案例的框架提取决定

本次优化不能只问“是否把 `pressKeys()` 搬进 UI.js”，而要把 Calculator 与仓库内 TextEdit、Safari、微信、千牛、拼多多 Recipe 对照，识别所有应用都会重复的目标和动作基础设施。跨应用静态核查已发现 `window.list()`、活动窗口比较、focus/bring-to-top、窗口相对坐标、固定等待和 Accessibility ref 生命周期等共同样板，因此已有足够证据进入公共能力设计；完整优先级、合同草案和实施批次以[多应用自动化高频框架能力](../../../docs/frameworks/multi-application-automation-primitives.md)为唯一正文。

| 现有逻辑 | 当前归属 | 理由 |
| --- | --- | --- |
| `BUTTON`、`allClear()`、`25 × 4 = → + 20 → − 5 =` | Calculator Recipe | 是应用布局、动态 `C/AC` 恢复和业务意图，不是跨应用能力 |
| `pressKeys()` | Recipe 内普通函数 | 只改善本脚本的业务可读性；抽成类或 Registry 不增加稳定身份、原子性或独立消费者 |
| 同一窗口／前台／`232×321` 检查 | Recipe 消费 AppProfile 规则 | 确切尺寸是本布局资格；通用 Runtime 不应知道 Calculator 尺寸 |
| `Geometry.pointOffset/contains` | 已有 JS 公共 primitive，Recipe 与 basic generator 已消费 | 统一快照坐标投影并拒绝越界；不保证窗口在投影与动作之间不变化 |
| `mouse.clickForPID(pid, x, y)` | 已有 Go/native primitive | 已负责权限、PID、点所在 owner、AX hit、`AXPress` 和 fail-closed；不降级为全局 click |
| 来源 hash、按钮 identifier、13 个显示状态与截图 | 独立资格 Gate | 用于证明冻结 Recipe，不决定日常业务控制流 |

框架侧按三项 P0 拆分，而不是增加一个应用工具类：Go Window owner 提供精确窗口解析／刷新／激活；`UI.js` 提供语义控件 `find/read/perform/release` 的无 ref 样板 facade；Go native owner 提供确切窗口内相对点的原子动作。状态等待、输入框填写和统一 Action Receipt 作为 P1。这样既让可访问控件优先走语义操作，也让显式窗口内坐标策略在一个原生生命周期内关闭“检查窗口 → 投影 → 动作”的竞态；语义 press 与物理 click 必须分别声明，不能静默互相 fallback。

这些是待实施的框架合同，不是当前可调用方法。在 P0 落地并重新资格前，现有生产 Recipe 继续使用局部 `requireActiveCalculator()`／`press()`、已有 `Geometry` 和 `mouse.clickForPID()`；不得把设计方法名提前写入示例或 Skill 依赖。通用的生产／资格／证据边界仍见[示范到自动化执行方法](../../../docs/frameworks/demonstration-to-automation-pipeline.md#生产-recipe资格-gate-与-evidence-分层)。

### 4.12 确定性语义生成与双应用校准

Calculator 质量来自一条可重复的输入收敛链，而不是最后一次“把代码写漂亮”：读取实际 actions/revision/hash → 每个 action 归类并保留 source map → 依据已验证 AX label 形成语义控件表 → 将 `C/AC` 识别为应用恢复规则、算式识别为业务 Episode、窗口与布局识别为运行门禁 → 只用当前公开 API 投影和执行 → 把固定 hash、identifier、逐步 Oracle、截图和报告移入独立 Gate → Gate 冻结并执行实际生产源码。

后续 semantic candidate 在 H6 前必须冻结最小 build plan：来源、逐动作 disposition、业务 Episode、参数／常量、Target/Locator/Geometry、运行门禁、恢复规则、qualification claims 和 source map。当前最小 schema 与 validator 已位于 [`skills/human-to-recipe/`](../skills/human-to-recipe/SKILL.md)，Calculator 的实际 12-action 校准见 [`calculator-115.semantic-build-plan.json`](../golden-samples/calculator-115.semantic-build-plan.json)。validator 会阻止 unknown、未映射／重复消费、source hash 漂移、事件编号 Episode、隐式 fallback 和 Gate 绑定另一生产源码；它不检查视觉语义，也不是 renderer。生成审阅仍按[完整作业任务树 H6](task-decomposition.md#h6-生成普通-opendesk-javascript)与[示范到自动化执行方法](../../../docs/frameworks/demonstration-to-automation-pipeline.md#确定性生成与审阅闸门)执行；通用 renderer 明确未实现。

双应用校准使用 Calculator 与 [`examples/ai-cli/macos-textedit-recipe.js`](../../../examples/ai-cli/macos-textedit-recipe.js)：前者证明固定窗口 offset＋PID-scoped AXPress，后者证明 document/toolbar/modal panel 的百分比 Geometry＋tagged click，并暴露 Save sheet 会改变窗口 lifecycle。结论是 Geometry 消费可以先独立落地，而 Window exact resolve/current/activate 不能从 Calculator helper 直接定型。TextEdit 当前仍混合运行、断言、截图和 evidence，且没有 human Recorder v2 包；因此本轮只标“跨应用代码校准”，不标“双应用 human/live 已资格”。

### 4.13 simple console → Codex 交接

新增“复制 Agent 完善提示词”按钮由纯 JavaScript builder 生成确定性文本，并通过 `copyText` adapter 注入剪贴板 owner。按钮只在实际 `actionsFile` 已产生后启用；actions ready、blocked 或 basic generation error 都可交接，basic script 不是前置条件。提示词绑定 `Execution.workdir`、recording/actions 路径、实际 JSON revision/readiness、只含 code 的 issue 计数、semantic coverage，以及存在时的 script/candidate 路径；actions hash 若没有生成结果可提供，则明确要求接收 Agent 从实际字节重算。

提示词不展开 action text、键盘内容、AXValue、semanticReason 文本、截图或 raw。两个显眼占位符要求用户补充业务目标和成功条件；缺失时 Skill 必须先询问，不能从点击序列猜意图。仓库内 Skill 路径始终写入提示词，因此用户级未安装 `$human-to-recipe` 时接收会话仍有真实入口。复制是 handoff，不创建线程、不调用 Agent、不生成／回放、不改变录制包，也不表示 generated、live verified、视觉通过或 qualified。

## 5. 当前动作资格

| 动作 | capture 字段 | actions | basic JS | live 状态 |
| --- | --- | --- | --- | --- |
| 单次左键 click | press/release/click、modifier、screen/display、动作级 app/window、可选 AX element | 完整配对；保存 window offset/ratio、semantic status/reason、hit/ancestors | 解析唯一当前窗口，用 `Geometry.pointOffset/contains` 生成 tagged point 后执行 `mouse.clickPoint` | 旧生成源码的 macOS Calculator 标签、actions、用户回放及 `115` oracle 通过；Geometry 收敛版需单列本轮合成与 live 状态 |
| Basic Latin 文本 | KEY_TYPED＋物理 key evidence＋动作级 app/window | 无 Ctrl/Meta/Alt 且非 composition 时 ready；element 为 not-applicable | 解析并确认当前活动窗口后 `keyboard.type` | 合成通过；真实键盘未运行 |
| 未按键 hover move | callback 计入 observed 后 filtered，不写 raw | 无 action；可由计数审计降噪 | 无 | Go session 测试覆盖 |
| button-held motion / dragged | 完整保存路径；pointer press/release 各有 phase、动作窗口及 label-only AX traits | ≤4 points 的完整短路径归一化为 jitter click；普通 `>4` points 左键路径仍要求同显示器、≤30s、≤8 points 端点弦线偏差且无明显回退。同窗口同一 verified 可写 `textField` 可启用独立 natural text-selection predicate：偏差≤`min(16, max(8, 距离×8%))`、路径长／端点距离≤1.08，且投影不越界或明显回退；独立 source basis 固化判定来源。缺 traits、非 textField 和跨窗口不得使用语义放宽 | 新鲜投影 start/destination，`move → down → try move → finally up`；普通 drag 的全局 8 points 容差不变，复杂、曲线、回退、跨屏和未验证路径 blocked | Go/Runtime latest-shape 与 negative matrix；固定失败包重建；新的真人文本选择证据 |
| vertical/horizontal wheel | wheel amount/rotation/direction、首事件坐标、display、动作级 window context | 同轴同向相邻事件形成有界 burst；旧无 context 包按已验证 display 坐标降级 | `mouse.move(point)` 后 `mouse.wheel({deltaX, deltaY, steps, delay})` | Runtime fixture 与 2026-09-09 失败包重建通过；生成物未自动回放 |
| 同一点连续 double/multi-click、right/middle | 原事实 | blocked；不同坐标间沿用的 native 时间序列计数按各自单次物理 click 制作 | 无 | synthetic 覆盖 |
| Control/Meta/Alt click/key | modifier facts | blocked | 无 | 未运行 |
| IME/dead key/composition | key facts与 gap | blocked，不补 finalText | 无 | 未运行 |
| missing pair／long press／drop | raw＋manifest issue | blocked | 无 | 私有 seam 已测，live 未运行 |

## 6. 真人闭环执行条件

真人 gate 只有同时满足下列条件才开始：

- 当前源码、`dist/opendesk`、必要 UI host 和静态 lib provenance 一致；
- macOS/Windows 对应系统和权限可用；
- 使用隔离、可恢复、无真实业务或外发的 fixture；
- 用户明确按 F8 开始，键盘内容明确非敏感；
- 预先冻结初始状态、操作、期望结果和独立 oracle；
- 回放是另一 invocation，并再次明确授权。

验收顺序：先 capture/stop，检查 raw、manifest、counts、控制排除和 resource zero；再从该真人录制 build actions；再生成 basic JS；恢复 fixture；最后单独回放并由 oracle 检查对象、次数和文本。任一数据缺口、storage failure、unsupported action 或错误对象都使完整闭环失败。

本轮使用用户明确允许的系统 Calculator 作为一次性非敏感 fixture，专用 JavaScript gate 记录起始 provenance、清零、通过 Runtime `mouse.click()` 发送受控全局输入并独立读取显示值，已实际启动 native listener。该 gate 是真实应用／listener 验收，不冒充真人手工输入。此后用户又通过 simple console 完成独立人工采集，所生成的 12-click 脚本已在另一 invocation 回放，并由第三个 invocation 验证显示 `115`；生成物自身仍保持 `verification: "not-run"`，资格只属于对应 run-scoped evidence。公开 F8 入口和完整 Custom UI 的人工采集仍未另行完成。

## 7. 下游语义工作流接续

| 项目 | 固定交接 |
| --- | --- |
| 输入 | actions exact file/revision/hash、raw ref/hash、basic candidate/hash、环境、用户目标／预期结果、实际 evidence 或 missing reason；AppProfile 只引用真实版本 |
| 下游责任 | 目标／业务对象、定位、等待、验证、参数、普通函数和代码质量；不再次实现 listener |
| 输出 | 新 semantic candidate JS、引用规则、每项修改理由、适用条件和独立 verification；不覆盖 basic candidate/raw |
| 失败返回 | facts→H2；grouping→H3；intent/text→H4；target/locator→H5；code→H6；authority/success criteria→H1 |

下游统一从仓库内 [`human-to-recipe` Skill](../skills/human-to-recipe/SKILL.md) 进入；它在需要 target／locator 加固时再遵循 `application-engineer`，但 human raw/actions 仍保持独立 lineage，不能伪装 Agent demonstration。当前已实现最小 SemanticBuildPlan schema 和 validator，通用 renderer 与用户级 Skill 安装仍不存在；Calculator golden 和静态断言只校准已冻结规则，不冒充 live 或整条一键生成系统。

## 8. 硬性失败条件

- 未收到真实 `HOOK_ENABLED` 就返回 session；
- stop 前没有固定截止，或 hook 未退仍写成 stopped；
- accepted 事件未排空、drop 不可见、storage failure 写 saved；
- 未按键 hover move 继续写入 v2 raw，或过滤后没有 `filtered` 计数；
- 键盘范围外事件先保存后删除；
- v2 action 没有已验证的应用／窗口上下文仍标 ready，或只用旧 PID/handle/screen point 回放；
- 同应用多个窗口无法唯一解析时仍发送输入；
- AX 失败后伪造按钮文字，读取 AXValue／安全内容，或把 OCR 字符串冒充原始事实；
- `>4` points drag 被静默变成 click，或复杂／曲线／跨屏 drag 被当成受支持直线 drag；
- actions/代码从旧内存而不是实际固定文件生成；
- raw 和 actions 同时回放，或 recipe 循环解释 actions；
- 生成覆盖人工代码，或 `approved` 字段赋予执行权限；
- 自动运行刚生成的脚本；
- synthetic/cross-build/API resolve 冒充真人 capture、目标系统 live 或业务成功。

## 9. 下一批最小范围

下一应用建议选择 TextEdit，先取得新的 human Recorder v2 包和用户明确业务目标／成功条件，再用同一 Skill/plan/gate 分层校准；不得从现有 TextEdit 示例预填保存、编辑或其他业务意图。通用 renderer、focused-element、显式 `target-crop` OCR 和 locator portfolio 都是后续独立工作包；不要回到 native listener、不改 raw、不创建第二 Recorder、AppProfile 或专用 Replay Runtime，也不要把[多应用自动化高频框架能力](../../../docs/frameworks/multi-application-automation-primitives.md)中的路线图方法名提前写进代码。
