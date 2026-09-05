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

复杂且已验证的流程保存为 recipe，再传 JSON 输入重复执行：

```bash
./opendesk ai run recipe.js --input '{"text":"Hello"}'
```

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

## Recipes: explore once, automate repeatedly

Complex workflows belong in JavaScript recipes, not in a growing list of CLI flags:

```bash
./opendesk ai run examples/ai-cli/write-to-focused-app.js --input '{"text":"Hello from a reusable recipe"}'
```

macOS Calculator 的窗口相对、Display OCR 验证示例也使用同一入口；运行前需授予 Screen
Recording 与 Accessibility，并确保 `ai capabilities` 报告至少一个可用 OCR provider：

```bash
./dist/opendesk ai run examples/ai-cli/macos-calculator-recipe.js --input '{"expression":"16*3","expected":"48"}'
```

该 Recipe 通过 Calculator 按钮输入算式，`expected` 只作为 Oracle；实际结果来自 Display ROI
OCR。可选 `followUp.expression` 中的 `{result}` 会替换为第一步 OCR 提取值，而不是在 JavaScript
内计算答案。真实桌面 gate 还会用 Calculator 的模式快捷键制造一次真实窗口尺寸变化，再由一次
Fresh Run 恢复并验证 Basic 布局；它需要显式 opt-in：

```bash
OPENDESK_LIVE_CALCULATOR=1 ./dist/opendesk ai run scripts/test_ai_calculator_recipe.js
```

这个 JavaScript runner 自身也是 `opendesk ai run` 管理的标准 Execution；它通过本地
[Command API](command.md) 启动多个独立子 Execution，并负责受控扰动和结果汇总。本地
`ai run` 默认提供 `Command`，不需要附加能力开关；旧的 `.sh` 路径只作为兼容包装器。

The three JSON inputs are mutually exclusive:

```bash
./opendesk ai run recipe.js --input '{"message":"hello"}'
./opendesk ai run recipe.js --input-file input.json
cat input.json | ./opendesk ai run recipe.js --input-stdin
```

`--timeout` 接受 Go duration，例如 `--timeout 30s` 或 `--timeout 2m`；省略时沿用标准的
30 分钟 Execution timeout。

本地 recipe 的 `Command.run()` 使用当前 OS 用户权限；HTTP、MCP 与 Scheduler execution 不提供该能力。

Recipes receive the existing execution metadata plus:

```js
Execution.id;       // execution ID
Execution.input;    // parsed JSON input (defaults to {})
Execution.workdir;  // caller working directory
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
