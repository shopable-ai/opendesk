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

Demo 启动后：打开终端给出的回环控制页面，切换 V1 → V2 → V3，返回应用菜单点 **立即检查来源**，最后打开 **历史统计与三条动态**。本地 HTTP `/feed` 含模拟事件 + 3 条资讯，`/archive` 含约 65 天覆盖声明、两页历史（包括更正和撤回），不是实际官方消息，不能推断个人账户额度。V2 模拟新闻修订，V3 撤回一条编辑分析；你可点击每条 HTTPS 原文（均为虚构 `example.org` 演示链接）。

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
