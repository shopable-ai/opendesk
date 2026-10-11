# Desktop Reset Clock

**状态：设计阶段 / PROPOSED。当前目录没有可运行应用。**

这是拟在 OpenDesk 仓库内开发的独立 Go 桌面 demo：为 macOS 与 Windows 提供当前时间、时区换算、Codex 用量重置时间和桌面提醒。

用户要求先确认整体方案，再写代码。本次只提交说明文档，不包含 Go module、UI、安装包、测试通过记录或收费功能。

## 从这里开始

唯一方案与验收定义：

[Desktop Reset Clock 整体方案](../../docs/plans/desktop-reset-clock.md)

该文档包含：

- 用户需求、首版范围与尚待确认的币种 / 收费规则。
- 已有 App Shell 和 Codex 适配的真实复用边界。
- Go 核心、额度读取、桌面呈现、设置 UI 与权益模块的职责。
- macOS / Windows 桌面背景行为的可行性门槛。
- 时间、时区、缓存、休眠和提醒去重规则。
- 文档驱动实施步骤、需求 ID 和验收矩阵。

## 获准实施后的目录原则

- 作为独立 Go module 开发，业务规则由 Go 管理。
- 不依赖完整 OpenDesk 自动化 Runtime，不修改 Browser RPC 白名单。
- 优先验证原生桌面组件与真实 Codex 额度读取。
- GUI 框架、平台代码与版本在可行性验证后固定。
- 设置窗口可用 Wails；桌面卡片优先原生绘制。
- 试用与授权先模拟，商业闭环在日常使用 Beta 之后实现。
- 不因为存在本目录就加入默认发行包或可运行示例 catalog。

预定源码入口为本目录的 `cmd/desktop-reset-clock/`，但当前尚未创建。不要尝试以 `opendesk -script` 运行本目录；它不是现有 JavaScript App Mode package。

## 运行与验收

当前没有启动命令。首个可运行提交必须补充：

1. 开发环境与已验证的 Go / GUI / Codex 版本。
2. 明确工作目录和可直接复制的一行开发命令。
3. macOS / Windows 原始命令执行结果。
4. 真实桌面、通知、休眠和多屏验收状态。
5. 安装包路径及源码提交来源。

纯 Go 核心使用同包测试；真实平台验收单独记录。临时日志、截图与运行输出归仓库根 `.runtime/tests/desktop-reset-clock/`，不作为源码提交。

## 当前下一步

先确认整体方案中的币种、首次免费、月付或年度结算规则，以及桌面行为定义；然后进入两平台技术验证。
