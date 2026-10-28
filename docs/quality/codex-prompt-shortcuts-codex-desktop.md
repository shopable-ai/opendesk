# ChatGPT（Codex）桌面快捷栏范围接入

日期：2026-10-28。

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
