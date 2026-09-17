# OpenDesk Product Analytics：现成服务优先的产品统计方案

> 日期：2026-09-17
> 状态：设计决策与待实现合同；不是已上线能力声明。
> 范围：官方 OpenDesk 桌面产品的窗口访问、关键交互与运行结果统计。
> 首选：PostHog Cloud + 官方 Go SDK + OpenDesk 薄适配层。
> 执行入口：[Product Analytics 实现提示词](../../prompts/runtime/product-analytics-implementation.md)。

## 1. 决策结论

使用现成产品分析服务，不自行开发统计服务器、分析数据库或运营 Dashboard。

```text
用户使用 OpenDesk
→ 官方产品层产生少量标准事件
→ OpenDesk 校验同意状态、调用来源和字段白名单
→ App 进程统一统计服务
→ PostHog 官方 Go SDK
→ PostHog Cloud
→ 直接使用现成 Trends / Funnels / Retention / Dashboard
```

PostHog 不是 Google Analytics，也不使用 Google 的采集接口。首版不依赖 Google 账号，不需要产品方先部署一个采集服务器，终端用户不需要注册任何统计平台账号。

“现成服务”负责接收、存储、查询和报表；OpenDesk 仍须说明哪个按钮被触发、哪个窗口真正显示、Flow 是否真正启动或结束。这些产品语义不能由一个通用 SDK 自动猜测。

### 1.1 两条可以使用的现成路线

| 路线 | 现成部分 | OpenDesk 仍需完成 | 本轮决策 |
| --- | --- | --- | --- |
| PostHog Cloud + 官方 Go SDK | 事件采集、SDK 队列与批量发送、产品分析和 Dashboard | 薄封装、产品事件、同意与隐私边界、生命周期接线 | 首版采用 |
| GA4 + Measurement Protocol | Google HTTP 采集与 GA4 报表 | 产品事件、受控服务端中转、密钥保护、会话/标识映射和报表适用性验证 | 明确要求统一 Google 体系时再实施 |

PostHog 的 Go SDK 已提供内存队列、非阻塞调用和异步批量发送能力，[1] 产品分析服务已包含趋势、漏斗、留存和 Dashboard。[2] 不应为首版重新实现这些现成部分。

Google Measurement Protocol 可以通过 HTTP 发送事件，但官方定位是补充 gtag、GTM 或 Firebase 自动采集；纯 Measurement Protocol 可以发送数据，却可能只能获得部分报表能力。[3] `api_secret` 属于组织私有配置。[4] 因此，未来采用 GA4 时选择“桌面 → 受控中转 → GA4”，而不是把秘密写进分发给用户的程序。中转解决密钥暴露，不会自动补齐缺失的自动采集和会话归因。

首版只实现一个远程 Provider。GA4 不作为默认故障切换目的地，也不为统计而创建隐藏 WebView 或伪造 Firebase app instance。

## 2. 当前仓库依据及证据边界

本轮阅读快照为 `0a71d0714ecdf5b52ea535e8cb7249235686437c`。

| 已读取资产 | 能支持的结论 |
| --- | --- |
| `AGENTS.md` | 遵守现有 App / Runtime ownership、文档、JS Runtime API 测试与分支规则 |
| `go.mod` | 项目有 Go 与 Goja 运行基础；该文件没有列出 PostHog Go SDK 依赖 |
| `apps/opendesk/main.js` | 官方 App 已组合 Runner、Promotion、Assistant 等模块，适合在官方产品组合层接线 |
| `apps/opendesk/promotions/controller.js` | 已有 `show()`、可见/on-screen 确认、图片就绪、关闭与本地频次记录，可复用这些真实节点 |
| `docs/architecture/app-mode-local-services.md` | 已有 App primary instance 拥有的 loopback 服务与独立认证边界，不需要新建第二个 Runtime 或 listener |
| `docs/README.md` | 长期架构放 `docs/architecture/`，实现事实与方案状态必须区分 |

代码搜索未返回 analytics 命中，但“搜索没有命中”不能证明全仓库绝对没有相关机制；现有局部计数也不能自动视为已接入云端产品分析。下一轮仍需核验最新源码，优先复用已经出现的有效实现。

本轮没有安装 SDK、创建云端项目、修改生产功能或运行原生统计验收。

## 3. 相比上一版的修正

| 上一版容易扩大的部分 | 本版决定 |
| --- | --- |
| Analytics Core + 自建 Queue + 多 Provider + 新 Debug 窗口同时建设 | 现成 SDK 和云端报表优先，只补产品合同、安全边界和必要诊断 |
| 先入队，再过滤隐私字段 | 同意、来源校验和字段校验先于任何队列、日志、持久化与网络 |
| 第一轮覆盖所有产品模块 | 先完成六个核心事件的真实纵向闭环，再扩展安装、录制、测量、推广 |
| 把随机 install_id 称为完全匿名 | 明确为不含账号的随机安装标识；不保证不可关联，也不替代隐私审查 |
| 默认上传所有 flow_id | 本地/私有 Flow 默认只统计来源类别，不上传名称、路径、私有 ID 或它们的散列 |
| HTML data 属性自动采集作为基础 | 优先正式 Native / Custom UI action；仅真实 DOM 页面才按需使用声明式标识 |
| app 进程寿命等于活跃 Session | 常驻托盘进程与前台使用会话分离，后台定时任务不制造“活跃用户” |
| HTTP 返回成功等于已入库 | 本地事件、传输受理、云端可查询、Dashboard 正确分别验收 |

## 4. 职责与接入边界

### 4.1 官方产品薄封装

以下仅展示设计中的使用语义，不表示仓库已存在这些 API：

```js
analytics.screen('flow_runner');
analytics.track('ui_action', {
  surface: 'flow_runner',
  action_id: 'flow.run',
  input_method: 'pointer'
});
```

业务代码不接触 PostHog SDK、project token、网络 URL 或 Provider 特有字段。事件使用固定名称和有类型的属性，不接受任意对象透传。

首版是官方 OpenDesk 的内部产品能力，不默认变成所有 `.js` / `.odflow` 都能调用的公共 Analytics global。第三方 Flow 不得借官方采集链上传任意内容、伪造产品事件或切换 endpoint。

### 4.2 Native App owner

进程级 service / SDK client 由官方 App primary instance 拥有。窗口重建、Runner 选择切换或 child execution 不创建新的 client，不生成新的安装标识，也不重复记启动。

JS → Go 接线复用现有受保护 App bridge。需要 HTTP 路由时，只能扩展现有 App Local Services 的窄接口；不得新建 listener、通用埋点公网入口或第二套 Runtime。调用权限与来源必须由可信宿主验证，不能相信请求自报的 `source` 或 `official` 字段，也不能把官方统计权限继承给第三方 Flow。

Core 自动填写版本、平台、schema 版本、身份和时间。调用者不得覆盖这些保留字段。版本复用产品现有唯一来源，不硬编码某次发布版本。

### 4.3 供应商边界

内部只保留一个小的 Provider 边界及三种运行方式：Disabled/Null、本地 Debug、PostHog。不要建设通用插件平台或本轮实现多个供应商。

优先使用官方 Go SDK的采集能力，固定经验证的依赖版本。不要照搬服务端示例中的 Personal API Key、请求上下文中间件、日志自动捕获、Feature Flags 或 Error Tracking。

SDK 必须满足本合同的有限队列、取消与撤回行为。若选定版本无法通过这些测试，先记录具体缺口；允许在同一个 PostHog Provider 内改用官方 HTTP Capture/Batch API 的最小实现，[5] 不得并行保留两套发送链，也不得放宽隐私边界。

## 5. V1 事件目录与计数口径

事件名采用稳定 snake_case。上一版点号命名只是讨论稿，不要求为了兼容未上线讨论而重复发送两套名称；若下一轮发现已经上线的事件，先评估迁移而非机械改名。

| 事件 | 触发节点 | 明确不代表什么 |
| --- | --- | --- |
| `app_started` | 已有有效同意时，官方 primary instance 真正启动，一次/进程 | SDK 初始化、窗口创建、第二实例唤醒不是新启动 |
| `app_session_started` | 有同意后首次前台使用；或前台使用间隔达到会话阈值后再次使用 | 托盘常驻、定时任务或网络重试不是用户活跃 |
| `screen_viewed` | 窗口/页面从未显示或隐藏状态变成确认可见 | create 请求、重新渲染、重复 focus 不计新增访问 |
| `ui_action` | 一次真实、允许统计的产品交互到达统一 action dispatch | 自动化对第三方程序的每次鼠标点击不统计 |
| `flow_run_started` | 可信执行 owner 确认本次运行真正开始 | Run 点击、预检或启动请求受理不等于运行开始 |
| `flow_run_finished` | 可信执行 owner 确认终态 | Stop 点击不等于已停止；进程退出不一定等于业务目标成功 |

`ui_action` 使用稳定 `action_id`，例如 `flow.run`、`flow.stop`、`flow.previous`、`flow.next`、`flow.list`。`input_method` 仅允许 `pointer/keyboard/menu` 等经过评审的枚举；程序触发不能伪装成真实用户操作。统计鼠标按钮点击时筛选 `input_method=pointer`。

同一次键盘/鼠标行为只能由一个 owner 记录 `ui_action`，不能在 DOM、Native bridge、controller 各记一次。事件 listener 随窗口关闭释放；重新打开不得叠加注册。

`flow_run_finished.outcome` 使用 `success/failure/cancelled/unknown`。`success` 只表示声明的执行结果；没有独立业务结果验证时，Dashboard 应称“运行完成率”，不得声称“业务成功率”。已启动但未观察到终态的运行保留缺失/未知状态，不从点击或缺少错误推断成功。

### 5.1 公共字段

```text
schema_version
 event_id        每个逻辑事件一次生成；重试复用
 occurred_at     UTC 事件发生时间，不用重试时间替代
 install_id      同意后生成的随机安装标识
 process_id      统计专用随机 ID，不上传 OS PID
 session_id      前台会话标识；后台来源不伪造前台会话
 app_version
 platform        macos/windows 等固定枚举
 arch            已评审的平台架构枚举
 environment     production/development/test
```

具体事件再允许 `surface/action_id/input_method/flow_origin/run_id/outcome/error_code/duration_bucket` 中必要的字段。字段键、值类型、长度和枚举必须共同校验；白名单键不意味着允许任意自由文本值。

`run_id` 是统计专用相关 ID，不使用包含文件名、任务名或账号的业务字符串。终态关联运行开始时的上下文，不因为长任务期间前台 session 轮换就改变归属。无前台来源的运行明确标记为 background，不贡献前台活跃。

### 5.2 标识和会话

安装标识在用户明确同意后首次生成并持久化，范围为当前 OS 用户下的 OpenDesk 产品数据；不用 MAC、机器序列号、用户名，也不复用已有授权 device ID。

首版不做登录账号 Identify、Alias 或跨网站关联。PostHog Provider 用安装标识映射 `distinct_id`，并对事件设置 `$process_person_profile=false`，不创建人物档案。[1][5] 原生桌面自行管理会话，不假设 Go SDK 自动提供浏览器会话语义。

前台会话建议采用 30 分钟无有效前台产品活动后结束的产品口径，在测试中使用可控时钟验证。睡眠恢复、进程重启和身份重置均有明确规则；后台 Flow、计时器、定时上报不延长前台活跃。SDK 或云端 `$session_id` 映射的实际行为需验证，不匹配时按自有 session 字段建报表，不伪造兼容。

首次同意发生在启动之后，不回放同意之前的启动、访问或点击事件。开启统计不是新 app launch。

## 6. 同意、隐私和密钥

### 6.1 同意状态

```text
unknown / denied
→ 不采集产品行为，不生成统计身份，不入队，不落盘，不发统计网络请求

granted + 有有效产品配置
→ 从当前时刻开始采集经过白名单审核的事件

撤回
→ 先关闭发送闸门并取消在途传输
→ 停止生产新事件，丢弃所有未发送队列和重试
→ 清理统计缓存，持久保存关闭状态
```

设置可使用“分享基础使用统计，帮助改进 OpenDesk”，默认未开启，不影响任何 Flow、录制、测量或授权功能。隐私说明交代数据类别、服务提供方、用途、保留策略及关闭方式。

撤回时不能调用会把历史队列发出的无条件 SDK Close/Flush。发送闸门必须覆盖 SDK 重试和退出路径；测试必须证明关闭生效后不再启动统计请求。已经离开设备的数据不能被撤回网络请求自动收回，云端删除属于单独的数据删除流程；“清理本地统计数据”不能谎称删除云端数据。

如重置统计身份，应清空相关本地状态并在重新同意后生成新标识，不能再把新旧标识 Alias 回去。已选择关闭的偏好跨重启保留。

显式本地 Debug 可以使用合成测试事件；它不赋予上传真实用户活动的权限。关闭状态下不得借 debug、心跳、错误报告或 feature-flag 请求绕过统计开关。

### 6.2 数据最小化

永不进入本统计链的内容包括：脚本源码、执行参数、Secret、Token、License Key、文件路径与文件内容、剪贴板、OCR 文本、截图、录屏、AI 对话、第三方窗口内容、网页完整 URL、HTTP 正文和原始异常文本。

本地/私有 Flow 只允许 `flow_origin=local` 等类别；名称、私有 `flow_id`、包路径及这些字符串的散列均不默认上传。公开 Marketplace 资源 ID 只有在来源确认为公共目录且进入专门事件合同后才可启用；不相信任意 Flow 自报“public”。

未登记的事件和属性在进入 SDK、队列或 Debug 缓冲前拒绝。诊断只记录固定拒绝原因，不把被拒绝值写进日志。错误仅传枚举化 `error_code`；耗时优先分桶。

禁止 Session Replay、全量 DOM autocapture、文本/输入采集、自动异常或日志转发。关闭不需要的地理推断与人物属性处理，并核验实际上传字段与云端处理结果。直连服务仍会在网络层看到来源 IP，不宣称“随机 ID + 不传姓名 = 完全匿名或自动合规”。服务商隐私工具不能替代产品方对实际数据处理的审查。[6]

### 6.3 密钥分类

PostHog project token 可用于公开客户端的事件采集，不具有查询私有分析数据的权限；Personal API Key 等管理凭据必须保密。[6][7]

因此首版可直连 PostHog ingestion：发行配置只有公开采集 token 和区域 endpoint，绝不能打包 Personal API Key、project secret 或 Google `api_secret`。代码加密、`.odcfg` 或混淆不能把已分发的秘密变成真正服务端秘密。

公开采集 token 不防止恶意伪造事件。客户端限流和白名单是资源/隐私控制，不是可靠反作弊认证。统计数据不能用于会员扣费、授权判定、广告结算或财务对账；此类事实以可信服务端交易为准。确需更强反滥用或数据中转控制时，再独立设计受控网关，不为首版点击统计先建设整套服务端。

## 7. 非阻塞、离线与生命周期

业务入口只做有界校验和入队；不等待统计 HTTP，不因为统计失败阻止窗口显示或任务运行。只隔离统计自身异常，不能吞掉真实业务错误。

首版复用 SDK 队列/批量发送，采用尽力投递，不默认增加 SQLite/磁盘事件 spool。这样无需维护第二套持久化发送系统，也不会把未发送行为长期留在用户磁盘。

必须明确并测试：最大内存/事件数、入队满时立即丢弃、最大事件大小、请求超时、有限重试和退出预算。建议验收预算为单事件不超过 2 KiB、缓冲不超过 1000 事件且在途批次另有上限、统计退出额外等待不超过 1 秒；这些是产品预算，不是声称 SDK 已有的默认配置。实际采用的 batch/queue/retry 参数及 SDK 能力缺口必须写入实现说明。

UI 线程不得为了队列满而阻塞；断网重试不能忙循环、无限增长或阻止退出。SDK 无法满足同意撤回、丢弃队列或取消请求的控制时，按第 4.3 节在 Provider 内最小修复或替换实现，不扩大到业务模块。

重试复用 `event_id` 和原始时间。正确映射供应商的去重字段并实测；在未验证之前，不宣称端到端 exactly-once。受控本地测试应保证一个产品行为只生成一个逻辑事件。

离线、进程崩溃、队列溢出、用户拒绝和云端配额限制均可能造成缺失。因此报表是已同意且成功送达样本的产品使用统计，不是全体用户审计账本。

## 8. 配置、诊断与现成报表

### 8.1 产品方一次性配置

产品方创建 PostHog 项目，选择数据区域，取得 project token 与正确 ingestion host，并配置隐私说明和预算。普通 OpenDesk 用户不填写 key、不选择 Provider、不操作统计目录。

正式版本沿用官方产品配置的唯一 owner；新增字段必须同步配置 schema、生成与发布验证。不要向 UI 文件散落配置，也不把已有官网/Marketplace URL 从其 source-of-truth 搬到新文件、环境变量或 App Manifest。

产品只读配置决定 provider、endpoint、公开 token、环境和采集上限；用户偏好只决定同意状态。开发注入可以使用受控 fixture，但不能被第三方 Flow 或正式 release 的任意输入改成其他上传目的地。没有有效配置时统计保持禁用，产品照常运行。

US/EU 项目使用对应区域地址，[5][7] 不根据联网失败偷偷切换区域或供应商。目标用户网络的实际可达性必须验证，不保证某个全球服务在所有网络都可用。

### 8.2 Debug 不另做分析产品

首版复用现有 Developer/日志能力，展示：mode、consent、provider、schema 版本、队列状态、丢弃数、最近已校验事件和传输状态。保留有界本地环形缓冲；不输出 token 或原始拒绝内容。

支持本地合成测试事件与查看安全事件 JSON。真实远程 smoke 需要明确配置与授权，带 `environment=test` 和合成关联 ID；不存在连接时继续完成本地测试，不伪造远程成功。

必须区分：

```text
事件已生成
≠ SDK 已入队
≠ HTTP 请求被受理
≠ PostHog 已入库可查询
≠ Dashboard 的计数和过滤正确
```

PostHog 官方说明 HTTP 200 并不保证事件有效或最终入库，配额限制也可能在 200 响应中体现。[7] 云端验收必须查询到同一 `event_id` 或可核对的合成关联 ID；不能只截图一个发送成功日志。

### 8.3 第一张 Dashboard

直接在 PostHog 配置 `OpenDesk Product Overview`，不在 OpenDesk 内重做报表界面。[2]

| 报表 | 口径 |
| --- | --- |
| 窗口访问 | `screen_viewed` 按 surface 汇总，显示事件次数及去重安装数 |
| 按钮使用 | `ui_action` 按 action_id 汇总，按 input_method 区分鼠标/键盘/菜单 |
| 活跃安装 | 对有效前台使用事件按 install_id 去重，不把后台常驻当用户活跃 |
| 运行情况 | started 与 finished 分开，按 run_id 关联，终态按 outcome 分类 |
| 版本分布 | 按 app_version / platform 汇总，不以系统用户名识别人 |

报表固定 `environment=production`，排除合成测试事件；选定并注明统一报表时区，首版可用 UTC。运行完成率使用同一启动队列及观察窗口，不能简单拿“今天完成数 / 今天启动数”处理跨日长任务。缺失终态独立显示，不归入成功。

平台报表中的 Users 在本设计中应标注为“参与统计的安装标识”，不是精确真人数。未采集账号，不承诺跨设备去重。

### 8.4 成本与环境隔离

截至本次核验，PostHog 公布 Analytics 每月 100 万事件免费额度，免费方案列出 1 个项目；付费产品可配置费用上限。[8] 这是当前页面信息，不是永久价格承诺。

例如假设 1000 个日活跃安装、每个每天 20 个事件、30 天，估算为 60 万事件/月；实际以有效事件预算为准，不开启高频鼠标、OCR 或执行步骤级遥测。

开发/测试默认用本地 Debug。具备项目额度时使用独立测试项目；只有一个云端项目时，受控 smoke 必须标记测试环境并从所有生产报表排除，这只是逻辑隔离，不声称与独立项目等价。

## 9. 实施范围与后续扩展

### V1：本轮下一阶段真正要完成的纵向闭环

```text
六个核心事件
+ 同意开关与字段白名单
+ App 进程 owner / 官方产品 bridge
+ 官方 Go SDK 薄适配
+ 本地 Debug 与自动测试
+ PostHog 真实入库和第一张 Dashboard（具备账户配置时）
```

不能只完成 NullProvider 后把任务标为完成。缺少云端访问时，生产发送代码和本地可运行验证仍须完成，云端连接与 Dashboard 单独记为 BLOCKED/NOT RUN，并列出必要配置。

### V1 后扩展：复用同一合同

| 能力 | 候选事件 | 特别边界 |
| --- | --- | --- |
| Flow 安装 | `flow_install_started/flow_install_finished` | 启动安装不等于事务提交；失败不计 installed，不上传本地包路径 |
| Recorder | `feature_session_started/feature_session_finished`，feature=recorder | 不采集录制内容或每一个录制动作 |
| Measurement | 同上，feature=measurement | 不采集图像、OCR、窗口标题、坐标或测量正文 |
| Promotion | `promotion_displayed/promotion_clicked/promotion_dismissed` | 基于真实可见、点击和用户关闭节点，不从 show 请求推断曝光 |
| Marketplace | 后续单独补全下载/安装/首次运行漏斗 | Web→Desktop 不通过 URL 暴露 install_id/token；跨端关联另做同意与归因设计 |

Promotion 的 displayed 只是原生界面确认显示的产品口径，不是已满足广告行业可见曝光标准；系统超时/业务抑制关闭与用户 dismiss 分开。本地频次控制继续使用现有本地状态，不能依赖云端统计是否成功。

暂不实现 Session Replay、A/B Test、Feature Flags、远程日志采集、计费系统、第三方 Flow 自定义遥测或自建分析数据库。

## 10. 验收合同

所有状态初始为 NOT RUN。下一轮以新源码、实际构建和真实证据更新，不能拿本方案评分替代验收。

| 检查 | 通过条件 |
| --- | --- |
| 窗口统计 | 首次显示/隐藏后重开各计一次；重复 focus/重绘不新增；打开失败不计 |
| 交互统计 | 受控 10 次点击产生 10 个逻辑交互事件；快捷键不会同时再记一个鼠标事件；重开窗口不叠加 listener |
| Flow 生命周期 | 成功、失败、取消分别源于可信终态；拒绝启动不记 started；没有结果不推断 success |
| 同意 | unknown/denied 无产品行为缓存和统计网络；重启保留选择；首次同意不回放历史 |
| 撤回 | 有待发和重试事件时关闭，关闭生效后没有新统计请求；退出不偷偷 flush |
| 隐私 | 敏感字段、私有 Flow 标识与伪装在白名单键中的自由文本均不进入队列、Debug 或网络 |
| 身份/来源 | 不使用 machine/license ID；第三方 Flow 不能调用官方遥测或改变 endpoint；后台执行不增加前台活跃 |
| 故障隔离 | 断网、超时、异常响应、队列满、Provider 错误不影响运行/停止；内存与退出等待有界 |
| 投递 | 重试不重造事件 ID；本地逻辑去重与供应商去重分别验证，不宣称未经验证的零丢失 |
| 云端 | 同一合成事件可在 PostHog 查询；报表过滤测试环境正确；HTTP 200 不能单独作为 PASS |
| 配置安全 | 发行包没有管理 API key / GA api_secret；只读配置与用户同意分离；无配置时可运行产品 |
| 平台与测试 | Go 内部 seam 测试与真实 Runtime JS 可观察行为测试各司其职；可用主机做实窗验证，缺少主机明确 NOT RUN |

测试遵守当前 `AGENTS.md` 与 API 文档规范。新增公开 Runtime API 时才维护对应 canonical reference、类型和测试注册；不要为内部统计随意扩大公开接口。可由 JS 观察的行为用实际 OpenDesk Runtime JS 测试证明，Node/mock 不能冒充原生结果。证据写入 `.runtime/`，不提交运行数据。

## 11. 设计自评与未消除风险

评分是针对本次目标的设计自评，不是独立专家认证、供应商评分或实现通过率。

| 维度 | 权重 | 本方案 | 理由 |
| --- | ---: | ---: | --- |
| 现成能力复用与交付复杂度 | 30 | 29 | 直接复用云端分析与 SDK，只保留薄适配 |
| 隐私、凭据与权限边界 | 25 | 24 | 同意和白名单在入口，撤回覆盖队列，官方产品调用隔离 |
| 产品事件与指标正确性 | 20 | 19 | 可见/点击/执行终态分开，明确安装/会话和缺失口径 |
| 可维护性与扩展边界 | 15 | 15 | 稳定目录、单远程 Provider、分步扩展而不重建平台 |
| 可验证性与运营接入 | 10 | 9 | 本地、传输、云端入库与报表分层验收 |
| 合计 | 100 | 96 | 达到本轮 95 分以上的设计目标 |

保留的 4 分对应实际待验证风险：SDK 取消/退出控制、目标网络与云端配置、常驻 App 会话接线、真实端到端计数和平台行为。任何隐私硬门禁失败，都不能用总分抵消或宣布可发布。

## 12. 外部来源与复核时间

以下为 2026-09-17 访问的官方资料。引用用于服务能力、限制与选型依据；本文件中的事件命名、同意默认、缓冲预算和实施范围是 OpenDesk 设计决策，不是服务商默认设置。

1. [PostHog Go SDK](https://posthog.com/docs/libraries/go)：Go 采集、队列/批量发送及 personless 事件配置。
2. [PostHog Product Analytics](https://posthog.com/docs/product-analytics)：趋势、漏斗、留存及 Dashboard。
3. [GA4 Measurement Protocol overview](https://developers.google.com/analytics/devguides/collection/protocol/ga4)：补充定位及纯服务端报表限制。
4. [GA4 Measurement Protocol reference](https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference)：HTTPS、api_secret 和传输/校验边界。
5. [PostHog Capture / Batch API](https://posthog.com/docs/api/capture)：公开采集端点、区域、事件结构及 personless 采集。
6. [PostHog Privacy](https://posthog.com/docs/privacy)：公开 project token 与私有管理 key 的差异、产品方数据处理责任。
7. [PostHog API overview](https://posthog.com/docs/api)：公开/私有 API、区域和 HTTP 200 不代表入库的限制。
8. [PostHog Pricing](https://posthog.com/pricing)：当日免费额度、项目数量和费用控制。

本地执行提示词只引用本合同及需要证明的最终行为；不复制完整仓库目录、Git 操作手册或历史讨论。
