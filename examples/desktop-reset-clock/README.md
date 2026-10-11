
# Desktop Reset Clock — Demo 入口

> **状态：PROPOSED，仅文档；尚无可运行的 Go 程序。**

## 从哪份文件开始？

- **[阅读产品架构与功能树](../../docs/plans/desktop-reset-clock.md)**
  - F01–F03：外部数据源、HTTP 获取、事件协议。
  - F04–F06：当前时间、时区、提醒引擎。
  - F07–F09：最近检查时间、健康状态、本地缓存。
  - F10–F11：macOS / Windows 桌面卡片、托盘和设置。
  - F12–F14：可选外部转换、个人额度与商业授权。
  - F15–F16：测试和正式发行。
- **[阅读审计与 95 分门槛](../../docs/quality/desktop-reset-clock/design-review.md)**
  - 文档静态评分与软件真实验收是两回事。
  - 每项功能都有验收项；未运行不得写成通过。

## 一句话原则

**先获得可信的外部 HTTPS JSON，再做 Go 桌面时钟。**如果来源能直接返回有效 JSON，不再开发采集器、Cookie 池、数据库或后台框架。没有真源时先用明确标注的合成事件完成客户端 Demo。

## 后续落地顺序

- **阶段 0：**确认来源、协议和范围。
- **阶段 1：**HTTP 200/304/拒绝/超时验证。
- **阶段 2：**Go 时间、健康状态、缓存与提醒测试。
- **阶段 3：**Mac / Windows 桌面真机验证。
- **阶段 4：**最小 Demo 和可靠性 Beta。
- **阶段 5：**有实际用户价值后才讨论试用、价格和发行。

## 约定目录（目前未创建）

- `cmd/desktop-reset-clock/`：Go 桌面程序入口。
- `internal/feed/`、`internal/events/`：HTTP 协议与事件。
- `internal/health/`：不同来源的检查时间与异常状态。
- `internal/clock/`、`internal/reminder/`：时间与通知。
- `internal/desktop/`、`internal/settings/`：平台行为与配置。
- `fixtures/`：HTTP、事件改期与过期测试样本。

这个 Demo 是独立 Go module 的计划，不是当前 OpenDesk 的 JavaScript App Mode package；尚无启动命令、签名包、真实数据源或运行验收。运行日志与截图在开发后存入仓库根目录的 `.runtime/tests/desktop-reset-clock/`，不提交密钥和生产内容。
