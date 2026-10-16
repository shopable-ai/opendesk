# OpenDesk Automation API R1.2 — 可信验收台账与 Mac Codex 交接

日期：2026-10-16。状态：**SOURCE HARDENING / LIVE NOT RUN**。本页是质量证据台账，不是第二份 API Reference；正式接口仍由 `docs/api/` 定义。

## 1. Provenance 与已核实基线

- 仓库：`shopable-ai/opendesk`，只写 `master`；初始 HEAD `0ad514ebd10fabc948a3387d998a6407f06f99f2`。
- 历史 R1.1 CI：[38893699701](https://github.com/shopable-ai/opendesk/actions/runs/38893699701)，提交与初始 HEAD 一致。
- 运行日志确认：正式 Runtime contract **412 PASS / 0 FAIL**、unit **836 PASS / 0 FAIL**、selected **52 PASS / 0 FAIL**；macOS Runtime、API Docs、Agent API Reading 三个 Job 成功。
- 整体 workflow **FAIL**：Agent-to-Recipe Job 的 15 个测试因缺少忽略目录下 `.runtime/tests/agent-to-recipe/revision-20260929/repeat-candidate/candidate.json` 报 ENOENT。属于独立测试资产/前置链问题，不用更改 BrowserDOM、Locator 或 Runtime 行为去掩盖它。
- 当前云端执行容器为 Linux；无访问用户真实 WindowServer、Accessibility 授权、已安装 Chrome Core Extension 和对应 MCP Agent 会话的条件。无全仓 checkout、无本轮 Linux/Goja 全套本地执行证据。

## 2. 本轮源码修改及隔离边界

- `automation/browser_dom.go`：仅拒绝已知的无效基础请求 envelope，在启动本 execution Node Client 前失败；Adapter 非法 envelope 与 requestId 不匹配以 unknown 安全停止。
- `automation/browser_dom_preflight_test.go`：纯 Go preflight/协议反例（错误码、无 Client 创建、非法响应），不能替代公开 JavaScript 与真实 Chrome 操作验收。
- `docs/api/browser-dom.md`：澄清已实施的拒绝行为；不新建 Browser Core 或其它 Locator engine。
- 本轮不新增 `getByRole/count/filter/isVisible`，没有可靠多平台实证前拒绝扩大 API。
- 所有本轮 CI/Runtime/桌面/Chrome/MCP 新验收必须指向修复后的确切提交和产物；不能沿用 R1.1 的 PASS 冒充 R1.2。

## 3. 六层验证台账

| 层级 | 证据现状 | R1.2 的合格判定 |
|---|---|---|
| Node | 本轮本地 NOT RUN | `node tests/runtime-api/ui-scope-locator.contract.test.js`、`node --test tests/browser-automation-core/locator.test.mjs`、`node tests/runtime-api/ui-perception-resolver.unit.cjs` 成功 |
| Go | 本轮本地 NOT RUN；新白盒回归待 CI | `go test -count=1 ./automation ./pkg/mcpserver`，精确错误码和无多余 Client |
| 正式 Goja Runtime | R1.1 历史 412/836/52 PASS；R1.2 NOT RUN | 按新 HEAD 再次运行正式 Runtime contract/unit/selected |
| 原生 macOS GUI | NOT RUN | fixture AppKit 身份、AX/OCR、中文/Emoji、窗口移动/替换与一次性动作均有真实日志/截图 |
| 真实 Chrome BrowserDOM | NOT RUN | 已安装 extension/hash、Broker、document、真实 read/fill/verify/trace 与独立 postcondition |
| MCP Agent live | NOT RUN | 真 MCP 客户端完整 tools/list、status、observe→locate→read→act→verify，以及安全拒绝及身份来源 |

任何缺失 E5 的维度不可评分 ≥95；CI 通过不升级为真实 GUI 或 Agent 成功。

## 4. 本地 Mac Codex — 完整执行手册

在用户既有 macOS 上、正式仓库中执行。**仅限 master，先安全同步；不创建 branch/worktree，禁止 reset/clean/force，不覆盖其他 Agent 未提交内容。**

```bash
cd /Users/shopme/Documents/workspace/opendesk
git branch --show-current
git status --short
git fetch origin master
git rev-parse HEAD
git rev-parse origin/master
# 只有确认无覆盖/冲突风险后才执行：
git merge --ff-only origin/master
node tests/runtime-api/ui-scope-locator.contract.test.js
node --test tests/browser-automation-core/locator.test.mjs
node tests/runtime-api/ui-perception-resolver.unit.cjs
go test -count=1 ./automation ./pkg/mcpserver
node scripts/api-docs.js check
node scripts/check_api_docs_contract.js
mkdir -p dist
go build -o dist/opendesk ./cmd/opendesk
OPENDESK_RUNTIME_API_MODE=contract ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
OPENDESK_RUNTIME_API_MODE=unit ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script
```

### A. Native macOS

仅在本次 WindowServer 会话真实可用、Screen Recording 和 Accessibility 已向当前构建宿主授予且检查实际 PID/路径之后运行；不绕过提示或重置权限。确认 `tests/runtime-api/fixtures/ui-taptexts-macos/` 由当前仓库提供；不要把 stub 或后台 CI 当真机。按当前正式脚本直接运行：

```bash
./dist/opendesk -script tests/runtime-api/ui-scope-locator-native-macos.js -console-mode script
OPENDESK_UI_PERCEPTION_CALCULATOR_CONFIRM=authorized-calculator-fixture ./dist/opendesk -script tests/runtime-api/ui-perception-resolver-calculator-macos.js -console-mode script
```

收集 `.runtime/tests/ui-scope-locator-macos/` 和 `.runtime/tests/ui-perception/` 的当前 run result、原始截图和失败码；核对真实 PID/handle、AX 属性、点击次数、OCR 原文及窗口前后位置。缺少权限、OCR 图像、原生身份时标 `BLOCKED`，绝不伪造通过。Calculator 仅限用户已批准的测试操作，unknown 后不再次点击。

### B. 真实 Chrome Browser Core / BrowserDOM

遵循 `lab/browser-automation-core/README.md`。在仓库根目录使用当前源码运行 `setup`，仅通过 Chrome 官方 `chrome://extensions` 加载/刷新 `lab/browser-automation-core/extension`；从 `doctor`、实际 Window/Worker/Host 和源码 hash 检查确认不是旧安装：

```bash
node lab/browser-automation-core/cli.mjs setup
node lab/browser-automation-core/cli.mjs start --background
node lab/browser-automation-core/cli.mjs fixture
node lab/browser-automation-core/cli.mjs doctor
node lab/browser-automation-core/cli.mjs tabs
```

fixture 命令可能占用独立终端；保留其真实输出，按输出确定 `http://127.0.0.1:<实际端口>` 的**精确 origin**和真实唯一 Tab 数值。仅将这些现查值传入下列命令，不用旧 Tab，也不从标题推断 ID：

```bash
./dist/opendesk -allow-browser -browser-core-root "$PWD" -browser-origin "<实际 fixture origin>" -browser-tab <真实 Tab ID> -script tests/runtime-api/browser_dom_live.js -console-mode script
./dist/opendesk -allow-browser -browser-core-root "$PWD" -browser-origin "<实际 fixture origin>" -browser-tab <真实 Tab ID> -script tests/runtime-api/browser_dom_actions_live.js -console-mode script
```

先只读，后对受控可丢弃 fixture 执行安全 fill/reveal；在真实页面读取后置状态及 Core trace 的 requestId、actionId、target、document、source、outcome；read→fill 实值来源和服务端单次提交须额外通过已有 `golden` / `verify-golden` 独立 verifier。不能把 reveal 按钮的 ACK 等同业务订单成功。若当前环境无法建立真实扩展连接，记为 BLOCKED。

### C. MCP Agent live

复用仓库实际 MCP server/BrowserDOMPolicy 配置途径，不猜新的命令行参数或发明 MCP adapter。首先 `tools/list` 核对八个 `tm_browser_*` 工具的 schema；在**受授权的同一 fixture Tab** 实际依次 `status` → `observe` → `locate` → `read` → `act` → `verify`，保存原始 MCP JSON-RPC 请求响应、Core trace、identity 和实际 DOM 结果。再验证未授权 origin/tab、伪造 target、歧义、超时、断开、unknown 等拒绝行为，unknown 必须终止当前动作链。无法确认真实 MCP policy 和浏览器授权时 BLOCKED，不以 `pkg/mcpserver/browser_test.go` 的 mock 通过替代。

### D. 缺陷闭环和交付

针对真机或 CI 新发现的失败：保存最小复现 → 分别记录动作是否发送/结果是否确认 → 按源码 owner 最小修改 → 新增对应真实 JS 用例与必要 Go transport seam → 完整复验。仅已有 Runtime/AX/OCR/Browser Core/MCP owner 修改；不建立第二套引擎。日志与截图留 `.runtime/tests/`，报告更新本文件。Git 提交前重查工作区、远端 ancestry、diff、测试证据，安全写回 `master`。报告六层 PASS/FAIL/BLOCKED/NOT RUN、精确 SHA、独立质量评分；不能用平均分掩盖低分。

## 5. 当前质量结论

本阶段只可确定 R1.1 的形式化 Runtime 基线及源码预检范围。桌面真实定位、OCR/AX 真实性、Chrome 真实 DOM、MCP Agent、安全非幂等端到端等独立 95 分验收**尚未完成**；不对这些维度预先赋予高分。
