# 客服中立应用：决定、证据、阻塞与实施入口

日期：2026-09-14。主设计：[provider-neutral-architecture.md](provider-neutral-architecture.md)。官方样本：[provider-api-comparison.md](provider-api-comparison.md)。本文件是本轮接续入口，不替代原商业研究或 Capability Lifecycle。

## 1. 本轮交付与定位

| 状态 | 内容 |
| --- | --- |
| 已形成设计 | 应用/框架边界、中立 Adapter、Generic envelope、KnowledgeProvider、15 阶段 pipeline、固定能力合同、绑定批准、五维结果、三类防重、桌面 owner 条件性改进、两个业务案例 |
| 已运行验证 | 独立中文 HTML 的 20 项浏览器模拟交互检查；桌面 1440px 与窄屏 390px 截图检查；见 prototype/test-results.json |
| 未进入 | 正式 App Mode、四家生产 Connector、真实 RAG/ERP/CRM、客户数据、真实写入、Runtime 全仓构建/测试与真机竞争验收 |
| 目录决定 | 不创建 apps/customer-service-automation/ 空壳；样机及测试归 prototype/；场景设计留在本目录；商业信息继续属于 docs/research/commercialization/ |

“已形成设计”不等于生产批准。“20 项通过”只证明模拟器在这些输入下按预期显示和转换状态，不证明认证、真实幂等、跨进程取消或第三方接口可靠性。样机的 localStorage、JSON 绑定、演示记录和 exec-demo ID 不是生产实现。

## 2. 架构决定记录

| ID | 决定 | 理由与撤销条件 |
| --- | --- | --- |
| CS-ADR-01 | 客服是应用；不创建 CustomerService Runtime global | 业务、政策、渠道属于客户项目。只有稳定跨场景资源/生命周期缺口才能另立框架改造 |
| CS-ADR-02 | 小公共核＋能力声明＋版本化 provider extension | ticket、conversation、case、消息发送与记录保存不等价；真实客户接口可细化映射但不得静默扩大权限 |
| CS-ADR-03 | Generic 接入与厂商适配并存 | 首个客户未知；不提前实现四个空 Connector，不公开 Runtime script API |
| CS-ADR-04 | KnowledgeProvider 优先复用既有 RAG | 现有资产未定位。找到后按实际 schema/ACL/引用能力适配，不重建平台 |
| CS-ADR-05 | 固定可信能力清单可先于通用 Catalog | 延续 Definition/Candidate/Qualification 引用与明确发布；不得外部自报资格 |
| CS-ADR-06 | 预览批准绑定完整操作，业务写入必须单独核验 | 参数/对象/版本/实质前置条件变化失效；批准不等于允许任意回复或后续高风险动作 |
| CS-ADR-07 | 分开记录执行、提交、核验、业务、通信 | 售后建单不是退款；回填失败不重做业务；超时/取消不证明回滚 |
| CS-ADR-08 | 一个业务台账权威源，三类防重独立 | delivery、operation、outbound 的键和恢复语义不同；不承诺跨 GUI exactly-once |
| CS-ADR-09 | 跨入口桌面归属尚未满足放行证据门槛 | listener single-flight / Scheduler Store 锁不足以证明全桌面独占；只提出内部 owner 定向审查/最小改进，不发布锁 API |
| CS-ADR-10 | HTML 先审阅，再进入真实应用 | 避免先造大型客服 UI。真实只读数据链和样机审阅是进入 apps 的门槛，真实写入另设门槛 |

## 3. 当前仓库证据与读取边界

初读 HEAD：`07fd2cf4f151aa8142b115645dbc4fa9c8186cf4`。写入准备时再次取得 `master`：`d3b3ed15bc0f55dc1bb07fbd3efd5167817d4e9b`。compare 显示前进 5 个提交；下列核心已读文件未改变。新增 Window/UI 和测量修改保留，未回退。补读新版本 docs/api/window.md 1–170：窗口身份/精确激活不等同于跨入口桌面 owner。最终提交基底再次前进到 `2e8cf8e9b21dba8731055a7d889d93ed7f434b7c`；新增 10 个提交只涉及测量与其他文档整理，compare 未出现本轮核心证据文件或客服目录变更，全部保留。

| 文件 | 本轮实际读取 | 可支持的判断 |
| --- | --- | --- |
| README.md | 场景评估全文分段读取 | 接续已有方案，不重做市场判断 |
| ../../research/commercialization/knowledge-customer-service-automation.md | 1–160 | 两条商业假设与复用既有 RAG 的方向；非市场或客户成功证明 |
| ../../api/webhook.md | 1–220 | loopback、当前 Execution、Promise 等待、single-flight、窗口去重、未知结果、Origin 边界 |
| ../../../automation/webhook.go | 1–150 | listener active/queue/dedupe、HTTPClient owner；不是全仓资源审计 |
| ../../../pkg/execution/manager.go | 全文件 | 进程内记录、Cancel 异步、Done/WaitAll 生命周期；不证明整桌面串行 |
| ../../../pkg/execution/runner.go | 1–210 | 本地/远程/定时入口能力不同；SQLite/AX/Command 等显式注入 |
| ../../api/http-server.md | 1–130 | script/执行/取消入口；不能作为任意客服模型的执行权限 |
| ../../architecture/external-workflow-runtime-integration.md | 1–135 | CLI bridge 文档状态；不把后续 HTTP adapter 说成已实现 |
| ../../architecture/desktop-automation/task-capability-lifecycle.md | 1–190 | 最小固定清单与无环元数据引用；文档明确部分 Catalog/发布仍是设计 |
| ../../architecture/scheduler-runtime-concurrency.md | 1–200 | Store-scoped OS runner lock 与停止等待；不是所有执行入口共用桌面的证明 |

GitHub 定向代码搜索 desktop ownership、desktop、rag 返回空结果；空索引结果不能证明不存在。未读取的代码不作缺失判断。既有 RAG 维持“开发者已陈述存在、待定位核验”。

外部接口证据及不确定性另见比较文件：四家均未用真实账号调用；Salesforce 部分对象页仅取得官方索引摘要，具体 org 字段与发送链路待验证。

## 4. 样机运行与验收

普通查看：用浏览器打开 prototype/index.html，无需模型 key、Runtime 或客服账号。没有外部依赖；不要填写真实客户信息。

推荐人工审阅路径：案例 A → 补齐材料 → 生成预览 → 批准 → 执行；修改原因后检查旧批准失效。再选择“提交后超时”或“回填失败”，分别检查只读对账与仅补回填。最后切换案例 B，检查建议、草稿与正式报价的区分。

开发者模拟回归（测试源码见本轮下载交付包）：

```bash
python -m pip install playwright
# 机器没有 Chromium 时先执行：python -m playwright install chromium
python docs/scenarios/customer-service/prototype/test_interactions.py
```

本轮环境拒绝 file:// 与 localhost 页面导航，未修改浏览器策略；使用 Playwright page.set_content 渲染本地 HTML，localStorage 是测试替身。第 14 项是“保存状态注入新页面后的恢复”，不是实际文件重载或浏览器持久性验收。真实浏览器重载、保存被禁用及多标签页行为继续待验证。测试脚本不应被生产进程调用。

最终模拟结果：20 passed / 0 failed。包含资料缺失、未批准拒绝执行、参数变更失效、拒绝、售后待审核、重复点击、超时未知、只读对账、提交前失败、只补回填、pending、partial、停止等待、模拟重启、报价草稿、数量非法、文本不作 HTML、证据标记、窄屏布局、无外部请求/脚本错误。

测试源码 test_interactions.py 的 GitHub 写入被工具安全检查拦截，本轮未提交该脚本，也未更换方式绕过；源码与截图保留在本轮下载交付包，仓库只保存样机与测试结果。上述测试命令在取得交付包脚本后使用。

截图由测试生成在 prototype/，本轮下载包包含；不是第三方界面或真实业务证据。测试结果记录保留 mock scope 与 limitations。更新样机后必须重跑，不沿用旧通过次数。

## 5. 未解决问题与准入门槛

| 编号 | 阻塞/未定项 | 下一步必须取得 | 未取得时允许做什么 |
| --- | --- | --- | --- |
| B1 | 既有 RAG 位置与接口不明 | 仓库/服务、部署、鉴权、会话模型、输入输出、引用/版本/ACL、可用 smoke | 继续接口适配设计；不得重建或谎称接通 |
| B2 | 第一个客服系统不明 | 事件样本、稳定事件 ID、可见性、回复/备注权限、签名、配额与实际账号授权 | 保留 Generic schema/合成样本，不选定厂商 |
| B3 | 真实业务系统与对象不明 | 只读接口/账号、对象归属、可回读字段、写入隐式影响、关联号检索 | 只做合成推演；不执行真实资金/库存动作 |
| B4 | 正式政策及审批角色不明 | 客户批准政策、适用日期/区域/商品、谁能批准、敏感字段外发 | 不把 RAG 摘要变成授权 |
| B5 | 持久权威源/接入拓扑未定 | 选客户既有服务 DB 或独立本地 SQLite；可靠收件需求；实际运行入口能力 | 不做两套台账，不将 Runtime Webhook 改成异步持久平台 |
| B6 | 跨入口桌面 owner 未验证 | CLI/HTTP/Scheduler/App/Webhook 竞争矩阵、实际停止/旧回调/子进程证据 | 无受控桌面条件则 GUI 写入阻塞；API 只读链可先行 |
| B7 | 样机未获用户业务审阅 | 预览粒度、操作词、未知/部分完成表达、嵌入侧栏还是小窗口 | 仅保留设计样机，不创建正式 App Mode |

阶段门：只读接通 → 正确对象与权限/错误验证 → 单动作预览批准 → 持久业务防重/恢复 → 一次真实创建草稿与独立回读 → 原会话安全回填。只读也不能跳过敏感数据授权。没有可对账办法的目标写入不获首版资格。

## 6. 下一轮执行入口

```text
OpenDesk：定位既有 RAG，并实现客服场景的一条真实只读能力链。

仓库 shopable-ai/opendesk，目标 master；先重新读取当前 HEAD 和相关文件，保留并行修改，不新建分支、不回退。
先读 docs/scenarios/customer-service/provider-neutral-architecture.md、provider-api-comparison.md、implementation-handoff.md，以及既有 README、商业文档和 Capability Lifecycle。

先输出一张简表：可复用 / 需补充 / 被真实证据阻塞。
先定位既有 RAG 的源码或服务入口，核查部署、认证、会话、证据输出与 ACL；找不到就记录准确缺项，不另建 RAG。
寻找一个用户已授权的真实只读业务能力，例如 order.lookup；先验证 customer/object 归属、数据来源、版本/时间与结果结构。没有真实账号/目标时停在具体阻塞，不拿 mock 替代实测。
Generic 入站只接业务数据，可信连接注入身份；固定能力映射由宿主控制，不接任意 JS/路径/命令/approved/qualification。
使用现有 Webhook/HTTP/CLI bridge/SQLite 等实际可用入口，不增加新的 Runtime API 或第二套执行/调度系统。
只读闭环和样机审阅成立后再建立 apps/customer-service-automation/ 真实最小应用；模块必须有可运行入口及测试，不创建四家 Connector 空壳。
本轮不做退款、补发、地址/金额/权限变更或删除，不把静态审查、mock PASS 与真实集成 PASS 混在一起。
交付实际代码/适配器/测试或明确阻塞资产清单，更新本目录真实证据和下一入口。
```

桌面 owner 的通用改进另开定向实施：先追踪五类入口到共享输入/窗口/子进程生命周期，复用已有锁；缺口确证后才补内部 owner/generation/停止静止屏障与竞争测试。不在客服应用里做一个只能约束自身的伪全局锁。
