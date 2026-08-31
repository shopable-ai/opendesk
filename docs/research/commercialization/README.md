# Clawdesk 商业化研究

更新时间：2026-08-31

本目录保存 Clawdesk 的**市场、竞品、收费方式、行业机会和商业模式研究**。

它属于 `docs/research/`，是产品与商业决策的输入，不是当前产品能力、架构事实或正式路线图。

## 当前研究文件

1. [`自动化软件竞品与商业模式研究.md`](自动化软件竞品与商业模式研究.md)
   - 研究 AutoHotkey、PyAutoGUI、RobotGo、pywinauto、Windows API 等底层能力为什么通常免费；
   - 研究 nut.js、Macro Recorder、Ui.Vision、Power Automate、UiPath 等如何向上层收费；
   - 归纳 Open Source、Recorder、Bot、Enterprise、Marketplace、Services、Vertical SaaS、Outcome-based 等商业模式。

2. [`电商软件市场自动化与商业机会研究.md`](电商软件市场自动化与商业机会研究.md)
   - 当前最高优先级商业研究；
   - 同时覆盖中国、跨境和海外电商；
   - 研究选品、竞品、流量、内容、广告、客服、订单、发货、售后、库存、财务等真实付费问题；
   - 该文件是**宽市场样本池**，其中的软件与 Clawdesk 的直接相关程度并不相同，必须结合下一份“相关性分层”阅读。

3. [`电商软件与Clawdesk相关性分层.md`](电商软件与Clawdesk相关性分层.md)
   - 给所有电商研究对象增加 `C0—C4` Clawdesk 关联等级；
   - 同时增加 `B0—B3` 商业模式参考等级，避免把“很赚钱但离 Clawdesk 很远”的 SaaS误判为直接竞品或开发方向；
   - C1 的商家工作台、Desktop/Web 后台、ERP、客服/订单等实际人工操作，是当前最值得验证的电商商业化场景；
   - C3/C4 的数据、营销和远端 SaaS 主要作为 Trigger、数据源或商业模式参考，不应自动进入 Clawdesk 开发范围。

4. [`AI业务执行与端到端Agent商业机会研究.md`](AI业务执行与端到端Agent商业机会研究.md)
   - 研究 AI 如何从“回答 / 写文件”升级为“跨 API、浏览器、桌面软件完成真实业务 Outcome”；
   - 将 Clawdesk 定位为 Business Agent 的 Desktop / Cross-App Execution Infrastructure，而不是整个 Agent；
   - 重点研究外包采购 / Sourcing、销售、电商运营、客服、招聘、内容、财务、供应链等端到端 Agent；
   - 建立“流量 × 业务价值 × 付费预算 × 跨软件必要性 × 可验证结果 × 合规风险”的商业机会评分；
   - 强调交易、高金额、批量消息等风险动作需要人工审批和平台规则约束。

5. [`自动化商业化领域地图.md`](自动化商业化领域地图.md)
   - 电商保持 P0；
   - 罗列客服、销售、财务、办公、内容、物流、IT、QA、HR、制造业、房产等后续商业研究领域；
   - 只建立优先级和问题池，不代表项目立即扩张到这些行业。

## 商业 Research 的两条过滤轴

后续新增任何软件，不能只记录“它是否赚钱”。必须同时回答：

```text
Clawdesk 关联等级 C0—C4
→ 它与 Clawdesk 技术 / 产品 / Workflow 有多近？

商业参考等级 B0—B3
→ 它的收费、Packaging、Marketplace、Outcome Pricing 等有多值得借鉴？
```

两者不能混为一谈。

例如：

```text
千牛
→ C1：直接自动化目标

Gorgias
→ C2 + B3：不是底层竞品，但业务自动化和按结果收费很值得研究

Helium 10
→ C3 + B3：主要是上游数据 / 经营工具，商业模式价值高，但不意味着 Clawdesk 应复制数据平台

Klaviyo 部分产品
→ C4 + B3：技术距离较远，主要研究其商业包装和收费模式
```

## 商业化研究的三层问题

```text
第一层：自动化底层怎么赚钱？
→ Runtime / Framework / Recorder / RPA / Marketplace

第二层：什么业务问题值得自动化并收费？
→ 电商为当前 P0，其他行业逐步扫描

第三层：AI 能否跨多个系统把一件业务事情真正做完？
→ Business Execution Agent / Transactional Agent
```

第三层不能反向要求 Clawdesk 自己重建所有能力。默认路线应是：

```text
LLM / Planner
→ API / MCP 优先
→ Browser Automation
→ Clawdesk Desktop / Cross-App
→ Verification / Recovery / Evidence
→ Business Outcome
```

## 与其他 Research 的边界

已有技术竞品和方案研究继续保留在：

- `docs/research/2026-04-07-desktop-automation-landscape.md`
- `docs/research/desktop-automation/`

两类 Research 的区别：

```text
技术 Research
→ 谁能做什么、怎么实现、Build/Buy/Integrate

商业化 Research
→ 谁愿意付钱、为什么付钱、怎么收费、Clawdesk 应该卖什么
```

不新建平行 `reference/` 目录。外部软件与市场信息如果只是事实来源，直接在 Research 文档中记录来源；需要机器可复用的外部参考 manifest 时，遵循仓库规则放到 `docs/research/external/`。

## 研究原则

1. 优先官方价格页、官方产品文档、官方 Marketplace、财报/公开经营数据。
2. 用户痛点可补充社区、论坛、Reddit、Freelancer/Upwork 等需求证据，但必须与官方产品事实区分。
3. “没有找到付费模式”不能写成“绝对没有收入”，应标记为公开证据不足。
4. 区分：
   - 框架作者收入；
   - 第三方生态收入；
   - 用户通过框架节省成本产生的间接价值。
5. 所有价格都带研究日期，后续可能变化。
6. 商业机会进入正式 Roadmap 前，必须再经过真实用户、付费或 ROI 验证。
7. 不因为某个市场很大就自动进入开发计划；优先研究 Clawdesk 是否具有结构性优势。
8. 不因为某个软件商业化成功就把它视为 Clawdesk 直接竞品；先通过 `C0—C4` 相关性分层。
9. 对 C3/C4 对象默认限制研究投入，除非其商业模式为 B3 或能直接成为 Clawdesk 的数据源 / Trigger。
10. 端到端 Agent 研究必须区分低风险自动执行与高风险人工审批，不把批量骚扰、绕过平台风控或违反平台规则作为商业机会。
11. 评价 Agent 商业价值优先使用“业务 Outcome、真实预算、人工成本、执行缺口、结果可验证性”，而不是 GitHub Star 或底层 API 使用量。

## 当前商业研究主线

```text
自动化底层商业模式
→ Recorder / Creator / Marketplace 商业模式
→ 电商宽市场扫描
→ C0—C4 相关性过滤
→ C1 商家真实人工 Workflow
→ C2 现有 SaaS 未覆盖缺口
→ 端到端 Business Agent 闭环
→ 选择 1—3 个可收费 Workflow
→ API / Browser / Clawdesk 最小组合验证
→ Verify + Evidence
→ 真实用户 / 真实付费验证
→ 再决定是否扩大 Creator / Marketplace / Platform
```
