# WebCodex 本地文件工作区 Demo R1

日期：2026-10-10。范围：OpenDesk Go Native Host 与 OpenDesk Browser 的受限文本文件编辑。

## 当前实现与使用边界

本轮在既有 `opendesk browser native-host` 内增加 `opendesk.local-files.v1` 子协议。浏览器扩展经过已有 Native 安装和配对后，可以从受信任工作区页面列出、读取、编辑用户已授予的目录，并取得真实磁盘保存回执。没有新增 HTTP 文件服务器、第二个 Native Host、shell 执行入口或模型账号转发。

普通网页与 ChatGPT 对话本身没有得到任意本机文件访问权。文件能力由扩展受信任 UI 持有；原页面中显示的内容、Markdown、HTML 与 AI 生成文本都只是输入资料。Browser 必须独立保护请求入口和预览隔离，不能把本子协议直接暴露给网页 `postMessage`、网页 SDK 或用户脚本。

现有 R16 `internal/browserai` 仍是受限工作流规划器：不增加文件、shell 或外部 MCP 工具。当前 Demo 也不宣称 ChatGPT 网页的模型已经注册了本地 MCP 工具；页面内操作、官方模型工具调用和本地 Codex 编码会话是不同的集成层。

## 一次目录授权与后续操作

前提是已完成 [现有 Native Host 安装与配对](native-messaging-host.zh-CN.md)，且实际安装的 OpenDesk 包含本轮代码。旧程序不会因为只更新浏览器 UI 就自动具备文件接口。

从任何终端工作目录，用户或已获授权的本机 Agent 执行一条明确目录授权命令。请将下面路径替换为已经存在、属于当前用户的具体项目目录：

```bash
opendesk browser workspace add --path /absolute/path/to/demo-workspace --access read-write
```

只查看内容时，可将 `--access` 改为 `read-only`。`--access` 必须显式提供，不默认授予写权限。输出只有工作区名称、不透明 `workspaceId` 和访问级别，不会向扩展发送绝对路径。

然后进入 OpenDesk Browser 的本地文件工作区页面，刷新工作区列表，打开 Markdown、HTML 或其他支持的文本文件。正常读取与保存复用此前授权，不再次显示授权弹窗。保存应以当前读到的 SHA-256 为前提；文件已被编辑器改变时，扩展应显示冲突并要求重新读取或人工合并。

撤销同一份授权：

```bash
opendesk browser workspace list
opendesk browser workspace revoke --workspace-id workspace-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

`workspaceId` 必须使用 `list` 或 `add` 的实际输出。撤销完成后新的文件操作立即失败，不需要重启 Host。CLI 授权与 Native 文件操作共用进程间锁，撤销遇到正在执行的操作会返回 `E_FILES_BUSY`，不能把尚未完成的撤销显示为已完成。

再次对同一目录执行明确的 `add --access …` 可以调整访问级别。目录被替换成其他 inode 后不会自动继承原授权，需要先撤销旧条目，再授权当前真实目录。

这一版的目录授权入口是可信本机 CLI；正式原生文件夹选择器尚未实现。已授权目录内的后续工作不要求重复输入路径或再次批准。

## 支持内容与预览职责

支持扩展名：`.md`、`.markdown`、`.txt`、`.html`、`.htm`、`.json`、`.css`、`.js`、`.jsx`、`.ts`、`.tsx`、`.mjs`。

正文为 UTF-8，每份最多 32 KiB，允许空文件，拒绝 NUL 与无效 UTF-8。整个 Native JSON 帧仍不得超过 60 KiB；如果大量字符需要 JSON 转义，即使原文不足 32 KiB，也可能得到 `E_FILES_LIMIT`。目录遍历逐层进行，一次最多扫描 512 个条目，返回不超过 128 个合格条目及约 40 KiB 列表数据，剩余条目通过 `truncated` 明示。

Markdown 与 HTML 的渲染归 Browser。建议 Markdown 净化后显示，HTML 放在独立 sandbox iframe 中；预览不能继承文件能力。Next.js、TSX 与 JS 在本接口中仅作为文本读写。启动 Next.js 服务、安装依赖或执行 package scripts 不属于本接口，也不由读取某个文件自动触发。

本轮没有文件删除、目录创建、后台文件监听或多文件事务。现有父目录中的新文件使用独占创建，目标已存在则返回错误，不覆盖已有内容。

## Native 协议

原 `com.shopable.opendesk_browser.agent` Host 与 60 KiB 帧保持不变。既有 CLI → Browser 十个 RPC 和 `dev.request` 单文件脚本 Provider 也不改变。

1. Host `hello` 增加 `localFilesVersion: 1`。
2. 支持本协议的扩展在既有 `welcome` 中回传 `localFilesVersion: 1`。
3. 完成精确扩展身份校验后，Host 发送一次 `files.state`，其中 `sessionId` 每个 Native 连接随机生成。
4. 未协商的旧扩展不会收到额外文件帧，也不能调用文件接口。

状态消息：

```json
{
  "v": 1,
  "kind": "files.state",
  "protocol": "opendesk.local-files.v1",
  "connected": true,
  "sessionId": "<本次连接生成的随机 ID>",
  "maxContentBytes": 32768
}
```

读取请求示意，实际请求必须保留 Host 给出的 session 和已授予工作区 ID：

```json
{
  "v": 1,
  "kind": "files.request",
  "protocol": "opendesk.local-files.v1",
  "requestId": "unique-request-id",
  "sessionId": "<当前 Native session ID>",
  "method": "files.read",
  "params": {
    "workspaceId": "<已授权 workspaceId>",
    "path": "README.md"
  }
}
```

响应保留 `v`、`protocol`、`requestId`、`sessionId`，`kind` 为 `files.response`，只包含 `result` 或 `error`。

| 方法 | 参数 | 主要结果 |
| --- | --- | --- |
| `files.status` | `{}` | `supported:true`、`version:1`、正文/帧预算、支持的方法、`writePrecondition:"sha256-optimistic"` |
| `workspaces.list` | `{}` | `workspaces:[{workspaceId,name,access}]` |
| `files.list` | `{workspaceId,path:""}`，或相对目录 | `{workspaceId,path,entries:[{name,path,kind,bytes?}],truncated}`；`kind` 为 `file` 或 `directory` |
| `files.read` | `{workspaceId,path}` | `{workspaceId,path,content,sha256,bytes}` |
| `files.write` | `{workspaceId,path,content,expectedSha256}` | `{workspaceId,path,saved:true,sha256,bytes}`；仅覆盖已有文本，旧 hash 必填 |
| `files.create` | `{workspaceId,path,content}` | 同保存回执并含 `created:true`；已有路径返回 `E_FILES_EXISTS` |

请求顶层与参数对象拒绝重复字段、未知字段与非法类型；方法不在 allowlist 中直接拒绝。Native 的普通 `request`、本机 Socket 客户端及 R16 `ai.request` 都不能调用这些方法。

常见错误：`E_FILES_ACCESS`、`E_FILES_PATH`、`E_FILES_TYPE`、`E_FILES_NOT_FOUND`、`E_FILES_EXISTS`、`E_FILES_CONFLICT`、`E_FILES_LIMIT`、`E_FILES_ENCODING`、`E_FILES_SESSION`、`E_FILES_BUSY`、`E_FILES_IO`。参数错误为 `E_SCHEMA`；同一 mutation requestId 改变参数为 `E_REQUEST_CONFLICT`。错误文字固定，不透传包含绝对路径的系统错误。

## 保存与冲突的准确承诺

保存先读取并核对 SHA-256，在同目录私有临时文件中写入完整内容、保持普通权限位并 `Sync`，然后再次检查授权根、父目录、目标 inode、大小、修改时间及内容 hash。已有文件使用 `os.Root.Rename` 原子替换名称；新文件先以 `O_EXCL` 创建临时 inode，完整写入后以 `os.Root.Link` 独占发布，再移除临时名称。因此新建不会覆盖另一个编辑器刚创建的同名文件。

发布后核对实际文件身份和字节内容，再同步父目录；`saved:true` 只在这些步骤完成后返回。源码、图片、Node_modules 或 Next.js 服务的运行成功不能从这个保存回执推断。

这提供**服务内串行化、跨 Native 连接互斥及写前内容冲突检测**。对于不使用本服务锁的外部编辑器，最后一次检查与 `rename` 之间仍有很小的竞争窗口；这里不承诺操作系统级严格 compare-and-swap。普通权限位会保留，但不承诺原文件 ACL、扩展属性或 inode 不变，也不提供目录级多文件事务。

目标发布前明确拒绝的请求返回 `outcome:"NOT_DISPATCHED"`。真正尝试发布后出现无法确定的 I/O 错误，或发布后读回/同步失败，返回 `E_EFFECT_UNKNOWN`、`outcome:"OUTCOME_UNKNOWN"`。独占创建的明确 `E_FILES_EXISTS` 不算未知写入。

一条 Native 连接保留最多 128 条 mutation 回执。重复相同 requestId 和相同请求只返回原回执，不再次写磁盘；同 ID 换内容直接冲突。该记录不是跨重连的持久事务日志。扩展断线、超时或收到未知写入状态时，应停止保存并让用户读取实际磁盘内容核实，不能自动换 requestId 或重连后重放。读取恢复必须确认当前内容，不能仅凭旧保存回执清除未知状态。

## 目录边界与生命周期

- 目录授权保存于当前用户私有 0600 文件，绑定安装 credential digest、精确扩展 ID、真实目录 device/inode；最多 8 个工作区。
- 浏览器只接收 opaque ID、名称和相对路径；没有请求能够新增目录授权或升级访问级别。
- Go 使用 `os.Root` 及固定父目录句柄操作。每个相对路径组件、最终文件与授权目录都校验；拒绝 `..`、绝对路径、反斜线、控制字符、隐藏路径、`node_modules`、符号链接、硬链接、特殊文件以及跨 device 子路径。
- 所选目录与可操作的子目录/文件必须属于当前用户，且不允许其他账号通过组或全局写权限修改它们；读取允许 owner 只读文件，保存还要求 owner 写位。
- 这不是对同一 OS 用户恶意修改程序、配置、挂载或文件系统的完整操作系统隔离。`os.Root` 的边界与本地文件系统行为不能被扩张成对所有远程文件系统及非合作写入者的事务承诺。
- Native EOF、Host 关闭和新连接会废弃旧 session；旧 session 不能创建或保存文件。已经发生但未收到回执的效果需要只读核实。
- 卸载 Host 会删除工作区授权及锁文件，不删除用户项目目录或项目内容。

## 源码与验证

| 路径 | 职责 |
| --- | --- |
| `internal/browserbridge/files_protocol.go` | 独立请求 schema、固定错误和消息预算 |
| `internal/browserbridge/workspace_store_unix.go` | 本机目录授权、私有持久化、进程间锁和根身份 |
| `internal/browserbridge/files_service_unix.go` | 受限读写、目录枚举、SHA 前提、独占发布和 session 回执 |
| `internal/browserbridge/host_files_unix.go` | 已认证 Native Port 上的有界调度 |
| `internal/browserbridge/host_unix.go` | capability 协商、生命周期接入；原其他子协议不变 |
| `internal/browsercli/command.go` | `workspace add/list/revoke/help` |
| `internal/browserbridge/files_unix_test.go` | 私有 Native、真实临时目录/文件、冲突与身份测试 |
| `internal/browsercli/workspace_test.go` | 明确权限参数、授权列表及撤销 CLI 测试 |
| `tests/browser-native-files/tools/native-host/main.go` | 使用生产 Browser CLI/Host 的组件测试 executable；不是桌面发行包 |

从 OpenDesk 仓库根目录执行：

```bash
go test -race ./internal/browserbridge ./internal/browsercli -run 'TestNativeFiles|TestWorkspaceCLI' -count=1 -v
go vet ./internal/browserbridge ./internal/browsercli
node scripts/audit_test_architecture.js
```

这些测试使用真实临时文件与 Native frames 验证字节、hash、inode、目录授权、旧 session、路径拒绝、编码与帧预算、并发、撤销和回执。不是模拟数据“假保存”，但也不替代实际 macOS 应用构建、安装和真实 Chrome 界面操作。

需要纯组件 executable 时，可从仓库根目录执行：

```bash
go build -o .runtime/tests/native-files/opendesk-native-files-fixture ./tests/browser-native-files/tools/native-host
.runtime/tests/native-files/opendesk-native-files-fixture browser workspace help
```

组件 executable 未改变生产 Host 的 Socket、身份、安装或文件检查要求。环境禁止 Unix Socket 时，它仍会失败；不得增加生产绕过开关来伪造 Chrome 全链路通过。运行日志与二进制归 `.runtime/tests/native-files/`。

本次开发环境的 Go 1.25.13 结果：

| 验证 | 结果及范围 |
| --- | --- |
| 新文件能力定向 race | PASS：11 个 Native 文件 case 与 1 个授权 CLI case，真实临时文件及 Native frame |
| 相邻回归 | PASS：3 个 R16 Native AI、3 个既有 Go 单文件 Provider、2 个帧/请求 case；合计 20 个顶层 case 通过 |
| `go vet` | PASS：`internal/browserbridge` 与 `internal/browsercli` |
| Darwin arm64 | PASS：相关包测试二进制与组件 CLI 交叉编译；未运行 Mach-O，不等于 macOS 真机 |
| 组件 CLI 构建与 help 命令 | PASS；使用生产 Browser CLI/Host，不含 Desktop/UI |
| 测试目录架构审计 | FAIL：24 个既有未登记 Go 测试。已逐项核对都存在于实施前 `005a2f33a640c76565775a398b243f1d66a6caf1`，且此前账本无登记；本轮两个新测试文件已登记 |
| 完整桌面 `go build ./cmd/opendesk` | 未完成：离线缓存缺少既有桌面依赖；未为此改写依赖、下载替代包或声称发行程序通过 |
| macOS OpenDesk.app 安装、真实 Chrome Native 文件工作区与 ChatGPT 页内操作 | 本 Go 组件任务 NOT_TESTED；由相应环境与 Browser 验收分别提供证据 |

原始日志、Darwin 编译物、组件 CLI 与架构基线核查位于 `.runtime/tests/native-files/`。这里只记录本轮实际运行结果，不能把组件测试写成桌面或网页端已通过。
