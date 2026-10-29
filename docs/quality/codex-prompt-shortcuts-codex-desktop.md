# ChatGPT（Codex）桌面快捷栏范围接入

日期：2026-10-28。

最新进展见文末“2026-10-29：真实 composer、四项按钮结果与离线收口”。后续真实 execution 已加载专属 Codex paste 候选并取得四项独立全文结果；测试窗口发生外部争用后已停止本任务快捷栏。最后一处占位同文草稿修复未实窗重验，未聚焦追加与完整跟随稳定性仍未通过。以下早期拒绝、沙箱及 strict-only 记录均保留为各自历史范围，不作为当前整体验收结论。

## 需求与本轮范围

用户要求完善 `examples/custom-ui/codex-prompt-shortcuts` 对 ChatGPT（Codex）桌面应用的适配，并澄清目标是在对应窗口位置显示提示词快捷按钮，不是 Codex CLI 或网页。

保持现有五按钮栏、管理器、提示词库与存储协议不变。本轮只补齐桌面目标范围接入，不启用 Codex 自动粘贴，不更改原生 Runtime，也不扩大已有输入资格。

## 已核对事实与缺口

- 本机 `/Applications/ChatGPT.app/Contents/Info.plist` 的 `CFBundleIdentifier` 为 `com.openai.codex`，`CFBundleExecutable` 为 `ChatGPT`，`CFBundleShortVersionString` 为 `26.1023.50603`。这是安装元数据，不是正在运行的窗口或 UI 测量证据。
- 原默认 profiles 已包含 Codex 及其窗口相对布局；无 scope 的跟随代码并非本轮新增。
- `main.js` 在显式 `scope` / `scopes` 模式下将未提供的 profiles 作为空列表交给 registry。旧 registry 只补入 OpenCode / Claude Code，因而仅配置 `profile:"codex"` 会抛出 `Unknown scoped profile`，无法显示栏。这是本轮修复的具体缺口。

## 修改

`targets.js` 对 scope 引用的内置 profile 统一补入：保留其 layout、scene 和 inputMode，将 app 身份绑定到配置的精确 executable。由此 Codex 可使用现有 `getAppWindow` / `watchAppWindow` 跟随链路，不需要复制整个 profile。

只补入实际被引用且尚未显式配置的内置 profile；不扫描其他应用，不覆盖用户同 ID 的自定义 descriptor，不允许把已绑定的 executable 静默扩大为另一路径。原有 Claude Code 场景检查和 OpenCode 输入规则继续由其内置 descriptor 提供。

### 位置合同

- Codex 默认 `sidebarWidth:300,gap:16,top:16,bottom:16,right:16`。
- 未叠加偏移、未被屏幕裁切时，栏的 x 为窗口左边缘 +316pt；y 为窗口顶部 +16pt +（窗口高度 −32pt −实际栏高）/2。
- 沿用现有窗口身份、移动/缩放、换窗、失焦、管理器隐藏/恢复、区域过小隐藏和屏幕裁切逻辑。
- 显式范围的拖动偏移仍使用 profile + executable 身份隔离；不借用旧版全局 Codex 偏移，也不修改用户库 schema。
- 这些是已接受的窗口相对默认值，不是本轮根据真实 Codex AX 输入区测得的位置。侧栏动态宽度、输入区避让与视觉舒适度仍需实窗确认。

显示快捷栏无需读取编辑器或通过输入条件校准。Codex 的 inputMode 仍为 strict；按钮点击沿用写入前拒绝/全文复制兜底，不取得自动输入资格。

## 验证

### 代码及内存回归

新增回归覆盖：

- Codex 单 scope / scopes 可自动补入，精确绑定 executable，保留 strict 和 300pt 侧栏布局，不调用 App。
- Codex 与 Claude Code / OpenCode 混合 scopes 保留各自位置和输入策略。
- 显式 Codex descriptor 的自定义布局不被覆盖，冲突 executable 被拒绝。
- 同一完整业务 `main.js` 的模拟宿主显示五按钮栏，按默认内容区居中；移动/缩放、离开/返回、换窗、管理器开闭和过小窗口后恢复均得到预期状态。没有编辑器快照、输入、全局应用枚举或库写入；停止跟随清理订阅和计时器。

定向回归入口（从仓库根目录执行）：

```bash
node --test tests/custom-ui/codex-prompt-targets.test.cjs tests/custom-ui/codex-prompt-shortcuts.test.cjs tests/custom-ui/codex-prompt-insert.test.cjs tests/custom-ui/codex-prompt-storage.test.cjs
```

最终候选结果：484 项，482 通过、0 失败、2 跳过。两项跳过是依赖外部 Browser model 的可选 oracle，不是 Codex 用例失败。定向 `git diff --check` 通过。

原始 TAP 及入口、适配器和受影响测试的 SHA-256 位于仓库根目录下 `.runtime/tests/codex-desktop-scope-FnWh4TYk/regression.tap`、`candidate.sha256`。这些是 Node 内存回归证据，不是 Runtime 或真实桌面验收。

### 实窗边界

本轮 `ps -axo pid=,comm=` 被当前 macOS 沙箱以 `operation not permitted: ps` 拒绝，未重试或借其他通道绕过。未获取当前主进程 PID，未运行 README 的 Codex scoped 启动命令，未操作或截图 Codex 窗口。

| 交付层次 | 本轮结论 |
| --- | --- |
| 代码已修改 | Codex 显式范围补入及回归已实现 |
| 实际已加载 | 未验证 |
| 视觉已确认 | 未验证，无本候选实窗截图 |
| 功能已验证 | 仅内存模拟；真实显示、跟随及点击未验证 |

历史其他应用或自有窗口证据不替代本候选的 Codex 实窗验收。普通启动方法及 scope 配置见示例 README 的“显式 ChatGPT（Codex）桌面范围模式”；PID 必须由可查询进程的授权桌面环境核对后填写，不能猜测或复用历史 PID。

## 后续真实 UI 验收尝试：CLI 启动前阻塞

用户追加要求以 OpenDesk CLI 截图、获取多个窗口的位置，继续验证真实 UI。本次先核对根启动器和开发构建，再实际运行只读预检，不以 Node 模拟代替桌面。

### 构建核对

- 根 `./opendesk` 仍转发到 `dist/OpenDesk.app/Contents/MacOS/opendesk`；主程序与 `opendesk-ui-host` 构建时间均为本机 2026-10-28 22:40。
- `codesign --verify --strict --verbose=2 dist/OpenDesk.app` 返回 `valid on disk` 和 `satisfies its Designated Requirement`。这只证明当前包签名有效，不证明已加载或有桌面权限。
- 主程序 SHA-256 为 `e7ccda541b9483976261fde0c5baaabaead67f84258f28be97f29703402b97ff`，UI host 为 `44e68f6db6cada6fd7c2de0344a4bfef3fffaddefde7dfe9b7bc2d3d83c98a09`；与既有 `latency-r2/final-provenance.json` 一致。未重建或更改签名。

### 实际调用与错误

从仓库根目录实际执行：

```bash
./opendesk -no-ui -script .runtime/tests/codex-desktop-ui-oZepsdt0/preflight.js -console-mode script -log-dir .runtime/tests/codex-desktop-ui-oZepsdt0/preflight-run
```

预检脚本先检查截图/Accessibility 权限，只有两者明确 granted 后才查找已知 Codex identity、记录各窗口逻辑坐标、核对唯一前台精确窗口，并截图该窗口区域；不激活、不输入、不读编辑器。实际在执行脚本之前即退出，退出码 1：

```text
secure OpenDesk script-instance directory: chmod /Users/shopme/Library/Caches/opendesk/script-instances: operation not permitted
```

这是 OpenDesk 实例锁目录的沙箱写访问阻塞，不是 Codex 窗口定位失败、截图失败或快捷栏布局缺陷。请求这个精确目录的访问被权限工具拒绝，要求用户明确点名授权；未修改沙箱设置、切换其他通道或改写缓存路径绕过。

预检源码、原始 CLI 输出和本候选指纹/状态保存于 `.runtime/tests/codex-desktop-ui-oZepsdt0/` 的 `preflight.js`、`preflight-console.log`、`result.json`。本轮没有取得权限快照、窗口位置或截图，没有启动快捷栏，没有修改用户提示词库；真实加载、视觉与交互仍未验证。先取得该目录的明确授权才可重新尝试；即使目录授权成功，也仍需按实测确认后续桌面权限，不能预先宣布可用。

### 用户授权实例锁目录后的重试

用户随后明确授权本会话访问 `/Users/shopme/Library/Caches/opendesk/script-instances`，目录访问工具已返回 granted。使用同一根启动器和同一只读预检脚本重新实际执行，日志单独保留为 `preflight-authorized-console.log`，没有覆盖首次失败。

此前 `chmod` 错误已消失，但 CLI 仍在脚本加载前退出，退出码 1：

```text
listen for script-instance takeover: listen tcp4 127.0.0.1:0: bind: operation not permitted
```

这是脚本实例接管机制的本地回环 TCP 监听被沙箱拒绝，不是 Codex UI 的错误；`:0` 表示由系统分配临时端口。需要用户在沙箱设置中启用 `sandbox.network.allowLocalBinding: true`，设置可即时生效，无需重启。此次目录授权不包含本地监听权限；未擅自修改该设置、改端口或换通道绕过。状态单独记录为 `result-cache-authorized.json`。窗口位置、截图、快捷栏加载及交互仍未验证，未向 Codex 输入，也未修改用户库。

### 用户声明已启用本地监听后的再次核验

用户声明已启用 `sandbox.network.allowLocalBinding: true` 后，再次实际运行相同预检，仍在脚本加载前以同一个 `bind: operation not permitted` 退出（退出码 1）。原始输出保留为 `preflight-local-binding-console.log`。

随后只读核对相关配置的沙箱标量字段，不输出其他配置或凭据：

- `/Users/shopme/.claude/settings.json` 存在，但没有 `sandbox.network.allowLocalBinding`，也没有误写为顶层点分键的同名字段。
- 当前项目的 `.claude/settings.json` 和 `.claude/settings.local.json` 均不存在。
- 先前环境提供的临时会话配置路径以及标准 managed-settings.json 文件本次均不存在。

这些检查不能证明所有桌面宿主配置来源，也不能据此否认用户在其他界面的操作；只能确认可读文件中未找到该设置，实际命令仍被拒绝。需要核对用户刚修改的配置来源/界面与本会话的实际生效范围，不能机械重复要求开启相同开关。未修改任何设置，未关闭沙箱或切换执行通道。摘要保存为 `result-local-binding-retry.json`；本轮仍无窗口坐标、截图或快捷栏实窗验收结果。

### 2026-10-29：实际合并监听配置并核验桌面权限

用户澄清此前仅点击回复按钮，未实际修改配置；随后明确授权修改 `/Users/shopme/.claude/settings.json`。本次用专用 Edit 仅新增 `sandbox.network.allowLocalBinding:true`，保留其他字段和原有值，不关闭沙箱、不放开其他能力。JSON 解析和预期字段校验通过；未在项目日志中复制完整用户配置或凭据。

重新运行同一个根启动器和预检脚本后，不再出现目录或本地端口绑定错误，脚本已实际加载，说明监听配置对本会话生效。首次跨平台 `page.checkPermissions` 返回空 `os`、`skipped:true` 及 `unsupported`，预检按既定规则停止。源码核对发现该 facade 从 `System.getSystemInfo().os` 判断平台；本次返回值不足以判定 macOS 权限已拒绝或已授予，因此未改写平台信息或绕过判断。

按公开文档另行调用只读 `App.getCapabilities()` 与 `page.checkScreenshotPermissions()`：前者确认 `platform:"darwin"`，后者实际返回：

```text
os: darwin
accessibility: false
accessibilityError: AXIsProcessTrusted returned false
screenCapture: false
screenCaptureError: rect (0.0, 0.0, 2.0, 2.0) does not intersect any displays
```

权限诊断脚本退出码 0 只表示成功取得上述失败状态，不表示 UI 或截图通过。当前 runner 不具备可用的 Accessibility/显示器捕获条件；没有足够证据将原因归结为 Codex、快捷栏位置或单一 TCC 开关。未尝试激活、截图、输入或切换通道绕过；未修改 macOS 权限、应用签名、用户库或其他沙箱配置。Input Monitoring 不属于本次显示/截图验收所需授权，未请求。

本轮原始输出：`.runtime/tests/codex-desktop-ui-oZepsdt0/preflight-config-merged-console.log` 和 `native-permission-console.log`；只读检查脚本为同目录 `native-permission-check.js`；不含用户配置正文的摘要为 `result-config-merged.json`。实际配置合并已完成并生效，但 Codex 窗口位置、快捷栏加载、视觉与交互验收仍未运行，需要具备目标桌面访问的执行环境才能继续。

## 源码与 Git 边界

本轮从现有工作区增量修改；开始时已有多个相关及无关文件的未提交改动，不清理或回退这些内容。未创建/切换分支，未提交或推送。主程序和 UI host 未重建；本轮没有原生修改，也未以现有开发包推断真实加载通过。

## 2026-10-29：本会话复核与未资格化模型修复

### 当前事实与访问边界

工作目录 `/Users/shopme/Documents/workspace/opendesk`，首次观察为 `master`、HEAD `ba7af745c21bccd548aa17c83202a02650bf9856`，含大量暂存的 native、API、示例和测试修改。本轮编辑前保存快照时，共享仓库已由外部操作推进至 `f3c79b04e92ee928ad20378c429c2a8efd2ccb7c`，当时状态干净；结束时 HEAD 仍为该提交，另出现客服示例的并行修改。本次只在指定示例、两个既有测试和说明文件共六个路径上增加未暂存修改，未操作其他内容，没有创建/切换分支、提交或推送。六个文件的 index 均保持与编辑前快照一致，不回退外部 Git 更新。

只读进程查询确认主进程 PID `12898`，实际 executable 为 `/Applications/ChatGPT.app/Contents/MacOS/ChatGPT`，启动时间为本机 2026-10-28 20:29:47。安装元数据分别为：

| 路径 | Bundle ID | 版本 / build |
| --- | --- | --- |
| `/Applications/ChatGPT.app` | `com.openai.codex` | `26.1023.50603 / 22391` |
| `/Users/shopme/Applications/ChatGPT.app` | `com.openai.codex` | `26.1013.40934 / 20770` |

这是当前进程和磁盘安装元数据，不能证明内存映像版本、精确窗口、AX 权限或实际 composer。Computer Use 按 Bundle ID 获取时先报告两份安装歧义；按已核对的系统安装路径获取时明确返回：

```text
Computer Use is not allowed to use the app 'com.openai.codex' for safety reasons.
```

未改试另一份安装，也未通过 OpenDesk CLI、截图工具或其他 UI 通道读取被拒绝的 Codex。用户随后提出可使用 CLI 测量；本会话没有将这一建议解释为绕过明确拒绝的授权。没有运行 README 的 Codex 启动命令，没有发送消息或操作任何真实草稿、剪贴板与提示词库。

### 有源码依据的修复

旧 `editorModel()` 将 Codex 落入 `plain`。默认 strict 不会输入，但显式自定义 paste 加 selector 可以进入普通全文/选区假设，缺少 Codex 的实测依据；原默认路径还以窗口底部相对 hint 筛选输入候选。

- `main.js`：对 canonical `codex` profile、`com.openai.codex` 身份及已知 `ChatGPT.app` 路径明确返回尚未资格化的 Codex 模型，移除 Codex 相对输入区 hint。显示和跟随仍使用原位置合同，五按钮栏、管理器及库协议不变。
- `insert.js`：该模型在任何 target/ref 准备及输入之前返回 `rejected / CODEX_EDITOR_UNQUALIFIED / not_started`；未实现或伪造 Codex AX 全文、空稿、选区、IME 状态或验证成功。主入口保留复制完整 body 并精确读回的兜底。
- 后台不为 Codex prepare ref。管理器明确显示输入尚未资格化；“检查写入条件”在隐藏窗口/等待前拒绝已知 Codex，等待后也重新检查当前目标，切换至 Codex 时不进行指针测量、创建 tracker 或切换复制模式。
- Claude/OpenCode 粘贴实现、精确前台守卫、选区保护、单次派发、目标失效、ref 释放与 unknown 锁止逻辑没有放宽。

任意自定义 ID 加未知 executable 路径无法从静态配置识别为 Codex。这不是新的发现/资格能力；非标准部署路径应保留 `id:codex`，不能通过改名将其声明为 plain。尚未测得的 editorSelector/editorDiscovery 没有填入内置 profile，`inputMode` 仍为 strict。真实 composer 测量和常规插入仍是未完成项。

### 构建来源

根 `./opendesk` 转发到 `dist/OpenDesk.app/Contents/MacOS/opendesk`。本会话重新读取的主程序/UI host SHA-256 分别为 `e7ccda541b9483976261fde0c5baaabaead67f84258f28be97f29703402b97ff`、`44e68f6db6cada6fd7c2de0344a4bfef3fffaddefde7dfe9b7bc2d3d83c98a09`，修改时间均为 2026-10-28 22:40。

`go version -m` 确认二者为 darwin/amd64、`vcs.revision=b7280bef765a4fe5c6076643d5c8313733d39e2b`、`vcs.modified=true`。`codesign --verify --deep --strict dist/OpenDesk.app` 本次通过；现有标识为 `com.opendesk.cli`、ad-hoc 签名、无 TeamIdentifier，本次未改签名或权限。普通 `go` 不在 PATH，读取 build info 使用本机现有 `/Users/shopme/.local/opt/go1.25.13-amd64/bin/go`，未安装工具。

这些是旧脏树配套构建的可核对来源，不证明与当前完整脏树相同或已加载新 JS。没有执行新 native 构建或启动测试 host；真实桌面分支已阻塞，重建不能解除该拒绝。未来恢复实窗验收前仍须重新核对源码/宿主兼容性，必要时使用既有固定构建入口，不沿用本次签名检查冒称通过。

### 回归与证据

从仓库根目录实际执行：

```bash
node --test --test-timeout=10000 tests/custom-ui/codex-prompt-shortcuts.test.cjs tests/custom-ui/codex-prompt-insert.test.cjs tests/custom-ui/codex-prompt-targets.test.cjs tests/custom-ui/codex-prompt-storage.test.cjs
```

最终结果 497 项：495 通过、0 失败、2 项可选 Browser oracle 跳过。新增用例使用真实 `main.js` 与真实 `insert.js`、内存宿主与剪贴板，覆盖默认/显式 Bundle ID override、路径范围、用户目录第二安装路径、自定义 descriptor、strict/paste 拒绝、无 ref 准备、逐字全文复制、已知 Codex 校准拒绝及延时中切换目标。通用校准生命周期测试改用明确的合成应用身份，保留原断言，不再用其假回执暗示 Codex 能力。现有 Claude/OpenCode、窗口跟随、Unicode/光标/选区、unknown 和清理回归继续通过。这些全部是 Node 内存测试，没有桌面、原生 Runtime 或逐字插入的实测结论。

证据根目录为仓库根的 `.runtime/tests/codex-desktop-20261029-static/`：

- `session-boundary.json`、`codex-process.txt`、`provenance-before.json`：拒绝原文、进程与安装/二进制元数据。
- `signature-verify.log`、`signature-details.log`、`main-build-info.txt`、`host-build-info.txt`：签名和构建来源。
- `regression.tap` 是补校准守卫前的首次结果；`regression-r2.tap` 为最终逻辑候选结果，失败记录不被覆盖。
- `candidate.sha256`、`checks.json`、`incremental.diff`：最终文件指纹、静态检查和仅本次增量；`before/` 保留编辑前、HEAD 已为 `f3c79b04` 时的相关文件，不作为源码提交。首轮与结束时的 HEAD 差异单独记入 `session-boundary.json`。

未运行 Runtime API、默认公开启动命令或任何 Codex UI 测试。没有本候选的关键窗口截图。真实显示/布局、移动缩放、切走/返回、管理器、空稿、多行与 Unicode、首尾空白、连续插入、中间光标、非空选区和独立全文读回全部保留为未验证；没有合成桌面内容需要清理。

| 交付层次 | 本会话结论 |
| --- | --- |
| 代码已修改 | 是；修复未资格化模型、猜测 hint 与校准误认路径，保留显示/跟随和复制 |
| 实际已加载 | 未验证；只运行 Node 候选，未启动 Codex 业务入口 |
| 视觉已确认 | 未验证；无本候选 Codex 实窗截图 |
| 功能已验证 | 离线回归通过；真实 Codex 常规插入与全文读回仍因明确访问拒绝而阻塞 |

## 2026-10-29：用户要求继续测试后的补验

本次重新核对实际工作区：HEAD 已由并行任务推进至 `edbeab59c7f340ce747de8dbb3e67406bfed2eeb`，示例及测试候选与上一轮指纹一致；主程序和 UI host 已被并行构建更新，旧二进制指纹不再适用。另有 `pkg/customui/machost/native_darwin.m` 和客服桌面示例修改，本次未改动或重建它们，没有提交、推送或切换分支。

本机正式 Browser model 可读，因此补测此前跳过的 oracle，并运行现有双向迁移集成。从仓库根目录实际执行：

```bash
OPENDESK_BROWSER_MODEL=/Users/shopme/Documents/workspace/opendesk-browser/examples/sidebar-tools/prompt-shortcuts/trusted/model.js node --test --test-timeout=10000 tests/custom-ui/codex-prompt-shortcuts.test.cjs tests/custom-ui/codex-prompt-insert.test.cjs tests/custom-ui/codex-prompt-targets.test.cjs tests/custom-ui/codex-prompt-storage.test.cjs tests/custom-ui/codex-prompt-browser-compat.test.cjs
```

结果 **505 项全部通过，0 失败、0 跳过**。包含 Claude/OpenCode 的空稿、多行/Unicode、首尾空白、连续插入、中间光标、非空选区、未知结果锁止与引用清理，以及正式 Browser model 的备份导入/导出双向兼容。全部为内存依赖测试，不是 Browser UI 或 Codex 桌面实测。

另按已读 `File.read` 公开合同，通过固定根入口实际运行候选 helper 的 OpenDesk evaluator smoke：

```bash
./opendesk -no-ui -script .runtime/tests/codex-desktop-retest-jaBuHf9h/input-policy.js -console-mode script -log-dir .runtime/tests/codex-desktop-retest-jaBuHf9h/runtime
```

实际退出码 0，`status=succeeded`；真实 evaluator 加载当前 `insert.js`，strict/paste 共四次调用均返回 `rejected / CODEX_EDITOR_UNQUALIFIED / not_started`，prepare/dispose 正常结束。应用、AX、键鼠及剪贴板依赖是调用即失败的合成对象，实际调用列表为空。这证明当前候选可由 OpenDesk JS evaluator 加载且拒绝分支无这些副作用；不是实际编辑器输入、主业务 UI 加载或完整 Runtime API 验收。

新证据目录 `.runtime/tests/codex-desktop-retest-jaBuHf9h/`：`regression.tap` 为 505 项完整结果，`input-policy.js` 和 `runtime-console.log` 为实际 CLI 测试源码及输出，`runtime/summary.json` 为执行摘要，`provenance.json` 为测试后源码/二进制指纹与结果边界。当前包再次通过 `codesign --verify --deep --strict`，日志为 `signature-verify.log`；该检查不证明 Codex 桌面权限或 native 源码与运行包完全一致。

本会话已知的 Codex 访问拒绝没有解除，未重新访问或换用 CLI 读取其窗口/截图。主业务入口实际加载、实窗视觉、真实按钮与独立全文读回仍未验证，常规 Codex 插入仍未启用。没有发送消息、操作用户草稿或生产库。

## 2026-10-29：真实 composer、四项按钮结果与离线收口

### 需求、候选与实际加载范围

本段记录后续执行环境中的真实结果，与上文早期受限 execution 分开。目标仍是 Codex 桌面五按钮栏：已聚焦且空选区时原光标插入完整 body，不点击输入框、不移至末尾、不加分隔符；仅未聚焦或非空选区使用末尾追加后备，保留原稿；始终不发送。不改模型/provider/认证、权限数据库或应用签名，不构建、创建/切换分支、提交或推送。

真实测量的应用 PID 为 `12898`，executable `/Applications/ChatGPT.app/Contents/MacOS/ChatGPT`，安装 Bundle ID/版本为 `com.openai.codex / 26.1023.50603`。先经真实“文件 → 新建窗口”创建窗口 `darwin:12898:native:175164`，不同于工作窗口 `darwin:12898:native:171125`。这些 PID/句柄仅为历史证据，下次使用前必须重新核对，不能据此继续输入。

真实入口为仓库 `examples/custom-ui/codex-prompt-shortcuts/main.js`，未替换按钮回调。`toolbar-live-03` 的源码快照和日志记录 main hash `1b36e53c77635e2db5f2892240f37bd7b47bc485527fb15a9d20553835dc223c`；配置使用证据根的 `targets.json` 和隔离 `synthetic-library/library.json`，未使用生产提示词库。实际主程序 PID `92659`、UI host PID `92950`，toolbar native window ID `175283`。目标 bounds `(153,184,1336,817)`、栏 bounds `(469,453,60,280)`，均为逻辑 pt。

已核对的主程序和 host 路径/指纹为：

| 文件 | SHA-256 |
| --- | --- |
| `dist/OpenDesk.app/Contents/MacOS/opendesk` | `1f0bf0ea09cd4b067d941ed05b588c7a9feac339c3cc8fd3a43c61bddb5f0c2d` |
| `dist/OpenDesk.app/Contents/Helpers/opendesk-ui-host` | `556cb5385510bf6f15082d670e844b01da17c858f27fcb420764d7e1db5e9f39` |

当时使用现有 `OpenDesk Local Development` 签名构建，本任务未构建或重签名。`provenance-before-live.json` 是 17:09 的较早源码指纹，不是后续 helper 的加载快照。main 有 execution 源码快照，但外部懒加载的 `insert.js`/`targets.js` 没有同一加载时点的独立 hash；收口指纹只能证明当前字节，不能补造历史加载来源。文首普通无配置一行命令以及 README 占位 scope 命令均未作为本轮原样验收入口。

### Codex 专属普通粘贴模型

- `targets.js`：内置 Codex 显式 `inputMode:'paste'`，只读 discovery 为 `textField / AXTextArea / maxDepth:64`。自定义 descriptor 的默认仍为 strict，显式 override 不被覆盖。
- `main.js`：canonical profile、Bundle ID 和已知 `ChatGPT.app` 路径均接 Codex 模型，不走 plain；移除猜测输入区 hint。稳定窗口可只读预热 ref，目标变化/停止时 dispose；点击消费同一 ref 后仍检查当前精确窗口和编辑器。
- `insert.js`：先取得唯一受管 textField，再要求实际 nativeRole、实测名称（`随心输入` 或 `和 Codex 一起工作`）、enabled、完整 value 与 UTF-16 selection。缺失、歧义、失效或其他名称拒绝，不从搜索框或终端猜 composer。
- 空稿实测 AX value 为 `随心输入\n`，selection `{location:0,length:0}`；非空 value 在四项测试中与独立 Copy 全文相等，保留多行、首尾空白、emoji 与组合字符。普通 paste 接受真实 `composition:'unknown'`，没有改成 inactive；active 或非空 marked range 仍停止。
- 聚焦空选区只粘贴一次 body，派发前重读原稿/选区、复核前台及剪贴板，写后比较完整 AX value。业务插入不为回执全选/Copy 或移光标；独立验收控制器才在按钮完成后核对全文。
- 后备路径只在必要时点真实 composer，读回焦点并折叠到完整草稿末尾；非空原稿加 `\n\n` 后追加。不以“选区已折叠”替代末尾位置证明。可能输入后失败、超时或 unknown 时锁止，保留剪贴板，不重试 paste；仅 `rejected / not_started` 可复制全文兜底。
- strict 仍在 target/ref 前拒绝为 `CODEX_EDITOR_UNQUALIFIED / not_started`，不伪称编辑器内部定向事务或并发隔离。

### 四项真实按钮结果：局部通过，不是整轮 succeeded

证据根均相对于仓库根：`.runtime/tests/codex-desktop-session-20261029/`。

| 真实按钮场景 | 独立 AX 全文 | 独立 Copy 全文 | 证据 |
| --- | --- | --- | --- |
| 聚焦空稿，完整多行/Unicode/首尾空白 body | 逐字相等 | 逐字相等 | `isolated-real-buttons-01`，`AX_COMPARISON` / `FULL_TEXT_COMPARISON` 第一组 |
| 连续插入，不附加分隔符 | 逐字相等 | 逐字相等 | 同 run 第二组 |
| 中间 caret 原位插入，前后稿件保留 | 逐字相等 | 逐字相等 | `isolated-real-buttons-02` 第一组，原 UTF-16 caret 为 22 |
| 非空选区不替换，改为末尾追加 | 逐字相等 | 逐字相等 | 同 run 第二组，原 selection `{0,3}`，最终长度 104 |

正式四个 callback 的 verified 阶段分别约 865、1573、754、1309ms；这是按钮回调至读回阶段，不是首次可见帧或稳定性能承诺。toolbar 初次 shown/confirmed 约 824/1077ms，也不能称为 500ms 内全通过。

`isolated-real-buttons-01` 在前两项通过后因中间 caret 准备不符停止；`-02` 修正准备后完成后两项，随后因未能建立失焦状态停止。两份 summary 均保留 failed，不能把局部全文通过改写为 controller 全轮通过。点击空白处及 Tab 未建立真实 unfocused 状态，**未聚焦 → 聚焦 → 末尾追加没有完成真实按钮验收**。

`isolated-buttons-partial.png` 目视确认五按钮栏完整可见，位于目标内容区，四项后的合成稿显示在 composer，没有发送。用户随后提供的同状态截图与其一致。`manager-visible.png` 和用户管理器截图确认双栏、输入区和操作按钮可读，但顶部仍为旧版“Codex 输入尚未资格化”；这是更早版本视觉证据，不证明当前 paste 文案已实窗加载。当前五按钮栏视觉成立，不外推所有尺寸/布局或最终 helper 的功能资格。

### 外部争用和来源未明的额外点击

原生 UI 协作锁没有形成真正独占。`isolated-real-buttons-05` 于 **18:00:23 +08:00** 在测试窗口读到约 1599 UTF-16 单元、非本轮合成稿的长草稿。控制器在精确 owned-draft 门禁处停止，没有执行本轮拟定的第五个提示词按钮，也没有清理或覆盖该稿；不在质量文档传播其正文。窗口 `175164` 自此不能继续视为测试专用，旧 `isolated-owned-draft.json` 不能作为清理依据。

终止后复核 `toolbar-live-03/stdout.log` 发现控制器停止后仍有额外 callback，**来源未核实**：

| 时间（+08:00） | callback | 业务日志结果 |
| --- | --- | --- |
| 18:00:50 | `codexui_test01` | `STALE_TARGET / rejected / not_started`，随后全文复制兜底 |
| 18:00:55–56 | `codexui_test02` | `VERIFIED_PASTE / acknowledged` |
| 18:00:58–59 | `codexui_test01` | `VERIFIED_PASTE / acknowledged` |
| 18:01:01 | `codexui_test01` | `VERIFIED_PASTE / acknowledged` |

这些不属于上述四项正式控制器动作，没有独立全文 Oracle，不纳入通过计数。因存在三次额外成功回执，不能声称外来草稿在争用期间始终未变；只可确认 `-05` 自身在其门禁处停止。没有证据归属这些点击，不猜为用户或其他任务。

已按命令和父子关系核对后 TERM 本任务 PID `92659`，execution 于 **18:01:07** 为 canceled，清理计数归零；`92659/92950` 此后均不存在，离线收口时再次只读核对亦无这两个 PID。未结束其他 `/Applications/OpenDesk.app` host，未重启本任务栏、关闭现有聊天或清理任何不匹配草稿。桌面输入暂停；接续必须先协调真正可独占的时段，再新建并预检窗口，不能继续使用这个已争用的测试窗口。

### 离线修复、回归与候选版本边界

收口时只读核对当前 `master` 为 `a4a14c4b64b2b2938c2ae4ca8b54ceca971ac03d`，不同于 live 时观察到的 `edbeab59`。这是共享仓库外部推进，本任务没有 reset、切分支、提交、推送或回退并行修改。收口期间，外部操作又把部分相关文件暂存，形成 `M `/`MM` 状态；本次未执行 add/restore/unstage，不调整别人的 index。最后观察的主程序/host 指纹也变为 `35c0bf6119191dc0393114e68ade3da06b677fd3051fcda01fa56b2ade158ef2` / `30235bb399587adc397f26846c4e62d00b1fc06292c177134694f906d683383f`。本任务未启动这份新包，其来源/兼容性未重新资格化；旧 live 结果不能迁移到新二进制。

本次额外修复一个确定的误拒绝：真实草稿恰为“占位名称＋LF”时，末尾可能是完整 raw.length，而不是空占位的 0；后备验证现允许这两个有依据的端点，仍拒绝其他 collapsed 位置并核对空占位的 Right 边界。该改动仅在 Node 模拟验证，**最终 insert.js 字节没有实窗重载/重验**，不能继承四项实窗结论。若真实同文草稿恰在 caret 0，AX 预读仍无法与空占位区分；后置接受保留原文的结果或实测空稿结果，此歧义不宣称已消除，普通 paste 仍无并发隔离保证。

测试更新保留原安全断言：strict 无 IO 拒绝；Codex 两个名称、空稿/同文真稿、多行/Unicode/首尾空白、连续/中间 caret、非空选区、未聚焦模拟；派发前草稿/选区变化、错误 nativeRole、active/marked IME、末尾不完整、错误/未变 readback、timeout 单次派发和锁止；深度 64、默认/override/profile/path 接线、ref 清理、main 全局 unknown 锁止与全文复制。既有 Claude/OpenCode、存储和 Browser 兼容覆盖保留。

从仓库根目录实际运行（纯 Node，**不启动桌面**）：

```bash
OPENDESK_BROWSER_MODEL=/Users/shopme/Documents/workspace/opendesk-browser/examples/sidebar-tools/prompt-shortcuts/trusted/model.js node --test --test-timeout=10000 --test-reporter=tap tests/custom-ui/codex-prompt-shortcuts.test.cjs tests/custom-ui/codex-prompt-insert.test.cjs tests/custom-ui/codex-prompt-targets.test.cjs tests/custom-ui/codex-prompt-storage.test.cjs tests/custom-ui/codex-prompt-browser-compat.test.cjs
```

最终结果与指纹见证据根的 `closeout-final.tap`、`closeout-evidence.json`。基线 `closeout-baseline.tap`（20 失败，主要为旧 Codex 拒绝策略断言）和首轮 `closeout-r1.tap`（1 失败，测试替换 helper 晚于预热绑定）保留，未覆盖。后续 `closeout-r2.tap` 为 535 项通过；追加同文草稿 caret 0 的保护用例后最终为 **536 项全部通过，0 失败、0 跳过**。`node --check insert.js` 和定向 `git diff --check` 通过。这些不证明原生 Runtime、Browser UI 或 Claude/OpenCode 的本轮桌面重验。

### 四层交付状态及剩余验收

| 层次 | 本次结论 |
| --- | --- |
| 代码已修改 | 是；Codex paste 专属模型、末尾保护、占位同文草稿修复与定向回归/文档已更新 |
| 实际已加载 | live-03 已实际加载真实 main 和当时 helper；最终 helper 的同文端点修复未重载，历史 helper 加载指纹不完整 |
| 视觉已确认 | live 五按钮栏及四项后合成稿已确认；管理器仅旧文案截图，最终 paste 文案未实窗确认 |
| 功能已验证 | 四项真实按钮有独立全文证据；536 项依赖模拟通过；整体未完成 |

仍未通过：未聚焦真实按钮追加、最终同文端点修复实窗重验、管理器新模式文案、完整移动/缩放/换窗/切走返回稳定性、IME/并发/重建/unknown 真实场景。无需为这些缺项重复改模型、构建或权限；先解除桌面争用，固定新候选源码/依赖和独占窗口，再只补未完成项。未提交、未推送。
