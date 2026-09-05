# GOAL 08（需求触发后）：长进程与受管子 Execution

这是前文讨论过但不应隐藏的后续范围；默认不包含在第一批续做中。仅在业务确需实时输出/交互输入或真正的父子任务协议时选此卡。不要因为需要循环执行步骤就建设它。

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

## 两种需求分别处理

1. 长时间外部工具：先复用 docs/command 已有 spawn/stream/handle。若缺失，扩展 GOAL 02 的同一进程 owner，不增加第二套进程后端。使用 `spawn` 名称时必须写明支持的 Node 子集；exit 与 close、error 次数、stdout/stderr、stdin、回压、终止和 owner 回收分别定义。不能把一次性 run 的整个输出伪装成实时 stream。

2. 受管子执行：普通函数是同一个 execution 的代码复用；用现有命令启动 opendesk ai run 可以得到另一次执行，但不自动带父子授权/结果/取消关系。仅当这部分关系是明确业务需求时，在现有 Execution 对象补 `run` 或本地已选名字，调用现有执行服务，不新建 Workflow Engine/Recorder/Replay。

## 实现前必须冻结的契约

父子 ID、独立 JS/输入/产物、结构化返回、失败状态、递归深度/并发/时间预算、父取消传播、谁等待/谁清理、允许 capabilities 与来源校验。子执行权限不能靠可伪造 env 或 request input 升级。

独立 Execution 不承诺独立 OS 进程或独立桌面。要进程隔离时明确采用现有子进程协议；只需新 VM 时复用现有 runner/context。不得让 automation 反向 import pkg/execution 形成循环依赖，使用注入的内部 service interface。

桌面操作默认串行。若父任务持有桌面所有权再等待子任务，必须避免相互等待死锁；需要锁时复用实际跨进程 coordinator，不能只做进程内 mutex 就声称覆盖通过 CLI 启动的子进程。不把局部步骤成功等同于业务安全重试。

## 文件清单（必须先映射本地服务）

| 类型 | 文件/owner | 变化 |
|---|---|---|
| 修改 | GOAL 02 或 docs/command 既有进程 owner、测试 | streaming/handle 增量，不重写命令执行。 |
| 条件修改 | `pkg/execution/manager.go`、`runner.go`、`types.go` | 仅有明确父子协议需求时复用现有服务。 |
| 新增候选 | `pkg/execution/child_execution.go`、对应测试 | 内部 adapter，不是第二套 runner。 |
| 修改 | 当前唯一 Execution 类型声明、`docs/api/runtime.md`、机器索引/manifest | 仅真实实现的接口。 |
| 新增候选 | `tests/runtime-api/acceptance/child-execution.js`、相关 unit/integration fixture | 新身份、独立输入、递归预算、父取消和回收。 |

本卡不能以“CLI 启动了两个进程”代替父子协议验收；也不能以“有两个 ID”代替外部应用重置和 fresh replay 验证。已完成 docs/command 只复用，不因为这个计划重构整个 CLI。

## 共同验收与交付

先运行本卡最小确定性测试，再按本地现有入口运行 contract、相关 unit 和 smoke；公开示例必须另行通过本次构建的 `./dist/opendesk ai run <script.js>` 原样执行。不要假设单独 `go build` 就已经配齐发行资源，应使用当前仓库的实际构建/打包流程。

涉及共享注册与 Runtime owner 的变动，追加已完成 File JSON 的回归，但不得以此重做其实现。新 gate 复用现有 watchdog、run context、日志与 hash 机制。不得使旧测试的动态 `covers` 自动声称覆盖未执行的新方法。

评审：架构/兼容 20、公开契约/数据正确性 20、生命周期/可靠性 20、安全/隐私 15、易用与交付 10、真实测试和文档证据 15。>=95 且全部相关硬门槛通过才可声明本卡完成；不以主观评分代替证据，不把本卡评分推广成整个项目评分。

硬门槛：不覆盖用户工作；不重复已完成命令和 File JSON；不依赖 Node 执行普通 recipe；不伪造 capability/平台/测试状态；不吞错假成功；不遗留本卡拥有的可控资源；不跨执行串数据；正式入口证据成立。无法运行的测试标 Not Evaluated 或 Blocked，不算通过。

最终输出：本地差额判断、实际新增/修改文件、复用/跳过项及理由、调用示例、命令结果、证据路径、评分和风险。若已等价完成，可以零产品代码改动交付核对和现有证据，不制造无意义 diff。
