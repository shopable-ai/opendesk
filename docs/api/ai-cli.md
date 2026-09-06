---
title: AI CLI
description: 面向 Codex、Claude Code 与 shell Coding Agent 的低 Token OpenDesk 桌面工具接口。
order: 3
---

# AI CLI

`opendesk ai` 是 Stable Desktop Runtime 的薄 CLI 适配层，面向 Codex、Claude Code 和其他
shell Coding Agent。它不会重做截图、窗口、输入或 Vision backend；你的使用顺序通常是
发现能力 → 找窗口 → 截取最小区域 → 执行动作 → 验证 → 保存 recipe。

## 最快开始

安装 OpenDesk 后，让 Agent 先读取当前机器实际可用的能力：

```bash
./opendesk ai capabilities
./opendesk ai windows
./opendesk ai screenshot --active-window
```

当目标已知时，优先使用窗口和 ROI，而不是整屏截图：

```bash
./opendesk ai screenshot --window-title "TextEdit" --region-relative 0.05,0.10,0.90,0.70
```

复杂且已验证的流程应保存为可阅读、可版本控制的普通 JavaScript Workflow：

```bash
./dist/opendesk ai run workflows/macos/calculator/calculate-and-reuse-result.js
```

Workflow 把 Goal、Success Criteria、业务步骤与验证写在脚本中；默认不要求 `--input`。
`Execution.input` 默认为 `{}`，只作为部署配置或确有必要变化的业务数据的可选覆盖。作者约定和
当前边界见 [`workflows/README.md`](../../workflows/README.md)。

`schema` 是全部命令和参数的机器可读索引；下一节说明所有命令共用的输出与错误 contract。

## JSON output contract

所有 AI CLI 命令的 stdout 都只输出一个 JSON envelope；诊断写到 stderr，执行证据写到
`.runtime/ai/<executionId>/`。成功形态为 `{"ok":true,"command":"...","result":...}`；失败
形态为 `{"ok":false,"command":"...","error":{"code":"...","message":"..."}}`。

错误 code 包括：`invalid_command`、`invalid_argument`、`invalid_json`、`window_not_found`、
`permission_required`、`unsupported_platform`、`capability_unavailable`、`capture_failed`、
`vision_failed`、`execution_failed`、`timeout`、`internal_error`。退出码为 0（成功）、2（输入/命令
错误）、3（平台/能力不可用）、4（权限）、5（执行目标失败）或 1（内部错误）。

## Discover first

```bash
./opendesk ai capabilities
./opendesk ai schema
./opendesk ai windows --title TextEdit
```

`capabilities` 会结合当前平台和 macOS Screen Recording / Accessibility preflight 报告
`supported`、`conditional` 或 `unsupported`，不把所有能力硬编码成 true。`schema` 由 CLI
registry 生成，是 Agent 应优先读取的紧凑参数索引。

这里的 CLI capability 是桌面工具 preflight，不等于任意元素支持原生动作。JavaScript recipe 应再读取
`Accessibility.getCapabilities()`，区分宿主授权、后端实现和 OS 权限；该同步查询不会扫描目标或弹窗。

## Command tree

```text
./opendesk ai
  capabilities | schema
  windows
  window active|find|focus|bounds|move|resize|maximize|minimize|restore|close|content
  screen list|info|pixel
  screenshot
  mouse position|move|click|double-click|down|up|drag
  keyboard type|press|hotkey
  scroll
  clipboard get|set|clear
  app open|open-url
  vision ocr|detect-ui
  image match|color|pixel|size
  system info|processes|metrics
  run
```

| Stable Runtime API | AI CLI | Notes |
| --- | --- | --- |
| `window` | `windows`, `window ...` | Uses the existing platform window manager; platform capability is reported first. |
| `page.screenshot`, `Screen` | `screenshot`, `screen ...` | PNG path artifact by default; never base64 on stdout. |
| `mouse`, `keyboard` | `mouse ...`, `keyboard ...`, `scroll` | Uses global desktop semantics after an optional target-window focus. |
| `clipboard`, `page.openApp/openURL` | `clipboard ...`, `app ...` | Does not imply browser DOM automation. |
| `Vision` | `vision ocr`, `vision detect-ui` | Raw provider output is opt-in with `--include-raw`. |
| `ImageColor` | `image match|color|pixel|size` | Secondary pixel/template primitive, not semantic verification. |
| `System` read APIs | `system info|processes|metrics` | Bounded process listing; no power or process-kill CLI facade. |
| JavaScript Execution Runtime | `run` | Reuses Execution, artifacts, timeout, events, and `Execution.input`. |

`File` is intentionally not a generic agent file-system facade: Coding Agents already have a shell and should
keep file authority explicit. Experimental `NativeExtensions`, unsafe diagnostics, destructive System controls,
and compatibility Browser facades are also intentionally not exposed through this default tool surface.

## Targeted screenshots and coordinates

```bash
./opendesk ai screenshot --active-window

./opendesk ai screenshot --window-title "TextEdit"

./opendesk ai screenshot --screen --display 0

./opendesk ai screenshot --screen --region 100,100,600,400

./opendesk ai screenshot --window-title "TextEdit" --region 20,80,800,500

./opendesk ai screenshot --window-title "TextEdit" --region-relative 0.05,0.10,0.90,0.70
```

AI CLI display indices are zero-based. A `--region` with `--active-window` or `--window-title` is window-local;
OpenDesk resolves it against freshly read current window bounds. `--region-relative` is always relative to a target
window and accepts `xRatio,yRatio,widthRatio,heightRatio` in `[0,1]`. A named screenshot focuses the matching
window first, then obtains fresh bounds, because the stable backend only promises reliable active-window capture.

Default screenshot output is a compact artifact descriptor such as:

```json
{"ok":true,"command":"screenshot","result":{"path":"/workspace/.runtime/ai/ai-.../screenshot.png","mimeType":"image/png","width":800,"height":500,"sizeBytes":48321}}
```

## Deterministic actions

```bash
./opendesk ai mouse click --window-title "TextEdit" --x 300 --y 200
./opendesk ai mouse click --window-title "TextEdit" --relative-x 0.5 --relative-y 0.8
./opendesk ai keyboard type --window-title "TextEdit" --text "Hello"
./opendesk ai keyboard hotkey --window-title "TextEdit" --keys "CMD,L"
./opendesk ai scroll --window-title "TextEdit" --dy -500
./opendesk ai clipboard set --text "hello"
./opendesk ai app open --name TextEdit
./opendesk ai app open-url --name Safari --url https://example.com
```

With `--window-title`, mouse `--x/--y` are window-local and the window is focused before the action. Without it,
they are desktop coordinates. `relative-x/relative-y` require a target window. Keyboard actions and `scroll` also
accept `--window-title` and focus it immediately before input. A `scroll` action acts on the focused target; it
does not claim background-app scrolling.

## Vision and image assistance

```bash
./opendesk ai vision ocr --image .runtime/ai/shot.png --provider local --lang eng
./opendesk ai vision detect-ui --image .runtime/ai/shot.png --text "Send" --provider local
./opendesk ai image match --image .runtime/ai/shot.png --template templates/send.png --threshold 0.85
./opendesk ai image color --image .runtime/ai/shot.png --color '#ff0000'
```

Use Vision only when window metadata and deterministic coordinates cannot solve the task. `detect-ui` returns
compact matched elements; it does not automatically click them.

## Workflows and compatibility recipes: explore once, automate repeatedly

面向用户的主要入口是普通 JavaScript Workflow，而不是不断增加的 CLI 参数：

```bash
./dist/opendesk ai run workflows/macos/calculator/calculate-and-reuse-result.js
```

这个 Calculator Workflow 默认执行 `125*8`，从最小 Display ROI OCR 得到真实 `firstResult`，再
执行 `firstResult/4+37` 并验证第二次 OCR 为 `287`。它是一个 Fresh Run 脚本，不依赖在线 Agent/LLM
规划。

底层 recipe 仍可用于参数化测试或兼容旧调用：

```bash
./opendesk ai run examples/ai-cli/write-to-focused-app.js --input '{"text":"Hello from a reusable recipe"}'
```

macOS Calculator 的窗口相对、Display OCR 验证示例也使用同一入口；运行前需授予 Screen
Recording 与 Accessibility，并确保 `ai capabilities` 报告至少一个可用 OCR provider：

```bash
./dist/opendesk ai run examples/ai-cli/macos-calculator-recipe.js --input '{"expression":"16*3","expected":"48"}'
```

该兼容 Recipe 通过 Calculator 按钮输入算式，`expected` 只作为 Oracle；实际结果来自 Display ROI
OCR。可选 `followUp.expression` 中的 `{result}` 会替换为第一步 OCR 提取值，而不是在 JavaScript
内计算答案。它不应成为 Workflow 的主要作者体验。真实桌面 gate 仍需显式 opt-in：

```bash
OPENDESK_LIVE_CALCULATOR=1 ./dist/opendesk -script scripts/test_ai_calculator_recipe.js -console-mode script
```

这个 JS runner 自身通过普通 `opendesk -script` 启动；它再通过本地
[Command API](command.md) 启动多个确实需要 `ai run` artifact/envelope 的独立子 Execution，并负责受控扰动和结果汇总。实际
Calculator 操作、OCR 和业务断言仍在子 Execution 的 JavaScript Workflow 中完成，因此每次
Fresh Run 仍有独立的 `Execution.id`、`Execution.artifactDir`、deadline 和 cleanup evidence。
本地 `-script` 与 `ai run` 都提供 `Command`，不需要附加能力开关；旧的 `.sh` 入口已删除。

The three JSON inputs are mutually exclusive:

```bash
./opendesk ai run recipe.js --input '{"message":"hello"}'
./opendesk ai run recipe.js --input-file input.json
cat input.json | ./opendesk ai run recipe.js --input-stdin
```

`--timeout` 接受 Go duration，例如 `--timeout 30s` 或 `--timeout 2m`；省略时沿用标准的
30 分钟 Execution timeout。

recipe 可通过 `Execution.env` 读取启动时的项目环境。默认合并当前工作目录的 `.env`、
`.opendesk.env` 和 OpenDesk 进程启动时继承的 OS 环境；要只使用一份项目文件，可指定：

```bash
./opendesk ai run recipe.js --env-file config/ci.env
```

继承环境中的同名键优先于文件值。Runtime 不会另起 login shell 或解析 shell startup 文件；环境
文件不会展开变量，且该快照只提供给本地 execution；详见
[Environment Configuration](environment.md)。

`ai run` 的终端 stdout 只输出 JSON envelope。recipe 的 `console.log()` 保存在 envelope 所指向的
`result.artifacts.stdoutPath`，不会直接打印在 envelope 前后；这不是环境变量未读取。

本地 recipe 的 `Command.run()` 使用当前 OS 用户权限；HTTP、MCP 与 Scheduler execution 不提供该能力。
同样，本地 `ai run` 可显式启用 Experimental `Accessibility` 和 `UI` 菜单方法，远程 HTTP、MCP 与
Scheduler execution 当前关闭，只能看到禁用 capability 且不会读取原生目标。AI CLI 没有为此新增一套
平行 menu 命令、HTTP route 或 MCP tool；调用契约见 [Accessibility API](accessibility.md) 与
[Desktop UI Menu API](desktop-ui-menu.md)。这个 execution 准入开关不是完整 Runtime 沙箱。

Workflow 和 recipe 都会收到 [Execution Context](execution.md)；常用字段包括：

```js
Execution.id;       // execution ID
Execution.input;    // parsed JSON input (defaults to {}); Workflow normally uses its script defaults
Execution.workdir;  // caller working directory
Execution.env;      // frozen string environment snapshot; missing keys are undefined
Execution.artifactDir;
```

For the conventional recipe ending `async function main() { ... }` followed by `main();`, `ai run` awaits that
terminal `main()` Promise before it completes the execution. Other async recipe entrypoints should use top-level
`await` so their completion is explicit.

`run` retains the normal execution artifact set (`script_snapshot.js`, `stdout.log`, `stderr.log`,
`summary.json`, `agent_summary.json`, `events.ndjson`) under `.runtime/ai/`.

## Progressive Desktop Context policy

1. Reuse an existing recipe when one exists.
2. Otherwise check `capabilities`, then locate a target window before looking at pixels.
3. Prefer target-window screenshots; use a known ROI or relative ROI before a full-window capture.
4. Use deterministic window/mouse/keyboard/clipboard primitives when target state is known.
5. Escalate to OCR, `detect-ui`, template or color matching only when metadata is insufficient.
6. Verify the result with the smallest relevant observation, then save a parameterized recipe.
7. Use a full-screen screenshot only as a fallback.

This contract is platform-neutral. macOS adds Screen Recording and Accessibility consent; unsupported platform
operations fail with `unsupported_platform` instead of pretending to work.
