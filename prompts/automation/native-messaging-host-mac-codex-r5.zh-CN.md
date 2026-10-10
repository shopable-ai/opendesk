# GOAL：OpenDesk Browser Native Messaging R5 —— Mac 本地重新构建、安装、Codex 调用与真实 Chrome 验收

你作为 Chrome MV3、macOS 原生安装、Go Native Messaging、Codex CLI/MCP、跨仓库兼容、安全迁移、真实 Chrome 测试和反方审计联合工程负责人，在当前 Mac 的本地 Codex 中直接执行。默认中文。不是只写方案，需要实际编译、隔离安装、联调、修复、提交与提供可复核证据。

代码仓库：
- https://github.com/shopable-ai/opendesk（默认分支 master）
- https://github.com/shopable-ai/opendesk-browser（默认分支 main）
- 必须先读两个仓库的 AGENTS.md、OpenDesk docs/integrations/browser/native-messaging-host.zh-CN.md，以及 Browser docs/architecture/browser-framework/native-convergence-compatibility-r3.zh-CN.md 和 docs/framework/workstreams/native-node-free-r4-20261010.md。

绝对范围：本任务只针对 OpenDesk Browser 的 Native Messaging Node Host 被 OpenDesk Go Host 替换和对应安装、认证、CLI/IPC、浏览器连接测试。禁止删除或重写其他 Node.js、npm/webpack/WXT/Vite、Browser JavaScript、桌面自动化/MCP/Flow 功能。高级 Node local-dev MCP/ESM 是独立的真实消费者，不准整目录删除。

唯一验收主链：当前 Go 源码 → 重建含真实 App Mode 的 OpenDesk.app → 安装到稳定的 Mac 路径 → 原生 Go Native Host 精确注册 → 真实 Chrome/CFT 扩展授权并 connectNative → 已打开的真实 Sidebar/网页授权 → Codex 通过 opendesk browser CLI 查询状态/目标、运行一次安全示例并读取原结果。

## 最新先决门槛：2026-10-10 R5.1（必须核对最新 CI）

Browser `main` 的原生实测不能直接从旧 Go 协议 PASS 升级为产品 PASS。最新已核验的 Browser CI（候选 `e1d10b241ef77e5328abf917781b48d336db1042`）在真正进入 Chrome 握手之前先遭到两类共用包失败：固定入口断言 expected 14/actual 15；新内置类库 `runtime/builtin-libraries/page-core.js` 被包安全校验判定出现动态 `Function`。相关 Page 预览单测还存在 `E_BUILTIN_RESOURCE`。完整证据/修复所有权与 Gate A→G 顺序：

https://github.com/shopable-ai/opendesk-browser/blob/main/docs/framework/workstreams/native-go-host-r5-1-delivery-gates-20261010.zh-CN.md

**先由实际 R15 内置类库模块 Owner 串行修复打包与依赖，Native Owner 审查原生入口测试；不能偷改校验器取消 CSP/动态执行防线。只有当前候选包验证绿灯，才进行 Go App + CFT 同候选真实联调；macOS 诊断在包验证提前失败时，只能标 NOT_TESTED 而不是说 Chrome Native 连接失败。** 保留两仓库其他并行 Agent 修改，若另有 Owner 正在处理，则只检查最新 SHA 和复用已取得的证据。

**Codex 两条方向不可混同**：本 R5 是 Codex shell→Go CLI→Native→Browser 的工程验收；`Sidebar→本机 Codex App Server→AI 工作流` 属于 Browser R16 专项，截至已审设计仍未有真机全链可用证据，不能算 R5 完成后已自动交付，也不应为了 R16 推迟修复 Native 的 P0 红灯。

1. 本机现场与并发隔离

识别两个真实本地仓库，不猜测 Go 仓库所在路径。Browser 可先检查 /Users/shopme/Documents/workspace/opendesk-browser 是否真实存在和 Git remote。核对 git status -sb、当前 HEAD、remote、当前其他 Codex/Chrome/CFT、正在执行的任务、Chrome profile、Native 安装 owner、Socket、现有 /Applications/OpenDesk.app、~/Applications、command -v opendesk。只在保护未提交改动时 fast-forward 原 master/main；不建分支/Worktree，不 reset --hard、不 git clean、不 force push，不覆盖其他对话或活跃任务。不得泄露安装凭据或把 install.json 原始秘密保存至 Git。真实用户安装可能存在 Node Host：先只读探测，绝不能自动 cleanup、覆盖 Manifest、抢 Socket 或清空不确定结果 Ledger。

2. 构建完整 Mac App 和核验产物

OpenDesk Go 仓库执行：
    go test -count=1 ./internal/browserbridge ./internal/browsercli
    go test ./cmd/opendesk
    ./scripts/build_macos_app.sh

该仓库的 build_macos_app.sh 默认包含 apps/opendesk 官方 App Mode。不要用 APP_MODE_PACKAGE= 关闭 GUI 却声称完成桌面应用构建。允许在不覆盖旧 dist 的前提下使用脚本已支持的 DIST_DIR 隔离输出。核对生成 App/Contents/MacOS/opendesk、Info.plist、可执行位、codesign --verify --deep --strict 和 shasum -a 256 的实际结果，保存准确 Go SHA/二进制哈希。测试用 ad-hoc 签名不代表正式发行签名。Go 源码与远端最新主分支/构建输入必须一致。

3. 安全地安装、升级到系统和 CLI

先在独立、用户拥有的稳定 App 路径安装本轮完整 OpenDesk.app（可使用 ditto 保护 bundle 信息），验证签名与路径。若准备替换 /Applications/OpenDesk.app，先检测现有程序归属、正在运行的桌面任务、旧 bundle、TCC 主体和 Native 注册资源；保留旧安装包与既有 Native manifest/wrapper/config 的私有逐字节备份、sha 和元数据。有未知效果、未决运行或备份/回滚不可证实，则标记 SYSTEM_MIGRATION_BLOCKED，只验收私有安装，绝不能破坏现有系统 App。

该仓库已有 scripts/install_macos_cli.sh，可执行：
    bash scripts/install_macos_cli.sh --app-bundle /实际稳定路径/OpenDesk.app
该脚本默认管理 ~/.local/bin/opendesk，只允许更新其拥有的 launcher。未知旧 CLI 必须拒绝覆盖。验收初期优先调用 /实际稳定路径/OpenDesk.app/Contents/MacOS/opendesk 的绝对路径，避免 PATH 指向旧二进制。

OpenDesk GUI 可通过 open /实际稳定路径/OpenDesk.app 启动以核验界面，但 Native Messaging Host 并不要求 GUI 持续打开：Chrome 在 connectNative 时会根据注册清单启动同一 App 内的独立 browser native-host 模式。不能要求用户再运行 Node daemon、localhost HTTP 或单独的 Go 常驻服务。验证退出 GUI 之后 Chrome 仍能按需启动 Host。

4. 隔离 Chrome for Testing 下的真实注册与授权

使用浏览器仓库适用的开发/生产构建命令构建真实扩展包，优先隔离 CFT Profile；不要影响日常 Chrome。读取当前实际加载扩展的 chrome.runtime.id、真实 version、Side Panel 实例和 Profile，而不是填一个假定的 32 位 ID。

当前官方 Chrome Web Store 发布 ID 未经核验，故全新开发机器的无参 setup 返回 E_OFFICIAL_ID_UNAVAILABLE 属于安全拒绝，不能乱写常量、wildcard 或伪造所谓自动配对。采用真实测试扩展 ID 的高级显式入口：
    /实际安装App/Contents/MacOS/opendesk browser setup --extension-id 实际扩展ID --browser cft --user-data-dir 已存在的独立CFT Profile绝对路径

使用 `OPENDESK_NATIVE_INSTANCE=r5-mac` 与独立 CFT Profile（例如 `~/.local/share/opendesk-browser-r5/codex-cft-profile`）隔离本轮安装，不更改用户 HOME；命名实例首次 setup 必须显式 `--browser cft --user-data-dir ...`，后续合法安装可继承已保存的绑定。Node 安装冲突只可报告并另开隔离资源，不可直接覆盖。核对 manifest 名称 com.shopable.opendesk_browser.agent、type=stdio、path 为 Go launcher、allowed_origins 仅精确真实 extension ID；装载 Go 配置 owner=opendesk、私有权限与固定二进制路径。不要打印 clientCredential。

在扩展选项页面以真实用户可信手势点击「授权并连接 OpenDesk」，完成 Chrome 自身 nativeMessaging 许可。不得通过修改 chrome.storage 或假造 CDP/浏览器点击来绕过授权。权限需要用户本人确认时记录 WAITING_FOR_GENUINE_USER_APPROVAL；只能把真正通过的情形写 PASS。打开受控真实 HTTP Demo 和 Sidebar，单独授予该网站权限。Go doctor 的 connected=true、bridge.status nativeConnected=true、唯一 Host registrationId 三者必须真实取得。

5. Codex 调用 OpenDesk Go CLI，验证真实浏览器结果

优先使用 Codex 自带的本机 shell 能力直接调用 Go CLI，不需要额外注册 MCP，也不要把现有 desktop opendesk-mcp 的 Browser Core 工具谎称为本次 Native Messaging v1 接口。

顺序先运行：
    /实际安装App/Contents/MacOS/opendesk browser doctor
    /实际安装App/Contents/MacOS/opendesk browser bridge.status
    /实际安装App/Contents/MacOS/opendesk browser target.current

从返回中取得唯一真实 Sidebar registrationId 和当前网页的 windowId/tabId/frameId/documentId/url/origin；绝不能猜 Host/标签/文档身份。目标不存在或多个 Host 冲突应返回明确阻塞而不自动选择。

只在受控本地 Demo 网页（用户已批准执行）开展一次简单安全测试。按当前 Browser src/native-agent/host-adapter.js 的真实合同生成请求 JSON，字段为 registrationId、从 target.current 原样取得的 target、source.kind=draft、完整 sourceUtf8（如 async function main(){ return {title: await page.title(), url: await page.url(), value: params.value}; }）、params 和合理 deadlineMs。以唯一 requestId 调用：
    /实际安装App/Contents/MacOS/opendesk browser run.start --file /私有测试目录/run-start.json --request-id 唯一请求ID

run.start 的 ACK 不是完成。读取真实 runId，再以 run.get --file /私有测试目录/run-get.json 查询原始持久执行；核对 resultId、sourceHash、document、实际 title/url/value、最终 completed 或失败原因、workerRetired 和 retirementState=released。再用一个真实可停止的隔离任务验证 run.stop 和 run.get 的收尾。切勿在生产网页做有副作用的默认测试。

当请求返回 E_EFFECT_UNKNOWN / OUTCOME_UNKNOWN 时，不重新执行或更换 requestId 试运气，保留原 admissionRequestId/digest/registrationId，使用 request.get 只读恢复；无法获得这些身份就明示 BLOCKED_UNKNOWN_EFFECT。

6. 可选 MCP，仅当用户确实需要高级工具时

目前已支持 Codex 直接用 Go CLI；无需为了本轮测试新建 MCP。已有 native-agent/local-dev/mcp.mjs 属于 Node 版高级本地项目工具，它可以借 Go Socket 接入，但不是 Native Host 本身。保留 WXT/Vite/npm/ESM Resolver/桌面 MCP，不删除、不重写。如果用户要求将浏览器 Native CLI 作为原生 MCP tool surface，另起独立薄适配器方案，不在本验收中并行建设第二套执行器。配置 ~/.codex/config.toml 前必须核对和备份已有配置，不要盲目运行 codex mcp add 覆盖其他服务。

7. 必须保留的兼容性与异常测试

核对 Node/Go 所有权互斥、旧 Node CLI/doctor/高级 Provider 经相同 Go Host Socket 可通信、60KiB 限额、auth 错误、origin 不匹配、late ACK、断线、EOF/SIGTERM 后 Socket 不遗留、Socket inode owner 不错删、Node→Go 旧安装冲突 fail closed、两个 Chrome Profiles 和 permission revocation。Go 原生 single-file project add/list/revoke 只能作为当前 Host 可选兼容功能检验，不扩大目标为全项目 Node 删除；完整 Node 高级 ESM/npm 保留不动。

如果已有 Browser tests/environment/opendesk-native-provider.test.mjs 成功，那仅说明真 Go 进程＋模拟 Chrome 帧，不能替代真实 Chrome。可复用该受控驱动做增量回归，之后必须补同一候选真实 CFT 验收。不要将历史 Node Host 的真实 Chrome PASS 贴到 Go Host。

8. 交付、回滚、评分

在 Go docs/integrations/browser 和 Browser docs/framework/workstreams 保存新的独立回执：两仓库 SHA、实际 App 文件路径/sha、签名模式、当前扩展 ID、Host manifest 的非秘密字段、真实用户授权状况、请求/结果身份、原始测试日志路径、PASS/FAIL/NOT_TESTED、安装与回滚事实，不上传用户凭据、源文件和隐私数据。真实安装前后都必须具备可恢复路径，不许偷偷迁移旧 Node Host 或杀掉正在运行的用户任务。

评分采用独立设计审查、代码/协议兼容、真实 Mac Chrome 端到端、迁移恢复四个维度，质量目标 95+；没有真实 Chrome 完整 Run/Result/Stop、首次正式身份、旧 Node 安全迁移这些关键证据时，只能称当前完成的部分为 PASS，完整产品记 NOT_ACCEPTED，不能预先给满分。

最后用中文清晰汇报：是否完成最新 App 编译、最终安装在哪、打开 GUI 是否必要、Host 注册在何处、Codex 实际调用的 Go CLI 命令、有哪些真实 Chrome 结果、目前还需用户点击哪一步、缺口和回滚方式。不要只输出另一个提示词。
