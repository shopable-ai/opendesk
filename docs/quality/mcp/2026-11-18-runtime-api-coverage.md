# MCP 高级 Runtime API 覆盖目标与验收

当前后续阶段已补齐下列 29 项历史缺口；实现修复、候选/安装验证和条件性未实测项见 [方法契约修复记录](2026-11-18-runtime-contract-repair.md)。以下保留各阶段原始证据，旧的 blocked/待补状态不是当前状态。

日期：2026-11-18。需求：让 Agent 能发现当前公开高级 API，并通过现有 Runtime 调用；保留专用工具和现有受限模式。

## 目标与边界

1. 发现复用 `scripts/api-docs.js` 的能力组、canonical Reference 和完整阅读包，含来源哈希及公共依赖；不维护第二份方法数据库。
2. 高级调用复用 `pkg/execution`，通过显式由宿主开启的脚本入口运行普通 JavaScript，异步查询结果、超时和取消。调用参数不能授予能力、修改工作目录、注入环境或伪造文件来源。
3. 默认桌面工具继续可用；只读模式、Native 文件四工具模式和 nonce 测试模式不得获得脚本执行能力。脚本权限开关不是完整沙箱，只能接入可信本地客户端。
4. App Mode、已安装 Flow、BrowserDOM 的 origin/tab 授权、系统 TCC、插件和模型配置仍由各自原有 owner 控制，不承诺所有公开方法在普通 MCP execution 中无条件可用。

## 关键测试条件

| 条件 | 成功标准 |
| --- | --- |
| 真实 stdio 协议 | initialize → tools/list → discovery/read → start/status/cancel；每行 stdout 只能是 JSON-RPC，不混入脚本日志 |
| 发现完整性 | 组来自现有导航配置；选中方法返回 canonical 原文、公共依赖、哈希和阅读包结束标记；不存在的方法、穿越路径、输出超限明确拒绝 |
| 异步与结果 | 顶层 await、结构化 input（包括 null）、console 结果、JS 异常、运行超时及取消均有可识别状态；启动成功不冒充脚本完成 |
| 输入与授权 | 未开启时不可发现/调用执行工具；额外字段、空脚本、错误类型/越界 deadline、未知 executionId 拒绝；脚本不能提升禁用能力 |
| 生命周期 | 有界活跃任务/历史，stdio EOF 取消本服务任务并清理；取消不等于回滚，已发出的外部动作不重试 |
| 代表性 Runtime | 用正式 `.js` 测试经真实 MCP Runtime 验证数据处理、执行上下文、路径/文件、SQL（宿主开启）及禁用能力；不能用 mock 代替 |
| 兼容性 | MCP 既有 Go/Node 回归、只读 allowlist、文件专属 surface、协议错误与专用工具保持通过 |
| 文档 | 新工具/宿主 flags/返回状态/限制有使用说明；API 文档检查与测试资产架构审计通过，既有问题单独记录 |

## 初始缺口

现有专用工具覆盖桌面窗口、截图、OCR/视觉、输入、Recorder 与受配置限制的 Browser Core；缺少普通 Runtime 脚本 execution 的 MCP 控制面，也缺少 canonical API 阅读入口。因此不能从 `tools/list` 推断 File、SQLite、UI Locator、Command、音频、模型等全部方法可调用。

工作区已有大量并行未提交修改，包括 MCP 文件桥与应用启动工具。本轮只增量集成，不提交、不切换分支、不覆盖其他任务的工作。

## 初始 canonical 契约缺口（历史快照）

本轮文档检查的导航校验通过，但 `contractReadiness` 为 `existing-source-gaps-blocked`，下列 29 个既有声明缺少独立 canonical 合同。它们在目录中保持缺口标记，精确阅读明确拒绝；不能从类型直接生成调用，也不阻断其他已完整方法。下表是一次质量快照，不是新的能力事实源。

| 所属 Reference | 缺少契约的声明 |
| --- | --- |
| page | `page.ensureMacPermissions`、`page.waitForNavigation` |
| image-color | `ImageColor.findBlueChannel`、`findGreenChannel`、`findRedChannel`、`toHSL`、`toHSLA`、`toRGB`、`toRGBA` |
| file | `File.appendBytes`、`create`、`createIfNotExists`、`getExtension`、`getHumanReadableSize`、`getName`、`getNameWithoutExtension`、`getSimplifiedPath`、`remove`、`removeDir`、`rename`、`renameWithoutExtension` |
| system | `System.getNetworkInterfaces`、`getPowerInfo` |
| sound | `playback.isPlaying`、`playback.startedAt` |
| ui | `FloatingWindow.id` |
| http | `axios.defaults`、`axios.request` |
| webhook | `handle.name` |

这些历史契约需要按实际 owner、类型和行为逐项完善，本轮没有猜测填充。新 transport 已覆盖普通 Runtime 的调用通路，方法级语义和现场条件仍按 canonical Reference 验证。

## 首轮实现与验证结果

新增六个工具：`tm_runtime_capabilities`、`tm_api_catalog`、`tm_api_read`、`tm_script_start`、`tm_script_status`、`tm_script_cancel`。文档连接与脚本执行分别由宿主显式配置，既有专用工具不迁移到脚本入口。实现复用现有 canonical reader、Execution Runner 与 Manager，不建立第二份方法数据库或 Runtime。

验证过程中修复了四个具体问题：显式 `null` 被误当成无输入；空 execution 环境被 Command 的 nil slice 转为继承宿主环境；summary 写盘失败导致原 execution 无法终结；`Command.run` 阅读命中嵌套 options 标题而漏掉 canonical 方法正文。最后一项先保留失败回归，再修复 H2 优先选择。两项执行边界修复经过独立静态复审，并由真实 Runtime 回归证明。

源码基线为 `master` 的 `975f7f111c6ffe6b18002c08574b762eb1aa06c1` 加本轮及工作区原有未提交修改，未提交或推送。构建更新的是 `dist/opendesk-mcp` CLI，没有替换签名 GUI app、Native 配对或运行中的 Tunnel。以下命令工作目录均为仓库根目录。

| 验证 | 结果 |
| --- | --- |
| `GOARCH=arm64 CGO_ENABLED=1 /Users/shopme/.local/opt/go1.25.13-amd64/bin/go build -o dist/opendesk-mcp ./cmd/opendesk-mcp` | 通过；当前 macOS arm64 构建，原生依赖仅有既有编译警告 |
| `OPENDESK_MCP_BINARY="$PWD/dist/opendesk-mcp" node --test tests/mcp/advanced-runtime.test.js` | 通过，13 个子场景，Node 计数 14 tests（含父用例）；使用真实 stdio 和正式 Runtime JS，非 mock |
| `GOARCH=arm64 CGO_ENABLED=1 /Users/shopme/.local/opt/go1.25.13-amd64/bin/go test ./pkg/mcpserver ./cmd/opendesk-mcp ./tests/mcp/tools/stdio-smoke` | 三个包通过；含受限模式、文件桥、既有专用工具和协议回归 |
| `GOARCH=arm64 CGO_ENABLED=1 /Users/shopme/.local/opt/go1.25.13-amd64/bin/go test ./automation -run '^TestCommandEnvMode'` | 通过，既有 Command 环境模式内部回归；另有真实 Runtime 合成 sentinel 测试，不打印真实环境 |
| `GOARCH=arm64 CGO_ENABLED=1 /Users/shopme/.local/opt/go1.25.13-amd64/bin/go vet ./pkg/mcpserver ./cmd/opendesk-mcp` | 通过 |
| `node --test tests/api-docs/*.test.js` | 41 项通过；包括完整 packet、依赖/哈希、超限拒绝与 canonical 方法选择 |
| `node --test tests/mcp/desktop-control-safety.test.js` | 8 项通过；是既有宿主侧安全回归，不是真实桌面输入验收 |
| `node scripts/api-docs.js check`；`node scripts/check_api_docs_contract.js` | 导航/抽取及 contract gate 通过，11 组、46 文档；29 个原有正文缺口仍明确标为 `existing-source-gaps-blocked` |
| `node scripts/audit_test_architecture.js` | 未通过；修改前后均为同样 68 项既有错误，新增错误为 0，不将其报告为全仓检查通过 |
| `git diff --check` | 通过 |

真实 Runtime 场景覆盖：基础执行上下文与顶层 await、嵌套 JSON/null、Geometry/path、File JSON 独立落盘对账、SQLite 参数绑定/关闭、未授权能力、同步异常与 Promise rejection、CPU deadline、CPU 取消/重复取消/会话 ID 隔离/执行槽重用、超大输出整包拒绝、写盘失败仍终结并可接续、空环境 Command，以及 stdin EOF 取消并落盘终态后进程无信号退出。启动成功与任务完成分别断言。

最终运行证据为 `.runtime/tests/mcp-advanced/1794986310442-89568-FLb9MP/`，内含协议、实际 artifacts、独立结果读取与 `provenance.json`。测试二进制 SHA-256 为 `9e67ecbfc851e7b133b82053cf50fe7f2496a3ee8a6fb79a0cef1de0e3d4068c`，正式 JS SHA-256 为 `6b93132cda734b84b6dfdc5282d30352c98f5e4513092ea15197f472a1888522`。聚合日志与架构审计前后快照在 `.runtime/tests/mcp-advanced/`；它们是本地产物，不进入版本控制。

## 未实测与后续边界

本轮完成普通 Runtime 的 MCP 通路和上述验收，不等于全方法真实调用通过。App Mode/Flow、BrowserDOM 授权、系统 TCC/平台、插件/provider 条件仍按原入口执行。没有进行真实桌面输入、原生 UI 视觉、音频录放、外部模型调用、云端 Tunnel 新工具验收或跨平台 live；没有全项目测试或内存压力证明。Linux/Windows 本轮也未新增跨编译结论。

后续按独立任务补齐上述 29 个 canonical 正文缺口，并在对应权限、设备和入口就绪时补充条件性 API 的现场证据；全仓测试架构的 68 项既有错误另行修复。不能用目录覆盖、编译、宿主侧模拟或本轮代表性调用替代这些结论。

## 追加完整性复核与安装（2026-11-18）

用户追加要求继续查遗漏、编译安装，并创建新对话继续完善。本轮补上三类验收：只读模式连接文档后仍不能发现/调用脚本；会话成功受理 64 次后，第 65 次明确拒绝且原终态仍可查询；CLI 的只读/能力/nonce 冲突配置和非绝对文档路径在初始化 Runtime 前拒绝。

独立复核又发现两类异常遗漏，已先复现失败再修复：

- AppStorage 的载入/迁移/保存诊断曾直接写 stdout，可能污染 MCP 协议。现统一写 stderr；新增内部诊断路由回归，以 `.runtime/tests/app-storage/` 的损坏 JSON fixture 验证，不修改用户真实存储或 HOME。该 seam 使用既有 `automation/appStorage_test.go`，不冒充真实共享存储故障的端到端验收。
- 原脚本失败叠加 `agent_summary.json` 或 `summary.json` 写盘失败时，错误可能被覆盖或遗漏。现在保留原失败终态、脚本错误和持久化错误，完成原 ID，并释放活跃执行槽。两个正式 JS 故障场景均通过真实 MCP 验证，随后可启动新任务且 EOF 正常退出。

修复后的 macOS arm64 候选通过真实 gate 后，已于北京时间 15:55:51 原子更新 `dist/opendesk-mcp` 和 `/Users/shopme/.local/bin/opendesk-mcp`。两者 SHA-256 相同：`d36084ee0796779a3d5f9173a0b88bb14afb03d20e9327642121848525e9470e`。PATH 已解析到安装路径；安装的是 MCP CLI，现有 GUI app、Native 配对、Host/Tunnel 配置和进程未切换；未安装 Custom UI host 或 Native Extension 配套资源。

从仓库根目录原样执行以下安装路径命令，**17 个子场景全部通过，Node 计数 18 tests（含父用例），无跳过**：

```bash
OPENDESK_MCP_BINARY="$HOME/.local/bin/opendesk-mcp" node --test tests/mcp/advanced-runtime.test.js
```

最终安装验证证据：`.runtime/tests/mcp-advanced/1794988551265-32053-0YsijA/`；正式 JS SHA-256 为 `71c0b9e16e42f54792333b62d5f12b08d8c1ea209bca796be927b1ddd5916a13`。候选 gate 同样通过，证据为 `.runtime/tests/mcp-advanced/1794988468622-31700-57THjM/`。初始故障证据保留，用于区分修复前与修复后。

相关 Go 三包回归、CLI 新增拒绝用例、AppStorage/Command owner 定向回归及 MCP/CLI vet 均通过；41 项文档测试与 8 项宿主安全测试合计 49 项通过。导航/契约检查通过，仍标记原有 29 个正文缺口。全仓测试架构审计仍为同样 68 项错误，前后差异为 0；`git diff --check` 通过。日志、源码/二进制 provenance、安装回执、前版本备份和审计比较位于 `.runtime/tests/mcp-advanced/followup-20261118/`，不提交。

本轮没有提交、推送或切换分支，仍为原 `master` 基线加未提交修改。条件性 API 的未实测边界与上一节一致；新对话继续补 canonical 契约和对应代表性调用，不能将本次 CLI 安装解释为 GUI/Tunnel 新工具上线或全接口运行通过。
