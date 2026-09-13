# Chat Calculator P0

这是 `docs/architecture/conversational-task-runner.md` 的首个公开实现：Codex 只把自然语言转换成固定 Calculator 任务参数；OpenDesk 宿主再次校验并生成可信预览；只有用户确认后，普通 JavaScript 才操作真实 macOS Calculator 并从 Accessibility 显示区读取结果。

## 产品化方向与代码来源

通用产品的需求、聊天交互、真实代码/参数查看、执行策略与主应用整合见 [OpenDesk 对话工作台｜产品需求与实施设计](../../../docs/architecture/conversational-task-workspace.md)。Calculator 是首个能力和回归案例，不是未来产品名称。该文档是拟实施设计，不表示本示例已经具备通用会话、代码详情面板或自动运行。

当前点击「规划」只生成固定任务参数，不会生成新的 JavaScript；执行调用已有 Calculator 逻辑。`calculator.js` 是业务模块源码，`index.source.js` 是 UI/controller 源码，`index.js` 是构建时生成、供公开命令实际加载的 bundle。查看或修改代码时应区分这三类文件与本次参数，不能把构建产物误认为每次规划生成的新脚本。

## 工作目录与一行启动命令

从 **OpenDesk 仓库根目录** 运行：

```bash
./dist/opendesk -ui -script examples/ai-workflows/chat-calculator/index.js -console-mode script -log-dir .runtime/examples/ai-workflows/chat-calculator
```

普通用户只需要在窗口输入自然语言，例如：

- `打开计算器，计算 25 乘以 4。`
- `先计算 25 乘以 4 加 10，再把结果乘以 6。`
- `先计算 12 乘以 3 加 4，再把结果乘以 5。`

公开 `index.js` 是供 OpenDesk classic `.js` 入口直接运行的受控 bundle；可测试模块和 UI controller
源码分别保留在同目录的 `calculator.js`、`planner.js`、`task-contract.js`、`task-session.js` 与
`index.source.js`。入口头部冻结这些源码的 SHA-256；任一源码变化后必须重新生成并重跑本页命令，
不能让 Node ESM 测试通过却把含 `import` 的源码直接交给 classic loader。

确认前不会清空或点击 Calculator。两阶段任务会先从本次 Calculator 显示区读取 `firstResult`，再次清空后把该实际值逐位输入第二段；不会从 expected、模型文本或 JavaScript 算术补出答案。

## 前提

- 当前 P0 只支持 macOS 自带 Calculator 的已资格化 Standard/Basic `232×321` 布局。
- OpenDesk 必须已经获得操作 Calculator 所需的 macOS Accessibility 权限；权限缺失应由现有 Permission/Runtime 路径报告，不由此示例循环触发授权。
- 本机必须安装 Codex CLI，并让启动 OpenDesk 的当前受控 `PATH` 可以解析 `codex`；使用现有 Codex saved auth。默认调用内建 `codex-analysis` Profile。
- `Agent.run()` 的 Codex adapter 继续由 Runtime owner 负责进程、认证、JSONL、read-only sandbox、固定工具禁用和 AbortSignal；本示例不复制这些逻辑，也不接受 raw CLI args。

## 受控任务合同

Planner 只能返回下面六个根字段，未知字段在桌面副作用前拒绝：

```text
schemaVersion
kind          task | clarify | unsupported
task          calculator.pressAndRead | calculator.twoStage | ""
buttons       单字符数组：0-9 + - × =
multiplier    twoStage 的 1-12 位非负整数字符串；单阶段为空
message       仅展示；不参与执行授权
```

宿主另外验证：按钮数 `3-64`、每个操作数最多 `12` 位、恰好一个末尾 `=`、操作数/运算符顺序、任务白名单，以及非 task 分支不得夹带动作。

## Calculator 资格资产

`calculator.js` 没有顶层桌面副作用，可以被其他脚本相对 `import`。它复用当前生产 golden 的 Calculator identity、窗口/焦点检查与 Accessibility 唯一显示读数；完整数字键归一化坐标来自历史真实 Calculator Recipe（commit `4eec3c501d94b749ed5d17ae7de5440e66130c91`）保存的 232×321 Basic 布局资格数据，不由本示例按键盘网格推算。

每次点击前重新读取当前 active Calculator 窗口并按当前窗口位置换算坐标，因此窗口整体平移不会复用旧 screen coordinate。窗口失焦、身份变化、大小/布局变化、未知按钮、显示区不完整/不唯一/不稳定都会停止任务。

## 网页阶段与本地验收边界

纯 JavaScript 合同、状态机、Planner 参数形状和注入式 Calculator mock 可在无桌面的环境测试；它们**不能**替代：

- 真实 Codex 登录后的自然语言 → envelope 验收；
- 真实 Calculator 点击、两次显示区读取和窗口平移；
- 规划/点击/读数阶段的真实取消；
- 中文、长消息、滚动、输入框、按钮、状态和窗口比例的截图/实窗视觉检查；
- golden、Script Runner、Recorder 的真实回归检查。

本地验收必须保留这些证据后，才能给完整 P0 质量分数。
