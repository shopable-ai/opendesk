# GOAL：OpenDesk Reset Clock R2.4 —— 公开数据源调用、来源证据映射与独立 Feed Bridge

日期：2026-10-13。默认中文。**状态：已核对公开开发者文档和实际 JSON 响应；本文件是研究及下一轮实施依据，不表示 Collector、生产服务或 Go 原生界面已完成。**

## 0. 用户需求与结论

- 项目：\`https://github.com/shopable-ai/opendesk\`，唯一允许写入分支 \`master\`。
- 已有**单文件离线预览**：\`examples/desktop-reset-clock/prototypes/r23-c3-reference-inspired-hero.html\`。其 Banner 使用内嵌 WebP；卡片没有「推广 · 示意」角标。C、C2 及 C3 的旧视觉过程继续保留。它只有模拟数据，不是实际公告产品。
- 用户提供的参考站 \`https://tiboreset.com/zh\` 的开发者页和条款明确指出：数据归属于 \`https://codex-reset.com/\`，可调用**公开只读 JSON API**，无账号与 API Key；**不要抓取 tiboreset.com 的页面 HTML**。
- 采集、校验、去重、归档与发布属于**独立服务/进程**，不塞进桌面 Go 卡片，也不让客户端持有 X Cookie。客户端只读取已有严格校验的 OpenDesk HTTP Feed。当前 Go Feed **不兼容**第三方 JSON 结构，不能把上游 /api/forecast 填到客户端 Feed URL 冒充成功。
- 真正没有准确未来时间的情况下，**不能显示虚构的「1 小时 30 分」**；C3 的大倒计时仅是 HTML 视觉测试假数据。先展示最近确认的重置及“下一次时间待公布”；估计概率与确定时刻必须分开。

## 1. 外部可靠来源与使用条件（核查日期 2026-10-13）

1. [tiboreset 中文站](https://tiboreset.com/zh) 与 [开发者文档](https://tiboreset.com/developers)：页面是前端视图；正式公共 API 在 \`codex-reset.com\`。该站 [Terms](https://tiboreset.com/terms) 明确要求复用数据使用 API，而非抓页面。
2. [codex-reset 开发者契约](https://codex-reset.com/developers) 和 [条款](https://codex-reset.com/terms)：无需认证、允许跨域只读请求，免费但须按要求提供可见署名链接；服务端请求应提供能识别项目和联系方式的 User-Agent。最密**每 60 秒一次**，遵循响应 Cache-Control、Retry-After / 429；只依赖开发者文档公开保证的字段。
3. 发布给用户的卡片、详情或中转 API 应在**显示数据的同一界面**提供 \`数据：codex-reset.com\` 超链接到 \`https://codex-reset.com/\`。这与删除 C3「推广 · 示意」悬浮角标不冲突；不能隐藏数据来源。私用与公开展示的署名要求以对方当前条款为准。若将来商业化或做 SLA，需再复核其最新使用条件、授权与依赖风险。
4. 此站与 OpenAI 无隶属关系。X 原帖和运营方观测为不同证据等级。网站提供的预测、消息分类、运行状态和重置记录可能延迟或误判；**不能用它判断某个具体用户的账号已回满**。
5. 备选交叉核验来源：[DidReset 公共 API](https://didreset.com/zh/api-docs) 与 [codex.markets Public API](https://codex.markets/zh/docs/api)。各有独立条款和口径；第一阶段不混合它们计数，也不把第三方“共识”当成官方确认。

### 1.1 已证实的 REST 接口

| GET 路径（域名：\`https://codex-reset.com\`） | 公开稳定字段（按开发者文档） | 消费意图及风险 |
| --- | --- | --- |
| \`/api/forecast\` | \`probabilities.rounded_24h\`、\`probabilities.rounded_48h\`、\`confidence\`、\`last_reset_at\`、\`age_days\`、\`official_signal\`、\`updated_at\` | 最近一次确认、近期概率、信号。概率≠重置承诺；\`official_signal\` 可为 null。 |
| \`/api/timeline\` | \`events[].id\`、\`announced_at\`、\`announcement_state\`、\`group\`、\`type\`、\`summary\`、\`url\` | 事件历史/公告链接。按群组与确认状态筛选，不能把所有 \`group=reset\` 的候选帖都算完成。可请求 \`locale=zh\` 得到支持的翻译摘要。 |
| \`/api/feed\` | \`tweets[]\`、\`events[]\`、\`signal\`、\`newest_post_at\`、\`fetched_at\`、\`stale\` | 最近公告候选/三条动态的原始线索；严控误判和过期。 |
| \`/api/status-history\` | \`current\`、\`surfaces\`、\`incidents[]\`、\`compensation_links\`、\`stats\`、\`checked_at\`、\`stale\` | Codex 服务故障解释，不等于额度重置。 |
| \`/mcp\` | \`get_reset_forecast\`、\`get_reset_timeline\`、\`get_codex_status\` | 可供 Agent 使用的只读 Streamable HTTP 工具；OpenDesk Collector 使用 REST 即可，无需为了取数据引入 MCP。 |

注意：\`/api/juice\` 是额外观察数据，并非重置核心接口；不放进首阶段关键链路。

### 1.2 可直接复制测试的请求（终端，仅读）

从任何工作目录执行以下命令，建议 macOS 本地测试保存 stdout 而非将结果写入长期源码。可选安装 jq 美化和过滤。

\`\`\`bash
curl -fSsS --connect-timeout 5 --max-time 15 \
  -A 'OpenDesk-Reset-Clock/1.0 (+https://github.com/shopable-ai/opendesk)' \
  -H 'Accept: application/json' \
  'https://codex-reset.com/api/forecast' \
  | jq '{updated_at,last_reset_at,confidence,official_signal,p24:.probabilities.rounded_24h,p48:.probabilities.rounded_48h}'
\`\`\`

\`\`\`bash
curl -fSsS --connect-timeout 5 --max-time 15 \
  -A 'OpenDesk-Reset-Clock/1.0 (+https://github.com/shopable-ai/opendesk)' \
  -H 'Accept: application/json' \
  'https://codex-reset.com/api/timeline' \
  | jq '[.events[] | select(.group=="reset" and .announcement_state=="announced") | {id,announced_at,summary,url}][0:5]'
\`\`\`

\`\`\`bash
curl -fSsS --connect-timeout 5 --max-time 15 \
  -A 'OpenDesk-Reset-Clock/1.0 (+https://github.com/shopable-ai/opendesk)' \
  -H 'Accept: application/json' \
  'https://codex-reset.com/api/feed' \
  | jq '{fetched_at,stale,newest_post_at,recent:[.tweets[:3][] | {id,at,text,url}]}'
\`\`\`

HTTP 4xx/5xx、DNS、超时、无 jq 与字段缺失应显式报错。读 JSON 成功**不等于**新全员重置发生；不能未经核验自动推送。

### 1.3 现场请求的关键发现

- \`/api/forecast\` 在 2026-10-13 的一次公开响应中有 \`last_reset_at\`，但 \`official_signal:null\`，\`confidence:low\`；当时 24/48h 是实验性估计，**不是精确下一次重置时间**。
- \`/api/timeline\` 实际返回同一时间附近多条 \`group:"reset"\` 候选帖；其中一些 \`announcement_state:"none"\`，不能计为已确认重置；\`group:"credits"\` 的储备/赠送事件必须与全员重置分开。
- \`/api/feed\` 包含 \`stale\`、\`fetched_at\`，可辨别抓取状态；内容摘要不等于公告确认。
- 有些 \`timeline\` 事件是运营方监测，原文链接可以为 \`null\`，不能虚构官方来源 URL。后端证据模型如果要求 HTTPS 原帖，则必须进入人工/二次核对队列，不能降级绕过。
- 公开请求不要求 Cookie 或登录。多次调用不能保证一定实时，必须区分上游检查、最后确认、客户端获取三种时钟。

## 2. 与现有 OpenDesk Go 客户端的准确衔接

现有实现已经建立了规范化数据边界，**优先复用**而不是新建第二套系统：

- \`examples/desktop-reset-clock/internal/feed/client.go\`：客户端只接受安全 HTTP、校验 JSON、2MiB 响应上限、超时/ETag/429/重试。
- \`internal/events/events.go\`（相对 \`examples/desktop-reset-clock\`）：\`Snapshot\` 必须有 \`schema_version:1\`、\`channel_id\`、\`feed_version\`、\`generated_at\`、\`source_health\`、\`events\` 等，并维护事件 ID、\`revision\`、\`withdrawn\` tombstone 和版本单调性。
- \`internal/history/history.go\`：单独的按页历史归档。\`complete\` 与 \`coverage_start/end\` 若不能证明覆盖就不能凭空填真；否则最近 30 天/本月的“0次”可能是谬误。
- \`internal/news/news.go\`：最多三条有效新闻进入卡片，保留链接、来源、校验时间、修订和撤回；无有效 source URL 或未验证的事件不得伪造。
- \`internal/app/app.go\`：状态和倒计时基于上述 Feed 判断，原生 UI 不应自行推断重置是否发生。

**推荐数据链**：

\`\`\`text
codex-reset.com 公开只读 API (GET, ≤1 次/分钟)
                ↓
独立 Collector / API Adapter (不放在 Go 桌面卡片)
                ↓
证据分类、原帖链接核验、去重、revision / tombstone、
UTC 时间、有效期、未知状态、原始响应缓存
                ↓
OpenDesk Feed v1 + 同源 History 归档 / News
                ↓  HTTPS / ETag / Retry-After
现有 Go feed.Client → App → 卡片 / 历史详情 / 通知
\`\`\`

启动阶段可用**独立受控本地 HTTP Bridge**做 Mock 验证，但它不是正式公网发布；对外生产要 HTTPS。首阶段后端只集成一个正式上游，避免交叉来源把一个事件计算成多次。

### 2.1 必须执行的字段映射规则

1. **已确认重置**：基于 \`/api/timeline\` 的 \`group === "reset" && announcement_state === "announced"\` 选候选有效历史，结合 \`/api/forecast.last_reset_at\` 交叉核对。重要修订应保持归档版本，不以网页最新列表首项充当完成记录。
2. **来源真实性**：若只有第三方判断，不可提升为 \`official\`；只有独立核验可归属的原帖，才可按产品中定义的原文证据类别存储。切勿伪造 \`verified_at\`、\`source_url\` 或事件完成时刻。
3. **储备赠送**：\`group === "credits"\` 与普通 \`reset\` 分开；它不代表所有账号额度立即回满，也不增加全员重置总数。
4. **三条动态**：可从 \`timeline/feed\` 中挑选有效、带原始 HTTPS 来源链接、未撤回的最新条目；提取简短事实标题，不把宣传、玩笑、预告暗示作为完成通知。来源过期时停更和解释。
5. **预计时间**：除非有可核验、明确为未来执行时刻的公告，\`events\` 中**不生成可触发倒计时的 \`reset_announcement.effective_at\`**。频率估计、概率区间、\`time_window\`、普通 \`announced_at\` 不可挪用成 \`effective_at\`。
6. **历史统计**：只有完整且正确的归档覆盖才显示明确“0 次”；否则为“数据不足”。同一事件不同推文、不同修订要聚合，不能仅依日期粗暴去重（同日也可能多次）。
7. **来源与价格**：展示第三方数据时必须有同页可见的 \`数据：codex-reset.com\` HTTPS 链接；允许用户在详情看到原帖。若以后收费，需再次审查最新数据授权、分销声明与商业资格，不能暗示是官方服务。
8. **健康与时间**：上游发布检查时间、确认事件时间、Bridge 抓取时间、App 最近请求时间分开；429 遵循 Retry-After，其他失败作退避，旧快照失效禁止自动推送。

### 2.2 不能直接使用第三方 /api/forecast 作为 Go FeedURL

\`feed.Client.Fetch\` 调用 \`events.Decode\` 校验 OpenDesk 自有格式。第三方 \`/api/forecast\` 缺少 \`schema_version\`、\`channel_id\`、\`feed_version\`、\`events\` 等字段。直接填 URL 会得到 \`invalid_feed\`。正确做法是在独立 Adapter 中转换并签发**已验证**的 Feed；Go 客户端继续消费已有规范。

## 3. UI 下一步：从视觉 Mock 走向真实数据

C3 是纯视觉互动版，下一版（建议 C4）在保留 C3 的基础上建立**真实数据/模拟数据明显隔离**：

| 数据场景 | 卡片主内容 | 详情和通知 |
| --- | --- | --- |
| 已验证未来准确公告时间 | 显示时间及倒计时，注明来源 | 根据公告版本做计划与撤回 |
| 无确定未来时间，只有最后重置记录 | **“下一次时间待公布”**，补充“最近一次重置”的当地时间 | 展示历史；**不推送未来倒计时** |
| 只有实验性 24/48h 概率 | 不作为准确倒计时；若展示标为“历史估计/低置信度” | 仅资讯/概率，无完成提醒 |
| 已确认历史重置 | 显示“已确认（历史）”与原文证据 | 保留事件，避免重复推送 |
| 储备重置或额度赠送 | 独立“储备/赠送”消息，非全员重置完成 | 查看适用范围与是否已生效的证据 |
| 来源过期/异常/无数据 | 暂停预测与提醒，显示“数据不足/来源异常” | 不从 0 个记录推断真的没有重置 |

顶部胶囊入口目前仍是用户未最终确认名称的「记录与动态」，用于查看**概览（最近 30 天/本月）/ 历史时间线 / 资讯来源**。更直观的候选「历史与动态」可在用户确认后单独修改，不擅自更名。

## 4. 分阶段实施顺序和明确的验收退出条件

### R2.4-A：公开源最小可运行探针（优先）

- 独立小型读取脚本（建议 Go 标准库或 Node 无新依赖，只作 Collector 的探针，不编入常驻客户端）实际 GET 四个公共 API，保存**脱敏的静态 fixture**（如原帖有版权仅保留允许的最小摘要与字段），记录响应时间、状态、字段缺失、Last-Modified/ETag/Cache-Control/Retry-After、字段 null。
- 具备固定样例、404/429/500/超时、重复事件/撤回、旧版本及缺乏官方来源的负向测试。禁止把 API POST、站点隐藏接口、Cookie、浏览器人工登录作为生产方案。
- 输出字段映射验收表和实测日志到 \`.runtime/tests/desktop-reset-clock/r24/\`，不得提交日志。非官方信号只能走资讯或待审核。

### R2.4-B：独立 Bridge 与 Feed 合同

- 在明确的独立服务目录创建 Provider Adapter，而非直接放入 \`internal/desktop\`。
- 转成现有 Snapshot + 独立 History 归档 + News；保证固定 channel、\`feed_version\` 语义单调、\`revision\` 修订、撤回 tombstone、源证据链接、完整度声明、归档分页一致与 ETag。
- 自动化测试用本地 Mock Server，不依赖公网稳定性；端到端通过现有 \`feed.Client\`、\`history.Analyze\`、\`news.Top\` 的测试，而不修改现有验证规则来迁就错误数据。
- 官方未来时间缺失时 \`events\` 不生成假未来有效事件。

### R2.4-C：真实数据驱动的 HTML C4

- 新建 C4 预览，不覆盖 C3；以真响应 + 固定模拟数据切换验证所有状态，保留 386px 高质量渐变 Hero 与三条常显。
- 如果 C4 的浏览器直接请求上游公开 API，应只用于**开发预览**并遵守 API 条款；正式客户端只消费 Bridge 的 Feed。
- 分别评审真实性、UI/UX、视觉、信息密度、状态退化、来源可追溯、响应式及无障碍，真实截图证据后才可以给对应维度“≥95”结论。

### R2.5：Go 原生卡片迁移（需用户确认视觉）

- 先确认 C3/C4 视觉与真实数据状态，再移植 AppKit/Win32。原生 GOAL \`docs/plans/desktop-reset-clock-r23-approved-hero-native-goal.zh-CN.md\` 的指定原型还是 **C 版**，此文件是过期基线，必须在开始原生实现前**显式更新**到最终批准的 C3/C4；另需遵守用户已删除的推广角标要求。
- Mac/Windows 实窗、100/150/200% 缩放、长中文、锁定点击穿透、托盘、通知等单项独立验收。两端无实机不可声称通过。

## 5. 本轮交付与未完成边界

- **本轮已确认**：最新 C3 HTML、内嵌 WebP、六场景/Free/模拟 Pro 选项存在于仓库 \`master\`；公开 API 文档、接口实际 JSON 与自有 Feed 源码契约已经查验；调用方式及约束写在本方案中。
- **本轮没有声称**：完成 Collector 实现、真实 Bridge 部署、上游授权采购、全量历史校对、Chrome 完整交互截图、Go 原生 UI 移植或生产付款。
- 下一轮应先做 **R2.4-A**，而不是直接修改大卡片的倒计时为一个预测数字。

## 6. 外部参考

- https://tiboreset.com/zh
- https://tiboreset.com/terms
- https://tiboreset.com/developers
- https://codex-reset.com/developers
- https://codex-reset.com/terms
- https://codex-reset.com/api/forecast
- https://codex-reset.com/api/timeline
- https://codex-reset.com/api/feed
- https://codex-reset.com/api/status-history
- https://didreset.com/zh/api-docs
- https://codex.markets/zh/docs/api
