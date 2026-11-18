# 通过 MCP 发现与调用 Runtime API

本轮深度修复、固定评分与实测边界见 [2026-11-18 Runtime 深度验收](../../quality/mcp/2026-11-18-runtime-depth.md)。异常回归、双路径安装和仍受现场条件限制的项目见 [MCP 异常边界台账](../../quality/mcp/2026-11-18-completeness-boundaries.md)。目录与阅读包验证覆盖可发现和可读性，方法运行结果须另行验证。

固定桌面、视觉、Recorder 和 Browser 工具继续使用原有调用方式。高级 API 可先按能力组发现、取得选中方法完整契约，再在宿主已开启的普通 JavaScript execution 内调用。

## 本地宿主配置

工作目录为仓库根目录；先构建当前源码的 `dist/opendesk-mcp`。仅连接可信本地客户端时可启动：

```bash
./dist/opendesk-mcp --api-docs-root="$PWD" --allow-script-execution --script-capabilities=sqlite
```

`--api-docs-root` 必须是包含当前 `scripts/api-docs*.js`、`docs/api/` 和 `types/` 的可信 checkout 绝对路径，并需要 PATH 中的 Node.js。文档目录和执行二进制应来自同一源码版本；返回的来源哈希可识别未提交内容。没有配置时不暴露 `tm_api_catalog` / `tm_api_read`，`tm_runtime_capabilities` 会报告未配置。

`toolchain` 同时记录实际加载 reader/map/adapter 的内容身份；加载后发生变化会整包拒绝。
`provenance` 区分二进制构建信息与绑定 checkout：已知 Git revision 不同会报告 mismatch；
信息缺失或同 revision 的未提交构建仍不能证明 Runtime 与文档一致，`runtimeMatchVerified` 保持 `false`。
文档哈希、packet 校验和构建 SHA 各自说明不同来源事实，不能互相替代。

`--allow-script-execution` 默认关闭；只有显式开启才暴露三个脚本工具。普通脚本可访问 Runtime 的基础文件、网络与桌面能力，**不是沙箱**，`Execution.workdir` 也不是文件隔离根。不要将该选项加入现有受限远程 Tunnel 配置。

`--script-capabilities` 是宿主启动时的额外授权列表：`command`、`download`、`webhook`、`accessibility`、`sqlite`、`custom-ui`、`native-extensions`。省略则全部关闭。授权只影响对应 `execution.Request`，不证明平台、系统权限、UI host、插件或 provider 配置可用。`tm_runtime_capabilities.scripts.capabilities` 中的布尔值只表示这份授权。
`conditionalCapabilities` 对 `custom-ui` 和 `native-extensions` 分别返回同义的 `enabled`、
`checked: false`、`requirements` 与 `inspect`，不伪造 `available`：该工具没有启动 UI host、
扫描插件或测试插件方法。客户端请求和脚本均不能修改这些开关。MCP execution 的环境快照始终为空，不自动读取 `.env` 或继承本地 CLI 环境。

`--read-only` 拒绝脚本执行配置；可配合文档阅读，但不能运行任意 JS。Native 文件四工具模式及 nonce 文件测试模式拒绝混用上述新选项，保留各自独立 surface。

## 本地 CLI 安装

从仓库根目录先构建并测试候选，再更新 `dist/opendesk-mcp` 与当前用户 PATH 中的
`$HOME/.local/bin/opendesk-mcp`。每个目标使用同目录 staging、chmod、文件 fsync、原子 rename；
替换前核对当前 hash 并另存旧版，替换后核对候选 hash。两处替换是各文件原子的，
不构成跨目录事务；第二处失败时仅在第一处仍是本次候选的条件下回滚。
保留安装回执、源码快照和实际安装路径的复验结果。不要覆盖其他任务刚更新的版本。

Host 使用安装后的绝对路径，仍显式传入上述文档根目录和授权 flags。安装 CLI 不会改写现有 Host/Tunnel 配置，也不会让运行中的旧进程自动加载新二进制。此安装只交付 MCP CLI；Custom UI host、Native Extension bundle 等配套资源仍按各自正式构建/安装入口提供，不能从 CLI 复制成功推断它们可用。

Runtime 还会加载 `polyfills/` 与 `jslibs/` 的外部 JavaScript；MCP CLI 单文件复制不构成完整独立发行包。
复验时应保留兼容的资源目录，并从 execution 的 `events.ndjson` 核对实际解析路径与资源哈希。
候选、仓库 `dist` 和用户 PATH 分别用绝对路径启动新 stdio 进程，核对二进制、文档 checkout 与外部资源来源。

普通 MCP execution 获得 `custom-ui` 授权后，可用 `ui.getCapabilities()` 做不创建窗口的诊断。
默认 host 搜索相对于当前 MCP executable，安装到 `~/.local/bin` 不会自动复用 `/Applications/OpenDesk.app` 的 helper；
文件存在性检查也不代替协议握手、方法能力或真实视觉验收。获准使用 `native-extensions` 时，
`NativeExtensions.list()` / `diagnostics()` 只发现受控 roots 中的 bundle；空 registry 不能称为插件方法可用，
非空 registry 也不证明方法运行成功。不要为消除这些限制自动复制旧 helper、改签名、重启 GUI 或更改远程 Tunnel。

从安装路径复验同一真实协议 gate：

```bash
OPENDESK_MCP_BINARY="$PWD/dist/opendesk-mcp" node --test tests/mcp/advanced-runtime.test.js tests/mcp/runtime-contracts.test.js tests/mcp/runtime-provenance.test.js
OPENDESK_MCP_BINARY="$HOME/.local/bin/opendesk-mcp" node --test tests/mcp/advanced-runtime.test.js tests/mcp/runtime-contracts.test.js tests/mcp/runtime-provenance.test.js
```

## 工具与结果

| 工具 | 参数 | 结果与边界 |
| --- | --- | --- |
| `tm_runtime_capabilities` | `{}` | 本会话的宿主授权与资料连接状态、普通 execution 限制；不扫描桌面、不运行脚本 |
| `tm_api_catalog` | `{group?}` | 无 group 时列全部能力组；指定 group 时返回从 canonical Reference/类型即时生成的目录 |
| `tm_api_read` | `{doc, selector, withTypes?}` | `output` 为完整阅读包；`report` 为同次读取的哈希/来源范围/字节计数；`toolchain` 标识 reader/map/adapter 内容 |
| `tm_script_start` | `{script, input?, timeoutMs?}` | 异步受理一次普通 `.js` 源码，返回 `executionId`；受理不表示成功完成 |
| `tm_script_status` | `{executionId}` | 当前或最终 `result` 与 `summary`，包含真实 console 日志、错误和 artifact 路径 |
| `tm_script_cancel` | `{executionId}` | 请求取消；随后用 status 等待终态；不会回滚已经发生的动作 |

新增工具均拒绝未知参数。脚本最大 128 KiB；`timeoutMs` 是 1–300000 的整数，默认 30000。一次最多一个活跃脚本，历史有界；ID 只属于创建它的服务会话，不能访问其他 execution。调用方不能指定脚本文件、环境、工作目录、任意输出路径或 per-request 能力。

Runtime 沿用普通 `.js` 顶层 `await` 和资源生命周期。JavaScript 的 `return` 不作为公开结果导出；需要结果时使用 `console.log(JSON.stringify(value))`，再读取 `summary.scriptLogs`。`input` 保留 JSON 类型，包括显式 `null`，最大 128 KiB；inline 的 `Execution.scriptPath` / `scriptDir` 为 `null`。运行产物在启动工作目录的 `.runtime/mcp/` 下，可能包含脚本快照和日志，不应提交。每个服务会话最多受理 64 次脚本，达到上限时明确拒绝，需另启服务会话。

`running` / `pending` 是非终态；`succeeded`、`failed`、`timed_out`、`canceled` 为终态。失败终态在 MCP result 中标 `isError: true`；schema 参数类型、未知字段及未知工具错误是 JSON-RPC `-32602`，运行层的越界 deadline、空脚本、busy 和未知 executionId 则是 `isError: true` 的工具错误。发现资料、执行结果与完整 MCP frame 均有预算，超过预算整包失败，不返回截断的成功合同或部分成功日志。日志摘要仍由既有 Runtime 在内存中收集，响应预算不是进程内存沙箱。

脚本错误与摘要写盘错误同时发生时，status 保留原失败终态和两类错误；写盘失败不会让任务永久保持 running，也不会阻塞下一次受理。本地摘要文件可能缺失或只包含写盘失败前的信息，应以该会话的 status 响应核对完整错误。

stdin EOF 会请求取消，并最多等待 10 秒让本服务脚本资源清理；未收口时以错误退出，不能据此声称 native 动作已停止。`tm_script_cancel` 才是已受理 execution 的停止入口；不能通过取消原本已返回的 start 请求来停止脚本。已进入 native/操作系统的动作不保证硬中断，取消与自然完成竞态时保留真实终态。结果未知时停止，不自动重试动作。

## 最小调用链

通过 MCP 客户端顺序调用：

```json
{"name":"tm_api_catalog","arguments":{"group":"data"}}
```

```json
{"name":"tm_api_read","arguments":{"doc":"file","selector":"File.readJSON","withTypes":true}}
```

接收 packet 后核对 `report.packetSha256`、字节/字符数及当前来源。保存正文和 report 后可用
`node scripts/api-docs.js verify <packet.md> <report.json>` 复核完整账本；JSON 对象键经过 transport 重排不会造成误拒绝，
数组顺序、来源哈希、依赖范围或其他计划值改变仍会拒绝。不能只检查结束标记。
阅读工具返回错误、必需类型缺失或验证未通过时，在调用前停止。先恢复可信 checkout 并重新读取完整 contract。

阅读完整 packet 后，调用已授权业务所需的方法，例如纯路径计算：

```json
{"name":"tm_script_start","arguments":{"script":"console.log(JSON.stringify({path: path.resolve('data'), input: Execution.input}));","input":{"requestId":"example-1"},"timeoutMs":5000}}
```

用返回的实际 `executionId` 调用 `tm_script_status`；业务后置条件仍由调用方验证，不能由预期值代替。文档内容和示例仅是数据，不因阅读而获得执行授权。

## 当前公开能力的覆盖边界

| 能力族 | MCP 路径 | 条件／未覆盖边界 |
| --- | --- | --- |
| App/window/page、UI Locator、Geometry、Vision/Screen、输入/剪贴板/事件 | 原专用工具或普通脚本 | 保留目标作用域、结果未知停止、系统权限及各方法平台约束；专用 guard 不自动套用到任意 JS |
| File/path、AppStorage、内置数据处理库、执行上下文/计时 | 普通脚本 | File 不是受限文件桥；生命周期和写入提交语义见 canonical Reference |
| SQLite、Command、下载、Webhook | 普通脚本＋对应宿主授权 | 默认禁用；SQL 保护路径、子进程取消、下载提交与 loopback listener 限制不变 |
| Accessibility、UI 原生菜单 | 普通脚本＋`accessibility` | Experimental，另需平台及系统 AX/UIA 权限；opaque ref 只能留在原 execution 中 |
| 小写 ui、Dialog、自定义窗口 | 普通脚本＋所需 `custom-ui` | 另需兼容 UI host、系统会话与方法能力；本轮未做真实窗口视觉验收 |
| HTTP/axios | 普通脚本 | 基础请求不要求模型 provider；遵守超时、取消、响应上限与网络授权；下载另需 `download` |
| LLM/Agent、Audio/Sound | 普通脚本 | 分别依赖 provider/profile 或音频设备与权限；本轮没有发送模型请求或真实录音/播放 |
| NativeExtensions | 普通脚本＋`native-extensions` | 仅原受控 roots 和 manifest registry；不开放 unsafe `NativeExtension.call` |
| BrowserDOM | 原 `tm_browser_*` 工具 | 继续要求固定 Core、origin/tab 和 execution 身份，不从通用脚本绕过网站授权 |
| Recorder | 原 `tm_recorder_*`，或普通脚本处理保存的数据 | 不通过新入口授予全局 Recorder capture；不改变 Human lineage |
| automation.app、Flow、CLI/HTTP/Scheduler、打包/分发 | 各自原有入口；资料可发现 | 不是普通 JS 中无条件可用的方法；不注入 AppShell、安装 Flow 上下文或执行发布 |

此表是 transport 与授权边界，不是另一份方法数据库，也不是“全部接口真实调用通过”的证明。方法详情始终读取现有 canonical Reference。

## 维护验证

从仓库根目录，使用当前源码构建的 MCP binary：

```bash
OPENDESK_MCP_BINARY="$PWD/dist/opendesk-mcp" node --test tests/mcp/advanced-runtime.test.js
```

方法契约与独立文件/loopback fixture 的正式验收：

```bash
OPENDESK_MCP_BINARY="$PWD/dist/opendesk-mcp" node --test tests/mcp/runtime-contracts.test.js
```

安装路径复验时把上述二进制设为 `$HOME/.local/bin/opendesk-mcp`。该 gate 使用 `tests/runtime-api/mcp-*.js`，
只在本任务 `.runtime` fixture、纯数据、只读系统查询、显式授权的随机 loopback listener 与无输入资源诊断内运行。
HTTP fixture 由宿主独立记录请求；文件结果由宿主独立读取。权限申请、真实窗口、音频、外部模型及插件方法不在这个 gate 中。

原有 gate 通过真实 stdio 和 Runtime 运行 `tests/runtime-api/mcp-advanced.js`，证据放在 `.runtime/tests/mcp-advanced/`。其与既有 MCP 回归、文档检查的实际结果见 [目标与质量记录](../../quality/mcp/2026-11-18-runtime-api-coverage.md)。只运行离线 adapter 测试不能代替真实执行 gate。

本轮深度 gate 可从仓库根目录一次执行：

```bash
OPENDESK_MCP_BINARY="$PWD/dist/opendesk-mcp" node --test tests/mcp/runtime-download.test.js tests/mcp/runtime-network-depth.test.js tests/mcp/runtime-persistence.test.js tests/mcp/runtime-provenance.test.js tests/mcp/runtime-stream-depth.test.js tests/mcp/runtime-image-depth.test.js tests/mcp/runtime-file-open-depth.test.js tests/mcp/runtime-data-boundaries.test.js
```

这些场景分别核对文件字节和摘要、独立 HTTP caller/连接、外部 SQLite 重开、来源攻击、流终态及手工构造的图像 oracle。
跨宿主上下文回归使用专用测试宿主，所有公开行为断言仍在正式 Runtime JS：

```bash
GOARCH=arm64 CGO_ENABLED=1 go build -o .runtime/tests/mcp-depth/runtime-context ./tests/mcp/tools/runtime-context
OPENDESK_CONTEXT_HOST_BINARY="$PWD/.runtime/tests/mcp-depth/runtime-context" node --test tests/mcp/runtime-context-depth.test.js
```

专用宿主只绑定 execution workdir 与合成环境，不提供桌面 adapter。它不增加生产 CLI 参数或请求级上下文权限。
UI perception 的模拟回归和 App Shell memory-driver 回归是离线契约证据，不是实际桌面输入、窗口或视觉验收。

FloatingWindow 的在途创建/关闭使用独立受控宿主，避免创建真实窗口：

```bash
GOARCH=arm64 CGO_ENABLED=1 go build -o .runtime/tests/mcp-depth/floating-host ./tests/runtime-api/tools/floating-lifecycle
OPENDESK_FLOATING_LIFECYCLE_HOST_BINARY="$PWD/.runtime/tests/mcp-depth/floating-host" node --test tests/runtime-api/floating-window-close.test.js
```

该宿主通过既有 Custom UI driver 接口绑定 gated MemoryDriver，并在 Runner 清理前由独立 driver 记录核对关闭状态、Show 调用和 sink。
场景包括创建已交付资源、首次 State 被取消、独立清理 Close 超时、显式 close 失败重试及 teardown 回收；
正式 JS 同时断言拒绝消息包含原始原因与 cleanup 失败。失败清理不释放仍存活资源的所有权或 ID。
该宿主不是生产 CLI 参数或原生 UI 可用性证明；race 验证应先成功构建同一宿主的 `-race` 版本，再用相同 gate 运行。
App/Notifications 与 window.activate 的私有 deadline seam 仅属于 E2，不计入公开 Runtime live 覆盖。
固定评价、完整候选/安装复验命令与本轮修复见 [深度质量记录](../../quality/mcp/2026-11-18-runtime-depth.md)。
