# Calculator：使用实际结果继续计算

维护入口是 [calculator.js](calculator.js)。固定业务：按钮完成 `25 × 4 + 10`，读取 `firstResult`，再按钮完成 `6 × firstResult`，读取并输出 `finalResult`。不在 JavaScript 中计算业务答案。

## 怎样核对正确性

**先看源码的数据流，再看同次运行的动作回执与独立显示，最后打开截图。** 2026-09-18 的固定场景有这些证据；2026-09-19 重新核对文件与原图，没有新增桌面运行，也没有代替用户验收。下面的链接指向该次运行，复验时改看新命令输出的 `runRoot` 中同名文件。

| 用户要求 | 关键环节 | 实际关键文件 | 检测方法 | 成功条件 | 已核事实／局限 |
| --- | --- | --- | --- | --- | --- |
| 实际首值用于下一步 | 静态数据流 | [calculator.js](calculator.js)，`main()` 第 96–102 行 | 沿 `readCalculatorResult` → `firstResult` → 第二次调用追踪；检查 helper 返回值 | 值只来自本次 UI；第二段展开此字符串；110/660 不进入生产代码 | 符合；静态检查本身不证明执行发生 |
| 重复点击可复用，清空明确 | 函数合同 | [calculator.js](calculator.js) 的三个函数；下方合同表 | 分别看参数、返回和调用顺序 | click 只点参数；clear 明确调用；read 只读 | 主流程清空两次；输入语法可接受不等于所有组合已测 |
| 测的是这份脚本 | hash／引用 | [运行快照][snapshot]、[冻结清单][freeze]、[运行前][before]／[运行后][after] | 对照源码 SHA-256、快照和依赖 | 同一源码、同一依赖；先冻结后执行 | 当前源码及 49 项依赖仍一致；hash 只证明字节绑定 |
| 按钮完成两段运算 | 真实桌面动作 | [候选执行摘要][candidate] 的最后一条 `scriptLogs.message` | 展开 `firstInput/secondInput.completed`，逐项看 locator、backend、actionState | 顺序为 `2 5 × 4 + 1 0 =`、`6 × 1 1 0 =`；共 14 项原生确认 | 全部 `macos-ax / acknowledged`；回执由已审源码原样返回，不是 OS 物理点击监听 |
| 结果确实在 UI 出现 | 独立结果读取 | [清洁起点][clean]、[中途观察][witness]、[最终观察][final] 的末条日志 | 看 `firstRead/secondRead/afterCaptureRead` 与 `observations` | 起点三次 0；先出现 110、随后清零；最终三次 660 | 记录吻合；观察器不加载候选、不向候选供值，但共用 Runtime／AX 后端 |
| 数值和窗口可见 | 截图视觉 | [起点 0][image-clean]、[首值 110][image-first]、[最终 660][image-final] | 直接打开三个原始 PNG | 数值正确、完整窗口、无裁切、按键对齐 | Agent 已重新读图确认；自动测试只检查截图记录，不能代替看图 |
| 用户可以接受交付 | 人类验收 | 本表及上述原文件 | 用户逐项审阅要求、源码和证据 | 用户认为依据足以支持本次要求 | 尚未发生；机器 PASS 或 Agent 读图不代表用户确认 |

这里的“独立”指另一个只读 Execution 自己重新解析窗口、读取显示；不代表另一套 Runtime 实现、盲上下文测试或人工审阅。候选日志单独不足以证明数据来源，截图单独也不足以证明因果；结论依赖源码、运行快照、原生回执和独立显示相互对照。

## 两个运行入口

工作目录为仓库根 `/Users/mac/Documents/workspace/clawdesk`。先打开本机 Calculator Basic 窗口（232×321，原生清除名称为“清除／全部清除”），保持桌面空闲。命令会激活并清空 Calculator；其他应用、未知输入结果或不同布局应先处理，不能盲目重跑。

普通运行：

```bash
./dist/opendesk -script examples/agent-to-recipe/calculator.js -console-mode script
```

Runtime 每次把源码快照和日志保存到新的 `.runtime/runs/<executionId>/`；终端 JSON 的 `firstResult`、`finalResult` 是实际 UI 字符串，`firstInput`、`secondInput` 是框架原样返回的动作回执。

真实资格测试：

```bash
node tests/workflows/calculator/qualify.cjs
```

测试每次创建 `.runtime/tests/workflows/calculator/<时间-PID>/`，结束时打印 `runRoot`。依次核对作者冻结绑定、记录本次依赖、无输入预检、准备清洁状态、独立观察 `0`、启动只读 witness、执行原样候选、独立观察最终值，再核对回执及前后依赖。witness 保存首值与显示变化，不向候选传值或操作按钮。

在新 `runRoot` 中先打开 `test-result.json`：自动业务通过应有 `verdict: "pass"`、`firstResult: "110"`、`finalResult: "660"`、`secondActions: ["6","×","1","1","0","="]`。再按上表打开原始摘要及三张图片；`visualReview: "not-run: inspect the saved PNG bytes separately"` 是预期状态，表示自动程序没有看图。缺图、图中值不符或布局异常时，完整视觉验收仍失败。110/660 在这里是测试期望。

只检查文件和语法可运行 `node tests/workflows/calculator/qualify.cjs --check`；只观察当前窗口用 `--preflight`。前者不启动 Runtime，后者不激活或点击窗口；都不等于业务资格通过。

## 函数参数、返回与副作用

| 函数 | 参数与返回 | 副作用 |
| --- | --- | --- |
| `clickCalculatorButtons(win, buttons)` | 当前 WindowInfo；1..16 项稠密按钮数组；返回原样 `UI.tapTargets` 回执 | 仅点击所给按钮；不清空、不补等号 |
| `clearCalculator(win)` | 当前窗口；成功返回 void | 按实际 C→AC 状态有界清空，回读 0 |
| `readCalculatorResult(win)` | 返回两次相同的实际 UI 字符串，限无符号整数 ≤12 位 | 只读 |
| `main()` | 无参数；返回两个实际值及两段动作回执 | 明确清空两次并串联业务 |

调用示意直接见 `main()`：先显式 `clearCalculator(win)`，再 `clickCalculatorButtons(win, ['2','5','×','4','+','1','0','='])`，用 `readCalculatorResult(win)` 得到首值；第二次数组为 `['6','×', ...firstResult, '=']`。普通函数在同一文件复用，不假定跨文件模块接口。

剩余辅助代码保护窗口身份/焦点/布局、目标唯一且可用、读值稳定、清空语义和有界输入。这些属于运行必要条件。生产代码没有期望 110/660、截图、证据写盘、测试 verdict 或独立 Oracle；返回原生动作回执是为了调用者能区分“输入已确认”与“业务结果正确”，不代表独立验收。

支持资格只针对上述固定场景。接受 0..9/×/+/= 的语法不表示任意组合、长度、负数、小数、布局、平台、故障恢复已通过。任何失败立即结束，不自动重放；测试保留失败目录和 `inputStarted`，后续先观察现场。修改代码后 `spec.json` 的旧 hash 会阻止 live gate，应按工作流形成新候选和新资格。

## 复验前提与证据寿命

这条测试命令是**绑定本机作者证据的资格入口**，并非新 checkout 即可运行的自包含测试。它先读取 [spec.json](../../tests/workflows/calculator/spec.json) 指向的 `candidate-q002.json`，再校验上游、binary、polyfills、jslibs、测试及 API 正文。普通 JS 不依赖这份作者任务包。

若 `.runtime` 被清理或文件发生变化，测试会在桌面输入前失败；看新目录 `test-result.json` 的 `message` 和 `inputStarted`。缺失证据时，由维护者从保留的真实资料恢复并核验原 hash，或按 [工作流](../../workflows/agent-to-recipe/WORKFLOW.md) 建立新的冻结候选、请求和资格；不手改 hash 绕过检查，不复制旧 PASS。执行开始后的失败也保留现场与目录，先独立观察再决定下一步，不自动重放。

当前已核对的源码 SHA-256 为 `a62c72aa2b00f256755aac2524d14e4655a88194c012bf6765f0d314a62774cc`。七类产物职责、复用／修订、前次取证混入生产的原因、精确构建版本及未提交范围，见 [质量报告](../../docs/quality/agent-to-recipe-calculator-r003.md)。源码、测试、README 可维护；运行证据留在 `.runtime`，不提交。失去原始证据后，报告不再构成可复核闭包。

[snapshot]: ../../.runtime/tests/workflows/calculator/2026-09-18T15-45-08-040Z-75772/candidate/script_snapshot.js
[freeze]: ../../.runtime/tests/workflows/calculator/2026-09-18T15-45-08-040Z-75772/run-freeze.json
[before]: ../../.runtime/tests/workflows/calculator/2026-09-18T15-45-08-040Z-75772/dependencies-before.json
[after]: ../../.runtime/tests/workflows/calculator/2026-09-18T15-45-08-040Z-75772/dependencies-after.json
[candidate]: ../../.runtime/tests/workflows/calculator/2026-09-18T15-45-08-040Z-75772/candidate/agent_summary.json
[clean]: ../../.runtime/tests/workflows/calculator/2026-09-18T15-45-08-040Z-75772/clean-observer/agent_summary.json
[witness]: ../../.runtime/tests/workflows/calculator/2026-09-18T15-45-08-040Z-75772/live-witness/agent_summary.json
[final]: ../../.runtime/tests/workflows/calculator/2026-09-18T15-45-08-040Z-75772/final-observer/agent_summary.json
[image-clean]: ../../.runtime/tests/workflows/calculator/2026-09-18T15-45-08-040Z-75772/clean-observer/calculator.png
[image-first]: ../../.runtime/tests/workflows/calculator/2026-09-18T15-45-08-040Z-75772/live-witness/first-result.png
[image-final]: ../../.runtime/tests/workflows/calculator/2026-09-18T15-45-08-040Z-75772/final-observer/calculator.png
