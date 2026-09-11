---
title: "人工 Recorder｜实施与验收计划"
description: "当前 Recorder 实施状态、分层命令、证据、点击目标 OCR/语义化验收、未运行项目与下一批交接。"
order: 30
---

# 人工 Recorder｜实施与验收计划

状态：Recorder 数据合同 v2、合成文件闭环、macOS Calculator 真实 native capture／按钮语义、用户 simple console 录制包独立回放／业务 oracle，以及该录制包的可维护语义优化 recipe 已实施并验收，2026-09-10。构建源码闭包 `8891ff3b…` 的 current8 pair 完成了非敏感键盘公开命令闭环：keypad Enter、ArrowLeft、Basic Latin、Meta+A 和 macOS 拼音最终提交均形成 ready actions，生成脚本在恢复精确初始值后显式 replay 成功，独立 AX oracle 验证“中文”；同一 pair 的 native-stop、正式 Recorder Runtime JS、Custom UI 功能／视觉和资源归零均通过。输入由受控真实键鼠完成，不冒充真人手工输入。

随后 `polyfills/006-ui.js` 仅增加两项 UI-value 诊断收紧：可靠的底层 `error.phase` 总是写入 `nativePhase`，且显式拒绝 `within:null/undefined`。最终 current10 pair 以构建源码闭包 `587baeca…` 成对 `go build -a`；main／host 字节 hash 与 current8 实窗 pair 完全相同，并通过 current10 direct／正式 Recorder JS 14/14 与资源归零。按明确交接要求未重复桌面 UI/live；current8 实窗资格与 current10 精确差异验证分层记录，不把不同源码闭包写成同一次 live。当前工作树另已实现仓库内 `human-to-recipe` 与零配置 `recorder-script-refiner` Skill、最小 `SemanticBuildPlan` schema／validator、Calculator plan golden 和 simple console 的去正文、单行相对路径任务交接；通用 renderer 与用户级 Skill 安装仍未实施。点击目标理解的 Native／OCR／Visual／Geometry／Context 统一合同及五类回归场景已写入设计基线，但显式 target-crop OCR、文字归属绑定和 locator portfolio 的通用实现仍未完成，不能把已有 AX 标签或无文字图标设计冒充完整 OCR 增强闭环。旧 hash 的 live 证据不能自动转移。本文只记录当前工作树的真实完成与验收边界；H1—H8 完整作业仍以 [任务分解](task-decomposition.md) 为准，DQ-01—DQ-15 规范性决定和唯一技术方案见 [Recorder 工程设计](recorder-design.md)。

2026-09-10 后续兼容修正把“目标应用不暴露 focused editable 最终值”从结构性 blocker 中分离：verified value patch 仍优先；否则完整的 Basic Latin `KEY_TYPED` 制作为显式可编辑变量，并在 candidate 中声明其可能只是 IME 拼音、尚未取得 final-text 资格。同一物理键自动重复也折叠成上限 100 的 `repeatCount`。因此基础脚本可以继续生成，而生产级语义确认仍交给 human-to-recipe 与独立 oracle；不可表示的 composition 与上下文缺失省略局部动作并形成 `needs-review`，事件丢失继续 fail closed。

同日对 `rec-20260910T071420.930314000Z-2b52fa670a22` 的固定 raw 复核发现，listener ready 后首条已持久化事件是 `MOUSE_DRAGGED`，直到 e000000000113 才 release，manifest 同时明确 `dropped: 0`；这是 press 早于 capture 起点的边界尾段，不是会话内事件丢失。DQ-15 现将“capture 起点可证明封闭的 partial pointer envelope”与真正的 missing pair 分离：前者逐事件 excluded 且不产生 issue，后者保留为 action-local omission；只有 manifest 报告真实事件丢失才 fail closed。

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

当前 1—7 已由 current8 的非敏感键盘包 `rec-20260909T220831.234712000Z-d8ee734a1596` 在同一成对构建上闭合；恢复目标的精确初始值 `Ada` 后，generated script 在独立 run 中成功，AX oracle 验证最终值“中文”。macOS Calculator fixture 仍保留真实 listener、动作级窗口上下文、按钮标签语义和文件链验收；用户提供的旧 simple console 包 `rec-20260909T113509.231387000Z-e2232547fa4e` 也保留独立真实回放与显示值 `115` 的历史业务 oracle。早先其他 candidate 的资格不因 current8 通过而自动转移。合成 raw、替身执行和受控键鼠均明确标注来源，不冒充真人输入。

### 1.1 数据质量门槛

本轮使用固定 100 分量表，结果为 **98/100**，达到用户要求的 95 分门槛。评分维度固定为输入降噪 15、动作完整性 15、应用／多窗口身份 20、坐标迁移 20、控件语义与隐私 15、fail-closed 生成 10、文档／兼容／验证 5。扣 1 分是 basic 尚未把 AX 证据自动提升为通用 locator；另扣 1 分是 Windows/Linux 目标系统 live 未运行。详细量表和可清理运行证据见 [Recorder 数据质量 v2 验收](../../../docs/quality/recorder-data-quality-v2.md)。

这里的 98/100 只针对 Recorder 数据质量 v2 已验范围，不可扩展解释为“点击目标 OCR／视觉语义化 98 分”。后者必须单独满足本文 4.14 的五类行为矩阵、来源追踪和重新定位资格后才可评分。

## 2. 实际工作包状态

| 工作包 | 当前状态 | 实际成果 | 未完成或未运行 |
| --- | --- | --- | --- |
| WP0 源码和规则核查 | 完成 | 核对 Runtime 初始化、polyfill 顺序、File/path、mouse/keyboard/window/display、execution 生命周期、Agent MCP Recorder 和下游现有方法 | 无附件包可读取；未声称读取不存在附件 |
| WP1 native capture owner | 已实施，macOS live 通过 | libuiohook 1.2.2、单 adapter、process lease、真实 ready、desktop capture、button-held-only motion policy、bounded event/context queues、deadline、stop/drain、manifest、resource counts | Windows 真实 listener、X11 live |
| WP2 动作上下文与 actions | 已实施并通过合成与 macOS live | application/window/element 分层；稳定应用身份与瞬态 PID/handle 分离；窗口 offset/ratio；AX point-hit＋最多 6 层 actionable ancestor；fixed raw/hash、唯一 grouping、pause boundary、revision、disposition/readiness/issues | 键盘 focused-element 语义、Windows/Linux target semantics live |
| WP3 basic JS 生成 | 已实施；原版本隔离／用户回放通过，Geometry 收敛版正式 JavaScript 合成 Gate 通过 | 每动作用 `window.get` 重新解析当前应用窗口；同应用多窗口无歧义门；以 `Geometry.pointOffset/contains` 按新 bounds＋offset 重算并用 tagged point 输入；strict actions/hash、白名单 JS、candidate、exclusive create、替身执行 | 语义 locator、resize/layout adaptation、窗口解析到动作提交的原子性；旧 candidate 资格不转移给新生成源码 |
| WP4 正常用户入口 | 已实施；current8 公开命令与 Custom UI 功能／视觉通过 | `record.js` 快捷键；完整和 simple 原生控制台；公开 simple console 的受控真实键盘 capture／generate／显式 replay／AX oracle；Custom UI 19/19、关键状态截图和资源归零 | 完整 Custom UI 的真人业务采集；其他 candidate 的真实重放 |
| WP5 下游语义增强交接 | 最小可复用链已实现；点击目标多源语义合同已补入设计；renderer／OCR 实现未完成 | 仓库内 `human-to-recipe` 与 `recorder-script-refiner` Skill、schema、source-check validator、Calculator plan golden；human lineage 的 disposition／Episode／target／gate 分层；AX 标签只作证据；H5.2 已定义 Native／OCR／Visual／Geometry／Context 统一消费和 locator portfolio | 用户级 Skill 安装、通用 renderer、focused-element、显式 target-crop OCR、OCR 文字与目标／标签／父区域绑定、五类点击目标回归 fixture、第二个应用的 human golden |

WP5 的“设计已补齐”不等于功能已经实现。当前 Calculator 通过的是 AX 标签语义和已冻结按钮身份；没有实际 target-crop OCR evidence 时，不得把它登记成 OCR 场景通过。

## 3. 正常用户命令

全部命令从仓库根目录执行。

macOS 的交互录制：

```bash
./dist/opendesk -allow-recorder-capture -script workflows/human-to-recipe/record.js -console-mode script
```

F8 在获准非敏感 fixture 前台时开始；F9 由示例串行 UI 根据状态调用显式 pause/resume；F10 stop 并制作 actions；`ready` 或 `needs-review` 时 F11 生成，后者得到带 warning 的 partial/no-op candidate；F12 不生成结束。关闭 execution 或 Ctrl+C 触发 native owner stop。该命令不回放。

macOS 的原生窗口录制入口：

```bash
./dist/opendesk -ui -allow-recorder-capture -script workflows/human-to-recipe/recording-console.js -console-mode script -log-dir .runtime/workflows/human-to-recipe/recording-console
```

点击开始后的倒计时用于选择起始窗口；PID＋title 只保存为 provenance，不会冻结采集范围。
暂停／继续分别分派到公开 `session.pause()`／`session.resume()`，用户可在任意窗口继续；录制期间可自由切换窗口和应用。
停止保存后自动制作 actions，生成仍需另一次明确点击且不回放。取消或关闭窗口是用户显式停止路径，只沿 native lifecycle 停止并保留可用事实。

macOS 的简化原生工具条入口：

```bash
./dist/opendesk -ui -allow-recorder-capture -script workflows/human-to-recipe/recording-console-simple.js -console-mode script -log-dir .runtime/workflows/human-to-recipe/recording-console-simple
```

该入口停止后自动制作 actions 和生成普通 JS，但仍不会自动回放；回放按钮需要独立点击。开始时使用 `target-semantics`，普通 hover 不写 raw，动作可跨应用／窗口并分别解析上下文。

Windows 的交互录制：

```powershell
.\dist\opendesk.exe -allow-recorder-capture -script examples\human-to-recipe\record.js -console-mode script
```

Linux/X11 native adapter 已接线，但当前 `record.js` 的 F8/F9 控制面依赖仅支持 macOS／Windows 的 `globalShortcut`，因此本轮没有把该示例命令宣称为 Linux 用户入口。Wayland 全桌面采集不支持。

独立生成：

```bash
OPENDESK_RECORDER_ACTIONS_FILE=.runtime/recordings/<ID>/actions.json ./dist/opendesk -script workflows/human-to-recipe/generate.js -console-mode script
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

current10 使用完整构建源码文件指纹在构建前后守门，并以 `go build -a` 成对刷新顶层 `dist/opendesk` 与 `dist/opendesk-ui-host`；源码闭包前后均为 `587baeca900bc552be4044362843ee0051bbd7c131fb36ec36e7f0c632048299`。main SHA-256 为 `d66f947561e39ccf2d30d2c288275b2882cbb89c0284cdea75c232835c712aac`，UI host 为 `d722a273cc31bccc85dafc5de546004fff41aa00fba97711dd5662941c381280`；两者 buildinfo 均为 revision `1029f3fdb0d15772e95ab2cff396b4701ef7e0f8`、`vcs.modified=true`。该 pair 与 current8 实窗 pair 字节完全相同；current8 的 source/hash/live 证据保留在 4.15，并与 current10 的构建守门和无 UI 回归分层记录。Windows 与 Linux 目标系统 live 本轮未运行；不得把 cross build 写成目标系统 live。

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
| recorder-script-refiner bundle inspector | 3/3 通过 | `node --test tests/human-to-recipe/recorder-script-refiner.test.js`；覆盖旧 macOS／Windows absolute provenance 的安全重定位、script/actions/mapping 漂移拒绝、路径穿越、控制字符与 symlink 逃逸拒绝；用户包 `rec-20260909T164404.862087000Z-7cee64d9c064` 也通过实际字节 lineage 检查 |
| simple console Agent 脚本转接 synthetic | 通过 | `./dist/opendesk -script tests/runtime-api/recording-console-simple.js -console-mode script`；execution `direct-20260910-013808-766000`，精确验证单句相对路径、跨 macOS／Windows 仓库迁移不变、generated-only 启用、run 期间禁用和 clipboard 失败可重试；未启动 listener／真实输入或系统剪贴板写入 |
| 当时的 six-button simple console live／视觉 | 未运行（历史状态） | 该表对应的 2026-09-09 轮次未启动公开 `-ui -allow-recorder-capture` 命令；后续 current8 资格见 4.15，不把不同构建的证据混记 |

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

“复制 Agent 优化脚本”按钮由纯 JavaScript builder 生成确定性单行文本，并通过 `copyText` adapter 注入剪贴板 owner。按钮只在 `ready` actions 的实际 `generated.scriptFile` 已产生后启用；录制、生成失败、actions `blocked`、`needs-review` partial candidate 和真实重放期间均禁用。提示词只绑定本次 generated script 的仓库相对路径，不携带 Skill 路径；仓库 `AGENTS.md` 负责路由到 `recorder-script-refiner`。提示词不写入 `Execution.workdir`、业务问卷、派生元数据或流程说明。若仓库迁移而相对录制路径不变，同一输入生成相同文本。

`recorder-script-refiner` 从 script sibling candidate 安全重定位当前包内 actions、manifest 和 raw，忽略 candidate 中旧机器绝对路径并核对 hash、revision、recording ID、readiness、raw 字节和 action mapping。默认目标是保持每个动作、顺序、参数、目标与时序语义不变，只做静态质量提升；不问业务目标，缺少证据的增强直接跳过。Skill 不运行 Recorder、脚本、Gate 或真实桌面动作，不覆盖 basic 文件，只能报告 generated／statically reviewed，其他资格为 not-run。需要业务动作取舍、参数化或结果 Oracle 时才转入 `human-to-recipe`。

### 4.14 点击目标 OCR／语义化的防遗漏验收矩阵

这一节把 H5.2 的设计要求变成后续实施的固定验收入口。它不宣称当前 OCR 已实现；目的是防止“Recorder 有 AX 标签”“无文字图标有视觉分析”两个局部事实掩盖中间整条文字证据链缺失。

统一处理链固定为：

```text
click + event/window context
→ target candidate
→ target crop + necessary context crop
→ Native text + OCR text + Visual + Geometry + Context
→ text/object binding and conflict preservation
→ semantic target + business ownership
→ locator portfolio
→ new observation relocalization
→ authorized action + result verification
```

每个 OCR observation 至少保存：`text`、`bbox`、source image/hash、crop→original→window/screen 映射、engine/version、confidence、observedAt。Native name/label 与 OCR 分开保存；模型解释另存。禁止把 OCR 字符串写进 raw，禁止在 AX 缺失时无来源补一个“看起来正确”的按钮名，也禁止只保存 OCR 文本却丢失它属于哪个 bbox／控件／父区域。

首批固定行为矩阵：

| Case | 必备证据 | 关键判定 | 通过条件 | 当前状态 |
| --- | --- | --- | --- | --- |
| `text-button` | 目标 crop、Native 可用文字、OCR text+bbox | OCR 文字属于按钮本身而非周边 | 目标语义可追源；至少一个候选文字 locator 可在新画面重新找到正确目标 | 未实施通用 OCR Gate |
| `icon-only` | 目标 crop、上下文 crop、视觉图形；OCR 可为空 | OCR 为空不伪造文字；图标业务归属需上下文 | 相同／相近图标存在时仍能绑定正确业务对象 | 设计已有，无通用 live Gate |
| `text+icon` | 同一目标的文字和图形证据 | 两种证据并存；冲突不静默覆盖 | locator portfolio 能记录优先级、适用条件和冲突 | 未实施 |
| `duplicate-same-text-or-icon` | 重复目标＋所属行／卡片／标签／业务 ID | 不以全屏同名文字或同图标首命中作为目标 | 列表重排后仍找到输入业务对象；对象不存在则 fail closed | 设计场景已有，未建立 OCR fixture |
| `surrounding-label` | 目标、相邻 label、父区域 bbox／关系 | 区分“目标自己的文字”和“描述目标的周边文字” | 关系 locator 在新画面仍唯一；label 漂移／重复时不误点 | 未实施 |

实施时至少再覆盖以下负例：OCR 漏字、低置信度、文字跨 bbox、Native/OCR 冲突、图片缩放映射缺失、目标 crop 截断、审阅标注污染模板、重复文字属于不同业务对象、图标识别正确但对象归属错误。每个失败必须路由到 H2 补采或 H5 修正，不允许自动降级成全局坐标后仍把 semantic qualification 标通过。

点击目标能力的完成声明按层级区分：`captured`（证据已保存）→ `extracted`（Native/OCR/visual 已执行并可追源）→ `bound`（文字／图形已绑定到正确目标和业务对象）→ `locator-candidate` → `relocalized` → `action-verified`。任一上游状态缺失，不得直接写后续状态。后续代码和测试应把这套状态与现有 actions/AppProfile/qualification 结构做最小兼容对齐，而不是另造第二套 Recorder 或第二份应用模型。

### 4.15 2026-09-10 current8 live／current10 最终 pair 证据

实窗资格属于构建源码闭包 `8891ff3bbc60f518cfb3cff22484828337b351da46be3bd8a136e695a666a92b` 的 current8 pair。current8 后唯一产品源码变化都在 `polyfills/006-ui.js`：将可靠的底层 `error.phase` 始终复制到 UI-value `nativePhase`，并拒绝显式的 `within:null/undefined`；没有 Recorder、automation、cmd 或 pkg 产品源码变化。写入方冻结后，current10 在源码闭包 `587baeca900bc552be4044362843ee0051bbd7c131fb36ec36e7f0c632048299` 上重建，main／host 与 current8 pair 字节完全相同，并完成无 UI Recorder 回归。按明确交接要求未重复桌面 UI/live；两层证据不混写为同一次运行。current8 实窗使用公开命令和隔离 AppKit 文本目标，以受控真实键鼠产生 native 事件，不冒充真人手工输入。

| 层 | 结果 | run-scoped 证据／说明 |
| --- | --- | --- |
| 成对构建 | 通过 | `.runtime/tests/recorder-keypad-enter/final-current8-20260910-055340/`；source-before/source-after 均为 `8891ff3b…`；`dist/opendesk` SHA-256 `d66f947561e39ccf2d30d2c288275b2882cbb89c0284cdea75c232835c712aac`，UI host `d722a273cc31bccc85dafc5de546004fff41aa00fba97711dd5662941c381280` |
| current10 最终 pair | 通过 | `.runtime/tests/recorder-keypad-enter/final-current10-20260910/build-provenance.txt`；source-before/source-after 均为 `587baeca…`；main／host SHA-256 分别为 `d66f947561e39ccf2d30d2c288275b2882cbb89c0284cdea75c232835c712aac`／`d722a273cc31bccc85dafc5de546004fff41aa00fba97711dd5662941c381280`，与 current8 pair 字节相同 |
| current10 Direct Recorder JS | 14/14 通过 | `.runtime/runs/direct-20260910-071233-274000/` |
| current10 正式 Recorder Runtime JS | 14/14 通过 | `.runtime/tests/runtime-api/recorder-final-current10-formal-20260910/`；正式 selected 入口，failed=0，资源计数均为 0 |
| Direct Recorder JS | 14/14 通过 | `.runtime/tests/recorder-keypad-enter/final-current8-js-direct-20260910-055630/` |
| 正式 Recorder Runtime JS | 14/14 通过 | `.runtime/tests/runtime-api/recorder-keypad-final-current8-20260910-055716/`；正式 selected 入口，failed=0，run-local binary hash 与 `dist/opendesk` 相同 |
| Go／架构 | 通过 | `go test ./automation` 与 `node scripts/audit_test_architecture.js` 均在 current8 收尾轮通过；架构摘要写入 `.runtime/tests/test-architecture/audit.json` |
| 原公开命令 capture／generate | 通过 | 包 `.runtime/recordings/rec-20260909T220831.234712000Z-d8ee734a1596/`：`stopped/saved`、issues 空、accepted/persisted 44、15 组物理 key press/release 完整、actions `ready` 共 6 项、candidate/script 存在 |
| keypad／文本／快捷键／IME | 通过 | e2/e3 为 keypad Enter `keycode=3612 (0x0e1c)`／`rawcode=76`；另含 ArrowLeft、`Ada → Adax` 的 `x` patch、完整 Meta+A、`Adax → 中文` 的最终值 patch。manifest 只保存 UTF-16LE SHA-256、长度与 patch `insertText`，不保存完整 before/after 值 |
| 显式 replay＋独立 oracle | 通过 | 恢复精确初始值 `Ada` 后，`.runtime/workflows/human-to-recipe/recording-console-simple/generated-script-runs/2026-09-09T22-26-13-788Z/` 以 `succeeded` 完成（27968ms）；`.runtime/tests/recorder-keypad-enter/final-current8-20260910-055340/live/replay4-independent-ax-oracle.json` 验证 `recorder-live-text` 为“中文”、selection `(2,0)`、focused=true；失败的前两次 replay 不计通过 |
| native stop／lease | 通过 | `.runtime/tests/runtime-api/recorder-native-stop-macos/1788993315746-direct-20260910-063515-971000/`；keyboard disabled 过滤 ArrowLeft，enabled 精确保存 press/release 并生成唯一 special-key action；两次 stop click matched，stop 84ms／429ms，连续 lease 复用成功 |
| Custom UI 功能 | 19/19 通过 | `.runtime/tests/runtime-api/recorder-custom-ui-final-current8-20260910-062938/`；postSuite、lifecycle probes、resource cleanup 与 no residual processes 全通过 |
| Custom UI 视觉 | 通过 | 同目录 `runtime-logs/custom-ui/recording-console/visible.png` 及 `floating-toolbar/recording-console/` 的 ready、actions-ready、details-run-succeeded 等截图；窗口内容自适应，按钮／输入／状态对齐，无异常拉宽、过高、大面积空白、裁切或错位 |
| 清理 | 通过 | 公开 console、UI host、目标与 observer 均退出；最终 Runtime drain 的 `recorderSessions`、`recorderBackendLeases`、`recorderWriters`、pending/workers 均为 0，无 `capture occupied`。系统原有 `/Applications/OpenDesk.app` 进程不属于本轮，未操作 |

### 4.16 2026-09-10 WeChat／CEF 无最终值兼容修正

本轮只做已有包的静态重建和候选生成，不重新监听，也不执行生成脚本。`make build` 已从当前未提交工作树刷新 `dist/opendesk`、`dist/opendesk-ui-host` 和 macOS Vision helper；main／host SHA-256 分别为 `14529399872683f6ecc81687b4f574f391cce8c17ed366b727a4295625a663c4`／`e0c0210b0b61828b87ff91f44f4f08ca7d3d97b3e9555bad6249065b08e8b4d6`。这些 hash 只标识本轮本地构建，不继承 4.15 的 live 资格。

| 层 | 结果 | run-scoped 证据／说明 |
| --- | --- | --- |
| Go 定向回归 | 通过 | `TestRecorderKeyboardShortcutsSpecialKeysAndVerifiedTextEdits` 与 `TestRecorderTextGroupingDoesNotReplayPhysicalKeysAndBlocksComposition`；另覆盖 3 次 Backspace、3 次 Meta+C、modifier 漂移和 100 次上限 |
| Recorder 单项 Runtime JS | 15/15 通过 | 从仓库根目录直接执行 `./dist/opendesk -script tests/runtime-api/single/recorder.js -console-mode script`；包含重复 Backspace 与重复 Meta+C 的 build/generate strict round-trip；`.runtime/runs/direct-20260910-150934-595000/` |
| 正式 contract catalog | 失败（非 Recorder 漂移） | `.runtime/tests/runtime-api/direct-20260910-150815-710000/` 在公开面扫描阶段报告既有并行工作树的 `UI.findTextMatches` 未登记；尚未进入 Recorder 行为执行。本轮不越界修改该 UI catalog，也不把该 gate 表述为通过 |
| 第一失败包重建 | ready、0 issue、5 actions | `rec-20260910T055916.912606000Z-9ae5d84459b1/actions.r002.json`；保留原 blocked `actions.json`，生成两项低层 text fallback 和一个 Enter |
| 第二失败包重建 | ready、0 issue、15 actions | `rec-20260910T062525.136747000Z-a0aaf6981215/actions.r002.json`；原先 32 个 `text-outcome-unverified`、64 个 `unassociated-key-evidence`、37 个 `unresolved-event` 不再出现；6 次 Backspace press＋一次 release 成为 `repeatCount: 6` |
| 静态候选生成 | 通过、not-run | 两包分别生成 `generated/actions-blocked-fallback-r002.recipe.js` 与对应 candidate；`.runtime/runs/direct-20260910-150502-002000/`。变量保留的是 Basic Latin 低层内容，candidate 明确其可能是 IME phonetic input，不能据此声称最终中文或 production qualified |
| 真实桌面回放／结果 Oracle | not-run | 没有启动生成脚本、没有向微信或其他真实窗口发送输入；业务目标和最终结果 Oracle 未在本轮固定，因此不生成 production Recipe、不宣称 live verified／qualified |

### 4.17 2026-09-10 capture 起点 partial pointer 修正

本轮只重建固定录制包和生成静态 candidate；未启动 listener，未执行生成脚本，也未发送桌面输入。原 `actions.json` 保留为历史 blocked 事实。

| 层 | 结果 | run-scoped 证据／说明 |
| --- | --- | --- |
| 根因核对 | capture 边界尾段，不是 drop | `rec-20260910T071420.930314000Z-2b52fa670a22` 的 raw 从 e000000000002 起连续记录 111 条 held-left `MOUSE_DRAGGED`，e000000000113 为对应 neutral `MOUSE_RELEASED`；manifest 为 accepted/persisted 147/147、dropped 0 |
| 设计与实现 | 通过 | DQ-15 只允许 raw 起点的单一 held button 尾段在对应 release 回到 neutral 后 excluded；中途 orphan、多个 held button、没有 neutral release 和跨 pause 保留为 action-local omission，只有 recording loss 仍 blocked |
| Go Recorder 回归 | 通过 | `go test ./automation -run '^TestRecorder' -count=1`；新增 start drag tail、release/click tail、未回 neutral、中途 orphan 和 held-button 歧义矩阵；仅有 vendored libuiohook 既有编译 warning |
| Recorder 单项 Runtime JS | 16/16 通过 | 从仓库根目录原样执行 `./dist/opendesk -script tests/runtime-api/single/recorder.js -console-mode script`；`.runtime/runs/direct-20260910-153049-962000/` |
| 固定失败包重建 | ready、0 issue、6 actions | 新建 `actions.r002.json`，e000000000002—e000000000113 共 112 条首段事件以 `capture-start partial pointer envelope` excluded；后续 4 个 click 和 2 个 drag 均保留 |
| 静态候选生成 | 通过、not-run | `generated/basic.recipe.js` 与 `generated/basic.candidate.json` 已生成；`.runtime/runs/direct-20260910-153126-109000/`。未执行 recipe，candidate 仍明确 `verification: not-run` |
| 成对构建 | 通过 | `make build` 刷新 main、UI host 和 macOS Vision helper；main／host SHA-256 分别为 `2373733c60ed4306d32791a8a27b2c7ed12de435765c12705f8b77f754f99f23`／`d16beeed68e119e7c1d930005215f3051ac762360876acdc5e0a8b75e8101073` |
| 原生 UI／真实回放／业务 Oracle | not-run | 本修正不需要重新监听来证明静态边界归组；没有把 build、fixture 或静态生成表述为实窗视觉、真人操作或业务成功 |

### 4.18 2026-09-10 action-local omission 与 package-integrity 分层

本轮实现 DQ-16，并继续只对用户原始包执行静态重建／生成；没有执行该包的 candidate，也没有发送其录制动作。合成 Runtime 与 Custom UI gate 只运行仓库自有 fixture，其中 Custom UI formal gate 操作并截图自建测试窗口。

| 层 | 结果 | run-scoped 证据／说明 |
| --- | --- | --- |
| Go action-local／hard matrix | 通过 | `go test ./automation -run '^TestRecorder' -count=1`；action-local error 降为 warning，问题 action 被隔离，剩余 action 与 disposition linkage 稠密重编号；`recording-loss` 和未知 error 保持 `blocked`。`action-target-invalid`、`text-edit-too-large`、`window-context-overflow`、`text-tracker-overflow`、`maximum-duration` 均有明确分类；vendored libuiohook 仅有既有编译 warning |
| 受控最大时长 | 通过 | 只有 terminal manifest 已可靠保存、包含 `maximum-duration` 且不存在 backend/storage/event-loss/未知 error 时允许 `needs-review`；Runtime fixture 证明 2 个完整动作仍可生成，任何附加 hard error 不会被该条件掩盖 |
| Recorder 单项 Runtime JS | 17/17 通过 | `./dist/opendesk -script tests/runtime-api/single/recorder.js -console-mode script`；`.runtime/runs/direct-20260910-163225-881000/`。覆盖有安全动作的 partial source、零安全动作 warning no-op、partial tamper `INVALID_RECORDING`，以及恢复包继续 `blocked`／`GENERATION_BLOCKED` |
| simple Custom UI gate | 通过 | `./dist/opendesk -script tests/runtime-api/recording-console-simple.js -console-mode script`；`.runtime/runs/direct-20260910-163225-746000/`。`needsReviewCalls={stop:1,build:1,generate:1,run:1,copy:0}`，证明 partial candidate 可生成、可由用户显式运行，但 Agent 静态精炼入口禁用；hard capture package `generate:0` |
| formal Custom UI gate／视觉 | 19/19 通过 | `OPENDESK_RUNTIME_API_MODE=custom-ui OPENDESK_BINARY=/Users/mac/Documents/workspace/clawdesk/dist/opendesk ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`；`.runtime/tests/runtime-api/direct-20260910-163255-588000/`。终态资源计数全为 0；已检查 `recording-console/details-generated-not-run.png` 与 `details-saved-actions-blocked.png`，内容自适应、留白、换行、控件对齐和裁切均正常 |
| 用户原始包重建 | ready、6 actions、0 issue | 当前 `dist` 重建 `rec-20260910T071420.930314000Z-2b52fa670a22` 后确定性复用 `actions.r002.json`，0 omitted；`.runtime/runs/direct-20260910-163521-010000/` |
| 用户原始包静态 candidate | generated、not-run | 新建 `generated/dq16-user-package.recipe.js` 与 `.candidate.json`，mapping 6/6；未执行脚本、未重放真实桌面输入、未声明业务结果或 qualification |
| 构建／审计 | 通过 | `make build`；main／UI host SHA-256 为 `a318951512f92799d52f9950981adfaaaf880a34a69db13c05d58ee0ae1ccf6f`／`0b827329c31784f3bdf764c5e25154c817818252e1c1f81247da25e183547b79`。`node scripts/audit_test_architecture.js`、相关 JS syntax、`runtime-api.ai.json` parse、API heading 规则和 `git diff --check` 均通过；审计证据 `.runtime/tests/test-architecture/audit.json` |

action-local 类包括可定位到具体 event/action 的 unsupported click/drag/wheel/key、missing pair、跨 pause、IME 边界歧义、无安全 target／投影和有界 context/text tracker 问题。它们保留 issue，把问题事件或动作改为 `omitted`，readiness 为 `needs-review`；其余动作继续按顺序生成，零安全动作生成显式 warning no-op。该结果只表示可运行的 partial candidate，不表示完整行为、业务成功或 production qualification。

仍会阻断的只保留 package-integrity 类，修复方法如下：

| package-integrity failure | 为什么不能局部跳过 | 修复方式 |
| --- | --- | --- |
| raw／manifest 缺失、损坏、schema／identity／hash／bytes／固定引用不一致 | 无法证明被制作的是同一份完整事实 | 从可信来源恢复原始包；不能恢复时修复保存链并重新录制，不手改 actions 绕过 strict reconstruction |
| dropped、queue overflow、accepted／persisted 不一致或其他真实 event loss | 不知道丢失动作的位置、内容和顺序 | 修复队列容量、writer 或存储故障后重新录制；缺失事件不能由相邻输入猜测 |
| terminal manifest 未可靠保存、storage/backend 终结失败、execution 中断或未知 error | 无法证明截止边界、资源释放和最后一批事件已固定 | 修复 backend／权限／存储／owner 生命周期后取得新的完整 terminal package；未知 error 在明确分类并补测试前默认 hard |
| Custom UI control input 排除边界无效、未匹配或遭修改 | 工具自身的 pause/stop/generate 点击可能被误当业务输入 | 修复 `excludeControlClick()` 事件引用、bounds 和时序匹配，再重新录制；不静默删除疑似控制输入 |

## 5. 当前动作资格

| 动作 | capture 字段 | actions | basic JS | live 状态 |
| --- | --- | --- | --- | --- |
| 单次左键 click | press/release/click、modifier、screen/display、动作级 app/window、可选 AX element | 完整配对；保存 window offset/ratio、semantic status/reason、hit/ancestors | 解析唯一当前窗口，用 `Geometry.pointOffset/contains` 生成 tagged point 后执行 `mouse.clickPoint` | 旧生成源码的 macOS Calculator 标签、actions、用户回放及 `115` oracle 通过；Geometry 收敛版需单列本轮合成与 live 状态 |
| Basic Latin 文本 | KEY_TYPED＋物理 key evidence＋动作级 app/window；可写控件另保存最终值 hash/length/patch | verified focused-value patch 优先；最终值不可用时 Basic Latin fallback 仍须完整物理证据，input-method/unknown 只降低语义资格、不阻断基础生成 | 可写控件用 `Accessibility.setValue` 并校验前后 hash；fallback 写入显式可编辑变量后使用 `keyboard.type` | current8 真实 `x` 以最终值 patch 生成并回放通过；无 AX 最终值 fallback 由 Go/Runtime 与用户失败包重建覆盖 |
| 特殊键 | 完整物理 press/release、keycode/rawcode、动作级 app/window | allowlist 内且配对完整时 ready；含 keypad Enter `0x0e1c`；同键多个 press 加一个 release 折叠为 `repeatCount` | `keyboard.press`，自动重复按有界次数逐次调用 | current8 的 keypad Enter（rawcode 76）和 ArrowLeft capture/generate/replay 通过；重复 Backspace 由 Go/Runtime 覆盖 |
| 未按键 hover move | callback 计入 observed 后 filtered，不写 raw | 无 action；可由计数审计降噪 | 无 | Go session 测试覆盖 |
| button-held motion / dragged | 完整保存路径；pointer press/release 各有 phase、动作窗口及 label-only AX traits | ≤4 points 的完整短路径归一化为 jitter click；普通 `>4` points 左键路径仍要求同显示器、≤30s、≤8 points 端点弦线偏差且无明显回退。同窗口同一 verified 可写 `textField` 可启用独立 natural text-selection predicate：偏差≤`min(16, max(8, 距离×8%))`、路径长／端点距离≤1.08，且投影不越界或明显回退；独立 source basis 固化判定来源。缺 traits、非 textField 和跨窗口不得使用语义放宽 | 新鲜投影 start/destination，`move → down → try move → finally up`；复杂、曲线、回退、跨屏和未验证路径被 omitted，其余安全动作仍可生成 | Go/Runtime latest-shape 与 negative matrix；固定失败包重建；新的真人文本选择证据 |
| vertical/horizontal wheel | wheel amount/rotation/direction、首事件坐标、display、动作级 window context | 同轴同向相邻事件形成有界 burst；旧无 context 包按已验证 display 坐标降级 | `mouse.move(point)` 后 `mouse.wheel({deltaX, deltaY, steps, delay})` | Runtime fixture 与 2026-09-09 失败包重建通过；生成物未自动回放 |
| 同一点连续 double/multi-click、right/middle | 原事实 | 问题输入 omitted、actions 为 `needs-review`；不同坐标间沿用的 native 时间序列计数按各自单次物理 click 制作 | partial candidate 不包含问题动作 | synthetic 覆盖 |
| Control/Meta/Alt click／快捷键 | modifier facts 与完整 key envelope | modified click、未知组合或缺 release 被 omitted；受支持快捷键可 ready；重复 primary press 仅在 modifier chord 一致且不超过 100 次时折叠 | `keyboard.combination`，重复动作按 `repeatCount` 逐次调用 | current8 的 Meta+A 完整 press/release、生成和 replay 通过；重复 shortcut 与 modifier 漂移由 Go 覆盖 |
| IME/dead key/composition | 物理键事实、gap、verified focused final-value patch | 最终控件值权威；没有 patch 时可表示的 Basic Latin 拼音进入未验证 fallback；不可表示的 composition/dead key 或已验证 patch 与确认键边界歧义被 omitted 并形成 `needs-review` | patch 路径通过 hash/length 前后条件执行 `Accessibility.setValue`；fallback 生成变量但不声明 finalText | current8 的 macOS 拼音候选最终提交生成“中文” patch 并 replay/oracle 通过；无 AX 最终值的基础候选可生成，生产资格仍待独立确认 |
| capture 起点 partial pointer envelope | raw 首段保留真实 drag/move/release/click 尾部 | 单一 held button 且对应 release 回到 neutral 时逐事件 excluded；不补 press、不阻断后续动作 | 无 | Go/Runtime start-boundary matrix；本次固定失败包重建 |
| 会话内 missing pair／起点未回到 neutral／long press | raw＋action-local issue | 问题事件 omitted，actions 为 `needs-review` | warning partial/no-op candidate | 私有 seam 与 Runtime fixture 已测，live 未运行 |
| dropped／unpersisted、raw/manifest 不可信、终结状态未可靠保存、Custom UI 控制边界不可验证 | raw＋manifest package-integrity issue | blocked | 不生成 | 私有 seam 与 Runtime negative fixture 已测，live 未运行 |

## 6. 真人闭环执行条件

真人 gate 只有同时满足下列条件才开始：

- 当前源码、`dist/opendesk`、必要 UI host 和静态 lib provenance 一致；
- macOS/Windows 对应系统和权限可用；
- 使用隔离、可恢复、无真实业务或外发的 fixture；
- 用户明确按 F8 开始，键盘内容明确非敏感；
- 预先冻结初始状态、操作、期望结果和独立 oracle；
- 回放是另一 invocation，并再次明确授权。

验收顺序：先 capture/stop，检查 raw、manifest、counts、控制排除和 resource zero；再从该真人录制 build actions；再生成 basic JS；恢复 fixture；最后单独回放并由 oracle 检查对象、次数和文本。任一数据缺口、storage failure、unsupported action 或错误对象都使完整闭环失败。

本轮使用用户明确允许的系统 Calculator 作为一次性非敏感 fixture，专用 JavaScript gate 记录起始 provenance、清零、通过 Runtime `mouse.click()` 发送受控全局输入并独立读取显示值，已实际启动 native listener。该 gate 是真实应用／listener 验收，不冒充真人手工输入。此后用户又通过 simple console 完成独立人工采集，所生成的 12-click 脚本已在另一 invocation 回放，并由第三个 invocation 验证显示 `115`；生成物自身仍保持 `verification: "not-run"`，资格只属于对应 run-scoped evidence。

current8 另从仓库根目录原样运行公开 `recording-console-simple.js` 命令，在隔离、可恢复的 AppKit 文本目标上完成受控真实 keypad Enter、ArrowLeft、Basic Latin、Meta+A 和拼音候选提交。停止后包为 `stopped/saved`、actions ready，随后恢复精确初始值 `Ada`，在一次明确的 generated-script run 中成功 replay，并由独立 AX oracle 验证最终值“中文”。该资格只属于 4.15 固定的 pair、录制包和 replay run；失败的中间尝试继续保留为失败，不得改写成通过。完整 Custom UI 的真人业务采集仍未另行完成。

## 7. 下游语义工作流接续

| 项目 | 固定交接 |
| --- | --- |
| 输入 | actions exact file/revision/hash、raw ref/hash、basic candidate/hash、环境、用户目标／预期结果、实际 evidence 或 missing reason；AppProfile 只引用真实版本；增强点击还需引用 target/context crop 与 Native/OCR/visual observations |
| 下游责任 | 目标／业务对象、文字与图形证据绑定、定位、等待、验证、参数、普通函数和代码质量；不再次实现 listener |
| 输出 | 新 semantic candidate JS、引用规则、每项修改理由、适用条件和独立 verification；不覆盖 basic candidate/raw；locator 必须能追到具体 evidence |
| 失败返回 | facts/crop/mapping→H2；grouping→H3；intent/text→H4；target/text-binding/locator→H5；code→H6；authority/success criteria→H1 |

下游统一从仓库内 [`human-to-recipe` Skill](../skills/human-to-recipe/SKILL.md) 进入；它在需要 target／locator 加固时再遵循 `application-engineer`，但 human raw/actions 仍保持独立 lineage，不能伪装 Agent demonstration。当前已实现最小 SemanticBuildPlan schema 和 validator，通用 renderer、OCR extractor/binder 与用户级 Skill 安装仍不存在；Calculator golden 和静态断言只校准已冻结规则，不冒充 live 或整条一键生成系统。

## 8. 硬性失败条件

- 未收到真实 `HOOK_ENABLED` 就返回 session；
- stop 前没有固定截止，或 hook 未退仍写成 stopped；
- accepted 事件未排空、drop 不可见、storage failure 写 saved；
- 未按键 hover move 继续写入 v2 raw，或过滤后没有 `filtered` 计数；
- 键盘范围外事件先保存后删除；
- v2 action 没有已验证的应用／窗口上下文仍标 ready，或只用旧 PID/handle/screen point 回放；
- 同应用多个窗口无法唯一解析时仍发送输入；
- AX 失败后伪造按钮文字，读取 AXValue／安全内容，或把 OCR 字符串冒充原始事实；
- OCR observation 缺 source image/hash、bbox、坐标映射、engine/version 等来源仍标 `extracted`／`verified`；
- 只得到 OCR 文字却没有判断它属于目标本身、周边 label、父区域还是其他业务对象，就直接生成文字 locator；
- Native/OCR/模型文字冲突时静默选择一个覆盖其他来源；
- OCR 为空时给无文字图标补造文字，或图标识别正确但业务归属未验证仍标 target verified；
- locator 在建模原图命中一次就晋级，未用新观察做重新定位；
- `>4` points drag 被静默变成 click，或复杂／曲线／跨屏 drag 被当成受支持直线 drag；
- actions/代码从旧内存而不是实际固定文件生成；
- raw 和 actions 同时回放，或 recipe 循环解释 actions；
- 生成覆盖人工代码，或 `approved` 字段赋予执行权限；
- 自动运行刚生成的脚本；
- synthetic/cross-build/API resolve 冒充真人 capture、目标系统 live 或业务成功。

## 9. 下一批最小范围

下一批语义增强优先完成“点击目标多源证据闭环”，而不是继续只扩无文字图标描述：在不改 raw、不创建第二 Recorder 或第二 AppProfile 的前提下，落地显式 `target-crop`／必要 context crop、OCR provenance、文字与目标关系 binder、locator portfolio 和新观察 relocalization；用 4.14 的 `text-button`、`icon-only`、`text+icon`、`duplicate-same-text-or-icon`、`surrounding-label` 五类 fixture 分层验收。实现顺序应允许 OCR extractor、binder、locator qualification 各自独立测试，任一层失败都保留上游证据并 fail closed。

下一应用仍建议选择 TextEdit，但应在上述基础结构足够后取得新的 human Recorder v2 包和用户明确业务目标／成功条件，再用同一 Skill/plan/gate 分层校准；不得从现有 TextEdit 示例预填保存、编辑或其他业务意图。通用 renderer、focused-element 和第二应用 human golden 可随后推进；不要回到 native listener、不改 raw、不创建专用 Replay Runtime，也不要把[多应用自动化高频框架能力](../../../docs/frameworks/multi-application-automation-primitives.md)中的路线图方法名提前写进代码。
