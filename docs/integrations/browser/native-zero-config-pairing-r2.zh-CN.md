# OpenDesk Go Host：官方免 Extension ID 安装与开发版安全配对 R2

日期：2026-10-10。状态：**实施合同/尚未实现自动注册**。跨仓库完整架构：[OpenDesk Browser R2 自动发现与配对](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/architecture/browser-framework/native-zero-config-pairing-r2.zh-CN.md)。现有 Go R1 [Native Host 实施文档](native-messaging-host.zh-CN.md) 的“需明确输入扩展 ID”在代码交付前仍成立。

> **实现兼容差异入口**：[Browser / OpenDesk 双实现 R3 台账](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/architecture/browser-framework/native-convergence-compatibility-r3.zh-CN.md)：Node/Go 安装所有权双向保护、Node 项目 Provider 对 Go 的兼容、未知效果、SIGTERM、Desktop/Browser owner 与仍未验收的门槛。它不是宣称两个执行引擎已合并。

## 产品目标

普通用户只需安装/启动 OpenDesk，再安装浏览器扩展；不复制 32 位 ID，不安装 Node Host，不手动执行 setup，最少一次浏览器真实权限确认。Chrome 仍通过 `connectNative` 主动启动纯 Go Host；不设计所谓 Go 主动给未知扩展推消息，不新建 HTTP/WebSocket 执行端口。

**两条身份路线：**
1. 正式渠道：产品构建时有经过签名/商店实物核验的固定 extension ID，安装器即使在扩展尚未安装时也可安全预置 Native Host manifest 的精确 `allowed_origins`；不存在可信 ID 则不能启用“官方自动注册”。
2. Unpacked/开发渠道：不能从临时随机 ID 提前注册且不能允许通配符。通过 extension 实际读取 `runtime.id` 发出 OS 深链/应用内一次性申请，**独立 OpenDesk GUI 明确确认**后才写入精确 allowlist。系统深链本身不证明请求来源，不能零确认加入任意 ID。

Go 安装器负责注册应用自有 Host 路径/允许来源/文件权限；Browser 负责真实 `nativeMessaging` 许可、Host/RunHost、目标和网站权限。跨渠道只能在明确迁移后更改，Node→Go 旧安装冲突必须 fail-closed。

## 拟修改源码（不准为了演示直接改执行链）

- `internal/browserbridge/install_unix.go`：将一次性显式 ID setup 拆为正式渠道预置与受控开发版 enrollment。manifest 校验使用精确身份列表；拒绝非本程序所有的路径、旧 Node 以及软链接，不允许 wildcard。安装记录跟踪已批准来源及渠道，不记录敏感握手明文。
- `internal/browsercli/command.go`：保留 `setup --extension-id` 高级诊断兼容；正式正常安装无参数，由发行元数据初始化。禁止用默认/空 ID 猜测，错误码区分渠道缺失、未批准、冲突和升级。
- `cmd/opendesk` + macOS .app URL Handler（需真实验证 Chrome 启动行为）：申请只是数据，收到 `opendesk://` 不能直接调用 Setup；需用户独立点批准。未授权或过期不得改写 manifest/凭据。
- `internal/browserbridge/host_unix.go`：不动 Browser RunHost/Controller 执行逻辑。保持 Chrome 提供的 Origin 与本机预授权来源一致，以及 hello/welcome 和认证/Socket 栅栏。
- 单独的 `internal/browserbridge/project_provider*.go`（第二阶段）：项目目录必须显式授权，有限的 `projects.list/project.resolve` 经原 providerEpoch/sourceHash 合同输送至扩展。Go 已依赖 esbuild，但不能绕过 Browser 原有 ESM/资源/schema/权限约束；Node MCP 先保留给高级项目。

## 验收和回滚

要求测试“App 先安装、扩展尚不存在时 Host 已预置”“扩展先安装、App 后安装”“官方与随机开发 ID”“Chrome 与 CFT/多个 Profile”“Node 旧 Host 冲突”“用户取消配对”“浏览器拒绝权限”“异常断电时 manifest 写入原子性和恢复”“Go GUI 关闭但 Native 可由 Chrome 启动”。每个流程必须绑定真实 SHA、Go 二进制和 Chrome native grant，不能用模拟 Chrome frame 替代实际用户授权。

安全测试包括恶意站点伪造协议链接、伪造 extensionId、过期/重放请求、非本用户目录、profile 混用、symlink、manifest 路径劫持、credential 泄漏与未知效果重放；任意失败均不得静默扩大 allowed_origins 或重新执行脚本。

**当前状态**：Go R1 Host/CLI 已存在，但 `Setup(extensionID,...)` 仍拒绝空 ID，正式扩展可信 ID 未在仓库经核验确定；没有实际免 ID 安装、开发配对或 Go 文件 Provider 交付。R2.0 先核验发行 ID，再实施安装器；在此之前保留现有命令行作为开发者 fallback。

## R2.0 安全默认参数的已实现切片（2026-10-10）

已实现 `browserbridge.SetupAutomatic`，供 `opendesk browser setup` / `opendesk browser update` 使用：

- **已经有 Go Host 合法绑定**：命令可以不带 `--extension-id`、`--browser` 和 `--user-data-dir`；仅复用已验证的 `install.json` 身份、浏览器和 Profile，原 IPC credential 不轮换。
- **新安装且有已验证的正式发行 ID**：允许从 Go 源码中的 `verifiedOfficialExtensionID` 常量取精确 ID，浏览器默认 `chrome`。该常量在当前未发布开发源码中刻意为空，只有实际 Web Store 分配的真实 ID 经过签名发布校验后才能设置。
- **新安装但没有已验证官方 ID**：无参数命令返回 `E_OFFICIAL_ID_UNAVAILABLE`，不能凭空猜测，也不会注册宽泛的 `allowed_origins`。开发者临时版仍可使用高级显式 `--extension-id`，或待 R2 安全 GUI 配对能力实现。
- **旧 Node Host、不正确文件权限、冲突渠道/浏览器/Profile、无效显式 ID**：不自动升级、不覆盖、不跳过安全校验。相应回归测试位于 `internal/browserbridge/install_unix_test.go`。
- **当前仍需要管理员/AI 调用 setup 命令吗？** 未把系统安装器/首次启动绑定到该入口前，需要；`SetupAutomatic` 只是把参数推断逻辑放在 Go Owner，不能误称普通用户新安装已经做到零命令。

**后续必须执行：** 实际签名的 Chrome Web Store ID 与发行元数据比对 → 在发布构建中固定 ID → OpenDesk 安装器调用 `SetupAutomatic` → Mac 实测“先 App 后扩展 / 先扩展后 App” → 原生确认的开发版配对 → 免 Node 项目 Provider。不得因单测通过抬升成产品 95 分。

## 反方审计与直接实施规格（2026-10-10）

跨仓库唯一完整 GOAL：<https://github.com/shopable-ai/opendesk-browser/blob/main/docs/framework/prompts/goal-native-zero-config-r2-mac-codex-20261010.zh-CN.md>。Browser 主决策和六专业立场独立核对表：<https://github.com/shopable-ai/opendesk-browser/blob/main/docs/architecture/browser-framework/native-zero-config-pairing-r2.zh-CN.md#9-六角色对抗式架构复审与专家评分口径2026-10-10>。

### 硬性证据和产品边界

1. **当前不属于完整桌面端一键可用。** Go 原生 Host/Socket/CLI + Mac/Linux 定向组件已经有代码；独立 OpenDesk GUI 安装器首次注册、Chrome Store 正式 ID、开发版 GUI 安全配对、Go 原生本地项目 Provider 和同发行构建的真实 Chrome E2E 仍缺证据。
2. `browser setup` / `browser update` 新增无参数入口仅在**已经合法安装 Go Host**时自动继承 `extensionId`、`browser`、`userDataDir` 和原 `clientCredential`。官方 ID 常量 `verifiedOfficialExtensionID` 当前为空，故全新无参数安装报 `E_OFFICIAL_ID_UNAVAILABLE` 并保持文件不变，**禁止**自动退化成猜测临时 Chrome ID 或 `allowed_origins` wildcard。
3. `internal/browsercli/command_test.go` 与 `internal/browserbridge/install_unix_test.go` 覆盖无参重复调用、旧 Node 文件 fail closed、错误 ID/browser、credentials 不轮换；测试目录使用短用户私有 `/tmp/od-cli-` 根目录，保留 macOS Unix Socket 路径长度安全限制，不为适应 CI 放宽生产合同。
4. OpenDesk GUI 第一次启动自动注册的合法条件：真实可验的已发布 extension ID 在发行二进制中固定；程序确实安装在不会被清理的绝对路径；确认用户的 OS 账户可写私有 Chrome NativeMessagingHosts 目录；确保旧 Node/其他 Host 不被覆盖；对半途异常事务回滚。**不要**仅因用户双击 GUI 就猜测 Chrome Profile 或本地扩展 ID。
5. Chrome 下 `connectNative` 才启动 Go Host；Go GUI **不要求常驻**。Native Host 连接成功仍只表示 transport 可用，不能假称当前 Sidebar Host 注册、网站权限或项目 Provider 已连接。
6. 当前单安装根/单 `agent.sock`/单 `ExtensionID` 的实现对多个并发 Chrome Profiles、多个渠道扩展 ID 和多个 Host 实例存在已知限制。进行并行验收前制定明确的单用户实例仲裁与身份隔离模型；在此之前并发场景必须正确报错而不是竞态接管或删除他人 Socket。
7. `project.resolve` 的 Go Provider 未实现，不得以 Go Host 已有 `provider.register` 转发功能冒充用户普通多文件项目无 Node。先推进受控单文件，再推进完整静态 ESM。外部 npm/HTTPS 必须保留锁定/缓存/供应链信任合同，不能让 Go 无限制运行 `npm install`。
8. 用户授权不可合并：`nativeMessaging` ≠ 某个项目目录授权 ≠ Chrome 网站访问 ≠ 明确 Run 按钮。OS 深链是潜在不可信请求源，不能在后台收到后静默登记来源。Run/Stop、未知效果恢复始终由 Browser 原 ledger/RunHost 负责。
9. `Windows` 原生 Host 仍返回 `E_PLATFORM`；Windows Core CI 的失败不能误报为 Native 连接成功。也不要因为整个 OpenDesk Windows CI 有历史问题而忽略本轮 Go 代码对应的 cross-build 和组件结果。

### 真实 Mac 必须运行

在实际拥有 OpenDesk Go 工作区和受控 Chrome/CFT 的 Mac 终端操作；云端 GitHub 修改不算用户机器安装。

```sh
go test -count=1 ./internal/browserbridge ./internal/browsercli
go test ./cmd/opendesk
# 只有确有同候选 macOS 可执行文件时，运行 Browser 驱动：
OPENDESK_BROWSER_BINARY=/absolute/path/to/opendesk node --test /absolute/path/to/opendesk-browser/tests/environment/opendesk-native-provider.test.mjs
```

`OPENDESK_BROWSER_BINARY` 必须来自**本轮实际构建的发行可执行程序**，不是旧 dist、暂存 go run 或已退休 Node Host。模拟 Chrome 帧测试不得作为真实 Chrome 授权或项目执行证据；要另行采集真实 `runtime.id`、Chrome 扩展选项的用户点击、Native Welcome、原 Run/Result/Stop/retirement、Go 原生 GUI 配对和升级回滚。没有实际固定官方 ID 时，只能在受控 CFT 读取其运行时 ID，用高级显式参数做开发验收，正式无参数安装不得假报 PASS。

### 专家评分判定

现有六角色对抗式评审为**设计 86/100，完整产品 62/100（非独立真实专家认证）**。95+ 是未来验收门槛而不是主分支 commit 的结果。具体 20/15/20/15/15/10/5 权重、Fatal 否决项及执行 GOAL 在 Browser 规范中；任何越权项目读取、无确认配对、Native 未知效果重放、Node 安装覆盖、无原始真实 Chrome 证据，均不得通过验收。
