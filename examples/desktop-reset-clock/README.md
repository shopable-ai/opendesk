# Desktop Reset Clock

**状态：PROPOSED（设计阶段）；当前无可运行程序。**

这是拟放在 OpenDesk 的独立 Go demo：macOS / Windows 桌面时钟、时区换算、Codex 重置公告显示与提醒。**默认不负责采集 X**，只从外部经过授权的数据提供方用 HTTP/HTTPS 取得版本化 JSON Feed，做轻量本地缓存、健康诊断和提醒。

## 文档入口

- [唯一整体方案：外部来源、HTTP 契约、新鲜度与阶段](../../docs/plans/desktop-reset-clock.md)
- [设计审查、质量门槛及未验证事项](../../docs/quality/desktop-reset-clock/design-review.md)

## 开发门槛（按顺序）

1. **先确认数据源**：是否已有合法 HTTPS JSON、接口格式、请求认证与更新频率。支持 200+有效 JSON，及有缓存时的 304；401/403 停止而不是绕过。
2. **直连成功便停**：无需 Go 云采集服务 / SQLite / LLM / Cookie 池 / 审核后台；直接进入 Go 客户端。
3. **数据格式不合格才外部转换**：生产侧将已有 JSON/RSS/其他允许内容生成统一事件文件；不让桌面端解析任意 X HTML。
4. **没有可靠源就先 fixture**：测试时间、桌面、请求与健康提示；不宣称真实同步。
5. **把检查时间说明白**：上次客户端请求、上次有效内容验证、上游来源最近检查、上次公告变化分别显示；后两者不存在时标为未知。
6. **真实平台验收**：Mac / Windows 桌面层级、点击穿透、多屏、通知、休眠；标明测试环境和结果。
7. **Beta 才核定商业化**：至少 30 天来源成本、响应可靠性和用户价值记录，币种与 30 天免费期待确认。

## 预定源码归属（目前尚未创建）

在本目录建立独立 Go module；入口 cmd/desktop-reset-clock/，内部模块 feed/、health/、events/、clock/、reminder/、desktop/、settings/。仅在有实际缺口、且另获授权时考虑外部生产侧 adapter；不默认建立 cmd/reset-clock-server。

正式 Demo 必须补齐一条可直接复制的运行命令和本地真实运行证据；临时结果存仓库根 .runtime/tests/desktop-reset-clock/。本目录不是现有 JavaScript App Mode package，不能用 opendesk -script 运行。

**本次只更新方案，没有编写代码、部署 HTTP 数据源、收集 Cookie、打包安装或完成 95 分的运行验收。**
