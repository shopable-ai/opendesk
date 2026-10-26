# OpenDesk 与官方 Secure MCP Tunnel

核对日期：2026-10-26（Asia/Shanghai）。本文说明官方 Tunnel 的接入边界、本地兼容检查和可维护的受限运行入口。

## 当前结论

**当前正式维护工具版本核心验收 PASS；完整安全交付未完成。**
专用三工具模式已有两轮历史闭环；第三轮使用本指南正式入口完成真实官方 ChatGPT 网页写入、
同实例读取、独立磁盘核对及所属进程停止，三对实际 RPC 完整、写入准确一次。
网页显示仅 Write 1 / Read 2；本轮未收到 `tools/list`，不将缓存 schema 显示称为实时重新发现。
完整 A–G 及取消审计边界见[验收报告](../../quality/mcp/2026-10-25-chatgpt-web-file-proof.md#第三轮当前正式工具版本-ag)。
最新续接已核实官方候选 key 的完整权限和精确到期时间；与保存 key 的对应关系及历史暴露恢复仍为 NOT_VERIFIED。
前续接 Goal 最后记录为 blocked，本次续接没有活跃 Goal；完整安全交付仍未完成。
下文无密钥 `--read-only` probe 是较早的独立兼容证据，不能替代上述网页验收，也不扩大当前三工具范围。

官方 `tunnel-client` 支持启动 stdio MCP 子进程，因此可以直接组合
`dist/opendesk-mcp --read-only`。无需为 OpenDesk 增加 HTTP 服务或第二个 Host。

本轮已经使用官方客户端的 `dev proxy` 实际经过 stdio adapter，完成
`initialize`、`notifications/initialized`、`tools/list` 和一次 `tm_status` 调用。
最终重建二进制已在全新 `official-client-local-probe-final/` 目录复验；旧成功证据保留为历史记录。
该命令使用客户端内建的本地控制面与内存队列；其临时 loopback HTTP 入口属于客户端调试设施，
不是 OpenDesk 产品服务，也不是 OpenAI 官方云端。没有执行云端认证、隧道创建、云端轮询或 ChatGPT 插件调用。

## 官方文档与权限

- [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)：
  支持 stdio 与 HTTP 本地目标；正式运行需要服务端分配的 `tunnel_id` 与 runtime API key，
  由客户端主动向 OpenAI 建立出站 HTTPS 连接。
- [Add custom MCP server](https://developers.openai.com/api/docs/guides/custom-mcp-server)：
  ChatGPT 支持自定义 MCP 的读和写工具，不强制要求 `search` / `fetch` 工具；
  使用 `readOnlyHint` 判断只读，缺少该标注时视为写操作，写操作默认需要确认。
  当前入口是 ChatGPT 网页的 Plugins → Add custom MCP server → Connection: Tunnel。

| 权限层 | 官方要求 |
| --- | --- |
| 创建或编辑 Tunnel | Platform 组织级 Tunnels **Read + Manage** |
| 运行 tunnel-client / 创建插件时选择 Tunnel | Tunnels **Read + Use** |
| ChatGPT 添加和使用自定义 MCP | 仍受目标工作区权限、安全限制及 Lockdown 约束 |
| 目标范围 | Tunnel 必须关联正确的 Platform 组织与 ChatGPT 工作区 |

**Pro 套餐说明：**本次 fetch 的两篇当前官方页面没有给出 Pro 专属的读写权限矩阵，
也没有证实“Pro 固定只读”的限制。不能据此宣称 Pro 一定支持或禁止某个工具、账户一定有 Tunnel 权限，
或把 OpenDesk 的 `--read-only` 归因于 Pro 套餐。通用工具读写规则、套餐可用性、
Platform Tunnel RBAC 与 OpenDesk 自身能力限制是不同层面；专用 Tunnel 已实际认证成功，
认证成功本身不能证明 key 没有其他权限或到期日。
最新官方详情另行核实 `OpenDesk Browser Tunnel Runtime 1025`（Tracking ID `key_AL7gua4bfxBSdHtv`）
为 Active，Key-level permissions 完整列表仅含 Tunnels Read + Use，精确到期为北京时间
`2026-11-25 00:21:45`；尚未证明它与本地保存文件或历史暴露 key 相同。
只读元数据见[较早续接证据](../../quality/mcp/2026-10-25-chatgpt-web-file-proof.md#2026-10-26-较早续接官方-key-元数据与本地项目入口)。
用户最新要求将轮换草稿改为 **30 天**，仅 Tunnels Read + Use；最终创建、实际到期时间、安全保存与消费者切换仍待核实。
用户已确认完成创建；隐藏保存及创建后的官方元数据仍待核验，安全恢复尚未闭环。
当前证据和接管边界见[当前续接](../../quality/mcp/2026-10-25-chatgpt-web-file-proof.md#2026-10-26-当前续接30-天草稿与本地项目结果核验)。

官方 Tunnel 面向私有连接；公共插件提交仍要求符合其公开 HTTPS 端点要求，不能将本地测试当作发布资格。

## 客户端版本与下载校验

官方仓库：[openai/tunnel-client](https://github.com/openai/tunnel-client)。
日常升级从 [latest release](https://github.com/openai/tunnel-client/releases/latest) 重新核对，
下面的固定版本仅记录本轮证据：

| 项目 | 本轮值 |
| --- | --- |
| Release | [v0.0.18](https://github.com/openai/tunnel-client/releases/tag/v0.0.18)，2026-10-23 20:25:58 UTC 发布 |
| Release / 二进制报告的 Git SHA | `274a5588414819f063d27100a4fb1096aae3830f` |
| 主机与包 | macOS arm64；`tunnel-client-v0.0.18-darwin-arm64.zip` |
| 压缩包字节数 | `28313024` |
| 压缩包 SHA-256 | `ba7a0994f7dd15bc8708aa1602ecf54371a492319a641ab9c33dc00f1fd56bfe` |
| 解包后二进制 SHA-256 | `5a55fd3dde505b2ee27f970dad18e6c08e04ffb9d7bc4256c507b8f312c1d6e8` |
| 本地安装位置 | `.runtime/tests/mcp-tunnel/install/tunnel-client` |

成功下载源是 release 自带
[`PUBLIC_URLS.txt`](https://github.com/openai/tunnel-client/releases/download/v0.0.18/PUBLIC_URLS.txt)
列出的 [OpenAI CDN 包](https://persistent.oaistatic.com/tunnel-client/v0.0.18/tunnel-client-v0.0.18-darwin-arm64.zip)。
实际包同时匹配 GitHub release asset digest 和
[`SHA256SUMS.txt`](https://github.com/openai/tunnel-client/releases/download/v0.0.18/SHA256SUMS.txt)；
这两个 sidecar 本身也匹配 release asset digest。未执行 Sigstore provenance 签名验证，校验和不能替代签名验证。

官方 [README 的 macOS 安装说明](https://github.com/openai/tunnel-client/blob/274a5588414819f063d27100a4fb1096aae3830f/README.md#install-with-homebrew)
推荐 `brew install openai/tools/tunnel-client`，并提示直接 release ZIP 未 notarize，可能被 Gatekeeper 阻止。
本轮只在 `.runtime/` 解包运行，未安装 Homebrew formula、未修改全局 PATH，也未绕过 Gatekeeper。
如目标机器阻止 ZIP，应采用官方 tap 安装路径，不删除 quarantine 或关闭系统校验。

## 本地无密钥命令

以下命令均从仓库根目录执行。下载与解包完成后，先准备独立目录：

```sh
TUNNEL_ROOT="$PWD/.runtime/tests/mcp-tunnel"
mkdir -p "$TUNNEL_ROOT/isolated-config" "$TUNNEL_ROOT/tmp" "$TUNNEL_ROOT/profiles"
```

检查使用清空后的环境，只显式传入系统 PATH、独立 XDG 配置目录及临时目录，
不继承现有 API key、代理或 Tunnel 配置。每条后续客户端命令均使用这个环境前缀。

```sh
env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin XDG_CONFIG_HOME="$TUNNEL_ROOT/isolated-config" TMPDIR="$TUNNEL_ROOT/tmp" "$TUNNEL_ROOT/install/tunnel-client" --version
env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin XDG_CONFIG_HOME="$TUNNEL_ROOT/isolated-config" TMPDIR="$TUNNEL_ROOT/tmp" "$TUNNEL_ROOT/install/tunnel-client" --help
env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin XDG_CONFIG_HOME="$TUNNEL_ROOT/isolated-config" TMPDIR="$TUNNEL_ROOT/tmp" "$TUNNEL_ROOT/install/tunnel-client" help quickstart
env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin XDG_CONFIG_HOME="$TUNNEL_ROOT/isolated-config" TMPDIR="$TUNNEL_ROOT/tmp" "$TUNNEL_ROOT/install/tunnel-client" help doctor
env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin XDG_CONFIG_HOME="$TUNNEL_ROOT/isolated-config" TMPDIR="$TUNNEL_ROOT/tmp" "$TUNNEL_ROOT/install/tunnel-client" dev proxy --help
```

本轮上述命令及 `init --help`、`doctor --help`、`profiles --help`、
`profiles samples show sample_mcp_stdio_local` 均退出 0。

创建只含环境引用的本地 profile；下面的 tunnel ID 是官方示例占位值，没有创建或查询真实 Tunnel：

```sh
env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin XDG_CONFIG_HOME="$TUNNEL_ROOT/isolated-config" TMPDIR="$TUNNEL_ROOT/tmp" "$TUNNEL_ROOT/install/tunnel-client" init --sample sample_mcp_stdio_local --profile opendesk-read-only --profile-dir "$TUNNEL_ROOT/profiles" --tunnel-id tunnel_0123456789abcdef0123456789abcdef --mcp-command "$PWD/dist/opendesk-mcp --read-only" --health-listen-addr 127.0.0.1:0
env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin XDG_CONFIG_HOME="$TUNNEL_ROOT/isolated-config" TMPDIR="$TUNNEL_ROOT/tmp" "$TUNNEL_ROOT/install/tunnel-client" doctor --profile opendesk-read-only --profile-dir "$TUNNEL_ROOT/profiles" --explain
env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin XDG_CONFIG_HOME="$TUNNEL_ROOT/isolated-config" TMPDIR="$TUNNEL_ROOT/tmp" "$TUNNEL_ROOT/install/tunnel-client" doctor --profile opendesk-read-only --profile-dir "$TUNNEL_ROOT/profiles" --json
```

`init` 退出 0；两条 doctor 均退出 **2**，唯一失败项是未设置 `CONTROL_PLANE_API_KEY`。
这是无密钥条件下的预期结果，表示控制面配置检查未完成，**不是 doctor PASS**。
v0.0.18 没有 `doctor --offline` 参数。stdio doctor 本身不执行 MCP 握手；
有完整配置时也只检查命令的可执行性。HTTP 目标的 doctor 会做可达性及 OAuth metadata 探测，不能笼统称为离线命令。

## 官方客户端的实际 stdio probe

官方客户端内建 `dev proxy` 在本地运行内存控制面与 tunnel-client runtime，
内部使用固定开发占位 token，不需要读取或提供真实云端 key，也不创建托管 Tunnel。
本轮以 `--backend go --engine-queue-backend inmem` 明确选择该实现。

下面是本轮实际客户端启动参数的等价仓库根目录命令；JSON-RPC 测试客户端另外发出请求。
macOS sandbox 只允许 loopback / Unix socket 出站，限制客户端及其子进程不能访问云端：

```sh
mkdir -p "$TUNNEL_ROOT/official-client-local-probe-final"
env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin XDG_CONFIG_HOME="$TUNNEL_ROOT/isolated-config" TMPDIR="$TUNNEL_ROOT/tmp" /usr/bin/sandbox-exec -p '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*") (remote unix-socket (regex #"^/")))' "$TUNNEL_ROOT/install/tunnel-client" dev proxy --backend go --engine-queue-backend inmem --listen 127.0.0.1:0 --mcp-command "$PWD/dist/opendesk-mcp --read-only" --health-listen-addr 127.0.0.1:0 --url-file "$TUNNEL_ROOT/official-client-local-probe-final/connection.json" --health-url-file "$TUNNEL_ROOT/official-client-local-probe-final/health.url" --readiness-timeout 15s --response-timeout 10s --duration 45s --print-json
```

`connection.json` 提供本次随机端口的 `mcp_url`；不要硬编码端口。
本轮测试客户端先校验所有请求都是 `http://127.0.0.1`，并禁用环境代理。
实际 launch argv、环境和 sandbox policy 均保存在证据目录。

| 检查 | 本轮观察 |
| --- | --- |
| 最终 OpenDesk 二进制 SHA-256（启动前、退出后及收尾复核相同） | `6c218fb7258ea84afcb621117371a385b50787fa43263b9286a5831bf7b9ea0f` |
| `/healthz`、`/readyz` | HTTP 200；仅本地 dev runtime |
| `initialize` | HTTP 200；协商 `2025-11-25`；server `opendesk-mcp` / `0.1.0`，含 title 与 tools capability |
| `notifications/initialized` | HTTP 200 |
| `tools/list` | HTTP 200；恰好 7 个工具，均 `readOnlyHint: true` |
| `tools/call` | 只调用 `tm_status`，参数 `{}`；返回 `{"status":"ok","vision":"enabled"}`，无 `isError` |
| `/health/mcp` | `state: discovered`、`evidence: same_child`、`transport: stdio`，初始化与列表均成功、列表 complete |
| 结束 | 测试客户端发 SIGINT，dev proxy 正常退出 0；随后确认该进程已不存在 |
| 保全检查 | 官方客户端二进制哈希未变；旧 probe 全部文件哈希未变 |

7 个工具为 `tm_status`、`tm_permissions`、`tm_list_windows`、`tm_get_active_window`、
`tm_list_displays`、`tm_wait_for_window`、`tm_screenshot`。
本轮只发现截图工具的 schema：没有输出路径，`returnType` 为 `base64` / `bytes` / `none`；
没有调用截图、窗口枚举或桌面输入工具，没有捕获私人屏幕。
其他协议版本及完整模式写操作未在本子任务中复验。

旧目录 `official-client-local-probe/` 对应二进制 SHA-256
`fa11fdfe9e9ab1c5dcfaec67e17da4f3666131d571947acff3a3aa436b0fd18d`，
仍是该历史构建有效的本地成功证据，没有覆盖或改写。最终构建的兼容结论以
`official-client-local-probe-final/` 为准；本次没有复验 display.scale 或其他桌面行为。

## 本地证据索引

所有运行产物均在 `.runtime/tests/mcp-tunnel/`，不进入版本控制：

| 相对该目录的路径 | 内容 |
| --- | --- |
| `install-evidence.json` | 平台、下载源、版本 SHA、包及二进制哈希 |
| `cdn-download.zip`、`SHA256SUMS.txt`、`PUBLIC_URLS.txt`、`release-latest.json`、`release-ref.json` | 唯一保留的成功下载包及官方校验/版本元数据 |
| `cli-help-evidence.json`、`cli/` | 精确 help 命令、退出码及输出 |
| `profiles/opendesk-read-only.yaml`、`config-doctor-evidence.json` | 无密钥 profile、精确 init/doctor 命令及预期失败 |
| `local-probe.py` | 本轮一次性本地协议检查驱动，不是正式测试入口 |
| `official-client-local-probe-final/launch.json`、`local-only.sb` | 最终构建的精确客户端 argv、清空后的环境和出站限制；含旧证据文件哈希清单 |
| `official-client-local-probe-final/requests-responses.json` | 最终构建的实际 initialize/list/tm_status 与 health 响应 |
| `official-client-local-probe-final/result.json`、`exit.json`、`stdout.log`、`stderr.log` | 最终结果、退出 0、服务及客户端哈希、旧证据未变检查与官方客户端日志 |
| `official-client-local-probe/` | 旧构建的完整历史成功证据，保留且未覆盖 |
| `official-secure-mcp-tunnels.md`、`official-custom-mcp-server.md` | 本轮 fetch 的官方页面快照 |
| `download-cleanup.json` | 已结束冗余下载进程，移除本子任务产生的残缺包与失败驱动尝试 |

主任务的 `.runtime/tests/mcp-tunnel/r1-20261025/` 由主 agent 维护，本子任务没有改写它，
也不把其桌面实机证据当成本子任务的云端证据。

## 官方源码补证

页面没有细述无密钥 doctor 和纯本地 dev proxy 的边界，故补充固定 release SHA 的上游源码：

- `openai/tunnel-client@274a5588414819f063d27100a4fb1096aae3830f:cmd/client/doctor_command.go:L144-L197` —
  [配置失败提前返回、stdio 检查与 HTTP 探测分支](https://github.com/openai/tunnel-client/blob/274a5588414819f063d27100a4fb1096aae3830f/cmd/client/doctor_command.go#L144-L197)。
- `openai/tunnel-client@274a5588414819f063d27100a4fb1096aae3830f:cmd/client/dev_command.go:L59-L64` —
  [dev proxy 明确用于没有托管控制面的本地集成测试](https://github.com/openai/tunnel-client/blob/274a5588414819f063d27100a4fb1096aae3830f/cmd/client/dev_command.go#L59-L64)。
- `openai/tunnel-client@274a5588414819f063d27100a4fb1096aae3830f:pkg/localproxy/localproxy.go:L560-L602` —
  [本地控制面地址与内部开发 token 覆盖](https://github.com/openai/tunnel-client/blob/274a5588414819f063d27100a4fb1096aae3830f/pkg/localproxy/localproxy.go#L560-L602)。

上述是官方上游实现补证，不替代云服务文档或实际账户授权。本轮无需第三方教程或其他 OSS 实现。

## 受限文件证明的长期复用入口

维护源码位于 `tests/mcp/tools/secure-tunnel/`，使用 POSIX Python 3.11+，无额外 Python 依赖。
它只支持 `tm_status`、`tm_test_write_nonce`、`tm_test_read_nonce`；不支持通用 MCP 录制或桌面操作。
配置索引默认是 `~/.opendesk/tunnels/opendesk-web-file.json`，仅记录 `keyFile` 路径、
`tunnelId`、`organizationId`、`client`、`binary`、`binaryProvenance` 等非秘密元数据。
索引为 0600、父目录 0700；key 仍在原用户 secrets 目录，普通文件 0600、父目录 0700。
不要把 key 正文写进索引、仓库、命令参数、聊天或证据。

从仓库根目录 `/Users/shopme/Documents/workspace/opendesk` 执行一行本地诊断：

```sh
python3 tests/mcp/tools/secure-tunnel/prepare-run.py --doctor-only
```

命令读取已有索引，验证已有客户端和受限二进制与指定 provenance 的 SHA-256，复制受限二进制，
在 `.runtime/tests/mcp-chatgpt-web/<UTC-time>-<random>/` 独占准备新 run、fixture、profile 和 manifest，
随后通过 `file:` 引用执行官方 doctor。它不启动在线轮询或 MCP；stdio 等 SKIP 不算在线通过。
只准备、不启动客户端时，去掉 `--doctor-only`。可用 `--index`、`--binary`、`--client`、`--provenance`
显式选择已有本地产物；哈希不匹配即停止，不自动构建、下载或创建 key/Tunnel。

需要一次前台在线会话时，仍从仓库根目录执行：

```sh
python3 tests/mcp/tools/secure-tunnel/prepare-run.py --online
```

该命令先 doctor，再启动最长 30 分钟的官方轮询；Ctrl+C 只回收本次创建的进程组。
它不是登录自启服务，也不自动发送网页请求。第三轮已实际使用该入口与命令级 localhost 代理，
在全新 run 中完成一条网页请求的核心验收；具体原样命令与证据见上面报告。
共享 key 的历史安全恢复仍需完成；不能用 doctor 成功抵销该缺口。
代理仅继承命令环境中的 HTTP(S)/ALL_PROXY 配置，不修改全局代理。

### Browser 本地项目的日常入口

Browser 项目连接与上述受限三工具 Tunnel 是各自独立的链路。
本地源码开发优先使用既有侧栏 **开发 → 本地项目**：从已授权目录选择源码，按现场连接诊断和
“首次使用：连接方法”连接原目录，再使用源码关联、实时开发预览、运行和运行结果入口。
无需手动打开 `native-agent/workspace.html`，不另建工作台。
Native 已连接并不表示源码 Provider 就绪，本地测试网页可用也不能替代项目连接证据。
较早实窗的 `chatgpt-send-queue` 目录曾离线；当前实窗 Native 已连接、Provider 已注册，
所选 `local-project-core-check` 只读源码就绪。已通过既有结果入口查询并下载历史 v2 JSON，SHA 与界面一致，未重跑业务。
侧栏“实时开发预览”能打开既有文件工作区，README/Markdown 实窗可读；该 Controller 目录的自定义 UI 预览显示
`E_FILES_NOT_FOUND`，完整自定义 UI 预览仍未通过。扩展加载目录已核对为 `dist/development`，与当前 HEAD 的完整构建对应关系未核实。
具体 source/run 身份、截图、下载哈希与历史执行证据边界见上述当前续接，不把入口连通推广为完整端到端通过。

启动器在读取 key 前检查准备产物及源码哈希，使用排他 run 锁，在线启动前独占创建 `.online-used`。
已有 proof、RPC trace、在线残留或未知状态的 run 均拒绝再用；不要删除标记后重试。
doctor-only 的已停止 run 可继续由 `start-online.py --run-dir <absolute-run> --key-file <absolute-key-file>`
启动一次在线会话；通常直接用上述准备入口生成新 run 更清晰。
临时 profile 退出后删除；MCP command 以 `env -i` 启动，不继承 runtime key。
RPC trace 独占创建，写盘前递归省略 `_meta`，保留工具名、参数、返回、ID、时间和顺序。
输入线程采用可停止读写并在 `audit_end` 前 join；取消或审计失败非零退出并标记不完整。
在线日志原子独占创建，doctor 日志允许在核验打开文件为当前用户 0600 普通文件后追加。
终端输出管道饱和时允许丢弃显示内容，脱敏日志为完整记录；取消和进程回收不会等待终端恢复。
如系统拒绝向所属进程组发信号，启动器有限退出并记录 `cleanup_failed` 和所属 PID/group，不能据此认为进程已停止。

`binaryProvenance` 是已有构建的来源记录，不等于在当前 HEAD 重新构建；manifest 分别记录
原构建信息、当前准备 HEAD、已登记源文件是否一致及当前工具哈希。源码变化后必须重新准备。
`.runtime/` 中的已下载客户端和旧二进制可被清理；入口源码会保留，但缺失产物需要按本文安装/构建说明重新准备 provenance。
当前 manifest 及本地哈希以可信本机操作员为边界，不防御同用户修改源码、索引或 key 路径的攻击。

最小合成检查均从仓库根目录执行，不读取真实 key、不连接云端、不写现有 proof：

```sh
python3 tests/mcp/tools/secure-tunnel/check-relay.py
python3 tests/mcp/tools/secure-tunnel/check-launcher.py
python3 tests/mcp/tools/secure-tunnel/check-prepare.py
```

结果分别写入 `.runtime/tests/mcp-chatgpt-web/relay-regression/`、`launcher-regression/`、`prepare-regression/`。

## 首次在线接入步骤（通用说明）

以下保留首次接入的通用步骤；已有上述专用资源时应复用，不重复创建 Tunnel/key。
步骤依据前述官方页面与 v0.0.18 CLI 帮助；本节七工具只读流程并非已验收的三工具文件证明流程。
官方页面确认的入口和选项列在下文，未确认的按钮名称、字段布局不作推断。
本项目专用资源已有真实网页成功证据；这不代表所有 Pro 账户均有相同权限，本地兼容也不能证明其他账户可用性。

正式接入使用 profile + `doctor` + `run`，不要把 `dev proxy` 的随机 URL、开发占位 token
或示例 tunnel ID 用于 ChatGPT 正式连接。以下终端命令均从仓库根目录执行。

### 1. 确认 Platform 组织、ChatGPT 工作区与权限

1. 先确定拥有 Tunnel 的 Platform 组织，以及将使用插件的 ChatGPT 工作区。
   个人账户使用该账户所属的个人 Platform 组织；不要假定个人组织的 Tunnel 会自动出现在其他工作区。
2. 在所选组织的 [Platform Tunnels 设置](https://platform.openai.com/settings/organization/tunnels)
   创建 Tunnel，并将其关联到目标 Platform 组织和 ChatGPT 工作区。记录服务实际返回的完整 `tunnel_id`，
   不自行拼接、缩短或沿用本文占位 ID。官方文档确认可在此创建和管理 Tunnel，具体创建表单以实际页面为准。
3. 创建、编辑或删除 Tunnel 的操作人需要组织级 Tunnels **Read + Manage**；
   长期运行客户端的 runtime key 主体，以及在 ChatGPT 中选择 Tunnel 的操作者，需要 **Read + Use**。
   项目权限、ChatGPT 订阅与组织级 Tunnel 权限不能互相替代。
4. 缺少权限时，由目标组织 owner / RBAC 管理员在
   [Roles](https://platform.openai.com/settings/organization/people/roles) 与
   [Groups](https://platform.openai.com/settings/organization/people/groups) 中配置角色和成员关系。
   官方说明新角色分配可能需要最多 30 分钟生效。ChatGPT 工作区仍须允许添加和使用自定义 MCP，且受 Lockdown 等限制。

若 Tunnel 未出现在 ChatGPT，先检查目标工作区关联和 **Read + Use**，不要改用本地调试 URL。
企业组织与工作区无法自动关联时，按官方文档联系 OpenAI account team 处理映射，不能臆造关联结果。
依据：[权限与组织/工作区关联](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels#permissions-and-access)。

### 2. 用真实 tunnel_id 替换占位 profile

确认本节操作的是上文创建的专用占位 profile。下面的 `--force` 仅覆盖
`profiles/opendesk-read-only.yaml`，将占位 tunnel ID 替换为刚创建的真实 ID，
继续使用 stdio 与 `--read-only`；不会创建云端 Tunnel，也不需要把密钥写入配置。

```sh
TUNNEL_ROOT="$PWD/.runtime/tests/mcp-tunnel"
printf '粘贴 Platform 返回的完整 tunnel_id: ' >&2
IFS= read -r OPENDESK_TUNNEL_ID
env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin XDG_CONFIG_HOME="$TUNNEL_ROOT/isolated-config" TMPDIR="$TUNNEL_ROOT/tmp" "$TUNNEL_ROOT/install/tunnel-client" init --sample sample_mcp_stdio_local --profile opendesk-read-only --profile-dir "$TUNNEL_ROOT/profiles" --force --tunnel-id "$OPENDESK_TUNNEL_ID" --mcp-command "$PWD/dist/opendesk-mcp --read-only" --control-plane-base-url https://api.openai.com --control-plane-api-key-ref env:CONTROL_PLANE_API_KEY --health-listen-addr 127.0.0.1:0
```

检查生成的 profile 时，只应看到真实 `tunnel_id`、本地启动命令及
`api_key: "env:CONTROL_PLANE_API_KEY"` 这一环境引用，不应出现密钥正文。
`--force`、`--profile-dir`、`--control-plane-api-key-ref` 等参数均已在保存的 `init --help` 中核实。
依据：[官方 stdio profile 流程](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels#set-up-tunnel-client)。

### 3. 在本地安全输入 runtime key，再执行 doctor 与 run

在正确组织的 [Runtime API keys](https://platform.openai.com/settings/organization/api-keys)
为具备 Tunnels **Read + Use** 的主体准备 runtime key。不要用 admin key 运行长期客户端。
不要把真实 key 发到聊天、写入 profile / `.env` / 脚本 / shell 历史，或放在命令行参数中。

下面的代码仅供后续操作者在未录制的本地终端执行；本次没有执行其中的输入或客户端命令。
key 通过隐藏输入进入子 shell 的环境，客户端读取 profile 中的环境引用；输入内容不会成为 shell 命令。
不要开启 shell tracing、打印环境、导出含密钥的文件或录制这段操作。子 shell 结束后该输入不会留在父 shell 环境中。

```sh
(
  set +x
  TUNNEL_ROOT="$PWD/.runtime/tests/mcp-tunnel"
  export XDG_CONFIG_HOME="$TUNNEL_ROOT/isolated-config"
  export TMPDIR="$TUNNEL_ROOT/tmp"
  unset CONTROL_PLANE_API_KEY OPENAI_API_KEY OPENAI_ADMIN_KEY
  unset TUNNEL_CLIENT_CONFIG TUNNEL_CLIENT_PROFILE TUNNEL_CLIENT_PROFILE_FILE
  printf 'Runtime API key（输入隐藏）: ' >&2
  IFS= read -r -s CONTROL_PLANE_API_KEY
  printf '\n' >&2
  export CONTROL_PLANE_API_KEY
  "$TUNNEL_ROOT/install/tunnel-client" doctor --profile opendesk-read-only --profile-dir "$TUNNEL_ROOT/profiles" --explain
  doctor_status=$?
  if [ "$doctor_status" -ne 0 ]
  then
    exit "$doctor_status"
  fi
  "$TUNNEL_ROOT/install/tunnel-client" run --profile opendesk-read-only --profile-dir "$TUNNEL_ROOT/profiles" --health.url-file "$TUNNEL_ROOT/online-health.url"
)
```

这里没有使用本地无密钥检查的 `env -i` 前缀，因为正式客户端需要接收刚输入的 runtime key 环境变量。
`run --profile` 来自官方流程；`--profile-dir` 与 `--health.url-file` 已由保存的 CLI 帮助和配置文档确认。
出现 doctor 非零退出时先处理错误；缺 key 退出 2 仍表示配置检查未完成。
即使 doctor 成功，也不表示云端 key 权限、轮询或 ChatGPT 工具调用已通过。

保持前台 `run` 终端运行。使用其输出的真实本地 health/UI 地址，或 `online-health.url` 中的地址，
检查 `/readyz` 与 `/ui` 显示的 readiness、连接及轮询状态；不要硬编码随机端口。
正式客户端需要出站 HTTPS 到官方控制面，不能继续套用本地 probe 的 loopback-only sandbox。
确认正式客户端连接和轮询正常后，再进入 ChatGPT 配置；故障时保留脱敏错误，避免输出 key。
依据：[官方运行与健康检查说明](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels#troubleshooting)。

### 4. 在 ChatGPT 网页创建插件

根据 [Add custom MCP server](https://developers.openai.com/api/docs/guides/custom-mcp-server)
与 [Connect from ChatGPT](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels#connect-from-chatgpt)：

1. 在目标 ChatGPT 工作区打开网页 [Plugins](https://chatgpt.com/plugins)。
   选择加号 → **Add custom MCP server**，填写名称及可选描述。
2. 在 **Connection** 选择 **Tunnel**，选择列表中与 profile 相同的 Tunnel；
   官方文档也允许输入有效 `tunnel_id`。若实际页面没有该入口，记录缺失，不推测其他隐藏开关或冒称账户已获支持。
3. 认证选择 **No authentication**。这里针对本次 OpenDesk stdio 服务自身：它没有额外的 OAuth 或服务认证层。
   **这不等于 Tunnel 无认证**：客户端到官方控制面仍使用 runtime key，并受组织/工作区关联及 Tunnel RBAC 控制。
   不要在插件表单里粘贴 runtime key，也不要为当前服务臆造 OAuth 参数。
4. 阅读风险提示，选择 **I understand and want to continue**，再选 **Create as a plugin**。
   在个人插件或目标工作区中找到创建的插件，并按官方流程安装后用于会话。

上述英文入口与认证选项来自官方文档；三工具专用插件另有真实网页证据，但不证明所有账户均显示相同 UI 或具备访问资格。

### 5. 首次只验证 tm_status 和 7 个只读工具

保持正式 `run` 进程运行，检查插件发现的工具是否恰好为：
`tm_status`、`tm_permissions`、`tm_list_windows`、`tm_get_active_window`、
`tm_list_displays`、`tm_wait_for_window`、`tm_screenshot`，并均有只读标注。
若出现写工具或工具集不符，先核对 profile 的 `--read-only` 和实际二进制，再刷新发现；不要继续调用。

首次在对话输入框通过 `@` 选择该插件，只请求：

```text
只使用刚安装的 OpenDesk 插件调用 tm_status，参数为 {}。不要调用其他工具。
```

检查工具详情中的实际输入、输出和错误；不能用模型文字回答、工具列表出现、doctor 成功或本地 probe
替代真实云端调用证据。7 个只读工具的列表核验不要求逐一调用；首次不要截图、读取私人窗口或执行桌面输入。
只有正式客户端轮询、插件发现与这次 `tm_status` 云端调用均实际成功，才能报告该在线路径接入成功。

早先无密钥本地 probe 没有验证任何云端接入；其结论仅为本地兼容。
之后本项目专用三工具 Tunnel 已完成真实网页验收，当前正式工具版本也已通过，见本文顶部。
七工具 `--read-only` 的本地证据与三工具在线证据分别成立；未据此推广到所有 Pro 账户，
官方候选 key 的权限/到期日已有独立页面证据；与保存文件的对应关系及历史暴露恢复仍待核验。
