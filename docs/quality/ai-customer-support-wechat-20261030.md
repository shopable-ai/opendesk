# 真实微信接入预检：2026-10-30

状态：**BLOCKED，真实微信接入与双机闭环未完成。**

本轮完成了两机环境核验、当前 Runtime 的只读 API 探测、窗口焦点差异定位，以及现有测试聊天适配边界检查。未修改产品源码，未构建新 Runtime，未提交或推送。没有将旧测试聊天、浏览器测试或旧 AI 验收算作微信通过。

## 请求、范围与产物

继续现有六页、约 380px AI 客服助手的真实微信接入。用户授权通过现有 SSH 别名 `mac24dev` 向核实后的当前本机账号发送低频、明确标记的无敏感测试消息。本机仅允许人工采纳后填入未发送草稿。账号、会话、消息或动作结果不能可靠确认时停止依赖动作。

运行目录：`.runtime/tests/ai-customer-support/wechat/20261030-033422/`。其中 `request-original.md` 保存从原对话创建请求读回的完整交接正文；`request.md` 为本轮简要范围。`evidence-index.json`、`progress.json` 和 `action-ledger.json` 为继续工作入口。运行目录是本地证据，不作为源码提交。

## 现场结论

| 检查 | 当前证据与结论 |
| --- | --- |
| 本机环境 | macOS 26.5.1 arm64；微信 4.1.10 / build 268831；bundle `com.tencent.xinWeChat`；实际路径 `/Users/shopme/Applications/WeChat.app`；主进程 PID 15628。身份仅代表本次观察。 |
| 本机 Runtime | 使用既有 `dist/OpenDesk.app` 签名构建，x86_64，经 Rosetta 运行；此前构建来源为 `c65848c246c516d111b8cd12b947f33a6cbc70a7`、modified=true。它不是当前 dirty 源码的新构建，未据此证明源码与安装包一致。 |
| 本机 AX 权限 | `Accessibility.getCapabilities()` 返回 granted，implementation available；不等于微信聊天语义可用。 |
| 登录时的聊天主窗 | 原 handle 176265，880×640。window-scoped snapshot 为 complete=true / truncated=false / 6 nodes，仅窗口外壳和交通灯按钮；未暴露会话、消息或草稿输入框。应用与 helper 的额外只读检查也未得到可用聊天输入节点。 |
| 精确焦点 | `window.get/list` 与 `window.current` 对同一主窗曾分别返回 true/false。后续同时观察到同 PID 的 66×20 辅助窗口，CG 排序将其列在主窗前；源码中的枚举按 PID、精确刷新按 PID+首个 CG window ID 判定，解释了本次差异。独立的 `window.getAppWindow({pid,exePath})` 则经 AX focused-window 返回真实主窗 handle 176265、hasFocus=true。未放宽输入门禁，也未修改原生判定实现。 |
| 本机最新登录状态 | 一次受控头像导航后，微信随后显示“为了你的账号安全，请重新登录”。不能据时间顺序断言导航导致登出。已确认提示、为原账号点击登录；最新实窗和 AX 明确显示“需在手机上完成登录”。原聊天主窗已失效，禁止复用原 handle。 |
| mac24dev 环境 | SSH BatchMode 可达；macOS 26.5.1 arm64；微信 4.1.15 / build 270135，实际路径 `/Applications/WeChat.app`，上次观察主进程 PID 49429。发送账号、登录状态与唯一接收人尚未核实。 |
| mac24dev Runtime | 原有旧版 Runtime 不含 Accessibility API。为避免覆盖它，将本机完整签名包复制到 `/Users/a0000/.runtime/apps/wechat-support-probe/OpenDesk.app`，远端严格签名校验通过；新包 capabilities 返回 permission=denied、available=false。未更改 TCC、权限、认证或系统设置。 |
| 当前授权缺口 | 已提出为上述远端测试运行器授予辅助功能权限的明确确认请求，尚未收到答复。手机登录确认也尚未完成。复制、验签或运行成功均不证明桌面权限可用。 |

详细原始观察见 `inspect-app-active.json`、`inspect-scopes.json`、`current-focus-before-fix.json/.log`、`inspect-focused-ax.log`、`inspect-current-remote.json`、`inspect-login.json`、`inspect-login-phone.json`。`login-required.png` 和 `login-awaiting-phone.png` 分别记录安全提示和手机确认现场；不公开展示私人聊天截图。

## 动作与结果

| 动作 | 本轮次数 | 结果 |
| --- | ---: | --- |
| 远端微信发送测试消息 | 0 | 未核实账号与收件人，未执行。 |
| 本机草稿写入 | 0 | 没有文本写入。 |
| 本机发送消息 | 0 | 没有发送动作。 |
| Runtime 头像导航点击 | 1 | exact AX PID/path/handle/bounds 预检后 click 返回；未确认个人资料卡成功打开，随后进入重新登录状态。此前三次 Runtime 导航预检均在 mouse.click 前停止。 |
| CUA 早期头像导航尝试 | 2 | AXError.notImplemented，后续观察未见资料卡；未将尝试算作成功。 |
| 确认安全提示 / 请求原账号登录 | 各 1 | 实窗已到“需在手机上完成登录”；没有切账号或输入凭证。 |

API 探测使用保存的 JavaScript 文件和既有 `./dist/opendesk -script … -console-mode script`，按 canonical API 阅读包定义调用。未用 Go 测试替代公共 API 测试，未运行完整功能回归或 AI 请求。脚本执行成功只证明该次探测完成。

## 产品适配边界与未验证项

`native-demo.js` 仍绑定独立测试聊天窗口和 AX root；`desktop/native-adapter.js` 仍解析测试聊天的 `support.session`、`support.draft.*`、`support.message.*` 与 t1/t2/t3 身份。`src/desktop.ts` 和业务状态也保留测试客户合同。不能替换 PID、拼造微信消息 ID 或以昵称把真实联系人映射成这些测试客户。

本轮未凭缺失的聊天语义实现猜测式 adapter，未修改共享 React/state/Query 文件。六页界面代码、实际加载、视觉和功能均无本轮新增通过结论。完整实链中的会话/消息去重、Query 来源、人工选择/编辑/重新查询保护、明确采纳、独立 AX 精确草稿读回，以及暂停/撤权/换会话/新消息/已有草稿/在途与未知动作测试均为 **NOT_TESTED**。

本轮前后 Hash 比较还发现 `native-demo.js`、`src/state.tsx`、`preview/index.html` 有并行变化；本任务未写入这些文件，已保留原样。当前测试聊天标题/root 限制仍存在，但不能把本轮 API 探测或历史 UI 结论外推到这些新版本。起止 Hash 分别保存在 `provenance-before.json` 与 `provenance-final.json`。

对 AX 的外部查证没有找到适用于当前安装的腾讯官方启用办法；这是有限检索的阴性结果，不能推断所有微信版本均不支持 AX。参考 [4.1.10 官方更新说明](https://weixin.qq.com/updates?platform=mac&version=4.1.10)、[App Store 产品页](https://apps.apple.com/cn/app/%E5%BE%AE%E4%BF%A1/id836500024?mt=12)、[Apple 自定义控件辅助功能说明](https://developer.apple.com/documentation/appkit/accessibility-for-appkit)。没有据此切换 VoiceOver、修改权限或使用私有设置。

## 恢复顺序

1. 用户在手机确认本机微信登录；重新发现实际 PID、版本、主窗与账号，旧窗口身份全部失效。确认远端测试运行器辅助功能授权后，再执行对应系统权限流程和新 capabilities 检查；不能将等待当作同意。
2. 只读核实两端真实账号与唯一收件人；重新读取当前主窗的聊天/输入语义。若仍缺节点，按 locator-repair 规范评估有证据的限定 OCR 观察方案；OCR 观察不能替代要求中的独立 AX 精确草稿读回。缺此能力时继续将该闭环标为阻塞。
3. 在实测身份和读取结构成立后实现独立微信 adapter，保留测试聊天 adapter。用真实版本和选定会话建立应用 profile，不复用测试 AX 标识或假消息 ID。
4. 在已经授权的范围内进行低频双机发信和完整人工草稿闭环，再运行针对性回归并保留当前 UI 的实窗证据。当前没有可宣称通过的一条微信普通体验命令或完整 gate 命令。

继续前应检查 `evidence-index.json` 中的当前源码 Hash 与实际文件，并重新核对 dirty 工作区和既有服务。保护 `/Applications/OpenDesk.app` 等原有进程和 Query/10100 服务；本轮未结束这些进程，也未建立后台服务。远端复制的测试包保留在已说明的固定任务目录，等待权限决定，不覆盖原安装。
