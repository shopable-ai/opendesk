# Recorder 数据质量 v2 验收

状态：2026-09-10；适用于 `opendesk.recorder.recording/v2`、`opendesk.recorder.actions/v2` 与 `opendesk.recorder.basic-candidate/v4`。

## 结论

Recorder v2 采用分层事实模型：`application → window → element → relative position → screen fact`。它不再把全局屏幕坐标当成唯一目标，也不把普通悬停轨迹当成 action 证据。按本页固定量表，当前设计与自动化证据得分为 **98/100**；这是一项仓库内工程验收分，不代表真实业务流程已经回放成功。

## 固定评分量表

| 维度 | 权重 | 得分 | 可检查要求 |
| --- | ---: | ---: | --- |
| 输入降噪与审计 | 15 | 15 | 未按键的 `MOUSE_MOVED` 不写 raw；按键期间 motion/drag 保留；`observed/filtered/accepted/persisted` 可交叉核对 |
| 动作完整性 | 15 | 15 | press/release/click、文本与控制边界确定性归组；每条 raw 事件恰有一条 disposition；缺失配对不静默生成 |
| 应用与多窗口身份 | 20 | 20 | 每个动作保存应用稳定身份、具体窗口标题/bounds 和瞬态 provenance；重放重新解析；多候选歧义时拒绝输入 |
| 坐标可迁移性 | 20 | 20 | 同时保存 screen、window offset/ratio、element offset/ratio；窗口平移后按新 bounds 计算；resize 不猜测 |
| 控件语义与隐私 | 15 | 14 | 默认点命中 AX 标签；非操作叶节点最多向上 6 层选最近 actionable ancestor；保存命中/祖先/状态；不保存 AXValue、密码内容、截图或整树 |
| Fail-closed 生成 | 10 | 10 | hash、schema、版本、目标上下文、坐标、动作子集和歧义均严格校验；生成与回放分离 |
| 文档、兼容与验证 | 5 | 4 | API、设计、类型、合成/Go 测试和当前构建 macOS Calculator 真实语义点击同步；v1 可读但只给 `needs-review`；Windows/Linux 目标系统 live 未运行 |
| **合计** | **100** | **98** | 达到 95 分门槛 |

控件语义扣 1 分，因为 basic generator 只把 AX 数据作为证据，还没有将其自动提升为跨应用通用 locator。文档与验证扣 1 分，因为 Windows/Linux 只明确返回语义不可用，尚未在目标系统运行 live gate。把 OCR 静默加入默认路径不会加分：没有目标裁剪、原图 hash、引擎版本、置信度和隐私授权的 OCR 字符串不能算可靠事实。

## 本轮证据

| 验收 | 结果 | 证据 |
| --- | --- | --- |
| Go Recorder 与 execution owner | PASS | `go test ./automation ./pkg/execution` |
| Runtime API Recorder | 8/8 PASS | `.runtime/runs/direct-20260909-192935-169000/` |
| 坐标、歧义与 strict generation | 6/6 PASS | `.runtime/runs/direct-20260909-192936-786000/` |
| 测试架构审计 | PASS | `.runtime/tests/test-architecture/audit.json` |
| macOS Calculator 真实 native listener、受控输入、pause/resume、按钮语义与文件链 | PASS | `.runtime/tests/human-to-recipe/calculator-live-1788953384136-direct-20260909-192943-906000/` |
| 公开 simple console 原样启动与当前构建视觉检查 | PASS；截图后以 Ctrl+C 清理，终端状态因此为预期 canceled，不作为功能通过替代 | `.runtime/tests/human-to-recipe/ui/recording-console-simple-current.png` |

Calculator 现场包为 `.runtime/recordings/rec-20260909T112946.465966000Z-112176b826ec/`：`recording/v2` 为 `stopped/saved`，`actions/v2` 为 `ready` 且 issues 为空；按钮“9”和“7”均为 `AXButton`／`AXPress` 且 `semanticStatus: "verified"`。暂停期间的按钮“8”只改变真实 Calculator 状态，没有进入 raw/actions。

## 必须保留的数据

| 层级 | 字段 | 目的 |
| --- | --- | --- |
| application | executable path/name、录制 PID | 前两项用于跨 execution 解析；PID 仅说明来源 |
| window | title、bounds、ID/index/handle、popup、observedAt | 区分同应用多窗口；瞬态 ID/handle 不跨 execution 复用 |
| element | semantic status/reason、role/name/identifier/actions、bounds、hit、ancestors | 提取按钮等操作语义，并区分失败、未请求与成功 |
| point | screen point、display、window offset/ratio、element offset/ratio | 保存原始事实并支持窗口平移后的重算 |
| source | event IDs、native time、sequence、basis、disposition | 证明 action 如何由 raw 得出并发现遗漏 |
| lifecycle | pause/resume/control-click/cutoff、counts、issues | 防止控制操作或终止边界污染业务动作 |

## 明确不记录的数据

- 普通 hover 轨迹；它只增加 `filtered`，不进入 raw。
- `AXValue`、选中文本、密码或安全控件内容、剪贴板。
- 整棵 AX 树、默认截图和默认 OCR。
- 把录制 PID、窗口 handle 或旧屏幕坐标直接当作重放目标。
- 未经验证的业务意图、后置条件或“点击成功”结论。

## 验收命令

以下命令均从仓库根目录执行；运行输出应写入 `.runtime/`：

```bash
go test ./automation ./pkg/execution
./dist/opendesk -script tests/runtime-api/recorder.js -console-mode script
./dist/opendesk -script tests/human-to-recipe/coordinate-recipe.js -console-mode script
node scripts/audit_test_architecture.js
```

公开原生 UI 的普通体验命令为：

```bash
./dist/opendesk -ui -allow-recorder-capture -script examples/custom-ui/recording-console-simple.js -console-mode script -log-dir .runtime/examples/custom-ui/recording-console-simple
```

普通一行命令、正式自动化 gate、真实窗口视觉证据和真实目标应用录制是四类不同证据，报告时不得互相替代。

## 后续增强门槛

OCR 只适合作为显式的 `target-crop` 证据模式：必须限定控件附近裁剪、保存原图与裁剪 hash、坐标变换、引擎及版本、候选文本和置信度，并对敏感窗口 fail closed。键盘动作还可在不读取值的前提下增加 focused-element 标签上下文。真正使用语义 locator 重放前，还需定义候选唯一性、窗口内范围、可见/启用状态和歧义拒绝规则。
