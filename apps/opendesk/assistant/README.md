# OpenDesk AI 助手：源码与用户脚本调用入口

先阅读 **[AI 助手：真实调用链与用户脚本调用设计](../../../docs/architecture/assistant-script-invocation.md)**。

该页 v0.2（2026-09-16）保留当前源码事实，并修正用户脚本的存储、固定/参数化接入和运行边界。源码复核基线为 `master@d7bfffacb59b5f5c557aa47561e4af262d37d86c`，后续实施重新读当前文件，不把历史 SHA 当回退目标。

## 当前真实接线，不是目标用户资产架构

```text
../main.js 直接加载 ../capabilities/calculator.js
→ controller.js：发送消息
→ session.js：聊天/任务分流
  ├─ model-channel.js：普通聊天
  └─ task-service.js：Codex 生成 JSON 参数
       → 宿主校验、预览、确认
       → 已注入的 Calculator 模块 execute()
       → 真实桌面操作、读数、结果文字
```

模型生成的是参数，不是本轮新 JS。当前两个 task 为 `calculator.pressAndRead`、`calculator.twoStage`。

**`apps/opendesk/capabilities/calculator.js` 是当前产品内的演示接线，不是用户任务存储模板。** 新增真实用户业务不得向这个目录复制脚本，也不得为每个用户任务修改 `main.js` 或 `task-service.js`。

## 目标用户脚本链路（尚待实施接入）

```text
用户目录中的录制/编写 JS
→ 明确固定行为或可变参数
→ 固定候选/依赖 → 验证 → 明确发布到本地目录
→ 对话选择任务身份，而不是模型给文件路径
→ 固定脚本使用空业务输入；参数化脚本只接收已声明参数
→ 宿主预览、确认和版本绑定
→ 共用 App-owned 执行服务
→ 每次任务独立 Runtime/Execution
→ 实际结果、验证状态与运行记录
```

固定顶层业务 JS 不必先函数化或参数化。它可以按原业务验证后直接由 production loader 运行；发现/匹配阶段禁止 import/eval 业务脚本。用户要求改变未开放的固定行为时，不能忽略要求后照旧执行。

已有产品执行接缝位于 [script-runner-simple.js](../script-runner-simple.js) 和 [app_recipe_runner.go](../../../cmd/opendesk/app_recipe_runner.go)：用户脚本默认在 appDataRoot/recipes，可显式配置其他 scriptRoot；每次任务新 Runtime，但仍在 App host 进程内。它不是第三方代码沙箱，现有 `{scriptPath, workdir, logDir, signal}` 也不是已经完成的结构化业务 input/result API。

助手应该复用这一 owner，不通过点击 Runner UI 或把用户脚本加载进助手会话来执行。当前助手尚未接入这条共同服务；本轮文档修改不代表生产迁移完成。

## 文件职责

| 文件 | 当前职责 |
| --- | --- |
| `controller.js` | 窗口、输入、预览/确认/停止与消息渲染 |
| `session.js` | 请求身份、分流、冻结确认、取消和迟到结果保护 |
| `task-service.js` | 当前 Calculator 专用路由、Planner、参数校验、执行适配和结果文案 |
| `model-channel.js` | 普通聊天，不拥有用户脚本执行授权 |
| `store.js` | 会话/草稿/请求/消息/终态，尚不是完整运行审计 |
| `../capabilities/calculator.js` | 当前实际 Calculator 演示业务执行代码 |
| `../main.js` | 当前官方产品模块加载和依赖接线 |

## 必须保持的边界

用户资产、冻结发布版本、可重建索引与运行产物分离；产品升级不覆盖用户源脚本。零参数不等于零副作用；固定对象、当前账号/窗口/剪贴板等隐式输入需要声明与校验。

真实代码视图必须对应本次加载内容，不是执行后文件最新版或模型重写的伪代码。成功退出、观察到结果、业务验证通过要分别显示。删除会话不等于删除源脚本或业务输出。

保留对话优先体验，不增加必需任务商城、脚本选择器或参数表单。`examples/ai-workflows/chat-calculator/` 是独立示例；迁移 Calculator 前先验证通用用户路径，不先删文件破坏启动，也不静默修改黄金样本。

跨层总纲：[Automation Capability Lifecycle](../../../docs/architecture/desktop-automation/task-capability-lifecycle.md)。产品体验：[对话工作台](../../../docs/architecture/conversational-task-workspace.md)。测试：[tests/assistant/](../../../tests/assistant/)。

后续用户可观察契约继续使用 JavaScript 测试，源码、mock、真实模型、Runtime 和视觉分别留证。本次仅更新文档，没有修改生产 JS、构建或运行测试。
