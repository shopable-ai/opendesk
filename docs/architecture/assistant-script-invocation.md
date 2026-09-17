---
title: "AI 助手：制作、复用与真实调用链"
description: "Codex 制作普通 JS，OpenDesk 复用确定版本；明确入口、项目/范围绑定，并统一接入现有 Flow 安装、Catalog 与执行服务。"
---

# AI 助手：制作、复用与真实调用链

设计修订 v0.3，2026-09-18。文档核对起点：`master@a1a02edab815567bd1a10e869adee50081c05af1`，写入时按当前文件 SHA 做冲突检查。

**本次交付是设计收敛、文档关联与验收合同，不修改生产代码，不搬迁用户或 Calculator 文件，不运行模型/Runtime/桌面测试。** 下文第 3 节保留 2026-09-16 的源码核查，不能冒充当前构建的运行事实；不能从旧文档的 IMPLEMENTATION_PENDING 推断近期 Flow 功能仍未实现。实施需重新核对真实源码、现有测试和交付记录。

## 1. 一屏看懂最终方案

**制作时绑定用户项目与制作任务；使用时绑定允许调用的 Flow 范围；执行时绑定确定内容、输入、目标和授权。Codex 负责制作，OpenDesk 负责受管运行，两个入口共用资产与服务。**

```text
                    AI 助手 / 本地 Codex
                             │
              ┌──────────────┴──────────────┐
              │                             │
         制作／改进                      使用已有自动化
              │                             │
      用户项目＋制作任务                允许调用的 Flow 范围
              │                             │
    真实操作＋同步留证＋结果核验          匹配固定行为／填写参数
              │                             │
       提炼普通 JS 候选                     │
              │                             │
      冻结候选 → 独立验证                   │
              │                             │
   明确发布/安装及启用 → Local Flow Catalog ←┘
                             │
                   确定版本＋预览＋运行授权
                             │
                    共享受管执行服务
                             │
                  普通 JS → 实际结果与证据
```

普通问答是无执行权限的状态，不要求绑定项目。未找到合适 Flow 时返回澄清、阻塞或 Gap；只有用户明确选择制作才进入左侧，不能自动提升工具权限。

设计主线保持不变，但补齐四项关键决定：

| 需要纠正的旧推导 | 当前决定 |
| --- | --- |
| 每个助手会话都绑定源码项目 | 制作/改进绑定项目；使用已安装 Flow 可不持有源项目；普通问答可无绑定 |
| 另外建立 capability-catalog/capability-releases | 复用唯一 Local Flow Catalog、Flow 安装根和执行 Gate；能力描述只是其只读索引投影 |
| 发布内容按 `<id>/<version>/` 长期安装 | 遵守既有 `flows/<installId>/`，无正式 version 子目录；版本以身份/摘要绑定，由既有事务 owner 更新 |
| 先只美化 Calculator，再做用户链路 | 先验证核心目录外的真实用户制作与复用；Calculator 迁移为同路示例，不扩大专用分支 |

完整设计自评 **96/100**，评分维度、扣分和硬否决统一维护在 [验收合同](../quality/assistant-authoring-reuse-acceptance.md)。分数不是独立专家认证、产品完成度或实测成功率。

## 2. 使用场景与绑定规则

| 用户要做什么 | 默认入口与绑定 | 关键结果 |
| --- | --- | --- |
| 用本地 Codex 完成一次真实任务并产出脚本 | 用户工作区＋制作任务 | 操作与观察可追溯，生成普通 JS 并独立验证 |
| 在助手里制作自动化 | 同一工作区/任务包，后期接官方 Codex 适配器 | 与终端制作共用流程，换入口不丢成果 |
| 解释或改进已有脚本 | 明确文件/Flow/候选及版本 | 解释只读；改进另建候选，不热改安装版本 |
| 整理 Recorder 产物 | recording＋来源任务＋工作区 | 复用录制，保留 Human 来源，不强迫重新演示 |
| 用对话运行已有 Flow | 允许调用范围 → 明确 Flow 版本 | 不要求源码项目；固定流程与参数流程都能正确调用 |
| 继续未完成制作 | 原任务包、进度、产物和最后证据 | 从首个实际缺口接续，未知副作用先核对 |

详细规则见 [入口与工作区绑定合同](assistant-workspace-bindings.md)。同一窗口可切换不同会话；项目、可调用范围、草稿、授权与 Codex 上下文不得通过一个全局“当前目录”共享。

上下文栏只展示：模式、项目或范围、当前任务、关联程序及阶段。用户已明确选择脚本后，后续“改这个参数”不重新检索全库。切项目/模式先结束或停止旧活动任务，相关变化使旧确认失效。上下文绑定不等于目录读写、模型外发或业务执行许可。

## 3. 已保存的真实调用链：2026-09-16 源码快照

本节引用 `d7bfffacb59b5f5c557aa47561e4af262d37d86c`；完整 v0.2 可从 Git 历史查阅。保留它是为了定位演示特例，不表示今天的源码/安装包仍完全相同。

### 3.1 当时正式助手的 Calculator 路径

```text
apps/opendesk/main.js
→ 从 Execution.scriptDir 加载 capabilities/calculator.js
→ OpenDeskAssistantTaskService.create({agent, calculator})
→ assistant/controller.js：send.click
→ assistant/session.js：submit → 保存 request/message 身份 → performRequest
  ├─ shouldHandle(text)=false → model-channel.send(messages) → 普通回复
  └─ true → task-service.plan(text)
          → Agent.run(codex / codex-analysis)
          → result.data：固定 JSON 参数 envelope
          → 宿主再次校验/冻结 → 可信预览 → 用户确认
          → task-service.execute → calculator.execute
          → pressAndRead / twoStage → 显示区读值 → 会话结果
```

当时实际业务文件为 `apps/opendesk/capabilities/calculator.js`；能力 `calculator.basic@1.0.0`、任务 `calculator.pressAndRead` 和 `calculator.twoStage`。不是用户目录检索，也不是本次模型生成 JS，更不由播放器当前选择决定。

固定参数形状为 `schemaVersion/kind/task/buttons/multiplier/message`；两阶段第一段的结果只能由显示区实际读取，再构造 multiplier × firstResult 的第二段按钮。模型不能提供 firstResult/expected。

当时需要注意的事实：

- 路由依赖“计算器/calculator”与动作正则，中文“计算器”自身含“计算”；不能可靠区分否定、引用和仅解释。误路由仍不等于已经绕过后续确认执行。
- 任务 Planner 只接本轮 text，普通聊天接 messages；不证明结构化任务续改已经成立。session 保留旧确认失效、重复确认与迟到结果保护。
- Calculator 当时按相对 keyPoints 换算并调用 mouse.clickForPID，Accessibility 用于读数；不是自动采用 UI.tapTexts 或 AX 按钮 invoke。范围限定 macOS、应用身份、232×321 Basic 布局及相应容差。
- request/message 终态持久化不等于完整 Run Record；“未运行 JavaScript”文案应改为“复用了已有 JS，没有执行模型临时生成代码”。
- `examples/ai-workflows/chat-calculator/` 是另一套示例；修改它不能证明正式助手已变化。version/codeRef/“已资格化”文字也不是验证证据。

### 3.2 当时正式 Runner 的用户脚本执行路径

```text
scriptRoot：已配置 OPENDESK_SCRIPT_RUNNER_DIR
         或 appDataRoot/recipes
→ Script Runner 选择 scriptPath
→ script-runner-simple.js 的 productCommand.run 适配
→ __opendeskRecipeExecution.run({scriptPath, workdir, logDir, signal})
→ cmd/opendesk/app_recipe_runner.go
→ production loader 读取 JS / 入口快照
→ pkg/execution.Run
→ 新 Execution.id / 状态 / 日志 / 取消
```

该快照中的任务拥有新 Runtime/Execution，但在 App host 进程内，不是 OS 级沙箱。桥当时只接 `.js`，已有 BUSY/Recorder 冲突检查和取消；不能据此推断当前所有入口的原子桌面排他、业务 input/result、依赖完整性或受保护包均完成。

**演进原则是复用当前正式执行 owner，不另造助手执行器；不能因本节历史限制重新实现已完成的 Flow 功能。** 当前安装/运行状态以真实代码及已有交付报告为准。

## 4. 项目、Flow、能力描述、运行的关系

| 对象 | 职责与唯一性 |
| --- | --- |
| 用户项目/工作区 | 可编辑源码、素材、原始录制和制作任务；不是产品核心目录，也不要求普通使用者持有 |
| Candidate/Qualification | 依现有作者合同固定代码/依赖及独立证据；不是另一套安装包或会员授权 |
| Flow 发布/安装 | `.js` 轻量导入、`.odpkg` 保护载荷、`.odflow` 正式分发沿既有 owner；不另建 parser/installer/trust |
| Local Flow Catalog | 唯一本机安装身份、摘要、来源和可用状态；与远程 Marketplace Catalog 分开 |
| 助手调用描述 | 用途、固定行为、输入输出及支持范围，映射到确定 Flow 内容；仅作已授权目录的可重建投影 |
| Invocation/Run | 本次目标、参数/固定约束、版本/内容摘要、确认、Execution、实际观察与验证 |

用户术语使用 Flow；历史 CapabilityDefinition/CatalogEntry 继续表达业务能力合同，不机械新增同义 Program/Skill/Flow 注册库。需要兼容旧 schema 时做一次版本化映射并测试，不能向严格签名 Manifest 偷加未定义字段。

调用身份是已验证发布者/本地来源下的 flowId、installId、内容摘要与逻辑操作引用；显示名称不承担身份。一个 Flow 可以包含多个模块，辅助模块不是可选业务任务。多个逻辑 operation 仅在现有合同明确支持时开放，否则先一个 Flow 一个入口，不由模型发明内部函数名。

“已安装”“已获信任/权益”“已验证适用范围”“已启用给助手”“本次获准执行”分别判断。直接运行自有 JS 的开发者入口不因本设计被全局禁止；助手自然语言选择需满足更明确的调用资格与范围。

## 5. 资产与安装布局：不建立第二套目录

物理安装与密钥/授权存储以 [Flow 分发安装模型](execution/flow-distribution-installation.md) 为准：

```text
用户工作区                     # 可编辑源脚本、素材、制作资料
<appDataRoot>/flows/<installId>/ # 既有单一 Flow 安装内容；无 version 层
<appDataRoot>/flow-data/         # 可写业务数据
<appDataRoot>/flow-state/        # 宿主安装/状态等记录，依既有 owner
现有会话及运行产物区             # 只保存引用/本次事实，不复制执行程序库
```

**v0.2 提议的 capability-catalog、capability-releases/<id>/<rev> 不再建设。** 助手搜索索引可以缓存，但它不是安装/信任/授权真相源；可从唯一 Catalog 和经批准的调用合同重建。

用户仍编辑原工作区；安装内容经既有事务发布/更新，运行固定精确摘要并持有实际执行内容。没有版本子目录也必须保证运行不混入新代码；运行中更新等待或按既有 owner 明确拒绝，历史版本元信息与必要证据按保留策略记录。不额外保留一个可执行副本库来伪装版本冻结。

`.js` 接入不强迫用户创建工程或手写 Manifest，宿主可按已有设计形成本地记录，但不能伪称发布者签名。`.odflow` 是正式交付格式，不改变 JS Runtime；市场只带来安装意图，不自动启用作者工具或自动运行。

sourceRoot、Flow 资源根、entryPath、workdir、数据/产物位置必须区分。旧脚本的相对路径、硬编码路径和输出位置由迁移验证明确处理，不悄悄改变 cwd，不把业务输出写回安装树。依赖动态下载/拼接而无法固定时必须暴露缺口。规范化路径、符号链接/目录越界、大小写/Unicode 冲突、半写入源文件均需检查。

## 6. 固定流程、参数流程和预设

固定录制脚本是一等对象。无业务参数时使用只接受空对象的输入合同；可以继续是顶层 JS，不强制提取函数。固定门店/对象/动作必须与用户请求一致：要求“门店乙”时不能丢掉限定，传 `{}` 运行门店甲。

参数化在有真实变化需求时进行。只开放实际代码消费并经验证的业务字段；内部变量、定位常量、时间阈值不是天然的外部输入。参数分为本轮业务数据、机器配置、Secret 引用、定位规则和真实 Observation，彼此不混用。

参数预设引用确定内容版本和参数，不复制脚本。固定字段不能静默被覆盖，升级要检查合同兼容。没有显式参数的脚本仍可能依赖账号、当前窗口、剪贴板、文件选择和日期时区，这些必要隐式输入需解析、限制与核验。

数据沿现有执行 owner 传递，缺少结构化 input/result 时只做该 owner 的增量合同；此页不公布不存在的 Execution.input/Flow.run API。禁止字符串替换代码、共享全局/配置传参、模型生成 launcher 或任意路径/Shell。module 的静态入口属于候选依赖，script 在授权后由 loader 运行，发现阶段不执行代码。

## 7. 三段成功与一条可接续制作链

```text
目标/成功标准/授权与预算
→ 复用已有任务包、录制、AppProfile 和脚本
→ 获准真实操作，同时记录动作/结果/关键证据
→ A：这一次业务真的完成
→ 提炼有效步骤，去除探索和错误，保留来源映射
→ 普通 JS 候选；固定或按需参数化
→ 冻结候选及依赖，使用获准测试状态独立运行
→ B：脚本不靠 Agent 临时补做也成立
→ 明确发布/安装及启用，经唯一 Flow owner 登记
→ 新请求、确定版本、可信预览与确认
→ C：助手选对任务并运行，结果有真实证据
```

Agent-to-Recipe、Human-to-Recipe 与 Existing Assets 共用既有候选/资格/交接合同，不把所有职责拆成新 Skill 或新 Runtime。录制产物保留 Human 来源，静态 refiner PASS 不能替代业务资格。完整新示范不得靠“接续”绕过必要步骤；已有有效资产也不能被强迫从零再录。

记录优先来自 Runtime/工具实际事件，Recorder 是可选来源，不以全局录制器作为必经前提。关键业务步骤与实际调用/读值/消费者对应；只保存模型总结不足以接续或证明成功。

独立验证冻结候选和标准；Agent 临时救场、改代码、补读或复用第一次结果都不算脚本通过。测试副作用、重复发送/删除等必须先设计安全测试对象和恢复方式。失败只修对应缺口并重验，发布/安装成功不自动重跑第一次请求。

## 8. 受管运行、安全与观察

日常运行依次完成：范围/意图与固定约束 → 可信候选召回 → 澄清或阻塞 → 宿主校验输入、安装/信任/权益/资格与环境 → 只读预检 → 必要准备授权 → 冻结预览/确认 → 共享 owner 原子取得运行权并重查 → 实际 JS → Observation/验证/结果。

查询、匹配、预览不得调用不可信脚本来证明其可信。权限、文件外发和执行范围由宿主限制，不由 descriptor 自报；模型给出的可信等级/版本/路径不能授权。参数文件作为业务输入只有在合同和资源授权内可用，不得混作代码路径。

首次范围只承诺实际已实现的桌面仲裁与停止边界；App 内单请求不证明外部 Runtime 也互斥。BUSY 不建立隐形队列，取消先阻止后续动作并等待实际停止，不能把按钮点击说成已停止。独立 Runtime 不承诺恶意 native 崩溃或全系统权限沙箱。

Run Record 关联 conversation/request/task、Flow/operation、install/version/digest、输入及来源、配置/目标、确认和 Execution。事件区分已提交、效果已确认、未知及失败；执行返回、观察到值、业务验证通过分别展示。未知效果禁止自动重试，恢复历史不自动执行。

计划步骤图和实际轨迹分开，映射到精确代码与证据；未执行步骤不能显示通过。查看代码用本次实际内容，受保护载荷仅展示允许元信息。日志/截图/参数默认本地最小保留并脱敏，不能直接作为 PostHog 统计字段或模型上下文。

删除会话、撤销启用、卸载、删除项目源码和删除业务输出是不同操作。临时 `.runtime/` 清理不能毁唯一源资产或发布资格证据；正在运行内容由既有 owner 保护，必要长期证据沿现有资格/发布存储管理，不另造安装目录。

## 9. 分阶段推进：不重做已有 Flow 能力

| 阶段 | 可交付的用户结果 | 不作为前置 |
| --- | --- | --- |
| A：本地制作闭环 | 本地 Codex 在用户项目里完成一次真实任务，留证，生成脚本并独立验证，任务包可接续 | 助手内完整 Codex UI、万能 Recorder 或新 Skill 全家桶 |
| B：已有 Flow 对话复用 | 核心目录外一个固定任务和一个参数化任务，经现有 Flow 链接入；助手选对版本并经共同执行服务运行/停止/追溯 | 新市场、第二 Catalog、图形化 DSL |
| C：助手内制作 | 官方 Codex 适配器消费同一项目/任务包，模式与权限可见，线程恢复/审批/停止可靠 | 重写原 Agent-to-Recipe 或复制所有执行逻辑 |
| D：规模与演进 | 保留集匹配评测、第二真实业务、依赖/预设更新与跨平台资格 | 用合成目录实验冒充所有脚本业务通过 |

阶段是依赖关系，不要求 A 完全结束才可并行完善 B 的宿主接口。已有可复用资产直接从相应阶段接续；商业 Flow 已完成的 parser/install/catalog/context 按当前源码复用，不重跑 B0 从头开发。

Calculator 的旧专用注入在通用路径真实验证后移除，改为同一路径示例；不要提前搬走必需文件导致启动失败，也不迁移原 golden 资格。所有新能力按当前 API/类型/测试落地后再写入 docs/api，不提前发布猜测接口。

## 10. 需要保存的六类合同与文档地图

| 内容 | 权威位置 | 本次处理 |
| --- | --- | --- |
| 总体结构、真实历史调用链、迁移次序 | 本文 | 更新为 v0.3；标清历史与目标，不伪造当前运行审计 |
| 使用入口、项目/范围/会话/任务/版本、模式权限 | [绑定合同](assistant-workspace-bindings.md) | 新增，作为既有对话工作台的有界增补 |
| 作者链、资格、发布、Flow 映射和维修 | [生命周期总纲](desktop-automation/task-capability-lifecycle.md) | 同步消除独立目录/仅项目绑定等旧推导 |
| 验收、三段证明、误命中评测及评分 | [验收合同](../quality/assistant-authoring-reuse-acceptance.md) | 新增；全部本轮未运行项明示 |
| RPA 借鉴的官方依据、采用/不采用与限制 | [研究决策记录](../research/rpa-authoring-reuse-design.md) | 新增，外部产品事实不冒充本项目实现 |
| 开发者阅读导航 | [assistant/README](../../apps/opendesk/assistant/README.md) | 指向当前合同与历史范围 |

既有 [对话工作台](conversational-task-workspace.md) 的会话 UI 需求继续有效；其旧阶段排期、来源存储及模式泛化若与本次合同冲突，采用本次有界增补，不因此重做会话。旧 [Calculator Chat 文档](conversational-task-runner.md) 仅拥有相应示例历史合同。

物理 Flow 格式/安装/信任/授权以 [分发文档](execution/flow-distribution-installation.md) 和真实既有 owner 为准；[商业交付台账](../plans/commercialization/subscription-entitlement-delivery.md) 不复制。作者资产结构继续用 [共享 Skill 合同](../frameworks/agent-to-recipe-skill-contract.md) 和既有工作流，不创建同义 schema。

设计自评和硬门只有验收文档一处权威。后续本地 Codex 提示词按用户规范先写“目标需求”，聚焦最终行为、完成标准和必要边界；提示词是当前实施任务的入口，不是本方案唯一存储位置。
