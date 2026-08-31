# Calculator PID 定向公式链 Playbook

## 定位

本 Playbook 是 macOS Calculator 的一个受限、可验证 Workflow 示例：在满足严格前置条件时，使用 `mouse.clickForPID` 对已验证的 `AXButton` 执行 `AXPress`。

它说明 `((12 + 7) × 3) − 5 = 52` 的状态闭环；默认只做无点击自检。它不把已验证的 `mouse.clickForPID` 语义扩展为全局点击、画布、拖拽或原始 mouse down/up。

## 一、Business Goal

在已确认的 Calculator 窗口中按下以下按钮，并证明显示值依次符合预期：

```text
1 → 2 → + → 7 → = → × → 3 → = → − → 5 → =
```

```text
0 → 1 → 12 → 12 → 7 → 19 → 19 → 3 → 57 → 57 → 5 → 52
```

本示例的正常验收是 11 次动作、最终显示 `52`、零误点、零自动重试和零补点。任何身份、状态或定位不符合时立即停止，不执行余下动作。

## 二、App Profile 与动作前置条件

- 应用：macOS Calculator。
- bundle ID：`com.apple.calculator`。
- bundle path：`/System/Applications/Calculator.app`。
- 每次动作前都必须从 watcher 读取新鲜 AX 状态，确认 PID、bundle、path、唯一窗口、窗口号、窗口 bounds、显示器和每个目标的 AX 命中。
- 窗口必须是当前前台窗口，且窗口尺寸为已审查的 `232 × 321`。PID、window ID 与窗口原点都是当前运行现场值，不得复用历史记录。
- 运行宿主须具有 Accessibility；为了验证和保存截图，还须具有 Screen Recording。脚本会检查 runtime 权限和 watcher 权限状态。
- 每个点击点必须落在当前窗口和当前活动显示器中，命中元素须属于同一 PID、角色为 `AXButton`、声明 `AXPress` 且标签匹配。

`mouse.clickForPID` 只执行一次 PID 定向 `AXPress`。它不发送 CoreGraphics down/up；不支持 `AXPress` 的目标必须报错，绝不能回退到全局 `mouse.click`。

## 三、Locator / Geometry

所有点均从**当前** Calculator 窗口原点计算：`screenPoint = window.bounds.{x,y} + relative.{x,y}`。下表的相对坐标是本窗口形态经审查的控制点，不是历史屏幕坐标。

| Target | 标签 | 相对坐标 |
| --- | --- | --- |
| `one` | `1` | `(28, 249)` |
| `two` | `2` | `(86, 249)` |
| `add` | `+` | `(202, 249)` |
| `seven` | `7` | `(28, 153)` |
| `equals` | `=` | `(202, 297)` |
| `multiply` | `×` | `(202, 153)` |
| `three` | `3` | `(144, 249)` |
| `subtract` | `−` | `(202, 201)` |
| `five` | `5` | `(86, 201)` |

## 四、State 与 Verified Action

每一步执行如下闭环：

```text
读取新鲜 watcher 状态
→ 验证身份、窗口、显示器、AXButton 和坐标
→ await 一次 mouse.clickForPID(pid, x, y)
→ 等待 timestamp 严格晚于 action start 的新状态
→ 验证显示值
```

`+`、`×`、`−` 在被按下时显示保持不变，因此不能只以同一个显示值证明运算符已生效。它们分别由下一操作数 `7`、`3`、`5` 产生的新显示状态延迟验证；contract 中的 `verifyAt` 和 `verifies` 显式记录这项依赖。

## 五、Failure / Recovery

本 Playbook 采用 fail-closed：任何无效配置、过期 watcher 状态、权限变化、PID/bundle/path/window/display/AXPress 校验失败、动作错误、过期时间戳或非预期显示值都会 `throw`。后续步骤不会执行。

- 自动重试：`0`。
- 补点：`0`。
- 全局点击回退：`0`。
- 对异常显示（例如第 4 步得到 `127`）：恰好保留前 4 次调用和当前 Evidence，立即停止。

本示例没有自动恢复动作；重新准备干净的应用状态、fresh watcher 和新的短时授权，应由操作者在一次失败后重新发起。

## 六、Watcher、Evidence 与验收

live config 指向由只读 AX watcher 原子更新的 `current-state.json`。每份状态至少包含递增 `sequence`、新鲜 `timestampEpochMs`、权限、application、frontmost、唯一窗口、显示器、主显示值和每个目标的 AX hit。脚本不写 watcher 状态，也不移动窗口。

一次 live run 必须写入 `.runtime/runs/macos-calculator-formula-chain/run-.../`：

- `runtime-report.json`：模式、状态序列、步骤、计数、错误和最终验收。
- `trace.ndjson`：preflight、每次动作开始、动作后验证或失败事件。
- `pre.png`、每步 PNG 与 `final.png`：当前窗口截图。
- 每步 `step-*.json`：前后状态、点位、时间和错误。

验收标准是：11 个步骤全部成功、状态序列与本 Playbook 一致、最终显示 `52`、`actions_executed=11`、`misclicks=0`、`automatic_retries=0`、`supplemental_clicks=0`。模拟 harness 还必须验证第 4 步注入 `127` 时调用数为 4 且没有重试或补点。

## 七、默认自检与 live 执行

默认无配置或配置未明确 `execute: true` 时，下面命令只验证 contract、公式与 API 存在性，并将 `actions_executed=0` 的报告写到 `.runtime/runs/`：

```sh
.runtime/bin/clawdesk-js-runtime -script examples/mac/calculator_mouse_pid_formula_chain/run.js
```

只可在操作者另行创建的新鲜、短时、一次性 armed live config，并启动只读 watcher 后执行相同命令。不得把真实 Calculator 算术点击作为静态检查或模拟回归的一部分。

## 八、文档驱动 contract

本文件是按钮、步骤、相对坐标、状态和验证依赖的单一来源。`run.js` 只从下面标记中的严格 JSON 读取数据并执行 `JSON.parse` 与 schema 校验；它不会 `eval` Markdown、自由文本或代码块。回归 harness 由实际的 `PLAYBOOK.md` 和 `run.js` 驱动，防止步骤定义漂移。

<!-- PLAYBOOK_CONTRACT
{
  "schemaVersion": 1,
  "formula": "((12 + 7) × 3) − 5 = 52",
  "initialDisplay": "0",
  "app": {
    "bundleID": "com.apple.calculator",
    "bundlePath": "/System/Applications/Calculator.app",
    "window": { "width": 232, "height": 321 }
  },
  "buttons": {
    "one": { "label": "1", "relative": { "x": 28, "y": 249 }, "axLabels": ["1"] },
    "two": { "label": "2", "relative": { "x": 86, "y": 249 }, "axLabels": ["2"] },
    "add": { "label": "+", "relative": { "x": 202, "y": 249 }, "axLabels": ["+", "Add", "加"] },
    "seven": { "label": "7", "relative": { "x": 28, "y": 153 }, "axLabels": ["7"] },
    "equals": { "label": "=", "relative": { "x": 202, "y": 297 }, "axLabels": ["=", "Equals", "等于"] },
    "multiply": { "label": "×", "relative": { "x": 202, "y": 153 }, "axLabels": ["*", "x", "X", "×", "Multiply", "乘"] },
    "three": { "label": "3", "relative": { "x": 144, "y": 249 }, "axLabels": ["3"] },
    "subtract": { "label": "−", "relative": { "x": 202, "y": 201 }, "axLabels": ["-", "−", "Subtract", "减"] },
    "five": { "label": "5", "relative": { "x": 86, "y": 201 }, "axLabels": ["5"] }
  },
  "steps": [
    { "number": 1, "action": "输入 1", "target": "one", "before": "0", "after": "1" },
    { "number": 2, "action": "输入 2，组成 12", "target": "two", "before": "1", "after": "12" },
    { "number": 3, "action": "选择加法", "target": "add", "before": "12", "after": "12", "verifyAt": 4 },
    { "number": 4, "action": "输入第二个加数 7", "target": "seven", "before": "12", "after": "7", "verifies": 3 },
    { "number": 5, "action": "计算 12 + 7", "target": "equals", "before": "7", "after": "19" },
    { "number": 6, "action": "选择乘法", "target": "multiply", "before": "19", "after": "19", "verifyAt": 7 },
    { "number": 7, "action": "输入乘数 3", "target": "three", "before": "19", "after": "3", "verifies": 6 },
    { "number": 8, "action": "计算 19 × 3", "target": "equals", "before": "3", "after": "57" },
    { "number": 9, "action": "选择减法", "target": "subtract", "before": "57", "after": "57", "verifyAt": 10 },
    { "number": 10, "action": "输入减数 5", "target": "five", "before": "57", "after": "5", "verifies": 9 },
    { "number": 11, "action": "计算 57 − 5", "target": "equals", "before": "5", "after": "52" }
  ]
}
-->
