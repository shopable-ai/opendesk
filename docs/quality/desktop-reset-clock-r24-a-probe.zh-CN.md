# Reset Clock R2.4-A：公开 REST JSON 读取与独立探针验收

日期：2026-10-13。仓库 `shopable-ai/opendesk`，仅 `master`。范围：R2.4-A 数据源探测、字段校验、分类、离线测试；不更改 C3 HTML、AppKit/Win32、Go Feed 和历史规范。

## 1. 实测来源与真实性分级

2026-10-13 通过外部网络读取以下 4 个**公开 GET** 端点并观察 JSON 响应：

| URL | 当前响应观察到的结构/字段样例 | 对应的业务事实 | 不得推断的内容 |
| --- | --- | --- | --- |
| `https://codex-reset.com/api/forecast` | `updated_at=2026-10-13T11:01:42.399Z`, `last_reset_at=2026-10-13T05:03:51.000Z`, `confidence=low`, `official_signal=null`, `probabilities.rounded_24h=19`, `rounded_48h=34` | 第三方最新完成记录、历史估计概率 | 精确下一次重置时间/用户个人额度 |
| `https://codex-reset.com/api/timeline` | `updated_at=2026-10-13T11:02:42.415Z`, `events[].id/group/type/summary/url/announced_at/announcement_state`; 示例 `2109812360596865224` 为 `reset + announced`，`2107913674593644711` 为 `credits` | 已确认重置与储备赠送分开 | 把 `group=reset` 下所有候选推文都算重置 |
| `https://codex-reset.com/api/feed` | `fetched_at=2026-10-13T11:08:34.000Z`, `stale=false`, `tweets[]`, `events[]`, `signal`, `newest_post_at` | 最新消息候选、原文证据 | 根据关键词或概率自动宣告重置 |
| `https://codex-reset.com/api/status-history` | `checked_at=2026-10-13T11:25:42.460Z`, `stale=false`, `current.codex=degraded_performance`, `surfaces[]`, `incidents[]`, `compensation_links[]`, `stats` | 服务异常与补偿关联证据 | 把服务降级当成额度重置 |

API 文档明确将 `/api/timeline` 中 `group=reset` 且 `announcement_state=announced` 定为提供方确认的重置；`credits` 是不同业务类别。`/api/forecast` 的 24/48 小时概率和时间窗口**并非承诺**。同一 ID `2109812360596865224` 在 timeline 中记录 `05:03:51Z`、feed 原帖 `at=01:03:59Z`，说明不同时间含义不应混合为“原帖发布时间/执行时间”。

**证据等级限制**：上述请求在当前对话的网页访问通道得到 JSON；它们不是本地 Node `--live` 的执行日志，网页接口没有提供可核验的实时 `ETag/Last-Modified/Cache-Control/Retry-After` 响应头、状态码与请求耗时。当前执行容器运行 `curl` 时 DNS 报 `Could not resolve host: codex-reset.com`。这些现场网络项必须在可联网的 Node/macOS 环境继续验证，不得把它们记作“实测通过”。上面所列响应时间是**上游 JSON 字段**而非本机采样时钟。

来源授权和限制：<https://codex-reset.com/developers>、<https://codex-reset.com/terms>。公共再利用必须在同一个显示界面提供链接 `Data: codex-reset.com`（<https://codex-reset.com/>），服务端使用可识别 UA，最多每分钟轮询一次，服从缓存指示及 HTTP 429 Retry-After。不得使用 Cookie、未公开 API、抓取网页或假冒 OpenAI 官方公告。

## 2. 已实现代码与实际执行命令

- `tests/desktop-reset-clock/tools/public-source-probe/probe.mjs`：固定 4 URL、Node 原生 GET、UA、重试/超时、2 MiB 上限、TLS、redirect 拒绝、字段/时间/来源验证、重复 ID 与时间冲突处理、过期状态；本地 request-state 限流及原子保存，内置跨进程锁。不会发布生产 Feed。
- `tests/desktop-reset-clock/tools/public-source-probe/fixtures/public-response-minimal.json`：2026-10-13 公开响应**按最小字段缩减后的样本**。`summary` 和 `text` 是人工改写示意，非第三方原文；不保证全量归档。
- `tests/desktop-reset-clock/tools/public-source-probe/probe.test.mjs`：24 个确定性 Node mock/fixture 测试，完全离线。
- `tests/desktop-reset-clock/tools/public-source-probe/README.md`：操作入口、输出及约束。

在 **OpenDesk 仓库根目录**运行：

```bash
node --test tests/desktop-reset-clock/tools/public-source-probe/probe.test.mjs
node tests/desktop-reset-clock/tools/public-source-probe/probe.mjs --fixture
node tests/desktop-reset-clock/tools/public-source-probe/probe.mjs --live
```

最后一个命令需要可用 DNS/网络。本轮隔离 Linux 执行器的实测命令为 `node --test .../probe.test.mjs`（**24/24 PASS**）、`node .../probe.mjs --fixture`（成功写入 `.runtime/tests/desktop-reset-clock/r24/fixture-report.json`）。`--live` **未在本环境执行成功**，外部 API JSON 访问单独由网页网络能力完成；没有把 429、ETag 或超时响应头包装成现场已见。

**固定样例分类输出**：`confirmed_reset=1`，`banked_reset=1`，`ordinary_post=2`，`service_incident=1`，`needs_review=1`（因为 URL 缺失），`advance_notice=0`；`exact_next_reset_at=null`，`can_publish_feed=false`。本报告只反映**缩减样本**，不代表完整服务的事件总数。

已通过的负向场景：重复身份只保留一个；同 ID 时间冲突记录警告；`announcement_state=none` 拒绝确认为重置；无来源 URL 拒绝成为可发布事实；`official_signal` 仅作不可操作预告；`stale=true`、过期/未来时间、缺失必填字段、404/500/429/304、登录 HTML、错误 JSON、过大响应、超时/网络中断、60 秒请求冷却、`Cache-Control` 与发布副本过期。500/429 真实现场响应尚未出现，因此相关项均为**模拟测试通过**。

运行产生的状态和结果统一位于仓库根 `.runtime/tests/desktop-reset-clock/r24/`，由原有 `.gitignore` 忽略；禁止提交原始请求、运行日志、锁文件、私人 Token 或浏览器 Profile。

## 3. 字段与事件映射（R2.4-A 非 Feed 实现）

| 上游来源/条件 | 探针类型 | 进入未来 Go Feed 前的门槛 |
| --- | --- | --- |
| `timeline.group=reset && announcement_state=announced` | `confirmed_reset`（提供方确认，非 OpenAI 身份断言） | 核验 HTTPS 原帖、时间与实际适用人群；区分 announcement 与 actual completion；不能把历史时间设为未来 `effective_at` |
| `timeline.group=credits` | `banked_reset`（不计入普通重置） | 核验符合条件的账户范围与实际赠送证据；无原帖 URL 的运营监测进审阅队列 |
| `forecast.official_signal != null` | `advance_notice`（非可执行预告） | 二次核验未来具体时刻及原始来源；不得由概率/时间窗口计算时刻 |
| `feed.tweets[]` 且未被确认事件覆盖 | `ordinary_post` | 原始 HTTPS 来源、去重；不得基于 reset 字样或未知 `kind` 当完成通知 |
| `status-history.incidents[]` | `service_incident` | 保留状态页来源，故障归故障，补偿必须有独立明确关联证据 |
| 429、超时、404、500、无效 JSON、stale 或源 URL 缺失 | `source_unavailable` 健康记录 / `needs_review` | 停止生成新提醒；保留已缓存历史及未知状态，不把缺失当成“0 次” |

探针不自称已核验 `verified_at`、原始 `SourcePublishedAt`、`effective_at`，不发明 `revision`、`withdrawn` tombstone 或 `complete=true`。上游列表变短可能是截断，不等于撤回；需要原始差异/证据核验后才能撤回。

## 4. 下一阶段 R2.4-B：转换为现有 Go Feed

1. 在独立、可部署的 Bridge/Provider Adapter 中**复用本探针的固定 GET、来源和异常约束**，不要把它编译进桌面 `internal/desktop`。必须保存上游原文证据元数据、区分观测/原帖时间、持久化版本状态并避免多个并发采集进程。
2. 仅在独立核验后向现有 `examples/desktop-reset-clock/internal/events/events.go` 产出 `schema_version=1`、固定 `channel_id`、单调 `feed_version`、`generated_at`、`source_health.last_checked_at`、`events[]`，每个更正增加 `revision`，撤回使用真实 tombstone。没有未来精确官方时间时 `effective_at: null`、**不产生到时提醒**。
3. `history/history.go` 的 `coverage_start/end` 和 `complete` 必须由已归档的完整覆盖证实；初期未知覆盖应为 `complete:false`，让最近 30 天/本月显示“数据不足”。`news/news.go` 可承载经审核、注明 `source_type:third_party` 且有原始 HTTPS URL 的新闻；最多 3 条精选进入主卡片，旧版和撤回完整保留。
4. 通过同源 HTTPS 发布 `/feed` + `/archive`，使用 ETag 和 Retry-After；端到端执行 `feed.Client.Fetch`、`FetchArchive`、`events.Decode/Reconcile`、`history.Analyze`、`news.Validate/Top`。确保 304 不更新实际上游检查时间，未证实的第三方帖子不能填入 Go `official` 历史模型。
5. R2.4-C 才能在**新增 C4、绝不覆盖 C3** 的前提下，让 HTML 展示真实/模拟数据切换。保留同屏数据来源链接与“下一次时间待公布”降级；用户批准后再另开 AppKit/Win32 的原生迁移 Goal。

**验收结论**：公开 API JSON 已观察；独立 probe 源码、固定样例、24 项离线单元测试完成；可联网终端真实 GET 与响应头验收、版本化服务端 Feed Bridge、完整历史归档、C4 和原生迁移均**未完成**。
