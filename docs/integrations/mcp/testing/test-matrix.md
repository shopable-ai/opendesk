# MCP Test Matrix

本矩阵区分三种验证层：

```text
contract tests
runtime/unit tests
manual macOS smoke
```

## 自动化测试命令

MCP 核心修改至少执行：

```bash
go test ./pkg/mcpserver ./cmd/opendesk-mcp
```

测试是否“当前通过”必须来自本轮实际执行结果，不从历史报告继承。

## Contract tests

### MCP protocol / registry

应覆盖：

- initialize / protocol response；
- `tools/list` 注册关键工具；
- `tools/call` 参数与错误行为；
- tool input schema required / enum / descriptions。

### `tm_inspect_desktop`

应覆盖：

- status；
- permissions；
- activeWindow；
- displays；
- optional screenshot 参数转发。

真机截图内容和真实 TCC 行为不属于纯 contract test。

### `tm_find_target`

应覆盖：

- `strategy=ocr` 只拉 OCR evidence；
- `strategy=detect_ui` 只拉 detect-ui evidence；
- `strategy=layout` 只拉 layout evidence；
- `strategy=hybrid` 聚合多源；
- OCR line / detect-ui / layout region 进入标准 candidate 模型；
- ranked candidates；
- `bestCandidate`；
- ambiguity signaling；
- freshness metadata；
- 已知 OCR provider 缺失时的 structured external blocker。

不应由 contract test 宣称：

- OCR 在所有界面识别准确；
- 不同 DPI/主题/目标 app 的 candidate 一定稳定；
- 真机文本目标一定可点击。

### `tm_act_on_target`

应覆盖：

- click / type / focus action contract；
- stale target guard；
- stale target revalidation success/failure；
- ambiguous target guard；
- `allowAmbiguous=true`；
- `expectedWindowTitle`；
- `expectedTargetText`；
- `dryRun`；
- `previewOnly`；
- guard 失败返回结构化 `ok=false` 而不执行动作。

### 辅助工具

按实际变化补：

- `tm_wait_for_window` polling；
- `tm_wait_for_text` polling；
- `tm_click_text`；
- `tm_click_region`；
- `tm_focus_and_type`；
- screenshot / layout / annotate 参数 contract；
- stdio initialize -> tools/list -> tools/call smoke。

## Runtime / unit tests

重点覆盖纯函数和 adapter 语义，例如：

- vision 参数归一化；
- key chord 解析；
- active window 字段映射与 nil-safe 行为；
- runtime error wrapping；
- click/type/key/scroll adapter 参数；
- revalidation input 构造；
- ambiguity / freshness helper。

当 runtime adapter 逻辑变厚时，应相应增加 unit tests，而不能全部依赖 server-level mock contract。

## Manual smoke

以下通常需要真实 macOS 环境：

- TCC 权限状态；
- 窗口枚举与 foreground 行为；
- screenshot 实际文件；
- OCR provider 实际可达性；
- 真实 UI candidate 质量；
- focus / click / type 对真实 app 的效果；
- preview plan 和真实执行之间的一致性。

流程：

```text
docs/integrations/mcp/testing/manual-smoke-macos.md
```

## 回归边界

### 代码修改只影响 schema/server orchestration

至少执行：

```bash
go test ./pkg/mcpserver ./cmd/opendesk-mcp
```

### 修改 runtime adapter / automation primitive

除 MCP tests 外，应执行受影响 automation/runtime 包测试。

### 修改真实 macOS screenshot / window / input / permission 路径

自动化测试后必须增加针对性的真机 smoke。

### 修改 OCR/provider 逻辑

同时验证：

- provider 正常路径；
- provider 缺失/不可达路径；
- external blocker contract；
- 恢复后 fresh evidence 流程。

## 质量原则

```text
mock contract pass
!= real desktop behavior proven
```

同样：

```text
manual smoke success once
!= cross-app deterministic guarantee
```

最终能力声明必须标明证据层级和未验证边界。
