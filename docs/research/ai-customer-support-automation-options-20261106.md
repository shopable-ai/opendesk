# AI 客服自动化候选：有限开源调研（2026-11-06）

检索日期：**2026-11-06，Asia/Shanghai**（证据 HTTP 时间为前一日 UTC）。已先读 `AGENTS.md` 与[现有参考](ai-customer-support-references-20261106.md)，本篇仅补充指定自动化候选的官方仓库、许可、平台及维护核对，不重复 RAG/交接调研。不作安装、依赖采用或替换 Runtime 建议，不干预并行原生 gate。

## 简短候选表

“最近提交”为本次默认分支快照的 committer 日期；日期均为 UTC。README/许可固定 SHA，Release 单独核对，**不代表默认分支与发行版完全一致或已实机验证**。

| 官方仓库 / 主要依据 | 许可 | 平台与路径 | 版本、维护与客服相关边界 |
| --- | --- | --- | --- |
| [cluic/wxauto](https://github.com/cluic/wxauto) · [README][wx-readme] | [Apache-2.0][wx-license]；README 同时禁止生产/商业用途，**表述冲突未澄清** | Windows 10/11/Server2016+，微信 3.9.X，UIAutomation；无 macOS 证据 | 最近提交 2026-04-13，未归档，[Release 列表][wx-releases]为空。可参考窗口监听与消息分类；不能当作 macOS 微信方案 |
| [cluic/wxauto4](https://github.com/cluic/wxauto4) · [README][wx4-readme] | **未发现许可**；API `license=null`，tree 只有 README | description 称微信 4.0；当前正文不足以确认平台或实现 | README 全文“**停止更新**”；最近提交 2025-10-27，API 未归档，[Release 列表][wx4-releases]为空。公开可见不等于授权明确的开源实现 |
| [lich0821/WeChatFerry](https://github.com/lich0821/WeChatFerry) · [README][wcf-readme] | [MIT][wcf-license] | Windows 微信 DLL/Hook + RPC 客户端；不是腾讯官方消息 API；无 macOS 原生能力证据 | **已归档**；最近提交 2026-03-21；[v39.5.2][wcf-release] 发布于 2026-03-28，明确配套微信 **3.9.12.51**。仅作历史机制参考 |
| [zhayujie/CowAgent](https://github.com/zhayujie/CowAgent) · [README][cow-readme]（旧 `chatgpt-on-wechat` 地址已重定向） | [MIT][cow-license] | README 有 Linux/macOS/Windows 入口及 macOS/Windows Desktop；消息渠道 API，不是当前桌面微信任意会话控制 | 最近提交 2026-11-05，未归档；[2.2.2][cow-release] 发布于 2026-10-30。当前 `weixin` 与 `wechat_kf` 必须分开，不沿用旧版 itchat 印象 |
| [browser-use/browser-use](https://github.com/browser-use/browser-use) · [README][bu-readme] | [MIT][bu-license]；托管浏览器/模型服务另计条款 | 浏览器 DOM/视觉动作；README 的 Bash 入口为 Linux/macOS，Windows 用 WSL，不能泛化为整个库的平台限制 | 最近提交 2026-10-30，未归档；[0.13.14][bu-release] 发布于 2026-10-26。浏览器控制不能证明原生微信支持 |
| [Skyvern-AI/skyvern](https://github.com/Skyvern-AI/skyvern) · [README][sky-readme] | [AGPL-3.0][sky-license]；README 明示托管反反爬能力不在相同开源范围 | 浏览器 LLM + Computer Vision / Playwright-compatible SDK；CLI 声明 Windows/WSL/macOS/Linux | 最近提交 2026-11-05，未归档；[v1.0.56][sky-release] 发布于 2026-10-14。可借鉴 Extract/Validation 分离，不是微信专用通道 |
| [bytedance/UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop) · [README][tars-readme] | [Apache-2.0][tars-license]；模型/服务许可未展开 | Desktop：Windows/macOS，截图/VLM + 鼠标键盘；[quick-start][tars-quick]列 macOS 辅助功能/录屏权限和单显示器限制 | 最近提交 2026-10-09，未归档；[v0.3.1][tars-release] 发布于 2026-10-08，说明主要针对 **Agent TARS CLI server**，不能充当 Desktop 包版本证明 |
| [openclaw/openclaw](https://github.com/openclaw/openclaw) · [README][oc-readme] | [MIT][oc-license] | 当前 README 列 macOS/Linux/Windows；Gateway 管理渠道、会话、工具与设备节点 | 最近提交 2026-11-05，未归档；[v2026.11.1][oc-release] 发布于 2026-11-05。只借鉴队列/审批/恢复；本次未核实个人微信或任意客户会话控制 |

## 对当前目标有用的少量机制证据

- **绑定与事件：** wxauto [消息文档][wx-message]明确 UI ID 切换界面会变、hash 可能重复，[监听回调][wx-chat]同时携带 Message/Chat；不能仅靠昵称或 UI ID 证明客户唯一。CowAgent [weixin][cow-weixin]描述新增机器人助手，[wechat_kf][cow-kf]则要求企业微信客服资格和公网回调，两者不等于既有桌面客户聊天。个人微信“官方 API”是该项目声明，未核对腾讯原始授权/政策；不采信其“无安全风险”保证。
- **排队、恢复与审核：** OpenClaw [queue][oc-queue]按会话串行，[retry][oc-retry]对发送结果不明不盲重放，[session][oc-recovery]明确重启不证明外部动作只发生一次；[审批][oc-approvals]绑定预备执行上下文。这些是可借鉴模式，不是本地已具备的持久化或业务回复审批证明。
- **独立核验：** Skyvern [Extract/Validation][sky-blocks]分开采集与断言，[Visualizer][sky-results]保留动作后截图/录像。browser-use 补充源码：[`browser-use/browser-use@b49a68e4060acb226da8f784194fef301c53a6d7:browser_use/agent/service.py:L1594-L1644`][bu-judge]将轨迹 judge 与代理自报 success 分开保存；[L254–L257][bu-judge-default]显示默认可用同一 LLM。**单独判定不等于独立模型、独立数据源或真实业务 Oracle。**该源码补证用于 README 未解释的成功判定语义，未执行项目。
- **过时信息：** UI-TARS [quick-start][tars-remote]称 Remote Operator 于 2025-08-20 停服，与 README 免费远程服务宣传有时效冲突；不能据演示宣称目前可用，也不能据“fully local”推定所有模型配置离线。

## 热榜与证据局限

**用户所指“最近热榜项目”未核实。** 用户没有项目名或时间窗口。本次 GitHub 官方 [日榜](https://github.com/trending?since=daily)、[周榜](https://github.com/trending?since=weekly)、[月榜](https://github.com/trending?since=monthly)快照分别含 15/16/12 条可见仓库卡片，以上 8 个精确项目均未出现；这不能证明从未上榜。没有用累计 star 数量、Trendshift 徽章或 push 日期代替近期热度；不再扩大搜索。

证据：[official-20261105T190714Z](../../.runtime/tests/ai-customer-support/20261106-native-completion/research/official-20261105T190714Z/)。`*__repo/commit/tree/releases.json` 保存身份、维护、许可有无及发行返回；README/LICENSE/选中文档与源码正文配套 `*__http.json` 记录 URL/时间；`trending-*.html`、解析 JSON 和 `trending-candidate-check.json` 保存榜单与精确匹配；`manifest.json` 记录文件 SHA-256/字节数，`retrieval-notes.json` 记录超时与补取。最初两个 `cl-hub/*` 猜测地址 404 后，经仓库搜索确认 `cluic/*`；慢速 raw 请求改用固定 SHA Contents API，未取得的材料没有填造。LAN 代理检查被拒绝后未修改配置。

检索充分性：8 个指定仓库的身份、README、根许可有无、Release、归档状态已核对，足够支持此表；未做完整依赖/模型许可审计、腾讯政策验证、性能实验或真实微信兼容验收。**本轮仅写本报告与指定证据目录；没有 GUI、微信操作、项目安装/运行、模型配置修改，也没有触碰其他修改者文件。**

[bu-judge]: https://github.com/browser-use/browser-use/blob/b49a68e4060acb226da8f784194fef301c53a6d7/browser_use/agent/service.py#L1594-L1644
[bu-judge-default]: https://github.com/browser-use/browser-use/blob/b49a68e4060acb226da8f784194fef301c53a6d7/browser_use/agent/service.py#L254-L257
[bu-license]: https://github.com/browser-use/browser-use/blob/b49a68e4060acb226da8f784194fef301c53a6d7/LICENSE
[bu-readme]: https://github.com/browser-use/browser-use/blob/b49a68e4060acb226da8f784194fef301c53a6d7/README.md
[bu-release]: https://github.com/browser-use/browser-use/releases/tag/0.13.14
[cow-kf]: https://github.com/zhayujie/CowAgent/blob/ee317c4afe048d5c3b42ef9422c6905071f56c68/docs/zh/channels/wechat-kf.mdx#L1-L21
[cow-license]: https://github.com/zhayujie/CowAgent/blob/ee317c4afe048d5c3b42ef9422c6905071f56c68/LICENSE
[cow-readme]: https://github.com/zhayujie/CowAgent/blob/ee317c4afe048d5c3b42ef9422c6905071f56c68/README.md
[cow-release]: https://github.com/zhayujie/CowAgent/releases/tag/2.2.2
[cow-weixin]: https://github.com/zhayujie/CowAgent/blob/ee317c4afe048d5c3b42ef9422c6905071f56c68/docs/zh/channels/weixin.mdx#L1-L77
[oc-approvals]: https://github.com/openclaw/openclaw/blob/34bc6434914728a8d13e8e2dcf6dd98bce6d1d88/docs/tools/exec-approvals.md#L770-L777
[oc-license]: https://github.com/openclaw/openclaw/blob/34bc6434914728a8d13e8e2dcf6dd98bce6d1d88/LICENSE
[oc-queue]: https://github.com/openclaw/openclaw/blob/34bc6434914728a8d13e8e2dcf6dd98bce6d1d88/docs/concepts/queue.md#L9-L16
[oc-readme]: https://github.com/openclaw/openclaw/blob/34bc6434914728a8d13e8e2dcf6dd98bce6d1d88/README.md
[oc-recovery]: https://github.com/openclaw/openclaw/blob/34bc6434914728a8d13e8e2dcf6dd98bce6d1d88/docs/concepts/session.md#L342-L351
[oc-release]: https://github.com/openclaw/openclaw/releases/tag/v2026.11.1
[oc-retry]: https://github.com/openclaw/openclaw/blob/34bc6434914728a8d13e8e2dcf6dd98bce6d1d88/docs/concepts/retry.md#L97-L103
[sky-blocks]: https://github.com/Skyvern-AI/skyvern/blob/5991e561db9e8efc0af1d8e690ed8128531ab8a4/fern/workflows/workflow-blocks-details.mdx#L7-L25
[sky-license]: https://github.com/Skyvern-AI/skyvern/blob/5991e561db9e8efc0af1d8e690ed8128531ab8a4/LICENSE
[sky-readme]: https://github.com/Skyvern-AI/skyvern/blob/5991e561db9e8efc0af1d8e690ed8128531ab8a4/README.md
[sky-release]: https://github.com/Skyvern-AI/skyvern/releases/tag/v1.0.56
[sky-results]: https://github.com/Skyvern-AI/skyvern/blob/5991e561db9e8efc0af1d8e690ed8128531ab8a4/fern/running-tasks/visualizing-results.mdx#L8-L29
[tars-license]: https://github.com/bytedance/UI-TARS-desktop/blob/3ac2cb8d946d78d5ff92ad17b318eaafa18c178c/LICENSE
[tars-quick]: https://github.com/bytedance/UI-TARS-desktop/blob/3ac2cb8d946d78d5ff92ad17b318eaafa18c178c/docs/quick-start.md#L9-L48
[tars-readme]: https://github.com/bytedance/UI-TARS-desktop/blob/3ac2cb8d946d78d5ff92ad17b318eaafa18c178c/README.md
[tars-release]: https://github.com/bytedance/UI-TARS-desktop/releases/tag/v0.3.1
[tars-remote]: https://github.com/bytedance/UI-TARS-desktop/blob/3ac2cb8d946d78d5ff92ad17b318eaafa18c178c/docs/quick-start.md#L53-L55
[wcf-license]: https://github.com/lich0821/WeChatFerry/blob/0f5c60a034fcac234cabd000b49c9200defa7f7d/LICENSE
[wcf-readme]: https://github.com/lich0821/WeChatFerry/blob/0f5c60a034fcac234cabd000b49c9200defa7f7d/README.MD
[wcf-release]: https://github.com/lich0821/WeChatFerry/releases/tag/v39.5.2
[wx-chat]: https://github.com/cluic/wxauto/blob/05e5a52379c99f401dc512acfdd811b3d701da8b/docs/class/WeChat.md#L71-L177
[wx-license]: https://github.com/cluic/wxauto/blob/05e5a52379c99f401dc512acfdd811b3d701da8b/LICENSE
[wx-message]: https://github.com/cluic/wxauto/blob/05e5a52379c99f401dc512acfdd811b3d701da8b/docs/class/Message.md#L106-L131
[wx-readme]: https://github.com/cluic/wxauto/blob/05e5a52379c99f401dc512acfdd811b3d701da8b/README.md
[wx-releases]: https://github.com/cluic/wxauto/releases
[wx4-readme]: https://github.com/cluic/wxauto4/blob/d0ae14d3e435807b4dead393af9d014529bbac78/README.md
[wx4-releases]: https://github.com/cluic/wxauto4/releases
