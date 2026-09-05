# OpenDesk：File JSON 之后的增量 GOAL 包

## 先执行什么

上一份 `opendesk-file-json-goal.md` 保持不变，继续完成。它仅覆盖 File.readJSON/writeJSON、WorkDir 统一、文件异步生命周期和安全写入；并不覆盖本包中的 path、进程绑定差额、业务结果和发行资源。

用户已确认 `docs/command` 对应命令行功能完成。本包将其列为复用基线，不安排重新实现。第一批是 GOAL 01–04；GOAL 05–08 是明确保留的按需后续，不默认全部扩成大工程。

推荐顺序：

```text
现在：GOAL 00 只读核对（可与当前 File JSON 的实现工作区读取并存）
当前 File JSON 完成并停止写入后：
  01 path + 来源上下文
  → 02 命令/Runtime 接入差额（已满足则跳过产品代码）
  → 03 Execution 轻量结果/取消/有效能力
  → 04 注入资源与发行一致性
  → 按真实业务选择 05/06/07/08
```

不能让多份 GOAL 同时写 `automation/utils.go`、`pkg/execution/runner.go`、类型、manifest 或测试 gate。共享文件不是禁止永远修改，而是当前任务完成后从其实际结果做最小接续；不重做前一 owner。

## 事实基线与不确定性

本包基于本次可读远端 master `aa55bce9c260ccada7bafd3748f2a56c8745cc26` 的静态核对，以及当前对话中的用户约束和上一份已交付 GOAL。没有运行产品测试，也不能读取用户本地未提交代码。

对该远端的 `docs/command`、`docs/command.md` 读取未成功，不能据此推断用户本地没完成。特别不能直接断言 child_process/路径功能在用户本地缺失。Codex 以实际本地文档/代码/证据去重。

已核对的参照文件：
- `pkg/execution/runner.go`：现有 Execution 上下文注入，不是构造器。
- `docs/api/runtime.md`：Execution.input/workdir 等已公开。
- `pkg/execution/types.go`、`artifacts.go`、`emitter.go`：现有状态和产物 owner。
- `automation/utils.go`：native 注入、资源探测与缓存。
- `docs/api/desktop-ui.md`：既有 Geometry/UI 接口与大小写边界。
- `docs/implementation/runtime/runtime-api-development-workflow.md`：公共 API 的 owner/类型/测试/文档/证据闭环。
- 上一份 `opendesk-file-json-goal.md`：本包不覆盖其职责。

外部接口设计参考（只用于补充兼容性设计，不代替本地契约）：Node 官方 path、child_process 文档；Go 官方 os/exec 文档。执行时记录所对照版本。官方说明中 execFile 与 shell exec 不同，CommandContext 默认取消直接子进程，不等于进程树保证。

## 总覆盖表

| 原讨论能力 | 本包处理 | 不重复的边界 |
|---|---|---|
| docs/command 命令行功能 | 用户已完成；G00 核对，G02 复用 | 不重做 CLI、安装和既有 command owner |
| File.read/write + readJSON/writeJSON | 前一 GOAL 负责 | 本包不改其语义或复制安全写入 |
| 统一 WorkDir、文件异步取消/清理 | 前一 GOAL 负责 | G01/G02 只消费，新增 owner 自己登记 |
| path.join 等常用路径 | G01 | 不用新 Path/FS 替换旧对象 |
| scriptPath/scriptDir | G01 | 不重写入口 CLI |
| JS 直接调用外部程序 | G02 仅差额 | 已由 command 提供则不新增并行入口 |
| Execution.signal/setResult/getCapabilities | G03 仅缺失项 | Execution 已存在，不创建 new Execution |
| 自动注入、固定资源来源、缓存/版本 | G04 | 验证既有安装产物，不另写安装器 |
| File.stat/临时资源/writeAtomic/异步与分块 I/O/HTTP 传输 | G05 按需 | 复用 File/HTTP 和安全提交 |
| AppStorage namespace/JSON/配置 | G06 按需 | 不变成数据库或明文“密钥库” |
| UI 条件等待、面板防重入/反馈 | G07 按需 | 不重做 Geometry/UI，不新 Recorder |
| 长进程、受管子 Execution | G08 需求触发 | 不作为普通 recipe 的前置 |
| ESM/npm/fork/IPC/完整 Node 兼容 | 非默认范围 | 明确不纳入，不会被包装成“全部已完成” |
| 新通用 Worker/Workflow/Recorder/IR/Compiler/Replay | 不做 | 保持 Agent-to-Recipe 正常执行路径 |

## GOAL 00：只读本地差额核对

先读取 `AGENTS.md`、本地 docs/command 实际入口、前一 File JSON GOAL 和对应源码/证据。不得修改源代码、运行会写正在生成产物的测试、重建或覆盖 dist binary。当前任务尚未完成时，只做此节。

记录本地 HEAD、dirty 文件和当前 File JSON 的所有权范围；前一 GOAL 的共享文件至少包括 automation/file.go、automation/utils.go、pkg/execution/runner.go、types/File.d.ts、tests/runtime-api/manifest.js、scripts/test_runtime_apis.sh、相关 docs。列表不是全部，应以实际工作区变化为准。

逐能力建立：

```text
能力 | 已有正式 API | 实际源码 owner | 当前证据/构建身份
     | 状态（已实现已核对/用户已完成待核对/正在执行/缺口/未知）
     | 对应 GOAL | 实际需要改的文件 | 与在跑任务冲突
```

不要仅按关键词查到/查不到来决定支持状态；追踪注册、公开调用、返回形状、失败语义和真实证据。

输出只读差额表。若本地 docs/command 覆盖 G02，标 G02 “复用/验收”，后面直接跳过其产品实现。若本地也无该文档，不自行编写 docs/command 冒充现状；把受其影响的判断标未知，其余已核对任务可以继续。

## 可直接交给 Codex 的总入口

```text
请接续当前 OpenDesk 工作，不重跑或覆盖正在执行的 opendesk-file-json-goal.md。

读取本 GOAL 包 00-overview-and-dispatch.md，先执行 GOAL 00 的只读本地差额核对。
docs/command 对应命令行功能已完成，以本地实际代码和证据为准，不重新实现。

只有前一 File JSON 任务已完成并且没有其他任务在写共享文件时，才按 01→02→03→04 串行执行；
每卡先对已完成能力去重，只补缺口。已经等价完成的卡可以只验证、不改产品代码。
05–08 是保留的按需任务，本次默认不自动启动。

所有 API 保持 Runtime 自动注入、直接使用，不要求 import/require/new。
沿用 Agent-to-Recipe，不新增 Recorder/IR/Compiler/Replay 或通用 Workflow Engine。
不要改写已完成的 CLI 协议，不复制 File JSON/WorkDir/安全写入/异步 owner。

每卡交付实际新增/修改文件、复用项、命令和证据、未验证项以及逐项评分。
>=95 且硬门槛全部通过，才声明该卡完成；不能以计划、自评或交叉编译冒充运行通过。
保留当前用户修改，不 reset；未经另行授权不 commit/push/开 PR。
```

也可以每次只选择一张卡；单卡文件已包含执行边界。实际实现发现前置阻塞时，给出具体阻塞及已完成内容，不扩大到重写其他子系统。

## 共享验收约束

不把“现有类增加方法”“新增全局对象”“新增后端”混为一谈；只有确需的 path 和进程调用入口才可能新增全局，其余扩展既有对象。

普通示例用本次构建的 `./dist/opendesk ai run ...`；沿用现有的构建/打包、watchdog 和 evidence。所有测试的 status 真实区分 Passed/Failed/Blocked/Not Evaluated。运行前先核对当前 docs/command 的实际命令契约，不发明 flag。

本包是方案，不是代码交付或测试结果。评分是验收门槛，不是已取得的独立专家分数。未被选择的按需卡清楚列为 Deferred，不能在收尾中把它们当作已完成。
