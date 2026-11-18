# ChatGPT WEB → 官方 Tunnel 可见复测

日期：2026-11-10。结论：**部分通过；文件业务闭环未运行完成，不能作为整体通过。**

本轮独立证据目录：`.runtime/tests/mcp-tunnel/20261110-visible-retest/`（下称 R）。旧报告中的文件成功记录不代替本轮证据。

| 验收项 | 本轮结论 | 证据与边界 |
| --- | --- | --- |
| 官方客户端健康 | PASS | 桌面和文件模式 healthz/readyz 均 200，并观察到 control-plane poll；R/desktop-health.json、files-health.json |
| WEB 桌面调用 | PASS | 原插件发现 40 工具，真实调用 tm_status、tm_permissions；R/web-status-permissions.txt |
| 计算器五次点击 | PASS | 网页分别调用 clear、1、+、2、=，五次 tm_click 返回 ok；独立 AX 观察到 0、1、1+、1+2、3 |
| 计算器窗口视觉与 OCR | PASS（有来源限制） | 唯一 Calculator CGWindowID 的本机原始截图为 460×816，视觉显示 1+2 与结果 3；网页 tm_ocr 对该图识别 3，置信度 96.61% |
| WEB activeWindow 截图 | FAIL | 调用前核实 Calculator，实际截图时前台已变为其他浏览器窗口；该图不能证明计算器结果 |
| WEB 直接看图 | NOT_PASSED | 网页返回 NO_VIEWABLE_IMAGE_CONTENT；独立截图或 OCR 不替代此项 |
| 文件专用工具发现 | NOT_PASSED | 网页初次搜索仍返回旧的 40 个桌面工具，未取得期望的四个 tm_files_* 工具；后续仅搜索工具的回复未能读回 |
| 文件一次写入、读回、磁盘 SHA、越权拒绝、撤权后历史回执拒绝 | NOT_RUN | 未获得可调用的文件工具；没有发出写入指令，不将旧轮证据算作本轮通过 |
| 本任务客户端退出、3001 释放、3000 保留 | PASS | 桌面 helper 正常 stop；文件 launcher exit 130、client exit 0，state stopped/cancelled；最终仅 3000 的 PID6163 监听 |
| 原 Native 连接连续保留、结果标签页 keep | NOT_PASSED / 未核实 | 后续观察原 PID8115/8118 与 scope 已消失、TaskSpace49 不存在；当前 Native 有不同连接 ID。未对新连接实施操作，不能声称连续保留成功 |

## 来源与计算器证据

原插件仍为 `plugin_asdk_app_6af21996d16c8191a9a84d446a8d0f56`，原 Tunnel 为 `tunnel_6af2133ba8c08191a1b3306aaf1030fc`。未创建替代插件或 Tunnel，未上传新版本、卸载、删除插件或扩大权限。

本轮开始核验的源码基线：OpenDesk `f42d26c246fc7c57a03a664d6b3b49e59e23aa48`，Browser `e147890dd10cf14248220900a28cc450ad07d915`；两仓库均存在其他任务的未提交修改。复用已有候选，未重新构建，也未声称候选包含所有并行改动。官方 tunnel-client 为 0.0.18；MCP SHA256 为 `30b7412a260623b88b62a728d0db13667a133d872b3e2ea06c0bfcb6124e0858`。文件与签名来源见 R/provenance.json。

[计算器网页聊天](https://chatgpt.com/c/6af2d199-7024-83e8-9a32-7c5f9f279da0)。每次坐标取自本轮唯一 Calculator 的新鲜 AX，随后只由网页经官方 Tunnel 点击一次；没有本机点击、键盘整式或代码求值替代，也未重放前缀。各步保存于 R/web-clear-result.txt 至 web-equals-result.txt 与 calculator-after-*.json。

可用视觉证据是 **R/calculator-window-result.png**。其来源是只读 CGWindowList 唯一匹配 Calculator PID 与窗口标题，随后 `screencapture -l <本次窗口ID>`；并非网页 activeWindow 截图。R/calculator-window.json 与 calculator-window.swift 保存窗口选择依据。R/web-calculator-final.txt 保存网页实际 OCR 及原始误读；不能把历史表达式误读静默改成正确文本。

## 文件发现与会话中断

新 fixture 根目录为 `.runtime/tests/mcp-files-core/20261110-visible-retest-1m9kwn2o/`（下称 F）；workspace 为 `workspace-7008971a-7a4c-48bb-9512-f73399b1d238`，限定 grant 为 `b4468865-6933-4ad2-8ebe-0c6e8ec80cc2`。仅 roundtrip.txt 可读写、readonly.txt 可读，outside.txt 排除；正文仅为本轮合成数据。授权期限 1800 秒，原 Native scope 为 `84d8a231b902252121155efc1b90a8ca`。

固定预留 requestId 为 `1cad6818-9237-4528-93f9-cba2e7213e46`，但未发出对应 write。网页初次发现旧工具后按约束停止；最后发送的提示仅要求精确工具名搜索，禁止任何动作。未把 marker 提前告知网页。最终磁盘 roundtrip.txt 为 94 字节，SHA256 `f314ff3aeae325141a7c196d27310abf588ef2693f5571c57a16e2eb75a64d53`，指定追加证明行出现 0 次。没有完整基线与网页读回，故这不是成功写入/读回校验。

原插件详情、应用工具对话框、个人目录和管理设置均未展示 Refresh 入口；只下载原插件 ZIP 进行只读结构检查，未上传。OpenAI 官方[刷新说明](https://developers.openai.com/plugins/deploy/connect-chatgpt)要求刷新连接并核对元数据，但本次可见界面没有该操作，不能声称已执行刷新。

后续 `taskSpace(49)` 返回 `task space not found: 49`，原 Native PID 也已不在；未确定导致变化的操作或操作者。没有创建新 TaskSpace 绕过现场丢失。[ego-browser Skill](/Users/shopme/.agents/skills/ego-browser/SKILL.md) 加载的指南要求："Never use a new TaskSpace to recover from a stuck, blocked, timed-out, or unexpected Page." 远端聊天 URL 已取得，但无法执行最终 finish/keep 或核实最后回复。

[文件网页聊天](https://chatgpt.com/c/6af2d434-d878-83ee-89cf-a0a5187bbeee)。F/tunnel/20261110T082102Z-vvprtuiy/rpc-audit.jsonl 无已记录的 tm_files_* 调用；最终 auditComplete=false/E_RELAY_STOPPED，不能当完整调用审计通过。

## 收尾与后续恢复点

文件 launcher 已落下 stopped/cancelled:true，官方 client exit 0，grant lease exit 0；本任务客户端均不再运行，3001 空闲。原 lease 已结束、1800 秒期限已过；私有 capability 文件已按 owner/mode/单链接核验后精确移除，未读取或输出内容。对原 scope 的 grant revoke 与 workspace revoke 均返回 **E_CONNECTION_GONE**，所以**显式撤权及其 WEB 拒绝验证未通过**，不能把 scope 消失写成成功 revoke。证据为 R/old-scope-cleanup.json、files-final-observation.json、final-environment.json。

最终 PID6163 的 3000 服务仍在。新观察的 Native 连接 ready/runtimeCurrent=true，但身份已经变化，本任务未断开、重连、更新或终止这些连接；原连接连续性不能由新连接状态证明。桌面 reusable profile 仍保留，原插件仍是旧 40 工具定义；未作额外桌面输入或重新运行计算器。

后续需先恢复可核验的浏览器现场，找到同一插件的真实 Refresh 流程，再为当前 Native scope 新建限定授权与 fresh prepared run，重新执行文件闭环。不得复用本轮已失效 capability，也不得把预留 requestId 当成已写入回执。

本轮只新增本报告与 `.runtime/` 证据；未修改产品源码、未提交、未切分支、未推送，未运行完整测试、构建、lint 或跨平台验收。报告仅作定向内容与空白检查。
