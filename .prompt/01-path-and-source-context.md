# GOAL 01：直接使用 path，并明确脚本来源路径

依赖：前一 File JSON GOAL 的 WorkDir 统一已落地；执行本卡不会重新实现该工作。

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

## 目标与范围

直接使用 `path.join()` 等常用路径方法；在已有 Execution 上补足入口脚本路径。不要把普通路径需求升级为 Node 模块加载项目或通用文件系统重构。

先核对本地是否已有 `path`、Path、等价 helper，以及命令功能是否已经提供脚本文件元数据。有则复用并补缺失测试，不重命名已有公开 API。

## 固定公开契约（仅缺失时新增）

```ts
path.join(...parts: string[]): string;
path.resolve(...parts: string[]): string;
path.normalize(value: string): string;
path.dirname(value: string): string;
path.basename(value: string, suffix?: string): string;
path.extname(value: string): string;
path.relative(from: string, to: string): string;
path.isAbsolute(value: string): boolean;
path.sep: string;
path.delimiter: string;

Execution.scriptPath: string | null;
Execution.scriptDir: string | null;
```

`path` 是注入对象，不需要导入。旧 `File.join/path/getName` 等保留既有行为，不偷偷改为新的 Node 语义。

字符串算法按照选定并记录版本的 Node path 公共契约做测试；唯一明确的上下文差异是 `resolve/relative` 所需默认 cwd 使用前一 GOAL 已规范化的本次 WorkDir，而不是宿主全局 cwd。后端使用可信初始化值，不能通过脚本改写 Execution.workdir 改变。

严格检查参数类型，不把对象或 null 自动转字符串。不访问磁盘、不解析真实符号链接、不创建目录；路径规范化不是文件授权或目录穿越防护。

文件来源的 `scriptPath` 是入口脚本的规范化绝对路径；`scriptDir` 是它的目录。内联、stdin、无文件源时两者为 null，不虚构一个文件名。数据来自宿主已验证来源，不依赖 JS 自己解析可伪造的 source 文本。新增字段只读；不要顺便冻结整个旧 Execution 或 input，避免破坏兼容。

初始化时直接传入 context，不依赖 polyfill 加载阶段访问尚未注入的 Execution 全局。首批不新增 `__dirname`、ESM、npm、全局 `process`，也不改 CommonJS 解析器；这些不是本卡前置条件。

`parse/format/posix/win32` 记入扩展清单，未实现不列为支持；若本地已有完整库且测试通过，可直接复用完整能力，不为首批范围删除它。

## 文件清单

| 类型 | 路径 | 变动 |
|---|---|---|
| 新增候选 | `automation/path.go` | 显式注册 path；复用经核验的实现，不把 filepath.Join 直接冒充所有 Node path 语义。 |
| 新增候选 | `automation/path_test.go` | 边界测试和平台字符串向量。 |
| 修改 | `automation/utils.go` | 最小注册接线，消费已有 WorkDir；不改 File JSON owner。 |
| 修改 | `pkg/execution/runner.go` | 从正式输入源取得 scriptPath/scriptDir 并注入。 |
| 条件修改 | 当前 source resolver/request owner | 仅现有 Request 不能无歧义携带来源时增加内部字段，不加 CLI 参数。 |
| 新增候选 | `types/path.d.ts`、`docs/api/path.md` | 同步调用契约。 |
| 条件修改 | 当前唯一 Execution 类型声明 | 增加两个字段；不存在时才新增 `types/Execution.d.ts`，不得重复声明。 |
| 新增候选 | `tests/runtime-api/unit/path.test.js`、`tests/runtime-api/acceptance/path.js`、`examples/path.js` | 直接使用与正式入口验收。 |
| 修改 | `docs/api/runtime.md`、`docs/api/index.md`、`docs/api/runtime-api.ai.json`、`tests/runtime-api/manifest.js` | 范围、元数据和准确覆盖。 |

注册/日志接线若本地被前一任务重排，应跟随其 owner，不按旧行号打补丁。

## 验收

覆盖零参数 join、空串、非字符串、`.`/`..`、根目录、绝对后续片段、尾分隔符、隐藏文件、后缀剥离、中文/空格路径。不要把 join 和 resolve 混成同一种算法。

两个执行具有不同 WorkDir、使用同一相对路径时各自解析正确；改写 JS 元数据不得影响后端。文件脚本/内联脚本来源分别验证；旧 File 方法回归通过。

Windows 盘符/UNC 仅在该平台或显式 Windows 字符串实现有证据时声明支持；本机字符串测试、交叉编译与目标机运行分开报告。

公开示例只用 path、File、已有 Execution，无需桌面权限。共享目录语义由前一 GOAL 提供，本卡不得建立第二个 resolver。

## 共同验收与交付

先运行本卡最小确定性测试，再按本地现有入口运行 contract、相关 unit 和 smoke；公开示例必须另行通过本次构建的 `./dist/opendesk ai run <script.js>` 原样执行。不要假设单独 `go build` 就已经配齐发行资源，应使用当前仓库的实际构建/打包流程。

涉及共享注册与 Runtime owner 的变动，追加已完成 File JSON 的回归，但不得以此重做其实现。新 gate 复用现有 watchdog、run context、日志与 hash 机制。不得使旧测试的动态 `covers` 自动声称覆盖未执行的新方法。

评审：架构/兼容 20、公开契约/数据正确性 20、生命周期/可靠性 20、安全/隐私 15、易用与交付 10、真实测试和文档证据 15。>=95 且全部相关硬门槛通过才可声明本卡完成；不以主观评分代替证据，不把本卡评分推广成整个项目评分。

硬门槛：不覆盖用户工作；不重复已完成命令和 File JSON；不依赖 Node 执行普通 recipe；不伪造 capability/平台/测试状态；不吞错假成功；不遗留本卡拥有的可控资源；不跨执行串数据；正式入口证据成立。无法运行的测试标 Not Evaluated 或 Blocked，不算通过。

最终输出：本地差额判断、实际新增/修改文件、复用/跳过项及理由、调用示例、命令结果、证据路径、评分和风险。若已等价完成，可以零产品代码改动交付核对和现有证据，不制造无意义 diff。
