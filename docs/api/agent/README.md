---
docType: index
---

# Agent API 阅读入口

OpenDesk 可观察和操作桌面、处理本地数据、调用网络/模型、呈现自己的 UI，并由既有 CLI、HTTP 或 MCP 入口运行普通 JavaScript。**先按当前业务步骤发现能力，再选择方法；示例不是全局 API 优先级。** 本页是 Agent 的唯一短入口；`../README.md` 保留用户总导航，`../agent.md` 是 Runtime `Agent` 对象 Reference。

## 按需展开，到满足当前步骤就停止

读本页 → 只打开相关能力组 → 比较候选方法的用途、输入/输出、副作用与限制 → 读取选中方法原文及必要公共约束 → 核对本轮授权/环境 → 使用现有入口。进入下一业务步骤或遇到新缺口时才继续展开；不递归读完所有链接。

| 当前需要 | 方法目录 |
| --- | --- |
| 应用身份、窗口、就绪与坐标 | [应用、窗口与几何](targets.md) |
| 定位目标、读取值、等待或操作外部 UI | [桌面目标与取值](elements.md) |
| 图片、OCR、颜色、显示器与录屏 | [图像与显示器](vision.md) |
| 键鼠、剪贴板、快捷键、事件 | [输入与事件](input-events.md) |
| 文件、JSON、路径、键值、SQL、数据处理库 | [文件与数据](data.md) |
| 执行上下文、计时/取消、系统/进程、音频 | [执行与系统](runtime.md) |
| OpenDesk 提示、Dialog、自定义窗口、App Mode | [界面与交互](presentation.md) |
| HTTP、回调、模型、CLI Agent | [网络与模型](network-ai.md) |
| 人工录制、扩展、Flow 资源 | [录制与扩展](authoring.md) |
| CLI/HTTP/MCP、计划、安装与打包 | [外部调用与交付](entrypoints.md) |

## 最少共用约束

目录和类型声明不证明当前 Runtime、平台、权限或插件可用；只读观察也必须遵守数据访问范围。区分大写 `UI`（外部桌面）与小写 `ui`（OpenDesk 界面），`App`（外部应用）与 `automation.app`（当前 App Mode）。作用域、真实返回值与业务后置条件不能由预期值代替。

会产生输入、写文件、网络或发布副作用时，先核对授权与失败边界。未知结果停止；不自动重试可能已提交的动作。取消不是回滚，`Promise.race` 不是取消原操作。首次编写异步/停止逻辑时读取 [Runtime 取消语义](../runtime.md#异步完成与取消)，不用先通读 Runtime 全文。

## 实际取得契约

从仓库根目录运行只读 Node 文档工具；**这不是 OpenDesk 业务执行入口**：

```bash
node scripts/api-docs.js read file File.readJSON --report
```

方法名由目录选择；该例不表示文件 API 优先。stdout 是 canonical 原文、必要公共段、来源 SHA-256/行范围和结束标记；stderr 是实际读取账本。需要精确重载/命名公共类型时追加 `--types`。只得到锚点、签名或摘要不算已读合同。

工具返回被截断、缺少 `END_API_READING_PACKET` 时，不进入调用。执行 `node scripts/api-docs.js plan file File.readJSON` 取得范围清单，固定同一 commit，再用宿主文件工具按每个范围读取（例如 GitHub `fetch_file` 的 `start_line/end_line`），逐段核对；范围在另一版本无效。无 shell 的宿主先获取同版本工具生成的清单，或沿 Reference 的方法及显式公共引用逐段核对；无法确认依赖完整时阻塞，不能假定点击锚点自动返回完整合同。

CLI 有合适命令时复用 [AI CLI](../ai-cli.md)；需要 JS API 时使用现有 `opendesk -script recipe.js` 或 `opendesk ai run recipe.js --input '{}'`，不因缺同名 CLI 重做底层能力。实际入口的参数、输出与取消语义也须按需读取。Node 文档工具不能运行 Runtime Recipe。

## 缺失、冲突与停止展开

目录出现“正文缺口”时禁止仅据 `.d.ts` 生成调用；记录缺失方法与来源，定向查证实现/类型/Reference，解决后才使用。若旧 Reference 无独立小节，工具明确返回该页完整共享正文；这不等于正文已通过全部行为审查。参数、返回、权限/平台、错误/等待/取消、副作用和必要类型/例子仍有关键遗漏，就阻塞该方法，而不是扩大为全文读取所有资料。

`runtime-api.ai.json` 保留机器检查用途，**不是日常默认全文输入**；`.d.ts` 只按需核对，不替代行为契约。设计、历史案例和专项 Skill 只由当前缺口/任务路由触发，原授权与安全停止要求不变。
