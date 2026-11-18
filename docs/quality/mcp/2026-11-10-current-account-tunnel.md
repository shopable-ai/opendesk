# 当前账号官方 MCP Tunnel 核心测试

日期：2026-11-10（Asia/Shanghai）。当前原生 Goal 对话为 `01a1c1ae-47ff-7c80-a594-7ea546a1daa1`；原对话 `01a1c181-eb7d-72c3-b93a-52cd0e6dc75a` 的暂停状态不被本记录改写。工作目录 `/Users/shopme/Documents/workspace/opendesk`，现有 master，观察 HEAD `f42d26c246fc7c57a03a664d6b3b49e59e23aa48`，工作树存在其他任务改动；本任务不提交、推送、创建分支或 worktree。

证据目录为 `.runtime/tests/mcp-tunnel/20261110-current-account/`；`current-state.json` 是恢复索引，实际回执和进程观察优先。仅执行核心开发验证，完整 CI、production、评分、跨平台与压力测试继续延期。

## 账号与凭证

当前 Platform 组织 `org-4g93BMwcYJToeMT7Aj72tNOY`，项目 `proj_UaTofgeZTbgjthluOMDoBwPo`，ChatGPT workspace `61499c2b-bb90-449c-ae6d-7f744234aea2`。创建并核对当前账号 Tunnel `tunnel_6af2133ba8c08191a1b3306aaf1030fc`（OpenDesk Desktop Mac96）。旧账号两个 Tunnel 和共享凭证未读取、覆盖或撤销。

本轮独立 runtime key 名称 `OpenDesk Desktop Mac96 Runtime`，tracking ID `key_TUh8TLJavJAvDglK`，仅 Tunnels Read / Use，2026-12-10 到期。当前秘密存于 `/Users/shopme/Documents/workspace/opendesk-browser/.local/credentials/openai/org-4g93BMwcYJToeMT7Aj72tNOY/tunnel_6af2133ba8c08191a1b3306aaf1030fc/runtime.key`；凭证目录逐层0700、文件0600、当前用户所有、非符号链接且单硬链接。凭证未进入聊天、命令行、环境变量、日志或截图。当前非秘密 metadata 为同目录 `metadata.json`；初次保存记录 `runtime-key-metadata.json` 保留作历史证据。首次未保存的新 key `key_Hg3b8SzUDiywTgwt` 已在页面确认 Revoked，未用于运行。

2026-11-10 按用户要求迁入 Browser 仓库根目录的持久凭证区，整目录由 `/.local/credentials/` 忽略，不进入 `projects/`。迁移保持原字节，更新当前 `desktop-tunnel-image/desktop.yaml` 的官方 `file:` 引用与 manifest profile hash，既有 `desktop-tunnel.py doctor` 返回0后移除旧 `~/.opendesk/tunnels/.../desktop/private/runtime.key`。迁移回执与 doctor 输出在 `credential-relocation/`；历史已消费 profile 和运行证据不改写。这次 doctor 只证明迁移后本地配置检查通过，新的网页现场复测由新对话执行。

## 已验证链路与边界

| 条件 | 本轮实际证据与当前状态 |
| --- | --- |
| T1 当前组织/Tunnel/最小 runtime key | PASS：页面资源核对、独立秘密落盘、官方控制平面在线 |
| T2 客户端健康及网页调用 | PASS：official healthz/readyz=200，控制平面 poll 已发生；ChatGPT 插件发现并连接，网页 tm_status 和 tm_permissions 调用成功 |
| T3 受限 nativeFiles 读写闭环 | PASS：新版签名 Native 已实际加载；网页读取未知 marker，固定 SHA/requestId 准确一次写入、读回与独立磁盘一致，越范围和撤权后的读取/回执均拒绝 |
| T4 真实计算器五次点击及读取 | PASS：五次网页 tm_click、独立 AX3、原网页截图和网页 local OCR3；标准 MCP image 本地格式检查通过，网页直接图像渲染仍未通过 |
| T5 生命周期与不重放 | PASS：桌面入口多次真实启动/status/stop/restart，PID0600保留；文件启动器日志缺陷修复、定向回归与fresh官方会话实际stop通过。进程组/子进程/lease退出、3001释放、原3000和Native连接保留；文件真实write只出现一次 |

官方客户端 `0.0.18+274a5588414819f063d27100a4fb1096aae3830f`，SHA256 `5a55fd3dde505b2ee27f970dad18e6c08e04ffb9d7bc4256c507b8f312c1d6e8`。直接网络超时后，仅对其 control-plane 使用本机已有 HTTP proxy `http://127.0.0.1:7897`；没有改系统代理或停止其进程。旧 LAN proxy 当时拒绝连接，未使用。

首轮实际 `dist/opendesk-mcp` SHA256 `4338df5fbc0389f03b89001abf7cb7ff1a29c398062602cc60b466dbea0dcd7d`，历史 dirty 构建，不证明与当前源码完全一致。该 full 模式公开40工具，Calculator 限定是本次获准操作范围，**不是服务端应用隔离**；不向不可信调用方开放。`expectedBundleID` 等未知参数不构成执行时 guard，实际点击使用新鲜 AX 对应的 processId 与按钮中心。

## 网页计算器证据

插件 `plugin_asdk_app_6af21996d16c8191a9a84d446a8d0f56`；网页聊天 [调用插件状态权限](https://chatgpt.com/c/6af219fb-baa4-83ec-9896-ddb22b8ecd76)。ego TaskSpace43复用当前登录 Profile，不构成 Cookie 或扩展实例隔离。

每步先独立读取唯一 com.apple.calculator 的 AX 窗口与按钮，随后由网页模型经官方 Tunnel 发起一次 tm_click。顺序为 AllClear、One、Add、Two、Equals，PID观察74918；五次返回成功。没有发送键盘整式、代码计算或直接本机点击代替网页动作。前缀未重放。`web-clear-result.txt` 至 `web-equals-result.txt` 保存网页实际回复；`official-desktop-metadata.jsonl` 保存官方 dispatcher IDs 与时间，不含工具正文。官方可选 tracing 文件为空，不能冒称有逐工具 payload trace。

新鲜 AX `calculator-after-web-equals.json` 只在唯一 StandardInputView 范围读得3（不合并上次表达式）；`calculator-web-evidence.json` 保存结论。网页调用 tm_focus_window 和 tm_screenshot 保存 `calculator-web-result.png`，实窗截图已人工视觉检查：上次表达式1+2、当前大号结果3。tm_ocr 首次 Apple Vision provider 因 native extension 未注册失败，未绕过 registry gate。随后为 MCP 的干净 PATH 显式加入已存在的 Tesseract，网页实际对原始 `calculator-web-result.png` 调用 local OCR，识别当前大号3，置信度96.82%；历史表达式低置信度错读保留原文。一次后续 activeWindow 截图被并行任务前台抢占而拍到DevTools，明确不作为计算器证据，未重放任何输入。

当前源码修复 `tm_screenshot`：兼容保留JSON文本并附加标准MCP image/png，严格校验PNG/base64及总响应大小。本地真实stdio检查证明content为text+image、PNG尺寸460×816；但网页仍返回 NO_VIEWABLE_IMAGE_CONTENT，不能声称网页直接看图通过。T4由真实五次点击、原截图、独立AX和网页OCR共同证明。

## 文件接线修复与 Native 缺口

专用 grant/revoke 的控制连接原来 Load() 忽略 selector；本轮改为 LoadClient() 并在实际 authenticated 帧核对版本、kind、browserReady、connectionId 与 extensionId，显式连接失效不回退 legacy。新增 `files_mcp_connection_unix_test.go` 的30个临时Socket场景 RED→GREEN；定向 `go test ./internal/browserbridge -run 'TestFilesMCP(Control|Connection)' -count=1` 通过。CLI构建证据 `build-cli.json`，未覆盖 dist。随后将CLI置入独立持久候选App，使用既有稳定签名身份完成deep/strict校验并滚动更新Native默认路径。

第一次 fixture workspace 为 workspace-bba04b57-e2b2-45cf-aa18-a0439bfdfab4，限定文件 roundtrip.txt 与 readonly.txt，随机marker未打印。可信grant返回泛化 E_FILES_ACCESS，未创建capability；这不证明宿主明确作出权限拒绝，也不证明控制帧未发送。随后符号与反汇编核对证明当前 Native PID2964（ego）/3304（Chrome）的旧签名二进制缺 mcpGrant / serveFilesMCPControl。不能靠改ACL、复制credential或放宽校验解决。

`browser update` 成功保留当时两条连接，只让未来新连接使用新版。之后观察到外部正常重连，新Native PID8115（ego）与8118（Chrome）均来自 `/Users/shopme/.opendesk-browser/native-agent-r1/build-mcp-files-20261110/OpenDesk.app`，ready/runtimeCurrent均true；本任务没有断开、kill或禁用共享连接。此前请求重连的异步问题已作废，不再需要用户操作。当前ego connectionId为84d8a231b902252121155efc1b90a8ca。

本轮实际文件聊天：[文件验证结果](https://chatgpt.com/c/6af22115-6704-83e8-ba37-3b6ba2a32e2c)。可信本机仅批准合成fixture内 roundtrip.txt（read-write）和readonly.txt（read），outside.txt排除。专用模式只暴露tm_files_status/list/read/write四工具，无桌面Runtime、Shell或第二套文件执行器。

网页初读随机marker为79字节，SHA256 `95ac0604ba86166b123a098bd0cb296a91a4b6f3af139db524d06cfe8e375ccf`，此前未向网页或Agent打印marker。使用固定requestId `7ed8554e-d31f-459e-bfa9-f47a050813cf`，仅调用一次write，追加指定证明行后为121字节，SHA256 `5fd174cb38c505111bfa5f315a199f570613d546a0416408d0a36c8ba0fa185a`。网页再次读取、KNOWN历史回执和独立磁盘精确字节均一致；relay metadata计数为status3/list1/read4/write1，无正文日志。

outside.txt读取返回E_FILES_ACCESS/NOT_DISPATCHED；显式revoke grant后，同一MCP进程、原capability的roundtrip读取和原requestId历史回执查询也返回同样拒绝，均无data。grant lease CLI正常退出，随后workspace显式撤销。`files/acceptance.json`及`web-final-revocation.json`保存实际证据。初始旧workspace的revoke曾返回E_CONNECTION_GONE，不能将其记作显式撤销成功；新owner下对该旧ID定向revoke返回E_FILES_ACCESS，不能记作撤销成功；旧Host已退出，且该旧授权从未签发capability。

新增测试已登记现有 Go 分类账本。目录审计执行后报告仓库其他未登记/格式错误（含多个并行新增文件），整体未通过；没有为通过本任务而改写其他资产分类。

## 文件启动器收尾修复与最终状态

首轮文件业务闭环后的取消已清理客户端和子进程，却在第二次O_EXCL打开online日志时抛出FileExistsError，未正确落下stopped；不能把这一轮当启动器收尾成功。修复保留第一次独占创建的日志描述符，清理后写固定元数据并成功关闭，随后发布stopped；未改未知文件保护、0600、payload禁止记录或清理范围。

`check-launcher.py` 回归先复现再通过，覆盖files模式正常完成/取消、未知文件/符号链接保护与既有安全场景；`check-files.py` 的29项通过。精确命令、来源hash和证据路径在 `launcher-repair-checks.json`。未重做已通过的文件业务动作。

修复后另建fresh prepared run，固定新启动器hash，使用仅roundtrip.txt读取的300秒临时grant。官方health/ready=200且require-control-plane-poll通过。取消得到预期launcher exit130，官方client exit0，state为stopped/cancelled:true；online日志0600且仅一条固定 `{stage:online,code:OK}`。11350官方进程组、MCP11356及launcher11347均退出，3001释放，grant/lease/workspace撤销，原3000 PID6163及Native PID8115/8118保留。见 `files/lifecycle-official-health.json` 与 `files/lifecycle-final-stop.json`。

本轮源码修改限于：Native selector控制连接校验及其30场景回归、MCP标准PNG image返回及定向测试、桌面Tunnel可复用生命周期helper与检查、上述文件启动器收尾修复、必要测试账本及文档。工作树中的Files Bridge主体、其他Native/Browser、API/UI及并行测试资产有大量既有改动；不将整个dirty diff归于本任务。

定向验证：`go test ./internal/browserbridge -run 'TestFilesMCP(Control|Connection)' -count=1`、`go test ./pkg/mcpserver -run 'Screenshot|Policy|NativeExtension' -count=1`、helper/launcher/files检查及本轮差异空白检查通过。测试分类全库审计因其他未登记和格式错误仍失败，记录于 `test-architecture-audit.txt`；未运行完整CI、生产发布或跨平台live验收。两处当前源码候选构建记录见 `build-cli.json`、`build-mcp.json`，不把历史dist版本当当前源码证明。

最终所有T1–T5核心条件通过；官方Tunnel客户端已停止，3001空闲，短期文件授权均撤销。保留当前账号Tunnel和runtime key供后续显式运行，未创建提交或推送。

## 本地运行入口

MCP业务走stdio，只有官方管理/健康端口绑定127.0.0.1:3001；原127.0.0.1:3000由既有Open WebUI占用并保留。官方云端走出站HTTPS，不设置公网入站或Cloudflare替代链路。

`tests/mcp/tools/secure-tunnel/desktop-tunnel.py` 提供 prepare/doctor/run/status/stop，当前可复用profile与manifest在 `.runtime/mcp/desktop-tunnel-image/`，绑定当前源码MCP SHA256 `30b7412a260623b88b62a728d0db13667a133d872b3e2ea06c0bfcb6124e0858`；旧 `.runtime/mcp/desktop-tunnel/` 仅保留历史证据。prepare拒绝覆盖已有run；run前检查hash、key元数据与端口，使用干净环境，秘密只经官方file引用。run保持前台；stop核对UID、启动时间、内核exe/argv、唯一config和端口owner后只发一次SIGTERM，不发KILL、不操作进程组。18组helper mock检查通过（该次仅有对话stdout，早期 `desktop-helper-checks.json` 是7组，不能混作18组独立证据）；真实 status/stop/restart 在 `helper-live-*.json`。实际进行了四次桌面stop，每次官方客户端移除正常PID文件后可再次run；未知/残留PID文件仍拒绝覆盖，不能无条件重复run。

从仓库根目录运行；该profile已实际反复启动/停止，现有proxy写在配置中，只作用control-plane：

```sh
python3 tests/mcp/tools/secure-tunnel/desktop-tunnel.py doctor --run-dir /Users/shopme/Documents/workspace/opendesk/.runtime/mcp/desktop-tunnel-image
python3 tests/mcp/tools/secure-tunnel/desktop-tunnel.py run --run-dir /Users/shopme/Documents/workspace/opendesk/.runtime/mcp/desktop-tunnel-image
python3 tests/mcp/tools/secure-tunnel/desktop-tunnel.py status --run-dir /Users/shopme/Documents/workspace/opendesk/.runtime/mcp/desktop-tunnel-image
python3 tests/mcp/tools/secure-tunnel/desktop-tunnel.py stop --run-dir /Users/shopme/Documents/workspace/opendesk/.runtime/mcp/desktop-tunnel-image
```

重启后，网页重新发现40个桌面工具并真实调用tm_status得到ok/enabled（`web-restored-desktop-status.txt`）。本轮所有桌面/文件输入已经结束，原插件桌面工具列表已恢复；TaskSpace43已finish，仅为查看证据保留两个结果聊天。文件fixture授权已撤销，旧capability不能直接复用；再次进行文件模式必须新建限定grant/lease与fresh prepared run，不得重用既有请求或把桌面profile当文件隔离。

官方合同：[Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)。项目接入指南：[secure-mcp-tunnel.md](../../integrations/mcp/secure-mcp-tunnel.md)；文件合同：[files-bridge-native-contract](../../integrations/mcp/files-bridge-native-contract.zh-CN.md)。
