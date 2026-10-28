# OpenDesk 提示词快捷栏

从仓库根目录 `/Users/shopme/Documents/workspace/opendesk` 启动**真实业务入口**：

```bash
./opendesk -ui -script examples/custom-ui/codex-prompt-shortcuts/main.js -console-mode script -log-dir .runtime/examples/custom-ui/codex-prompt-shortcuts
```

需要可见的 macOS 桌面及已准备好的配套开发构建。发行安装包不附带 `examples/`；构建由维护者准备。运行后窗口持续打开，直到选择“退出”。已有本入口运行时使用现有窗口，避免同时打开多个管理器。

快捷栏支持配置 **ChatGPT（Codex）桌面应用、Claude 桌面 Code 工作区和 OpenCode**。本轮补齐 Codex 的显式进程范围接入，用于在其窗口内容区显示同一套五按钮栏；不新增 CLI 或网页入口，也不要求先校准输入框才能显示。Codex 继续使用严格拒绝/全文复制策略，不因位置适配而放开自动输入。Claude / OpenCode 的常规桌面粘贴及真实按钮链路见 [输入适配记录](../../../docs/quality/codex-prompt-shortcuts-input.md)；Codex 本轮代码与未完成实窗验收见 [桌面跟随适配记录](../../../docs/quality/codex-prompt-shortcuts-codex-desktop.md)。

本机根目录 `opendesk` 是转发到 `dist/OpenDesk.app/Contents/MacOS/opendesk` 的构建启动脚本，`dist/opendesk` 也指向同一主程序。维护者应先核对实际入口；不能以其他二进制的运行结果替代本命令。

## 显式 ChatGPT（Codex）桌面范围模式

本机已从 `/Applications/ChatGPT.app/Contents/Info.plist` 核对应用身份：Bundle ID 为 `com.openai.codex`，executable 为 `ChatGPT`，版本为 `26.1023.50603`。这里的 ChatGPT（Codex）是该桌面应用，不是根据窗口标题匹配，也不等同于其他标识的 ChatGPT 客户端。

在仓库根目录的 `.runtime/examples/custom-ui/codex-prompt-shortcuts/codex-scoped.json` 保存配置，将 `12345` 替换为你已核对的当前主进程 PID：

```json
{
  "schemaVersion": 1,
  "scope": {
    "pid": 12345,
    "exePath": "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT",
    "profile": "codex"
  }
}
```

配置准备好后，从仓库根目录 `/Users/shopme/Documents/workspace/opendesk` 执行：

```bash
OPENDESK_SHORTCUTS_TARGET_CONFIG=.runtime/examples/custom-ui/codex-prompt-shortcuts/codex-scoped.json ./opendesk -ui -script examples/custom-ui/codex-prompt-shortcuts/main.js -console-mode script -log-dir .runtime/examples/custom-ui/codex-prompt-shortcuts
```

内置 `codex` profile 现在可像 `claude-code` / `opencode` 一样由 scope 自动补入，无需复制整个 `profiles`。只观察配置的精确 PID/executable，接入现有原生窗口变化提示和前台守卫；移动、缩放或更换窗口时重新定位，切走、窗口不可用或区域放不下时隐藏。打开管理器时隐藏，关闭管理器后恢复；拖动位置按应用身份保存。显示栏不读取编辑器，也不取得自动输入资格。

默认位置沿用已接受的布局：窗口左边缘 +316pt（300pt 侧栏 +16pt 间距），上下各留 16pt，五按钮栏在剩余高度内垂直居中；用户拖动偏移和屏幕裁切继续生效。它不是根据当前 Codex AX 树测量的位置，动态侧栏宽度或输入区避让尚未实窗确认。提示词库为空时先显示管理器，保存至少一条启用的提示词并关闭管理器后体验按钮。

与 Claude / OpenCode 共用时，在已有配置的 `scopes` 数组中追加这个完整条目，不要同时保留 `scope`；无需改动提示词库。PID 重启后需更新配置，再关闭/开启跟随重载。显式自定义 `profiles` 中已有的 `codex` descriptor 优先，不被内置规则覆盖。当前环境受沙箱进程查询限制，未运行该命令或确认真实窗口画面；下面的 Node 回归不替代实窗验收。

## 显式 OpenCode 范围模式

只观察已核对的 OpenCode 进程时，使用现有配置入口。先在仓库根目录的
`.runtime/examples/custom-ui/codex-prompt-shortcuts/opencode-scoped.json` 保存：

```json
{
  "schemaVersion": 1,
  "scope": {
    "pid": 12345,
    "exePath": "/Applications/OpenCode.app/Contents/MacOS/OpenCode",
    "profile": "opencode"
  }
}
```

`12345` 和 executable 路径均是占位值，使用前须核对并替换；路径必须精确指向运行进程的 executable，不能填 `.app` 目录。配置准备好后，从仓库根目录 `/Users/shopme/Documents/workspace/opendesk` 执行这一行：

```bash
OPENDESK_SHORTCUTS_TARGET_CONFIG=.runtime/examples/custom-ui/codex-prompt-shortcuts/opencode-scoped.json ./opendesk -ui -script examples/custom-ui/codex-prompt-shortcuts/main.js -console-mode script -log-dir .runtime/examples/custom-ui/codex-prompt-shortcuts
```

此模式通过 `window.watchAppWindow({pid,exePath}, callback)` 接收指定进程的原生变化提示，再用 `window.getAppWindow({pid,exePath})` 重新核验；通知本身不能证明前台或 Code 场景。原生监听不可用时记录原因并回退到 250ms 守卫，移动提示合并处理。查询在后台串行执行，静止已显示时跳过重复完整场景同步；不调用 `App.get/list`、全局 `getActiveWindow/current`，也不订阅全局 Events。关闭跟随、退出或运行结束会清理订阅和轮询；非目标前台、窗口消失时隐藏，权限/身份错误不走全局后备。切换到快捷栏自身焦点也不会借全局观察保留目标。进程重启后须核对并更新配置中的 PID，然后关闭并重新开启跟随以重载范围；旧订阅的迟到结果不能接管新范围。

内置 `opencode` profile 提供窗口四周 16pt 的放置边距，以深度 24 查找唯一 AXTextArea，并显式设置 `inputMode:'paste'`。输入框名称可随语言变化，不固化本机“提示词”作为跨语言标识。也可在同一配置的 `profiles` 中提供已有格式的 descriptor，并让 `scope.profile` 精确引用其 ID；未知 profile 拒绝启动。显式范围优先于库内 Bundle ID 设置，不因保存该设置切回全局。没有 `scope` 时保留原兼容模式和五按钮界面。

插入发现、只读校准和 inserter facade 使用同一范围。常规输入使用现有键鼠和剪贴板 API，不启用 `prepareTextAppend`；焦点输入收到粘贴回执并观察到编辑器变化后提示“已粘贴”，不冒称逐字验证。确认尚未开始输入时可回退全文复制；动作结果不明确时停止并保留剪贴板。支持结构化输入的宿主还可传 `Execution.input.scope`，但不能同时在配置中再传 scope；当前 `-script` 启动使用上述配置方式。

多个已核对应用可使用 `scopes` 数组替代 `scope`（二者互斥，最多 16 项）；每项仍完整提供 `pid`、`exePath` 和 `profile`。每轮只查询这些明确配置的进程，不发现其他应用。切换应用或窗口时丢弃旧输入区引用，两个应用在一次扫描中都声称前台时隐藏栏并重新核验。仅提供配置不表示该应用已通过适配验收。

各应用拖动偏移保存在 `settings.positions`，键由 profile 与稳定 executable 身份组成；重置只影响当前应用。旧版 `offsetX/offsetY` 保留供兼容模式使用。拖动停止 160ms 后才准备保存，并再次核对目标、原生最终位置和当前拖动版本；旧帧或已失效目标不写入。保存不弹出遮挡操作的提示。

跟随性能和双应用位置的历史验收见 [R22 记录](../../../docs/quality/codex-prompt-shortcuts-r22-follow.md)，本轮事件驱动与后台查询优化见 [R23 记录](../../../docs/quality/codex-prompt-shortcuts-r23-follow.md)。跟随验收不代表安全追加完成；并行输入适配另行记录。

同一目标窗口的聚焦或布局变化只触发重新核验，不再直接隐藏并重开快捷栏；真正切走、换窗或离开合格页面仍隐藏。按钮输入期间保留轻量前台守卫，场景重查合并到输入结束后。修复方案、并发回归及实际加载/视觉验收边界见 [闪烁修复记录](../../../docs/quality/codex-prompt-shortcuts-flicker.md)。

验收可用 `OPENDESK_SHORTCUTS_LIBRARY_DIR` 指定独立的绝对库目录。此入口不扫描或迁移默认库及旧库；不设置时仍使用下文固定用户目录。先在独立目录准备合成 `library.json`，再从仓库根目录执行：

```bash
OPENDESK_SHORTCUTS_TARGET_CONFIG=.runtime/tests/codex-prompt-shortcuts-r20/opencode-scoped.json OPENDESK_SHORTCUTS_LIBRARY_DIR=/Users/shopme/Documents/workspace/opendesk/.runtime/tests/codex-prompt-shortcuts-r20/synthetic-library ./opendesk -ui -script examples/custom-ui/codex-prompt-shortcuts/main.js -console-mode script -log-dir .runtime/tests/codex-prompt-shortcuts-r20/direct-04
```

该命令依赖本机已核对的配置和合成库文件；它不是通用安装后的即用命令。OpenCode 历史证据与当前 Claude 的构建、加载、视觉和功能边界分别记录于 [R21 验收记录](../../../docs/quality/codex-prompt-shortcuts-r21-claude-code.md)。

## 显式 Claude Code 范围模式

本轮已核对 `/Applications/Claude.app` 4.29.0 的真实桌面 Code 页面。先在仓库根目录的
`.runtime/examples/custom-ui/codex-prompt-shortcuts/claude-scoped.json` 保存以下配置，并把 `12345` 替换为当前 Claude 主进程 PID：

```json
{
  "schemaVersion": 1,
  "scope": {
    "pid": 12345,
    "exePath": "/Applications/Claude.app/Contents/MacOS/Claude",
    "profile": "claude-code"
  }
}
```

配置准备好后，从仓库根目录 `/Users/shopme/Documents/workspace/opendesk` 执行：

```bash
OPENDESK_SHORTCUTS_TARGET_CONFIG=.runtime/examples/custom-ui/codex-prompt-shortcuts/claude-scoped.json ./opendesk -ui -script examples/custom-ui/codex-prompt-shortcuts/main.js -console-mode script -log-dir .runtime/examples/custom-ui/codex-prompt-shortcuts
```

`claude-code` 使用相同五按钮栏和双栏管理器。每次观察均在该精确窗口内读取完整、有界的原生树，核对同一文档中的 `Claude Code` heading、`Primary pane`、唯一 `Prompt` AXTextArea，以及 pane 内的 `Terminal` / `Files` 控件；仅有应用身份或 Code 导航按钮不能通过。已知 Claude bundle/path 的自定义 profile 也执行该场景检查，实际 Prompt 选择器来自场景测量。

本版本使用显式深度 64，当前实窗深度为 44；默认 Accessibility 深度与节点/deadline 限制保持原规则。macOS 的空 AXTitle 现在会回退到实际 AXDescription，因此可读到 `Prompt` 等名称。快捷栏按实测主内容区留出 16pt 边距，并限制在输入区上方 12pt；测量失败、窗口变化或离开 Code 时隐藏。返回 Code 后重新测量。稳定窗口可在后台只读准备唯一输入框的受管引用；点击时仍重新核对精确窗口及 Code 场景，并读取同一原生元素。窗口或场景变化即丢弃引用，不复用其他页面的元素。“检查写入条件”使用同一深层选择器，只读检查。

当前实窗覆盖已有 Code 会话、切至 Cowork 后隐藏及返回 Code 后恢复。新建会话、登录/设置页、其他版本布局及尚未出现所需标记的页面保持隐藏，未宣称已适配。与 OpenCode 同时使用时，把两个已核对的范围放入 `scopes`；按应用隔离的拖动偏移契约不变。

2026-10-28 的 `direct-03` 已加载当前 `main.js`，补验了瞬时观察失败后的恢复及深层观察期间的轮询合并修复：实际五按钮栏、双栏管理器、翻页与 Code/Cowork 往返均有本候选证据。点击合成提示词的结果仍是写入前拒绝和全文复制，独立读回确认原草稿未变；不能据此认定安全追加完成。具体源码哈希、当前启动命令与未验证项见下述 R21 记录。

以上 `direct-03` 与 [R21 验收记录](../../../docs/quality/codex-prompt-shortcuts-r21-claude-code.md) 是严格模式的历史证据。本轮按用户选择增加常规追加，当前实窗结果见 [输入适配记录](../../../docs/quality/codex-prompt-shortcuts-input.md)。组合态仍为 `unknown`，`prepareTextAppend` 关闭，没有取得编辑器内部原子事务保证。

## 可以直接体验什么

- 首位是正式 OpenDesk logo，点击打开管理器。后面保留三个提示词槽位与“下一”，合计五个原生按钮。logo 复用 Recorder / Flow Runner 的正式品牌资产，保留原色；原生尺寸为 40×40pt。
- 默认优先使用 ChatGPT（Codex）桌面应用的已知标识 `com.openai.codex`，开启窗口跟随；目标在前台时显示，其他应用前台时隐藏。尚未通过真实 Codex 验收，下面列出访问限制。当前按钮每次点击重新检查目标窗口、实际输入框和追加条件；条件不满足时复制**完整正文**并读回核验，短标签保持不变。工作区右下角独立显示结果。
- 超过三条时翻页，末页空槽禁用。只更新原按钮，不重建栏。拖动顶部移动；关闭原生栏会打开管理器供恢复或退出。
- 点击 logo 打开左右分栏管理器：左侧选择、分页与排序，右侧编辑、保存与复制。已有记录默认选中第一条。管理器显示时隐藏快捷栏，关闭管理后恢复。
- 管理器“复制所选正文”复制已保存的记录；未保存编辑须先保存或放弃。提示词库为空时先显示管理器。

**标题为“OpenDesk 提示词预览”的旧窗口仍是无动作外观演示。** `preview.js` 保留组件演示用途，按钮无业务回调；体验复制和管理请使用上面的 `main.js`，不要将预览当作产品入口。

## 复制消息与本地广告演示

复制成功后，工作区右下角显示两条可区分的原生消息：复制反馈约 2.6 秒；另一条“广告演示”包含本地图片和文字，约 5 秒后自动关闭，可提前点 × 关闭。它们不改变按钮文字，不更新管理器底部状态，也不抢键盘焦点。每种消息只复用一个句柄，连续点击更新现有消息及倒计时，不无限叠窗；退出时一起清理。

展示配置位于脚本旁的 `message-demo.json`：`enabled` 可关闭广告演示，`title`、`text` 和 `image` 分别配置标题、说明和脚本 `assets/` 内的 PNG/JPEG 路径。当前图片复用正式 OpenDesk logo，文案明确标注演示；没有广告投放、遥测、网络请求或自动链接行为。配置无效只记录通知错误，不影响已读回复制的结果。改配置后重新启动入口生效，用户库不受影响。

该展示需要本轮配套原生宿主的 Toast 图片与锚点堆叠支持；维护者刷新开发构建，用户仍使用文首一条启动命令。

## 追加条件与全文复制兜底

### 本轮常规桌面追加

用户选择先实现 Claude / OpenCode，并允许简单的常规桌面输入。两者内置 profile 使用 `inputMode:'paste'`。

本轮配套 macOS Runtime 的 `Accessibility.read` 按请求读取属性，并在读取前后直接核对元素所属的精确 AX/CG 窗口，减少重复查询前台窗口的开销。粘贴前的精确前台守卫、Claude Code 场景检查、选区与草稿检查继续执行。真实按钮样本中，Claude 常用输入的首次有文字帧完成于约 0.99–1.23 秒，OpenCode 约 0.87–0.93 秒；截图采样有自身耗时，这不是瞬时响应或延迟保证。版本、逐字结果、后备路径、提示浮层遮挡和原稿恢复证据见[输入适配记录](../../../docs/quality/codex-prompt-shortcuts-input.md)。

常规输入流程如下：

- 输入框已有焦点且选区为空时，在当前光标处粘贴一次完整正文。不会先移动光标、全选复制、重建完整树或添加两个换行；已有稿件前后内容由普通插入保留。正文的首尾空白、多行、tab、emoji 和组合字符原样交给剪贴板。
- 输入框未聚焦或已有选区时，使用已测量的输入框恢复焦点，折叠至全文末尾，再追加正文；非空稿件在此后备路径加两个换行，避免替换原选区。Web 空稿的 AX 换行不能直接当作真实空字符串，仍检查末端边界。
- 稳定场景可在后台只读准备唯一输入框的受管引用。点击后重新确认应用、PID、精确窗口和当前元素；Claude 进行一次新鲜 Code 场景检查。常用路径不重复 discovery/snapshot，不读取无用 bounds；仅恢复焦点时读取真实控件边界。输入进行期间合并后台完整场景扫描，前台守卫仍运行。
- 焦点 Web 输入只在收到粘贴动作回执、观察到编辑器值变化并再次核对前台后提示“已粘贴 · 尚未发送”。它返回 `PASTE_OBSERVED / verified:false`，不通过全选复制或移光标获取逐字回执。后备追加路径才进行写后全文 Copy，核对完整后缀并恢复末尾光标；普通 plain 编辑器可用实际全文严格比较。两条路径均不发送 Enter、不全框设值。

Claude Code 的 AX 会投影空行和部分选区偏移，不能当作字节级正文 Oracle。本轮实窗测试用独立控制器在输入完成后复制全文，逐字比较合成正文和预期完整稿件；这份验收证据不等于每次业务输入都做全文复制。阶段计时 `PROMPT_SHORTCUT_INPUT_TIMING` 分别记录按钮回调、粘贴派发、编辑器变化及反馈，不把派发时间称为首次可见时间。实际画面时序与所对应源码快照见 [输入适配记录](../../../docs/quality/codex-prompt-shortcuts-input.md)。

聚焦或粘贴引发的编辑器尺寸变化可在同一受管引用上重新读取。窗口身份/几何变化、选区不可读、已知组合态 active、非空 marked range 或剪贴板变化会停止。目标失效和 dispose 会阻止尚未发出的输入；每次只允许一个输入，结果不明确时锁止并保留剪贴板，不自动重试。确认尚未开始输入时才允许全文复制兜底。管理器“复制所选正文”和显式 copy 模式始终只复制。

这是常规桌面自动化，不提供原子插入、并发编辑隔离或已证明的 IME inactive。Runtime 的 composition 仍为实际的 `unknown`。使用系统纯文本剪贴板；焦点输入后保留正文，后备 Copy 后保留完整稿件。操作期间保持目标窗口稳定，等待反馈后再操作。尚未验证的软件不会因配置了 profile 就取得资格。

自定义 profile 可显式指定 `inputMode:'paste'` 或 `'strict'`；省略时为 strict。该字段是本例脚本配置，不是 Runtime API 参数。严格模式的原合同和缺口保留如下。

### 严格定向追加与历史能力限制

默认跟随模式在每次点击时重新核验当前应用、PID 和原生窗口，从该窗口的真实 AX 控件中选择唯一输入框。Codex 的窗口相对位置仅用于筛选候选，不直接作为点击坐标；窗口变化后重新读取控件。其他已核验应用可在 profile 中提供 `editorSelector`，或在获准环境中使用管理器“检查写入条件”进行只读校准。没有控件证据时只复制。

配套 macOS Runtime 提供显式 `textInputState` 原始状态读取和当前禁用的 `prepareTextAppend` 执行门，契约见 [Accessibility Reference](../../../docs/api/accessibility.md)。`inputMode:'strict'` 只做只读预检，不移动选区、不点击输入框、不激活记忆中的窗口、不发送全局粘贴。即使未来 provider 能证明组合态为 inactive，strict 仍以 `DIRECTED_APPEND_UNAVAILABLE` 拒绝追加，直到实际具备定向事务能力。主入口随后复制完整正文并读回核验。

严格模式还要求编辑器内部事务核验草稿、选区与组合态；这些保证仍未实现。状态缺失、组合输入中或控件歧义时拒绝输入，自动复制完整正文。缺失或矛盾的回执按 unknown 锁止后续输入，不能用全文读回覆盖未知动作状态。仅 `rejected + not_started` 允许后续显式点击重新预检；复制和输入分别反馈。

**严格定向追加尚未交付：当前所有 composition provider 均未资格化，组合态保持 unknown，prepareTextAppend capability 为 false。** 不同 AX provider 对 marked range 的支持和语义需要真实验证；即使读到零长度范围也不能视为 inactive。本轮常规 paste 策略改变的是脚本输入合同，没有启用这个原生动作，也没有取得原子事务保证。显式 copy 模式始终只复制。

**此前输入适配轮次的 Computer Use 曾明确禁止访问 `com.openai.codex`，该历史轮次未绕过限制。** 本轮仅补齐桌面快捷栏的 scoped 接入，核对安装元数据并运行内存回归，没有操作 Codex UI，也未验证 Codex 自动输入。Claude 桌面 Code 与 OpenCode 的常规追加结果见 [输入适配记录](../../../docs/quality/codex-prompt-shortcuts-input.md)；R21 仅保留历史范围。

本轮 OpenCode 只读现场结果：唯一 AXTextArea 的真实位置可读，AXSelectedText 与单一选区实际声明可写；AXTextInputMarkedRange 返回 NoValue，公开 `textInputState.composition` 为 unknown。这些观察不能证明安全追加事务。前台识别、五按钮翻页与管理器的当前结果见本轮验收记录；复制回执不算追加通过。

### 已核实的替代接口与实施条件

2026-10-28 研究的来源是 Chromium `9ca64a8bc1d522bc13f42ff4be2cec76e8f86929`、Electron v45.1.0 和下列固定 WebKit 源码。它们不是本机目标应用版本或实际可调用能力证明。

| 候选 | 已核实的限制 |
| --- | --- |
| AXSelectedText | Apple 有 setter 合同，但所查 Chromium Cocoa setter 发出的 `kReplaceSelectedText` 在 BrowserAccessibility 分派中没有处理，不能据 superclass 的 setter 判断网页 composer 可写。[setter 源码](https://github.com/chromium/chromium/blob/9ca64a8bc1d522bc13f42ff4be2cec76e8f86929/ui/accessibility/platform/ax_platform_node_cocoa.mm#L3602-L3612)、[动作分派](https://github.com/chromium/chromium/blob/9ca64a8bc1d522bc13f42ff4be2cec76e8f86929/ui/accessibility/platform/browser_accessibility.cc#L1346-L1491)。 |
| Chromium AXTextOperation | 可将 marker range 和替换文本一起定向派发；但没有调用方预期草稿或组合态拒绝参数。返回的替换字符串由本地构造，不是 renderer 提交回执；所查版本 feature 默认关闭。不为启用它而修改目标应用启动参数。[实现](https://github.com/chromium/chromium/blob/9ca64a8bc1d522bc13f42ff4be2cec76e8f86929/ui/accessibility/platform/browser_accessibility_cocoa.mm#L2722-L2932)、[renderer 动作](https://github.com/chromium/chromium/blob/9ca64a8bc1d522bc13f42ff4be2cec76e8f86929/third_party/blink/renderer/modules/accessibility/ax_object.cc#L8307-L8453)、[默认状态](https://github.com/chromium/chromium/blob/9ca64a8bc1d522bc13f42ff4be2cec76e8f86929/ui/accessibility/accessibility_features.cc#L463-L466)。 |
| Electron webContents.insertText | 插入焦点元素；实现通过活动 input-method controller CommitText，没有精确元素或预期草稿参数。它属于目标 Electron 应用内部能力，不是 OpenDesk 已有外部接口。[官方合同](https://www.electronjs.org/docs/latest/api/web-contents#contentsinserttexttext)、[实现](https://github.com/electron/electron/blob/45d20ec03000aac41e73b2abdb707936b4f98ed0/shell/renderer/api/electron_api_web_frame.cc#L649-L661)。 |
| CDP Input.insertText / imeSetComposition | 路由到焦点 widget，传入的 DOM target 为空；没有 expected 草稿或拒绝正在组合的前置条件。不会通过调试端口重启或连接被禁止的目标。[实现](https://github.com/chromium/chromium/blob/9ca64a8bc1d522bc13f42ff4be2cec76e8f86929/content/browser/devtools/protocol/input_handler.cc#L1291-L1368)。 |
| WebKit AXInsertText / AXReplaceRangeWithText | 所查 WebKit provider 实现了插入/范围替换，但没有预期草稿比较及组合态拒绝。该实现不证明 Chromium 支持。[源码](https://github.com/WebKit/WebKit/blob/db0692d05341c4eea90b1f7ef16cf0978afe122a/Source/WebCore/accessibility/mac/WebAccessibilityObjectWrapperMac.mm#L3224-L3234)。 |

保持当前严格要求的实施方向是**目标编辑器内部的定向追加事务**：在同一次编辑事务中核验窗口/编辑器生命周期、原草稿或 revision、选区及真实组合态，随后仅插入后缀；还须处理同步事件重入，拒绝意外变化并区分已提交、未开始和未知结果。外部再读全文作独立确认，未知结果不重发。不能把分开的 AX 读取、改选区和按键包装成这样的事务。

**目前没有发现两个目标桌面应用已提供且获准调用的这种接口，不能称为已经落地的追加方案。** 下一步需要先取得实际目标的受支持 provider/编辑器事务入口；仅解除访问限制不能补出该能力。之后在获准窗口先只读确认应用版本、唯一 composer、全文/选区/组合态，再最小输入验证：空稿、多行/Unicode/首尾空白稿、非空选区、IME、用户并发编辑、窗口切换/重建和未知回执。每次必须独立读回全文且不发送，任何不确定动作都停止。Codex 还需由授权环境解除现存访问拒绝；Claude 已核对真实桌面客户端身份，仍缺满足上述要求的追加 provider；URL handler 不能替代桌面客户端。不自动安装、不修改目标应用，不将网页或自有演示窗口作为桌面验收。

## 窗口跟随与数据保护

默认跟随复用 Events、前台进程/窗口身份核验及相对位置保存。管理器可关闭本次运行的跟随。默认 Codex 布局为 `sidebarWidth:300,gap:16,top:16,bottom:16,right:16`：从窗口左侧预留 300pt 侧栏，再留 16pt 间距，快捷栏基准 x 为窗口左边缘 +316pt；右侧保留 16pt。上下各保留 16pt，在整个剩余区域内按快捷栏实际高度垂直居中；未计用户偏移和屏幕裁切时，基准 y 为窗口顶部 +16pt +（窗口高度 −32pt − 快捷栏高度）/2。窗口变高或变矮时重新居中。区域没有空间或放不下快捷栏时隐藏。

以上尺寸、窗口位置、快捷栏尺寸和偏移均使用屏幕逻辑坐标（pt），不是截图或 Retina 屏幕的物理像素。2× 屏幕上 316pt 可对应 632 个物理像素；不要直接把截图像素填入布局，也不要额外给逻辑坐标乘缩放倍数。显示器裁切由入口 `main.js` 的 frame 计算处理：按实际内容区与各屏幕内缩 8pt 边界的交集选屏，只比较能完整容纳 60pt 宽、实际栏高的候选，取可用面积最大者；不按整个窗口或侧栏面积选屏，也不把不同屏幕的窄小碎片合并为可用区域。负坐标保持原值；没有可容纳区域时隐藏。

这是用户接受的默认布局规则，返回 `source:'window-relative-default',composerMeasured:false`，不是 AX 测量结果，不保证识别动态对话内容或输入区。`settings.offsetX/offsetY` 是独立的用户拖动偏移，在布局基准上叠加，不修改侧栏宽度或边距；更换布局配置不会清除已保存偏移。“重置位置”将这两个偏移保存为 0，回到当前布局基准。

如果用户在获准环境中选择“检查写入条件”，成功校准后可使用独立测得的 composer 边界，并在跟随时只读刷新；其结果标记 `source:'accessibility',composerMeasured:true`，用于将可用区域的下边缘限制到输入区上方 12pt。它不把侧栏和边距变成测量值，也不证明安全写入。默认跟随无需此步骤；启用测量后若当前测量缺失、过期或窗口身份不符，快捷栏隐藏等待有效结果，不静默拿旧测量继续显示。校准只在本次运行有效。

目标检测和区域适配集中在脚本本地 `targets.js`，入口 `main.js` 使用同一份 JS registry。默认 profiles 包含 Codex（strict）、Claude 桌面 Code（paste）与 OpenCode（paste）；本轮没有访问或验证 Codex UI。registry 兼容原有 `contentArea(win)` 函数 profile；可序列化配置使用下述 identity + layout descriptor，由工厂快照并生成纯函数。多个已配置应用可同时检测，按当前前台 PID 与稳定应用身份选择；跨 profile 歧义、身份变化或区域无效时隐藏，不按窗口标题猜测。

### 脚本级目标配置

环境变量 `OPENDESK_SHORTCUTS_TARGET_CONFIG` 指向单独的 JSON 文件；例如由用户准备 `.runtime/examples/custom-ui/codex-prompt-shortcuts/targets.json`：

```json
{
  "schemaVersion": 1,
  "profiles": [
    {
      "id": "codex",
      "name": "ChatGPT（Codex）桌面应用",
      "app": { "bundleId": "com.openai.codex" },
      "layout": { "sidebarWidth": 300, "gap": 16, "top": 16, "bottom": 16, "right": 16 }
    }
  ]
}
```

配置文件准备好后，从仓库根目录 `/Users/shopme/Documents/workspace/opendesk` 运行：

```bash
OPENDESK_SHORTCUTS_TARGET_CONFIG=/Users/shopme/Documents/workspace/opendesk/.runtime/examples/custom-ui/codex-prompt-shortcuts/targets.json ./opendesk -ui -script examples/custom-ui/codex-prompt-shortcuts/main.js -console-mode script -log-dir .runtime/examples/custom-ui/codex-prompt-shortcuts
```

设置配置后，`profiles` **完整替换默认 profiles，不做合并**；需要继续跟随 Codex 时，须在配置中明确保留它。未设置或值为空时使用默认配置。文件上限 64 KiB，顶层接受 `schemaVersion:1`、`profiles` 以及互斥的 `scope` / `scopes`；显式范围模式可省略 profiles 使用内置 Codex、OpenCode 或 Claude Code，其他模式的 profiles 必须为 1–16 项；加载后修改文件需重新启动脚本才生效。无效配置报错，不静默退回默认应用。

可选 `editorSelector` 只接受 `role:"textField"`，并至少提供一个实测的非空 `identifier` 或 `name`；允许的键仅这三项。它只绑定实际控件，不能用按钮标题或猜测值代替。

每项须有非空且无首尾空白或控制字符的 `id`、`name`，id 不得重复或使用保留值 `configured`。`app` 只能提供一个稳定身份：`{"bundleId":"已核验的标识"}` 或 `{"path":"/已核验的绝对路径"}`，不能同时提供二者，不能使用标题、PID 或相对路径代替。`layout` 必须完整提供 `sidebarWidth`、`gap`、`top`、`bottom`、`right` 五项，均为有限、非负数值，不接受字符串、缺项或额外布局字段。重复 identity 对应多个布局时拒绝选择；配置建立后对身份和布局作冻结快照，防止调用方修改后悄然改换目标。

配置其他应用前，先独立核验其真实 bundle ID 或绝对路径，再填写布局；配置能力不等于已完成该应用的真实运行适配。已核对的 Claude Code 范围与限制见上节；其他应用或版本仍须实测，不因配置存在而宣称通过。

现有 `settings.appBundleId` 非空时仍优先采用用户明确设置，兼容原有 override。指定配置中的已知 bundle ID 会保留该应用的区域规则；未知显式 bundle ID 使用 `sidebarWidth:0,gap:16,top:16,bottom:16,right:16`，即四边各 16pt，返回 `source:'window-relative-fallback',composerMeasured:false`。同一标识配置了多个区域 profile 时拒绝选择，避免静默用错区域。业务入口通过 OpenDesk 的 App/Window/Events API 获取目标信息，不依赖 CUA 工具。

此配置只属于脚本部署，不加入生产用户库或 Browser 导入/导出 schema。`library.json` 继续保持 `schemaVersion:1`、`revision`、`prompts`，settings 在原字段外可选保存按应用隔离的 `positions`。

拖动等待不再阻塞失焦隐藏或新窗口跟随；打开管理器、重置位置或切换目标会取消旧拖动，首次原生读回尚未返回时也不能重新覆盖新设置。原生显示动画期间，有效前台目标移动或更换会直接更新位置，避免隐藏后重复播放显示动画；目标失效或失焦仍先隐藏。焦点事件早于系统前台状态更新时，最多追加两次、间隔 40ms 的只读重验；关闭跟随取消重验，权限或后端错误不启动此重验。

显示后立即读取原生状态，随后按 16ms 间隔、最多 39 轮采样，仍要求连续匹配并在每轮复核目标前台状态。最终原生与目标读回可以合并此前已覆盖的同步请求；读回期间的新请求仍触发下一轮。隐藏栏需要移动时，同一轮同步仅主动刷新一次应用身份，让同步的身份查询与异步宿主移动等待重叠；移动结束后仍重新读取精确窗口，正向身份缓存上限仍为 400ms。应用查询原始错误向上传递并记录，不能转成“未找到”或返回部分匹配；身份查询和移动同时失败时保留两条诊断。这些时序改动不构成 500ms 或真实 Codex 通过证据，须以当前候选实测为准。

配套 macOS Runtime 已修复移动时误写动画尺寸的问题：位置调用保持原生工具栏布局确定的外框尺寸，避免把显示/隐藏动画中的缩小帧固定下来。历史 JS 实测中，本例五按钮栏保持 60×280pt；目标配置与跟随业务仍使用原有 JavaScript。

显式范围模式现以全新系统 lsappinfo 进程仅查询 front ASN 与 PID，在前后检查中保持同一来源，失败不回退缓存。该系统查询不读取应用名称、窗口或列表；确认配置目标在前台后，才读取其精确窗口。旧版 Process Manager 路径的历史通过不能证明本轮修复通过。JS 另修复隐藏动画缩小帧恢复时对正确最终位置的误拒绝，仍要求连续原生读回匹配和逐轮目标复核。

只体验管理和复制、且不观察外部应用时，从仓库根目录运行：

```bash
OPENDESK_CODEX_SHORTCUTS_MODE=copy ./opendesk -ui -script examples/custom-ui/codex-prompt-shortcuts/main.js -console-mode script -log-dir .runtime/examples/custom-ui/codex-prompt-shortcuts
```

该显式模式启动后先打开现有管理器，关闭管理器后显示五按钮栏，不注册外部窗口观察；它是回退入口，不代表默认跟随已经验收。

唯一活动用户库在固定用户目录：macOS 为 `~/Library/Application Support/OpenDesk/codex-prompt-shortcuts/library.json`，Windows 为 `%APPDATA%/OpenDesk/codex-prompt-shortcuts/library.json`，Linux 为 `$XDG_DATA_HOME/OpenDesk/codex-prompt-shortcuts/library.json`（未设置时使用 `~/.local/share`）。工作目录和进程重启不会改变此路径。结构保持 `schemaVersion:1`、`revision`、`prompts` 和 settings；settings 可选保存按应用隔离的 `positions`，最多 80 条提示词。正文、名称、启停、排序和 Browser 导入/导出继续由同一套逻辑维护；无后台 Browser 同步服务。日志、截图及导出备份均写入 `.runtime/`，不入版本控制。

首次启动检查脚本所在仓库和当前工作目录下的旧 `.runtime/examples/custom-ui/codex-prompt-shortcuts/`。只有一份旧库时，持锁备份库及恢复记录到固定目录内 `migration-backups/`，逐字节读回后迁移；原库保留，revision 不变，恢复草稿仅更新库路径绑定。多份旧库、已有持久库冲突、未知旧锁或未完成迁移均停止，不合并、不覆盖、不静默新建空库。迁移后再次发现旧库发生变化也停止，避免分叉。

导入仅接受正式 `format:"opendesk.prompt-shortcuts"` 的 v1/v2 JSON，文件上限 256 KiB；预览、确认后追加，按正文 NFC、CRLF→LF、trim 后的键去重，存储正文原文不变，不覆盖已有记录。图片项需确认降级为文字。工具安装包 `.opendesk-tool.json` 不是提示词备份。

导出使用正式 v2 格式，已用独立 Browser 正式 model 校验。Browser 自身还有 8 KiB 库容量限制：备份格式可读不等于任意大小都能装入 Browser，须以 Browser 导入预览为准；本例不会静默裁切。

保存使用持久的 `library.lock`、内核非阻塞独占锁、基线/revision 检查、原子替换与读回。配套 Mac 构建提供现有 FileHandle 的 `tryLock()`；当前 Windows 尚不支持此锁接口，不能声称其保存已验证。保存读取期间切换记录或修改草稿会取消本次保存；保存、删除、导入期间的新编辑保留为未保存草稿。发现冲突或不确定写入时，先“核对磁盘版本”，不盲目重复保存。新协议锁在进程退出后由操作系统释放：下一次成功持锁才证明没有活跃的新协议 owner，完整备份未完成记录到库目录 `lock-recovery/` 后恢复；不会自动重放保存。锁路径永久保留，禁止删除、重命名或替换。旧版 nonce 或未知格式仍拒绝接管，需先证明旧 owner 已退出再备份处理；不按年龄或猜测 PID 删除。写入校准、模式切换和普通复制不修改用户库。

未保存编辑另有库目录内的 `draft-recovery/` 恢复记录，由脚本本地 `recovery.js` 管理；它不替代 `library.json`，也不参与 Browser 同步。每个实例持有独立的稳定内核锁，其他实例不会接管活跃编辑。每次编辑按序 checkpoint 并读回；失败会提示保留窗口。异常退出后，下一次启动取得对应锁才恢复最近确认的草稿，先显示管理器并阻止保存，须点“核对磁盘版本”。存在多份遗留草稿时每次启动恢复一份，其余原样保留；无效记录保留并记录错误，不根据年龄删除。

恢复记录保留原始编辑基线；核对前再次退出也不会把旧基线换成当前磁盘版本。若其他实例已改变库，恢复草稿作为新条目保留，避免覆盖别人的保存。业务提交前先记录完整意图：核对只接受原版本或预期版本，第三版本继续阻止保存；清除待核对意图前，将完整恢复记录独占备份并精确读回到 `draft-recovery/history/`，区分“上次已提交”和“上次未提交”，不会重放导入、删除或保存。明确放弃会记录为干净状态；关闭等待期间先禁用编辑，已在途的新输入会取消关闭并保留。

这是进程异常退出的最近确认 checkpoint 恢复，不是断电持久性承诺；进程在一次 checkpoint 完成前被终止时，最后一笔未确认编辑仍可能缺失。干净记录和意图备份目前保留供核对，暂无自动清理策略。隔离 fixture 覆盖迁移、保存后跨 cwd 重启和恢复。2026-10-28 正式 copy 入口已迁移真实用户库：旧库原文保留，新库逐字节一致，原 revision 和条目数未变；未输出正文。

## 验证范围

历史增量修复与未达成项见 [R1.2 交付记录](../../../docs/quality/codex-prompt-shortcuts-r12-product.md)。旧截图和通知验证见[前轮记录](../../../docs/quality/codex-prompt-shortcuts-current.md)，不能替代本轮产品验收。

定向内存回归（不操作真实桌面）：

```bash
node --test tests/custom-ui/codex-prompt-shortcuts.test.cjs tests/custom-ui/codex-prompt-insert.test.cjs tests/custom-ui/codex-prompt-targets.test.cjs tests/custom-ui/codex-prompt-storage.test.cjs
```

只按改动选择增量用例，不为本例改动重复运行 tooltip、Toast、catalog 或跨平台历史矩阵。正式 Browser model 双向兼容测试为 `tests/custom-ui/codex-prompt-browser-compat.test.cjs`，通过 `OPENDESK_BROWSER_MODEL` 指向 Browser 仓库的 `examples/sidebar-tools/prompt-shortcuts/trusted/model.js` 后运行；模型校验不等于 Browser UI 迁移。

2026-10-28 当前候选已完成限定自有 OpenDesk 窗口的实测：18 个跟随场景，加上目标进程退出、重启、取消拖动后恢复及重置位置，共 22 个场景的可见状态/位置收敛和同步结束均在 500ms 内，最长 458ms。另测快捷栏进程冷启动为 974ms；原始重启报告包含该项，因此其 `timingPassed:false` 保留，不能表述为全部计时通过。拖动 +70/+24 实际落盘并跨进程恢复；管理器打开取消尚未提交的新拖动，真实点击“重置位置”后偏移读回为 0。

本轮实际加载完整业务源码，只将前台查询和 Events 接线限定为测试自有句柄；应用身份仍使用真实 `App.get(path)`。开始/结束源码与主程序、UI host 指纹一致，实窗区域截图确认五按钮栏 60×280pt、实际覆盖目标窗口且无裁切。证据位于仓库根目录下 `.runtime/tests/codex-prompt-shortcuts-r15/final-06/` 的 `windows-result.json`、`restart-result.json`、两份 trace、provenance 和 `owned-overlay.png`。失败轮次仍保留。本机只有一块显示器，跨屏与负坐标仅通过内存回归；正式全局 Events、文首默认 Codex 命令和真实 Codex 仍未验收。提示词保存及点击写入没有作为本轮第二阶段展开，生产库哈希保持不变。

**以下为历史验证记录，不能替代上述当前候选证据。**

此前自有实窗确认了窗口相对布局、层级、失焦/管理器隐藏、拖动保存及重启恢复；它使用限定自有句柄的测试接线，不能替代真实 Codex 检测或正式 Events 后端。采样修复后，自有窗口移动 353ms、失焦隐藏 243ms、切回显示 486ms、关闭管理器恢复 455ms；同步流程完全结束仍有 628/597ms。随后修复重复显示动画，双窗口切换从 963ms 降至 376ms、切回 349ms，窗口替换仍为 724ms（同步结束 838ms），未全面达到 500ms。目标与快捷栏两个进程退出并重启后，实际保存的 +90/+30 偏移保持一致，旧进程句柄被拒绝；这些证据仅覆盖自有窗口。具体证据和失败范围见交付记录。

上述耗时以及 21:39 构建的切换 1123ms、切回 864ms、替换 968ms 均为历史结果。该历史阶段的候选已用固定根启动器实际运行正式 `window.current` JS 回归，并串行运行自有跟随场景：六次移动/缩放收敛 151–254ms、双窗口切换 223ms、切回 198ms、替换 188ms，14 个场景最长 258ms；只证明该历史轮次限定自有句柄、应用快照和 scoped Events 接线的状态/几何读回，不能证明正式全局事件或真实 Codex 达标。该轮截图只有桌面壁纸，**该轮视觉验收失败**，不能沿用更早截图宣称该候选视觉通过；该轮未重跑进程重启和真实拖动。

从仓库根目录可运行上述历史记录使用的正式接口回归（只创建并查询本 execution 的自有窗口，无外部应用发现）：

```bash
./opendesk -ui -script tests/runtime-api/window-current-owned-macos.js -console-mode script -log-dir .runtime/tests/window-current-owned/run
```

它验证同进程精确窗口前台、移动/缩放、关闭重建及旧句柄失效，输出默认位于 `.runtime/tests/window-current-owned/<时间戳>/result.json`。这不是文首默认 Codex 业务入口；上述历史记录中该入口仍未运行。尺寸保持回归的前轮证据、对应构建来源、失败轮次、必要定向回归及未完成项均见交付记录；本轮结果另行补充。
