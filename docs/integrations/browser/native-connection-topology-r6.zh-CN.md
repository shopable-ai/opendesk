# OpenDesk Go R6：浏览器安装顺序无关与可选局域网配对

> 2026-10-10。状态：**DESIGN_ONLY / REMOTE_LAN_NOT_IMPLEMENTED**。产品总规范：[OpenDesk Browser R6](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/architecture/browser-framework/native-connection-topology-r6.zh-CN.md)；下一轮跨仓真实实施：[Mac Codex R6 GOAL](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/framework/prompts/goal-native-any-order-local-lan-r6-main.zh-CN.md)。遵守本仓 `AGENTS.md` 和 [R5 Mac 安装验收](native-mac-build-install-test-r5.zh-CN.md)。本页不表示局域网端口、设备配对或者 OS installer 已经交付。

## 目标和两个安装顺序

正式软件应同时支持：
- **Browser Extension → OpenDesk App**：Extension 初次没有 Native Host 仍能运行普通 JS，Go 安装器随后为可信正式 ID 登记 Chrome NativeMessagingHosts，Extension 有权限时下次受控探测即成功，用户不用查找或手输 ID。
- **OpenDesk App → Browser Extension**：Go 首次可信安装提前登记官方固定精确 ID（尚无插件也允许），Chrome 后装 Extension 即可 `connectNative`。不存在经过核验的官方 ID 时必须保守失败，不能用测试 CFT ID 猜测、不接受 wildcard；非正式 unpacked 仍需明确可见配对。
- 本机 GUI 不必常驻；Chromium 按 manifest 启动 `opendesk browser native-host`。Browser 的 Native Messaging 权限在安装时取得还是在首次请求时取得属于 Browser `manifest.json` 决策；两种方案都不应把重复授权按钮当成日常连接。

当前 `internal/browserbridge/install_unix.go` 的 `SetupAutomatic` **只在已合法 Go 安装时**能自动复用身份；普通首次安装并无经过验证的官方 ID，不能声称免 setup 已实现。正式发布/签名文件、真实操作系统安装器、旧 Node 安装回滚和各 Profile 身份仍须单独验收。

## Go 网络拓扑

1. **本机默认**：只有 Chrome NativeMessagingHost 原有 stdio 通道和私有单用户 Unix Socket；不新增任何本机 HTTP listening port、不启动桌面引擎/Node/MCP、仍由 Browser RunHost/Controller 执行网页任务。
2. **LAN 第一优先**：A 上 Chrome+本机 Go Host，B 上独立 OpenDesk Go 网络 Provider。A Go 发起与 B 的双端配对 mTLS 连接。B 默认不监听非 loopback；用户明确启用局域网共享并批准 A 设备的最小权限后才监听和发 mDNS 发现信息。A 的 Browser 对 B 的项目只读取被批准的源码/哈希，不能转移 Browser 运行所有权。
3. **A 只有 Extension 而无 Go Host**：Native Messaging 无法直接跨机找到 B。要支持这一产品场景，必须由 Browser 另建有证书可验证、端到端认证的 HTTPS/WSS 传输并做 Chrome Local Network Access/权限实测；Go 端只提供限权远程服务。任何浏览器直接 ws://、自签证书静默忽略或通用未认证本机端口一律禁止。

建议将“Go Native Host 执行 Chrome stdio”与“Go LAN Provider 网络服务”保持两个显式生命周期/owner；网络服务绝不能写任何非 Native frame 到 Chrome stdio，也不能劫持/删除原 `agent.sock`。正式 Browser 的 sourceHash、requestId、Result、Stop/retirement 仍由原 Browser 安全栅栏验证。

## 双端配对和本机存储合同

- 网络接口一律默认关闭；mDNS 只能做候选发现，不能作为设备认证。首次配对有高熵一次性邀请、双端实时可见确认/指纹或 SAS、抗重放、过期/限速、基于设备身份的证书认证；证书私钥不进入网页、`chrome.storage.sync`、命令行参数、明文日志。
- 设备 ID 不等于 IP 或显示名称；项目授权应包含 `deviceId+bindingId+siteOrigin+runtimeKind`。另一台 B 的单文件授权只允许精确项目，禁止共享整盘、自动扫描 HOME、`.git`/凭据。远端模型/文件数据上传必须有独立授权。
- 撤销设备、更新证书、失窃恢复、网络切换、设备重名、并行 Chrome Profiles、错证书、MCP 高级 Provider 存在时，均必须确定唯一 owner 和故障语义。B 掉线只能使新远程请求 unavailable，不能让 A 自动改用其他设备或重新执行网页动作。
- 禁止开放任意远程 Shell、Chrome Profile、Cookie、未授权完整 DOM、`run.start` 网络转发接口。若需求扩展到远程遥控某台电脑的 Chrome，需要另行安全模型、用户确认、run authority 与审计，不能偷用项目 Provider 授权。

## 代码边界 / 不重复造轮子

- Go 原生 Host：`internal/browserbridge/{install_unix,host_unix,project_store_unix,project_notify_unix}.go`、`internal/browsercli/command.go`；保留现有 61440 字节应用协议、owner-locked credential、Unix Socket inode 清理、OUTCOME_UNKNOWN 只读恢复。
- Go 精确单文件 Provider（`ProjectAdd/List/Revoke`）已有实现，先复用不要重写；浏览器侧 Node Resolver/多文件 ESM/npm 工具仍有人使用、保留。LAN 模式必须独立网络身份和设备 scoped grant；不能把本机单个 extension ID 的安装记录直接同步到 B。
- Browser 的 Authority/RunHost/Controller、真实标签页身份、源 JS 和任务存储均仍在 A 的扩展内；桌面 UI/Flow、R16 Codex App Server 并非默认等于 Browser 网络服务。
- 与当前 Go R1 单根 Socket、多 Profile 限制保持兼容且做测试；安全迁移 Node→Go 需要原始证据/备份/rollback，不能让 LAN 任务顺带覆盖旧 Host。

## 验收门槛

同版本固定实际 Go 二进制 + Extension bundle 与真实 Chrome 完成双安装顺序及自动重探测；已有 Host 和 Node 旧版本互不覆盖；成功原 runId/resultId/sourceHash/retirement 与缺权限拒绝；LAN 必须真实测试至少两台受控设备或能够明确证明网络隔离的独立机器/虚拟网络，记录握手/证书/设备撤销/配对拒绝/断网/设备切换（CI loopback 不是“两机真实 LAN”）；A 仅扩展的无本机程序情况独立记录实现与 Chrome LNA 结果。

用户 UI 没有手工参数输入、没有重复授权按钮、没有后台自动发布或运行。任何未经用户批准监听 LAN、认证失败仍传数据、自动换设备、泄漏凭据/路径、扩权、重复执行已入场请求，直接判定安全验收 FAIL，不能申报 95+。
