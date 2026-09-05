# GOAL 03：轻量增强已有 Execution：结果、取消和有效能力

依赖：File JSON 已完成；优先复用 GOAL 02/本地 command 已有的取消与 capability。无需新建执行引擎。

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

## 目标

保留已有 Execution 为自动注入的上下文对象，不改为构造器，不要求 new，不改写正常脚本执行主链。

先核对本地 command 是否已经提供业务结果、取消信号或能力描述；已有正式功能沿用，不另开结果协议、配置来源或权限引擎。

仅缺失时补充：

```ts
Execution.signal: AbortSignal;
Execution.setResult(value: unknown): void;
Execution.getCapabilities(): /* 沿用现有 capability schema 的执行级视图 */;
```

脚本来源字段由 GOAL 01 负责；WorkDir 由 File JSON 负责；本卡不重复。

## setResult 契约

把业务输出与 console 日志、Runtime status 分开。setResult 在 owner EventLoop 上完成 JSON 兼容性检查和不可变数据快照；默认 1 MiB 的有界业务结果，大小可在宿主既有配置内收紧，不用吞异常的随意 Export。

建议单次赋值：再次调用报 `RESULT_ALREADY_SET`，未调用属于合法无结果执行。false/0/null 均为实际结果，与“未设置”区分。输入损坏/不可序列化等同步抛结构化错误，保持 void 返回清晰。

setResult 只暂存，不宣布执行成功。只有脚本、已追踪异步工作、清理均成功，才由现有 finalize 路径安全持久化业务结果。后续抛错、超时或取消，不发布一个看似成功的业务 result。

优先沿用本地已有的结果槽和格式。确无结果槽时，在当前 artifactDir 管理 `result.json`，作为新的受控业务产物；和已有同名产物冲突要明确失败或依现有命名规则选安全路径，不能覆盖用户文件。没有 artifactDir 时要有明确 unsupported 行为，不回退写宿主 cwd。

复用已经完成的底层安全写入机制，不从 Go 调用 JS File.writeJSON，不引入 automation 对 pkg/execution 的反向循环依赖。若底层 helper 尚未跨包可复用，做有测试的最小提取，不复制另一份安全写入实现。

持久化错误导致当前执行不能被误报成功。已有命令输出字段/退出码不改；只有在现有 schema 接受兼容增量时才增加 result artifact 引用。若不能兼容，只通过既有 artifactDir 访问新文件，本卡不增加命令或推倒 JSON envelope。

默认日志只记录 result 存在性/大小/引用，不复制业务 payload。传给 setResult 的业务结果是用户主动要求持久化的数据，不声称 Runtime 能自动辨识所有秘密。

## signal 契约

由既有 execution context 产生只读 AbortSignal，脚本没有 abort 当前宿主的控制器。支持本地已有标准子集，订阅/解绑由 owner EventLoop 管理。

父执行取消/截止时间到达 → native owner 已有取消通道先保证资源安全；JS abort 事件在仍可调度时通知。CPU 忙循环被中断或 Runtime 已停止时，不承诺所有 JS listener 都会跑，资源回收不能依赖 listener。正常结束时用于内部清理的 cancel 不等于用户取消，不得将正常执行改判 canceled，也不得靠 abort listener 在 teardown 时启动新工作。

文件/HTTP/进程默认已绑定内部 context，不要求用户逐个传 Execution.signal；显式 signal 仅用于局部组合。既有 API 的 cancel/timeout 命名保持兼容，不顺便更换全部错误协议。

## getCapabilities 契约

返回当前执行的有效视图，复用已有 provider、manifest 和 authorization。至少区分：实现支持、当前获授权、依赖/运行条件是否满足，以及是否有本次验证。不要因为静态注册存在就声明 ready/verified。

只聚合实际可得的结果。File、path、command、HTTP、UI 等条目由各自 owner 提供；没有实现或未查询的项写 unknown/null 或已有 schema 的相应状态。远程入口不能从这个对象反向打开权限。

不新建全局 Runtime/CapabilityManager/PermissionCenter，不以 shell 调 CLI 的 capabilities 作为内部查询后端。

## 文件清单

| 类型 | 文件 | 修改 |
|---|---|---|
| 修改 | `pkg/execution/runner.go` | 现有上下文注册、finalize、取消接线，不重写 runner。 |
| 条件修改 | `pkg/execution/types.go`、`artifacts.go`、`emitter.go`、必要的 `legacy.go` | 兼容新增业务产物或引用；源码证明需要才改。 |
| 新增候选 | `pkg/execution/context_api.go`、`result.go`、对应 `*_test.go` | 仅本地无等价实现时；内部对象不是新用户类。 |
| 修改 | 当前唯一 Execution 类型声明、`docs/api/runtime.md` | 同步新方法、字段和非目标。 |
| 条件修改 | `automation/utils.go` 与实际 capability owner | 最小依赖注入/adapter，不修改已完成 File I/O 逻辑。 |
| 新增候选 | `tests/runtime-api/unit/execution-context.test.js`、`tests/runtime-api/acceptance/execution-context.js`、`examples/execution-result.js` | 原样 ai run、结果/取消/隔离行为。 |
| 修改 | 机器索引、manifest、runtime composition | 区分已有字段与新增方法，使用实际运行入口验证。 |

## 验收

无结果、null/false、重复赋值、序列化失败、大小超限、setResult 后修改原对象、setResult 后抛错/超时/清理失败、结果文件写入失败、两次运行不串状态。失败/取消不能留成功发布标记。

signal 的 abort 状态、重复订阅/解绑、已取消信号、EventLoop teardown；能力受限 transport 与本机可信 execution 不得被混为一种权限状态。既有 ai run 输出和退出码的回归必须通过。

首批不新增 Execution.run、任务 DAG、checkpoint、自动 retry、桌面调度器。结果上下文不成为所有普通脚本的前置模板。

## 共同验收与交付

先运行本卡最小确定性测试，再按本地现有入口运行 contract、相关 unit 和 smoke；公开示例必须另行通过本次构建的 `./dist/opendesk ai run <script.js>` 原样执行。不要假设单独 `go build` 就已经配齐发行资源，应使用当前仓库的实际构建/打包流程。

涉及共享注册与 Runtime owner 的变动，追加已完成 File JSON 的回归，但不得以此重做其实现。新 gate 复用现有 watchdog、run context、日志与 hash 机制。不得使旧测试的动态 `covers` 自动声称覆盖未执行的新方法。

评审：架构/兼容 20、公开契约/数据正确性 20、生命周期/可靠性 20、安全/隐私 15、易用与交付 10、真实测试和文档证据 15。>=95 且全部相关硬门槛通过才可声明本卡完成；不以主观评分代替证据，不把本卡评分推广成整个项目评分。

硬门槛：不覆盖用户工作；不重复已完成命令和 File JSON；不依赖 Node 执行普通 recipe；不伪造 capability/平台/测试状态；不吞错假成功；不遗留本卡拥有的可控资源；不跨执行串数据；正式入口证据成立。无法运行的测试标 Not Evaluated 或 Blocked，不算通过。

最终输出：本地差额判断、实际新增/修改文件、复用/跳过项及理由、调用示例、命令结果、证据路径、评分和风险。若已等价完成，可以零产品代码改动交付核对和现有证据，不制造无意义 diff。
