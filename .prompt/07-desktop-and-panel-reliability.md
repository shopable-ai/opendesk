# GOAL 07（按需执行）：补齐桌面条件等待与面板任务反馈

目的是让现有 Agent-to-Recipe 工作流更可靠，不重新开发已完成的 Geometry/UI。

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

## 本地先核对的已有能力

已有 `Geometry`、`UI.findText/findTexts/tapText/tapTexts/waitText/waitTextGone/findImage/findImages/tapImage` 等应先核对并复用。大写 UI 操作外部应用，小写 ui 创建 OpenDesk 自己的界面，禁止合并/互设别名。tapTexts 已是 string[] 序列，不能因这次新增等待改变其含义。

先用本地真实失败用例决定最小范围：

A. 若缺失，补 `UI.waitImage(template, options)`、`UI.waitImageGone(template, options)`；复用既有截图、Geometry、ImageColor、歧义/窗口身份规则，timeout/polling 使用现有命名和单位，不新建 Wait 类。

B. 新等待默认受 execution context 约束；显式 signal 如有则只能收紧。每次观察使用新截图，不用固定 sleep 假装条件成立。0候选/唯一/歧义含义清楚；等待消失不能把截图/OCR错误当“已消失”。

C. 为当前实际面板/业务 recipe 补 busy、progress、failure、cancel 和关闭窗口时的任务归属。优先普通 JS 与已存在 ui 控制方法，不新增 TaskManager 全局。不允许连续点击意外发送两次有副作用业务；关闭一个面板不能终止不相关 execution。

点击成功只说明动作已提交；业务成功还需要独立后置条件。重试先观察是否已经成功，只对确定可重试步骤重试；不能自动重发订单、消息或删除操作。

## 文件清单

| 类型 | 文件 | 修改 |
|---|---|---|
| 修改 | `polyfills/006-ui.js` | 按本地确认的缺口补图片等待/取消；不重写已有 Geometry/OCR 引擎。 |
| 修改 | `types/UI.d.ts`、`docs/api/desktop-ui.md`、manifest/index | 新方法真实契约。 |
| 修改或新增 | 本地当前 UI 领域测试；必要时 `tests/runtime-api/unit/ui-waits.test.js` | fresh observation、超时、歧义、信号、错误不冒充消失。 |
| 条件修改 | 当前业务面板 JS helper/recipe 与测试 | busy/progress/关闭归属，优先脚本组合而不是 native 改造。 |
| 条件修改 | `automation/custom_ui.go`、现有 ui types/docs/tests | 只有公开原语确有缺失才做最小增量。 |
| 新增候选 | `examples/ui-image-wait.js` 或既有 workflow 的公开示例 | 有明确目标和允许范围，真实桌面测试不自动发送业务消息。 |

若本地已有 Calculator reference workflow，保留它。可将 Calculator、TextEdit、Settings 等作为逐步验收场景，但不能仅因本卡名字自动启动未授权的设置更改、文件删除或真实消息发送。

Accessibility provider、mixed-DPI split capture、跨进程桌面租约是独立工程项；没有可验证需求时只记录缺口，不在本卡偷偷实现。单进程 mutex 不是跨进程桌面排他保证。已有 provider 的未验证平台不得标 Stable/verified。

## 共同验收与交付

先运行本卡最小确定性测试，再按本地现有入口运行 contract、相关 unit 和 smoke；公开示例必须另行通过本次构建的 `./dist/opendesk ai run <script.js>` 原样执行。不要假设单独 `go build` 就已经配齐发行资源，应使用当前仓库的实际构建/打包流程。

涉及共享注册与 Runtime owner 的变动，追加已完成 File JSON 的回归，但不得以此重做其实现。新 gate 复用现有 watchdog、run context、日志与 hash 机制。不得使旧测试的动态 `covers` 自动声称覆盖未执行的新方法。

评审：架构/兼容 20、公开契约/数据正确性 20、生命周期/可靠性 20、安全/隐私 15、易用与交付 10、真实测试和文档证据 15。>=95 且全部相关硬门槛通过才可声明本卡完成；不以主观评分代替证据，不把本卡评分推广成整个项目评分。

硬门槛：不覆盖用户工作；不重复已完成命令和 File JSON；不依赖 Node 执行普通 recipe；不伪造 capability/平台/测试状态；不吞错假成功；不遗留本卡拥有的可控资源；不跨执行串数据；正式入口证据成立。无法运行的测试标 Not Evaluated 或 Blocked，不算通过。

最终输出：本地差额判断、实际新增/修改文件、复用/跳过项及理由、调用示例、命令结果、证据路径、评分和风险。若已等价完成，可以零产品代码改动交付核对和现有证据，不制造无意义 diff。
