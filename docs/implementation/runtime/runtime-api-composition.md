---
title: Runtime API composition
description: OpenDesk JavaScript Runtime 的内部注入、polyfill、compatibility facade 与资源组成说明。
order: 13
---

# Runtime API composition

本文面向 OpenDesk 维护者，记录 JavaScript Runtime 的内部组成与排障边界。用户应从
[JavaScript Runtime](../../api/runtime.md) 和对应 API 页面了解可调用契约；不要把这里的内部名
当作公开接口。

## 文档职责

| 位置 | 负责回答的问题 |
| --- | --- |
| `docs/api/` | 用户能调用什么，参数、返回值、平台限制、错误和示例是什么。 |
| `docs/implementation/` | Runtime 如何组装，内部对象、资源与架构边界是什么。 |
| `docs/maintenance/` | Markdown、机器索引、类型和测试如何同步维护。 |

Go native method 到 Goja function 的反射、参数/返回/错误投影，以及 `page____Inject` 到
`page` 的两层映射详见 [Go to JavaScript Runtime binding model](./goja-binding-model.md)。

## Runtime API 形成过程

`automation.InitJSWithOptions()` 的组装顺序应保持可追溯。当前主链路依次：

1. 注册 `console`、`http` 与 timers，然后注册 `System`、`window`、`clipboard`、
   `Command`、`globalShortcut`、`File`、`AppStorage`、`Sound`、`Audio`、`ImageColor`、`OCR` 和 `Vision`。
   `File` 先映射旧同步方法，再由 `automation/file_json.go` 显式增强同一个对象的 `readJSON` /
   `writeJSON`；它不是 polyfill，也不创建第二个 File global。
2. 根据显式 gate 注册 `NativeExtensions` / `NativeExtension`，再注册 Custom UI 和始终
   fail-closed 的 `Dialog`。
3. 创建 `mouse`、`keyboard`、`touchscreen`、`page`，以及原始 `browser` / `context` 对象，
   并在加载 polyfill 前提供 notify bridge。
4. 按文件名顺序加载 `polyfills/*.js`，再加载 `jslibs/*.js`。
5. 接入运行期 console event sink，注入 `Screen`，并把 `Screen.screenshot` 绑定到
   `page.screenshot`。

因此用户看到的是 native 对象、polyfill 增强、JS libraries 与 stack facade 的组合，而不是
单一 Go 方法集合。用户调用入口仍须以 `docs/api/` 标明的 Stable / Conditional 契约为准。

## 原生对象、polyfill 与 facade

- native binding 提供底层桌面、系统、输入、视觉和文件能力；对应用户语义应写在 API 页面。
- polyfill 负责用户层组合与别名，例如等待、权限辅助、`axios`、全局 Promise / timer 能力。
- `Sound` 与 `Audio` 当前是 first-party native Runtime globals，不是 `polyfills/` 文件提供的接口：
  `automation/utils.go` 在统一 Runtime Builder 中分别调用 `registerSound` / `registerAudio`。
  `Sound` 因为包含 execution-scoped playback handle 和 EventLoop completion bridge，必须由 native
  owner 注册；不要在 `polyfills/` 中再创建同名 facade 或第二套播放器。
- `Command` 同样是 first-party native owner。它始终注册一个可检测的 namespace；本地 `-script` 和
  `ai run` 默认启用，HTTP、MCP 与 Scheduler execution 关闭。命令进程、stdio、timeout 和 Promise
  都归当前 `RuntimeLifecycle`。Goja 的 CommonJS `require()` 不参与该能力，也不注册伪 Node
  `child_process`。
- `legacy`、`upgraded`、`playwright` facade 主要服务迁移；它们不承诺完整第三方浏览器库语义。
- `Dialog` 的公开行为、能力 gate 与隐私边界留在 [Dialog API](../../api/dialog.md)，实现时不要
  通过 facade 再造第二套 dialog 逻辑。

当前 core `polyfills/` 的逐文件职责如下；这张表只记录最终公开 surface 和实现角色，不把内部
`____Inject` bridge 当作用户 API：

| 文件 | 公开 surface | 角色 |
| --- | --- | --- |
| `000-console.js` | `console` | native console sink 的 JS 参数/输出包装 |
| `000-dialog.js` | `alert` / `confirm` / `prompt` | 单一 native `Dialog` 的异步别名 |
| `000-global.js` | `copyToClipboard` / `getClipboard` | `clipboard` 的全局便捷函数 |
| `000-page.js` | `page` | page raw binding 的截图、权限和兼容包装 |
| `000-systemBase.js` | `notify` | native notify bridge 的参数校验包装 |
| `001-promise.js` | `Promise`（仅缺失时） | 兼容性 fallback |
| `001-timers.js` | `requestAnimationFrame` / `cancelAnimationFrame` | timer 之上的 JS 兼容函数 |
| `002-sleep.js` | `sleep` / `delay` / `sleepSeconds` | timer 之上的等待别名 |
| `003-window.js` | `window` 结果形状 | native window 返回值规范化 |
| `004-axios.js` | `AbortController` / `axios` | HTTP bridge 的 JS client 与取消兼容层 |
| `010-browser-automation-upgraded.js` | upgraded / playwright-shaped `page`、`browser`、`context`、`Automation` | legacy raw binding 之上的迁移 facade |
| `url-search-params.js` / `url.js` | `URLSearchParams` / `URL`（按需 fallback） | 标准 Web 参数对象兼容实现 |
| `000-demo.js` | 无 | 保留的历史注释示例，不是 API owner |

`Sound` 与 `Audio` 不在这张表中是有意为之：它们由 native Runtime 直接注册，不能通过新增
`polyfills/sound.js` 或 `polyfills/audio.js` 补齐。

## 内部注入面

`page____Inject`、`browser____Inject`、`context____Inject` 是 polyfill / facade 的内部构造面。
它们可以为 Runtime 实现保留，但不应出现在面向用户的脚本示例、类型声明或机器索引中，也不
应被标记为 Stable API。

`NativeExtensions` 与低层 `NativeExtension` 的 gate、manifest discovery 和 one-shot process
边界属于实现与安全设计；公开调用形状、安装说明和 Experimental 限制只在
[Native Extension API](../../api/native-extension.md) 中向用户说明。

## 资源与 stack 排障

`polyfills/` 与 `jslibs/` 的资源查找、加载失败和发布路径属于运行时交付问题，不应把这类
实现细节写进普通 API 教程。排障时确认：

1. 可执行文件及其资源来自同一构建产物。
2. 目标 stack 的 facade 已被实际选中。
3. 失败接口的 native binding、polyfill 与 compatibility layer 各自的测试均被覆盖。
4. 不要将 facade 缺口误报为完整 DOM / Playwright 兼容性回归。

## 变更同步

内部组成变化如果改变用户可见能力、参数、返回、注入条件或默认行为，必须同步更新用户 API
页面、`runtime-api.ai.json`、`types/*.d.ts` 和相应 JavaScript Runtime API 测试。具体治理流程
见 [Runtime API development workflow](./runtime-api-development-workflow.md) 与 [API documentation maintenance](../../maintenance/docs-user-api-editme-toc-maintenance.md)。

Sound / Audio / Command 这类 native global 的同步闭环是：

```text
automation/sound.go 或 automation/audio.go
→ automation/utils.go 的 Runtime 注册
→ docs/api/sound.md 或 docs/api/audio.md
→ types/Sound.d.ts 或 types/Audio.d.ts
→ docs/api/runtime-api.ai.json
→ tests/runtime-api/unit/*.test.js
```

只有增加纯 JS 组合、默认值或兼容 facade 时，才应增加对应 `polyfills/*.js` 并在文档中标明
它的 owner；不能因为接口可由 JavaScript 调用，就把 native Runtime API 误归类为 polyfill。

`Command` 的 native owner 使用 `automation/command.go` 与平台 `command_*.go`，公开契约位于
`docs/api/command.md`、`types/Command.d.ts`，行为 gate 由 Runtime API 测试覆盖。

小写 `path` 的 native owner 是 `automation/path.go`。它只做目标平台路径字符串计算，没有资源
生命周期；`automation/utils.go` 在创建 execution-owned `FileSystem` 后，用同一个 `File.cwd()`
注册 `path`，避免第二套 cwd 解析。可信源码绝对路径由各 transport 单独写入内部 Request，
`pkg/execution` 只规范化该字段并注入 `Execution.scriptPath/scriptDir`，不会解析来源标签。

项目环境的文件解析 owner 是 `pkg/runtimeenv`，execution 注入 owner 是 `pkg/execution`。
本地 CLI 在创建 Request 前解析 `.env` / `.opendesk.env`（或显式环境文件），再以进程启动时继承的
OS 环境覆盖文件；它不会启动 login shell 或读取 shell startup 文件。Windows 键名统一为大写并按
大小写不敏感语义合并；HTTP、MCP、Scheduler Request 不填宿主环境。Runner 复制并校验快照，注册冻结、
null-prototype 的 `Execution.env`，同时经 `InitJSOptions` 交给 `Command` 作为子进程环境基线。
`System.getEnv()` / `System.hasEnv()` 也只闭包读取这份经过复制的快照，不在调用时访问 `os.Environ`。
这条数据流不调用 `os.Setenv`，也不允许 remote execution 回退读取宿主环境。

`File.readJSON` / `File.writeJSON` 的 native owner 是 `automation/file_json.go`，普通文件 I/O 与
临时文件/替换实现位于 `automation/file_json_io.go` 和互斥的平台后端。Runner 在 execution 开始时将
同一个规范化绝对 WorkDir 同时传给 `FileSystem` 与 `Execution.workdir`。JSON 编解码、Promise settle
与 AbortSignal listener 都在 Goja EventLoop owner；worker 只接收不可变 Go 请求。其 `CancelPending`、
`Wait`、`AsyncCounts`、`ResourceCounts`、`IsZero` 和 runner cleanup event 均属于
`RuntimeLifecycle`，因此未 await 的操作不能在脚本返回时脱离 execution。
