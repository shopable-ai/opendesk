# OpenDesk AI 助手：源码入口

正式调用链、当前缺口和后续实施顺序见：

**[AI 助手：生产调用链、脚本关联与匹配演进](../../../docs/architecture/assistant-script-invocation.md)**

该文档以 2026-09-16 的 `master@8e74b707fc8665ba02624cd545f767cc20458608` 为源码核查基线，明确区分当前实现与尚未实现的 Catalog / Resolver / Run Record。后续修改前重新读取当前源码，不把历史 SHA 当作回退目标。

## 当前链路

```text
../main.js 加载产品模块并注入 taskService
→ controller.js: send.click
→ session.js: submit / performRequest
   ├─ 普通聊天：model-channel.js
   └─ Calculator 任务：task-service.js
        → Agent.run(codex / codex-analysis)
        → JSON 任务参数 + 宿主校验
        → session 的预览、确认与取消
        → ../capabilities/calculator.js 的 execute
        → 真实桌面操作、读数、结果展示
```

当前模型生成的是受约束任务参数，不是本次新编写的 JS。实际执行代码是 [Calculator capability](../capabilities/calculator.js)。两个固定 task 是 `calculator.pressAndRead` 和 `calculator.twoStage`。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `controller.js` | 真实助手窗口、输入事件、任务预览/确认/停止、状态和消息渲染 |
| `session.js` | 请求身份、聊天/任务分流、冻结确认、执行生命周期、取消及迟到结果保护 |
| `task-service.js` | 当前 Calculator 路由规则、受控 Planner、参数校验、可信预览、执行适配与结果文案 |
| `model-channel.js` | 普通聊天模型通道；不代替任务执行服务 |
| `store.js` | 会话、草稿、请求、消息和终态持久化；不是完整执行审计记录 |
| `../capabilities/calculator.js` | 当前实际 Calculator 应用操作代码 |
| `../main.js` | 实际产品模块加载和依赖接线 |

## 必须保持的边界

- 通用目录不是扫描全部 `.js`；普通聊天不是作者态，模型不得返回任意路径或代码直接执行。
- 任务预览、参数和确认必须绑定同一请求；修改、取消、重复确认和迟到结果不能启动旧任务。
- 当前 Calculator 仅声明 macOS Basic 布局范围；不能继承整个产品的多平台支持声明。
- `examples/ai-workflows/chat-calculator/` 是独立示例，不是此正式窗口的执行入口；只改示例不能证明正式助手更新。
- 展示实际执行代码时必须核对加载来源，不展示模型重写的伪代码冒充已运行源码。
- 本目录 README 和架构记录不证明本机当前 App/模块已更新，也不替代真机验收。

## 相关合同和测试

产品体验：[对话工作台](../../../docs/architecture/conversational-task-workspace.md)。

跨层总纲：[Automation Capability Lifecycle](../../../docs/architecture/desktop-automation/task-capability-lifecycle.md)。

测试目录：[tests/assistant/](../../../tests/assistant/)。用户可观察的契约继续用 JavaScript 测试；模拟测试、真实模型、真实 Runtime 和视觉验收分别记录结果，不互相代替。
