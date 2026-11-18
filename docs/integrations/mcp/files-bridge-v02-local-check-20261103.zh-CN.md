# 官方 MCP 文件 Bridge V0.2：本地复核（2026-11-03）

结论：**WAITING_FOR_NATIVE_OWNER**。当前 MCP 独立协议层的定向测试、CLI 失败关闭、模式隔离、编译及 vet 通过；没有发现可供接线的专用认证 Native 文件客户端。没有启动 Tunnel、读取认证凭据、操作用户演示文件或连接官方 ChatGPT。

本记录是当前工作树的新鲜复核，不把[上一轮检查](files-bridge-v02-local-check-20261102.zh-CN.md)的结果当成本轮证据。授权与接线要求仍以[唯一 Native 接口合同](files-bridge-native-contract.zh-CN.md)为准。

## 工作区、版本与并行边界

- 仓库：`/Users/shopme/Documents/workspace/opendesk`，现有默认分支 `master`。
- 检查 HEAD：`909effdc2e1cbeca57ba0e265b6d6f7a57f42041`；本地 `origin/master` 和 `git ls-remote --symref origin HEAD refs/heads/master` 返回的远端 HEAD/master 均为同一 SHA，退出码均为 0。
- `32642442da908d3b3aa23f1899f92f5f36b5d330`、`b753ecfa4b38aa211c2c899900e4726f7800f81b`、`868f6b82cc4c9c803aec82615607abbc072d4574` 对 HEAD 与本地 `origin/master` 的六项 `merge-base --is-ancestor` 全部退出 0。
- 默认 shell 的 `go version` 最初退出 127（PATH 中无 Go）。复用已有 `/Users/shopme/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.25.13.darwin-amd64/bin` 后，`go version` 退出 0、输出 `go1.25.13 darwin/amd64`，符合 `go.mod` 的 `toolchain go1.25.13`。没有安装或修改全局 Go。
- 起始工作区已有上一轮 MCP 未提交改动：`cmd/opendesk-mcp/main.go`、`pkg/mcpserver/files_bridge.go`、`pkg/mcpserver/files_bridge_test.go`、Native 合同；另有未跟踪的 `cmd/opendesk-mcp/main_test.go` 和上一轮报告。本轮保留这些内容，没有重新应用 26 文件候选。
- 共享 `internal/browserbridge/`、`internal/browsercli/` 和其他目录有并行改动。本轮只读核查 Native 接口，没有编辑共享 Native 目录或 Browser 仓库，没有创建分支/worktree、reset、stash、提交或推送。
- 初始测试通过后，独立审查发现成功 status 额外字段透传与孤立 surrogate 静默替换两项缺陷。本轮先验证反例失败，再仅修改 `pkg/mcpserver/files_bridge.go` 及其同包测试；原有未提交修复保留。`cmd/opendesk-mcp/main.go/main_test.go`、`pkg/mcpserver/server.go` 与开始时 SHA 相同。构建使用有并行未提交依赖的实际工作树，不能描述为干净 HEAD 的发行候选。

## 本轮实际写入

| 文件 | 本轮变化 |
|---|---|
| `pkg/mcpserver/files_bridge.go` | status 成功结果采用公开字段白名单与类型校验；原始 JSON 解码前拒绝不配对 surrogate |
| `pkg/mcpserver/files_bridge_test.go` | 新增 3 个主测试：成功 status 脱敏、公开字段校验、12 种 Unicode 输入的拒绝/精确保留 |
| `docs/integrations/mcp/files-bridge-v02-local-check-20261103.zh-CN.md` | 新增当前 HEAD、命令/退出码、安全边界和 M1–M4 状态记录 |
| `docs/integrations/mcp/files-bridge-native-contract.zh-CN.md` | 链接本次复核并明确 status 公开字段与 Unicode 约束；保留原认证合同与失败关闭状态 |

运行日志、命令数组、退出码、源码清单和独立测试二进制均保存在 `.runtime/tests/mcp-files-bridge-v02-20261103/`，不提交运行产物，也不覆盖现有服务二进制。

## 定向命令与结果

以下 Go 命令的 PATH 均前置上述缓存工具链。测试验证当前 MCP 独立协议和 CLI 入口；Native backend 使用 fake，不把其拒绝传播当作真实授权系统通过。

| 命令 | 退出码 | 结果与证据 |
|---|---:|---|
| `go test ./pkg/mcpserver -run '^TestFilesBridge' -count=1 -v` | 0 | 初始 24 个主测试、修复后最终 27 个主测试通过；`files`、`final-files.log/.json` |
| `go test ./cmd/opendesk-mcp -count=1 -v` | 0 | 初始及最终均 2 个主测试通过，包含 10 种 CLI 子场景；`cli`、`final-cli.log/.json` |
| `go vet ./pkg/mcpserver ./cmd/opendesk-mcp` | 0 | 初始及最终通过；`vet`、`final-vet.log/.json` |
| `gofmt -l cmd/opendesk-mcp/main.go cmd/opendesk-mcp/main_test.go pkg/mcpserver/files_bridge.go pkg/mcpserver/files_bridge_test.go pkg/mcpserver/server.go` | 0 | 初始及最终无输出；`format`、`final-format.log/.json` |
| `go test ./pkg/mcpserver -run '^(TestWebFileEnvelopeLeavesOtherModesUnchanged\|TestWebFileSurfaceAndRoundtrip\|TestBrowserMCPRejectsArbitraryExecutionArguments\|TestPolicyReadOnlyListAndCallFailClosed)$' -count=1 -v` | 0 | 初始 4 个主测试通过；`mode-isolation.log/.json`。修复仅作用于 files 分支；最终文件模式测试也再次验证反向工具隔离 |
| `go test ./pkg/mcpserver -run '^TestFilesBridge(StatusExposesOnly\|StatusRejectsMalformed\|UnicodeEscapes)' -count=1 -v`（修复前） | 1 | 三个主测试按预期失败：成功 status 泄露合成秘密/接受非法元数据，6 种非法 surrogate 被接受；6 种合法文本原本通过。`red-boundaries.log/.json` |
| 同一反例命令（修复后） | 0 | 三个主测试全部通过；`green-boundaries.log/.json` |
| `gofmt -w pkg/mcpserver/files_bridge.go pkg/mcpserver/files_bridge_test.go` | 0 | 只格式化本轮编辑的两个 owner 文件；`format-fix.log/.json` |
| `go build -o .runtime/tests/mcp-files-bridge-v02-20261103/opendesk-mcp ./cmd/opendesk-mcp` | 0 | 初始及最终独立输出；`build`、`final-build.log/.json`（实际参数记录为绝对输出路径） |
| 初始及最终测试二进制分别运行文件模式、前置位置参数、文件/桌面混用，stdin 仅发送 `tools/list` | 各 1（预期） | stdout 均为空，诊断不包含合成 credential 路径；检查器退出 0，`binary-fail-closed.json`、`final-binary-fail-closed.json` |
| `go version -m` 检查上述二进制 | 0 | 初始及最终通过；`binary-provenance.json`、`final-binary-provenance.json`，含对应二进制 SHA/大小与构建信息 |
| 定向 `git diff --check`、报告相对链接与尾部空白检查 | 0 | 仅检查本轮文件；`final-checks.json` |

最终二进制 SHA-256：`c0ca8a0a063ce82514fd0439f292b0c6aa22696a40a600e78666bc81a98a20b7`，大小 `33004632` 字节。初始二进制记录仅为修复前证据；同一路径已更新为最终候选。这是 MCP 测试二进制指纹，**不是用户演示文件的磁盘 SHA 或字节数**。

构建依赖仍报告 macOS 弃用 API、libuiohook switch 枚举和 duplicate libraries 警告；上述命令没有因此失败，也没有为消除这些警告修改无关 owner 的源码。

`git-evidence.json`、`initial-status.txt`、`initial-source-manifest.json` 和 `pre-report-source-check.json` 保存起始版本、dirty 状态和初始测试期间源码未漂移证据；最终检查另存 `final-status.txt`、`final-source-manifest.json` 和 `final-checks.json`，区分本轮预期修改与未编辑的 MCP 文件。

## 安全检查覆盖与限制

本轮实际通过的 MCP 测试覆盖：

- 初始化与四工具发现，严格 `additionalProperties: false` schema；文件工具不出现在桌面、Browser、旧 nonce 模式，文件模式不能调用桌面/Shell/Controller/创建删除等工具。
- 未知工具/字段、非法类型、重复及转义重复 JSON 字段、绝对/越界路径、伪造 workspace/身份/lease/capability 参数、通知和无效 RPC id 在 Native 边界前拒绝。
- UTF-8、正文 32 KiB 与完整 JSON 60 KiB 预算；SHA-256 和稳定独立 requestId 的格式及必填要求。
- workspace/只读/冲突/撤权等 Native 拒绝结果的传播，不自动重试；重复 requestId 不被 RPC id 替换，真正的持久去重仍归 Native owner。
- 写入 UNKNOWN、矛盾阶段、合法写后验证失败、历史 receipt 与当前读回事实的区别；断开的输出流停止处理后续队列，不重放写入。
- 底层错误脱敏、失败 data 删除、历史 receipt 元数据限制；delivery observer 不输出正文或任意 RPC id，`EMITTED` 不冒充远端 ACK。
- 成功 status 仅输出校验过的 requestId/receiptStatus/receipt；秘密和底层路径等额外字段删除。孤立高/低 surrogate、错误配对在进入 Native 前拒绝，合法配对 emoji、U+FFFD 和字面反斜杠文本精确保留。
- CLI 文件入口不可初始化桌面 Runtime；模式混用、空引用、前后位置参数与 `--` 等均失败关闭。

**尚未真实验证**：Native workspace 越权/只读 enforcement、真实 SHA 冲突、跨进程 requestId 去重、capability/lease 过期与撤权、真实 IPC 断连写入结果。这些本地 fake 用例只证明 MCP 边界及不重试行为，不能将其提升为 Native 安全验收。

## Native owner 的具体缺口与最小交付

当前没有 `NewFilesMCPClient` 或等价的 purpose-bound 认证文件客户端。`cmd/opendesk-mcp/main.go` 的 `serveFilesBridge` 继续返回 `WAITING_FOR_NATIVE_OWNER`。

现有 `internal/browserbridge/host_files_unix.go` 的文件 dispatcher 仅允许已认证 Chrome port；普通 Browser Socket 客户端不是这条授权通道。现有 `files_service_unix.go` 还包含 Browser 的 `workspaces.list/files.create`，且缺省 leaseEpoch 的兼容路径、status 分支与当前 MCP status/receipt 合同并不等价，不能直接转发或扩大普通 Socket allowlist。

请 Native owner 在其现有 `nativeFiles` 上补足以下合同；MCP owner 不代写共享服务：

1. 提供专用客户端 `Call(context.Context, method string, args json.RawMessage)` 或等价接口，只允许 `files.status/list/read/write`。客户端从私有凭据引用取得真实身份，不接收模型伪造 principal/grant/绝对路径。
2. 可信本地管理端明确批准：当前 owner/session、workspace、活跃 CLI lease、最多 32 个精确文件、read/read-write、最长 1800 秒期限、短期独立 capability；凭据文件 0600、目录 0700。
3. 另行取得向该专用 ChatGPT Tunnel 输出正文的许可，不把 Tunnel 身份、本地文件权限、正文输出或逐人 OAuth 混同。
4. 每次调用和旧 receipt 查询重新验证 capability、授权、lease、撤权和过期；权限 ABA、lease 结束与 owner/session 更替不能复活旧权限。
5. 复用原有符号/硬链接、owner/device/ACL、SHA 与 durable fence；遵守 60/32 KiB 上限、已有文件修改限制、requestId 冲突/去重、写入回执及 UNKNOWN 不重放语义。
6. 返回唯一接口合同中的安全 `ok/data/error/stages`，提供真实 IPC/grant/revoke/SHA/requestId 定向证据。满足后才替换 MCP 哨兵，不调用通用 Socket RPC，不建第二套文件服务。

无本轮 MCP 写入冲突。共享 Native owner 的交付仍是接线阻塞，本轮没有修改其进行中的文件。

## M1–M4 与真实 Demo

| 阶段 | 当前状态 |
|---|---|
| M1 MCP 源码集成 | 独立四工具协议层存在且本地通过；正式 CLI→认证 Native 接线 **WAITING_FOR_NATIVE_OWNER**，未全链完成 |
| M2 Go 定向测试 | **PASS**，仅限上表命令和记录的实际 dirty 工作树 |
| M3 官方 Tunnel 真实联通 | **NOT_TESTED** |
| M4 官方 ChatGPT 文件读写、SHA、撤权 | **NOT_TESTED** |

原 `tests/mcp/tools/secure-tunnel/prepare-run.py`、`start-online.py`、`stdio-audit.py` 保留，源码核对表明现有入口仍绑定 nonce proof。没有重建 Tunnel/key、修改启动器或读取本地认证配置内容。没有可用 Native 客户端时，启动该旧模式不能证明四工具 Bridge 联通，因此在 MCP 定向验证后停止接线。

真实 Demo 八项均为 **NOT_TESTED**：批准演示文件与权限；ChatGPT 读取未知 marker；原文件 SHA；基于该 SHA 的实际修改和回执；再次读取正文/SHA；Mac 独立磁盘 SHA/字节数；撤权后访问拒绝；真实断连/UNKNOWN 后未重复写入。

## 独立审查

独立 reviewer 初审指出两项缺陷：成功 status data 未采用白名单；Go 的 JSON 解码会将孤立 surrogate 静默替换为 U+FFFD。两项均已通过新增反例先失败、最小修复后通过，最终复审确认 **两项 finding 均关闭，剩余 finding 为 0**。

reviewer 只读检查最终源码、公开合同及 `final-*.json` 的真实退出码与测试结果，没有独立复跑 Go、执行产品动作或读取凭据；本会话没有可用 `lsp_diagnostics`。结论为 **COMMENT，无剩余代码整改项**，不是完整合并批准或生产可用声明。

| 独立评分项 | 分数/100 | 范围与限制 |
|---|---:|---|
| 架构复用 | 95 | 保留单一 Native owner 与原 MCP 分发器 |
| 安全 | 95 | 本地边界与两项安全修复；真实认证/撤权未测 |
| UX | 93 | 字节保留、错误与 UNKNOWN 语义；真实授权和 ChatGPT UX 未测 |
| 跨会话一致性 | 92 | 稳定 requestId、历史与当前事实区分；真实持久去重未测 |
| 工程质量 | 95 | 最小修复、同包回归与定向 Go 检查 |
| 验收可验证性 | 96 | 红/绿反例、退出码、源码与二进制指纹；端到端未测 |

综合分：`(95 + 95 + 93 + 92 + 95 + 96) / 6 = 94.33/100`。

评分仅针对本轮 **MCP 独立实现、公开合同与本地定向验证**，不对完整产品给出通过分。Native 专用认证、真实撤权/持久去重、官方 Tunnel 与 ChatGPT 的未测试环节未计为通过；M1 接线保持等待、M3/M4 保持 NOT_TESTED。
