# R17.1 / WebCodex 本轮 Go 源码与证据

源码提交：`34649d24ee821298f586abba257e9e41b89a4cec`，已通过非强制、预期 HEAD 校验写入 `master` 并取回核对。配套 Browser 源码：`c41102d7e2dd13510f718f69061f8194251eb767`。

[机器索引](verification.json) 列出原始日志、SHA-256、运行环境、真实临时文件/组件范围、未测项与产物身份；[源码输入](source-inputs.json) 绑定本次提交。29 个顶层定向 race case 通过，含 7 个权限子项、4 个权限往返子项与两个真正独立 CLI 子进程。权限恢复缺陷修复前四项失败的原始记录保留，不能改写成旧版本 PASS。

真实 Unix Socket 测试因本 Linux 执行器禁止 AF_UNIX 创建而 FAIL；原门槛保留，必须在 Mac 重跑。交叉编译仅证明相关 Darwin arm64 代码可编译，不证明完整 App 签名/安装、Native manifest、Chrome 加载或用户同一对话文件闭环。

构建时源码尚未提交，组件 fixture 的 `go version -m` 为原起点 `f9e4bbfd...` 加 `vcs.modified=true`；没有将它伪称为已加载的正式 OpenDesk。最后测试/构建后未改 Go 源码，随后远端同步仅增加文档，最终源码按逐文件内容提交。

当前 Mac 安装、P0、同一官方 ChatGPT 对话两轮修改及安装中实际拒绝均 **NOT_TESTED**。继续任务见 [Browser 本轮 Mac 验收提示词](https://github.com/shopable-ai/opendesk-browser/blob/main/docs/framework/prompts/goal-webcodex-chat-edit-r2-local-acceptance.zh-CN.md)，以其中固定源码 SHA 为最低来源。

## 本次提交的 CI

[Native workflow #38060523393](https://github.com/shopable-ai/opendesk/actions/runs/38060523393) 的 Ubuntu/macOS transport 与 macOS executable 对模拟 Chrome 三个 job 均 success；[逐 job/step 索引](go-ci.json) 固定本次源码 SHA。完整相关包真实 Socket 已由 CI 跑通，但仍不提升用户 Mac、签名安装或 ChatGPT P0。API docs contract 和 Windows Core 另有失败，父提交也失败，具体基线分类单独保留，不声称 Go 全部 CI 通过。

[基线失败复核](ci-baseline-review/review.json) 与 [Git blob 对照](ci-baseline-review/source-comparison.json) 保留当前/直接父提交的原始日志片段。Windows 的 Host.Close 缺方法与 24 个未分类测试、API workflow 的缺失候选运行产物/BrowserDOM risk reason/catalog 漂移均在父提交已存在；Canonical API docs contract job 自身通过。未为本轮 Mac 任务修改这些独立合同或放宽门槛。
