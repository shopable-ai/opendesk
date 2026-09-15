# OpenDesk Agent-driven RPA 内容增长策略

更新时间：2026-09-16

> 文档性质：Plan / Content & Acquisition。
>
> 本文只决定：面向谁、围绕什么认知、先写什么、需要什么证据、统一导向什么产品入口。它不是关键词搜索量报告，不是市场排名证明，也不是 Blog 正文。
>
> 产品定位计划：[`Agent-driven RPA 定位与领先证明计划`](agent-driven-rpa-positioning.md)。
>
> 支撑研究：[`关键词、竞品内容与 Blog 选题池`](../../research/commercialization/agent-driven-rpa-content-keywords.md)。

## 1. 内容目标不是“发文章”，而是建立一个可验证类别

所有内容围绕一条主线：

> **Computer Use 解决“Agent 能操作电脑”；OpenDesk 要继续解决“一次成功怎样变成可验证、可复用、可维护、可商业交付的 RPA”。**

前期内容必须同时服务三个结果：

```text
定义产品类别
→ Agent-driven RPA / Computer Use → Reusable RPA

建立技术可信度
→ Recorder / Verification / Replay / Repair / Delivery Benchmark

获得真实用户
→ Codex / Claude 开发者 + 自动化交付者 + 具体业务 Workflow 买方
```

不为流量建立第二套产品故事。

## 2. 三类核心受众

### A. 全球 Coding Agent / Desktop Automation 开发者

典型入口：

- Codex；
- Claude Code；
- MCP；
- Cua；
- Peekaboo；
- GitHub / CLI / RPA-as-code 搜索。

他们首先关心：

```text
Agent 怎样操作真实桌面？
怎样减少每次重新截图 / 推理？
怎样把一次探索保存成 Workflow？
怎样验证结果？
怎样调试失败？
```

主要 CTA：

> **Try OpenDesk with one real desktop task.**

### B. 自动化顾问 / 独立交付者 / 实施商

他们首先关心：

```text
怎样更快做出一个客户流程？
怎样交付？
怎样配置输入？
怎样保护 / 授权资产？
客户机器坏了怎样拿证据回来？
维修费怎样收？
```

主要 CTA：

> **Bring one client workflow for qualification.**

### C. 中国业务自动化买方

典型入口：影刀 / 实在智能 / Quicker / 按键精灵 / ERP / 客服 / 电商自动化相关内容。

他们首先关心的是业务结果和实施成本，不是 Runtime 架构。

主要 CTA：

> **提交一条真实重复工作，评估是否值得自动化。**

## 3. 内容支柱

### P0｜类别定义

目标：让用户理解 OpenDesk 不只是 Computer Use Driver，也不是传统坐标宏。

核心主题：

- Computer Use ≠ RPA；
- Agent-driven RPA vs traditional RPA；
- Agent exploration → reusable automation；
- deterministic replay after intelligent exploration。

### P0｜竞品边界

目标：承接已有产品搜索，而不是贬低竞品。

首批对象：

- Cua；
- Peekaboo；
- OpenAdapt；
- Agent Desktop Harness；
- Codex Computer Use / Record & Replay；
- Claude Computer Use；
- UiPath Delegate；
- Power Automate Computer Use。

固定规则：

```text
先说明对手真正强在哪里
→ 固定版本和比较范围
→ 比较完整工作流而不是 API 数量
→ 说明谁适合谁
→ 有 Benchmark 才写结果
```

### P0｜Recorder / Authoring

目标：把 OpenDesk 的 Human-first UI 和 Agent-first authoring 合成一条产品故事。

核心主题：

- trajectory vs workflow；
- coordinate recorder vs semantic recorder；
- human demonstration vs agent exploration；
- recording → readable recipe；
- recorder 应保存什么 evidence。

### P0｜Verification / Benchmark

目标：把“可靠”变成可测的内容资产。

核心主题：

- false success；
- business postcondition；
- first-run vs replay；
- repair benchmark；
- fair comparison methodology。

### P1｜Commercial Delivery

目标：解释为什么一个 workflow 能运行不等于已经可以卖给客户。

核心主题：

- packaging；
- licensing；
- installation；
- configuration；
- evidence export；
- maintenance economics。

### P2｜行业案例

目标：证明底座创造现金流，不改变总定位。

优先：

- 电商异常订单；
- 客服跨系统后台处理；
- 内容模板交付；
- Excel / ERP / 财务重复工作。

## 4. 第一阶段只发 6 篇

不要同时写 30—60 篇。第一阶段只验证六个认知假设。

| 顺序 | 文章 | 需要建立的认知 | 发布门槛 |
| ---: | --- | --- | --- |
| 1 | **Computer Use Is Not RPA: What Happens After an Agent Succeeds Once?** | 定义类别差异 | 可引用当前产品边界，不需要排名 |
| 2 | **Agent-driven RPA vs Traditional RPA: What Actually Changes?** | 解释 Agent 与确定性复跑的分工 | 不把现代 RPA描述成“没有 AI” |
| 3 | **Cua vs Peekaboo vs OpenDesk: Driver, Agent, Recorder, and Reusable RPA** | 建立竞争地图 | 固定三方版本并逐项核验；没有 Benchmark 不给总排名 |
| 4 | **A Good Desktop Recorder Should Capture Meaning, Not Just Coordinates** | 放大 Human-first Recorder 价值 | OpenDesk Recorder 现有能力与限制必须来自当前代码 / 文档 |
| 5 | **First-run vs Replay: The Benchmark Computer-use Agents Actually Need** | 建立自己的评测方法 | 至少提供可执行 Benchmark 设计；最好附第一组数据 |
| 6 | **Codex Can Use a Computer. When Do You Still Need RPA?** | 承接 Coding Agent 流量 | 必须承认 Codex 自身 Computer Use 能力；强调 reuse / verification 增量 |

只有前六篇至少出现真实阅读、搜索、GitHub 访问、试用或咨询信号以后，再扩大下一批。

## 5. 第二阶段候选

优先顺序：

1. Claude Code Computer Use vs Reusable Desktop Automation；
2. Cua Driver Recording vs an RPA Recorder；
3. Peekaboo vs OpenDesk；
4. OpenAdapt vs OpenDesk；
5. Agent Desktop Harness vs OpenDesk；
6. A Green “Done” Message Is Not a Business Result；
7. How to Turn an Agent-built Desktop Workflow into Something a Client Can Actually Use；
8. 中文：Cua、Peekaboo、OpenDesk 到底分别在解决什么问题？；
9. 中文：有 Recorder 就是 RPA 吗？；
10. 中文：电商异常订单为什么适合做 Agent RPA 的商业测试？。

完整关键词和候选标题池继续保存在 Research，不在本 Plan 重复维护。

## 6. 每篇文章先做证据卡，再写正文

固定内部证据卡：

```text
文章 ID / 工作标题
主关键词
目标受众
用户搜索意图
要改变的认知
比较范围
竞品版本 / 日期
OpenDesk 基准 SHA
任务 / 环境 / 模型 / 预算
事实来源
当前能够证明什么
当前不能证明什么
需要补的实拍 / Benchmark
主要 CTA
停止发布条件
```

没有完成证据卡，不进入 `blogs/drafts/`。

## 7. 竞品文章的发布边界

禁止：

- 把“没搜到”写成“对方没有”；
- 把 GitHub Star 当可靠性；
- 把功能清单评分写成全球排名；
- 用 OpenDesk 固定 Recipe 对比对方首次探索；
- 只展示成功样例；
- 把 macOS 结果外推 Windows；
- 因语言、框架或商业模式不同而排除完整替代方案。

必须：

- 固定版本与访问日期；
- 区分当前公开能力和历史能力；
- 给最强对手充分配置；
- 报告对手更强的维度；
- 任务成功使用业务后置条件，不用“Done”文字代替；
- 无法公平测试时写“未测”，不判输。

## 8. Blog 不承担工程 Source of Truth

仓库不存在也不应新建：

```text
docs/blogs/
```

职责是：

```text
docs/research/
= 事实、市场、竞品、关键词和候选证据

docs/plans/commercialization/
= 产品定位、验证、内容和商业行动计划

docs/project/
= 已冻结且仍然有效的高层项目共识

blogs/drafts/
= 可对外阅读但尚未发布的正文

blogs/published/
= 确实已经发布、且仓库需要保留的最终内容
```

Blog 可以引用 Research / Plan / Benchmark，但不能反过来成为产品能力事实源。

## 9. 英文与中文不是同一套文章翻译

### 英文

主要争：

- Agent-driven RPA 类别；
- Computer Use / Coding Agent / MCP 流量；
- Cua / Peekaboo / OpenAdapt / ADH 等直接竞品搜索；
- RPA-as-code / verification / delivery developer mindshare。

### 中文

主要争：

- Agent RPA 与传统 RPA 的区别；
- 影刀 / 实在智能 / Quicker / 按键精灵等既有用户心智；
- 具体业务自动化和实施客户；
- Recorder UI 与普通用户体验。

中文版根据中国竞争集合和案例重新写，不把英文排名机械翻译过来。

## 10. 统一 CTA

前期只保留两条转化路径：

```text
Developer content
→ Try OpenDesk with Codex / Claude
→ Complete one real desktop task
→ Turn it into / run a reusable workflow

Business content
→ Bring one repetitive desktop workflow
→ Qualification
→ Paid implementation
```

不要让 Recorder、MCP、CLI、Benchmark、电商各自导向不同产品。

## 11. 内容是否有效，看下游行为，不看文章数量

优先记录：

- Search impressions / click-through（有可靠数据源后）；
- GitHub / release / docs 访问；
- 安装 / 首次成功任务；
- 提交真实 Workflow；
- qualification 请求；
- 付费评估 / 实施；
- 文章带来的具体客户来源。

没有这些数据时，不用“写了多少篇”作为成功指标。
