# GOAL 02：命令能力只补 Runtime 接入差额，不重做 docs/command

依赖：File JSON GOAL 已完成。GOAL 00 本地差额表是本卡入口；本卡可以合法地以“无需产品代码修改”结束。

## 执行边界（本卡必须遵守）

仓库：`shopable-ai/opendesk`。这是补充 GOAL，不替换、不重跑正在执行的 `opendesk-file-json-goal.md`。

- 用户已明确 `docs/command` 对应命令行功能完成：以本地该文档、源码和当前证据为准，只复用和回归，不重新规划或实现同一能力。若本地提供了等价 JS 能力，直接使用，不为满足本卡建议名称另造 owner。远端未找到不等于本地缺失。
- File JSON、统一 WorkDir、文件异步 owner、原子写入由前一 GOAL 负责。它们完成后只消费其接口，不复制后端、不改写既定语义。前一任务仍在写同一工作区时，本卡只能只读核对，不能并行修改共享文件。
- 先读本地 `AGENTS.md`、`docs/command` 的实际入口、相关 `docs/api/`、`docs/implementation/runtime/runtime-api-development-workflow.md`，搜索所有已存在的等价能力。记录 HEAD、dirty 状态和基线失败；不得 reset/checkout 覆盖用户修改。
- 本卡新增接口是设计目标，不是已实现事实。已有能力满足目标则记录“复用/已验证”，不重复实现；缺少必要输入或证据则记录具体 Blocked/Not Evaluated，继续可独立完成的部分。
- 普通脚本由 Runtime 自动注入后直接使用；不要求 import、require、new、npm install 或 Node 解释器。开发期已有 Node 工具可以保留，不能当产品脚本运行器。
- Route A：Agent-to-Recipe，普通 JavaScript、现有正常执行入口、真实后置条件验证。不得创建 Recorder / IR / Compiler / 专用 Replay 主链，也不把本卡扩成新的 Workflow Engine。
- 文件清单是建议落点。先查同职责代码再复用；“新增候选”不是已存在文件。公共文档、类型、机器索引、manifest、JS 测试、Go 必要测试、公开示例一起同步。公共能力不能只由 Go 单测证明。
- 默认不新增 CLI 子命令/flag，不重新实现 `docs/command`。必要的内部接线只做向后兼容增量；若修改会破坏已完成命令契约，报告边界而不是擅自更换协议。
- 未获用户另行授权，不 commit、push 或创建 PR。原始证据只写 `.runtime/`；报告写实际命令、二进制来源/hash、运行结果和未验证项。

## 首先判定是哪一种完成状态

阅读本地 `docs/command` 对应正文、实现、示例与证据。不要仅凭名称判断完成了什么。

| 本地事实 | 本卡操作 |
|---|---|
| 普通 JS 已能直接调用进程能力，参数、取消、输出和生命周期都满足需求 | 不新增 child_process/System.exec/Shell/Command 的重复实现。仅复用并补必要验收。 |
| 原生命令后端已完成，JS 未直接注入 | 在同一后端上增加薄绑定，保留原方法和政策。 |
| 仅 OpenDesk 外部 CLI 的命令解析/调度完成 | 不重写 CLI；只实现缺失的 JS 到进程后端入口。 |
| 本地也找不到相应文档/实现，无法核对 | 标“命令范围未核对”，不猜测整项未完成；本卡只提交差额报告，继续其他独立卡。 |

对于本地已经完成但确有独立缺陷的能力，先报告缺陷与回归失败。本卡不以“补遗漏”为由全面重构已完成 command owner。

## 缺失时的目标调用

```js
// 仅作为缺失能力的建议命名；本地已有等价公开入口则沿用。
const result = await child_process.run(executable, args, {
  cwd: Execution.workdir,
  timeoutMs: 10_000,
});
```

新增 `run()` 是 OpenDesk 便捷接口，不宣称 Node 同名兼容；直接注入，不要求 require。返回 `{exitCode, signal, stdout, stderr, durationMs}`，成功结果必须来自实际结束的进程，不是启动确认。

默认 shell=false，参数数组；默认 cwd 使用前一 GOAL 的可信 WorkDir。若存在同名接口，严格使用已有字段名，不另造 timeout/timeoutMs 两套未说明的参数。

初次设计 `run` 的可选参数包含 timeoutMs、maxOutputBytes、input、signal、env、allowedExitCodes；所有未知字段拒绝。建议默认有限超时和有限输出，具体上限在本地契约和测试固定。局部超时不能扩大执行截止时间。

新 `run` 默认继承已授权的宿主环境，`env` 作为显式覆盖且 null 可移除键；只适用于可信本地程序并明确不构成沙箱。若本地已有更严格 env 规则则保留，不放宽。环境、argv、input、完整输出不得自动进入持久审计。使用 argv 传密钥会被 OS 进程查看，因此示例不这样做。

无路径的程序名按批准的 PATH 解析；记录可复核的已解析程序身份，但不要把解析当安全沙箱。处理当前目录可执行搜索、Windows PATHEXT/批处理差异，不能为兼容偷偷启 shell。平台不支持某模式就显式拒绝。

如业务确实已有 `execFile` 迁移需求，复用同一后端实现已声明 callback/ChildProcess 子集；不得将同名 execFile 偷换成 Promise 结果。`execFile` 兼容不是 run 的前置。首批不因名称兼容引入 npm、完整 streams、fork/IPC、detached 或同步阻塞 API。

## 不允许缺失的内部契约

原生等待异步；Goja 只由 owner EventLoop 访问。默认关联已有执行上下文，局部 signal 只能收紧。进程、管道、输出采集、回调纳入现有 RuntimeLifecycle，并与 File JSON 的计数累加，不覆盖。

正常退出、非零退出、启动失败、超时、取消、输出超限分别有稳定错误。stdout/stderr 独立有界采集，同时排空避免管道死锁；达到限额后按已声明政策取消，禁止静默截断并返回成功。stdin 写完关闭，EPIPE 有结果。

必须等待 Wait/reap，控制超时后仍被后代持有的管道。Unix 进程组、Windows Job Object 等按目标平台实现和验收；不能把 CommandContext 默认行为当整棵进程树保证。可信工具主动逃离进程组等边界如实说明。

默认不授权远程 HTTP/MCP 通道通用进程执行；宿主已有 gate 与权限为权威，不允许 request input 自行授权。NativeExtensions 的既有本机信任边界不能因共用部分 OS helper 被削弱。

允许授权后用进程能力调用 `opendesk ai run`，但不宣称自动获得父子执行关系、权限衰减、业务结果汇总或桌面隔离。进程入口不是沙箱。

## 文件清单（条件性，先映射已有 owner）

| 类型 | 路径/定位 | 变动 |
|---|---|---|
| 复用且默认不重写 | `docs/command` 指向的命令、进程后端与安装能力 | 先写 actual owner mapping，现成能力直接调用。 |
| 新增候选 | `automation/child_process.go` | 仅确无绑定时新增 native owner/Promise adapter。 |
| 新增候选 | `automation/child_process_backend.go`、对应平台文件 | 仅没有可复用后端时；不与现有命令后端平行实现。 |
| 修改 | `automation/utils.go`、`pkg/execution/runner.go` | 缺失时加注入、授权接线与 owner 生命周期；不改旧 File owner。 |
| 新增候选 | `types/child_process.d.ts`、`docs/api/child-process.md` | 仅实际选择该全局时；现有 API 文档是唯一调用契约。 |
| 新增候选 | `automation/child_process_test.go`、`pkg/execution/child_process_test.go` | 受控 fixture、事件循环、进程树和取消竞争。 |
| 新增候选 | `tests/runtime-api/unit/child-process.test.js`、`tests/runtime-api/acceptance/child-process.js`、`examples/child-process.js` | 真正 JS 公共行为。 |
| 条件新增 | `tests/runtime-api/tools/process-fixture/` | 跨平台小型受控测试程序，支持 argv/stdin/output/exit/child 模式；二进制输出到 .runtime。 |
| 修改 | 对应 docs/API index/manifest/测试 gate | 只记录真实公开方法，不改已完成 CLI 路由。 |

## 验收重点

中文和空格 argv 不丢失；metacharacters 原样传递且不执行 shell；独立 cwd；env 覆盖不修改宿主；不存在程序；权限拒绝；非零退出；大 stdout+stderr；stdin EOF；局部取消；整个执行超时；未 await；timer 在进程等待时运行；连续多轮运行无所属残留。

若本地 docs/command 已满足所有项，本卡交付“复用现有命令能力”，不为追求改动数量添加一个新 API。

## 共同验收与交付

先运行本卡最小确定性测试，再按本地现有入口运行 contract、相关 unit 和 smoke；公开示例必须另行通过本次构建的 `./dist/opendesk ai run <script.js>` 原样执行。不要假设单独 `go build` 就已经配齐发行资源，应使用当前仓库的实际构建/打包流程。

涉及共享注册与 Runtime owner 的变动，追加已完成 File JSON 的回归，但不得以此重做其实现。新 gate 复用现有 watchdog、run context、日志与 hash 机制。不得使旧测试的动态 `covers` 自动声称覆盖未执行的新方法。

评审：架构/兼容 20、公开契约/数据正确性 20、生命周期/可靠性 20、安全/隐私 15、易用与交付 10、真实测试和文档证据 15。>=95 且全部相关硬门槛通过才可声明本卡完成；不以主观评分代替证据，不把本卡评分推广成整个项目评分。

硬门槛：不覆盖用户工作；不重复已完成命令和 File JSON；不依赖 Node 执行普通 recipe；不伪造 capability/平台/测试状态；不吞错假成功；不遗留本卡拥有的可控资源；不跨执行串数据；正式入口证据成立。无法运行的测试标 Not Evaluated 或 Blocked，不算通过。

最终输出：本地差额判断、实际新增/修改文件、复用/跳过项及理由、调用示例、命令结果、证据路径、评分和风险。若已等价完成，可以零产品代码改动交付核对和现有证据，不制造无意义 diff。
