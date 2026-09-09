---
title: "人工 Recorder｜实施与验收计划"
description: "当前 Recorder 实施状态、分层命令、证据、未运行项目与下一批语义交接。"
order: 30
---

# 人工 Recorder｜实施与验收计划

状态：Recorder 数据合同 v2、合成文件闭环与 macOS Calculator 真实 native capture／按钮语义已实施并验收，2026-09-09。本文只记录当前工作树的真实完成与验收边界；H1—H8 完整作业仍以 [任务分解](task-decomposition.md) 为准，DQ-01—DQ-08 规范性决定和唯一技术方案见 [Recorder 工程设计](recorder-design.md)。

## 1. 本轮验收目标

本轮基础链固定为：明确本地授权 → libuiohook native 事件 → hover 降噪 raw writer＋动作上下文 resolver → 独立 stop → `Recorder.buildActions()` → 独立 `Recorder.generateScript()` → 窗口相对 basic JS → 另一次明确授权回放和独立结果核对。

实现和测试不能把下列事项合并为一个“录制成功”：

1. listener 是否真实就绪并属于当前 execution；
2. stop 是否确认 callback 退出并保存已接收事件；
3. raw／manifest 是否完整可校验；
4. actions 是否 ready；
5. basic candidate 是否生成且未覆盖旧文件；
6. candidate 是否在独立 invocation 实际运行；
7. fixture 业务结果是否由独立 oracle 通过。

当前 1—5 已在 macOS Calculator fixture 完成真实 listener、动作级窗口上下文、按钮标签语义和文件链验收；6、7 的独立真实回放与回放后业务 oracle 未运行。合成 raw 和替身执行不标作真人输入，Calculator evidence 标记为真实 native capture＋受控输入。

### 1.1 数据质量门槛

本轮使用固定 100 分量表，结果为 **98/100**，达到用户要求的 95 分门槛。评分维度固定为输入降噪 15、动作完整性 15、应用／多窗口身份 20、坐标迁移 20、控件语义与隐私 15、fail-closed 生成 10、文档／兼容／验证 5。扣 1 分是 basic 尚未把 AX 证据自动提升为通用 locator；另扣 1 分是 Windows/Linux 目标系统 live 未运行。详细量表和可清理运行证据见 [Recorder 数据质量 v2 验收](../../../docs/quality/recorder-data-quality-v2.md)。

## 2. 实际工作包状态

| 工作包 | 当前状态 | 实际成果 | 未完成或未运行 |
| --- | --- | --- | --- |
| WP0 源码和规则核查 | 完成 | 核对 Runtime 初始化、polyfill 顺序、File/path、mouse/keyboard/window/display、execution 生命周期、Agent MCP Recorder 和下游现有方法 | 无附件包可读取；未声称读取不存在附件 |
| WP1 native capture owner | 已实施，macOS live 通过 | libuiohook 1.2.2、单 adapter、process lease、真实 ready、desktop capture、button-held-only motion policy、bounded event/context queues、deadline、stop/drain、manifest、resource counts | Windows 真实 listener、X11 live |
| WP2 动作上下文与 actions | 已实施并通过合成与 macOS live | application/window/element 分层；稳定应用身份与瞬态 PID/handle 分离；窗口 offset/ratio；AX point-hit＋最多 6 层 actionable ancestor；fixed raw/hash、唯一 grouping、pause boundary、revision、disposition/readiness/issues | 键盘 focused-element 语义、Windows/Linux target semantics live |
| WP3 basic JS 生成 | 已实施并隔离验证 | 每动作重新解析当前应用窗口；同应用多窗口无歧义门；按新 bounds＋offset 重算；strict actions/hash、白名单 JS、candidate、exclusive create、替身执行 | 语义 locator、resize/layout adaptation、真实桌面回放和业务 oracle |
| WP4 正常用户入口 | 已实施；simple console 当前构建视觉通过；专用 macOS live gate 通过 | `record.js` 快捷键；完整和 simple 原生控制台；默认 `target-semantics`；Calculator 真实 listener、点击、暂停、恢复、按钮标签、停止、制作和生成 | Custom UI 人工业务采集；生成 candidate 的真实回放 |
| WP5 下游语义增强交接 | 设计冻结 | human lineage 输入／输出／失败 H1—H6 返回；AX 标签作为证据而非已验证业务意图；只读列出现有 application-engineer 和共享合同 | focused-element、显式 target-crop OCR、通用 locator 与 postcondition；不创建第二 listener |

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
| 真实回放／回放后业务 oracle | 未运行 | basic candidate 已生成且保持 `verification: "not-run"`；未把生成、API resolve 或当前录制后画面冒充独立回放成功 |

用户提供的旧包 `rec-20260909T102712.649528000Z-a299028412fa` 是 v1：70 条 raw 中 67 条为普通 move、只有一组 click，且 `scope-changed` 令状态为 failed。它用于证明问题基线，不计作 v2 通过证据，也不会被原地改写。

## 5. 当前动作资格

| 动作 | capture 字段 | actions | basic JS | live 状态 |
| --- | --- | --- | --- | --- |
| 单次左键 click | press/release/click、modifier、screen/display、动作级 app/window、可选 AX element | 完整配对；保存 window offset/ratio、semantic status/reason、hit/ancestors | 解析唯一当前窗口，以新 bounds＋offset 执行 `mouse.click` | macOS Calculator 标签与 actions 通过；独立回放未运行 |
| Basic Latin 文本 | KEY_TYPED＋物理 key evidence＋动作级 app/window | 无 Ctrl/Meta/Alt 且非 composition 时 ready；element 为 not-applicable | 解析并确认当前活动窗口后 `keyboard.type` | 合成通过；真实键盘未运行 |
| 未按键 hover move | callback 计入 observed 后 filtered，不写 raw | 无 action；可由计数审计降噪 | 无 | Go session 测试覆盖 |
| button-held motion / dragged | 完整保留路径 | ≤4 logical points 的完整 press/motion/release 可归一化为 jitter click；其余为 drag issue | jitter click 或 blocked | Go 与 JS composition 测试覆盖 |
| double/right/middle/wheel | 原事实 | blocked | 无 | 未运行 |
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

本轮使用用户明确允许的系统 Calculator 作为一次性非敏感 fixture，专用 JavaScript gate 记录起始 provenance、清零、通过 Runtime `mouse.click()` 发送受控全局输入并独立读取显示值，已实际启动 native listener。该 gate 是真实应用／listener 验收，不冒充真人手工输入。公开 F8 和 Custom UI 的人工采集没有另行完成，生成脚本也没有在独立 invocation 回放，因此它们分别保持未运行，candidate 保持 `verification: "not-run"`。

## 7. 下游语义工作流接续

| 项目 | 固定交接 |
| --- | --- |
| 输入 | actions exact file/revision/hash、raw ref/hash、basic candidate/hash、环境、用户目标／预期结果、实际 evidence 或 missing reason；AppProfile 只引用真实版本 |
| 下游责任 | 目标／业务对象、定位、等待、验证、参数、普通函数和代码质量；不再次实现 listener |
| 输出 | 新 semantic candidate JS、引用规则、每项修改理由、适用条件和独立 verification；不覆盖 basic candidate/raw |
| 失败返回 | facts→H2；grouping→H3；intent/text→H4；target/locator→H5；code→H6；authority/success criteria→H1 |

可直接借用 `application-engineer` 的 discover/harden/repair 方法和共享合同的 recipe-build/recipe-qualify 职责，但 human raw/actions 需要 lineage adapter，不能伪装 Agent demonstration。当前不存在已安装的 human Skill 或自动 validator；本轮不批量创建。

## 8. 硬性失败条件

- 未收到真实 `HOOK_ENABLED` 就返回 session；
- stop 前没有固定截止，或 hook 未退仍写成 stopped；
- accepted 事件未排空、drop 不可见、storage failure 写 saved；
- 未按键 hover move 继续写入 v2 raw，或过滤后没有 `filtered` 计数；
- 键盘范围外事件先保存后删除；
- v2 action 没有已验证的应用／窗口上下文仍标 ready，或只用旧 PID/handle/screen point 回放；
- 同应用多个窗口无法唯一解析时仍发送输入；
- AX 失败后伪造按钮文字，读取 AXValue／安全内容，或把 OCR 字符串冒充原始事实；
- drag/double/control/composition 被静默变成 click/text；
- actions/代码从旧内存而不是实际固定文件生成；
- raw 和 actions 同时回放，或 recipe 循环解释 actions；
- 生成覆盖人工代码，或 `approved` 字段赋予执行权限；
- 自动运行刚生成的脚本；
- synthetic/cross-build/API resolve 冒充真人 capture、目标系统 live 或业务成功。

## 9. 下一批最小范围

下一批按文档驱动顺序选择最小增强：先为键盘动作增加不读取值的 focused-element 标签；再定义显式 `target-crop` OCR observation（裁剪、hash、坐标、引擎版本、候选与置信度）；最后定义 AX/文字/图像 locator 的唯一性、可见／启用状态和歧义拒绝规则。随后才接入 human lineage adapter，生成独立 semantic candidate JS 并做真实回放／业务 oracle。不要回到 native listener、不改 raw、不创建第二 Recorder、AppProfile 或专用 Replay Runtime；每项必须先扩展 DQ requirement，再实现和验收。
