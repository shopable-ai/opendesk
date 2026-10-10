# OpenDesk 原生接管 Chrome Native Messaging（实施 R1）

日期：2026-10-10。状态：**Go Host 源码实现 + Linux/macOS 单元验证 PASS + macOS 发行二进制模拟 Chrome 互通 PASS；真实 Chrome 与旧安装迁移仍未验收。**

当次可核验候选：OpenDesk `41311e8bab78c71645958abd090f6e71a697cac2`、Browser 测试驱动 `c4633bf19e4a66523d37a607d6ed611e98dc267b`。证据：[GitHub Actions #37980235403](https://github.com/shopable-ai/opendesk/actions/runs/37980235403)：`transport (ubuntu-latest)`、`transport (macos-latest)`、`Real OpenDesk executable against simulated Chrome` 全部 PASS。此处的“Chrome”是帧协议**模拟客户端**，没有实际浏览器页面、网站授权、Sidebar 任务或 Node→Go 生产安装切换证据。

适用：`shopable-ai/opendesk` 的 `opendesk browser` 子命令及 `shopable-ai/opendesk-browser` 的现有 Chrome 扩展。架构前置审计见 Browser 仓库 `docs/architecture/browser-framework/opendesk-native-takeover-r1.zh-CN.md`。

## 一句话决策

**生产端不再让最终用户为了 Chrome Native Messaging 安装 Node.js。** Chrome 直接启动现有 OpenDesk 原生可执行程序的 **`browser native-host` 纯传输模式**，由程序本身承担 Native 帧、独立权限校验与进程生命周期。当前扩展中的 Sidebar RunHost / Controller / Worker / 存储、网页授权、documentId、结果和 Stop 全部保持原权威。

本方案不是“Go 里面运行 Node”，不启动 HTTP、localhost 服务、浏览器 CDP 旁路，也不调用 OpenDesk 桌面坐标自动化来处理网页 DOM。OpenDesk 桌面启动或关闭不影响 Chrome 自动管理 Native Host 的生命周期。

```text
用户 Chrome Extension（当前账号/当前真实标签页）
    ↕ chrome.runtime.connectNative
Chrome 自动启动：opendesk browser native-host（无 UI；无 Node）
    ↕ 已认证的用户级 Unix Socket
opendesk browser CLI（未来统一 MCP / OpenDesk Agent client）
    ↕ 原 Native request/response
Extension SW → 既有权限/Admission Ledger → Sidebar RunHost → Controller/Worker
                                                       ↘ 原持久 Run/Result
```

## 首次安装（新的独立安装，无 Node Host）

1. 将 **同一 OpenDesk 程序**安装在持久的绝对路径上（不要依赖容易被清理的临时 `go run` 路径）。
2. 当前开发包尚未固化真实的 Chrome Web Store 发行 ID，因此在首次本机开发测试中，从 `chrome://extensions` 读取实际的 32 字符扩展 ID；正式发行版将由安装器自动提供该身份。
3. 首次开发测试时在终端执行一次：

   ```sh
   # 使用已安装且放在 PATH 的 opendesk；不需要 node。
   opendesk browser setup --extension-id <你实际安装的扩展ID>
   opendesk browser doctor
   ```

4. 打开扩展的 **Native Agent 设置**，从真实 Chrome 页面点击「授权并连接 OpenDesk」，然后打开 Sidebar 工作台；再次 `opendesk browser doctor` 观察 `connected:true`。**doctor 连接成功不代表已经运行任意脚本或授权某个网站。** 真实执行仍需要对应站点权限和用户主动发起。

Chrome for Testing 可以在一个明确测试 Profile 内安装（不影响普通 Chrome）：

```sh
opendesk browser setup --extension-id <实际扩展ID> --browser cft --user-data-dir /absolute/profile/path
```

`--user-data-dir` 必须是**已经存在且能解析的绝对目录**。目标 CFT 的 Profile/扩展 ID/manifest 必须匹配。不要把 `--browser cft` 当成浏览器实际正在使用该目录的证据。

**日常使用：** 已有合法 Go Host 安装时，再次调用 `opendesk browser setup` 或 `opendesk browser update` 可以完全省略 ID、browser、profile 参数，安全复用已保存的精确绑定；正式用户不应需要运行这些命令，后续由 OpenDesk 安装器接管。未绑定官方 ID 的全新开发环境仍需高级显式 ID 或待实现的 GUI 配对，不能声称已零配置。Chrome 自己启动 `opendesk browser native-host`；用户无需单独运行 Node、本地代理 daemon、占用固定端口或打开桌面 App 主界面。若要进入 OpenDesk 桌面 GUI，照常启动原程序，二者是独立模式。

## 开发者与 AI 调用

原始请求 API 完全沿用 Browser 原合同：`bridge.status`、`target.current`、`script.save`、`run.start`、`run.get`、`run.stop`、`page.preview`、`page.get`、`page.dispose`、`request.get`。请求可加 `--file <request.json> --request-id <id>`，CLI 返回浏览器原生 response JSON，不重新包一层 Go API。失败后 **不得盲目换新 requestId 自动重放**；效果未知则只按原 admission ID 做只读恢复。

```sh
opendesk browser bridge.status
opendesk browser target.current --file ./request.json
opendesk browser run.get --file ./run.json --request-id read-existing-run-1
```

现有 `native-agent/local-dev/mcp.mjs` **仍是 Node.js 的开发辅助程序**（项目解析、npm/HTTPS 模块构建等）；R1 的目标是取消 **普通用户的 Native Host 配套 Node 依赖**，而不是宣称所有开发时 npm、WXT、Codex 工具都已去 Node。此 Go Host 已兼容 `provider.register/dev.request/dev.response` 传输合同；后续可单独把开发者 MCP/provider 合并进 OpenDesk CLI/MCP，但需保持现有 JS Resolver、锁文件和沙箱语义且走独立证据验收。

## 安全与生命周期边界

- 只允许单个精确 `chrome-extension://<id>/` origin；manifest `allowed_origins` 和进程 argv 双重校验。用户必须主动授予扩展 Native 权限；调用页面必须另行授权对应网站。
- 使用原 `com.shopable.opendesk_browser.agent`、wire v1、最大 61440 字节 Native/IPC JSON、8 client/12 inflight、10s hello/welcome、3s IPC 认证、138s Host/145s CLI 超时，保留 `E_EFFECT_UNKNOWN / OUTCOME_UNKNOWN` 和 Browser SW 持久栅栏。
- 安装根与 Socket 是当前用户私有资源（0700/0600）；凭据只保存在模式 0600 的 `install.json`，不入命令行、环境变量或日志；Socket 存在即拒绝抢占，清理仅移除自己拥有的 inode。
- 本机 Host 不拥有浏览器页面权限、脚本业务执行、录制、Flow 发布、跨运行结果库或 Desktop Scheduler。
- `doctor` 区分 `installed`、`socketExists` 和真实 `connected`，不得把套接字存在当作可用连接。

## Go 原生单文件项目读取（Node-free R4 候选）

Go Host 新增最小的 `projects.list / project.resolve` 单文件 Provider，不需要额外启动 Node MCP。该 Provider **只读取用户明确授权的真实 JS 文件**，并沿用 Browser 原有 Native/Sidebar/RunHost 权限和结果接口；Go 不执行网页脚本。

```sh
# 已完成真实 Extension ID 的 Go Host 首次安装后，用户/AI 显式授权：
opendesk browser project add --path /absolute/path/to/example.js --runtime-kind controller --site-origin http://127.0.0.1:43111
opendesk browser project list
# 使用上条真实返回的 bindingId 进行撤销：
opendesk browser project revoke --binding-id local-xxxxxxxxxxxxxxxxxxxx
```

仅支持 `.js/.mjs` 单文件：Controller 的 `async-main`，或 Page 的 `--runtime-kind page-userscript --entry-format async-main|classic-userscript`；最多 8 个文件，48 KiB 单文件上限。每条授权绑定**精确文件 inode、网站 origin、执行种类、extensionId 和 Native credential**。路径符号链接、目录、文件替换、无效来源、超限或非 UTF-8 均拒绝；不会扫描整个项目、发送文件路径、执行 npm 脚本或自动运行 Browser。

授权持久化于用户私有 0600 文件。已连接的 Go Host 会接收经过凭据校验的 `project.changed` 只读授权变化通知，轮换 Provider epoch，让 Sidebar 刷新项目而非运行网页代码。命令输出 `providerNotified: true` 表示 Host 已确认通知；为 false 时代表可能尚无活动 Native Host，下一次正常连接会读取持久授权。撤销后旧 epoch 不能重新获得原项目源码。卸载 Go Host 时授权一并销毁，不让另一扩展身份继承。

Node.js 的价值因此进一步收缩：**普通浏览器草稿本来就不需要 Node；现在受权单文件也不需要 Node 运行服务**。原 `native-agent/local-dev` 的 Node MCP/webpack 仍用于多文件 ESM、npm/HTTPS 锁定依赖、开发 source map 等高级能力；浏览器扩展自身的 JS 和 WXT/Vite 构建工具也必须保留。未来只有证据证明这些高级消费者已有可靠 Go 等价能力才能退役其 Node 实现。

正式 Go 文件选择/目录授权 GUI、Chrome Web Store 固定 ID 的零参数安装、开发版安全配对、旧 Node→Go 安装备份/回滚、多 Profile、真实 Chrome 页面 Run/Stop 以及 Windows Native Host 均需单独验收。项目 Provider 的 stdio 模拟 Chrome 测试不能被升级为真实网页执行证据。

## Node 旧安装与正式迁移

`opendesk browser setup/update` **绝不会静默覆盖**现有 Node Host 安装：检测到旧 `install.json`、launcher 或冲突 manifest 返回 `E_MIGRATION_REQUIRED` / `E_MANIFEST_CONFLICT`。绝不可因为 Socket 不存在就判断 Node 没有未决副作用。

既有用户应保留旧 Node provider，直到符合这些条件：当前运行完全停止、相关 admission 的 `OUTCOME_UNKNOWN` 均已核实、Node 安全/断线基线与 Go 对照协议通过、原安装的 manifest/wrapper/install.json 与文件缺席状态已逐字节加密/私有备份。迁移需显式交接，不能调用新 `setup` 当作无风险升级。旧 Node CLI 的 `cleanup` 只适合明确完成退役并已备份的安装；原 request 不能因切换/回退重放。

新安装可以独立使用 Go；只有确认真实 Chrome + Codex 调用 + 重启/撤权/断线矩阵通过后，才能把 **默认生产入口**从 Node 旧实现改为 OpenDesk。

## 验收口径（不可造假）

| 检查 | 当前最低必需的证据 |
| --- | --- |
| Go 源码与单元 | `go test ./internal/browserbridge ./internal/browsercli`；明确工具链版本 |
| 同二进制入口 | `go test ./cmd/opendesk` / 真实发行程序，无 AppKit 窗口/daemon/HTTP |
| 无 stdout 污染 | 读取原始 Chrome Native 4-byte frame，不允许任何 Go/C 初始化日志 |
| 协议 / Socket | 当前 Node 相同输入，Go 实际子进程、鉴权、断开、乱序/迟到 ACK、限额 |
| Browser 互通 | Browser 仓库 `tests/environment/opendesk-native-provider.test.mjs`，设置 `OPENDESK_BROWSER_BINARY` 为实际 Go 二进制（模拟 Chrome，不是真浏览器） |
| 真实 Chrome | 原本可信 Options 权限按钮 + 当前网页授权 + Controller durable result + Stop released + 断线 + 重启 |
| 迁移与回滚 | 逐字节安装备份、原 owner 交接、切换/恢复完整回执，不覆盖其他 Host |
| Windows | 当前 `E_PLATFORM`，待平台专属 registry/Native Messaging 验收；不可声明兼容 |

与本次实现关联的测试，未实际运行前必须标为 `NOT_TESTED`，不得仅凭源码存在评为 95+ 工程验收通过。
