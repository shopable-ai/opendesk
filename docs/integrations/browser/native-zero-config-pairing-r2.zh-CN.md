# OpenDesk Go Host：官方免 Extension ID 安装与开发版安全配对 R2

日期：2026-10-10。状态：**实施合同/尚未实现自动注册**。跨仓库完整架构：[OpenDesk Browser R2 自动发现与配对](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/architecture/browser-framework/native-zero-config-pairing-r2.zh-CN.md)。现有 Go R1 [Native Host 实施文档](native-messaging-host.zh-CN.md) 的“需明确输入扩展 ID”在代码交付前仍成立。

## 产品目标

普通用户只需安装/启动 OpenDesk，再安装浏览器扩展；不复制 32 位 ID，不安装 Node Host，不手动执行 setup，最少一次浏览器真实权限确认。Chrome 仍通过 \`connectNative\` 主动启动纯 Go Host；不设计所谓 Go 主动给未知扩展推消息，不新建 HTTP/WebSocket 执行端口。

**两条身份路线：**
1. 正式渠道：产品构建时有经过签名/商店实物核验的固定 extension ID，安装器即使在扩展尚未安装时也可安全预置 Native Host manifest 的精确 \`allowed_origins\`；不存在可信 ID 则不能启用“官方自动注册”。
2. Unpacked/开发渠道：不能从临时随机 ID 提前注册且不能允许通配符。通过 extension 实际读取 \`runtime.id\` 发出 OS 深链/应用内一次性申请，**独立 OpenDesk GUI 明确确认**后才写入精确 allowlist。系统深链本身不证明请求来源，不能零确认加入任意 ID。

Go 安装器负责注册应用自有 Host 路径/允许来源/文件权限；Browser 负责真实 \`nativeMessaging\` 许可、Host/RunHost、目标和网站权限。跨渠道只能在明确迁移后更改，Node→Go 旧安装冲突必须 fail-closed。

## 拟修改源码（不准为了演示直接改执行链）

- \`internal/browserbridge/install_unix.go\`：将一次性显式 ID setup 拆为正式渠道预置与受控开发版 enrollment。manifest 校验使用精确身份列表；拒绝非本程序所有的路径、旧 Node 以及软链接，不允许 wildcard。安装记录跟踪已批准来源及渠道，不记录敏感握手明文。
- \`internal/browsercli/command.go\`：保留 \`setup --extension-id\` 高级诊断兼容；正式正常安装无参数，由发行元数据初始化。禁止用默认/空 ID 猜测，错误码区分渠道缺失、未批准、冲突和升级。
- \`cmd/opendesk\` + macOS .app URL Handler（需真实验证 Chrome 启动行为）：申请只是数据，收到 \`opendesk://\` 不能直接调用 Setup；需用户独立点批准。未授权或过期不得改写 manifest/凭据。
- \`internal/browserbridge/host_unix.go\`：不动 Browser RunHost/Controller 执行逻辑。保持 Chrome 提供的 Origin 与本机预授权来源一致，以及 hello/welcome 和认证/Socket 栅栏。
- 单独的 \`internal/browserbridge/project_provider*.go\`（第二阶段）：项目目录必须显式授权，有限的 \`projects.list/project.resolve\` 经原 providerEpoch/sourceHash 合同输送至扩展。Go 已依赖 esbuild，但不能绕过 Browser 原有 ESM/资源/schema/权限约束；Node MCP 先保留给高级项目。

## 验收和回滚

要求测试“App 先安装、扩展尚不存在时 Host 已预置”“扩展先安装、App 后安装”“官方与随机开发 ID”“Chrome 与 CFT/多个 Profile”“Node 旧 Host 冲突”“用户取消配对”“浏览器拒绝权限”“异常断电时 manifest 写入原子性和恢复”“Go GUI 关闭但 Native 可由 Chrome 启动”。每个流程必须绑定真实 SHA、Go 二进制和 Chrome native grant，不能用模拟 Chrome frame 替代实际用户授权。

安全测试包括恶意站点伪造协议链接、伪造 extensionId、过期/重放请求、非本用户目录、profile 混用、symlink、manifest 路径劫持、credential 泄漏与未知效果重放；任意失败均不得静默扩大 allowed_origins 或重新执行脚本。

**当前状态**：Go R1 Host/CLI 已存在，但 \`Setup(extensionID,...)\` 仍拒绝空 ID，正式扩展可信 ID 未在仓库经核验确定；没有实际免 ID 安装、开发配对或 Go 文件 Provider 交付。R2.0 先核验发行 ID，再实施安装器；在此之前保留现有命令行作为开发者 fallback。
