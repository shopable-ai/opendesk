# 本地 Codex Goal：实现 Accessibility Web Workbench 的最小闭环

仓库：`shopable-ai/opendesk`。
方案主文档：[Accessibility Workbench](../../docs/plans/desktop-automation/accessibility-workbench.md)。
工作方式：读取当前本地分支和工作树，直接完成必要代码、文档与测试；不只返回方案、审计报告或另一份提示词。

## 一、本轮成果与授权

实现一个随 OpenDesk 提供的、默认只读的本机 Web 检查面板：

**可信启用／配对 → 选择窗口 → 经 HTTP 获取真实 AX／UIA 树 → 查看树、属性及有依据的结构示意 → 人工修改定位候选 → 重新验证 → 保存修订并交给 Agent。**

Agent 不打开面板也必须能继续通过原有普通 JS 使用 Accessibility；面板不是自动化前置条件。

允许修改本目标必要的本地实现、内部策略、HTTP 页面、类型、测试、文档及发布资源；允许运行相关静态检查、隔离测试和必要构建。具备既有工具及系统授权时，可使用仓库自有、非敏感、可恢复的 fixture 做浏览器与原生验证；开始前简述目标窗口和影响范围，不操作真实业务应用数据。

不授权 Git 提交／推送、新建／切换分支、reset／clean、覆盖他人修改、安装第三方 Inspector／全局 Skill、下载系统镜像、运行 VM／Wine 或绕过系统权限。缺环境时交付已完成的代码和检查，明确未运行项，不用模拟结果冒充真机。

本 Goal 和主方案自包含；不要寻找网页会话中的 ZIP、下载链接或此前临时路径作为开发前提。

## 二、先接续资产，再实施

先读取 `AGENTS.md`、本 Goal、方案主文档，检查当前分支、`git status` 和已有修改；不回到方案记录的历史基线。查到并行成果时复用，不重新设计整条 Recorder 或 Agent 工作流。

必要阅读范围：

- `docs/api/accessibility.md`、`window.md`、`execution.md`、`http-server.md`、`custom-ui.md`；修改 API 文档前读取 `docs/api/.rules.md`。
- `automation/accessibility.go`、`accessibility_runtime.go`、相关 types／backend、window 和 execution 集成。重点核对 EnableAccessibility 的真实来源、owner、scope、队列、取消及 ElementRef 生命周期。
- `pkg/http/handler.go`、`scheduler_handler.go`、`scheduler_ui.html`、现有 HTTP 测试及实际启动／打包入口。`docs/api/http-server.md` 的精确合同以最新实现为准。
- `examples/accessibility/inspect-window.js` 及 fixture；保留受控示例的原有意义，不把摘要示例冒充通用面板。
- `workflows/human-to-recipe/README.md`、必要的既有交接，以及 `workflows/agent-to-recipe/skills/application-engineer/SKILL.md`。默认只读其专业正文，所需消费衔接做最小改动。
- 当前 CLI 帮助、构建物来源和发行包资源发现机制；不要猜旧命令目录、未存在的方法或平台资格。

先输出简表：已存在可复用／本轮补齐／后置或受阻。随后进入代码实施，不停留在表格。

## 三、不可改变的产品决定

1. 原生取数复用已有 Accessibility，最终输出仍是普通 OpenDesk JS。没有外部 Inspector 也能使用。
2. 默认人工面板用浏览器和 OpenDesk 内置 HTTP；不依赖 `-ui`、native UI host、Windows Custom UI 已支持或 Xcode。不要先实现完整原生 Inspector、IDE、Compiler 或第二套 Runtime。
3. 第一批是只读观察和定位校验。浏览器点击树节点只选中节点，不点击真实应用；没有 perform、输入、远程执行源码或管理员提权功能。
4. 原始树只读；可编辑业务别名、合法 selector、目标选择、用途及待验证信息。人工标注不改写原生 name／identifier／role／bounds。
5. 现有普通 HTTP／MCP／Scheduler 的 Accessibility 禁用保持不变。本功能必须是单独、明确授权的受限入口，不把 UI capability 等同于 Accessibility。
6. 窗口身份、完整性、候选与已验证结论分别表达。不得默认取活动窗口、取同名第一项、丢弃 partial、忽略 stale 或静默退回鼠标。
7. 没有配置模型时，明确交付文件／复制提示词；不得把这称为 Agent 已自动生成或已通过回放。

## 四、实施顺序与具体交付

### A. 建立一个可授权、可撤销的本机入口

复用同一个 OpenDesk 进程和 `pkg/http` 基础组件。默认提供 Inspector 专用的 loopback API 来源和路由集合；不挂载通用 `/executions`、Scheduler 写入或任意文件接口。浏览器前端应是可由 `serve`、`anywhere` 等任意 loopback 静态服务器发布的独立目录，静态端口由开发者管理，不能要求重复 OpenDesk 实例。仅当现有监听器已具备等效认证及隔离并有测试时才复用，记录依据。

独立静态页面只在用户显式点击后通过本机控制合同启用短期 API；不新增 CLI、桌面菜单或内嵌页面入口。程序已运行但能力未启用时，说明状态，不自动重启或打断其他执行。

实现短期一次性配对凭据、短期 session bearer 与撤销；浏览器内存保存会话凭据，不持久化、不进入导出、日志或长期 URL。初始配对可由可信本地入口生成一次性链接，兑换后立即清除 fragment，并控制有效期和重放。未授权页面不能 GET 获得秘密。

对所有数据请求检查凭据、实际 loopback socket、配置中的 Host／端口及浏览器来源。独立静态前端只在用户显式连接后登记精确 loopback Origin；控制请求须核对 loopback peer、Host、自定义 header、plain-HTTP Origin 与同源 `frontendUrl`，并严格校验 preflight。拒绝未登记来源、null Origin、伪造 Host、跨会话、过期、撤销、重放与转发头绕过。CORS 不作为认证。非浏览器测试客户端只能采用明确的认证规则。

静态资产只归属独立 app 目录，不复制到 OpenDesk 包、不使用 Go embed，也不由 OpenDesk HTTP 路由托管。页面无 CDN、无遥测、无任意外部内容，并内置适用于普通静态服务器的 CSP/referrer 策略；UI 数据按纯文本显示。

### B. 接通真实有界取数，不建立第二个原生后端

按主方案的有限操作实现 capability、用户触发的窗口元数据列表、scope session、observation、validate、review 和 close。路径只是建议；最终命名与当前 HTTP 风格协调并同步正式文档。

推荐使用由 host 选择的受控内置观察／校验程序，通过已有 execution manager 创建普通 execution，结构化传入严格验证的参数，执行后清理；不能收客户端源码、任意文件名、任意 URL 或源码片段，也不拼接 JS。

在已有 native owner／授权边界增加最小内部只读与 target scope 约束；不直接从 HTTP handler 调用 AX／COM，不伪造 source 以获得本地脚本授权，不修改通用 HTTP execution 的默认 Accessibility 关闭状态。内部字段和方法必须按当前源码实现，不将本 Goal 的职责名冒充现有接口。

**内部执行的数据隔离也必须完成：**可以复用 execution manager 的实现，但检查任务不能因注册到通用公开列表而从未认证 `/status`、`/executions/{id}`、事件流或 artifact 路径泄露 UI 树、修订、配对凭据及原生引用。采用模块私有的受管注册范围或等效访问控制，仍复用现有生命周期；不能为了隐私丢失取消和清理。受控程序通过结构化结果交接，不把完整敏感树随意写入公共日志。

要求：

- 无 scope 只 capability；窗口列表须用户主动请求，只列必要元数据，不批量扫描树。选定后冻结窗口生命周期和 session，所有请求都检查归属。
- snapshot 返回真实有界 root、backend、时间区间、目标身份、关联 ID 和 complete／truncated／reason／stats；不提供只有 childCount 的假闭环。
- 默认不读取 value、密码、剪贴板、截图和无关应用；后续 opt-in 能力不塞进本批。标题和 name 仍可能敏感，导出前预览范围。
- 预算和字节大小双重限制。窗口切换、超时、权限撤销、服务关闭、会话 TTL 都有处理。一个会话一个观察在途；过期 native 调用仍占用资源预算，不无限增生 worker。
- 前端 nodeId 只用于快照展示，不输出可跨 execution 操作的 ElementRef。validate 在同一 execution 内 find／必要 read／finally release，不能 perform。
- session／scope generation／request 顺序防止迟到响应串窗；浏览器 abort 不等于 hard cancel。无需高频全桌面轮询或复杂原生订阅。

### C. 完成真实网页，而不是静态假树

第一批必须有：目标选择与状态栏；可折叠／搜索树；属性详情；基于可验证 bounds 的结构示意；候选 selector 和业务别名编辑；实时后端定位校验；保存／导出／导入修订；Agent 交接。

页面文本、属性及注释一律安全渲染，拒绝 HTML／脚本注入。编辑区域不要覆盖原始字段。主状态必须显式呈现 partial、stale、未验证和连接错误。

结构示意明确标注非原应用像素级复刻，按逻辑坐标映射到示意窗口；负坐标、多显示器、窗口外节点、无效 bounds 有明确分支。没有 bounds 就只显示树，不能按常见界面臆造位置。截图、高亮、屏幕拾取和动作调试后置。

合法 selector 仅使用当前 API 的 role／name／identifier。树内过滤只是快照预览；“验证定位”必须访问后端重新执行完整有界 find，并保留未找到／歧义／不完整／超时／过期。不要新增未实现的 XPath、永久 nodeId 或模糊别名匹配。

需要父 scope 消歧时，使用当前 API 可表达的有限 selector 链，每层唯一、同 execution 内管理引用；无法表达的条件明确标未支持。禁止用树路径或裁剪后的唯一行伪造实时唯一性。

### D. 让人工调整实际进入下游

原始 observation 不可变，review 独立保存，handoff 关联来源及状态。复用既有共享合同，不创建全局 UI IR 或强制应用类。

工作包写入已有 artifact／用户数据根目录下的 `.runtime/accessibility-inspector/<session>/` 或安装版等效受控位置；校验路径、大小、覆盖和来源 hash。导入文件永远是数据，不能执行，也不能信任其自报“验证通过”。导出不带凭据、ElementRef 和敏感 value。

实现真实可工作的交接：优先调用当前已配置的 Agent 通道；不存在时保存文件并复制指向本地文件的任务提示词。后者须在 UI 中标为“等待 Agent 处理”，不能显示自动生成成功。

Agent 应读取目标、业务说明、人工选择、合法候选和未知项，先给可读业务步骤，再生成普通 JS；新 execution 重新定位并独立验证真实结果。不使用 expected 代替 UI 读取，不强制 calc.tapButton，也不新增独立 Replay Runtime。

只对已有 Recorder／application-engineer 的消费入口做必要增量。当前树属于事后观察，绝不改写历史录制包；不重写 H1—H8 或 Agent-first 的完整专业文档。

### E. 分发和文档闭环

将页面和必要内置程序纳入维护者生成的发布产物，同时保留可直接静态发布的源码目录。安装版兼容入口只需已构建 OpenDesk 与浏览器；仓库开发者可任选已有静态服务器，不要求特定 Node/Python 包或第二个 OpenDesk 进程。

实现后同步 `docs/api/http-server.md`、相关能力／内部类型和测试索引。新增或复用一个集中式 `docs/integrations/desktop-agent.md`，记录用户可实际复制的一行命令、工作目录、启用／撤销、权限、人工协作、无模型行为与可选第三方工具。更新主方案状态，不复制第二份方案。

公共 JavaScript 契约测试按 AGENTS.md 写入 `tests/runtime-api/*.js` 并用 OpenDesk 执行；HTTP handler／内部 seam 和前端测试放所属测试域，不能用 Go 白盒或宿主 mock 替代真实 Runtime gate。

## 五、必须测试的行为

| 分组 | 至少覆盖 |
| --- | --- |
| 正常主线 | 未安装外部 Inspector；无 -ui；选定受控窗口；HTTP 真树；树／属性／结构示意联动；人工编辑；重新验证；导出／导入；下游消费 |
| 权限与隔离 | 未启用、无 token、过期／撤销／重放、错 session、越 scope、恶意 Host／Origin／null Origin、正常同源 GET、跨站预检、伪造转发头、内部 execution／日志泄露 |
| 数据正确性 | 目标歧义、控件重名、空／不完整树、超深／超大／超长文本、未知属性、非法 selector、原生错误原样可诊断 |
| 时间与几何 | 窗口平移、关闭重建、切换目标迟到响应、无 bounds、负坐标、多显示器、浏览器缩放不改定位 |
| 生命周期 | 超时、用户停止、断连、刷新风暴、队列饱和、TTL、关闭服务；不能假设 in-flight 原生调用可强制撤回 |
| 人工与 Agent | 别名不能改原生事实；导入不能伪造资格；UI 文字提示注入不改变授权；新 execution 不复用 ref；原始 Recorder 事实不变 |
| 分发 | 安装版兼容入口与独立静态目录的真实命令；没有 CDN；确认主程序与静态资产为当前构建 |

在当前具备环境的平台，用明确受控 fixture 完成：选错候选 → 人工改正 → 实时唯一性验证 → 交给 Agent → 生成普通 JS → 一次获授权的非敏感操作 → 从真实 UI／业务状态验证结果。保留证据，且这一步不得通过只读 Web API 偷偷执行动作；正常脚本动作走已有授权入口。

macOS AX 与 Windows UIA 分别列证据。无设备就完成可行的代码／静态／编译检查并标目标系统 live 未运行；不安装 VM／Wine 凑分，不把一个平台的成功转移到另一个平台。

## 六、完成条件和输出格式

按主方案六维 100 分量表评估，目标至少 95 分，并给每项证据。安全与事实硬门槛必须全部通过；未测试只能记未测试，不能编造独立专家评审或凭主观自评分宣称产品合格。

允许明确交付部分完成，但不能把静态 HTML、JSON 文件导入、mock 或只返回计划称为 HTTP 原生闭环已经完成。也不要因为部分平台受阻而停止所有能完成的实施。

最终先展示“用户现在怎样使用”的真实命令与入口，再展示改动文件、实际调用链、人工修订到 Agent 的文件实例、测试与证据、未运行／失败／剩余项。分别报告：静态、mock、HTTP 集成、浏览器 UI、OpenDesk Runtime、macOS AX、Windows UIA、安装包、Agent 生成和业务验收。

保持当前本地分支，留给用户审阅，不提交或推送。
