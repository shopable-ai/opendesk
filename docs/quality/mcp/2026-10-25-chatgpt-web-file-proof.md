# ChatGPT 官方网页到本机的文件证明

开始日期：2026-10-25；在线验收：2026-10-26（Asia/Shanghai）。
工作目录：`/Users/shopme/Documents/workspace/opendesk`；分支：`master`。

## 当前结果

**当前正式版本核心验收：PASS。核心已验收，完整安全交付未完成。**
第三轮使用正式维护的准备入口、启动器和 relay，复用现有专用资源与授权保存的 runtime key，
完成官方 ChatGPT 网页 → 官方 Secure MCP Tunnel → 本机受限 MCP 的真实写入、同实例读取、
独立磁盘核对和所属进程清理。新 run、新 nonce、一条自然语言请求，写入准确一次。
此前正式工具仅有 doctor 和合成验证的 `NOT_TESTED` 状态已由本轮在线证据更新。

| 必须区分的状态 | 当前结论 |
|---|---|
| 核心实现与历史真实验收 | PASS；前两轮网页及 proof 保留 |
| 当前正式维护工具版本的真实网页验收 | PASS；第三轮满足下列 A–G |
| 官方候选 key 的身份、权限和到期日 | PASS；已读取官方详情，仅有 Tunnels Read + Use；与本地保存文件的对应关系仍未证明 |
| 历史 key 暴露的安全恢复 | NOT_VERIFIED；暴露 key 身份、与保存 key 的对应关系及撤销/轮换未闭环 |

[当前版本验收对话](https://chatgpt.com/c/6ade5129-d714-83ec-a727-e9eaee251e76)，标题“插件验收通过”。
[第二轮](https://chatgpt.com/c/6ade4455-b548-83e8-a694-35f296dd7382)与
[首轮](https://chatgpt.com/c/6ade4038-5ef8-83ee-8919-c94030e1cddf)没有重放。
[专用插件](https://chatgpt.com/plugins/plugin_asdk_app_6ade3f35ab4c8191aec4cad1bbf4c257)
仍为 OpenDesk Web File Test；未新建 Tunnel、插件或 key。

早先一次 CUA 前台切换使 runtime key 出现在工具观察中；删除两份本任务捕获不能证明恢复。
首轮一次 HTTP 409 的原因仍未知；第二、三轮各三次 HTTP 200 无 409，不能追溯解释首轮事件。
不以功能通过抵销安全缺口，不新增数字评分。前一续接 Goal 最后记录为 blocked；
本次续接的 `get_goal` 返回 null，没有迁移、替代或完成该 Goal。

## 2026-10-26 当前续接：30 天草稿与本地项目结果核验

当前恢复入口为 `.runtime/tests/mcp-chatgpt-web/continuation-20261026-credential-local-chain/current-state.json`。
核心三工具 PASS 保留；安全恢复仍为 NOT_VERIFIED。本对话 `get_goal` 返回 null，没有迁移或完成旧 Goal。
以下更新现场状态，不改写历史验收；本轮没有重新运行网页写入。

用户随后明确要求“创建一个月的”，已把原草稿的自定义 29 天调整为官方 **30 天**选项；
这项最新要求替代此前草稿的旧期限上限。主体、组织、Default project、Restricted 和仅 Tunnels Read + Use 保持已核对配置。
`credential-draft.ax.txt`、`credential-draft.png` 是提交前证据；Agent 没有点击 Create secret key，
已把该按钮置于用户面前，并按 CUA 的 Hand-Off Required 请求用户完成最终创建。
新 key 的 Tracking ID、实际到期时间、隐藏保存和认证尚未核实，不能把草稿当成已创建。
用户随后明确回复“已经创建”；当前记录为用户确认创建，尚未读取创建后的官方非秘密元数据。
独立新文件仍不存在，等待用户隐藏保存并关闭 secret 弹窗后再继续；工具拒绝控制 macOS Terminal，未改用其他 UI 路径绕过。
本地隐藏保存辅助脚本仅写入独立的新文件，合成检查通过 0600、拒绝覆盖、拒绝 symlink 和拒绝公开目录；
没有读取真实 key，也没有改写共享旧文件。

旧文件的 0600、当前所有者和父目录 0700 已复核。既有非秘密 sidecar 声明其对应
`key_AL7gua4bfxBSdHtv`，但这是先前的对应关系声明，不能独立证明文件内容或历史暴露 key 身份。
已知消费者包括本报告的受限 Tunnel 和 Browser controlled Tunnel；清单不保证完整。
Browser manager 的现场状态由先前无客户端变为另一个任务的活动客户端，readiness PASS，
但 Browser identity 未验证；本任务没有启动、停止或重绑定它。切换消费者及实际暴露 key 的恢复均未执行。
详见新续接目录的 `credential-status.json`、`credential-consumers.json` 和 `browser-consumer-status.json`。

Browser 的现状已超过下节早先观察的离线状态：Native 已连接，源码 Provider 已注册，
从既有 **开发 → 本地项目** 选择 `local-project-core-check`，只读源码就绪。
Chrome 扩展页确认加载目录为 `opendesk-browser/dist/development`；未证明它由当前 HEAD 完整构建，未重载扩展。
通过既有运行结果入口查询历史 v2 run `dab3483d-e0e9-4a7d-af18-5a4315f3eed4` 并下载 JSON：
375 字节，SHA-256 `30f8177ddeacdc6f8faaa54be2fd93d82abc2c918b6aeadc52448a5826ac7cae`，与界面一致。
结果为“本地项目核心测试 v2”、heading `Browser Test Lab`，保留历史运行时标题；本轮没有重跑该项目。
下载值本身不包含源码 revision，源码身份与历史运行证据分别记录，没有据此合并证明。

点击侧栏的“实时开发预览”打开既有文件工作区，README/Markdown 预览在真实窗口中可读；
自定义 UI 预览同时显示 **E_FILES_NOT_FOUND**，不能报告完整预览通过。
所选输入是 Controller 目录，没有 Sidebar Tool 的 `tool.config.json`/staging；没有据此判定平台缺陷或新增工作台。
`workspace-preview.png` 保留该错误，`extension-source.png` 保留加载目录；同名 AX 文件的非完整/无关观察已在索引中排除。
Browser 另一任务的 `artifacts/local-project-tunnel-core-20261026/core-observations.json` 作为历史执行补证，
其中首次 Stop 的 retirement pending 和之后重验通过均保留，未冒称本轮重验。

本轮只修改本报告、接入指南、非秘密恢复索引和 `.runtime/` 证据；没有修改 Browser 源码、保存源码关联、
重启 Provider、全量测试、构建、提交或推送。完整安全交付和自定义 UI 预览验收仍未完成。

## 2026-10-26 较早续接：官方 key 元数据与本地项目入口

本节更新此前“官方页面读取超时”的状态，不回写第三轮及更早的验收快照。
新证据位于 `.runtime/tests/mcp-chatgpt-web/continuation-20261026-entry-credential/`，
包括 `current-state.json`、`credential-status.json`、非秘密官方详情、实窗截图和保全核对。
本次没有重新启动在线验收、调用远端业务工具或写入 proof。

### 官方元数据与轮换草稿

通过本任务 Chrome「🔎 Tunnel 安全恢复」标签页，读取 API keys 的详情和 General 的组织 ID：

| 字段 | 官方页面观察 |
|---|---|
| 名称 / Tracking ID | OpenDesk Browser Tunnel Runtime 1025 / `key_AL7gua4bfxBSdHtv` |
| 组织 | `org-JY0asITTziD2Z6qyfmq3Eveq` |
| 主体 / 项目 | User，gdrdg / Default project，`proj_UIV0rNR5swEoZX4qdpONhcI3` |
| 状态 / 创建时间 | Active / 2026-10-25 16:21:45 UTC |
| 精确到期时间 | 2026-11-24 16:21:45 UTC，即北京时间 **2026-11-25 00:21:45** |
| Key-level permissions 完整列表 | 仅 Tunnels：`api.organization.tunnel.use api.organization.tunnel.read`；还受主体及组织/项目权限限制 |

依据是 `official-key-details.metadata.txt`、`official-organization.metadata.txt`；
保存文本省略了 Secret key 行，没有复制正文。该行的完整权限和到期日已核实，
但历史脱敏事件没有 Tracking ID 或可靠指纹，本地文件和现有健康证据也未提供可核对的 key ID。
因此不能仅凭名称、时间接近、列表只有一行或认证成功，断言它就是已保存或曾暴露的 key。

用户已明确要求浏览器自动获取、创建；已完成可审阅的创建草稿：
名称 `OpenDesk Browser Tunnel Runtime 1026 rotation`，同组织、同项目、User 主体，Restricted，
仅 Tunnels Read + Use，其他权限均 None，自定义 29 天。
`rotation-draft.ax.txt` 与 `rotation-draft.png` 显示表单有效、Create secret key 按钮可用；
**尚未点击提交，尚无新 key 或轮换成功证据。**期限按实际提交时间计算，提交时仍须不晚于上述旧期限，
不能把“2026-11-25”理解为当天结束。
CUA 的 Computer/Browser Use Confirmation Policy → **Hand-Off Required** 要求用户完成
认证凭证最终输入、确认和提交；本次已就该具体草稿发出接管提示，不绕过此边界。

保存 key 的本地元数据复核为当前用户、普通文件、0600、父目录 0700、路径无 symlink，未读取正文。
已知共享客户端 PID 31947（启动于 2026-10-26 02:36:18、PPID/PGID 31945）在复核时仍运行，
仅为一个已知消费者，不能据此宣称消费者清单完整。没有改写共享文件、发信号或撤销旧 key。
后续须取得非秘密新 key ID 和安全保存位置，核对消费者并协调切换，验证新认证后再处置实际暴露 key；
创建新 key 本身不构成历史暴露恢复。

### 复用开发侧栏的本地项目入口

通过本任务「🔌 Tunnel 收尾」的真实测试网页，观察既有 **开发 → 本地项目**，
无需手工打开 `native-agent/workspace.html`，没有新建工作台或改动 Browser 源码。
`local-project-entry.ax.txt` 与 `local-project-entry.png` 为对应实窗证据：

- Native 已连接；所选 `chatgpt-send-queue` 显示离线（待连接核验），源码 Provider 未就绪，诊断为 `E_DEV_PROVIDER_UNAVAILABLE`。
- 已授权目录选择、已安装工具关联、连接方法、运行结果入口均可见；保存源码关联、实时开发预览和运行按钮禁用。
- 原关联目录未连接的提示明确要求重新连接同一目录。没有更改关联、启动其他任务的 Provider 或执行业务。

本次确认的是入口与现场连接状态；预览、执行及新结果的正确性为 NOT_RUN，不能由历史“已完成”文字推断。
该状态尚不能证明平台实现缺口，不据此扩大开发范围。
源码对照限于 Browser 的 `develop-local.tsx`、`develop-execution.tsx` 与
`docs/api/sidebar-local-projects.zh-CN.md`；没有证明现场扩展对应当前 HEAD，不声称已构建或加载最新源码。
`unexpected-foreground-newtab.png` 是前台切换时的空白新标签截图，明确排除在产品证据之外。

本次只更新两份 OpenDesk 文档、非秘密复用索引及本地证据；只做 diff、JSON、元数据和哈希核对，
没有全量测试、构建、提交或推送。核心 PASS 保留，安全恢复及本地项目端到端验收仍未完成。

## 第三轮：当前正式工具版本 A–G

运行目录：`.runtime/tests/mcp-chatgpt-web/20261025T185643Z-aosnhouo/`（目录为 UTC 时间戳，
实际在线验收为 2026-10-26 02:56–03:00 Asia/Shanghai）。
恢复索引：同域 `continuation-20261026-current-version/current-state.json`。
除下表标明的续接文件，其余证据名均相对本轮运行目录。

| 条件 | 结果与证据 |
|---|---|
| A 版本、来源及调用前状态 | PASS；`online-artifacts.json`、`online-pre-web.json`、`accepted-run-*` 固定正式源码、官方客户端、受限二进制和 profile 哈希；全新 fixture 无 symlink、proof 不存在。保留 dirty 构建 provenance，未冒称当前 HEAD 重建 |
| B 真实控制面与网页边界 | PASS；`online-pre-send-health.json`、`final-health.json` 记录 ready 200、活动轮询成功时间推进、连续失败为零；`web-tools.png` 显示仅 Write 1 / Read 2 的三工具。本轮没有 `tools/list` RPC，网页工具表为已保存 schema，不能称为本轮实时重新发现 |
| C 一条网页请求与三对成功返回 | PASS；`web-request.json`、`web-response.txt`、`web-result.png` 及 `rpc-tool-transcript.json`。顺序 status → write → read，各一次；status 为 `ok=true, mode=web-file-test, created=false`，写入和读取都成功 |
| D 独立磁盘与同实例 | PASS；`disk-proof.json`：nonce 加一个换行、33 字节、0600、普通文件、无 symlink、FD 身份稳定；SHA 与网页及 RPC 一致；调用前后 child generation 相同 |
| E 所属清理与诚实审计 | PASS；`owned-processes-before-stop.json`、`stop-request.json`、`shutdown-proof.json`。只向新鲜核对的 launcher 发 SIGTERM，六个 PID 消失，所属 group 无残留，端口关闭，PID/health 文件和临时 profile 删除；三对业务 RPC 完整。主动取消的 `audit_end` 为 exit 130 / `auditComplete=false`，没有改写为完整 |
| F 历史保全与证据分项 | PASS；续接 `preflight.json` 与 `shutdown-proof.json` 对照两份旧 proof、历史快照及并行修改共 12 文件哈希未变；平台 `_meta` 写盘前省略。网页、磁盘及停止证据分别保存，未输出 key 正文 |
| G 未知状态停止，不自动重放 | PASS；单次网页发送、单次写请求；无重试、backend 切换或历史 proof 覆盖。本轮已使用目录保持一次性标记，不再在线复用 |

新 nonce：`65c57b653deb53a6a134c6dbbbad17d8`；SHA-256：
`a88421c20ef5bb3819a8725cbbcf8f7ef01bcbccfa95ae818aeb591cedf35210`。
MCP child generation：`1342684d093b031acdbbc2c460343e14`。
实际三对工具请求/响应位于原始审计第 6/7、13/14、20/21 行；每次 initialize 后 RPC ID 都复用 1，
逐次按初始化段及时间关联，不能用全局 ID map 覆盖旧结果。
三次可选 `server/discover` 探测返回 -32601 后正常回退 initialize；保留这些错误，不宣称协议零错误。
`final-metrics.prom` 的 enqueue_to_response 维度为三次 tools/call HTTP 200；另一延迟维度不重复计数。

launcher `41018`、官方 client `41021`、所属子孙 `41022`–`41025` 已全部停止，健康端口 `62689` 关闭，
会话退出 130。launcher 的 client 原始退出为 0、cancelled=true，relay 的取消退出为 130；两种记录均保留。
共享的另一任务 client `31947` 在清理后仍运行，没有被发信号；这些 PID 仅作历史证据，不能用于未来直接清理。

官方客户端仍为 `0.0.18+274a5588414819f063d27100a4fb1096aae3830f`，SHA-256：
`5a55fd3dde505b2ee27f970dad18e6c08e04ffb9d7bc4256c507b8f312c1d6e8`。
受限二进制 SHA-256 为 `559212428739e23c12fd41404e48842b18541393d8a0f489f0c2b73159d4f61f`，
沿用 Go 1.25.13、base HEAD `587aa5070b3ce6a982002a84622e91c354347b80` 的 dirty 构建；
manifest 登记的四个 adapter 源文件仍匹配原记录。本轮验收正式 Python 工具版本，没有重建或替换 dist。
`online-artifacts.json` 是启动前准备事实，其 `NOT_TESTED/onlineStarted=false` 原样保留；
在线结论另记在续接 `core-acceptance.json`，未回写 accepted 快照。

本次仅更新文档、非秘密索引与运行证据；没有业务源码修复、全量测试或构建。
先前正式工具的定向回归仍适用；本次新增加的验证是上述真实网页 A–G。
从仓库根目录实际执行的在线一行命令为：

```sh
HTTPS_PROXY=http://127.0.0.1:7897 HTTP_PROXY=http://127.0.0.1:7897 NO_PROXY=127.0.0.1,localhost python3 tests/mcp/tools/secure-tunnel/prepare-run.py --online
```

代理只作用于该命令环境，未修改全局配置。普通复用命令与本地诊断见下文“key 保存与复用”。

独立 verifier Ampere 只读重算本轮固定哈希、三对 RPC 和磁盘 SHA，核对网页三工具截图及 12 个受保护文件，
结论为核心 PASS；同时明确缓存 schema、取消审计和旧 dirty 二进制的证据边界。
原始意见在续接 `independent-review.json`，没有新增评分、测试或构建。

| 验收项 | 结果与边界 |
|---|---|
| 专用 Tunnel、组织和 ChatGPT 工作区 | PASS；IDs 与原先 Platform 行及本轮认证元数据一致 |
| 官方认证和活动轮询 | PASS；控制面成功时间持续更新，失败计数为零 |
| key 仅含 Tunnels Read + Use、到期日 | 最新续接已核实官方候选 key 详情；与保存文件的对应关系仍 NOT_VERIFIED，见上节 |
| ChatGPT 插件创建、安装、三工具发现 | PASS；网页显示 Write 1 / Read 2，名称准确 |
| 受限 MCP 注册、写注解和子命令隔离 | PASS；三个工具，写工具 readOnly=false；MCP 命令为 env -i |
| 所有历史观察均不含凭证 | FAIL；上述已确认的历史观察事件，恢复状态未验证 |
| 网页触发真实写入及同实例读取 | PASS；两轮各一条请求，未重放原目录，网页与独立磁盘一致 |
| 逐次工具 RPC 输入输出、精确写入次数 | PASS（第二轮）；三工具各一次，结果逐次关联成功；平台身份/session _meta 已省略 |
| 调用前无 proof，调用后独立磁盘验真 | PASS；nonce+换行、33 字节、0600、SHA-256 均一致 |
| 不覆盖、不重放未知动作；既有边界回归 | PASS；原 proof 保留，相关 Go 源码未改；既有回归证据仍适用 |
| 所属客户端、子进程和端口清理 | PASS；首轮四个、第二轮六个记录 PID 均消失，健康端口关闭，PID 文件移除；续接未向这些旧 PID 发信号 |
| 后续 relay 输入线程收尾竞态 | PASS（合成回归）；正式源码在最终状态前停止并 join 输入线程，没有重跑网页写入 |
| 所有正式完成门槛 | 尚未满足；实际暴露 key 身份、保存文件对应关系及安全恢复仍未验证 |

## 第二轮原始调用审计

新运行目录：`.runtime/tests/mcp-chatgpt-web/20261026-web-file-audit/`；
新 proof 目录：同域 `20261026-web-file-audit-fixture/`。没有删除或覆盖首轮 proof。
本地 stdio relay 在受限 MCP 前后记录 RPC，不增加远端工具，不接触 runtime key。

`rpc-tool-transcript.json` 逐次关联到三个实际请求和响应：

1. `tm_status {}` → `created=false, mode=web-file-test, ok=true`。
2. `tm_test_write_nonce {"nonce":"b8bb454384c52a0ad447a9503e8d9173"}` → 成功，33 字节。
3. `tm_test_read_nonce {}` → 成功，读回同一 nonce，SHA 与写入一致。

写入请求在 MCP 侧准确观察到 **1 次**，三个结果均无 RPC error / tool isError。
宿主独立读盘确认 `nonce+\n`、33 字节、`0600`、普通文件、无 symlink、FD 身份稳定；
SHA-256 为 `1342a7b73147dfcf725795c9af9c9070e8745455fee63f30a84c8348612017fc`。
新 child generation `a78d1ef7b79b50aa88ce05d7e73f77e7` 在调用前后相同。
客户端 `tools/call` 指标仅三次 HTTP 200，没有 409。

新运行 launcher `98479`、client `98482`、所属子孙 `98483`、`98484`、`98485`、`98486`
全部经归属核对后停止，六个 PID 消失，健康端口关闭，PID 文件移除，会话退出 130。
详见该目录的 `disk-proof.json`、`rpc-tool-transcript.json`、`final-health-mcp.json`、
`final-metrics.prom`、`shutdown-proof.json` 和 `web-result.png`。

`rpc-audit.jsonl` 保留 21 条 RPC 记录；六处 `_meta` 平台身份/session 元数据已省略，
工具名、参数、结果、RPC ID、顺序和时间未改。省略范围及处理前后哈希记录于
`audit-metadata-minimization.json`，不声称保存了这些身份元数据。
审计是本机 stdio 收发观察；收到请求不等于执行成功，以上成功结论均另关联了对应服务返回。

实际运行版本以 `accepted-run-*` 快照及哈希留存。之后修复 relay 的异常传播：
输入审计或转发失败必须非零退出并标记审计不完整；后续记录在写入前省略身份元数据。
独立合成 fixture 验证正常 initialize/status 转发，以及坏 JSON 输入非零退出、不完整标记；
不使用 key、不创建 proof、不重放网页写入。结果为 `relay-regression.json`。

## 首轮资源与实际结果

- Tunnel：`tunnel_6ade2151f41c8191bd0aa7c3bb6f2904`，名称 OpenDesk Web File Test 1025。
- 组织：`org-JY0asITTziD2Z6qyfmq3Eveq`。
- ChatGPT 工作区：`c484142b-2d33-4ad4-a6eb-56a7649f0c31`。
- 官方客户端：`0.0.18+274a5588414819f063d27100a4fb1096aae3830f`。
- 成功运行实例：`a4a0c3cc3ad628e9018c9e081fb15d2b`。
- 网页发现到读写后的 child generation：`694341bf71a4e6606b9ddc724dc10508`，未变化。

仅暴露 `tm_status`、`tm_test_write_nonce`、`tm_test_read_nonce`。
网页请求先检查 `mode=web-file-test, created=false`，再要求仅写一次并读取；
任何失败或不确定状态即停止。操作员没有调用本地写工具、没有创建替代 proof、没有重新发送请求。

网页展示的状态为：

```json
{"created":false,"mode":"web-file-test","ok":true}
```

网页展示的写入结果为：

```json
{"bytes":33,"filename":"web-proof.txt","ok":true,"sha256":"47c6d81c35bc11cacc52d50e50c0a767e9be8d9a6f6ae09a590043b2c365456d"}
```

网页展示的读取结果为：

```json
{"bytes":33,"filename":"web-proof.txt","nonce":"0dcec69b7131d6a2e314ced84a2d609a","ok":true,"sha256":"47c6d81c35bc11cacc52d50e50c0a767e9be8d9a6f6ae09a590043b2c365456d"}
```

宿主随后以只读方式打开固定 proof 文件，独立确认：普通文件、非符号链接、打开前后 inode 一致，
内容准确等于上述 nonce 加一个换行，33 字节，权限 `0600`，SHA-256 与网页一致。
工具实现以独占创建拒绝覆盖，读取仅对本实例已成功创建并验证的文件开放；
同一 child generation 为同实例结论提供额外证据。

官方客户端指标在 `enqueue_to_response` 维度记录 `tools/call` HTTP 200 共 3 次、HTTP 409 共 1 次。
`poll_to_response` 维度是同一组调用的另一种延迟统计，不能相加成 8 次。
409 不等于已证明发生第二次写入，也不能无证据忽略为正常；现有记录不足以确定其原因或工具名。
最终 `/health/mcp` 的 tools_list 因后续 initialize 重置而没有保留工具列表，
不作为工具调用失败证据；先前实际三工具发现与网页列表已保存。

## key 保存与复用

本轮没有创建新 key，复用现有授权保存的：
`/Users/shopme/.opendesk-browser/secrets/chatgpt-tunnel-runtime.key`。
实际检查为普通文件、当前用户所有、`0600`，所属 secrets 目录 `0700`，没有路径符号链接。
没有复制 key 正文，没有把正文写入命令参数、证据或仓库。

持久化的非秘密复用索引：
`/Users/shopme/.opendesk/tunnels/opendesk-web-file.json`（`0600`，父目录 `0700`）。
它只记录 key 路径、资源 ID、插件链接和使用限制，不含 key 正文。
第三轮当时未重新核验账户设置；最新续接已核实官方候选 key 仅有 Tunnels Read + Use，
到期时间为北京时间 `2026-11-25 00:21:45`，但尚未证明该候选与保存文件相同。
该 key 也被另一项授权任务使用，不应无确认地撤销而影响其运行。
历史暴露事件不能由“已保存”或本次认证成功抵销。

启动器支持 `--key-file`，官方客户端使用 `file:` 引用；
MCP 通过 `/usr/bin/env -i` 启动，不继承 runtime key。
启动器验证文件与打开描述符的身份、所有者、权限以及目录限制；官方客户端随后按路径再次打开，
仍存在同用户替换路径的剩余竞态，未声称消除此风险。
隐藏输入模式仍保留，禁止 getpass 回显降级。
每次运行生成仅含 file:/env: 引用的临时 profile，退出后删除，避免两种输入方式互相覆盖。

从仓库根目录可执行只做本地配置诊断的命令：

```sh
python3 tests/mcp/tools/secure-tunnel/prepare-run.py --doctor-only
```

该正式入口已在仓库根目录原样执行，退出 0；准备、临时 profile 清理及 doctor 临时健康端口关闭均已核对。
运行目录为 `20261025T183255Z-4cai_jyv`（UTC 时间戳），详见下文 `canonical-doctor.json`。
新入口去掉 `--doctor-only` 只准备；显式 `--online` 才启动最长 30 分钟的官方轮询。
需要本机 key 有效、产物哈希匹配；stdio 可达性及 OAuth 等明确 SKIP 的项目不计为在线通过。
现有 proof 必须保留，不能为了再次验收而删除、覆盖或重放写入。
新一轮文件证明应准备独立 run/fixture 并重新固定其产物，不能直接沿用这次已写入的目录。
`.runtime/` 可被清理，持久化索引不保证其中程序永久存在。

首次直连 API 超时，已停止该失败实例；本轮成功运行仅在该命令环境使用现有
`127.0.0.1:7897` 代理，没有修改全局代理或其他服务。
LAN 代理 `192.168.30.9:7897` 检查超时；没有把该代理当作已可用。

## 首轮生命周期与证据

证据根目录：`.runtime/tests/mcp-chatgpt-web/20261025-web-file/`，
本轮增量在 `continuation-20261026/`。原 proof 位于同域独立的
`20261025-web-file-fixture/web-proof.txt`，未移动或修改。

关键文件：

- `online-pre-web.json`：调用前 proof 不存在、认证轮询成功、三工具发现和 child 身份。
- `web-tools.txt` / `web-tools.png`：真实插件三工具及读写类别。
- `web-request.json`：新 nonce、最终请求、发送前不存在检查与单次发送标记。
- `web-response.txt`、`web-result.png`、`web-write-read-result.png`：官方网页可见返回值；不是原始 RPC trace。
- `disk-proof.json`：独立磁盘校验，含 nonce、字节数、模式、SHA、文件身份与同 child 快照。
- `final-metrics.prom`、`final-health-control-plane.json`、`final-health-mcp.json`：停止前实际客户端观测。
- `owned-processes-before-stop.txt`、`stop-request.json`、`shutdown-proof.json`：进程归属、信号与清理验证。
- `accepted-run-start-online.py`、`accepted-run-opendesk-web-file.yaml`、`accepted-run-online-artifacts.json`：真实网页运行时产物快照。
- `launcher-doctor-after-fix.redacted.log`：停止后修复版启动器的官方本地诊断，不能替代先前在线证据。
- `capture-incident-redacted.json`：历史观察事件，无 key 正文。

运行 launcher `93963`、官方 client `93965`，子进程 `93966`（受限 MCP）与 `93967`
（官方 client 启动的 Codex app-server）经父子关系和命令核对后，仅向本任务 launcher 发送 SIGTERM。
启动器回收所属 group，进程会话退出 130；四个 PID 均消失，`127.0.0.1:57050` 关闭，PID 文件移除。
没有停止其他任务的客户端。关闭时 MCP 的 EOF/SIGINT 警告与主动停止相符，不混作调用失败。

## 第二轮之前的源码、检查与交付状态

受限模式原有实现位于 `cmd/opendesk-mcp/main.go`、`pkg/mcpserver/server.go`、
`pkg/mcpserver/web_file.go`，测试位于 `pkg/mcpserver/web_file_test.go`。
不注册 desktop、Browser、Recorder 或通用文件/执行工具；普通模式没有增加文件写权限。
目录身份、独占创建、FD 内容验证、重复字段、替换和并发拒绝等既有边界保持不变。

先前完成的 Go test/vet/race、实际编译发现与互斥参数检查仍是原实现证据，本轮源码未改，未重复全量运行。
原正式测试与运行记录保留于同域 `adapter-development/`；架构审计仍有既有 62 项台账错误，未扩大修复。

本轮仅在运行目录修复启动器：独立于 stdout 的有界取消升级，leader 退出后仍清理所属 group，
按输入模式生成 profile，检查已打开 key FD 的权限；Popen 后所有设置均纳入清理保护，
队列最多 128 条、每行最多 16,384 字符，超长行在写日志前拒绝。
`check-launcher.py` 已执行：隐藏输入失败、三个取消窗口、七类 key 文件拒绝、file/env profile、脱敏，
以及真实合成进程的静默忽略 SIGINT、无换行输出、leader 退出后存活子进程均通过，且测试 group 全部消失。
另验证 running 状态写入失败、reader 启动失败仍清理子进程；超长输出不入日志，慢消费者下队列达到 128 后仍可取消并清理。
测试只使用合成 key 和 Python stub，不接触真实凭证或重放网页写入。
新的启动器本地 doctor 退出 0；其哈希与真实网页运行时快照分别保存，未把修复后的版本冒称为当时运行版本。

HEAD 保持 `e7e6dd5c1de9a3cb022958d3a360ef9f2b56dfac`；本轮未创建分支、未提交、未推送、未重新核验远端。
截至第二轮在线验收时仅修改这份维护文档及被忽略的运行证据；续接新增的正式工具见下文。
其他 Browser 并行源码与测试修改保留，不纳入本次交付。
R1 的 `dist/opendesk-mcp` 和官方客户端均未覆盖。

## 官方身份验证说明

“无需身份验证”用于 ChatGPT → stdio MCP 服务，不取消本机官方 tunnel-client → OpenAI 控制面的 runtime key 认证。
本轮没有配置 AWS workload identity，也没有购买额度、切换账户或扩大远程权限。

- [Secure MCP Tunnels](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [Custom MCP server](https://developers.openai.com/api/docs/guides/custom-mcp-server)
- [官方客户端 onboarding](https://github.com/openai/tunnel-client/blob/master/docs/onboarding.md)

## 第二轮独立复核（历史）

由与实现者分离的 verifier 复核源码与证据；本轮指出的取消挂起、leader 退出后 group 清理、
输入模式 profile 冲突和打开 FD 检查已定向处理。最终意见与评分保留在本轮证据中。
第二轮工具调用审计已完成；安全事件恢复、key 权限/到期日复核和首轮 409 原因仍未验证，不能引用旧 R1 评分替代。

当时独立评分：安全 78、正确性 97、协议 95、测试充分性 94，平均 **91/100**。
这是工程审查判断，不是认证；安全因历史 key 暴露恢复未核实而未达标。
实际审计版三对完整 RPC 与两轮停止结论通过；当时后续 relay 版本存在 incoming daemon
未同步到最终错误检查的竞态。续接已在正式维护路径修复并做合成验证，未把新版本冒称为当时运行版本。
详见 `20261026-web-file-audit/independent-review.json`。

第二轮后，原对话按用户要求移交新 Codex 对话继续完善；本续接已接手业务和本地运行材料。
原 native goal 在交接前上次观察为 paused，本对话未独立重查；创建新对话不等于迁移或完成原 goal。

## 2026-10-26 较早续接：正式工具与定向修复

本节记录第三轮之前的整理阶段：当时只修复、整理和做最小本地检查，没有第三轮网页写入、全量构建、提交或推送。
原对话 Goal 的 paused 是当时上次观察；没有迁移或完成它。本报告顶部的第三轮由当前新对话接手，按用户要求创建自身 Goal；安全未闭环时不标完成，最新状态见当前恢复索引。

正式维护目录 `tests/mcp/tools/secure-tunnel/`：

- `stdio-audit.py`：输入读写可停止，非 daemon reader 在 `audit_end` 前 join，再检查最终错误并关闭日志。
  同时处理子进程先退出、输入/输出背压及取消；审计失败或取消非零退出并标记不完整，写前省略 `_meta`。
- `start-online.py`：保留已有 key 文件、脱敏及所属进程组回收逻辑；新增显式 run、产物预检、排他锁和一次性在线标记。
  产物验证先于 key 读取；已有 proof/trace、在线残留及未知状态拒绝再用。
  定向补齐 stdout 饱和下的取消、key 原始长度/EOF 检查、在线日志独占创建及信号权限拒绝后的 `cleanup_failed` 状态。
- `prepare-run.py`：使用已有非秘密索引和构建来源，新建 run/fixture，固定客户端、二进制、profile 及工具源码哈希。
  每次生成 credential-free MCP command；不创建 key/Tunnel，不自动下载、构建或设置登录自启。
  发布 manifest 前重新对照原客户端和 provenance 哈希，拒绝准备期间变化。
- `check-relay.py`、`check-launcher.py`、`check-prepare.py`：独立合成回归，输出均归 `.runtime/`。
  启动器测试保留原 AST 提取方式以控制迁移范围，未宣称完成通用库重构。

运行目录旧工具仅保留为历史材料；唯一维护实现和复用入口改为上述正式源码。
`accepted-run-*`、已接受的三对 RPC 和两个现有 proof 没有被替换。
持久索引 `~/.opendesk/tunnels/opendesk-web-file.json` 已指向正式入口，不包含 key 正文。
客户端和已验收二进制仍是 `.runtime/` 中可清理的本地产物，缺失时准备入口拒绝启动；源码入口不依赖保留临时工具脚本。
二进制沿用先前 dirty 构建及其 provenance；准备 HEAD 与原构建 HEAD 分开记录，未声称当前 HEAD 重新构建。

本次证据索引：`.runtime/tests/mcp-chatgpt-web/continuation-20261026-tools/`。
`repair-plan.md` 记录修复前计划；`credential-status.json` 只含文件权限检查和未验证事项；
`preservation-check.json` 再次只读核对两份 proof 的已接受 SHA-256、33 字节、0600 和稳定 FD 身份。

| 本次检查 | 结果 |
|---|---|
| 旧 relay 的迟发输入错误复现 | 已复现：child 先退出，旧版错误地返回 0 / auditComplete=true |
| 新 relay 合成检查 | PASS；10 场景，包括迟发输入错误、EOF、child 先退出、坏 JSON、元数据省略、取消、双向背压及未完整输入 |
| 启动器合成检查（本机 Python 3.14） | PASS；三个取消窗口、12 类 key 拒绝、两种 profile、27 项预检拒绝、锁/一次性标记、设置失败、遗留子进程、脱敏、外部 stdout 饱和、日志创建竞态、信号权限拒绝有限退出及队列上限 128 |
| 准备入口合成检查 | PASS；11 项检查，新目录、固定哈希、无凭证 profile、缺省不执行客户端、篡改/符号链接/非法资源 ID/准备期间变化拒绝；实际合成 child 未继承凭证和额外环境变量 |
| 正式一行 doctor-only 命令 | PASS；退出 0，未生成 RPC/proof/在线标记；stdio/OAuth/Codex 插件检查 SKIP，不计在线通过 |
| Python 源码语法 | PASS；六个文件 compile，无全量构建 |
| 测试架构审计 | FAIL；仍为既有 62 项台账错误，未出现 secure-tunnel 新错误，未扩大修复 |
| key 文件与 secrets 目录 | PASS；当前用户、普通文件、0600 / 0700、路径无 symlink；该检查未读取 key 正文 |
| 官方 key 身份、排他权限、到期日及暴露恢复 | NOT_TESTED / NOT_VERIFIED；不能从本地权限或 doctor 推断 |
| 新正式工具的在线网页闭环（当时） | NOT_TESTED；随后第三轮已补齐，见本文顶部 A–G |

合成结果分别为 `relay-regression/run-7ikt0yf1/result.json`、
`launcher-regression/run-d5vi2cb9/launcher-input-regression.json`、
`prepare-regression/run-h0zblhcw/result.json`（均相对 `.runtime/tests/mcp-chatgpt-web/`）。
正式命令、源码哈希、停止状态和临时产物清理见续接目录的 `canonical-doctor.json`。
迁移过程中的 `/usr/bin/python3` 运行曾出现间歇 `killpg PermissionError`；
本次完整 PASS 使用当前 `python3`（3.14），不把该结果扩展为所有系统 Python 环境均已通过。
权限拒绝路径现已用合成注入验证有限退出并明确 `cleanup_failed`；无法取得真实信号权限时不会谎报进程已停止。

独立 verifier Bernoulli 首轮定向审查发现 stdout 饱和、准备期间客户端变化、key EOF、在线日志独占及权限拒绝收尾问题，
已分别修复并补回归；第二次只读复核给出 **PASS targeted fixes**，未发现这些补丁中的新增实质缺陷。
这不是新网页验收或新的质量评分；原系统 Python 权限拒绝原因仍未知。
原始意见和复核分别保存在续接目录 `independent-code-review.json`、`independent-code-review-followup.json`。
小型恢复入口为 `current-state.json`，持久复用索引及旧 `goal-contract.json` 均指向它；历史 Goal 状态只标为原对话上次观察。

### 凭证恢复的具体边界

已脱敏事件记录没有 key ID 或可靠指纹，无法仅凭现存材料确认暴露的是哪枚 key。
官方 key 页的既有 tab 定位和新 tab 两次控制均超时，没有获取全页 AX 或截图来冒险扩大暴露；
权限 Read + Use 和 `2026-11-25` 仍只是旧记录。
共享 key 未被撤销，另一任务客户端未被停止；没有创建重复 key。

恢复顺序：先在受控官方页面确定暴露 key 的身份及撤销状态，再核对共享消费者和可切换窗口。
如确需等价轮换，应保持同一组织、Tunnels Read + Use 和不扩大的到期范围，切换所有消费者后才撤销旧 key。
先前暴露与本地保存 key 若不是同一枚，也必须对实际暴露 key 单独取得恢复证据，不能只改本地文件。
CUA 的 **Hand-Off Required** 明确规定，改变认证凭证须由用户完成新凭证的输入、确认和提交。
因此最终凭证变更不能由本 Agent 代办，也不会用其他工具绕过；普通本地保存校验、索引和工具工作已继续完成。
没有用户接管的真实恢复证据前，安全收口继续 NOT_VERIFIED，整体 PARTIAL；本次未重新评分。

第三轮已把当前恢复计划记录到 `continuation-20261026-current-version/credential-status.json`：
重新检查 key 文件元数据而不读正文，并确认另一任务 browser-controlled client（当时 PID 31947）仍使用同一 file: 路径。
本次文件证明 client 已停止；未来正式入口仍使用该保存路径。这是已知消费者清单，不保证没有其他消费者。
先取得实际暴露 key 的非秘密身份和官方撤销/轮换证据，再独立核对保存 key 的组织、排他权限及到期日；
本轮没有盲目采集 key 页全量 AX 或截图。需要等价轮换时，权限限于同组织 Tunnels Read + Use，
期限不得晚于 2026-11-25 或已独立核实的旧期限，以较早者为准；由用户完成凭证输入、确认和提交。
协调所有消费者切换并验证认证成功后才处置实际暴露的旧 key，不能直接撤销共享 key 或中断其他任务。
用户无需将 key 正文发到聊天；本地保存、元数据核对和非秘密恢复证据应分开处理。
