# AI 客服助手 R2.3 · macOS Desktop 验收

日期：2026-10-29。范围：本机 macOS、独立 AppKit 测试聊天、当前稳定签名 OpenDesk 主程序及 UI host。本文不构成真实微信、通用聊天识别或生产客服资格证明。

## 基线与代码归属

- 开始时同步到 master `a4a14c4b64b2b2938c2ae4ca8b54ceca971ac03d`。现有 React 19 / TypeScript 六页、state/domain 与唯一 `preview/index.html` 已实现，全部复用。
- R2.1/R2.2 `desktop/main.js`、`adapter.js`、`panel.html`、生成 core 等为开始时存在的未跟踪历史补丁，本轮未加载、未提交。新增原生入口是 `native-demo.js`，唯一新增 adapter 是 `desktop/native-adapter.js`。
- 同一 master 有其他任务并行提交和未提交工作；本轮不覆盖其文件、签名配置、安装包或活动进程。提交时单独排除 `native_darwin.m` 开始前已有的 AX hidden-filter 修改。
- 固定开发路径为 `dist/OpenDesk.app` 及其 Helpers；测试聊天为 `.runtime/apps/OpenDeskSupportChat.app`。运行前验证签名，不用临时 App ID、ad-hoc 签名或系统权限重置。
- 稳定签名脚手架 `scripts/macos_signing.sh`、`run_macos_stable.sh` 等属于工作区并行签名任务，本轮复用其实际已验证版本，不替该任务提交。干净检出复现前需包含相应签名脚手架；本轮证据记录的是当前工作区构建，而非无其他改动的独立发布包。

## 本轮增量

1. 独立 AppKit fixture 展示虚构客户、会话、客户消息和草稿。没有发送按钮、服务、脚本执行器或给助手供消息的 IPC。每个客户拥有固定身份的独立 NSTextView，切换时脱离旧 editor，旧 AX 引用不能转写另一客户。
2. app-specific adapter 从完整、精确窗口 scope 的真实 AX 树提取消息。会话、客户、消息 ID、角色和正文相互核对；重复快照去重，相同正文的新 ID 保留。来源记录 backend/requestId/PID/windowID/AX identifier。
3. 使用现有 `watchAppWindow` 事件提示、`getAppWindow/current` 独立读回和 1000ms 兜底。绑定首次授权 PID、exePath、windowID；新窗口不自动继承授权。失焦、最小化、关闭、失效时停止观察并隐藏。
4. 新的独立 `ui.createTrustedWindow()` 支持固定本地 HTML 字节和双向 JSON 桥。普通 `ui.createWindow()` 仍禁用业务脚本。可信页面只有 `OpenDeskApp` 数据桥，不能直接调用 Runtime、File.read 或桌面 API。
5. React native 模式复用一个 root、原有六页与 reducer。原生消息包只更新其拥有的 binding；模拟发送、切换会话和设置提权被阻断。待填入请求包含 requestId、generation、PID、windowID、customerId、messageId、expectedDraft。
6. 写入前重新验证当前前台窗口、完整会话树、最新消息、草稿值和独立 editor；最多一次定向 setValue。完成后重新取原生完整树并比对，不能用 setter 回执或 React echo 证明成功。非空人工草稿拒绝覆盖。unknown 停止，禁止自动重放。

## 运行

从仓库根目录执行：

```sh
./examples/ai-customer-support/scripts/run-desktop.sh
```

在真实测试聊天输入消息并点「添加客户消息」，在助手选择三条推荐之一，再点「填入聊天草稿」。`verified` 仅表示本次独立原生草稿回读一致；始终未发送。关闭助手会结束本次 demo 并仅清理启动器自己创建的测试聊天子进程。已存在测试聊天时拒绝复用，不终止其 owner。

正式自动化 gate（同一工作目录）：

```sh
./examples/ai-customer-support/scripts/run-desktop.sh --verify
```

可信容器独立真实 Runtime API gate：

```sh
./dist/opendesk -ui -script-text "await (0,eval)(File.read('tests/runtime-api/trusted-app-window.js'))" -console-mode script
```

正式 gate 使用真实 AX 或针对本次 UI helper PID 的定向 AXPress 代替人工按控件，不注入 reducer、不执行 DOM 测试代码，不伪造外部草稿回读。原生模式的开关 input hit target 已与可见轨道同尺寸；精确窗口预检核对唯一控件、checked 状态、screen bounds 和仍未变化的窗口，再进行一次定向 AXPress。所有输入都只尝试一次，unknown 不重放。等待恢复时可重读短暂失败的只读状态。

维护者已刷新匹配当前源码的主程序和原生 UI host，并验证稳定签名。React 修改后的准备命令是 `npm --prefix examples/ai-customer-support run build`；原生修改后的准备命令是 `./scripts/build_macos_app.sh`。普通体验仍只需上述一条运行命令。

## 证据

所有运行日志、截图、探针、配置和哈希保存在 `.runtime/tests/ai-customer-support/r23/`，不进入版本控制。

- `baseline/`：开始时 HEAD、diff、二进制与源码来源。
- `native-build.log`：当前原生源码的构建及 codesign。
- `customui-tests.log`、`vet.log`：Custom UI 私有 seam 测试及静态检查。
- `react-tests.log`：类型检查、唯一 HTML 构建及 95 项 React/domain 回归。
- `adapter-tests.log`：4 项 adapter 与 10 项真实 host 函数 orchestration 回归；模拟测试不计为 Mac 实窗通过。
- `trusted-live.log` 与 `.runtime/tests/trusted-app-window/result.json`：实际 WKWebView JSON 往返、null/特殊文本、跨窗口隔离、JSON 上限、网络/CSP、eval/导航/popup 拒绝、普通窗口限制、关闭生命周期。
- 每个 `runs/<run-id>/` 包含 `launch.json`、`head.txt`、dirty stat、主程序/helper/fixture/HTML 及本轮源文件 SHA-256、`runtime.log`、`events.jsonl`、完整 AX 树、React commit 数据和独立 `draft-readback-*.json`。
- `fixture-oracle.json` 只为诊断和启动 readiness 保留，adapter 不读取其会话、消息或草稿。业务成功依据实际 AX 回读。
- 实窗截图依次为 `01-message-react.png`、`02-draft-verified.png`、`03-follow-resized.png`、`04-isolated-return.png`。需人工检查窗口、换行、按钮、滚动区域和回读状态；功能通过不自动代表视觉通过。

## 已观察的失败与修复

| 真实失败 | 处理与边界 |
|---|---|
| WebKit content rule regex 不接受使用的 disjunction | 拆为 HTTP(S) 与 WS(S) 两条规则，安装完成后才加载；独立实际容器 gate 已通过 |
| 初次显示动画让 WindowServer 暂时报告缩放 frame | 可信窗口禁用 AppKit 开窗动画；保留独立 `window.current` 核对 |
| AppKit 子进程已启动而 AX observer 尚未可注册 | 启动器等待自己的 fixture 已建窗，再绑定；readiness 文件不供消息识别 |
| AX 原生动作返回失败，但独立快照发现客户消息已添加 | 记录 unknown，检查实际后置条件，不重复添加 |
| 原生模式沿用了浏览器草稿覆盖 confirm | native 路由先交给受限 adapter，非空人工草稿直接拒绝覆盖 |
| `restoreByPID()` 对最小化窗口报告未找到 | 不修改通用 Runtime；测试采用正常应用 reopen，等待原 PID/原 windowID 真正恢复 |
| 最小化/恢复动画时 AX 短暂 TIMEOUT | 观察立即失效并隐藏；只读等待允许重新取状态，不根据事件提示恢复写权限 |
| hide/show 后 WebKit AX 元素保留过期窗口校准 | 测试按钮使用本次 helper PID 的定向 hit-test/AXPress；不沿用旧 ref；业务草稿仍使用精确原窗口 scope |
| 自绘开关 input 的 AX bounds 仅 2px，point hit 不支持 press | 只在 native CSS 中让实际 input 与原轨道同尺寸，不改可见风格；新的真实预检得到 40×24px |
| 应用级 WebKit AX snapshot 不完整 | 放弃该测试定位候选，保持精确窗口范围；不以不完整应用树授权操作 |
| `closeWindow()` 的按键回退未令 fixture 真正关闭 | 为测试客户端标准红色关闭按钮声明稳定 AX identifier，直接 invoke 一次并等待原 windowID 无法解析，不把按键回执当关闭成功 |
| 暂停与进行中的观察竞争，错误地隐藏恢复控件或覆盖撤权原因 | 按身份变化、暂停、撤权分别处理，停止写授权而保留正确原因；新增异步回归与实机重验 |
| 暂停/撤权后原观察分支不再检查窗口生命周期 | 仅继续核对已经绑定窗口的元数据，不再读聊天 AX 树，也不恢复权限；关闭后仍可隐藏助手 |
| 外部焦点变化打断正式 gate | 保留失败运行，停止输入；不会通过读取其他应用消息或自动重放前缀绕过 |

## 安全边界和未验证

- 无真实聊天账号、微信、订单后台、云模型、RAG 或自动发送。推荐来自已有的本地演示 domain 规则，不能表述为已经接入 LLM。
- AX 对独立 fixture 可用，因此本轮未增加 OCR fallback 或通用识别 Runtime，也没有资格化任意聊天布局。
- 外部 AX 没有原子 compare-and-set。固定 editor 身份防止跨客户重定向，写入前新快照降低竞态，但不证明可在任意真实应用中排除同客户的并发人工编辑；接入真实软件前必须单独验证并选择更强的 provider 契约。
- Linux/Windows/macOS 其他设备、多显示器、长期 soak、宿主崩溃恢复、真实账号授权流程未在本轮验证。没有以跨平台编译冒充 live。
- 全仓 `audit_test_architecture.js` 仍有开始前未登记 Go 文件/既有引用缺失，报告失败；本轮新增 `trusted_test.go` 已登记。不能声称全仓全部检查通过。

## 结果与评分

**Desktop Demo PASS（限定本机与独立 fixture）**。代码已修改、实际已加载、主要实窗布局已人工检查、核心功能已验证，四项分别有证据；没有把单元测试当实窗证据。

- 首次完整通过：`runs/20261029-184941-46348/`，22/22，主脚本 34.185s。
- 同源码重复通过：`runs/20261029-185236-49389/`，22/22，主脚本 32.977s。
- 普通一行命令：`runs/20261029-185048-47896/`，实际启动后输入电子发票问题，Native 提取和 React 推荐更新成功，原生关闭助手后正常清理。辅助探针先前漏填 WindowInfo.title 与读取不支持属性的失败有原日志；输入已经发生后没有重复添加消息。
- 三次均加载主脚本 SHA-256 `2fc97c0a0c3308abf53e0152001e255c70ccbacbd9f7b0612dfb2521c51a1217`、唯一 React HTML SHA-256 `eeb9328f78a2b5c69fd82a697337181e9708ba982e9cd6c19c1b5569208789e4`。
- 本轮原生输入文件更新时间均早于主程序/helper 的构建时间（18:21:56/18:21:55）；各次实际执行的完整路径、PID、codesign、二进制摘要与脏源码范围均有记录。运行时 HEAD 的并行提交不等于这些二进制已包含该提交。
- 已检查最终重复运行的草稿写入和跨会话返回截图，以及普通启动的发票截图；380px 助手随高度改变保持滚动内容与固定操作栏，未发现操作栏裁切、横向拉伸、按钮错位。未扩展主题/缩放/宽度矩阵。

评分用明确测试项的 **100 × 已通过项 / 总项** 计算；两轮同名用例分别计一次。React 和安全另计可信容器实际 gate。每维独立计分，允许一个场景为多个维度提供证据。可靠性 3/3 只表示当前源码的三次完整运行，样本量不支持推断长期故障率。完整映射与原始证据在 `.runtime/tests/ai-customer-support/r23/scores.json`，不作主观加分。

| 维度 | 实际计分项 | 通过/总项 | /100 |
|---|---|---:|---:|
| 窗口跟随 | 移动、缩放、失焦、最小化、同身份恢复、关闭隐藏、失效拒绝；各两轮 | 14/14 | 100 |
| 消息识别 | 空会话、真实消息到 React、重复快照去重、同文新 ID、切会话清旧消息；各两轮 | 10/10 | 100 |
| React 集成 | 真实挂载、原生消息渲染、推荐选用；各两轮，加独立桥 gate | 7/7 | 100 |
| 业务闭环 | 客户消息、人工选用、独立草稿回读、原客户草稿隔离；各两轮 | 8/8 | 100 |
| 安全 | 旧 editor、旧 binding、人工草稿、暂停、撤权、不能恢复授权、无效窗口；各两轮，加桥隔离 gate | 15/15 | 100 |
| 可靠性 | 最终完整运行、同源码重复、普通入口及退出清理 | 3/3 | 100 |

算术平均：`(100+100+100+100+100+100)/6 = 100`。这是**列明 Demo 场景的验收通过率**，不是产品生产成熟度评分，未验证项不因本表通过而变成通过。早先失败运行仍保留，不计作当前源码成功。

## Apple 官方依据

最小容器实现参考 Apple WebKit 文档：[WKWebViewConfiguration](https://developer.apple.com/documentation/webkit/wkwebviewconfiguration)、[WKContentWorld](https://developer.apple.com/documentation/webkit/wkcontentworld)、[WKURLSchemeHandler](https://developer.apple.com/documentation/webkit/wkurlschemehandler)、[WKContentRuleListStore](https://developer.apple.com/documentation/webkit/wkcontentruleliststore)、[WKFrameInfo](https://developer.apple.com/documentation/webkit/wkframeinfo) 和 [WWDC20 · Discover WKWebView enhancements](https://developer.apple.com/videos/play/wwdc2020/10188/)。页面 nonce、原 webView、main frame、精确 URL/security origin 校验、非持久 store、加载前 content rules 与固定 callAsyncJavaScript 参数共同构成桥边界；源码阅读和测试证据分别记录。
