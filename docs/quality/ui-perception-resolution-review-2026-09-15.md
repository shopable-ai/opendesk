---
title: UI Perception Resolver P0 收口验收（2026-09-15）
---

# UI Perception Resolver P0 收口验收（2026-09-15）

## 结论

P0 Resolver 在当前 macOS 构建上通过真实 Calculator 验收。高层文本 API 统一由 Runtime Resolver 观察并决策；当前本地 Accessibility / Apple Vision OCR 都在 cloud VLM 之前，native action 或 pointer input 至多提交一次。共享 LLM Runtime 的 multimodal transport 尚未实现，`sharedMultimodal` 为 `false`，所以自动 cloud visual fallback 仍禁用。

本次实机的 Calculator Basic 窗口为 232×321 logical points。Apple OCR 原始观察漏掉 `×`、`4`、`=`，而 AX 对三者提供了唯一名称与 `macos-global-display-points-top-left` 的 native bounds。Resolver 接受仅 2 points 以内的窗口边缘取整差异，其他坐标空间或较大越界仍拒绝。读取显示值时，修复后同样使用这个受限 native-bounds 投影，避免错误退回到整窗键盘 OCR。

## 实机证据

从仓库根目录以明确确认 token 执行：

```bash
OPENDESK_UI_PERCEPTION_CALCULATOR_CONFIRM=authorized-calculator-fixture \
./dist/opendesk -script tests/runtime-api/ui-perception-resolver-calculator-macos.js -console-mode script
```

结果为 `passed`，实际读取的 `firstResult` 为 `110`，`finalResult` 为 `660`。第二段操作消费 `String(firstResult)`，没有把期望值注入输入或结果。运行目录为 `.runtime/tests/ui-perception/calculator-direct-20260915-171331-541000/`；其中 `01-first-result.png` 显示 110，`02-final-result.png` 显示 660。截图经人工实窗检查：窗口为正常 Basic Calculator 布局，显示区、按键网格和右侧操作列均无裁切、异常留白或错位。

首次 live run 在清空后停止，原因是 `UI.readText()` 未请求/使用 macOS `nativeBounds`，而非输入状态不明；当次没有进入算式。只读 AX 复查确认唯一显示值为 `staticText.value: "0"`，随后做最小修复、重新构建并从新的预检重新开始，未重放任何可能提交的算式前缀。

## A–K 决策覆盖

| 项 | 验收状态 | 证明的边界 |
| --- | --- | --- |
| A | 通过 | 本地唯一 OCR 候选不调用 VLM。 |
| B | 通过 | Apple/OCR backend failure 不伪装成 no-match。 |
| C | 通过 | OCR miss 可由唯一 Accessibility 目标解决，不调用 VLM。 |
| C1 | 通过 | 仅 <=2 points 的 macOS native-bounds edge drift 可裁剪入当前窗口。 |
| D | 通过（fixture） | 已批准、唯一且新鲜的 VLM grounding 才可形成候选。 |
| E | 通过（fixture） | 多个 VLM 候选 fail closed 为 `AMBIGUOUS_TARGET`。 |
| F | 通过（fixture） | 非法 normalized VLM bbox 在输入前拒绝。 |
| G | 通过（fixture） | VLM 观察期间窗口变化为 `STALE_TARGET`。 |
| H | 通过（fixture） | policy/configuration 未批准时不截图、不调用 VLM。 |
| I | 通过（fixture） | VLM timeout 有界且不发送输入。 |
| J | 通过（fixture） | native `unknown` 不切 backend 或重复输入。 |
| K | 通过 | `readText` 返回唯一实际 native value，不使用 caller expectation。 |
| K1 | 通过 | `readText` 接受已记录的 macOS native display bounds，避免全窗 OCR fallback。 |

上述 A–K/K1 为 deterministic fixture 验证，不能替代 live input。live 证据只声明当前 macOS Calculator 的完整操作和显示结果。

## 已运行门禁

| 门禁 | 结果 |
| --- | --- |
| `node --check polyfills/013-ui-perception.js` | 通过 |
| `node tests/runtime-api/ui-perception-resolver.unit.cjs` | 14/14 通过 |
| `make build` 与 `./scripts/build_macos_app.sh` | 通过；主程序和配套 UI host 从当前源码刷新，ad-hoc codesign |
| Resolver Runtime surface | 2/2 通过 |
| packaged Apple Vision Runtime API | 9/9 通过 |
| `node scripts/check_api_docs_contract.js` | 通过 |
| `go test ./...` | 通过 |
| `node scripts/audit_test_architecture.js` | 未全绿：仅 `pkg/appshell/localization_menu_test.go` 与 `pkg/customui/memory_driver_source_test.go` 为并行测量工作新增且未登记；本任务 `automation/desktop_vision_observe_test.go` 已登记。 |

## 风险、范围和评分

工程收口评分为 **96/100**：真实 macOS input/readback 与视觉证据、完整 Go suite、Runtime/API 文档门禁均通过；扣分原因是全仓架构审计尚有两项并行未登记测试，以及 live coverage 只覆盖一个 Apple Calculator Basic 布局、一个 display/scale 和本机权限状态。

未声明 Linux/Windows live Runtime 验收，也未声明多显示器、窗口 resize、主题、语言或 Calculator mode 切换的正向通过。自动 cloud VLM 没有运行，也没有凭 DesktopVision credentials 绕过 `sharedMultimodal: false`；在共享 multimodal transport、policy、profile 和精确 window/crop scope 全部落地前，它必须继续保持禁用。
