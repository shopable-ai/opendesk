# OpenDesk 官方文件 MCP Bridge：Native owner 最小接口合同

状态：**WAITING_FOR_NATIVE_OWNER**。本合同不代表 Native 已完成接线。

## 原始产品目标

官方 ChatGPT MCP 工具 → 原 Secure MCP Tunnel → tunnel-client → opendesk-mcp → 原 Native Host 中的同一个 nativeFiles → 用户明确批准的已有 UTF-8 文本文件。必须实现读取、SHA-256 乐观并发写、再次读取、独立磁盘核验及撤销后拒绝。不会调用 Browser 网页监听/Web Flow、Shell、任意 Socket 文件 RPC 或第二套文件执行器。

## 本对话已负责的 MCP 端

- `pkg/mcpserver.NewFilesBridgeServer(backend FilesBridgeBackend)` 只注册 `tm_files_status`、`tm_files_list`、`tm_files_read`、`tm_files_write`；其他工具与未知参数拒绝。
- `FilesBridgeBackend.Call(ctx context.Context, method string, args json.RawMessage) (json.RawMessage, error)`：受限后端，MCP 模型入参只允许 workspaceId/relative path、content、expectedSha256、requestId；不接受身份、授权、principal、lease 或 capability 的模型声明。
- `FilesBridgeBackendError{Code, Outcome}`：只有校验过的错误代码与阶段；不能返回 Socket 绝对路径、密钥、正文或任意底层错误字符串。
- 传输上限为完整 JSON 60 KiB，正文最多 32 KiB。写操作必须有实际 SHA 和稳定独立 UUID，绝不自动重试 UNKNOWN。
- `opendesk-mcp --files-bridge-credential-file` 目前存在显式 fail-closed 哨兵 `WAITING_FOR_NATIVE_OWNER`。这不是已连通的生产入口。

## 共享 Native owner 的唯一缺口

原文件位于 `internal/browserbridge/files_service_unix.go`，原 Host 分发位于 `internal/browserbridge/host_unix.go`；本对话没有修改它们。只有该文件的唯一 owner 才能增加独立的 purpose-bound、经过可信本地管理端授权的文件 MCP 通道。上一轮候选 `internal/browserbridge/files_mcp_*.go` 和 `internal/browsercli/files_mcp*.go` 是可审阅参考，不得直接与 Browser 对话同时覆盖。

建议实现接口（**当前不存在**）：

```go
// Native-owned API, illustrative contract; not an existing implementation.
func NewFilesMCPClient(credentialFile string) (*FilesMCPClient, error)
func (c *FilesMCPClient) Call(ctx context.Context, method string, args json.RawMessage) (json.RawMessage, error)
```

可信本机 grant/revoke 必须绑定当前 Native owner/session、已批准 workspace、活跃 CLI lease、精确文件相对路径（最多 32）、read 或 read-write、期限（最多 1800 秒）、短期独立 capability（私有 0600 文件，私有目录 0700），以及用户另外明确同意将这些正文传送给该专用 ChatGPT Tunnel 的获准调用者。Tunnel identity、MCP caller identity、本地文件访问授权和内容输出授权四者不能混为一谈。本期是共享服务主体，不宣称拥有逐人 OAuth。

服务端在每次 read/write/status（含旧 receipt）重新验证 capability、授权、lease、未撤销和未过期；保留原符号链接/硬链接/owner/device/ACL/SHA/durable fence 规则与 60KiB /32KiB 限制。普通 Browser Socket 方法 allowlist 不增加 files.*。授权后撤销、权限 ABA 或 lease 退出必须使旧能力失效。

## 固定后端方法与阶段返回

| 方法 | 固定模型参数 | 要求 |
|---|---|---|
| files.status | 空对象或 requestId | 不泄露权限秘密，回执查询不重新写入 |
| files.list | workspaceId, path | 仅枚举批准路径及祖先 |
| files.read | workspaceId, path | 原 Native 安全读取、真实 UTF-8 字节数、SHA |
| files.write | workspaceId, path, content, expectedSha256, requestId | 已有文件修改、冲突拒绝、同 ID 不重播，读回验证 |

结果 JSON 仅包含 `ok`、`data`、`error`、`stages`；阶段字段为 `requestAccepted`、`fileWritten`、`readBackVerified`、`toolResult: PREPARED`。写入结果不确定必须 `OUTCOME_UNKNOWN`，不能假装失败确认，也不能新 ID 重新写。MCP 本地 `EMITTED` 不等于 ChatGPT 收到。

## 接线与测试顺序

1. Native owner 在确认 Browser 对话文件归属后，自行审查候选接口并实现 purpose-bound 认证，不新增普通 RPC。没有 owner 许可时保持当前 fail closed。
2. 只由 MCP owner 更新 `cmd/opendesk-mcp` 的哨兵函数：创建 Native 客户端、将 Native 私有错误转换为 `FilesBridgeBackendError`、调用 `mcpserver.NewFilesBridgeServer`，绑定 stdin/stdout；不转发文件正文到日志。
3. 执行 `go test ./pkg/mcpserver -run 'TestFilesBridge' -count=1`，再运行 Native owner 的 IPC / grant / revoke 定向 Go 测试，以及 `go test ./cmd/opendesk-mcp`。测试结果另记真实退出码。
4. 在 Mac 使用既有 `tests/mcp/tools/secure-tunnel/` 准备/启动器，不重新创建 Tunnel/key。实测仅四工具发现、未知 marker 读取、显式有限修改、SHA 对账、撤销后拒绝。现阶段 M3/M4：NOT_TESTED。

边界：本 MCP 任务没有修改 `internal/browserbridge/`、`internal/browsercli/`、`opendesk-browser/src/native-agent/` 或 `projects/webflow/`。
