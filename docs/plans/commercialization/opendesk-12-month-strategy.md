# OpenDesk 未来 12 个月战略路线（2026-09 → 2027-09）

更新时间：2026-09-15

> 本文把 [`OpenDesk 全球竞争力与商业可行性基线`](../../research/commercialization/opendesk-global-competitiveness-2026.md) 转成未来 12 个月的执行收口。
> 它不是功能愿望清单。任何新增能力都必须说明它如何提高真实任务可靠性、首次交付效率、复用率、维修效率或商业验证强度。

## 一、12 个月核心目标

未来 12 个月不以“做完整 RPA 平台”为目标。

核心目标是证明：

> **OpenDesk 能把一类高频、跨应用的真实桌面工作，转化为客户可以长期运行、能够验证结果、出现变化后能够低成本维修，并愿意持续付费的自动化资产。**

最终必须同时出现四类证据：

```text
技术证据
→ 真实业务成功率、失败分类、Repair、跨平台 qualification

产品证据
→ 首次成功时间、重复运行、故障定位和维修时间

商业证据
→ 真实付费、续费、第二个流程购买、支持成本

复用证据
→ 相似客户/场景不再从零开发
```

如果只有代码增长而没有这四类证据，不算战略目标完成。

## 二、如果未来 12 个月只允许做五件大事

### 1. 找到两类高频任务，完成真实付费与续费验证

优先候选：

1. 电商 / 贸易后台跨系统数据处理；
2. 财务 / 代理记账中的资料收集、对账、报表整理；
3. 客服辅助与工单后台处理；
4. 中小企业 Back-office 跨系统录入。

不是“行业都能自动化”，而是每一类只选 1—3 个结果明确、重复频率高、风险可控的任务。

每个试点必须记录：

```text
人工基线耗时
自动化完整耗时
每周运行频率
业务结果正确率
失败类型
人工介入次数
首次交付工时
维修工时
客户支付金额
30 / 60 / 90 天后是否继续使用
是否购买第二个流程
```

扩大投资门槛：出现持续使用、续费/第二流程购买和支持成本收敛，而不是只出现一次成交。

### 2. 建立真实 Desktop Reliability + Business Verification 体系

这是当前技术竞争力从约 51 提升到 70+ 的最大杠杆。

重点不是增加 Error Code，而是建立真实 benchmark：

```text
真实应用
× 真实业务任务
× 多次重复运行
× 多机器 / 分辨率 / 版本
× 独立业务结果验证
```

首批至少覆盖：

- 一个系统原生应用；
- 一个 Electron / Chromium 类桌面应用；
- 一个 Office / 数据处理应用；
- 一个 IM / 客服类应用；
- 一个真实业务 Back-office 应用。

每个任务必须有独立后置条件，不允许用“点击成功”替代“业务成功”。

核心指标：

- end-to-end business success rate；
- unsafe / duplicate action count；
- timeout / cancel correctness；
- 7 天连续运行；
- 30 天连续运行；
- App version 变化后的失效率；
- median time-to-diagnose；
- median time-to-repair。

### 3. 打通最小 Demonstration / Agent → Recipe → Qualification 闭环

只做一条可用产品链，不先把所有工作流职责拆成大型平台。

目标用户链路：

```text
用户提出任务
→ Human / Agent 完成一次真实任务
→ 保存事实和关键 evidence
→ 去掉探索 / 错误 / 重复动作
→ 参数化真实业务输入
→ 生成普通 OpenDesk Recipe
→ 从干净状态执行
→ 独立验证真实业务结果
→ Qualification
→ 保存为可复用资产
```

必要原则：

- 原始事实不可被后续推理覆盖；
- 业务验证与动作成功分开；
- 生成后必须明确标识：确定性 Recipe / 模型辅助 Recipe / Agent execution；
- 不把每次调用模型的 replay 伪装为 model-free deterministic automation；
- 不要求为了完整架构先实现所有未来 Skill。

成功标准不是“生成了 JavaScript”，而是：

```text
第一次真实任务完成
+
Recipe 从干净状态再次完成
+
第二次不依赖人工逐步指导
+
真实结果通过独立验证
```

### 4. 完成低摩擦产品交付

技术项目必须进入可以被真实客户使用的状态。

重点补齐：

- 明确源码 / 产品许可；
- macOS / Windows 正式支持范围；
- 可下载发行版；
- 安装与权限引导；
- 版本号和升级策略；
- Runtime / Recipe compatibility policy；
- 配置、Secret 和诊断入口；
- 错误报告 / Evidence 导出；
- `.odpkg` / 授权等交付能力只在真实付费场景中继续扩展。

首要验收：一个不参与 OpenDesk 开发的人可以完成安装、运行受支持模板、看到失败原因并把诊断材料交给维护者。

### 5. 把维护与分发变成可重复经营动作

技术价值只有能持续触达客户才会转成商业价值。

未来 12 个月优先：

```text
10 个可复用案例族
+ 服务商 / 自动化开发者合作
+ 真实运行与 Repair 数据
+ 模板式交付
+ 维护服务
```

内容策略不先宣传“下一代 RPA”，而是展示具体业务结果：

```text
谁每天在重复什么
→ 人工需要多久
→ OpenDesk 怎样做
→ 实际用了多久
→ 怎样验证结果
→ 哪些情况会停止 / 需要人工
```

最终扩到 100 个案例可以做，但先证明前 10 个案例族能够带来真实试用、运行和付费。

## 三、如果只能做三件

只保留：

1. **付费场景验证**；
2. **可靠、可验证、可维修的 Recipe 引擎**；
3. **标准化交付与获客**。

其余能力只有在这三件事明确需要时才继续投入。

## 四、如果只能押一个核心方向

> **押“把一种高频、跨应用桌面工作变成可验证、可复用、可维修、可长期运行的自动化资产”。**

不押：

- 功能最多的 RPA；
- 通用大模型聊天窗口；
- 大型低代码流程设计器；
- 先做 Marketplace 再找供给；
- 先做 Enterprise Console 再找企业客户；
- 为了技术完整而同时扩展 Desktop / Browser / Mobile / Protocol / Cloud 全栈。

## 五、0—3 个月：证明“有人会持续为结果付费”

时间：2026-09 → 2026-12。

### 核心问题

```text
谁真正有高频痛点？
哪个任务最适合 OpenDesk？
客户为什么不用现有 API / Browser / Power Automate / 人工？
客户愿意支付什么价格？
支持和维修成本能否接受？
```

### 产品重点

- 只围绕 2 类业务任务完善；
- 完成一个低摩擦安装/运行路径；
- 每个试点必须有真实业务后置条件；
- 建立 run evidence 与 failure taxonomy；
- 不扩大无关 API 面。

### 商业挑战目标

建议目标区间，不是完成即自动 PMF：

- 约 10 个 design partner；
- 5—10 个付费组织；
- 至少 1,000 次有业务结果记录的真实运行；
- 取得第一轮 30 天继续使用数据；
- 至少 2 个客户愿意增加第二个自动化流程。

### 失败信号

如果多个客户只愿意试用、不愿付费，或每个流程都完全不同无法复用，应立即重新选择任务/客户，不继续扩功能掩盖问题。

## 六、3—6 个月：证明“不是每个客户都重新开发一次”

时间：2026-12 → 2027-03。

### 核心目标

```text
参数化
+ Application Profile
+ Qualification
+ Diagnosis
+ Repair
```

让相似任务能够复用。

### 重点指标

- 新相似客户首次成功时间明显下降；
- 相同模板跨客户复用率；
- median repair time；
- 支持工时 / 客户 / 月；
- 30—90 天留存；
- 第二流程购买率。

### 商业挑战目标

- 15—40 个付费组织；
- 出现至少一个可标准报价的模板/方案；
- 有非项目作者能够独立完成部署和一线诊断；
- 支持成本开始随着复用提高而下降。

## 七、6—12 个月：形成明显差异化

时间：2027-03 → 2027-09。

### 产品差异化必须落到可测数据

目标不是“我们有 AI + RPA”，而是能够证明：

```text
首次自动化更快
长期运行更可靠
维修更便宜
业务结果更容易验证
跨应用组合更简单
```

### 技术竞争力挑战

以 2026-09 约 51/100 基线为参照，争取达到约 70—72 的可验证状态：

| 技术维度 | 当前 | 12 个月挑战 |
| --- | ---: | ---: |
| Desktop Coverage | 6.0 | 7.5 |
| Reliability | 3.0 | 7.0 |
| Perception | 5.0 | 7.0 |
| Runtime Efficiency | 8.0 | 8.5 |
| Cross-platform | 5.0 | 7.0 |
| Extensibility | 4.0 | 6.0 |

注意：不能直接修改分数。每次升分都要附实际证据。

### 商业挑战目标

- 50—150 个付费组织作为较好情境；
- 至少一个垂直方案有连续续费证据；
- 有客户/伙伴主动带来新客户；
- 产品和服务收入分开统计；
- 开始形成非创始人驱动的交付。

## 八、Reliability 升分的具体门槛

当前 Reliability 是最大短板，优先定义升分标准。

### 从 3 → 5

必须有：

- 多个真实应用 live benchmark；
- 不只看动作 PASS，而看业务结果；
- 至少 7 天持续运行；
- 失败按统一 taxonomy 分类；
- timeout / cancel / duplicate action 有明确验证。

### 从 5 → 7

必须有：

- 至少一个高频场景 30 天真实运行；
- 多机器 / 多分辨率 / 多版本 qualification；
- 软件版本变化后的 repair evidence；
- median diagnose / repair time；
- 非项目作者能够定位大多数常见失败。

### 从 7 → 9

必须有：

- 大量生产工作流和长期版本历史；
- Repair 能处理相当比例的定位和视觉漂移；
- 错误恢复不依赖创始人逐个分析；
- API / Locator / Runtime 兼容策略稳定；
- 第三方能够依赖 OpenDesk 构建自己的长期产品。

## 九、统一 Perception / Locator 的投资边界

目标不是再增加一个参数很多的万能 API。

普通作者只描述目标：

```js
const save = UI.within(win).locator({
  role: "button",
  name: "保存",
});
```

Runtime 内部负责：

```text
scope / window identity
→ Accessibility / UIA
→ OCR
→ Image
→ Application Profile
→ Geometry
→ VLM fallback（必要且允许时）
→ ambiguity / conflict handling
→ action safety
```

必须逐步建立 benchmark：

- AX/UIA only；
- OCR only；
- image only；
- unified；
- VLM fallback；
- false positive；
- ambiguity；
- latency；
- model cost。

如果某项新 Perception 能力不能提高这些指标，不优先增加。

## 十、Repair 的正式商业意义

Repair 不应只是开发工具。

它最终解决的是 SaaS / 自动化业务最昂贵的问题之一：

> 客户软件变化以后，谁来发现、定位、维修、验证并重新上线？

目标链：

```text
Failure
→ Classification
→ Existing Evidence
→ Needed Evidence
→ Repair Candidate
→ Retry failed step
→ Business Verification
→ Qualification
→ Explicit Promotion
```

必须统计：

- 自动恢复率；
- 辅助恢复率；
- 需要重新开发比例；
- 平均维修时间；
- 误修率；
- 修复后回归率；
- 每月每客户维修工时。

只有这些指标改善，Repair 才真正形成商业护城河。

## 十一、Application Compatibility Knowledge

未来 12 个月开始建立，但不要先做大型中央数据库。

每次真实业务任务逐步沉淀：

```text
Application
+ version
+ OS
+ window identity
+ semantic structure
+ locator evidence
+ relevant geometry
+ known failure patterns
+ successful repair patterns
+ qualification result
```

原则：

- 原始业务数据、截图、Secret 默认本地；
- 客户拥有自己的业务数据和工作流；
- 平台共享知识必须明确授权；
- 优先共享去标识的兼容性、定位模式、失败类别和维修规则。

## 十二、Developer Platform：什么时候继续扩大

未来 12 个月不以“完成桌面 Playwright”作为抽象工程项目。

只有真实场景重复出现后才推进：

```text
stable API
+ Locator
+ auto-wait/actionability
+ trace
+ inspector/debugger
+ test integration
+ CI
+ Node/Python client
+ compatibility policy
```

优先复用成熟 Browser / API 工具，不因为 OpenDesk 有 Runtime 就重造所有浏览器与协议能力。

## 十三、能力投资优先级

未来 12 个月默认优先级：

```text
P0
真实付费场景
可靠 Locator + Business Verification
最小 Agent/Human → Recipe 闭环

P1
Recorder 语义与参数化
Application Profile / Qualification
Repair
交付 / Packaging / Diagnostics

P2
Browser integration
Scheduler 产品闭环
Webhook / External integration 的场景化增强

P3
大型 Cloud
Team 全套协作
Marketplace
Enterprise Console
Mobile 整合
通用 AI Assistant
```

P3 不是永远不做，而是没有真实收入和重复需求时不应抢占 P0/P1 资源。

Measurement 和 Vision 继续作为 Authoring / Repair 基础能力投入，但不以自身功能数量作为成功目标。

## 十四、12 个月商业模型验证

第一阶段优先测试：

```text
Free / Developer Runtime
+
付费垂直自动化交付
+
持续维护 / Repair
```

后续再根据真实需求增加 Pro / Team / Enterprise。

### 经营指标

必须分开：

- 一次性实施收入；
- 月度 / 年度经常性收入；
- 模型和云成本；
- 每客户支持成本；
- 每客户维修工时；
- CAC；
- 毛利；
- 30 / 60 / 90 天留存；
- 第二流程购买。

禁止把高人工定制收入直接包装成高毛利 SaaS ARR。

## 十五、什么时候应该加大投入

建议看到以下组合后再明显扩大团队、广告、Cloud 或 Enterprise 建设：

- 10+ 真实付费组织持续运行；
- 大多数核心试点在 8—12 周后仍有规律使用；
- 相似客户开始复用已有自动化，而不是从零开发；
- 支持/维修成本可以由持续收入覆盖；
- 客户主动购买第二个流程；
- 出现自然转介绍或服务商合作需求。

任何单一指标都不够，例如：

```text
大量注册但无人运行
一次大单但无法复用
GitHub stars 增长但没有付费
Demo 很强但真实任务不稳定
```

都不能单独触发大规模投入。

## 十六、什么时候应该调整方向

| 信号 | 调整 |
| --- | --- |
| 客户主要愿付定制费，不愿订阅 | 接受服务产品化，不强行 SaaS 化 |
| 任务绝大多数是 Browser / API | Desktop 变成可选执行层，优先组合成熟 Browser/API 工具 |
| 开发者采用好、普通用户成功率低 | 聚焦 SDK / Framework / 服务商，而不是强推大众产品 |
| Windows 企业需求明显更强 | 商业 qualification 和交付资源向 Windows 倾斜 |
| Mac 更易传播但支付弱 | 用于 Developer/Product-led distribution，不作为唯一收入线 |
| Repair 长期依赖创始人 | 暂停扩张客户，优先解决诊断和可维护性 |

## 十七、什么时候停止某条路线

停止或冻结一条功能/场景路线的条件：

- 两轮明确报价和付费试验后仍无支付意愿；
- 自动化无法跨相似客户复用；
- 维修成本长期吞噬大部分收入；
- 某能力长期没有进入真实付费流程；
- 现有成熟工具/API 已经明显更适合，OpenDesk 只是重复实现；
- 为维持一项低价值功能需要持续破坏核心可靠性和交付效率。

停止某条路线不等于停止 OpenDesk，而是避免沉没成本继续扩大。

## 十八、12 个月结束时必须回答的五个问题

到 2027-09，必须能够用数据回答：

1. **谁在付费？为什么不用替代方案？**
2. **OpenDesk 支持范围内的业务成功率是多少？**
3. **同一类任务第二个客户要花多少时间，而不是第一个客户花多少时间？**
4. **软件变化以后平均多久能够恢复，谁能够完成维修？**
5. **客户是否持续使用、续费并增加第二个流程？**

如果五个问题仍然主要依赖主观解释，而不是实际运行和商业数据，则未来 12 个月的主要目标没有完成。

## 十九、与现有商业验证计划的关系

已有 [`business-validation-roadmap.md`](business-validation-roadmap.md) 继续负责客户、场景、报价和真实付费验证。

本文负责更高一层的 12 个月资源收口：

```text
全球竞争力研究
→ 决定长期值得争取的能力和位置

本 12 个月战略
→ 决定有限资源只投入哪些大方向

business-validation-roadmap
→ 进入真实客户、场景、报价、交付和验证
```

长期平台愿景继续由 [`../../research/commercialization/opendesk-global-executable-experience-network.md`](../../research/commercialization/opendesk-global-executable-experience-network.md) 保存；该愿景不能反向覆盖本计划的 PMF / Reliability / Revenue 验证优先级。
