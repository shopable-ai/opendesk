# AI 客服 App Mode 阶段验收（2026-10-29）

## 最新续接：动态面板 AX、状态保持与启动诊断

本次限定范围已交付：补齐可复跑的原生 AX 专项 gate、浏览器状态回归、新鲜来源和生命周期证据，并完成有界 CPU 静态诊断。**AX 间歇性缺失和 CPU 启动异常均未修复；视觉并非全项通过**，商品详情图上缘的示意文字仍有裁切。不能把后面的成功样本表述为 native 缺陷已消除。

需求来源为本对话的标准 App Mode 续接要求；UI 依据为当前六页源码及本次 `baseline-ui/settings.png`，不作重设计。现有未提交的 App 实现是输入，HEAD 为 `c65848c246c516d111b8cd12b947f33a6cbc70a7`、分支为 `master`。本次未提交或推送，未核验远端最新状态；未改动或重编译 Go/native，未改签名、权限、模型路由或其他任务的服务。

### 本次文件与修正

| 文件 | 变化及用途 |
| --- | --- |
| `examples/ai-customer-support/tests/browser-smoke.mjs` | 增加未连接 App 的 Bridge stub、禁用授权/托管/回读、商品查询和详情、设置及页面往返状态回归；新增 `SUPPORT_TEST_EVIDENCE` 分离证据目录。stub 不提供 binding 或观察数据。 |
| `tests/custom-ui/ai-customer-support-app-native.js` | 新增 `strictAX`：必须找到全部五个原生 checkbox，实际切换两个本地设置、独立 AX 回读、返回/重开后再次核对并恢复；验证商品详情保留和草稿禁用。每次快照落盘，未知动作停止；截图前后核验自身窗口身份、几何与前台状态。 |
| `tests/custom-ui/tools/support-app/run-app-native.mjs` | 新增正式 runner，只在新的 `.runtime/` staging 副本追加测试和 quit，自动取得本次 PID/handle；同时核验进程退出和 gate 结果，缺结果或失败时退出 1，不能被 Runtime 的成功 summary 掩盖。 |
| `examples/ai-customer-support/README.md` | 更新本轮公开命令、正式 gate、证据路径和宿主限制。 |
| 本报告 | 分开记录本次样本、失败诊断、历史证据和未完成事项。 |

试过一个保持面板 mounted 的 JS 显隐候选（`visibility:hidden` / absolute / inert），没有取得有效的原生修复证明，已完整撤回；最终 `Common.tsx`、HTML、integrity 与入场快照一致。未采用 remount、搬 DOM、重置 reducer 或增加延时作为修复。当前产品入口、App adapter、React 和样式没有保留本次实验差量。

### 新鲜验证与证据

所有下列路径均相对于本次证据根目录 `.runtime/tests/ai-customer-support/app-mode-ax-20261029/`；与后文前阶段的 `app-mode/` 区分。

| 验证 | 本次结果 | 证据 |
| --- | --- | --- |
| 类型检查、React 构建、单元 | 通过；100/100 单元 | `typecheck.log`、`final-build.log`、`unit-tests.log` |
| package / R2.3 adapter 离线检查 | 23/23 | `package-tests.log` |
| 核心浏览器 | 14/14；隔离的 macOS headless Google Chrome；未跑宽度/缩放矩阵 | `browser-final.log`、`browser-final/` |
| 原生 AX 专项 | 3/3；五个 checkbox 本次均出现；授权、托管、模拟回读保持禁用；跟随/继续观察切换、返回、回读与恢复通过 | `native-final/run.json`、`native-final/ui/ax-settings-coverage.json`、`observation-*.json`、`strict-settings.png` |
| 六页与商品/设置功能 | 11/11；部分内容使用预先选择的窗口内 OCR，不能证明 AX 完整 | `core-final/run.json`、`core-final/ui/` |
| 原样公开命令 | 加载当前源码目录与正式入口，JSON Bridge 确认未连接；正常退出 0 | `app/stdout.log`、`app/summary.json` |
| 单实例与原生关窗 | 第二次启动退出 0；同一日志各一次 startup、bridge-confirmed、second-instance；自身关闭按钮触发退出，主进程 1801 / helper 1802 均释放 | `public-lifecycle.json`、`app-second-launch/`、`public-ui/close-result.json`、`public-close/` |
| 实窗视觉 | 已逐张查看六页、详情、设置八张图及 AX 专项设置图。导航、开关、输入和文本布局正常；未连接页面的留白与长内容滚动符合当前状态。**商品详情图上缘文字裁切，故视觉整体不判全通过** | `core-final/ui/page-0..5.png`、`product-detail.png`、`settings.png`；`native-final/ui/strict-settings.png` |
| 来源和边界 | 主程序、host、入口和 HTML 哈希复核一致；签名检查通过；无真实聊天、云 AI、草稿或发送 | `provenance.json`、`verification.json` |

普通体验命令已从仓库根目录原样运行；无需测试 instrumentation：

```sh
./dist/opendesk -app examples/ai-customer-support -console-mode script -log-dir .runtime/tests/ai-customer-support/app-mode-ax-20261029/app
```

正式 gate 的实际命令如下，均从仓库根目录运行。目录须未存在；它们会操作自己的测试窗口并退出，不是普通体验步骤。

```sh
node tests/custom-ui/tools/support-app/run-app-native.mjs strict-ax .runtime/tests/ai-customer-support/app-mode-ax-20261029/native-final
node tests/custom-ui/tools/support-app/run-app-native.mjs core .runtime/tests/ai-customer-support/app-mode-ax-20261029/core-final
```

两个 gate 的入口都是测试副本，不是公开入口：`run.json` 分别记录 public / instrumented entry 和 gate 哈希。产品 HTML 均为 `09bca5b5b77b05aaf0518013c8d1b1cb4fee902a5bc2373be300bc567b9747fc`，正式入口为 `57dff749cf25ebeea95d8d7256057f4e4e6f200897195846c1050894f9c76c1a`。复用的 Runtime 主程序和 host 哈希、21:31:23 构建时间及 dirty VCS 详情见后文，入场与结束均复核，没有以源码阅读替代实际加载。

### AX 缺口的最小案例与 owner 边界

本次基线公开 App 启动后，依次进入商品、设置；设置截图有完整内容，但同窗 `Accessibility.snapshot`（`maxDepth:48`、`maxNodes:2500`）仅有 18 节点、深度 7、零 checkbox，仍返回 `complete:true` / `truncated:false`。见 `baseline-ui/settings.json` 与同名 PNG；同一执行的商品快照有 44 节点。这个案例说明“API 完成遍历”不足以证明业务所需节点存在。

可复查的最小入口是上面的公开命令及商品→设置顺序，再对其本次 `window.current` 结果做相同原生快照；正式 `strict-ax` runner 直接进入设置并强制要求五个节点，缺节点即失败。问题是间歇性的，两种顺序都不能承诺每次复现。最终原产品字节未变却出现完整 AX 成功样本，因此无法归因于已修复的 React 代码。

本轮调整了测试动作语义：观察到 radioButton 的原生 `select` ACK 没有触发 React 导航后，另开执行预先选择 PID 定向点击导航；checkbox 仍使用文档定义的原生 `setChecked`。每步依赖新快照证明应用结果，不在未知动作后切换 backend 或重放前缀。候选实验中的遮挡图、陈旧目标/激活错误及 `strict-app-final/` 的 select 超时均为诊断失败，不能混入最终通过计数；`candidate-inline-ui/initial.png` 被 Chrome 遮挡，明确排除。

只读源码检查显示 `automation/accessibility_backend_darwin.go` 的 `darwinAXTraversal.buildNode` 依赖 provider 的 AXChildren；已 materialized 的空数组会结束该支遍历，不必标记 incomplete。这是需要 native owner 对照原始 AXChildren、WebKit 动态更新与 host 身份/坐标继续定位的边界，**不是已证明的具体根因**。后续 native 修复必须保留本次状态与无写权限回归，不用重挂载规避。

### CPU 启动异常的有界结论

旧阶段的 `unsafe.Slice: ptr is nil and len is not zero` 没有完整落盘失败堆栈；本次实际启动输出未复现，没有压力循环、native 修改或修复结论。只读依赖与现有二进制反汇编将匹配路径收敛为：`cmd/opendesk/main.go:43` → robotgo → `vcaesar/gops@v0.40.0` → `gopsutil/v4@v4.24.9/process` → `cpu.init`（`cpu/cpu.go:61-64`）→ `Times(true)` → Darwin `perCPUTimes` → `unsafe.Slice(cpuload,ncpu)`（`cpu/cpu_darwin.go:158`）。二进制确实包含这条 init 路径及 nil panic 分支；发生阶段在 main / JS 之前，App 层无法 recover。

证据可信度高的是依赖路径、版本和二进制分支；具体失败原因仍未知。中高可信候选是 `internal/common/common_darwin.go:233-234` 把 `HostProcessorInfoFunc` 的第四个输出参数声明为 `uintptr`，调用端将 `&cpuload` 隐藏为整数传过 purego reflect bridge；二进制中 cpuload 位于栈上而 count/ncpu 位于堆上。若桥内栈移动，可能形成 nil / 非零组合，但本轮没有观察到该失败过程，不能把推断写成根因。

native owner 的最小下一步是保留下一次失败的完整 stderr / PC；确认栈帧匹配后，独立验证第四输出参数改为编译器可见 `unsafe.Pointer` 的候选。不要把 nil guard、重试、JS 延时或 main 级 recover 当作修复。完整只读诊断、模块缓存路径与反汇编地址保存在 `cpu-static.md`。本轮不执行这项 native 后续，也未重建 dist。

### 本次交付状态

代码：测试与文档已修改，产品实验已撤回。实际加载：正式入口和两个 staging gate 均有新 PID/handle 与哈希。功能：上述范围已验证。视觉：已观察，有商品图裁切缺口，非全通过。AX/CPU：已交付证据与修复边界，未修复。前阶段搬移、篡改拒绝与 app validate/doctor 没有本次重跑，仍只引用下列历史证据。真实聊天、云 AI、外部写入、可双击发行和跨平台 live 继续延期。

## 前阶段：标准 App Mode 包与搬移（历史证据）

以下记录来自本次续接之前的同日阶段，证据根为 `app-mode/`；旧通过计数、视觉和缺口描述不替代上面的最新结果。该阶段目标是把已有六页 React 和唯一业务状态组织成标准 App Mode package，验证加载、交互、JSON Bridge、单实例、退出及搬移。不能据此声称真实聊天、云 AI、草稿写入或发送可用。

工作目录为仓库根目录 `/Users/shopme/Documents/workspace/opendesk`。本轮只修改 App 层 JavaScript、React 连接、构建/staging、测试及文档；没有修改或重编译 Go/native，没有创建分支、提交或推送。共享工作区另有并行修改，未纳入本轮结论。

### 目标与关键测试条件

| 条件 | 本轮结果与证据 |
| --- | --- |
| schema-v1 Manifest、稳定身份、入口与主窗口一致 | `com.opendesk.ai-customer-support` / `main.js` / `supportReactR23`；`validate.log`、`doctor.log` 均通过。 |
| 复用原六页、设置、唯一 reducer 与正式 HTML | 实际 `-app` 加载 `preview/index.html`；六页切换、商品详情往返、设置返回前页通过。未另建业务 UI 或状态实现。 |
| 真实双向 JSON 传输，握手不授予业务权限 | 实窗日志有 `support.ready` → hostReady → clientReady 的 `bridge-confirmed`；无聊天 binding，填入草稿按钮禁用。 |
| 异常数据和失配资源必须拒绝 | 单元测试拒绝多余字段、错误协议、伪 observation/fill/quit/eval/授权消息；真实运行中修改 HTML 而保留旧哈希，返回 `INVALID_SPEC: trusted HTML SHA-256 mismatch`，退出码 1，符合预期。 |
| 单实例不重复入口 | 第二次启动返回原实例；同一日志只有一次 startup、一次 bridge-confirmed，并记录 `source: second-instance`。 |
| 用户关窗、程序 quit、重启与资源释放 | 原生关闭按钮使 App 正常退出；独立测试包调用 `automation.app.quit()` 正常退出；随后搬移包可重新启动。被观察的自身 helper PID 均退出，未结束其他服务。 |
| 最小包搬移后不依赖 App 源码或旧桌面补丁 | 只含 5 个文件，移动至 `.runtime/packages/ai-customer-support-relocated/app`，从独立 foreign-cwd 以绝对 `-app` 路径成功启动、握手、截图、关窗；源与包逐文件哈希一致。 |
| 当前真实窗口视觉符合原界面 | 实看六页、商品详情、设置共 8 张最终截图及搬移后新截图。380×720 逻辑窗口中导航、按钮及文本排列正常，长内容在面板滚动。未连接的回复/订单留白属于当前状态。 |
| 定向回归通过 | 类型检查、React 构建、100 项单元、23 项包/既有 adapter 离线检查、12 项浏览器核心场景及 11 项实窗检查通过。 |

搬移结论针对 **App 自身的 5 个文件**。它仍使用现有 OpenDesk Runtime；本机 Runtime 日志显示加载仓库的 `polyfills/`，本轮没有验证脱离该 Runtime 的独立发行安装。

### 实现与修复

- 新增标准 `opendesk.app.json` 和 `main.js`，由 App Shell 管理窗口生命期，无保活循环。
- `desktop/app-host.js` 只负责固定哈希加载、受限 JSON 握手及监听清理；React 的 `state.tsx` / domain 仍是唯一业务状态来源。此入口没有聊天 provider。
- React 增加独立 App 握手确认，停止无观察数据时的 ready 重发，不伪造客户、授权或回执。设置面板改为有名称的 region；这项语义修正未解决下述原生 AX 缺口。
- 正式构建同步生成 `desktop/app-integrity.json`。staging 固定 5 文件 allowlist，拒绝覆盖、symlink、目录逃逸和失配哈希。
- 修复 `npm --prefix` 改变工作目录后相对 staging 目标解析错误：目标统一按仓库根目录解释，补充跨 cwd 子进程回归，并原样运行文档中的自选目录命令。
- 浏览器检查可显式选择已有 Chromium，日志如实记录平台和可执行文件。本机默认 Playwright 浏览器缺失，改用已有 Chrome 完成检查，没有下载浏览器。
- 实窗 gate 按角色和六个业务标签判定导航；商品/设置的部分内容采用预先选定的窗口内 OCR 与定向 PID 输入，结果再独立回读。修正了 gate 原先把嵌套 radio 也算作业务导航、以及设置 OCR 使用 contains 导致的歧义。

### 运行与可复查证据

下列命令均从仓库根目录执行。公开的一行命令已原样运行：

```sh
./dist/opendesk -app examples/ai-customer-support -console-mode script -log-dir .runtime/tests/ai-customer-support/app-mode/app
```

构建和定向回归命令：

```sh
npm --prefix examples/ai-customer-support run typecheck
npm --prefix examples/ai-customer-support run build
npm --prefix examples/ai-customer-support test
node --test tests/custom-ui/ai-customer-support-app-package.test.cjs tests/custom-ui/ai-customer-support-r23.test.cjs tests/custom-ui/ai-customer-support-r23-safety.test.cjs
PLAYWRIGHT_CHROMIUM_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm --prefix examples/ai-customer-support run test:browser -- --core
```

正式实窗 gate 为 `tests/custom-ui/ai-customer-support-app-native.js`。它需要从本次 startup 日志取得新 PID / nativeWindowId，不能复用旧 `target.json`；README 的普通体验命令无需运行此 gate。

本轮运行产物统一保留在 `.runtime/tests/ai-customer-support/app-mode/`（本地可清理、不入版本控制）：

| 证据 | 内容 |
| --- | --- |
| `typecheck.log` / `build.log` / `unit-tests.log` | 类型、最终构建及 100/100。 |
| `package-tests.log` / `browser-tests.log` / `stage-command.log` | 23/23 离线、12/12 headless Chromium 及文档 staging 命令。浏览器中的发送/草稿场景使用模拟数据，不是真实外部写入证据。 |
| `result.json` / `page-0..5.png` / `product-detail.png` / `settings.png` | 最终 11 项实窗功能检查与视觉观察；各截图旁有 AX 快照。 |
| `app/summary.json` / `app/stdout.log` / `app-second-launch/` / `close-result.json` | 公开命令、实际入口哈希、双向握手、第二次启动与用户关窗。 |
| `tamper-run/summary.json` | 预期失败的真实 HTML 哈希拒绝。 |
| `quit-run/summary.json` | 测试包在入口后追加 sleep 和 quit 的主动退出证据；入口哈希与正式产品不同，不能当作公开命令运行证据。 |
| `package-hashes.json` / `relocated-recheck-run/` / `relocated-recheck-ui/` | 搬移包逐文件哈希、真实加载根目录、新实窗图及关闭结果。 |
| `verification.json` / `runtime-provenance.txt` | 汇总、主程序/host 来源及运行限制。 |

最终 HTML SHA-256：`09bca5b5b77b05aaf0518013c8d1b1cb4fee902a5bc2373be300bc567b9747fc`。公开入口 SHA-256：`57dff749cf25ebeea95d8d7256057f4e4e6f200897195846c1050894f9c76c1a`。

实际复用的主程序为 `dist/OpenDesk.app/Contents/MacOS/opendesk`（`dist/opendesk` 的目标），实际 UI host 为 `dist/opendesk-ui-host`，其字节与 bundle helper 一致。两者构建时间为本机 2026-10-29 21:31:23，VCS 为 `c65848c246c516d111b8cd12b947f33a6cbc70a7`、`vcs.modified=true`，darwin/amd64，Runtime 2.0.1。不能称为干净提交的构建。

主程序 SHA-256 为 `87276091384883f8eb132bae733e881db2ae571bc4180ea8b49903a55222f5b0`；host 为 `3fe00561a1fdfffaa0e2d0c295517d752961dabdeee39e0b8da2096a8d974b35`。严格签名检查通过；标识分别为 `com.opendesk.cli` 和 `com.opendesk.cli.Helpers.opendesk-ui-host`，证书 leaf 均为 `6a3487d1d884ca77ab04b380e0186e23f8e1ee39`。本轮没有更换身份或权限。

UI 交付状态：**代码已修改、实际已加载、视觉已确认、上述范围的功能已验证**。静态测试、浏览器、普通启动、自动化 gate 和视觉检查分别取证，没有互相替代。

### 未解决限制与下一阶段条件

1. WebKit 原生 AX 快照在部分动态面板只返回外层导航，缺少可见内容；商品和设置通过窗口内 OCR 验证，但原生 checkbox AX 覆盖不完整。补 `aria-hidden` 的候选实测无效，已撤回；不能声称 AX 问题已修复。后续需独立验证 WebKit/host 子树更新，任何修复都必须保留 React 局部状态和原交互。
2. 一次验收进程在启动阶段的 gopsutil/v4 CPU 探测中出现 `unsafe.Slice: ptr is nil and len is not zero`，当时尚未输入；随后启动成功。错误见本次会话工具输出，未找到完整落盘堆栈。本轮未修改 native，因此该宿主问题仍需跟进，不能用重试宣称已修复。
3. 首次搬移截图被其他窗口遮挡，保留为 `relocated-ui/window-occluded.png`，不作视觉通过证据。重新启动并核对前台窗口后，`relocated-recheck-ui/window.png` 已人工确认。
4. `failed-gate-01..04.json` 等为诊断历史，不能与最终 PASS 混用；最终结论绑定上述 HTML 哈希和新鲜窗口。早期两次写在 example 下的运行目录已迁至顶层证据的 `legacy-app-runs/`，其中旧 summary 的原路径没有重写。
5. 真实微信/动态真实会话、云 AI、真实草稿/发送和可双击 `.app` 发行继续延期。Windows/Linux 未作本轮运行验收。下一阶段启用真实外部写入前，必须另行明确 provider、授权、独立结果回读和未知动作停止条件。
