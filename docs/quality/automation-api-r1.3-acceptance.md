# Automation API R1.3 macOS 桌面验收

日期：2026-10-16—17。工作分支仅 `master`，基线及 fetch 后 `origin/master` 为 `37f6b3061726cd09ed9204ab7eb755a5ce069c4c`。本轮只处理 macOS Calculator 与仓库自有 AppKit fixture；BrowserDOM、Chrome 与 MCP 为范围外，保留其未提交修改，不复跑或继承历史 PASS。

运行产物根目录为 `.runtime/tests/automation-api-r1.3/session-final/`，不进入 Git。`traceable-build-provenance.json` 记录主程序/UI host、源码 SHA-256 与两份实际加载 polyfill 的逐字节对应；最终构建日志为 `build-traceable.log`，`codesign --verify --deep --strict dist/OpenDesk.app` 通过。构建使用固定 `dist/OpenDesk.app`、`com.opendesk.cli` 和既有签名身份（ad hoc `-`，不表述为发行签名认证）。主程序 VCS 信息为上述基线加 dirty source；`traceable/execution-provenance.json` 记录十一项执行各自启动前后的主程序、UI host、012/013 payload 与入口脚本 SHA-256，均一致并匹配冻结构建。冻结后仅补写验收文档及本地产物；交付提交包含这些已验证的源码及文档。

## 当前验收

| 验收项 | 状态 | 证据与限制 |
|---|---|---|
| tapTexts 九场景 | PASS | `traceable/taptexts/result.json`，九项及 fixtureStopped 全通过，含 legacy、missing、ambiguous、switch-window 和两种取消时机 |
| Calculator 黄金业务 | PASS | `traceable/independent-verification.json`：独立 Python 读取原始 AX 后确认 110、660，8+6 个按钮动作完整 ACK；第二段回执为 6、乘、1、1、0、等于 |
| 公开 Resolver 与正式 JS | PASS | `traceable/resolver-public.log`（23.92s）、`traceable/resolver-formal.log`（23.02s），均是原样命令的完整新执行，110→660；相邻结果目录为 `resolver-example-direct-20261016-235533-205000/` 与 `resolver-calculator-direct-20261016-235557-543000/`，每条链 14 步均有原生 requestId |
| AppKit Scope/Locator | PASS | `traceable/appkit/result.json` 八场景通过，包含真实 OCR 后取消、总 deadline、零超时与 image signal 拒绝；中文/Emoji 与独立 fixture 回读相符 |
| 正式原生 AX | PASS | `traceable/native-ax-identity.json` 指向 `.runtime/tests/accessibility/accessibility-native-macos-r13-traceable-20261016-235939/`，十阶段通过；精确 PID/进程路径核对，owned stop 成功 |
| 正式 Runtime | PASS | `traceable/independent-verification.json` 与 `execution-provenance.json`：Contract 412、Unit 836、Selected 180，均零失败；run-local 副本 hash 与当次启动前后的签名主程序一致 |
| Node | PASS | Scope/Locator 32、Resolver 31、Calculator profile 45；包含同时加载 012+013 的组合回归及 Runtime-shaped AbortSignal |
| Go | PASS | `go-test.jsonl`：automation/nativeextension 两包，787 test/subtest PASS、4 SKIP；跳过项不算 live |
| 独立评分 | PASS | `independent-review-traceable.json`：APPROVE、无阻断项，五个明确桌面维度各 100/100，均达到 ≥95；旧评分报告保持原样 |
| Git 交付 | 独立记录 | 仅交付 23 个桌面路径至 `master`；提交、推送及远端 SHA 核验以本地 `delivery.json` 为准，本文不写本次提交自身 SHA |

`traceable/independent-verification.json` 独立核对 14 条资源清理记录，每条 56 个数值资源字段均为 0；记录包含外层及子执行，不能称作 14 个独立真机场景。11 次启动前后记录主程序/UI host/012/013/入口脚本 hash，均未变化；公开命令的默认 Runtime 日志另完整复制至 `traceable/runtime-logs/<name>/`，保留原始路径记录。`traceable/execution-provenance.json`、截图及结果 JSON 分别证明实际加载、视觉和功能，不能互相替代。

代码已修改：表中目标缺陷及下述 owner 修复。实际已加载：最终 ad hoc 签名构建、payload 字节及十一项执行前后指纹一致。视觉已确认：查看 `traceable/golden/first-result.png`、`final-result.png`、`traceable/appkit/screenshots/semantic-after.png` 和 `traceable/taptexts/screenshots/default-complete.png`；110/660、中文/Emoji、按钮及输入框无裁切错位，fixture 尺寸符合既有布局。功能已验证：表中最终完整新运行，未拼接失败前缀或继承旧 PASS。

## 独立评分范围与映射

最终独立审阅只读核对最新源码和本轮原始实机证据，并查看保留的四张实窗截图；未重跑桌面、测试或构建。原报告 `independent-review.json` 的追溯维度为 90、加权总分为 98，保持原样。新报告 `independent-review-traceable.json` 逐项确认原生文字动作 requestId 及逐执行启动前后指纹两项扣分已解除，结论为 APPROVE，无待办或阻断项。

| 明确桌面维度 | 权重 | 得分 | 对应验收证据 |
|---|---|---|---|
| 桌面规格与源码正确性 | 25% | 100 | requestId RED/GREEN、类型/canonical 文档及冻结源码哈希 |
| 输入安全、候选融合与窗口约束 | 25% | 100 | tapTexts 九场景、原生 AX 十阶段、Resolver 预检及窗口/focus 拒绝 |
| 取消、总 deadline 与零超时契约 | 15% | 100 | AppKit 八场景、真实 OCR 后取消且无输入、Node 32 项回归 |
| 本轮实机业务、回归与清理 | 15% | 100 | 三条真实 110→660 链、Runtime 三组结果、14 条零资源记录及实窗截图 |
| 运行证据追溯与构建归属 | 20% | 100 | 三条 Calculator 链各 14 个原生 requestId、十一项执行指纹及 outer summary/入口快照 |

加权总分为 100，每个覆盖维度均 ≥95。固定输入中尚无原 11 维完整定义，以上只映射到明确的桌面验收项，不建立未经证实的 11 维对应关系；BrowserDOM、Chrome、MCP 不计分，也不宣称本轮 11 维全部通过。评分仅适用于本轮已验证的应用、布局和标准。

## 修复与失败归因

- Calculator 已知 AXButton 的可选 AXSubrole 返回 `kAXErrorFailure` 时保留缺省值；其他 role/属性和权限、失效错误仍失败。HiDPI 模式枚举三处统一包含当前模式，未修改显示模式。
- native extension 默认路径先解析真实可执行文件，修复 `dist/opendesk` 符号链接下 Apple Vision helper 发现；两个布局使用同一解析函数。
- Scope/Locator 传递同一取消 signal，观察后和输入前检查剩余总预算；不支持取消的 image action 在观察/输入前拒绝。`timeout: 0` 是单次观察，不轮询；owner 沿用 find 默认 3000ms 预算。组合回归先 RED 后 GREEN。
- 真实 AppKit OCR 取消场景曾揭示 options 浅复制丢失 Runtime AbortSignal 原型方法，导致 `INVALID_ARGUMENT`。现对 `signal` 保留对象身份；`abort-signal-red.log`、`abort-signal-green.log` 与最终真实取消结果共同证明修复，取消后的独立 fixture 计数为零。
- Resolver 原生文字动作现在透传底层 completed 的真实 `requestId`，文本序列保留该关联；OCR pointer 输入不填造 ID。`request-id-red.log` / `request-id-green.log` 证明回归，三个最终 Calculator 链各 8+6 步均独立核对真实原生 ID。此改动只增强回执，不新增定位、输入或重试。
- tapTexts 等待序列在每轮观察前后核对同一活动窗口，换窗不能被下一阶段的 OCR 候选掩盖；保留原有 STALE_TARGET 断言。歧义错误保留顶层 candidateCount/candidates，不放宽融合阈值。
- legacy fixture 的原 900ms 延迟短于某些真实截图/OCR 耗时，按钮可能在“立即”观察前已出现。当前明确让第二目标缺失于整个 probe 预算内，并独立断言 nextClicks=1、confirmClicks=0。fixture 启动要求相同身份及几何稳定三轮。默认场景立即接收异步拒绝，保证失败留证及自有进程清理。
- 旧 legacy 的首步 AMBIGUOUS_TARGET 原证据保留在 `../taptexts-final/`；`geometry-probe/result.json` 在原 AppKit origin x1061/y527 连续三次证明 OCR/AX 同一目标融合，但不足以确定历史歧义的唯一原因，未据此修改阈值。
- Resolver 中文 profile 用真实 AX 区域读取显示；数字用唯一、enabled、可 invoke 的原生按钮身份，避免显示内容或 OCR 误识别成为第二目标；文字运算符仍走公开 Resolver。只支持已验证的中文 Basic 230×408 profile，未扩展到其他版本/语言/尺寸。两段业务消费真实 firstResult，不在 JS 计算答案；任何失败保存结构化回执并停止。

失败证据保留：`appkit-final-payload/` 的 AbortSignal 拒绝、旧 `../taptexts-final/` 的歧义，以及 `resolver-example-controlled.log`、`resolver-test-final.log` 等被外部前台切换中断的执行均不算通过。用户确认桌面空闲后，最终五个桌面入口分别重新从已预检的安全起点完整运行。

## 复现入口与边界

所有公开命令工作目录为仓库根目录 `/Users/shopme/Documents/workspace/opendesk`。Runtime 调用串行；新调用不能替换正在运行的 execution。

```sh
./dist/opendesk -script examples/agent-to-recipe/calculator-current.js -console-mode script
./dist/opendesk -script examples/desktop/ui-resolver-calculator-macos.js -console-mode script
OPENDESK_UI_PERCEPTION_CALCULATOR_CONFIRM=authorized-calculator-fixture ./dist/opendesk -script tests/runtime-api/ui-perception-resolver-calculator-macos.js -console-mode script
./dist/opendesk -script tests/runtime-api/ui-scope-locator-native-macos.js -console-mode script
./dist/opendesk -script tests/runtime-api/ui-taptexts-native-macos.js -console-mode script
```

`OPENDESK_UI_TAPTEXTS_EVIDENCE_DIR` 必须传绝对路径。黄金额外证据使用 `OPENDESK_CALCULATOR_EVIDENCE`；正式 native AX 启动、精确 PID 验证、执行和停止沿用 `tests/runtime-api/README.md`。普通一行命令、正式 gate、视觉确认分别记录，不能互相替代。

隔离基线：完整 go vet 的旧 Seek 签名诊断仍在；本轮 `go vet -stdmethods=false ./automation ./pkg/nativeextension` 通过。API 文档检查退出成功但保留 29 项既有 canonical 缺口；Go 分类账的 60 项既有未分类问题未扩大整理或复跑全量审计。没有 Linux/Windows live 声明，没有把历史 r003/r009 资格当成本轮整合资格。OS Accessibility 当前为 granted；不撤销用户 TCC，权限拒绝只按对应原生保护字段及受控错误路径的具体证据描述。

Runtime gate 的日志包含内外两层 summary。`traceable/verification-metadata-correction.json` 记录归档工具改取最后的外层 summary，并完整保留首条对应的 child 档案；随后脚本 hash/快照/源码严格比对通过。未修改测试结果或重放任何动作。
