# AI 助手与 Custom UI：系统文字编辑快捷键

状态：源码修复与 JavaScript 契约检查；macOS / Windows 真机验收待完成。
基线检查日期：2026-09-16。初始仓库基线：`8e74b707fc8665ba02624cd545f767cc20458608`。

## 问题与修复边界

AI 助手使用普通 Custom UI HTML 窗口：标题是 `input`，消息输入是
`textarea`，历史消息是只读 `p`，不是一个需要重新实现编辑器的特殊终端。

基线 `pkg/customui/machost/native_darwin.m` 的 `OpenDeskUIRun()` 初始化
NSApplication 并启动 AppKit 循环，但没有安装主菜单中的标准 Edit 命令。
UI host 是独立的 AppKit 应用，不能继承父 App Mode 进程的编辑菜单。
这解释了为什么 HTML 输入控件存在，却缺少 macOS 应用级文字编辑快捷键路由。
它是已确认的源码缺口；是否还有焦点、选区或重渲染问题，必须由真机矩阵继续验证。

本次在共享 macOS UI host 安装标准编辑菜单，而不是在 AI 助手中模拟按键、
读取系统剪贴板后重写整个输入框，或新增全局快捷键。
因此同一宿主的其他普通输入窗口也使用这条路由；不改变 Runner / Recorder 的
全局启动、停止快捷键，不修改 AI 任务执行或发送逻辑。

## 交互合同

| 操作 | macOS | Windows |
| --- | --- | --- |
| 复制选中内容 | Command+C | Ctrl+C |
| 粘贴到当前可编辑控件 | Command+V | Ctrl+V |
| 剪切当前可编辑控件的选区 | Command+X | Ctrl+X |
| 当前输入框全选 | Command+A | Ctrl+A |
| 撤销当前编辑 | Command+Z | Ctrl+Z |
| 重做当前编辑 | Command+Shift+Z | 由平台编辑控件处理，验收 Ctrl+Y / Ctrl+Shift+Z |

输入框与对话标题使用平台编辑器的选区、光标、输入法和撤销栈。粘贴替换当前
选区或插入光标位置，不能无条件覆盖整个草稿。中文、emoji 和换行不经过应用自制的
剪贴板字符串切分。

历史消息维持只读，可鼠标选择并复制，不因剪切或粘贴而修改。没有输入框焦点时，
全选保留平台对页面选择的默认行为；本次不新增“只全选一条消息”或整条消息复制按钮。
窗口重绘、流式回复和草稿保存不能抢走焦点或无故清空选区，这些仍是实窗验收项。

Enter / Shift+Enter 保持输入控件的换行/输入法语义；AI 助手仍只有明确点击发送按钮
才发送。本次不增加 Enter 或 Command/Ctrl+Enter 发送，以免与编辑能力修复混为一谈。
只读、空选区、不可用撤销/重做等菜单状态交给 native responder validation。

## 实现链路与文件

```text
键盘快捷键 / 系统“编辑”菜单
  → UI host 的 NSMenuItem（标准 selector，target=nil）
  → AppKit 当前窗口的 responder chain
  → 获得焦点的 WKWebView / 原生文本编辑器
  → 系统选区、剪贴板与撤销管理
  → 原有 HTML input/change bridge
  → AI 助手已有草稿逻辑
```

- [`edit_menu_darwin.m`](../../pkg/customui/machost/edit_menu_darwin.m)：六个标准
  编辑动作、菜单展示、自动启用校验、重复安装保护、既有菜单保留。
- [`edit_menu_darwin.h`](../../pkg/customui/machost/edit_menu_darwin.h)：内部 native 声明。
- [`host_darwin.go`](../../pkg/customui/machost/host_darwin.go)：在主线程检查之后、
  开始接收命令和运行 AppKit event loop 之前安装菜单。

不新增公共 JavaScript API；现有 API 仍以 [`docs/api/ui.md`](../api/ui.md) 为准。
编辑菜单标题在宿主启动时按系统首选语言选择中文或英文，不宣称已接入产品运行中的
语言切换。菜单自行展示对应快捷键；不为六个动作再占用 AI 助手主工具栏空间。
测试窗口的输入框 tooltip 同时展示常用组合键。

菜单目标不得指向 AI controller、缓存窗口或 Runtime。不得用全局键盘监听、
`execCommand`、模拟键盘、手工剪贴板桥接或强制夺焦点作为这个问题的修复。
也不在子进程中新增 Quit 命令，产品退出仍属于 App Mode 生命周期。

Windows 继续使用平台文本编辑路由，本次没有修改 Windows native host。Microsoft
文档明确 WebView2 的浏览器快捷键开关不应禁用 Ctrl+C/X/V/A/Z；如果 Windows
实测失败，继续检查焦点和 AcceleratorKeyPressed 是否吞键，不照搬 macOS Edit 菜单。
当前不能把这个平台约定或 JavaScript 模拟测试当作 Windows 实测通过。

## 可重复检查

### 无桌面源码 / 测试夹具检查

从仓库根目录运行：

```bash
node --test tests/custom-ui/edit-menu.test.js
```

检查六组 selector / key equivalent、主线程安装顺序、nil target、native validation、
不注册全局钩子、菜单复用，以及交互夹具的正常窗口、只读消息、无编辑回写、
错误暴露和无剪贴板正文日志。这是源码契约与 mock 测试，不是 AppKit 集成验收。

### 不连接模型的真实 Runtime 交互夹具

先按仓库现有构建流程刷新主程序和配套 UI host，确认二者来自当前源码。
不能只更新 JavaScript 后复用旧 native host。然后从仓库根目录运行：

```bash
./dist/opendesk -ui -script tests/runtime-api/ui-editing-shortcuts.js -console-mode script
```

这是 OpenDesk Runtime JavaScript，不要用 Node 运行这份交互文件。它不调用模型、
不发送网络请求、不模拟鼠标键盘，也不读取或记录任意剪贴板正文。

在测试窗口中选择完整的两行示例文本并复制，到消息输入框全选粘贴。
然后全选剪切、撤销、重做，再粘贴示例文本，点击“读取当前观察结果”。
此时 `composerMatchesSample`、`readonlyUnchanged`、`titleUnchanged` 应为 true，
`sendCount` 应为 0，并观察 `inputEvents.composer` 增长。再分别测试标题框，
确认两个输入框互不影响。只有点击“发送（仅计数）”才增加发送计数。

日志 `UI_EDITING_READY` 仅说明窗口已打开；`UI_EDITING_OBSERVATION` 是观察结果，
其中 `nativeShortcutsVerdict` 始终是 `manual-review-required`。
用鼠标菜单得到正确值也可能产生同样的观察，因此这些日志本身不能证明键盘组合已通过。

### 必须完成的真机矩阵

| 场景 | 检查点 |
| --- | --- |
| 输入框 / 标题框分别获得焦点 | C/X/V/A 只作用于当前选区，不能串到其他输入框 |
| 从其他应用粘贴；从助手复制到其他应用 | 中文、emoji、多行及中间选区替换正确；一次按键只插入一次 |
| 剪切 → 撤销 → 重做 → 再粘贴 | native 编辑顺序正确；空撤销栈不改变文本 |
| 历史消息选择与右键菜单 | 可复制；剪切/粘贴不能修改已发送消息；记录原生菜单实际表现 |
| 中文输入法候选与 Enter | 不提前提交候选、不自动发送；Shift+Enter 不触发任务 |
| 空选区、空剪贴板、disabled 输入框 | 遵守平台默认行为，不清空其他草稿，不误触发发送 |
| AI 助手草稿保存与回复刷新 | 输入时选区/光标不无故跳动；复制到的内容匹配实际选区 |
| AI 助手关闭、重新打开、窗口间切换 | 快捷键仍可用；编辑菜单不重复；不会操作上一个窗口 |
| 离开 OpenDesk 到其他应用 | 编辑快捷键不被后台 OpenDesk 截获 |
| 共享窗口与浮动控件回归 | Dialog 等普通输入窗口正常；Runner/Recorder/Measurement 原快捷键不被破坏 |

测试生成的日志和截图只放 `.runtime/tests/custom-ui/editing/`，不得写入源码目录。
保留操作系统、实际 binary/UI host 的路径和构建来源、快捷键动作、文本观察结果与截图。
fixture 通过后必须再打开真实 AI 助手验收，不能用测试窗口替代生产 UI。

## 证据边界

本轮网页环境只能执行源码契约和 mock 测试，不能证明 macOS 原生编译、真实剪贴板、
输入法、窗口焦点或 Windows WebView2 行为。上述 native / production 矩阵均待运行。
发现额外问题时定向修复实际 owner，不通过放开业务 document script 或全局吞键绕过。

## 平台依据

- Apple：[Mac keyboard shortcuts](https://support.apple.com/102650)。
- Apple：[Target-Action / nil target responder chain](https://developer.apple.com/library/archive/documentation/General/Conceptual/CocoaEncyclopedia/Target-Action/Target-Action.html)。
- Microsoft：[WebView2 AreBrowserAcceleratorKeysEnabled](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2settings.arebrowseracceleratorkeysenabled)。
