# OpenDesk Go · 本地目录直连 R17

本轮源码提交：`34649d24ee821298f586abba257e9e41b89a4cec`（master）；配套 Browser：`c41102d7e2dd13510f718f69061f8194251eb767`（main）。[原始证据与机器索引](evidence/webcodex-request-loop-20261010/README.md)；实际 Mac 安装与同一对话 P0/两轮保存仍为 NOT_TESTED。

> 当前 R17.1 默认临时读写、显式只读与权限失效实现见本文；Mac 真机验收仍为 NOT_TESTED。[实施前 R17.1 决策快照](browser-dev-session-rw-r17-1-decisions.zh-CN.md) 保留当时的设计状态；本地执行以 [本轮完整 Mac 验收任务](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/framework/prompts/goal-webcodex-chat-edit-r2-local-acceptance.zh-CN.md) 为准。

日期：2026-10-10。OpenDesk 仅在 `master`，Browser 仅在 `main`。日常入口、实际 npm 包安装和 Chrome 验收见 [Browser R17 使用指南](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/framework/local-directory-cli-r17.zh-CN.md)。

## 双入口和原命令

```sh
cd "/absolute/path/项目 A"
opendesk browser
opendesk browser dev
opendesk browser dev "/absolute/path/项目 B"
opendesk browser dev --read-only "/absolute/path/只读目录"
opendesk-dev
opendesk-dev "/absolute/path/项目 B"
opendesk-dev --read-only "/absolute/path/只读目录"
```

裸 `browser` 等价于 `browser dev .`；`opendesk browser --read-only` 等价于 `opendesk browser dev --read-only .`。`--read-only` 必须在目录之前；带特殊目录名时使用 `dev -- <路径>` 或 `dev --read-only -- <路径>`。新目录默认申请本次 CLI 会话的 `read-write`，不需要先执行 `workspace add`。授权根就是参数目录，省略时为当前目录，不向 Git 根、父目录或主目录扩大。原 `setup/update/doctor/cleanup/workspace/project/ai/native-host/bridge.status/run.*/page.*` 子命令不改语义；未知子命令不会冒充目录。帮助与版本查询没有文件、Node Provider、浏览器打开或授权副作用。

`internal/browsercli/dev_unix.go` 通过私有安装凭据关联已注册的 `@shopable/opendesk-dev` npm 全局包入口，核对入口路径、SHA-256 及 `entry.json` 中 `localDevAccessVersion:1`，按数组参数启动 Node，并保留工作目录、stdio、退出码和中断信号。Go Native Host 自身不依赖 Node；它也不会从当前工作目录找同名程序、切换旧 Host、安装未知 npm 依赖或请求 latest。旧 npm 登记缺少访问版本时返回 `E_DEV_COMPONENT_UPDATE_REQUIRED`；安装对应新版 npm 包并重新执行 `opendesk-dev --register-go`，不能继续调用旧 Node 并把只读结果声称为新默认读写。本期支持已配对 macOS/Linux Host；其他平台应报告明确不支持。

## 原生协议：共享 Host，多个来源

仍使用原 `com.shopable.opendesk_browser.agent`、精确扩展 ID、同一用户受认证 Socket、60 KiB 消息预算和 Browser 的原网页权限/RunHost/Controller。目录聚合仍协商 `localDevMultiVersion:1` 与 `localFilesVersion:1`。本轮增加 `localDevAccessVersion:1`：Go 在 Native `hello` 广告，扩展在 `welcome` 回显，认证 Socket 的 `authenticated` 只有协商成功后才返回 `1`。新 Node 在申请访问级别之前核对该能力；缺失时返回 `E_NATIVE_UPDATE_REQUIRED`，不能静默回退到旧默认只读或抢占旧 MCP 的独占 Provider。

新本地 CLI 将明确目录通过 `{v:1,kind:"dev.attach",path:"<绝对目录>",access:"read-write"}` 登记为**本次会话临时读写** Workspace；`--read-only` 发送 `access:"read-only"`。Go 严格拒绝重复/未知字段、空值和其他权限值。旧客户端省略 `access` 时，新目录仍按旧的 `read-only` 处理。Go 校验路径、owner、设备/inode 和已配对安装身份，为它生成不透明 `sourceId/workspaceId`。普通 MD/HTML 目录不要求程序清单。只有已声明合法 `opendesk.project.v1` 的目录才由同一 Node `LocalDevSession/Resolver/Provider` 提供运行源码；没有第二套执行器或项目数据库。

`host_dev_multi_unix.go` 将 Node `catalogVersion:2` 来源、旧 MCP Provider 和现有 Go JS 单文件授权汇总成 Browser `projects.list`；`project.resolve` 使用有界映射按 owner、Provider epoch 和原始 binding ID 路由。不同文件夹即使 basename 和程序 ID 相同也不混淆；同一来源不允许第二个 CLI/Provider 抢占。回复身份、消息大小、超时和 Provider 所属会话均须检查。源集合变化旋转聚合 epoch，迟到回复不能恢复过期源码。

CLI Ctrl+C、进程异常退出和 owner Socket 断开只撤销自己拥有的临时目录、关闭自己的 Provider；不撤销原 `WorkspaceAdd` 产生的长期写授权，不停止其它目录，也不重放业务。Host 不通过 CLI 自动执行网页 JS、npm scripts、HTTPS 模块下载或 Shell。

## 访问级别与会话身份

| 目录当前状态 | 新 CLI 默认 `read-write` | 显式 `--read-only` |
| --- | --- | --- |
| 没有授权、没有在线会话 | 新建临时读写接入 | 新建临时只读接入 |
| 已有长期 `read-write` | 复用原 `workspaceId` 与长期权限 | `E_DEV_ACCESS_CONFLICT`，不降级长期权限 |
| 已有长期 `read-only` | 复用只读，返回 `persistent-read-only` 原因 | 复用只读 |
| 同目录已有有效 CLI | 复用已有实际权限与公开代次，不夺租约、不升级 | 现有只读则复用；现有读写返回模式冲突 |

`dev.attached` 保留私有 owner `leaseId`，另返回独立随机、非凭据的公开 `leaseEpoch`；同目录重复启动返回空 `leaseId` 与 `alreadyActive:true`，仅供展示，不转让会话。返回的 `access` 是 Go 当前真实有效权限，`accessReason` 为 `temporary-cli`、`persistent-read-only`、`persistent-read-write` 或 `active-session`。CLI/扩展不得根据自己申请的模式伪造实际权限。

`workspaces.list` 沿用原工作区列表，增加 `sourceId`、`accessReason`；在线 CLI 目录另带 `leaseEpoch`，临时目录带 `temporary:true`。长期工作区没有 CLI 时不带 `leaseEpoch`。同目录停止后再启动可复用稳定的 `sourceId/workspaceId`，但一定生成新的 `leaseEpoch`；旧回调不能恢复当前能力。CLI 退出会清除长期工作区上的会话代次，长期授权本身继续保留。

`files.state` 与 `files.status` 广告 `devLeaseEpoch:1`。`files.list/read/write/create` 可附加 `leaseEpoch`，Go 在真正操作和重复写回执之前校验：旧代次、错误工作区代次、退出后的请求返回 `E_FILES_SESSION`。省略字段保留 R1 文件协议兼容；新 WebCodex 必须从实时列表取得当前代次并透传。长期工作区无 CLI 时，新客户端显式发送 `leaseEpoch:""`，表示预期当前没有 CLI 绑定；若检查后、保存前发生 CLI 接入，Go 会在同一文件锁内返回 `E_FILES_SESSION`，防止跨过新绑定保存。不能用旧缓存恢复临时授权。文件协议 session 仍绑定 Native 连接；这两个 ID 都不是权限凭证。显式长期授权修改权限或撤销后，旧 CLI 视图失效，不能形成并行的临时权限覆盖。

权限失效不会因随后改回原模式而恢复。现有私有 `workspace-grants.v1.json` 的可选 `devLeaseFences` 保存最多 12 条失效元数据，每条只有公开的 `sessionId/workspaceId/sourceId/leaseEpoch` 和单向 `retired` 标记，不含目录路径、访问级别或 owner 凭据。临时目录授权仍只在 Host 内存，不进入长期 `workspaces` 数组。`WorkspaceAdd/Revoke` 与文件执行在原有进程间锁内读写同一份记录，所以即使另一个 CLI 进程在两次 Native 请求之间完成 `read-write → read-only → read-write`，或临时读写目录经历「增加长期只读 → 撤销长期授权」，旧代次也不能恢复。相同授权的无变化重复登记不会失效；其他目录不受影响。

正常 owner 退出仅清除自己匹配的代次记录；异常退出留下的记录不能重建任何权限，由下一次唯一 Socket Host 的明确接入清除旧 session 元数据。记录写入失败则本次接入失败，不先建立内存授权；清理写入失败仍先撤销该 owner 的内存权限。发生明确长期授权变化时，当前 CLI 的旧视图保持失效，需停止其原 owner 后重新运行 CLI、重新绑定和读取；不能靠重复启动取得旧租约或恢复旧提案。

存储兼容边界：新 Go 能读取没有 `devLeaseFences` 的旧 store；旧 Go 的严格字段校验会对含该字段的 store 返回 `E_FILES_ACCESS`，不会忽略失效记录后继续授权。CLI 与 Native 应使用本轮对应版本。正常释放最后一项记录后，该可选字段不再写出；不得手工删除失效元数据来绕过版本要求。这里的旧 schema 定向测试使用原字段集合和生产 strict decoder，不等于旧版本 Mac executable 已实测。

## 文件安全与页面

`dev_workspace_unix.go` 重用 `files_service_unix.go` 的目录扫描、文本预算、路径穿越/符号链接拒绝和已授权文件读写接口。新默认临时 `read-write` 通过真实 `files.write/files.create` 文件服务保存；`--read-only` 和长期 `read-only` 在 Go 中拒绝写入及创建，不能只禁用按钮。所有读写仍使用原 SHA-256 乐观并发冲突与保存后读回。Chrome URL 仅携带不透明来源定位 ID，权限依旧在每个 Native 文件请求中检查。

扩展复用 `native-agent/workspace.html` 而非新 IDE；用户在页面上可以看目录、静态预览与编辑，显式保存、另存或进入原开发侧栏。Chrome Side Panel 仍必须由用户手势开启，扩展文件 Workspace 不能替代实际网站的运行目标。

## 测试分级

Go 定向入口见本页下方命令。`dev_workspace_unix_test.go` 覆盖默认申请临时读写的两轮真实临时文件操作与独立磁盘 SHA、旧客户端只读、显式只读/长期只读、同名目录隔离、权限冲突、重复接入、旧代次重放与按归属释放；还包括独立 CLI 子进程改变再恢复权限的失效测试、记录无法写入时拒绝接入、元数据无法重建临时授权和 owner 清理。`host_dev_multi_unix_test.go` 使用真实 Socket 和组件级 Chrome Native 帧核对双 Provider/回包/生命周期，并校验新权限 schema 与能力协商；它不是真实 Chrome。CI 状态需另核对对应提交的实际运行结果，本轮本地通过不等于 CI 已通过。

Browser R17 CI 在 macOS、Ubuntu 将真实 npm tarball 安装于源码树之外，并从安装包导入 Resolver/Session 后运行扩展构建；该结果是组件和打包证据，不是 Chrome UI 或本机 OpenDesk.app 已加载新代码。真实 Mac 安装、Chrome Profile/扩展 ID、双目录标签页打开、外部文件冲突、Controller 新运行与原结果身份，均须用户设备实际验证后才可标为 PASS；否则记 `NOT_TESTED`。

R17 与高级 Codex MCP、Go JS 单文件和长期 Workspace 授权共存，不扩张 R16 AI 规划器或桌面自动化权限。


### 本轮容器验证与真实设备边界

本轮在 Linux 网页执行器验证真实临时文件与生产文件服务，不具备用户 Mac/Chrome。使用 Go 1.25.13，源码实现完成后的证据目录为 `.runtime/tests/webcodex-access/`：

| 验证 | 结果 | 实际范围 |
| --- | --- | --- |
| 相关 `go test -race` | PASS | 29 个顶层 case、7 个权限子项及 4 个权限恢复子项；含真实临时文件两轮读写、独立 SHA、只读/冲突/重放/退出、明确无 CLI 代次竞态及跨 CLI 进程的权限恢复拒绝 |
| `go vet ./internal/browserbridge ./internal/browsercli` | PASS | 本轮生产文件服务和 CLI 包 |
| Linux 组件 CLI 构建、`browser dev --help` | PASS | 使用生产 Browser CLI/Host 的组件 executable，未替换用户安装 |
| Darwin arm64 组件 CLI、相关测试二进制交叉编译 | PASS | Mach-O 产物，不执行 Mac Runtime |
| 真实 Unix Socket 聚合/Provider 测试 | FAIL（环境拒绝） | `Native Host stopped before hello: ... socket: operation not permitted`；独立创建 Unix Socket 也被执行器拒绝 |
| 用户 Mac executable、Native manifest、npm 登记、Chrome 加载与两轮同一对话 | NOT_TESTED | 当前环境无真实 Mac/Chrome 权限，交由对应提交的本机验收任务继续 |

定向命令：

```sh
go test -race -count=1 ./internal/browserbridge ./internal/browsercli -run 'TestR17Temporary|TestR17Permanent|TestR17Writable|TestR17Effective|TestR17Explicit|TestR17DevAttach|TestR17AccessCapability|TestR17Go|TestR17ReadOnly|TestNativeFiles|TestWorkspaceCLI|TestR17WorkspacePermissionABA|TestR17DevLeaseMetadata|TestR17UnchangedPermanent' -v
go test -count=1 ./internal/browserbridge -run '^TestR17HostConcurrentDirectoriesAndScopedResolver$' -v
go vet ./internal/browserbridge ./internal/browsercli
```

第二条真实 Socket 测试保留完整门槛，必须在本机复测，不能以第一条纯组件结果替换。

后续 CI 核对：本轮源码 `34649d24ee821298f586abba257e9e41b89a4cec` 的 [Browser Native Messaging Go bridge #38060523393](https://github.com/shopable-ai/opendesk/actions/runs/38060523393) 已通过 Ubuntu/macOS 的三个受影响包完整测试（含真实 Socket），并通过 macOS executable 对模拟 Chrome framing 的安装/CLI smoke。该 CI 使用既有 `SKIP_CODESIGN=1` 构建与固定历史 Browser framing fixture，不是用户签名安装，也不是新 Browser+Go 在指定 ChatGPT 对话中的验收。原 Linux 本地 EPERM 失败继续保留；原始状态见 [CI 索引](evidence/webcodex-request-loop-20261010/go-ci.json)。

权限恢复回归在修复前 4 个子项全部失败，旧 `leaseEpoch` 确实得到 `saved:true`；原始失败记录保留于 `go-permission-aba-before.log`。修复后的 `go-permission-aba-after.log` 为原 4 子项通过，最终 `go-permission-aba-race.log` 还覆盖两个独立 CLI 子进程、旧成功回执、目录 B 保持读写、owner 释放和新代次接入。失败证据未改写为历史 PASS。

R17 默认读写通过只证明目录接入与文件权限部分。WebCodex 还必须在指定的同一官方 ChatGPT 对话执行结构化读取请求、Native 读取、自动回填、用户网页发送、模型依据真实内容提出修改、审阅采用、显式保存，并完成两轮和独立磁盘读回。这里不是向 ChatGPT 注册 MCP 工具；普通网页与模型不持有 Native 凭据或文件 RPC。当前 Mac 安装身份、浏览器加载身份、P0 随机标记与两轮网页闭环均为 `NOT_TESTED`，使用 Browser 对应本轮提交的 Mac 验收任务继续。
