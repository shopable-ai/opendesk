# GOAL 06（按需执行）：AppStorage 隔离与 JSON 便捷方法；配置边界

针对重复运行的 recipe、面板状态和小型业务偏好；不是密钥库或数据库项目。

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

## 目标与非目标

先阅读现有 `automation/storage.go`、`docs/api/storage.md` 以及本地 command 的配置支持。只有实际缺失的项目隔离和便捷 JSON 读写才新增。

建议在已有 AppStorage 上提供 `AppStorage.namespace(stableId)` 返回受限存储句柄，不改一个进程级“当前 namespace”，不增加用户要 new 的类。返回句柄沿用 getItem/setItem/removeItem/clear，并按需要增加 `getJSON/setJSON`。

namespace 使用稳定 project/recipe identity，不能用每次变化的 Execution.id 充当持久化范围。namespace id 是逻辑键，不能直接拼成未校验路径。clear 只清当前句柄范围；旧 AppStorage 默认命名空间、旧数据迁移保持兼容，不自动删除历史文件。

JSON 数据沿用已固定的 JS 序列化规则和大小限制；损坏数据报错，不悄悄回退默认配置；JSON null 和不存在必须区分。复用 codec/安全存储后端，不复制另一套 JSON 语义。

对跨执行/进程写入明确支持等级：若现有存储仅支持单写者，本卡不能因为增加 namespace 就宣称并发事务安全。采用互斥/锁等机制时要围绕真实并发用例设计并测试，不能用 read-modify-write 覆盖其他 namespace。必要时将多写者列为单独需求，当前接口 fail clearly。

## 配置与敏感数据

本地 `.env`、`docs/command` 已有行为不扩大：不能默默把所有环境键注入 JS 或把所有 flags 自动映射。确有业务读取环境的需求时优先复用现有受控接口；缺失则先明确允许键、默认值、来源优先级与日志规则，再在既有 System 下做最小方法，不增加全局 process.env 镜像。

token/密码不写 AppStorage、result 示例、原始日志。系统凭据管理和 secret handle 若尚未存在，记为“后续独立、需明确平台与威胁模型”，本卡不制造一个明文文件并命名为安全凭据存储。

## 文件清单

| 类型 | 文件 | 修改 |
|---|---|---|
| 修改 | `automation/storage.go`、现有 storage 测试 | namespace/小数据持久化，保留旧语义。 |
| 条件新增 | `automation/storage_namespace.go`、`automation/storage_namespace_test.go` | 只有需要拆分 owner 时新增。 |
| 修改 | `types/AppStorage.d.ts`、`docs/api/storage.md`、manifest/index | 新句柄/JSON 调用契约与支持等级。 |
| 新增候选 | `tests/runtime-api/unit/storage-namespace.test.js`、`examples/storage-namespace.js` | 隔离、损坏、旧数据兼容。 |
| 条件修改 | `automation/system.go`、`types/System.d.ts`、相关 docs/tests | 仅受控 env 读取确有需求且缺失时；不动已完成 CLI 配置协议。 |

## 验收

两个 namespace 同名键隔离；重启后仍存在；clear 不越界；路径非法 id 拒绝；大小与损坏错误；默认数据不丢失；并发保证只写测试实际支持的范围。不得通过并行进程竞争测试未覆盖就宣称可靠事务。

## 共同验收与交付

先运行本卡最小确定性测试，再按本地现有入口运行 contract、相关 unit 和 smoke；公开示例必须另行通过本次构建的 `./dist/opendesk ai run <script.js>` 原样执行。不要假设单独 `go build` 就已经配齐发行资源，应使用当前仓库的实际构建/打包流程。

涉及共享注册与 Runtime owner 的变动，追加已完成 File JSON 的回归，但不得以此重做其实现。新 gate 复用现有 watchdog、run context、日志与 hash 机制。不得使旧测试的动态 `covers` 自动声称覆盖未执行的新方法。

评审：架构/兼容 20、公开契约/数据正确性 20、生命周期/可靠性 20、安全/隐私 15、易用与交付 10、真实测试和文档证据 15。>=95 且全部相关硬门槛通过才可声明本卡完成；不以主观评分代替证据，不把本卡评分推广成整个项目评分。

硬门槛：不覆盖用户工作；不重复已完成命令和 File JSON；不依赖 Node 执行普通 recipe；不伪造 capability/平台/测试状态；不吞错假成功；不遗留本卡拥有的可控资源；不跨执行串数据；正式入口证据成立。无法运行的测试标 Not Evaluated 或 Blocked，不算通过。

最终输出：本地差额判断、实际新增/修改文件、复用/跳过项及理由、调用示例、命令结果、证据路径、评分和风险。若已等价完成，可以零产品代码改动交付核对和现有证据，不制造无意义 diff。
