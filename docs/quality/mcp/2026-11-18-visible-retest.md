# 2026-11-18 ChatGPT WEB 官方 Tunnel 可见复测

本轮在真实 ChatGPT WEB（ego(lite) TaskSpace 147）完成计算器五次独立点击、截图传递、模型直接看图，以及新的合成文件读写、越范围拒绝和显式撤权后拒绝。没有用 Codex 内的业务 MCP 调用、本机点击、健康检查或历史结果替代 WEB 验收。业务核心场景通过；完整生命周期审计仍未通过，OCR 表达式识别有误，详见下表。

证据根目录 **R**：`.runtime/tests/mcp-tunnel/20261118-visible-1129/`。文件合成根目录 **F**：`.runtime/tests/mcp-files-core/20261118-visible-79jo7tp4/`。本地运行产物未纳入版本控制。

## 本轮结果

| 验收项 | 结果 | 新鲜证据 |
| --- | --- | --- |
| WEB 桌面工具发现 | PASS，40 工具 | R/web-desktop-discovery.txt |
| WEB status / permissions | PASS；AX、Input Monitoring、Screen Capture granted | R/web-status-permissions.txt；Automation 权限未通过 AppleEvents 实际触发核验 |
| 清除、1、+、2、= | PASS，各一次 WEB tm_click | R/web-{clear,one,plus,two,equals}-result.txt |
| 独立真实 Calculator 观察 | PASS，0 → 1 → 1+ → 1+2 → 3 | R/calculator-after-*.json、calculator-result-local.png |
| WEB 截图工具 | PASS，实际 Calculator PNG，460×816 | R/calculator-web-capture.png、web-screenshot-result.txt |
| WEB 模型直接看图 | PASS，本轮模型明确观察到深色计算器、1+2 和 3 | R/web-screenshot-result.txt、web-screenshot-final-visible.png |
| 同一截图的独立 WEB OCR | 结果数字 3 PASS；表达式 NOT_PASSED | R/web-ocr-result.txt：local OCR 识别 3，confidence 0.96817154；把 1+2 识别成 142，confidence 0.37767986；没有补写或校正 OCR 原文 |
| WEB 文件专用工具发现 | PASS，恰好四工具 | R/web-files-discovery.txt |
| 未知 marker 首读 / SHA | PASS，97 bytes，真实 WEB 正文与磁盘一致 | R/web-files-initial-read.txt、files-initial-independent-match.json |
| 固定 SHA / requestId 一次写入 | PASS，127 bytes，CONFIRMED / readBackVerified:true | R/web-files-write-result.txt、files-independent-after-write.json |
| WEB 读回 / 原 requestId 回执 | PASS，正文、字节、SHA 与磁盘一致；KNOWN | R/web-files-readback.txt、files-web-readback-match.json |
| 未授权 outside.txt | PASS，E_FILES_ACCESS / NOT_DISPATCHED，无 data | R/web-files-outside.txt |
| 显式 revoke 后原能力读文件与查旧回执 | PASS，两项均拒绝，无 data；保持同一 client / MCP | R/files-grant-revoked.json、files-at-revoke.json、web-files-after-revoke.txt |
| 官方 poll / health | 桌面及文件最终均 PASS | R/desktop-health.json、files-health-after-web.json；文件初次无成功 poll 的结果保留在 files-health.json，未当成通过 |
| 完整生命周期 relay 审计 | **NOT_PASSED** | files run/rpc-audit.jsonl 结束为 auditComplete:false / E_RELAY_STOPPED；业务调用计数及新鲜 WEB/磁盘证据单独成立，不把退出审计写成完整通过 |
| 本轮资源清理 | PASS | R/desktop-stop.json、files-workspace-revoked.json、final-environment.json |

本轮没有修改产品源码、构建、安装、更新浏览器扩展、改变权限或签名。实际加载和功能证据来自下述现有固定二进制，不宣称当前整个 dirty workspace 已重新构建。真实窗口和 WEB 结果图已观察；这不是产品 UI 改版或全库 UI 回归。

## 实际入口与调用链

桌面聊天：[工具发现结果](https://chatgpt.com/c/6afd1be2-03f8-83ee-9274-31269b26b137)。文件聊天：[发现工具元数据](https://chatgpt.com/c/6afd1c5b-85a4-83e8-b876-92567da36dfc)。两页留给用户；中间设置页已随 TaskSpace 结束关闭。页面显示 GPT-6.2 Sol、轻度。

桌面插件为 `plugin_asdk_app_6af21996d16c8191a9a84d446a8d0f56`；文件使用已有 **OpenDesk Code Mac96**，`plugin_asdk_app_6af43ab28b9c819183779be407f97d00`，版本 `asdk_app_v_6af43ab28ba48191a9331a15baa5215f`。文件插件的 ZIP 只有应用引用，不包含 Tunnel URL；11 月 11 日现有插件成功记录及其 runtime-index/profile 证明既有配置使用同一个 Tunnel。本轮该插件实际读到了新 fixture 的未知正文，并由本轮 relay 记录对应调用，验证了当前业务路由。未创建或更新插件。

共同云端入口为现有官方 Secure MCP Tunnel `tunnel_6af2133ba8c08191a1b3306aaf1030fc`，组织 `org-4g93BMwcYJToeMT7Aj72tNOY`。本轮继续使用 `/Users/shopme/Documents/workspace/opendesk-browser/.local/credentials/openai/opendesk.key` 文件引用。交接中的长路径已不存在；11 月 11 日 shortPathMigration 记录说明同一 key 已迁移，用户本轮又明确授权该短路径。现有 key 成功，无需新建；凭证仅由现有启动器及官方 client 处理，内容未返回 agent 上下文、输出、hash、复制或替换。

官方客户端 `.runtime/tests/mcp-tunnel/install/tunnel-client`，版本 `0.0.18+274a5588414819f063d27100a4fb1096aae3830f`，SHA-256 `5a55fd3dde505b2ee27f970dad18e6c08e04ffb9d7bc4256c507b8f312c1d6e8`。

桌面链：**真实 WEB → 桌面插件 → 官方 Tunnel → 官方 client PID71830 → opendesk-mcp PID71831 → 内嵌桌面 automation owner → macOS Calculator PID74918 / window219713**。本轮 client_instance_id 为 `5048925a9a3fd53bb73c0d4d0d2b4ac3`。3001 仅是该 client 的本地管理/健康入口；3000 保持原 OpenWebUI PID6163。桌面 MCP 没有经过共享 Browser Native Host，不把两个 owner 混为一条链。

文件链：**真实 WEB → 已有 Code 插件 → 同一官方 Tunnel → 官方 client PID73069 → stdio-audit.py PID73073 → 专用 opendesk-mcp PID73076 → scoped FilesMCPClient → 原 Native Host PID89250 的同一个 nativeFiles → 本轮合成 fixture**。client 另有其自身的 codex app-server 子进程 PID73074/73075；它们不是代替 WEB 发起业务调用的本对话工具。文件管理端口为系统分配的 64293，不是文件业务 RPC 入口。

Native connection `824c7227ed811f8bd6d9212a748b8b83` 的 agent.sock 由 lsof 映射至 PID89250，父进程为 ego PID9279；另一个 Chrome connection `1f08c8997b8d1bf5294c6cbbaba00272` / PID89256 保持不动。实际 Native 路径 `/Users/shopme/.opendesk-browser/native-agent-r1/build-mcp-files-20261110/OpenDesk.app/Contents/MacOS/opendesk`，SHA-256 `b32d7746732f3d2177ffbe2f21a3c49da599d1ad7b9d035b5c53cc7c85f3a8d7`，已有稳定 Local Development 签名，deep/strict 校验通过。没有重启、更新或替换共享 Native。

两个模式的 MCP SHA-256 均为 `30b7412a260623b88b62a728d0db13667a133d872b3e2ea06c0bfcb6124e0858`。桌面直接使用 `.runtime/tests/mcp-tunnel/20261110-current-account/bin/opendesk-mcp`，文件模式用 prepare-run.py 验证 provenance 后复制至全新 run。它是未签名的 standalone MCP；不能把 Native App 的签名归给它。历史构建基线为 `f42d26c246fc7c57a03a664d6b3b49e59e23aa48` 的 dirty build，当前 server.go / server_test.go 与该构建记录相符，仅是限定文件匹配，不是整个当前源码 provenance。详见 R/current-provenance.json、mcp-build-provenance-scope.json、desktop-processes.json、files-processes.txt、files-native-owner-map.json。

桌面官方日志保留 command/request ID 元数据，但不记录业务工具名和参数，不能逐条声称已把 WEB tool call 与每个云端 request ID 完整 join。文件 relay 只保留帧字节数、SHA、工具名和 write requestId，未落原始正文或授权秘密。完整审计的退出缺口明确保留。

## 计算器执行边界

只在本任务取得原生 UI 锁后进行输入。无输入 AX 预检确认唯一 Calculator、全部五个目标及结果字段；每次 WEB 点击后再独立读 AX，不重放前缀。PID74918、bundle `com.apple.calculator`，窗口 bounds `(1442,583,230,408)`；实际点击中心依次 `(1530,740)`、`(1476,902)`、`(1638,902)`、`(1530,902)`、`(1638,956)`，均带 PID/bundle/按钮 label/AXButton 约束。

最初窗口本来已显示 3；该旧状态未计入通过。新清除实际显示 0 后才开始本轮结果链。计算器仅在本机启动，五个业务按钮均由 WEB 工具点击。PID 定向 AXPress 仍会移动全局指针，因此没有绕开共享 UI 锁。

截图前 WEB 先调用 focus_window，再以 get_active_window 返回的 pid/title/handle/bounds 核对计算器，然后只截 activeWindow。本轮没有发明 windowId 参数或截全屏。模型从截图 ImageContent 直接报告 1+2/3，另一次 tm_ocr 读取同一个截图文件；两种证据没有互相替代。

## 文件授权、一次写入与撤权

workspace：`workspace-6369b6ee-d935-4ab1-b526-4ab0cc52bfe2`。grant：`4dcedc74-714d-489a-a337-64373feac8be`，限定 `roundtrip.txt` read-write、`readonly.txt` read，`outside.txt` 排除，ttl1800 秒，明确 body egress consent，独立 CLI lease。所有正文均为本轮生成的合成数据；没有读取用户业务文件。

唯一写入 requestId：`b6b67e8a-72d4-48e1-b73e-cc99d5bd95ce`。追加一行 `web-tunnel-roundtrip-20261118\n`，保留真实首读正文及末尾换行。

| 对账 | bytes | SHA-256 |
| --- | --- | --- |
| 首读与原磁盘 | 97 | `9e06bee9ba2630053a10b653b49e4a5cf71edc78eb05c435ead7eb52f3463b58` |
| 一次写入、WEB 读回、回执及磁盘 | 127 | `1943bd8f376539b3e5dd3e710cded7c065beb732db1f9e56a86a3c8404cb1a1f` |

relay 记录精确业务次数：status3、list1、read4、write1。只有一个 write requestId。初次读取前未向 WEB 提供随机 marker。没有 UNKNOWN 或写入重试。outside 拒绝完成后才显式 revoke grant；同一个 client/MCP、原 capability 和原 lease 尚在时发起撤权后 read/status，两次均为 REJECTED / NOT_DISPATCHED、无 data。随后显式撤销 workspace，lease exit0，停止自有 launcher，launcher exit130 / official client exit0，状态 stopped/cancelled:true；没有把 owner 断线当 revoke 成功。

文件 fresh run：`F/tunnel/20261118T035142Z-7hnrvn5x/`。除生成 profile 显式使用既有 control-plane proxy 外，没有改变产品配置。桌面模式只给 MCP 的干净 PATH 增加现有 Tesseract 目录；未安装 OCR 包、修改全局 PATH 或替换模型/provider。

## 提示词交付与收尾

[本轮已验证的逐步 WEB 提示词原文](../../../.runtime/tests/mcp-tunnel/20261118-visible-1129/verified-web-prompts.md)逐段保存了五次点击、截图直接看图、OCR、首读、一次写入、读回、越范围及撤权后拒绝的实际提交文本。仅在上述对应场景取得新鲜回执后交付；未把整理后的长提示词宣称为另一轮一段式测试已通过。

本轮授权和客户端已经结束。旧 PID、bounds、workspaceId、SHA 与 requestId 是证据参数，不能直接当作下一轮永久入口；新一轮必须核对当前 Calculator 和新限定授权，重新使用真实读取结果。完整提示词不含 runtime key/capability。当前结果页保留供人工查看。

自有 PID71830/71831/71832、73065/73069/73073/73074/73075/73076 均退出；3001 和64293无监听，3000 PID6163仍在；共享 Native PID89250/89256仍在。私有 capability 仅按 owner/mode/单链接元数据核验后精确移除，未读取内容；保留现有 runtime key。TaskSpace 已结束并保留两页，UI 锁已释放。

仓库 HEAD 保持 OpenDesk `975f7f111c6ffe6b18002c08574b762eb1aa06c1` / master、Browser `cdff7e777d45c7b3d0867042f0483a2c72c0b629` / main。初始大量未提交改动保留；本任务只新增本报告和 .runtime 证据。无新分支、提交、推送或远端状态声明。

未运行全库 CI、build、lint、平台全矩阵、production 或跨平台 live 验收。未确认 Automation AppleEvents 权限；OCR 表达式仍错误；relay 的 auditComplete:false 未修复或改写。以上均不扩展为全能力通过。本轮无需产品源码修复。
