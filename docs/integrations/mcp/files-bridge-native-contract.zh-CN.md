# OpenDesk 官方文件 MCP Bridge：Native owner 最小接口合同

状态（2026-11-10）：**当前账号 Mac 核心文件闭环已通过真实官方 Tunnel 与 ChatGPT WEB 验证**：仅四工具发现、未知 marker 读取、固定 SHA/requestId 一次写入、网页读回与独立磁盘一致、越范围及撤权后文件/历史回执拒绝。实际加载的签名 Native、候选程序 provenance、限定范围与证据见[本轮质量记录](../../quality/mcp/2026-11-10-current-account-tunnel.md)。此结论仅覆盖该 Mac/账号核心场景，不扩展为完整 CI、production 或跨平台验收。

2026-11-03 用户明确授权本对话判断并补齐 Native 缺口，已接管本合同限定的共享代码修改。当前实现计划和最新约束见[实施计划](files-bridge-native-implementation-plan.zh-CN.md)。此前的[本地复核记录](files-bridge-v02-local-check-20261103.zh-CN.md)与[2026-11-02 检查记录](files-bridge-v02-local-check-20261102.zh-CN.md)仅为历史证据；其中 owner 未确认和专用客户端不存在的状态已由本轮授权与实现取代。历史文档中的 M3/M4 状态保留为当时观察；当前核心场景以本轮质量记录为准。

## 原始产品目标

官方 ChatGPT MCP 工具 → 原 Secure MCP Tunnel → tunnel-client → opendesk-mcp → 原 Native Host 中的同一个 nativeFiles → 用户明确批准的已有 UTF-8 文本文件。必须实现读取、SHA-256 乐观并发写、再次读取、独立磁盘核验及撤销后拒绝。不会调用 Browser 网页监听/Web Flow、Shell、任意 Socket 文件 RPC 或第二套文件执行器。

## 本对话已负责的 MCP 端

- `pkg/mcpserver.NewFilesBridgeServer(backend FilesBridgeBackend)` 只注册 `tm_files_status`、`tm_files_list`、`tm_files_read`、`tm_files_write`；其他工具与未知参数拒绝。
- `FilesBridgeBackend.Call(ctx context.Context, method string, args json.RawMessage) (json.RawMessage, error)`：受限后端，MCP 模型入参只允许 workspaceId/relative path、content、expectedSha256、requestId；不接受身份、授权、principal、lease 或 capability 的模型声明。
- `FilesBridgeBackendError{Code, Outcome}`：只有校验过的错误代码与阶段；不能返回 Socket 绝对路径、密钥、正文或任意底层错误字符串。
- 传输上限为完整 JSON 60 KiB，正文最多 32 KiB。写操作必须有实际 SHA 和稳定独立 UUID，绝不自动重试 UNKNOWN。
- 原始 JSON 字符串中的 UTF-16 surrogate 必须正确配对；拒绝 Go 解码时会静默替换的孤立 surrogate。合法配对、明确的 U+FFFD 及字面转义文本保持不变。
- `opendesk-mcp --files-bridge-credential-file <private-json>` 创建专用 Native 客户端并绑定 stdin/stdout，不创建桌面 Runtime；无效私有引用失败关闭，stderr 仅输出固定安全代码。

## Native 专用认证通道

原文件位于 `internal/browserbridge/files_service_unix.go`，原 Host 分发位于 `internal/browserbridge/host_unix.go`。新增 `files_mcp_*.go` 复用该 Host 持有的同一个 `nativeFiles`、锁及文件执行器；普通 Browser RPC 不增加文件方法。可信本机 CLI 管理 grant/revoke，专用模型客户端仅持有独立 capability。实现期间保留其他 owner 的既有改动和运行服务。

实现接口：

```go
func NewFilesMCPClient(credentialFile string) (*FilesMCPClient, error)
func (c *FilesMCPClient) Call(ctx context.Context, method string, args json.RawMessage) (json.RawMessage, error)
func (c *FilesMCPClient) Close() error
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

MCP 结果清理合同：失败结果不输出 `data`，仅保留安全错误代码、outcome 和一致的阶段事实，`error.message` 固定为代码。`status.data.receipt` 使用同一校验与清理；成功历史写回执的 `data` 仅公开 `saved`（bool）、`workspaceId`、`path`、`requestId`、`sha256`、`bytes`（0–32768 整数），字符串继续使用对应入参/摘要格式校验。历史正文及其他字段不转发，获准 `files.read` 正文不做关键词替换。历史阶段只表示旧操作；status/list/read 顶层 `fileWritten` 必须为 `NOT_APPLICABLE`，`readBackVerified` 为 false。

当前 `status.data` 的最小公开结果只保留可选的 `requestId`（与写入同格式的 UUID）、`receiptStatus`（`KNOWN` 或 `UNKNOWN`）和上述 `receipt`；无回执元数据时允许空对象。不转发 token、capability、principal、底层路径或其他额外字段，已知字段的非法类型或值返回安全错误。未来需要公开其他状态字段时须显式扩展此单一合同与结果校验，不能直接输出 Native 内部对象。

`NOT_DISPATCHED` 不得同时声称已接受/写入/读回；`FAILED_CONFIRMED` 不得包含 UNKNOWN 阶段；写入确认或未知不得配 REJECTED，读回验证须有已接受且确认的写入。矛盾写结果转为 `E_FILES_BRIDGE/OUTCOME_UNKNOWN`，不重新调用后端。合法的“写入已确认、后续验证失败/未知”保留 `ACCEPTED/CONFIRMED/false`，不得改写为未写入。

## 接线与测试顺序

1. 审查 purpose-bound 认证、可信本机授权和每次调用的锁内权限检查，不新增普通文件 RPC。
2. `cmd/opendesk-mcp` 创建 Native 客户端、将 Native 私有错误转换为 `FilesBridgeBackendError`、调用 `mcpserver.NewFilesBridgeServer`，绑定 stdin/stdout；不转发文件正文到日志。
3. 执行 `go test ./pkg/mcpserver -run 'TestFilesBridge' -count=1`，再运行 Native owner 的 IPC / grant / revoke 定向 Go 测试，以及 `go test ./cmd/opendesk-mcp`。测试结果另记真实退出码。
4. 在 Mac 使用既有 `tests/mcp/tools/secure-tunnel/` 准备/启动器，不重新创建 Tunnel/key。实测仅四工具发现、未知 marker 读取、显式有限修改、SHA 对账、撤销后拒绝。2026-11-10 当前账号的上述核心场景已实际通过，详见本轮质量记录；其他验收范围按各自计划处理。

边界：本轮 Native 修改限于专用认证、可信管理入口与原文件执行器接线；不修改 Browser 扩展或 Web Flow，不创建第二套文件服务。
