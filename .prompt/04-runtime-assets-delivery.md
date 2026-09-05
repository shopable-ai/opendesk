# GOAL 04：完善自动注入与发行资源一致性，不重做安装器

依赖：File JSON 完成；与 GOAL 01–03 串行集成，避免共同修改 utils/manifest。

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

保持用户“框架已安装、直接使用”的体验，补齐发行资源来源、版本和加载失败的确定性。不要求用户添加 import，不把每次运行变为安装流程。

先审计本地 command/安装流程、资源嵌入/复制、portable/App 打包、NativeExtensions discovery。已完成安装能力只验证产物一致性，不重新实现安装/发现/更新协议。

## 需要验证和仅按缺口修复的行为

1. 正式发行从当前构建选定的内置资源或受控包目录加载；不能在任意 cwd/祖先目录发现同名 polyfills/jslibs 就静默执行。开发目录覆盖只能走已有显式开发机制；缺机制时用内部构建/测试配置解决，不擅自增新 CLI 命令。
2. 缺核心资源、版本错配、破损资源需要初始化失败并给可操作诊断；禁止创建空目录后当功能可用。
3. 优先用现有生成清单/嵌入机制固定必需文件和顺序。不存在才在现有构建过程中增加最小清单，不建设插件商店或大型资源包管理器。
4. 可以共享不可变编译代码；不能共享可变 JS 对象、Execution.input、listeners、句柄或权限。缓存按实际构建/来源/content identity 区分，不只按字符串 "polyfills" 缓存第一份。
5. 已初始化 execution 使用一致资源快照；更新在既有受控安装阶段完成，新 execution 才看到新版本。不承诺热更新本次正在运行的对象。
6. 程序文件、脚本和资源目录含空格/中文可用；portable 与 macOS App 跟随现有打包契约。
7. 新 `path`、有效进程入口、File JSON、Execution 增强都在正常入口自动可见；受限能力按 gate 失败而不是悄悄授权。
8. 可选扩展缺失不必破坏无关 recipe，但调用时必须报明确 capability/dependency 状态；不得在业务执行中根据任意字符串自动下载并执行代码。

## 文件清单

| 类型 | 文件/定位 | 修改 |
|---|---|---|
| 修改 | `automation/utils.go` | 本地真实 resource resolver/compiled cache，保留业务对象注册结果。 |
| 新增候选 | `automation/runtime_assets.go`、`automation/runtime_assets_test.go` | 需要拆分时移动并复用现有 resolver，不能留下第二套同名加载器。 |
| 条件修改 | 本地现有构建/打包脚本与其清单 | 只补必需资源复制、版本绑定或校验；先定位实际文件，不猜名称。 |
| 修改 | `docs/implementation/runtime/runtime-api-composition.md` | 正式与开发加载边界、缺失诊断、资源身份。 |
| 条件修改 | 当前安装/发行说明 | 只补新增资源的交付说明；`docs/command` 已完成正文不重写。 |
| 新增候选 | `tests/runtime-api/acceptance/runtime-globals.js` | 没有 import 的公共对象存在性与轻量行为测试；未授权命令不能实际执行。 |
| 新增候选 | `tests/runtime-api/tools/runtime-package-check/` | 外部 cwd、污染祖先目录、缺文件和错配包的受控发行测试。 |
| 条件修改 | `scripts/test_runtime_apis.sh` | 复用现有构建、watchdog、证据；不替换现有 gate。 |

## 验收

从仓库 cwd、独立临时 cwd 启动同一完整包，公共能力一致；在临时 cwd 放置恶意同名资源验证正式模式不会加载。只在测试隔离目录制造污染，不写真实安装目录。

缺必需文件/错配版本清晰失败；可选插件缺失有诊断；两轮执行的对象/权限不串；允许缓存命中但不跨 build/source identity 污染。

必须运行真实打包产物，不仅 go test 或 repo cwd 下从祖先目录“碰巧找到”资源。用公开 build 流程准备 `dist/opendesk`，再原样 ai run。不得以只拷贝 binary 而遗漏必需资源的失败，误判业务 API 本身。

本卡不做自动联网安装、不改变 NativeExtensions roots 的信任规则、不实现新 npm/ESM 机制，不让新增能力迫使用户每次手工安装。

## 共同验收与交付

先运行本卡最小确定性测试，再按本地现有入口运行 contract、相关 unit 和 smoke；公开示例必须另行通过本次构建的 `./dist/opendesk ai run <script.js>` 原样执行。不要假设单独 `go build` 就已经配齐发行资源，应使用当前仓库的实际构建/打包流程。

涉及共享注册与 Runtime owner 的变动，追加已完成 File JSON 的回归，但不得以此重做其实现。新 gate 复用现有 watchdog、run context、日志与 hash 机制。不得使旧测试的动态 `covers` 自动声称覆盖未执行的新方法。

评审：架构/兼容 20、公开契约/数据正确性 20、生命周期/可靠性 20、安全/隐私 15、易用与交付 10、真实测试和文档证据 15。>=95 且全部相关硬门槛通过才可声明本卡完成；不以主观评分代替证据，不把本卡评分推广成整个项目评分。

硬门槛：不覆盖用户工作；不重复已完成命令和 File JSON；不依赖 Node 执行普通 recipe；不伪造 capability/平台/测试状态；不吞错假成功；不遗留本卡拥有的可控资源；不跨执行串数据；正式入口证据成立。无法运行的测试标 Not Evaluated 或 Blocked，不算通过。

最终输出：本地差额判断、实际新增/修改文件、复用/跳过项及理由、调用示例、命令结果、证据路径、评分和风险。若已等价完成，可以零产品代码改动交付核对和现有证据，不制造无意义 diff。
