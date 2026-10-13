# OpenDesk Reset Clock · Go 桌面客户端演示

> 状态（2026-10-12）：**R2 已新增历史归档、三条动态、Free 高级提醒试用与模拟会员/订单、macOS/Win32 独立详情窗口源码；真机视觉仍待验收**。这不是官方实时公告源，也不是已发行、已签名的 macOS / Windows 产品。桌面实窗、托盘系统权限、多屏、休眠与 Explorer / Spaces 稳定性尚待对应真机验收。

## 一条命令运行 V1 → V2 → V3 演示

在 **OpenDesk 仓库根目录**执行：

```bash
(cd examples/desktop-reset-clock && go run ./cmd/demo)
```

- 需要 **Go 1.22+**；不要求安装 OpenDesk Runtime、Codex CLI、Node 或额外 Go 依赖。macOS 原生窗口需要系统 Xcode Command Line Tools / CGO。Windows 提供原生 Win32 卡片、通知区域菜单和设置窗；Linux 构建用于协议/提醒测试，仅提供控制台降级显示。
- Demo 在 `127.0.0.1` 的随机端口启动**受控合成 HTTP Feed**，终端打印 `模拟控制页面` 地址。将这个地址复制到浏览器，即可点击 V1 / V2 / V3 / 过期 V4，也可从 macOS / Windows 托盘选择 `模拟公告 V1/V2/V3`。
- 选择 **V1**：看到「【模拟数据】」标签、三天前的发布时间、未来约 40 分钟的预计时间和实时倒计时，**不会补发三天前的新公告推送**。
- 选择 **V2**：点击托盘「立即刷新」（或等待默认 5 分钟轮询），相同 `id` 的 `revision` 由 1 → 2、`feed_version` 由 1 → 2，预计时间改为启动后约 90 分钟；旧提醒计划取消并建立新计划。
- 选择 **V3**：再刷新，`revision` 变为 3、`state=withdrawn`；卡片显示已撤回，不保留倒计时，不触发旧提醒。
- 可切换控制页「模拟无变化（304）」和「启用正常上游检查（200）」：304 只更新客户端有效检查时间；200 无公告变化但可更新**上游检查时间**。
- V4 用于已过期历史事件；版本号有意单调，**从 V3/V4 倒回 V1/V2 会因版本倒退被拒绝**。重跑 Demo 即重置 Mock 版本（随机端口产生独立 Feed 身份），无需清理生产缓存。
- Demo 状态文件：仓库根 `.runtime/tests/desktop-reset-clock/demo-state.json`，不应提交。Linux 控制台仅打印状态变化；真实交互窗口须在 Mac/Windows 运行。

## R1.1 原生界面与交互（2026-10-12）

- **桌面卡片（386 × 260 逻辑尺寸）**：本地时间与时区、公告状态、主要倒计时或撤回文案、公告摘要、发布时间和预计重置时间、来源健康状态。无有效事件时显示“暂无确定的下一次重置”；撤回后移除倒计时。模拟源一直明确标记为模拟数据。**截至 R1.1，历史记录、三条动态与会员支付尚未实现；R2 新增部分见本文件末尾**。
- **macOS**：AppKit 原生无焦点桌面卡片与状态栏菜单；设置页集中提供 Feed URL、立即刷新、原始公告链接、提前 10 分钟提醒、免打扰、手动提醒、显示/锁定、24 小时制；默认折叠高级诊断。
- **Windows**：Win32/GDI 独立字号绘制而非同一个多行文字区；原生通知区菜单、设置页同样提供开关及来源链接。保留 WorkerW 尝试与非置顶回退；来源链接严格使用受验证的 HTTPS 事件 URL。
- **准确性约束**：来源最近检查、客户端最近检查和公告内容变化独立显示；`withdrawn`、无确定时间或来源过期不得伪造未来倒计时；锁定状态保持点击穿透。卡片不承诺能够点击“详情”，请从托盘/设置页选择“打开原始公告”。
- **设计对照**：`prototypes/r11-card-settings.html` 可直接用浏览器打开，切换 R1 与 R1.1、macOS/Windows、V1/V2/V3/过期/无事件。它是视觉基线，不是软件真实实窗截图，也不连接数据源。R1.1 原生窗口的 100%/150%/200% 缩放、多屏与辅助功能必须在各平台继续测试。

## 使用自己的 HTTPS Feed

在同一示例目录下：

```bash
go run ./cmd/desktop-reset-clock -feed 'https://YOUR-OWN-TRUSTED-SERVER.example/events.json'
```

上述 URL **仅是需替换的占位符**，没有配置任何官方在线服务。设置窗中也可以输入正式 HTTPS Feed URL 并保存刷新；仅显式 `-allow-local-http` 或 Demo 开启本机回环 HTTP。认证、Cookie、浏览器登录采集均不在本模块内。用户名、密码形式的 URL 会被拒绝；请勿将密钥放进 URL 参数或公开日志。

简化 JSON 契约（以下是*虚构格式*）：

```json
{
  "schema_version": 1,
  "channel_id": "example-public-channel",
  "feed_version": 1,
  "generated_at": "2026-10-12T07:00:00Z",
  "source_health": {"status": "ok", "last_checked_at": "2026-10-12T06:59:00Z"},
  "events": [{
    "id": "stable-001", "revision": 1, "type": "reset_announcement",
    "state": "active", "audience": "all_users",
    "source_published_at": "2026-10-09T07:00:00Z",
    "verified_at": "2026-10-12T06:59:00Z",
    "effective_at": "2026-10-12T08:00:00Z",
    "source_url": "https://example.org/illustrative-source",
    "summary": "演示用途，请不要视为真实公告"
  }]
}
```

- 一个 Feed 是同一 `channel_id` 的**完整事件快照**，不能删除旧事件而不留下 `withdrawn` 墓碑。旧版事件必须增加自己的 `revision`；Feed 中任意事件变更，`feed_version` 也要递增。撤回时 `effective_at: null`。
- 只有 `reset_announcement`、`active`、`all_users` / `public`、明确 `effective_at` 和 `verified_at`、且上游确实最近检查（30 分钟内）才建立自动公告提醒。其他适用范围仍显示公告，但不会暗示个人账户符合资格。
- `generated_at` 是 Feed 生成时间；`source_health.last_checked_at` 是提供方实际上游检查时间；两者不可互换。HTTP 200/304 **不能**自行证明来源最近检查过。
- 300 秒轮询；15 / 30 / 60 分钟来源新鲜度预警门槛是演示默认值，真实部署需根据来源 SLA 调整。401/403 暂停自动轮询；429 遵守 Retry-After；失效来源停止新的自动公告通知；离线显示最后有效缓存。
- 提醒有到时、可选提前 10 分钟、手动 10 分钟及免打扰；允许约 90 秒的睡眠恢复补偿，不重放更旧的提醒。Mac 系统通知权限需从菜单显式申请；Windows 使用系统通知区域提示。**系统是否展示通知仍依赖 OS 权限与打包身份。**
- 公告预计时刻到来不等于来源已经宣布完成，更不等于**用户个人 Codex 额度已经恢复**。

## 代码与测试

- `cmd/demo/` / `internal/mock/`：开发 Mock（独立于产品数据采集），回环控制页、HTTP V1/V2/V3。
- `cmd/desktop-reset-clock/`：正式单一程序入口，可配置 HTTPS Feed。
- `internal/feed/`：超时、重定向、条件 GET、上限 2 MiB、状态码与 JSON 校验。
- `internal/events/`：schema、稳定 ID、revision、版本冲突与撤回。
- `internal/health/`：HTTP、有效 Feed、上游来源、内容变化四条独立时间轴。
- `internal/settings/`：用户配置目录的权限受限 JSON 缓存与原子替换；无 SQLite。
- `internal/reminder/`：可撤销计划、跨重启去重、手动提醒与过期跳过。
- `internal/clock/`：UTC、IANA 时区、DST、基于绝对时刻计算倒计时。
- `internal/app/`：后台 5 分钟轮询、持久化优先、动作响应与 UI 状态。
- `internal/desktop/`：共享 `Display` 结构化卡片状态、macOS AppKit CGO / Windows Win32 分区绘制、通知区与设置；按 Go build tags 隔离。不引入其他 GUI 框架或 OpenDesk App Mode/Runtime。

在 **`examples/desktop-reset-clock/`** 工作目录执行：

```bash
go test ./... -count=1
go test -race ./... -count=1
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -o ../../.runtime/tests/desktop-reset-clock/reset-clock-windows.exe ./cmd/desktop-reset-clock
```

首次跨编译前请创建 `.runtime/tests/desktop-reset-clock/`。Win64 编译通过**不等于 Windows 实际桌面验收通过**；Linux 无法直接编译 `AppKit`/Objective-C，需要在 Mac 运行 `go build ./cmd/desktop-reset-clock` 并实测。正式无控制台 Windows 发行版可使用 `-ldflags '-H=windowsgui'`，但请先完成普通测试构建与真机日志核查。

## 产品质量现状及后续 Codex 真机验收

- **VERIFIED（当前环境）**：Go 单测/HTTP Mock、Linux 构建/控制台 Demo、Windows amd64 交叉编译（见当次交付报告，不能替代用户电脑复验）。
- **IMPLEMENTED_UNVERIFIED**：R1.1 AppKit 与 Windows Win32 独立分区排版、来源 HTTPS 直达、托盘菜单选中态、设置页可操作开关和诊断折叠；Mac 通知中心、Windows WorkerW/Explorer、系统级单实例与位置恢复仍需实机交互验证。
- **NOT_TESTED**：Mac 真机 CGO 编译、Mac/Windows UI 截图、实际 100%/150%/200% DPI 排版、系统通知拒绝、锁定点击穿透、多显示器、时区切换、系统休眠 24h、Explorer 重启、安装升级卸载及资源占用。
- **BLOCKED**：真实官方 Feed 的 URL/授权证明尚未提供，无法声称真实官方公告已接通；两平台签名安装包未制作。

本轮测试产物统一放在仓库根 `.runtime/tests/desktop-reset-clock/`。正式视觉与行为验收须记录命令、VCS HEAD、进程来源、OS 版本、权限、截图/录像、通知权限及失败复现；不得把模拟 HTTP 单测当作真机验收。

## R2 新增：本地真实代码使用方式

**用户目标**：基础 386×260 桌面时钟永远存在；在 macOS 状态栏或 Windows 通知区菜单中选择 **「历史统计与三条动态」** 打开独立的原生详情窗口，不需要挤入时间卡片。状态页展示滚动 30 天、当前自然月、三条最新且未撤回的精选简讯、原始 HTTPS 来源及 Free/Pro 权益；资源资料是外部官方文档链接，不是外部账户购买。两系统此 UI 已实现源码，尚无本机原生截图/通知实测证据。

在 **仓库根目录**执行唯一演示入口：

```bash
(cd examples/desktop-reset-clock && go run ./cmd/demo)
```

Demo 启动后：打开终端给出的回环控制页面，切换 V1 → V2 → V3，返回应用菜单点 **立即检查来源**，最后打开 **历史统计与三条动态**。

**详情选择器**：历史统计区有“选择具体证据 → 打开选中来源”，Free 可以查看官方预告/完成记录的原文，模拟 Pro 还可查看赠送与用户观察来源；资讯区的三条正文下方提供完整资讯下拉列表，包含已撤回、来源失效项（状态明确标注），不会把墓碑当成有效三条资讯。选择后通过 HTTPS 原文按钮打开来源。本地 HTTP `/feed` 含模拟事件 + 3 条资讯，`/archive` 含约 65 天覆盖声明、两页历史（包括更正和撤回），不是实际官方消息，不能推断个人账户额度。V2 模拟新闻修订，V3 撤回一条编辑分析；你可点击每条 HTTPS 原文（均为虚构 `example.org` 演示链接）。

详细页在 Demo 模式可点 **启用模拟 Pro · 不收费** 和 **模拟退款 / 撤权**；真实客户端无这两个模拟按钮，更不会因本地模拟订单获得生产会员。Free 永久显示桌面时间与来源状态，并保留**到时提醒**；每个不同的**提前 10 分钟高级提醒**只在应触发且允许提醒时消耗一次试用额度（共 2 次）。刷新/重启同一 ID 不重复扣除；试用耗尽不关闭基础时间或基本提示。演示的 Mock 订单可在 Go 单测中覆盖取消、到期、恢复、退款及重复回调。正式收费/签发尚未开发。

### 自有可信历史归档接口（向后兼容）

R1 完整 `events.json` 仍兼容。可选在主 Feed 的一级对象追加：

```json
{
  "history_url": "https://YOUR-OWN-TRUSTED-SERVER.example/archive",
  "history_version": 2,
  "news": [
    {
      "id": "update-001", "revision": 1,
      "title": "演示用标题", "summary": "演示用说明",
      "published_at": "2026-10-12T01:00:00Z",
      "updated_at": "2026-10-12T02:00:00Z",
      "source_url": "https://example.org/demo",
      "category": "information", "source_type": "third_party",
      "state": "active", "verified_at": "2026-10-12T02:05:00Z"
    }
  ]
}
```

注意：该对象**仅是追加字段示意**，正式请求仍需要原有 `schema_version/channel_id/feed_version/generated_at/source_health/events`。`history_url` 与 Feed URL 必须完全同源（协议、主机、端口），且随 `history_version` 一同提供；每次主 Feed 公告/资讯/历史版本变化时都必须按旧协议增加 `feed_version`。

归档 `GET /archive` 返回 JSON，`?cursor=<上页 next_cursor>` 获取后续页：

```json
{
  "schema_version": 1,
  "channel_id": "example-public-channel",
  "archive_version": 2,
  "coverage_start": "2026-08-01T00:00:00Z",
  "coverage_end": "2026-10-13T00:00:00Z",
  "complete": true,
  "records": [{
    "id": "record-001", "revision": 1,
    "kind": "reset_completed", "state": "active",
    "source_type": "official", "audience": "public",
    "source_published_at": "2026-09-27T00:00:00Z",
    "confirmed_at": "2026-09-28T08:00:00Z",
    "verified_at": "2026-09-28T08:10:00Z",
    "source_url": "https://example.org/demo-evidence"
  }],
  "next_cursor": ""
}
```

归档需供应方明确提供至少涵盖请求窗口的 `complete=true` 时段声明，不能把客户端历史缓存当权威归档；修订同一 ID 保留不同 revision，最终撤回事件从当期统计排除。第三方或用户观察不可伪称官方。完整字段与安全约束见 `docs/plans/desktop-reset-clock.md` 第 13 节。

### R2 自动化与真机验收

在 **`examples/desktop-reset-clock/`** 工作目录执行：

```bash
go test ./... -count=1
go test -race ./... -count=1
go vet ./...
go build ./cmd/desktop-reset-clock
```

跨平台构建交由 GitHub Actions 工作流 [Reset Clock Standalone R2](../../.github/workflows/reset-clock-ci.yml) 在 Linux/macOS/Windows 分别执行；`macos-latest` 用带 CGO 的 AppKit 构建，仅证明可编译，不等于 WindowServer 中成功绘制。可操作本机需要手动运行 Demo 并查看真实窗口，特别核对 100/150/200% 缩放、字体截断、无权限通知、锁定点击穿透、菜单 HTTPS 来源点击、后台进程继续运行。必要截图与诊断存放**仓库根** `.runtime/tests/desktop-reset-clock/r2/`，不提交这些临时文件。

**生产支付：BLOCKED**（0.99 币种未定；商户、合规、服务端签名权益均不存在）。**外部官方实时数据：BLOCKED**（未提供授权 Feed）。**系统级 Mac/Win 实窗与安装包：NOT_TESTED**。不得用上述 synthetic Demo 或 HTML 视觉原型冒充这些验证。 


**R2 CI 验收证据**：应用代码提交 [`e4ee31a`](https://github.com/shopable-ai/opendesk/commit/e4ee31a22398c556fb3e3cea2f318a395cfc170f) 的 [GitHub Actions Run 38238616386](https://github.com/shopable-ai/opendesk/actions/runs/38238616386)：Linux/Windows Go 测试、Vet、构建和 Linux Race / Windows amd64 交叉编译 / macOS arm64 无 CGO 降级构建已成功；**原生 macOS AppKit 工作仍等待 Runner，不能把无 CGO 构建当作 AppKit 编译成功**。两平台原生真机行为、通知和安装包仍 NOT_TESTED。


### R2 独立可交互 HTML 视觉预览

打开 `prototypes/r2-client-preview.html`，不需要编译或连接任何服务器。该文件以真实 R2 共享展示字段及 386×260 桌面卡片尺寸为依据，离线切换 V1/V2/V3 与 Free/模拟 Pro，呈现「常驻时钟 + 历史统计/三条动态独立详情窗口」的信息架构。**这是合成的 HTML 设计审阅工具，不是 AppKit/Win32 实际渲染或真机验收证据**；真机依然运行上面的 `go run ./cmd/demo`。


### R2.2 原型优化（仅 HTML，原生实现尚待审阅）

- **优先审阅：** `prototypes/r22-client-preview.html` —— 保留 `r2-client-preview.html` 作为旧版对照；R2.2 不要求安装 Node/Electron，直接浏览器打开。
- 常驻卡片保留 386px 宽、动态内容高度；去除系统当前时钟及秒级倒计时，改成“预计重置 + 小时/分钟 + 来源状态 + 一条轮播资讯”。资讯 6 秒轮换，支持上一条/下一条和原位展开全部有效资讯，支持键盘、悬停暂停、减少动画、撤回/异常/无数据场景。
- 独立详情改名“记录与动态”，将概览、历史记录、资讯分栏；统计按最近 30 天/自然月切换，预告/确认/赠送/用户观察分开标注，来源归档不足显示“数据不足”；取消主视图中高干扰的商业按钮，会员状态仅作为次级信息。
- **状态边界：** 这份原型未接入真实 Feed，不等于已将布局应用到 `internal/desktop/native_darwin.m` 或 `native_windows.go`。锁定点击穿透时不能直接点击卡片展开控件，实际产品必须通过状态栏/通知区菜单或解锁入口实现等价能力。下一阶段需取得设计确认后再修改原生 UI、独立截图验收。


## R2.2：紧凑常驻卡片与「记录与动态」（2026-10-12）

> **本节覆盖旧 R1.1/R2 的界面描述，旧原型和先前文字保留作历史对照。** 代码已在 `master` 实施；正式使用仍以最新 GitHub CI 和真实 macOS/Windows 实窗复验为准。不存在真实官方来源授权或正式 Pro 付费许可。

### 用户现在应看到的界面

- **桌面卡片：386 × 202 逻辑像素（展开时约 386 × 334）**。仅显示 Reset Clock、来源状态、到预计重置的剩余**天/小时/分钟**与预计本地时间；不展示当前系统时钟，不展示精确到秒的倒计时，不暗示个人额度已恢复。公告被撤回或来源失效时不提供可行动的未来倒计时。
- **动态：默认单行**；从经过校验的 Feed 缓存中最多挑选三条有效新闻，6 秒切换，手动前后翻页；原位展开最多三条、逐行限定。已撤回/来源失效项只保留在历史资讯列表中，来源健康异常不再播报实时有效动态；正常轮播不额外发 HTTP 请求。展开开关保存到原 `state.json`。
- **鼠标与锁定**：macOS 通过卡片悬停暂停轮播；Windows 解锁卡片时通过鼠标进入/离开暂停。卡片默认点击穿透，解锁后可点击卡片控件；始终可通过 macOS 状态栏 / Windows 托盘菜单翻页或展开，不要求解除锁定。
- **详情窗口更名为「Reset Clock · 记录与动态」**，分为概览、历史记录、资讯三个原生页面。概览支持最近 30 天/本月，预告/完成/赠送/用户观察分别计数，未知写「数据不足」而非零；Free 的赠送及用户观察显示「未开放」，模拟 Pro 可查看。历史保留修订/撤回证据及选择跳转，资讯保留已失效状态及原始 HTTPS 链接，页面首屏不堆砌会员推广。

### 从已有 R2.2 HTML 核查布局

```sh
# 在本地 master 仓库根目录运行：直接打开原始 HTML，无需 Node/Electron
open examples/desktop-reset-clock/prototypes/r22-client-preview.html
```

单文件原型提供 预告/更正/撤回/来源异常/无数据/长标题、Free/模拟 Pro、默认/展开、30 天/本月及三个详情页的切换。R2/R1.1 对照仍在 `prototypes/`。原型使用合成来源；它不会连接真实账号或产生正式订阅。

### 本地 Codex 真机验收（本轮尚不得声称完成）

```sh
cd examples/desktop-reset-clock
go test ./... -count=1
go test -race ./... -count=1
go vet ./...
go build ./cmd/desktop-reset-clock
# macOS 上直接运行 Go Demo 会创建原生 AppKit 窗口；Windows 为原生 Win32 窗口
go run ./cmd/demo
```

验证时必须记录对应 HEAD、OS、显示缩放、收起/展开、三条轮播、菜单操作、来源失效、Free/Mock Pro、长中文和 100%/150%/200% 的实窗图、焦点/无障碍、WorkerW/Spaces/多屏/休眠，并将截图、终端输出仅放到 **仓库根** `.runtime/tests/desktop-reset-clock/r22/`，不要提交。GitHub Actions 的 Go 编译通过不能替代实窗截图，也不能称为 Mac/Windows 真机可用性验收。真实可信 Feed 与权益签发仍为 `BLOCKED`。


### R2.3 C 用户确认的渐变 Hero 视觉基线（2026-10-13）

**重要：下述是已确认的 HTML 视觉原型，不代表原生客户端已经同步改版。** 原 R1.1、R2、R2.2、R2.3 A/B/B2 原型与既有 Go 代码继续保留。

- 最新获用户确认的可交互预览：prototypes/r23-c-approved-hero.html。
- 图片资源唯一来源：internal/desktop/assets/r23-reset-clock-wallet-promo.jpg（从批准的效果图提取的小尺寸、离线可读 JPEG，未来可用 Go embed）。
- 卡片宽 386 逻辑像素基线、深青绿渐变和自然融合的右侧 Banner、近白主数字和薄荷色单位、顶部「记录与动态 ›」胶囊入口、日期在左的三条常显资讯；普通预告隐藏多余状态角标。
- 支持 HTML 中的模拟预告、修订、撤回、来源异常、无数据、超长标题、Free/模拟 Pro、Banner/纯渐变两种视觉模式及独立详情三页。卡片的动态数据是合成示例，不能被当成真实官方下一次重置时间。
- Banner 中「账号充值 / 安全稳定 / 快速到账」为演示广告内容，带「推广 · 示意」标识；不代表存在正式支付或充值交易服务。
- 真实实现 GOAL：docs/plans/desktop-reset-clock-r23-approved-hero-native-goal.zh-CN.md（从仓库根目录引用）。下一轮才修改 AppKit/Win32；不要再重新设计未经确认的 UI。

从 OpenDesk **仓库根目录**执行以下一条命令，仅在浏览器预览静态 HTML，不需要 Node/Go 构建：

    open examples/desktop-reset-clock/prototypes/r23-c-approved-hero.html

macOS/Windows 原生视觉仍需要独立实窗截图、键盘/读屏与 100/150/200% 缩放验收。截图日志仅保存在仓库根 .runtime/tests/desktop-reset-clock/r23/，不要提交。

### R2.3 C2 ChatGPT 会员 Banner 视觉预览（2026-10-13）

- **最新 C2 视觉预览**：`prototypes/r23-c2-approved-hero-chatgpt-member.html`。继续保留 `prototypes/r23-c-approved-hero.html` 作为用户确认的 C 版基线，**没有修改原生 AppKit / Win32**。
- **新图片素材**：`internal/desktop/assets/r23-chatgpt-member-banner.svg`。使用透明 SVG（非不透明 JPG），以渐变、高光、斜置半透明会员卡及边缘柔化实现与深青绿卡片的自然融合；「ChatGPT账号会员」「购买」「开通」文字均**绘制在图片文件内**，不是页面覆盖按钮。旧 JPEG 继续保留用于 C 版。
- **沿用交互**：有效预告、更正、撤回、来源异常、无数据、长标题；Free / 模拟 Pro；推广 Banner / 无广告纯渐变；独立详情页及最近 30 天 / 本月切换。卡片继续按约 386px 展示高对比倒计时与日期在左的最多三条常显动态，无轮播、展开或额外资讯标题栏。
- **使用方式**（从仓库根目录，在 macOS）：

  ```bash
  open examples/desktop-reset-clock/prototypes/r23-c2-approved-hero-chatgpt-member.html
  ```

- **仅为静态视觉示意**：图片中的购买、开通是平面设计内容，**没有真实账号销售、充值、订单、支付、自动开通或 OpenAI 官方合作保证**。HTML 未连接真实 Feed；原生客户端仍沿用旧实现。若未来产品上线相关服务，须独立完成资格、信任与交易信息核验。


### R2.3 C3 高还原参考图版（2026-10-13）

- **最新浏览器预览**：`prototypes/r23-c3-reference-inspired-hero.html`（直接在本机浏览器打开，完全离线）。依据用户上传的「重置时间预览效果.png」高质感渐变效果图改进，作为新的**视觉候选**而非覆盖 C/C2 的已确认记录；此前版本保留。
- **Banner 资源**：源素材仍独立保存在 `internal/desktop/assets/r23-c3-reference-hero.webp`（约 12 KB）；**预览 HTML 已把其 WebP 字节作为 `data:image/webp;base64,...` 内嵌到 `<img>` 中**，只下载这一个 HTML 也能离线显示右侧城市/钱包/金币发光场景。图片文案「ChatGPT账号会员 / 购买 / 开通」是视觉示意；C3 卡片不再显示「推广 · 示意」悬浮角标，非官方/模拟声明保留在预览说明与页脚。旧 C/C2 文件不修改。
- **可见修订**：卡片维持 **386px 宽**，参考图中的深青绿渐变、青蓝光影、自然曲线、左侧亮白数字/薄荷色时间单位、紧邻品牌的「记录与动态」胶囊；下方只有**日期在左、标题在右的最多三条常显动态**，压缩冗余纵向空间，不恢复轮播、展开或新标题栏。
- **功能继续继承**：C2 的有效预告、更正、撤回、来源异常、无数据、长标题、Free / 模拟 Pro、Banner / 纯渐变、历史与资讯详情及统计范围切换。仅移除 C3 已删掉的悬浮角标 DOM/样式和对应 JavaScript 引用，其余交互功能保持不变。顶部「记录与动态」用于展开/收起独立详情，查看最近 30 天/本月的分类概览、事件更正/撤回历史以及来源资讯；卡片上仍只保留三条简讯。按钮文案尚属设计候选，待用户确认。
- **从仓库根目录打开**（macOS）：

  ```bash
  open examples/desktop-reset-clock/prototypes/r23-c3-reference-inspired-hero.html
  ```

- **阶段边界**：此文件只检验视觉与 HTML 交互；它没有接入真实公告、账户余额、支付、购买、自动开通或 OpenAI 官方服务，亦**未修改 AppKit / Win32 或 Go 客户端**。原生实现应在用户批准 C3 视觉及真实浏览器各状态截图验收后另行推进。


### R2.4 公开重置数据源与接口调查（2026-10-13）

**研究结论已保存**：`docs/plans/desktop-reset-clock-public-source-r24.zh-CN.md`。用户提供的 `tiboreset.com/zh` 明确推荐通过 `codex-reset.com` 的公开只读 API（`/api/forecast`、`/api/timeline`、`/api/feed`、`/api/status-history`）复用数据，而不是抓取 HTML 或使用账号 Cookie。上游有可见署名、User-Agent 和最多每分钟一次请求等要求。

**必须注意**：这不是能够直接输入 Go 客户端 Feed URL 的同构接口，当前客户端需要独立上游 Bridge 映射为既有 Snapshot/History/News 契约；没有明确未来公告时间时，不能把预测概率/历史间隔变成精确倒计时。C3 仍只是离线模拟 HTML，Go 客户端未因此获得真实数据功能。下一步先运行 R2.4-A 真实 API 探针与字段测试，再做独立 Bridge、C4 数据预览，最后经视觉确认进入原生实现。
