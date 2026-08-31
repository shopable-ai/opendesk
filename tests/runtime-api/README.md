# Clawdesk JavaScript Runtime API Conformance Lab

页面产品名为 **Clawdesk Runtime API Test Lab**。`tests/runtime-api/` 是稳定、可维护的
JavaScript Runtime API 测试源码；任何一次性日志、截图、生成脚本、状态和运行证据只写入
`.runtime/tests/runtime-api/<runId>/`，不得纳入版本控制。

API 事实源按优先级为：当前源码和实际 Runtime 行为、`docs-user-api/*.md`、
`docs-user-api/runtime-api.ai.json`、`types/*.d.ts`。只有这些正式来源可以作为测试输入；
不得恢复或使用任何退役接口文档。

## 分层和机器结果

| Gate | JavaScript 证明 | 机器结果 |
| --- | --- | --- |
| contract | 实际 Runtime、catalog、文档和类型声明没有未允许漂移 | `results/contract.json` |
| unit | 每个 API family 的独立 `.test.js` 安全行为 | `results/unit.json` |
| coverage | 每方法 contract、已通过 tier、required tier、风险理由和用例 | `results/coverage.json` |
| smoke | 安全公共路径与错误路径 | `results/smoke.json` |
| failure-exit | 普通 JS throw 快速非零、且不是 watchdog 124 | `results/failure-exit.json` |
| live | Safari、权限、窗口身份、输入、剪贴板、HTTP 和截图 | `results/live.json` |
| composition | 多控件、DOM/像素、截图、state/events 和移动窗口重放 | `results/composition.json` |
| cleanup | 已记录 runtime/PGID/watchdog/fixture PID 均已退出 | `results/cleanup.json` |
| quality | 同 runId、同二进制 SHA 和真实证据驱动的 100/100 acceptance | `results/quality.json` 与 `summary.json` |

`contract` 仅证明公开形状；它不能代替 behavior 成功。catalog 和 coverage 会拒绝 Runtime
新增而未登记的方法、catalog 缺失的方法、重复或未知 ID、遗漏 family 文件、遗漏 required
tier，以及没有风险理由的 contract-only 接口。

## 运行

```bash
CLAWDESK_BINARY=/absolute/path/to/audited/clawdesk ./scripts/test_runtime_apis.sh contract
CLAWDESK_BINARY=/absolute/path/to/audited/clawdesk ./scripts/test_runtime_apis.sh unit
CLAWDESK_BINARY=/absolute/path/to/audited/clawdesk ./scripts/test_runtime_apis.sh smoke
CLAWDESK_BINARY=/absolute/path/to/audited/clawdesk ./scripts/test_runtime_apis.sh live
```

`live` 从头执行全部 gate，最后才运行 quality/acceptance。它要求 macOS Accessibility 和
Screen Recording；Safari 必须处于可控状态。权限不足、窗口或控件身份不匹配、缺截图、证据
SHA 不一致、缺重放或清理失败都会非零退出。

新变量：

```bash
CLAWDESK_RUNTIME_API_LIVE_FILTER=page.test.js,composition.test.js
CLAWDESK_RUNTIME_API_BROWSER_APP=Safari
```

旧 `HOST_API_LIVE_FILTER` 和 `HOST_API_BROWSER_APP` 可由兼容入口映射，但新文档只推荐上列
变量。`scripts/test_host_apis.sh` 只打印 deprecated 提示后 `exec` 新脚本，绝不维护第二套
测试实现。

## 安全边界与版本控制

关机、重启、睡眠、杀进程、关闭窗口、`AppStorage.clear`、通知、内置声音、未配置 provider
的 OCR/UI 识别、FloatingWindow loop 和 `mouse.clickForPID` 成功路径，默认只能做 contract 或
安全错误路径。`clickForPID` 不能以 HTML 元素冒充 AXPress 成功；真实成功路径需要已审核的
原生 AX 控件、PID、窗口、AX capability 和业务结果。

建议纳入版本控制的正式资产：`tests/runtime-api/`、`scripts/test_runtime_apis.sh`、
`scripts/test_host_apis.sh`、`schemas/runtime-api/*.schema.json`、相关 Makefile/README/AGENTS、
以及 `docs-user-api/`、`types/` 修订。`.runtime/tests/runtime-api/` 中的任何文件都是本地运行产物。
