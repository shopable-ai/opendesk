# Agent 分层 API 阅读交付与维护

本轮只改变 API 文档发现/读取层，不改变 Runtime、CLI/MCP/HTTP 返回格式、业务 API 或 Agent-to-Recipe 的 S1—S12/专业职责。唯一短入口是 [docs/api/agent/README.md](../api/agent/README.md)。

## 阅读路径与停止条件

短入口 → 一个或少数语义能力目录 → 比较方法 → `scripts/api-docs.js read` 返回 canonical 原文与明确依赖 → 本轮环境/授权校验 → 现有入口。下一业务步骤需要新能力时才继续展开。已有 Recipe 可从源码中的真实方法定向查阅，不要求重新通读所有目录。详细契约始终维护于现有 Reference；没有独立小节的旧页会明确整页兜底，不进行静默截断。

目录由 Reference 总表/标题与类型接收者声明并集生成；本次覆盖检查为 10 个语义组、45 个文档入口、机器索引的 41 个 globals 及其 keyMethods，共 493 个目录条目。条目包括方法、属性、实例方法和兼容别名，不能说成“493 个当前已验证可调用方法”。未能找到对应行为正文的声明会显示“正文缺口”，读取该方法失败；不得从目录或类型自行补全合同。完整性检查不能替代逐方法行为审查。

## 旧阅读入口与 JSON 消费者

`docs/api/index.md` 原先把机器 JSON 标为给 Agent/工具读取，并称其为 Agent 紧凑索引；现把 Agent 导向短 Markdown，程序消费者保留 JSON。根 `README.md`、`QUICKSTART.md` 的默认推荐列表同步替换。`docs/api/README.md` 保留用户总导航；`docs/api/agent.md` 仍属于 Runtime `Agent` 对象，不是第二个阅读入口。

`AGENTS.md`、Workflow 总导航、Agent WORKFLOW、application-engineer、Human 与 recorder-script-refiner Skill 只接入发现触发条件。已保留另一会话提交 `fef9e1f823ae1eca1e744056ac5c80401dafd87f` 新增的能力发现专业设计，只更换其中 API 读取路径；没有重写阶段、字段或职责。没有把设计总纲、历史案例或全部 `.d.ts` 增加为默认必读，也没有移除原授权、真实值、未知状态停止及专项 Skill 路由。Human 状态提示的旧 `ui.notify()` 推荐同步改为已有 canonical `ui.toast()`，未删除兼容 API。

在完整仓库 checkout 上执行的 `git grep` 已确认以下消费者仍使用 JSON：

| 消费者 | 作用与上下文边界 |
| --- | --- |
| `scripts/check_api_docs_contract.js` | `JSON.parse` 后校验路由/规则，输出少量结果，不自动把 JSON 全文送入模型 |
| `tests/app-package/app-builder-docs.test.js` | 文档/机器索引一致性测试 |
| `tests/runtime-api/catalog_validation.js` | 通过 OpenDesk `File.read` 解析目录验证输入 |
| `tests/runtime-api/unit/native-extension.test.js` | 原生扩展的文档索引检查 |
| `tests/extensions/native-plugin/tools/proof-harness/main.py` | 把索引列为 proof-harness 文件输入；本次只确认引用，不推定模型加载 |
| 新增 `scripts/api-docs.js check` | 程序读取 JSON 检查 globals/keyMethods 覆盖；`read`、`plan`、`catalog` 不以该 JSON 作为正文来源 |

搜索结果保存为 `json-consumers.txt`、`program-consumers.txt`。搜索没有发现自动把整份 JSON 送给模型的证据，但静态字符串搜索不穷尽动态路径，不能据此宣称绝不存在其他消费者。JSON 的结构、内容和现有消费者均保留。维护流程中“Reference → 机器索引 → 类型”的同步规则不是 Agent 的顺序必读清单，不误删这些有效材料；历史专项实施 Prompt 不作为日常阅读范围。

程序实际读取文件、工具实际返回内容、模型/宿主真正加载的上下文分别记录。不能把程序解析 JSON 或扫描类型目录直接等同模型全文加载。

## 工具与维护

从仓库根目录执行：

```bash
node scripts/api-docs.js catalog data
node scripts/api-docs.js read file File.readJSON --report
node scripts/api-docs.js read file File.readJSON --types --report
node scripts/api-docs.js plan file File.readJSON
node scripts/api-docs.js outline file
node scripts/api-docs.js generate
node scripts/api-docs.js check
node --test tests/api-docs/reader.test.js
node scripts/check_api_docs_contract.js
```

`catalog/read/plan/outline/check` 不修改业务文件、不请求网络、不调用 OpenDesk；`generate` 只更新已登记的 `docs/api/agent/*.md` 方法目录。Node 是维护/阅读工具环境，不是业务 Recipe Runtime。读取错误退出 2，检查失败退出 1，正常退出 0。

导航/公共章节依赖只在 `scripts/api-docs-map.js` 维护，不复制参数、返回或错误正文。Reference/类型修改后生成并检查目录；源哈希、锚点、链接、全局项、keyMethods 与声明候选覆盖纳入离线检查。类型闭包仅 `--types` 触发；存在必要类型冲突或缺失时拒绝输出半份类型合同。该选项可能在程序层扫描全部 `.d.ts`，但仅返回选中成员及命名公共类型闭包。

正文范围包括来源路径、1-based 起止行、SHA-256、选择原因；有 Git 工作树时另有 HEAD。成员类型是明确标记的声明摘取，不能伪称连续 Reference 行段。模型工具可能限制输出，必须确认没有截断并检查结束标记；不完整时用 `plan` 取得范围并固定同一版本逐段获取，不能把 Markdown 锚点当作已读取。哈希标识内容，不是当前已安装 Runtime 或发布者可信证明。

`read` 的结束标记仅表示提取器完成此次输出，不表示旧 Reference 已具备每一种行为字段。必要错误、权限、返回或平台语义在原文仍未明确时必须补证/阻塞；不能把完整传输冒充完整行为合同。

## 三组文档发现演示

| 自然语言输入 | 发现路径与选择理由 | 未要求读取/执行 |
| --- | --- | --- |
| 确认指定应用当前显示的订单号，只观察，不输入，不猜值 | 应用/窗口和桌面目标目录 → `window.get` 身份/唯一性约束 → `UI.readText` 文本、scope、坐标、失败/平台约束；原生输入框 value 是另一种需求，应另比较 getValue | 不读取文件写入、录制、分发或历史业务案例；不执行桌面 |
| 读取已有 JSON 配置中的字段，格式错误必须报告，不修改原件 | 数据目录比较文本/JSON 读取 → `File.readJSON`；必须附带原先在 writeJSON 章节下的公共错误、取消与资源约束 | 不读 write 方法业务正文、全部 File API 或桌面材料；不读取真实配置 |
| 已有 Recipe 取消后仍重复输入，只修局部，不改业务 | 先只读示例源码才发现 `UI.tapTexts` → 该方法的 completed/actionState/等待/取消 → Runtime 取消边界；对可能已提交的动作不统一 catch 后重做 | 示例源码只是字符串，不执行，不代表真实客户 Recipe 已修复；不重走完整工作流 |

在提交 `4275c384317fab2cef804ce80cee36ccc7b8f320` 的完整 checkout 上，应用有 hash 保护的本轮导航候选并生成目录后，CI 实际测得：

| 演示 | 短入口＋选中目录＋正文阅读包累计 UTF-8 字节 | 选中阅读包字节 |
| --- | ---: | --- |
| 桌面取值 | 71,087 | window.get 9,118；UI.readText 14,368 |
| JSON 取字段 | 32,471 | File.readJSON 5,334 |
| 取消后重复输入的局部检查 | 48,699 | UI.tapTexts 18,952；Runtime 取消 5,933 |

短入口本身为 4,522 UTF-8 字节。以上是该次实际版本的测量，不是固定预算或未来版本承诺。包内 revision 字符串也计入字节，缺 Git 的本地快照与真实 checkout 的输出字节可能略有不同。

完整范围、代码点字符数、源 hash 和工具读取账本保存到 `.runtime/tests/api-docs/reading-demos.json` 及对应 Markdown 包。例如 File.readJSON 实际返回 `file.md` 的 1–22、61–61、105–130、157–184、435–442 行，并非仅返回 105–130 行的方法签名/例子。重复读取逐次计数，不虚构缓存命中。没有 tokenizer/provider 实测，不报告 token 节省或效率已提升。

## 实际验证及保留缺口

2026-09-18，GitHub Actions run `35344177548` 的文档准备 job 在完整仓库上完成 17 项 Node 测试，17 pass、0 fail。覆盖目录/源漂移、所有登记入口、选中范围/字节、必需依赖缺失、锚点不绕过依赖、别名/实例、结束标记、路径越界、UTF-8、类型按需展开和三组离线阅读路径。源快照采用 tar 保留 `types/UI.d.ts` 与 `types/ui.d.ts` 的大小写差别；四份已提交的新入口/工具/测试与本地验证版本逐字节一致。

导航/提取检查通过不代表所有旧 Reference 的合同已补齐。本次发现 29 个旧正文缺口（含仅表格、仅类型及属性声明），例如 `page.waitForNavigation`、部分 File 方法、`axios.request`；这些条目保留可发现性但标记 blocked，`read` 不生成伪合同。`coverage.json` 给出完整清单。没有把它们悄悄从覆盖分母移除，也未越界修改底层能力。

原有 `check_api_docs_contract.js` 在本轮读取层实现前的提交 `f325e459cb42ff7380a57caf1a454c3f5056dc11` 就已失败，具体为 `apps/opendesk/scheduler-center.js` 缺少其断言的 canonical inline template name；旧检查没有因本轮而被削弱或删除。新增阅读检查与它是独立 job，分别报告。未修改计划中心产品代码。最终提交的检查以对应 commit 的 CI 与 artifact 为准，不把生成前或其他 commit 的结果当作最终运行证明。

本轮完成的是确定性读取与离线脚本化演示，不是独立 Coding Agent 的盲测或生产 Skill 宿主加载测试。没有运行真实桌面、客户业务、生产接口或平台资格，也没有 hosted Agent/token 对照实验。GitHub 远程写入无法观察用户未提交工作区；并行更新通过写入前源哈希核对与非强制快进保护。没有删除有效文档、JSON、类型或执行入口。

## 后续任务的复制用法

```text
继续当前 Agent-to-Recipe 任务，复用已有任务包与成果。
需要发现或核对 API 时，只从 docs/api/agent/README.md 开始，
自行按当前业务步骤选择能力目录，取得选中方法的 canonical 正文及必要依赖。
记录实际读取路径、版本与范围；发现截断、合同缺口、类型冲突或未知副作用就停止补证。
不要全文加载 runtime-api.ai.json、全部类型或无关历史案例，不预设某个 UI API 优先。
使用已经授权的 OpenDesk 正式入口，不新增 Runtime，不让用户手工挑选文档。
本轮未授权真实桌面/客户业务时，只完成文档、代码与离线检查。
```
