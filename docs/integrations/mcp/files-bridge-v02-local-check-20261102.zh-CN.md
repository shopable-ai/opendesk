# 官方 MCP 文件 Bridge V0.2：本地定向检查（2026-11-02）

结论：**WAITING_FOR_NATIVE_OWNER**。MCP 独立协议层可运行本地定向测试；正式文件模式继续失败关闭。未启动 Tunnel、未连接官方 ChatGPT、未读写用户演示文件。

## 工作区与版本

- 工作目录：`/Users/shopme/Documents/workspace/opendesk`；现有默认分支 `master`。
- 本轮检查 HEAD：`d0aa2b22577a0e5b07cdc7113a9d9e7cb34211d3`。
- `git ls-remote --symref origin HEAD refs/heads/master` 退出 0，远端默认分支为 `master`，SHA 为 `868f6b82cc4c9c803aec82615607abbc072d4574`。
- `32642442da908d3b3aa23f1899f92f5f36b5d330`、`b753ecfa4b38aa211c2c899900e4726f7800f81b`、`868f6b82cc4c9c803aec82615607abbc072d4574` 均为当前 HEAD 和本地 `origin/master` 的祖先，六项 `merge-base --is-ancestor` 均退出 0。
- 初始 MCP 目录无未提交修改；共享 `internal/browserbridge/`、`internal/browsercli/` 及其他目录存在并行改动。本轮没有编辑这些文件，没有 reset/stash/切分支/创建 worktree。
- 本轮改动保留为未提交状态；没有创建提交或推送。初始本地 HEAD 已领先远端，不能将该提交归因于本轮。
- shell 默认 PATH 不含 Go；复用 `/Users/shopme/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.25.13.darwin-amd64/bin`，`go version` 为 `go1.25.13 darwin/amd64`，符合 `go.mod` 的 `toolchain go1.25.13`。没有安装或切换全局 Go。

## 本轮文件与验证范围

| 文件 | 修改 |
|---|---|
| `pkg/mcpserver/files_bridge.go` | gofmt；统一当前结果/历史回执的安全清理，丢弃失败 data、限定成功历史回执元数据，校验 outcome/stages 一致性。未格式化无关的 `browser.go`。 |
| `pkg/mcpserver/files_bridge_test.go` | 新增反向工具隔离、Native 拒绝传播、失败/历史回执脱敏、矛盾阶段拒绝及合法写后失败事实保留测试。 |
| `cmd/opendesk-mcp/main_test.go` | 新增10种 CLI 子进程场景：无客户端失败关闭、模式混用、前后位置参数和 `--`，检查退出码/stdout/诊断脱敏。 |
| `cmd/opendesk-mcp/main.go` | 在所有模式初始化前拒绝位置参数；删除过时的未测试注释；保留原 fail-closed 哨兵。 |
| `docs/integrations/mcp/files-bridge-native-contract.zh-CN.md` | 增加本轮证据和结果清理合同；原认证要求和 WAITING 状态保持有效。 |
| 本报告 | 区分本地协议证据与真实 Native/Tunnel/ChatGPT 验收。 |

新增命令包测试属于 MCP 私有 CLI seam，调用现有 main 的文件分支，不调用公开 JavaScript Runtime API。测试分类说明保存在本 MCP 报告；未修改已有并行 owner 改动中的 `docs/quality/go-test-file-classification.md`。

## 命令、退出码及原始证据

以下命令均在上述仓库执行，PATH 前置上述 Go toolchain。执行日志、命令数组、耗时及真实退出码在 `.runtime/tests/mcp-files-bridge-v02-20261102/`，不提交运行产物。

| 命令/检查 | 退出码 | 证据 |
|---|---:|---|
| `go test ./pkg/mcpserver -run '^TestFilesBridge' -count=1 -v`（初始） | 0 | `baseline-files.log/.json`，原有 18 个主测试通过 |
| `go test ./cmd/opendesk-mcp -count=1`（初始） | 0 | `baseline-cmd.log/.json`；当时为 `[no test files]`，仅编译证据 |
| `go vet ./pkg/mcpserver ./cmd/opendesk-mcp`（初始） | 0 | `baseline-vet.log/.json` |
| `go test ./cmd/opendesk-mcp -count=1 -v`（新增 CLI 测试） | 0 | `cli-check.log/.json`，8 个 CLI 子场景通过 |
| `go test ./pkg/mcpserver -run '^TestFilesBridge' -count=1 -v`（扩展覆盖） | 0 | `expanded-files.log/.json`，20 个主测试通过 |
| `go test ./pkg/mcpserver -run '^(TestWebFile\|TestBrowserMCP\|TestFilesBridge)' -count=1` | 0 | `mode-regression.log/.json`，文件/Browser/nonce 受影响协议回归 |
| `go vet ./pkg/mcpserver ./cmd/opendesk-mcp`（新增测试后） | 0 | `updated-vet.log/.json` |
| `go build -o .runtime/tests/mcp-files-bridge-v02-20261102/opendesk-mcp ./cmd/opendesk-mcp` | 0 | `build-mcp.log/.json`，未替换现有服务二进制 |
| 上述二进制携合成 credential 引用运行文件模式 | 1（预期） | `binary-fail-closed.json`；stdout 空，stderr 仅 `file bridge unavailable: WAITING_FOR_NATIVE_OWNER`；检查器退出 0 |
| `go test ./pkg/mcpserver -run '^TestFilesBridge(FailureAndReceipt\|HistoricalReceiptExposes\|ContradictoryStages\|FailureAfterWrite)' -count=1 -v`（修复前反例） | 1 | `red-results.log/.json`，确认失败 data/receipt 泄露合成 marker、矛盾阶段及 status 读回误标；合法写后失败用例原先已通过 |
| `go test ./cmd/opendesk-mcp -run '^TestFilesBridgeCLIFailsClosedAndRejectsMixedModes/(leading-positional\|after-terminator)$' -count=1 -v`（修复前反例） | 1 | `red-cli.log/.json`，前置参数使旧代码返回桌面/Browser 工具列表；仅发 tools/list，未调用桌面动作 |
| `go test ./pkg/mcpserver -run '^TestFilesBridge' -count=1 -v`（安全修复后） | 0 | `green-results.log/.json`，24个主测试通过 |
| `go test ./cmd/opendesk-mcp -count=1 -v`（安全修复后） | 0 | `green-cli.log/.json`，10个CLI子场景通过 |
| `go test ./pkg/mcpserver -run '^(TestWebFile\|TestBrowserMCP\|TestFilesBridge)' -count=1`（最终候选） | 0 | `final-modes.log/.json`，修复后的受影响协议回归 |
| `go vet ./pkg/mcpserver ./cmd/opendesk-mcp`（最终候选） | 0 | `final-vet.log/.json` |
| `go build -o .runtime/tests/mcp-files-bridge-v02-20261102/opendesk-mcp ./cmd/opendesk-mcp`（最终候选） | 0 | `final-build.log/.json` |
| 最终二进制：文件模式、前置位置参数、`--` 后模式标志 | 均为1（预期） | `final-binary-check.json`；三项 stdout 均为空，检查器退出0 |
| 定向 `gofmt -l`、`git diff --check` 与报告相对链接检查 | 0 | 无未格式化 owner 文件、无空白错误、双向报告链接存在 |

构建依赖输出已有 macOS 弃用 API、libuiohook 枚举及 duplicate libraries 警告；没有为消除这些无关警告修改共享 Native 或桌面代码。

`source-manifest.json` 保存最终 MCP 源码/测试/分发器 SHA；`git-evidence.json` 保存分支/远端/祖先检查退出码；`initial-status.txt` 与 `final-status.txt` 记录共享工作区状态。最终二进制 SHA-256 为 `64413928f5dcf4ffb2d88808167001fedc2b9371d49fa5ee8c943471c786e425`。这些是本地构建/源码证据，**不是演示文件的磁盘 SHA，也不是干净提交或已安装发行候选**；依赖来自当前有并行改动的实际工作树。

## 安全边界与 Native owner 最小交付

已通过本地真实 MCP dispatcher/stdio 验证四工具集合、未知工具拒绝、严格 JSON/schema、重复字段拒绝、身份字段不转发、通知无副作用、路径/UTF-8/完整帧限制、SHA 与稳定 requestId 格式、UNKNOWN 不自动重试、历史 receipt 不冒充当前读回，以及输出失败停止后续队列。

上述 Native 边界使用 fake，仅证明 MCP 调用、结果处理和拒绝传播；**不证明真实 workspace 越权、只读 grant、SHA 冲突、requestId 持久去重或撤权已经实现**。

只读核查没有发现 `NewFilesMCPClient` 或同等 purpose-bound 客户端。现有普通 Browser Socket allowlist 不含 `files.*`；不能用其替代认证接口。Native owner 需按[唯一接口合同](files-bridge-native-contract.zh-CN.md)交付：

1. 专用认证客户端及固定四方法：`files.status/list/read/write`，身份来自可信本地授权，模型参数不得携带身份/grant/绝对路径。
2. capability 绑定当前 owner/session、workspace、活跃 CLI lease、最多32个精确文件、read/read-write、最长1800秒期限；文件0600、私有目录0700。
3. 独立批准向该 ChatGPT Tunnel 输出正文；不混同 Tunnel 身份、本地访问权限或逐人 OAuth。
4. 每次调用（含旧 receipt 查询）重查 capability、lease、撤权与过期；权限 ABA、lease 退出使旧能力失效。当前通用文件服务允许缺省 leaseEpoch、status 分支的复核不能当作完成此合同。
5. 复用原 nativeFiles 的符号/硬链接、owner/device/ACL、SHA、durable fence；确认写入、读回、未知阶段和同 requestId 去重，不放宽60KiB/32KiB限制。
6. 提供真实 Native IPC/grant/revoke/SHA/requestId 定向测试和同候选证据后，MCP owner 才替换 `serveFilesBridge` 哨兵。

共享 owner 未完成是当前接线阻塞；没有 MCP 文件写入冲突。本轮没有重新应用上一轮26文件候选，没有开发第二套文件服务。

## Tunnel 与真实演示状态

既有 `tests/mcp/tools/secure-tunnel/prepare-run.py`、`start-online.py`、`stdio-audit.py` 仍可复用；当前生成入口绑定旧 nonce proof，不能当作正式四工具 Bridge。没有读取凭据值、重建 Tunnel/key、修改旧启动器或启动在线连接。

| 阶段 | 状态 |
|---|---|
| M1 MCP 源码集成 | 独立协议层存在且本地可测；正式 CLI→认证 Native 接线 **WAITING_FOR_NATIVE_OWNER**，未全链集成 |
| M2 Go 定向测试 | **PASS**，限报告中实际执行的命令与候选源码 |
| M3 官方 Tunnel 真实联通 | **NOT_TESTED** |
| M4 官方 ChatGPT 文件读写、SHA、撤权 | **NOT_TESTED** |

真实演示八项均 **NOT_TESTED**：批准文件与权限；ChatGPT 读取未知 marker；原文件 SHA；以该 SHA 写入及回执；重新读取正文/SHA；Mac 独立磁盘 SHA/字节数；撤权后拒绝；真实断连/UNKNOWN 不重复写入。本地 fake 的对应协议结果不提升为这些项目的通过。

## 独立审查与评分

独立只读审查发现三项 MCP 问题，均已先运行失败反例，再最小修复：

1. 失败结果的 data 及历史 receipt 可夹带诊断：失败 data 不输出；历史错误使用同一代码/outcome/stages 校验；历史成功 data 只公开六种校验过的元数据，不输出旧正文。当前获准读取的正文保持原字节。
2. 失败 outcome 与阶段可能矛盾，status 可能冒称本次读回：增加一致性检查；矛盾写结果转 UNKNOWN，后端仅调用一次。已确认写入、后续读回失败/未知的合法事实保持 `ACCEPTED/CONFIRMED/false`。
3. Go flag 在前置位置参数或 `--` 处停止解析，原代码会落入桌面初始化：所有模式先统一拒绝剩余参数，再进行初始化。修复前子进程仅请求工具发现，确实观察到错误工具列表；没有发送任何桌面动作或真实文件操作。

独立 reviewer 对最终源码和主任务提供的执行结果复核，确认上述三项均关闭、限定范围内没有剩余修改要求；审查意见为 COMMENT，不作独立合并批准。reviewer 没有独立复跑 Go、LSP 或另外开展架构验收。

| 独立评分项 | 分数/100 | 范围 |
|---|---:|---|
| 架构复用 | 94 | 本次 MCP 补丁复用原分发器/后端边界，无新增文件执行器 |
| 安全 | 95 | 已修复的返回清理、阶段一致性和启动边界；不代表 Native 安全已验收 |
| UX | 93 | 错误与恢复事实表达；真实授权/ChatGPT UX 未测试 |
| 跨会话一致性 | 92 | MCP 稳定 requestId 与回执语义；Native 持久去重、跨进程撤权未测试 |
| 工程质量 | 96 | 当前补丁与定向回归证据 |
| 验收可验证性 | 96 | 反例失败→修复通过、日志/退出码/源码和二进制指纹可追溯 |

算术平均：`(94+95+93+92+96+96)/6 = 94.33/100`。这是**本次 MCP 补丁**的独立评分，不是完整产品或 M3/M4 的评分/通过结论。Native 接线、持久去重、撤权及官方 Tunnel/ChatGPT 未测试，不纳入通过项，不因本地测试通过宣告可发布。
