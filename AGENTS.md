# 项目协作规范

## 接口测试

- 进行 Runtime API 测试时，必须先查阅 `docs/api/` 目录中的接口文档，并按照文档定义调用接口。
- 接口测试必须编写并运行 JavaScript（`.js`）文件，不得为了测试接口而直接编写 Go（`.go`）文件。
- 测试所用的接口路径、请求参数和返回数据格式仅以 `docs/api/` 中的文档为准；不得恢复或使用任何退役接口文档。
- JavaScript Runtime API 一致性测试的正式目录是 `tests/runtime-api/`，正式入口为
  `./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`，运行证据目录是
  `.runtime/tests/runtime-api/`。不得恢复已删除的 shell wrapper 或复制测试实现。
- 选择测试入口时必须先按验收目标区分命令：公开示例或 quickstart 优先原样执行文档中的一行
  JavaScript 命令（例如从仓库根目录执行 `./dist/opendesk -script examples/native-extensions/quickstart.js`；
  文档写 `./opendesk` 时不得擅自替换），单个 Runtime API 场景优先使用指定可执行文件直接运行对应
  的 `tests/runtime-api/*.js`；只有需要完整 catalog、生成 run context、跨步骤编排或正式证据时才使用
  `OPENDESK_RUNTIME_API_MODE=<mode> ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script`。
  Shell gate 不能替代公开示例的直接命令，run-local binary
  或临时生成脚本也不能被表述为用户命令已通过。
- Runtime API 的正常公开行为测试统一写入 `tests/runtime-api/*.js`；不要为了验证一个可由 JS
  观察的接口，在 `automation/` 下新增类似 `sound_test.go` 的常规 `test.go` 文件。只有 JS 无法
  观察的纯 Go 内部 seam 才可按需保留 Go 白盒测试，并且不能替代正式 Runtime API 测试。
- 新增 Runtime 能力前先判断 owner：平台驱动、真实资源或 execution 生命周期属于 `automation/`
  native owner；`polyfills/` 只用于纯 JavaScript 的组合、默认值、参数适配和兼容 facade。不要
  因为接口最终由 JS 调用，就在 `polyfills/` 中复制同名 native global；Sound/Audio 按此规则维护。

## 公开示例与原生 UI 验收

- 面向用户的公开示例必须给出明确工作目录和可直接复制的一行命令。仓库内示例默认从仓库根目录运行，例如 `./opendesk -script examples/example.js`；不得省略工作目录前提，也不得把仅在 `dist/` 下成立的 `../examples/...` 路径写成根目录命令。
- 在声称公开示例“已运行通过”前，必须从文档指定的工作目录原样执行文档中的命令。测试脚本生成的临时命令、run-local binary 或不同目录下的等价调用只能作为附加验证，不能替代用户实际复制的命令。
- 原生 UI 示例验收前，必须核对实际启动的主程序及其配套 UI host 的路径、构建时间或 VCS provenance。若当前源码比构建物新、两者来源不一致，或无法证明是当前构建，维护者/Agent 应先刷新这一对构建物；不得把重新构建转嫁给只想运行示例的用户。
- 普通手动体验应保持为“一条启动命令 + 用户在真实窗口中交互”。WindowServer、AX observer/controller、截图探针和 watchdog 属于正式自动化验收，不得包装成普通用户运行方式或让用户手工执行一长串控制命令。
- 原生 UI 的功能成功不等于视觉通过。验收必须观察并保留关键窗口截图或等价实窗证据，检查内容自适应、窗口尺寸、留白、文本换行、输入框和按钮对齐；出现异常拉宽、过高、大面积空白、裁切或错位时，必须把视觉验收判为失败，即使 Promise、返回值和清理检查均通过。
- 普通示例日志写入 `.runtime/tests/<domain>/` 时，文档应使用相对于其声明工作目录的路径；最终报告须分别说明普通一行命令、正式自动化 gate 和视觉证据各自是否通过。

## Git 分支

- 未经用户明确说明，不得创建、切换或推送新的 Git 分支；提交和推送默认使用用户指定的现有分支。

## Git 提交与推送

- 用户仅要求 Git 提交、推送、核验或收尾时，不隐含运行测试、构建、lint、格式化、代码生成、功能探测或 desktop/live 验收的授权；即使提交范围包含 `tests/` 下的源码或文档，也不得据此自动执行测试。
- 此类任务默认只进行必要的 Git 范围与交付校验，例如 `git status`、暂存区/提交 diff 检查、`git diff --check`、fetch/push 以及本地与远端 SHA/祖先关系核验。需要扩大到测试或构建时，必须由用户明确要求。
- 如果 Git hook 会触发用户未授权的测试或构建，应在提交前说明；用户明确要求“不测试”或“不构建”时，提交应使用 `--no-verify` 避免触发该 hook。

## Native Extension 跨平台验收

- Native Extension 当前阶段的验收不要求 Linux 或 Windows 真机/VM Runtime Evidence；不得仅因缺少这两类证据把当前 Goal 判定为硬失败或阻塞。
- Linux 和 Windows 当前只要求完成与当前源码对应的 cross-compile/package 验证，并在报告中明确标注尚未进行目标系统 live Runtime 验证；不得把编译或打包结果表述为真机验证。
- Linux 和 Windows 的 installed/live Runtime 验证应在具备对应设备后作为独立后续 Goal 执行。未经用户明确要求，不得为补齐当前验收而自动启动 Docker、虚拟机、Wine 或模拟器，也不得下载系统镜像。

## 文件生命周期与工程产物

- 可维护的源码、正式文档和稳定测试资产才进入版本控制。
- 执行日志、截图、临时配置、探测结果、脚本快照和 smoke 输出统一写入 `.runtime/`；不要新建或继续使用根目录 `temp/`。
- `.runtime/` 是本地可清理目录，禁止把其中的运行产物当作源码提交。
- 项目统一使用顶层 `tests/` 组织跨包测试，禁止重新创建并行的根级 `test/`。可复用 fixture 放入所属测试域；一次性运行结果写入 `.runtime/tests/<domain>/`，正式质量报告放入 `docs/quality/`，外部参考 manifest 放入 `docs/research/external/`。
- 纯 Go/native 白盒测试使用同包 `_test.go` 文件；可由 JavaScript 观察的 Runtime 公共契约使用
  `tests/runtime-api/*.js`，不要用 Goja 包装成重复的公共 API 测试。独立测试工具放入
  `tests/<domain>/tools/<tool>/`，不得与测试包混放。
- `.archive/` 用于历史资料，`.staging-sync/` 仅用于短期同步中间文件；二者都不能作为日常运行输出目录。
- 删除未跟踪文件前，必须先按上述生命周期分类；禁止使用无选择的批量清理，以免删除源码、fixture 或用户当前修改。
- 新增命令、脚本或测试时，必须让生成路径默认落到 `.runtime/`，并同步更新相关文档和 `.gitignore`。

## Examples / Tests 增量整理

- 归属与第一批迁移台账见 `docs/quality/example-test-layout.md`。新增文件先明确示例、测试、
  fixture、工具或运行产物职责；不要继续把临时 probe 或测试矩阵堆入 `examples/` 根目录。
- 公开示例归 `examples/<topic>/`；共享断言归 `tests/runtime-api/`；诊断工具归所属领域的
  `tools/`。本轮基础示例规范目录是 `examples/runtime/`。
- 判断保留价值以构建依赖、调用者、文档命令及独立覆盖为准，不按 AI 来源、文件名或相似度删除。
  `examples/native-extensions/macos-vision/` 参与构建，不能按普通示例清理。
- 已登记旧路径只允许薄兼容转发，不保留两套实现；移除前按迁移台账完成引用及直接命令验证。
  转发不得吞掉错误、启动新 Execution 或伪造 `Execution.scriptPath/scriptDir`。
- Go 新增审查行写入原分类账本末尾的唯一 `## 增量登记` 章节；保留历史迁移基线，不因新增
  测试改写历史计数。未登记或丢失的测试仍必须使审计失败。
- 目录整理运行 `node scripts/audit_test_architecture.js`；维护审计逻辑时补跑
  `node --test tests/test-architecture/layout.test.js`。宿主侧模拟检查不能代替真实 Runtime gate。
