# AI 业务执行与端到端 Agent 商业机会研究

更新时间：2026-08-31

> 文档性质：Research / 商业化决策输入。
>
> 本文研究的不是“AI 能不能控制鼠标键盘”，而是更高一层的问题：**当大模型具备推理能力，再配合 Browser Automation、API / MCP、Desktop Automation、OpenDesk、Memory、Verification 和人工审批后，是否能够从“给建议”升级为“跨多个软件完成一件真实业务事情”，并进一步形成可收费的业务结果。**
>
> 本文不把所有端到端 Agent 都视为 OpenDesk 应立即开发的产品。重点是识别：哪些业务闭环对跨软件执行有真实需求、哪些结果可以验证和收费、哪些环节应该由 API / Browser 完成、哪些环节才真正需要 OpenDesk。

## 1. 核心结论

1. **AI 的商业价值正在从“生成内容”向“完成动作”和“完成结果”迁移。** 单纯推理、写文档、生成代码已经能解决大量知识工作，但仍经常停在“告诉用户怎么做”。当 AI 可以通过 API、浏览器和桌面软件实际执行后，它才可能完成更完整的业务闭环。
2. **OpenDesk 更适合被定义为 Agent 的执行基础设施之一，而不是整个 Agent。** 最合理的组合是：LLM / Planner 负责目标理解和决策；API / MCP 处理结构化系统；Browser Automation 处理 Web；OpenDesk 处理没有完整 API、需要桌面 GUI、跨应用、Legacy 或最后一公里人工操作的部分。
3. **真正靠近收入的产品不是“Computer Use Runtime”，而是“Business Execution Agent”。** 用户更容易为“找到供应商”“完成客服问题”“处理异常订单”“找到客户并完成跟进”“完成招聘筛选”等结果付钱，而不是为 `mouse.click()` 或一个通用执行框架单独付高价。
4. **采购 / 外包 Sourcing Agent 是值得重点研究的新机会域。** 它可以从需求定义开始，搜索商品/服务/供应商，筛选候选，沟通询价，比较报价，进入人工审批，再完成下单、交付跟踪和验收。闲鱼、淘宝、1688、Upwork、Fiverr、行业网站、邮箱、微信、Excel、ERP 等都可能成为其中的执行节点。
5. **销售 Agent 是采购 Agent 的反向镜像。** 从寻找潜在客户、研究客户、个性化联系、多轮沟通、跟进、安排会议、报价、更新 CRM 到成交，商业价值更高，但也伴随更严格的平台规则、反垃圾信息、隐私和品牌风险。
6. **Computer Use 本身正在快速商品化。** OpenAI、Anthropic、Google、Microsoft 等都在强化计算机操作能力，因此 OpenDesk 长期不能只靠“让 AI 会点电脑”形成护城河。更可能留下来的资产是：App Profile、可靠 Workflow、业务后置验证、失败恢复、执行 Evidence、Business Memory、真实失败数据和垂直业务知识。
7. **商业研究应重点判断“流量 × 业务价值 × 跨软件执行必要性 × 可验证结果 × 付费预算”，而不是 GitHub Star 或底层框架调用量。**

## 2. 从“AI 回答”到“AI 完成事情”

过去常见的 AI 工作模式是：

```text
用户提出目标
→ AI 分析
→ AI 给建议
→ AI 写文档 / 邮件 / 代码
→ 用户自己打开软件
→ 用户自己搜索
→ 用户自己复制粘贴
→ 用户自己沟通
→ 用户自己提交 / 下单 / 跟进
```

这类 AI 的主要价值集中在：

- 阅读；
- 总结；
- 推理；
- 写作；
- 代码生成；
- 内容生成；
- 决策辅助。

但商业世界大量成本其实发生在后半段：

- 打开多个系统；
- 搜索对象；
- 搬运信息；
- 填写表单；
- 发送沟通；
- 等待回复；
- 根据回复继续动作；
- 提交业务操作；
- 验证结果；
- 记录进 CRM / ERP / 表格；
- 继续下一轮。

因此更完整的 Agent 结构应是：

```text
Goal
→ Understand
→ Research / Observe
→ Decide
→ Act
→ Verify
→ Remember
→ Continue / Recover
→ Business Outcome
```

其中 OpenDesk 主要参与 `Act / Verify / Recover / Evidence`，而不是替代整个 Agent。

## 3. 端到端 Agent 的执行栈

建议将未来业务 Agent 拆成 7 层，而不是把所有能力都塞进 OpenDesk Runtime。

### 3.1 Goal / Planner

负责：

- 理解用户目标；
- 澄清约束；
- 拆任务；
- 决定下一步；
- 判断是否需要人工确认。

主要由 LLM / Agent Framework 完成。

### 3.2 Search / Research

负责：

- 搜索网页；
- 查询数据库；
- 查商品 / 店铺 / 公司 / 人；
- 收集候选；
- 对候选打分。

优先使用 Search API、网站 API、Browser Automation 和合法数据源。

### 3.3 Structured Action

负责：

- Email API；
- CRM API；
- ERP API；
- Calendar；
- Payments；
- 数据库；
- MCP Tool；
- 官方开放平台。

只要官方接口稳定可用，应优先使用结构化通道。

### 3.4 Browser Action

负责：

- Web 表单；
- 商家后台；
- SaaS；
- 没有完整 API 的 Web 工作流。

优先 Playwright / DOM / Accessibility，而不是截图点击。

### 3.5 Desktop / Cross-App Action

这是 OpenDesk 最相关的区域：

- 千牛等桌面客户端；
- Windows Legacy 软件；
- ERP 客户端；
- 桌面客服系统；
- 物流客户端；
- Excel / WPS；
- 跨多个本地软件的信息搬运；
- 只能通过 GUI 完成的最后一公里操作。

### 3.6 Verification / Recovery

必须回答：

- 动作是否真的成功？
- 业务状态是否变化？
- 是否发生弹窗 / 超时 / 权限问题？
- 是否需要换一条 Route？
- 是否应该停止并交给人？

这一层决定 Agent 是 Demo 还是生产系统。

### 3.7 Business Memory

记录：

- 客户；
- 供应商；
- 报价；
- 历史沟通；
- 成交记录；
- 成功 Workflow；
- App Profile；
- 失败原因；
- 用户偏好；
- 后续待办。

没有 Memory，就很难形成真正长期运行的业务 Agent。

## 4. 采购 / 外包 Sourcing Agent

这是当前值得重点研究的非纯电商机会。

### 4.1 用户目标示例

- 帮我找 10 个靠谱 UI 设计师；
- 帮我找可以批量剪短视频的外包团队；
- 帮我找 3 个能做 3D 建模的供应商；
- 帮我找一个长期淘宝美工；
- 帮我找价格合适的印刷厂；
- 帮我找小批量 OEM 供应商；
- 帮我找程序修复 / 数据录入 / 翻译 / 摄影等服务；
- 帮我在闲鱼、淘宝、1688、外包平台和行业网站同时寻找候选。

### 4.2 标准闭环

```text
需求 / Goal
→ 形成 Requirement Spec
→ 定义预算、交期、验收标准
→ 搜索多个平台
→ 收集候选商家 / 服务商
→ 读取商品、服务、评价、案例
→ 初筛
→ 联系候选
→ 个性化询价
→ 多轮追问
→ 收集报价和交付条件
→ 比较候选
→ 风险检查
→ 推荐 Top 3
→ 人工批准
→ 下单 / 签约 / 支付
→ 跟踪交付
→ 验收
→ 保存 Supplier Memory
```

### 4.3 为什么商业价值高

传统采购 / 外包寻找的成本不只是“搜索时间”，还包括：

- 重复描述需求；
- 等待回复；
- 反复追问；
- 记录报价；
- 比较条件；
- 判断是否靠谱；
- 催交付；
- 后续复用供应商信息。

如果 Agent 能把 30 个候选压缩为 3 个可决策候选，并保留完整沟通和证据，用户容易感知 ROI。

### 4.4 闲鱼类场景的定位

闲鱼等平台可以作为候选来源之一，但不应把产品定义成“批量私信机器人”。

合理方向：

```text
搜索候选
→ 分析候选
→ 生成个性化沟通
→ 在平台允许范围内发送
→ 控制频率
→ 跟踪回复
→ 汇总比较
→ 高风险 / 交易操作人工批准
```

不合理方向：

- 大规模无差别群发；
- 绕过平台风控；
- 自动化垃圾信息；
- 自动支付高金额交易而无审批；
- 违反平台许可协议的外挂式操作。

因此商业产品更适合叫：

- AI Sourcing Assistant；
- AI Procurement Agent；
- 外包采购 Agent；
- 供应商发现与询价 Agent。

而不是“闲鱼群发工具”。

## 5. 销售 Agent：采购 Agent 的反向闭环

采购 Agent 是：

```text
我想买
→ 找卖家
→ 研究
→ 沟通
→ 成交
```

销售 Agent 是：

```text
我想卖
→ 找潜在客户
→ 研究客户
→ 判断需求
→ 个性化联系
→ 多轮沟通
→ 跟进
→ 预约会议
→ 报价
→ 更新 CRM
→ 成交
```

### 5.1 可自动化环节

- 线索发现；
- 公司 / 联系人研究；
- ICP 匹配；
- 个性化邮件草稿；
- 合规邮件发送；
- 回复分类；
- CRM 更新；
- Meeting scheduling；
- Follow-up；
- 报价材料准备；
- 销售漏斗状态更新。

### 5.2 OpenDesk 的价值

如果所有系统都有 API，OpenDesk 价值有限。

OpenDesk 更适用于：

- 国内 IM / 客户端；
- Legacy CRM；
- 内部工具；
- Excel / WPS；
- 跨多个无统一 API 的系统；
- 人工必须操作的后台。

### 5.3 主要风险

- Spam / 反垃圾规则；
- 平台禁止自动化；
- 品牌声誉；
- 联系人隐私；
- 错误承诺；
- 自动报价 / 合同风险。

因此真正可用的 Sales Agent 必须有：

- Contact policy；
- Rate limit；
- 个性化要求；
- Human approval；
- Audit log；
- Stop condition。

## 6. 电商运营 Agent

电商仍然是 OpenDesk 当前最高优先级商业研究域，但应从“自动点千牛”升级为完整业务 Agent 思考。

示例：

```text
发现异常订单
→ AI 判断异常类型
→ 打开 ERP
→ 查询库存
→ 打开物流系统
→ 查询物流
→ 回到千牛
→ 打开客户会话
→ 生成解释 / 处理方案
→ 用户确认关键动作
→ 执行
→ 验证订单 / 售后状态
→ 写入 Evidence
```

或者：

```text
竞品价格 / 内容变化
→ Trigger
→ AI 分析影响
→ 生成运营建议
→ 打开商家后台
→ 执行低风险调整
→ 验证生效
→ 记录结果
```

这里 OpenDesk 的角色是执行和验证，而不是自己复制 Helium 10、飞瓜、ERP 等完整数据产品。

## 7. 客服 Agent

客服是最接近结果计费的机会之一。

完整闭环：

```text
客户消息
→ 判断意图
→ 查询订单
→ 查询物流 / 商品 / 售后
→ 生成方案
→ 执行低风险动作
→ 回复
→ 验证状态
→ 关闭 Ticket / 会话
→ 记录结果
```

可探索的商业模式：

- 按 Seat；
- 按会话量；
- 按成功解决问题数；
- 按节省人工工时；
- 按店铺 / 账号；
- 基础订阅 + AI usage。

客服是 OpenDesk 值得优先验证的原因：

- 高频；
- 明确人工成本；
- 需要跨系统查询；
- 结果相对容易验证；
- 用户已经习惯为客服软件和自动化付费。

## 8. 招聘 / 人才 Agent

标准闭环：

```text
定义岗位
→ 搜索候选
→ 读取资料
→ 初筛
→ 联系候选
→ 回答基础问题
→ 安排面试
→ 更新 ATS / 表格
→ 跟进
→ Offer 流程
```

OpenDesk 相关部分主要是：

- 招聘网站 GUI；
- 国内招聘客户端 / IM；
- Excel；
- ATS Legacy 系统；
- 多平台数据同步。

高风险动作如拒绝、Offer、薪资承诺应保留人工审批。

## 9. 内容 / 推广 Agent

完整闭环：

```text
研究热点 / 竞品
→ 选题
→ 生成内容
→ 多平台发布
→ 监控评论 / 私信
→ 回复
→ 收集线索
→ 写入 CRM
→ 分析效果
→ 下一轮选题
```

相比单纯“批量发布”，真正更高价值的是：

```text
内容
→ 流量
→ 对话
→ 线索
→ 成交
```

但这类 Agent 同样要严格区分：

- 合法内容运营；
- 正常客户沟通；
- 垃圾信息 / 刷量 / 批量骚扰。

## 10. 财务 / Back-office Agent

典型任务：

- 发票下载；
- 对账；
- 数据录入；
- 报销；
- 银行 / ERP / Excel 数据核对；
- 异常单据处理；
- 周期性报告。

这一领域特点：

- 高频；
- ROI 清晰；
- Legacy 系统多；
- 跨应用操作多；
- 但资金相关动作风险高。

因此非常适合：

```text
自动准备
→ 自动核对
→ 自动填写
→ 人工审批
→ 自动提交
→ 自动验证
```

而不是完全无人监管。

## 11. 供应链 / 物流 Agent

典型闭环：

```text
需求 / 订单变化
→ 查询库存
→ 查询供应商
→ 询价
→ 采购建议
→ 生成采购单
→ 人工批准
→ 下单
→ 跟踪物流
→ 异常处理
→ 入库确认
```

这里可能同时涉及：

- ERP；
- 供应商门户；
- 物流系统；
- 邮箱；
- Excel；
- IM；
- 浏览器后台；
- Desktop 客户端。

是典型 Cross-App Agent 场景。

## 12. 研究 Agent / 事务 Agent

还有一类用户愿意付费的机会不是直接交易，而是“替我把复杂事务做完”。

例如：

- 找 20 家符合条件的供应商并询价；
- 找 10 个适合合作的达人并整理联系方式；
- 查询多个网站价格并持续更新；
- 帮我把 100 个客户资料补完整；
- 帮我收集行业展会参展商并分类；
- 帮我准备一批候选合作方。

这类产品很适合从半自动开始：

```text
AI 自动研究 + 自动执行
→ 中间检查点
→ 人工决策
→ AI 继续
```

## 13. “交易型 Agent”为什么值得单独定义

本文将以下闭环定义为 Transactional / Business Execution Agent：

```text
发现对象
→ 判断
→ 联系
→ 沟通
→ 谈条件
→ 比较
→ 决策
→ 交易 / 提交
→ 跟进
→ 验收
```

它与普通 Chatbot 的核心区别：

| 类型 | 输出 | 是否真正执行 | 是否产生业务状态变化 |
|---|---|---:|---:|
| Chatbot | 文本回答 | 否 | 否 |
| Copilot | 建议 / 草稿 | 部分 | 部分 |
| RPA | 固定流程动作 | 是 | 是 |
| Computer Use Agent | 通用 GUI 动作 | 是 | 是 |
| Business Execution Agent | 完整业务 Outcome | 是 | **是，并验证** |

OpenDesk 真正的商业机会更可能位于最后两层之间：

> 用可靠自动化能力，把通用 Agent 推到真实业务 Outcome。

## 14. OpenDesk 在整个系统中的正确位置

不建议：

```text
OpenDesk
= LLM + Browser + Search + CRM + Email + Desktop + Payment + Memory + 全部业务知识
```

建议：

```text
                 Business Goal
                       ↓
                LLM / Agent
                       ↓
              Workflow / Policy
                       ↓
      ┌────────────────┼────────────────┐
      ↓                ↓                ↓
 API / MCP         Browser         Desktop / GUI
      ↓                ↓                ↓
Structured Tool     Playwright        OpenDesk
      └────────────────┼────────────────┘
                       ↓
                Verification
                       ↓
               Evidence / Memory
                       ↓
               Business Outcome
```

OpenDesk 应重点做好：

- Desktop Observe；
- Semantic Locate；
- Act；
- Wait；
- Verify；
- Recover；
- Evidence；
- App Profile；
- Script / Workflow；
- Recorder / Creator；
- Agent-facing API / MCP。

其他已有成熟能力优先集成，而不是重建。

## 15. 哪些地方最可能形成护城河

### 15.1 不太可能成为长期护城河

- mouse click；
- keyboard；
- screenshot；
- OCR；
- 通用 MCP；
- 通用 Computer Use；
- Browser Automation；
- 单纯 LLM Planner。

这些能力正在快速基础设施化。

### 15.2 更有机会形成长期资产

- 特定应用 App Profile；
- 可靠 Locator 组合；
- Workflow Recipe；
- Business Verification；
- Failure / Recovery Policy；
- 真实执行轨迹；
- 不同 App 版本兼容经验；
- 业务对象 Memory；
- 供应商 / 客户 / 店铺历史；
- 垂直行业 Benchmark；
- 经过验证的 Automation Package；
- Creator / Marketplace 生态。

更长期的价值链可能是：

```text
更多用户执行
→ 更多失败数据
→ 更好的 App Profile / Recovery
→ 更高成功率
→ 更多可收费 Workflow
→ 更多 Creator
→ 更多业务资产
```

## 16. 商业模式候选

### M1：垂直 Agent SaaS

例如：

- 千牛客服 Agent；
- 外包采购 Agent；
- 异常订单 Agent；
- 供应商询价 Agent。

收费：月订阅 / 店铺 / Seat。

**当前优先级：最高。**

### M2：按成功结果收费

例如：

- 成功解决一笔售后；
- 成功完成一个采购询价；
- 成功补全一个业务记录；
- 成功处理一个异常订单。

前提：结果可验证。

**潜力：很高。**

### M3：Automation Package

用户购买：

- 千牛某 Workflow；
- 某 ERP 自动化；
- 某采购流程；
- 某客服流程。

可以一次性或订阅。

### M4：Creator / Recorder Pro

卖给开发者 / 高级用户：

- Record；
- AI Optimize；
- Debug；
- Verify；
- Package；
- Publish。

### M5：Marketplace 抽成

第三方作者生产 Automation Package，OpenDesk 提供：

- Runtime；
- Distribution；
- Billing；
- Verification；
- Compatibility；
- Rating；
- Update。

Marketplace 是后期结果，不是当前先决条件。

### M6：定制实施 / Managed Automation

早期非常重要：

- 直接为客户实现 Workflow；
- 收实施费；
- 同时积累 App Profile 和真实问题。

这可能比早期 SaaS 更快产生第一笔现金流。

## 17. 怎样判断“流量和商业变现可能性”

不建议用 GitHub Star、框架下载量作为主要商业指标。

应该建立 Agent 商业机会评分。

| 维度 | 权重 | 说明 |
|---|---:|---|
| 任务发生频率 | 10 | 每天 / 每周是否重复发生 |
| 当前人工耗时 | 10 | 是否明显占用人工 |
| 业务经济价值 | 15 | 是否直接关联收入、成本、错误、交付 |
| 已有付费预算 | 15 | 用户现在是否已经为类似问题花钱 |
| AI 可完成比例 | 10 | 是否能从建议升级为执行 |
| 跨软件执行必要性 | 10 | 是否天然需要 Browser / Desktop / API 混合 |
| API 替代程度 | 5 | 官方 API 是否已经完全解决 |
| OpenDesk 结构性优势 | 10 | 是否特别需要 Desktop / Cross-App / Verify |
| 结果可验证性 | 5 | 是否能客观判断成功 |
| 获客难度 | 5 | 是否容易找到目标用户 |
| 平台 / 合规风险 | 5 | 是否受平台自动化、Spam、隐私限制 |
| 合计 | 100 | |

建议：

- ≥ 80：P0 强商业验证候选；
- 70–79：P1 值得小规模试验；
- 60–69：P2 继续研究；
- < 60：暂不投入开发。

## 18. “流量”应该怎么判断

商业机会里的流量不能只理解成搜索量。

建议分成 5 层：

### T1：问题流量

有多少人在持续遇到这个问题？

证据：

- 搜索关键词；
- 社区提问；
- 电商卖家群；
- Reddit；
- 工单；
- 招聘 / 外包需求；
- 软件评价。

### T2：交易流量

这个问题背后有多少真实交易？

例如：

- 每天订单数；
- 客服会话数；
- 外包需求数；
- 采购询价量；
- 招聘职位量。

### T3：付费流量

用户是否已经为类似解决方案付钱？

证据：

- SaaS 价格；
- Marketplace 销量；
- 付费插件；
- Freelancer / Upwork 报价；
- 企业 RPA 项目；
- 外包服务价格。

### T4：自动化缺口

当前钱已经存在，但多少步骤仍然需要人工？

这是 OpenDesk 最应该寻找的空间。

### T5：可触达流量

OpenDesk 自己能否低成本获得这些用户？

例如：

- 淘宝 / 千牛卖家社区；
- Shopify App Store；
- GitHub / 开发者社区；
- 电商服务商；
- 外包平台；
- SEO；
- Creator Marketplace。

市场很大但用户完全触达不到，对早期项目价值有限。

## 19. 第一批值得验证的端到端 Agent 候选

### S 级

1. 电商客服 + 订单上下文 Agent；
2. 电商异常订单 / 售后处理 Agent；
3. 外包 / 供应商发现与询价 Agent；
4. 跨 ERP / 商家后台 / 物流的数据回填 Agent。

### A 级

5. B2B 销售 Prospecting / Follow-up Agent；
6. 内容运营 → 线索回收 Agent；
7. 招聘搜索 / 初筛 / 沟通 Agent；
8. 财务对账 / 单据处理 Agent；
9. 供应链询价 / 跟单 Agent。

### B 级

10. 通用电脑 Agent；
11. 通用 RPA Platform；
12. 通用 Recorder 商业产品。

B 级不是技术价值低，而是早期较难直接证明业务付费。

## 20. 第一阶段验证方式

对任何候选 Agent，不先建设完整平台。

采用：

```text
真实用户问题
→ 人工梳理 Workflow
→ 用现有 API / Browser / OpenDesk 拼出最小闭环
→ 保留高风险人工审批
→ 跑真实任务
→ 记录成功率和人工节省
→ 尝试收费
→ 再抽象公共能力
```

至少记录：

- Task completion rate；
- False-success rate；
- Human intervention rate；
- Avg task time；
- Manual time saved；
- Cost per completed task；
- Failure / recovery rate；
- 用户愿意支付价格；
- 复购 / 持续使用；
- 平台风控 / 封号风险。

## 21. 高风险动作与人工审批边界

端到端业务 Agent 越靠近交易，就越必须增加安全边界。

默认人工审批：

- 付款；
- 下单；
- 合同；
- 高金额报价；
- 退款；
- 删除；
- 大规模消息发送；
- 对外法律承诺；
- Offer / 薪资；
- 高风险账号操作。

可自动执行：

- 信息收集；
- 候选筛选；
- 草稿；
- 数据回填；
- 低风险查询；
- 在明确 guardrail 内的小额 / 可撤销动作。

产品设计原则：

> Agent 应尽量自动完成低风险、高频、可验证步骤；在不可逆、高金额、品牌 / 法律风险节点插入人工确认。

## 22. 平台与合规边界

商业机会不能以绕过平台规则为前提。

需要逐个平台验证：

- 是否允许自动化；
- 是否有官方 API；
- 是否允许第三方客户端；
- 是否限制批量消息；
- 是否有频率限制；
- 是否涉及个人信息；
- 是否允许抓取；
- 是否允许自动交易。

因此“闲鱼批量找人”这类想法应研究成：

> 合规的 AI Sourcing / Procurement Workflow

而不是：

> 批量私信 / 风控绕过工具。

## 23. 与现有 OpenDesk 商业 Research 的关系

本文处于已有研究的更上层：

```text
《自动化软件竞品与商业模式研究》
→ 底层 Runtime / Recorder / RPA 怎么赚钱？

《电商软件市场自动化与商业机会研究》
→ 电商用户愿意为什么业务结果付钱？

《电商软件与 OpenDesk 相关性分层》
→ 哪些对象离 OpenDesk 最近？

《AI 业务执行与端到端 Agent 商业机会研究》
→ OpenDesk 如何与 LLM / Browser / API 组合，真正完成一个业务 Outcome？
```

本文不替代以上文件，而是增加“业务闭环”维度。

## 24. 后续重点研究问题池

### 市场

1. 哪些业务 Agent 已经产生真实 ARR / 付费用户？
2. 哪些市场采用按结果收费？
3. 用户更愿意买 Copilot、Agent 还是 Managed Service？
4. 小企业 / OPC 最愿意把哪些工作直接交给 Agent？

### 采购 / 外包

5. 国内是否已有 AI 采购 / 供应商发现产品？
6. Upwork、Fiverr、1688、闲鱼等平台允许多大程度的自动化？
7. 找供应商的最大人工成本到底在哪一步？
8. 有没有用户愿意按“有效候选 / 成功询价 / 成交”付费？

### 销售

9. 当前 Sales Agent 的真实自动化比例有多高？
10. 哪些系统 API 已经覆盖完整？
11. 国内微信 / 企业微信 / CRM 桌面场景是否仍有明显执行缺口？

### 电商

12. 千牛 / 飞鸽 / ERP / 商家后台有哪些高频跨应用 Workflow？
13. 哪些已有 SaaS 仍需要人手工完成最后一公里？
14. 哪些任务可以定义业务成功状态？

### 技术

15. API / Browser / Desktop 路由如何统一？
16. OpenDesk 是否应成为“Universal Fallback”而非所有动作首选？
17. Recorder 如何从人类演示生成可验证 Workflow？
18. Business Verification 如何标准化？
19. Agent Memory 与 Script Asset 如何连接？
20. Marketplace 是否应该出售“业务 Workflow”而不是“脚本文件”？

## 25. 当前战略假设

当前最值得验证的战略不是：

> 把 OpenDesk 做成世界上最完整的桌面自动化 Framework。

而是：

> **把 OpenDesk 做成 AI Agent 跨软件执行的重要基础设施，并通过少数高价值垂直 Business Agent 验证其商业价值。**

当前推荐推进链：

```text
底层 Runtime 能运行
→ Browser / API / Desktop 混合路由
→ 选择 1 个真实业务 Agent
→ 只打通 1 条端到端 Workflow
→ Verify + Evidence
→ 真实用户使用
→ 收费
→ 抽象 App Profile / Recipe
→ Recorder 提高生产效率
→ 增加第二个 Workflow
→ 再判断 Creator / Marketplace / Platform
```

最终要验证的不是：

> AI 能不能控制电脑？

而是：

> **AI 是否能比人工更低成本、更可靠地完成一件真实业务事情，并且用户愿意为这个结果持续付钱？**

## 26. 参考与后续核验入口

以下为截至 2026-08-31 前相关研究中使用或待继续核验的官方入口；具体价格、功能和平台规则后续研究必须按日期重新确认：

- Microsoft Copilot Studio Computer Use：`https://learn.microsoft.com/en-us/microsoft-copilot-studio/computer-use`
- Anthropic Computer Use：`https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool`
- OpenAI / ChatGPT Commerce 相关官方发布：`https://openai.com/`
- Google Shopping / Agentic Commerce 相关官方发布：`https://blog.google/products/shopping/`
- HubSpot Sales / Prospecting Agent：`https://www.hubspot.com/products/sales`
- Gorgias AI Agent / Pricing：`https://www.gorgias.com/pricing`
- Shopify Flow：`https://help.shopify.com/en/manual/shopify-flow`
- UiPath Marketplace：`https://docs.uipath.com/marketplace/`

> 说明：本文中的产品趋势用于商业机会判断，不代表 OpenDesk 当前已具备对应功能。后续任何正式产品决策应重新核验最新官方价格、能力、协议和平台政策。