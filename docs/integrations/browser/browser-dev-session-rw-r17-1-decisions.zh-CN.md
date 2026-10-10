# OpenDesk Go / R17.1：`browser dev` 临时目录默认读写——授权契约与边界

> 日期：2026-10-10  
> 状态：**新的目标契约已确认，代码修改与用户 Mac 真机验收待完成**。截至本文件创建前检查的 `master`，`internal/browserbridge/dev_workspace_unix.go` 对新 CLI 临时目录仍设置 `Access: "read-only"`。本文件不能当作已实现读写的证据。  
> 联动 Browser 文档：[WebCodex R3 × R17.1 决策](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/architecture/browser-framework/webcodex-browser-dev-chat-bridge-r3-decisions.zh-CN.md)。

## 1. 为什么要调整

最终体验是用户直接在要编辑的项目目录执行：

```sh
cd "/absolute/path/项目 A"
opendesk browser dev

# 等价入口
opendesk browser
opendesk browser dev "/absolute/path/项目 B"
opendesk-dev "/absolute/path/项目 B"
```

一个运行中的目录就是一个**临时可读写的文件工作区**，无需先运行 `opendesk browser workspace add --access read-write`。多个目录可独立在线。目录只读或目录生命周期失效时，要让 Workspace/原生文件后端显示准确状态并禁止写入。

此行为来自**本机用户明确启动受信 CLI 并指定根目录**，不是 ChatGPT 回复、浏览器页面、历史项目名称、旧源码 Provider 或随意网页脚本授予的权限。

## 2. 授权优先级和租约

| 来源 | 新目标的实际文件权限 | 租约与释放 |
| --- | --- | --- |
| 新目录的 `browser dev` / `opendesk-dev` | 默认 `read-write`，仅限显式启动的根目录与受支持文件 | 当前认证 CLI 会话的临时租约，进程终止/租约失效后撤销 |
| 旧客户端未携带新访问级别字段 | **保持旧只读行为**，不隐式扩权 | 保持兼容协议语义 |
| 明确 `--read-only` | 只读；是**待新增选项**，不得假装已经支持 | 会话临时授权，Native 写盘仍拒绝 |
| 已有长期 `workspace add --access read-write` | 继续复用原 `workspaceId` 与长期授权 | CLI 退出不影响长期授权 |
| 已有明确长期 `read-only` | **继续只读**，新默认启动不能悄悄升级它 | 长期授权独立于 CLI |
| 同目录已由另一 CLI 在线 | 不重复抢租约，不出现两个互相矛盾的有效模式 | 第二入口退出不得影响第一租约 |

若不同入口或既有授权发生读写模式冲突，应明确返回**有效模式及冲突原因**；不能通过创建影子 `workspaceId` 暗中绕过既有明确只读授权。退出/断线只撤销调用者拥有的临时租约，不能撤销其他 CLI、持久授权或旧 RunHost 结果。

## 3. 改造位置与协议契约

优先复用：
- `internal/browsercli/command.go` / `dev_unix.go`：Go CLI 向已登记、校验 SHA 的 npm/Node `opendesk-dev` 入口传递参数；裸 `opendesk browser` 与 `dev .` 保持等价。
- Browser 包中的 `native-agent/local-dev/{dev-cli,provider,resolver,session}.mjs`：解析目录和显式只读标志，申请接入时传递访问级别。
- `internal/browserbridge/dev_workspace_unix.go`：受信接入、`sourceId`/`workspaceId`、临时 Workspace。
- `internal/browserbridge/host_dev_multi_unix.go`：多个来源的 owner/epoch/租约与消息路由。
- `internal/browserbridge/files_service_unix.go` 和 `workspace_store_unix.go`：实际文件 RPC、持续权限判定、长期授权与文件安全。
- 原有 Native manifest、握手、Go 文件服务、Socket 和授权身份**不重造第二套**。

**需要完成的接口契约（当前尚未交付）**：
1. 明确 CLI 访问级别 `read-write`/`read-only` 的来源，以及传入 `dev.attach` 的字段和严格 schema；如果旧端没有该字段，保留只读旧语义。
2. 能力或版本协商足以避免新 CLI/旧 Go、新 Go/旧 CLI 错配。禁止在未区分版本的旧请求上把默认值改成写权限。
3. Go 核实目录、调用者、安装身份、租约 owner 后，返回真实 `access`、`workspaceId`、`sourceId`、临时/长期来源信息；Browser UI 必须以此实时状态决定保存可用性。
4. 重复接入、两入口共存、会话关闭、Go Host 重启和过期响应均不得让权限过期后复活。真正文件写请求每次重新校验实时授权，UI/缓存不能替代授权。
5. `--read-only` 必须在 CLI、Go、帮助、文档和测试中一致；已有读写来源如果无法满足显式只读，不可虚称成功，应该清楚说明冲突或提供经过证明的不扩权模式。
6. 所有原有 `setup/update/doctor/workspace/project/ai/native-host/run.*` 语义保留；未知命令、`help`、`--version` 不产生授权或窗口副作用。

## 4. 路径和文件边界不放宽

- 仅用户本机拥有且可核验的显式根目录。维护绝对路径物理身份、目录 owner、inode/device、不安全祖先 symlink、`..` 越界、隐藏目录和 `node_modules` 等既有限制。
- 子路径由现有 Go `os.Root` 及路径/文件身份检查处理。无条件拒绝目录外路径、非允许格式、超限文本和权限失效后的写入；不自动扩大至父目录、Git 顶层、`HOME` 或其它项目。
- 沿用 32 KiB 单文件正文、60 KiB Native 帧和现有扩展/路径名单限制；未另行实现的多文件事务、删除/重命名、Shell 等不因读写接入而开放。
- 读写流程保留 `expectedSha256`、正式保存前的重复版本检查、原子替换、保存后读回和 `OUTCOME_UNKNOWN` 禁止盲目重复写入。SHA 乐观冲突保护不能宣传为消除了外部非协作编辑器在最后检查—重命名之间的竞态。
- Native 受限文件能力只暴露给可信扩展 Workspace，ChatGPT 页面的脚本/模型字符串/不可信 iframe 不直接获得文件 RPC；模型不能以文本声明提升 `access`。

## 5. 展示与多目录身份

`sourceId` 是受信来源标识，不是权限凭据；`workspaceId` 决定文件操作目标，`bindingId`/`providerEpoch` 供运行源码路由。不得因同名目录或历史缓存串联权限。Workspace 和开发侧栏应显示一致名称、同名区分、在线/离线和实际权限；由来源 A 打开侧栏不得跳到来源 B。CLI 退出后仅能展示待连接历史名称，不能继续访问磁盘。

文件读写授权**不会**自动允许 Controller/Page 的网站操作，不会自动执行项目 `npm scripts`、JS、HTTP 服务或 RunHost，也不会向 ChatGPT 模型自动注册 MCP 工具。这些属于独立运行授权和调用链。

## 6. 增量测试与交付门槛

先在两仓库读取 `AGENTS.md`、R17/R2 工作流和当前源码，不重复实现 Native Host/LocalDevResolver。

必须验证：
1. **旧 CLI 不传 access**：在新 Go 上仍为只读，Native `files.write/files.create` 被拒。
2. **新 CLI 默认读写**：新目录不执行 `workspace add` 即可真实 `files.read`、`files.write`、读回 + 终端磁盘 SHA 核对。
3. **显式只读和长期只读**：原生拒绝写盘，不能只测 UI 禁用。
4. **长期读写**：复用相同身份，CLI 退出后持续有效。
5. **两目录同名与多入口**：同时在线、不会串流；重复接入和退出不误清其他 owner。
6. **路径与会话安全**：owner/inode/symlink、穿越、撤权、跨来源伪造 ACK、过期 epoch、断线与未知写入均维持拒绝/保守处理。
7. **真实安装身份**：用户 Mac 的 Go executable、注册的 npm tarball/Node 入口、Native manifest/扩展 ID、Chrome 加载包与对应源码 SHA 均核验。

组件/CI 通过不等于用户 Mac Chrome 实机通过。保留历史默认只读测试结果及其旧代码 SHA；本轮新增对应新行为的定向回归，不能为追求 PASS 放宽断言。已完成代码才更新当前用户指南和验收提示词中的默认权限描述。

## 7. 后续任务入口

- [Browser WebCodex R3 + R17.1 完整实施 GOAL](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/framework/prompts/goal-webcodex-browser-dev-chat-bridge-r3-main.zh-CN.md)
- [Browser R17 历史使用指南](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/framework/local-directory-cli-r17.zh-CN.md)
- [现有 Go R17 基线文档](local-directory-cli-r17.zh-CN.md)

**未声明的完成状态**：本文件只保存变更决策与实现契约；后续若真实 Go 没有读写授权行为或 Mac 磁盘证据，报告 `NOT_TESTED` / `FAIL`，不可从本文件推断已交付。