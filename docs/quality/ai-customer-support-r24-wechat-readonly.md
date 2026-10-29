# AI 客服助手 R2.4 · 真实微信只读探针

日期：2026-10-29（Asia/Shanghai）。本轮从最新 `master` 的
`eb171e4b0d87c469c117ea51c5f0d341e5cecc94` 开始，fetch 后与 origin/master 一致。

**R2.4 核心闭环验收：NO。** 已完成真实微信应用/窗口定位、当前测试聊天 AX 探针和本地 OCR
对照；未获得可信的会话身份、消息身份及发送方字段。按用户规定的 P1 门槛停止 P2/P3，未接入
微信 Provider 或修改 React 动态会话能力。此结论限定本机当前微信版本与现场，不宣称所有微信版本
永久不可用，也不把 OCR 高置信度当作客户身份验证。

## P0：R2.3 的可复现基线

- `639845d0` 已在 master 历史中。正式六页 React、单 root/state owner、唯一
  `preview/index.html`、`native-demo.js`、`desktop/native-adapter.js` 和可信窗口实现均已合入。
  R2.3 的两轮 22/22 实机记录仍见 [原报告](ai-customer-support-r23-desktop.md)，仅适用于独立
  AppKit 测试聊天。
- **干净检出的 master 尚不能独立复现这条稳定签名运行链。** 已入库的 `run-desktop.sh`
  及 `tests/custom-ui/tools/support-chat/build.sh` 依赖 `scripts/macos_signing.sh`，但开始时该文件
  不在 master tree。本地已有实现，并有明确的并行签名任务记录；本轮没有复制、替换或替它提交。
  该工程及剩余安装验收见本地 `docs/quality/macos-development-signing-20261029.md`。
- 本地 `dist/OpenDesk.app` 的严格签名验证通过，稳定启动器实际能运行本轮 JS 探针；这只能证明
  本地读取入口可用。未重置权限、换 App ID、导出证书/私钥或覆盖安装包。
- 当前主程序/UI host 为 18:57 的另一组摘要，R2.3 成功记录使用更早的产物。Go build info 为
  `vcs.revision=6db7bf4a… / vcs.modified=true`，不是当前干净 HEAD 的可复现构建证明。
  不把这个主程序或 host 冒称为已通过旧版 R2.3 UI gate；本轮没有重新构建或替换并行产物。
- 一次定向离线回归复用了 R2.3 的 4 项 adapter 与 10 项安全编排测试，14/14 通过；没有重跑完整
  宽度/主题矩阵。**R2.3 本轮实窗最小回归 NOT_TESTED**，当前 host 的精确构建来源仍需其 owner
  补齐后再做。签名有效、JS 能运行、UI 可复现分别报告。

## P1：授权与实测环境

用户先授权当前唯一微信窗口测试，再在现场明确打开测试聊天。下文将其记为“测试会话 A”，不在
正式文档写入实际联系人名称、对话正文或链接。

| 项目 | 实际观察 |
|---|---|
| 平台 | 本机 macOS，既有稳定签名 OpenDesk CLI Runtime |
| 微信版本 | 4.1.10，build 268831 |
| Bundle ID | `com.tencent.xinWeChat` |
| 发行签名 | 严格验证通过；Tencent Mobile International Limited，Team `5A4RE8SF68` |
| 应用路径 | `~/Applications/WeChat.app` |
| 主进程 | PID `15628`，精确 executable 为该包的 `Contents/MacOS/WeChat` |
| 授权窗口 | native ID `176265`，观察 ID `darwin:15628:native:176265` |
| 几何 | x=424、y=238、880×640 points；这是窗口信息，不是会话身份 |
| Accessibility | 本次 CLI execution 的 native permission 查询为 granted；不是已安装 App 的权限延续证明 |

初始微信未运行，本轮仅正常启动该已安装应用。`App.get` 的结果包括嵌套辅助进程，第一次探针因此
正确拒绝为 `AMBIGUOUS_PROCESS`；随后根据已读取的 Info.plist `CFBundleExecutable=WeChat`，只选择
精确主程序路径匹配的唯一实例，不使用 `pids[0]`，不探测辅助进程窗口。

窗口通过 `window.getAppWindow({pid,exePath})` 解析，读取 AX 前后重新确认同一 PID、executable、
native window ID、前台及焦点。只读取这个窗口，不使用全局窗口枚举、应用整树、聊天历史数据库、
网络接口或内部微信协议。读取中会话仍可能在同一窗口内切换，**前后窗口一致不能证明会话一致**；
因此探针始终 `bindingAccepted=false / providerReady=false`。

## 实际字段矩阵

`VERIFIED` 表示列明事实已可靠核验；`CANDIDATE` 表示仅有可见候选；`UNAVAILABLE` 表示在本次
读取路径/现场未取得可靠字段；读取失败另记 `ERROR`。未运行场景单独标 `NOT_TESTED`，不推导成
目标应用永远没有能力。

| 字段/能力 | AX | 窗口截图/本地 OCR | 本轮判断 |
|---|---|---|---|
| 应用、主进程、native 窗口 | VERIFIED | 同一窗口截图相符 | 可准确定位当前已授权窗口；跟随变化尚未复测 |
| 聊天显示标题 | UNAVAILABLE；AX root 只有通用应用名称 | CANDIDATE；能识别可见显示名 | 显示名不是唯一客户 ID |
| 可信客户/会话身份 | UNAVAILABLE；identifier/value 均无对应字段 | UNAVAILABLE | 不生成永久或自动可信临时客户 ID |
| 消息正文 | UNAVAILABLE | CANDIDATE；可见正文出现在 OCR 行中 | 只是候选文字，未形成可信消息事件 |
| 客户/客服角色 | UNAVAILABLE | CANDIDATE；本次仅有左侧气泡 | 未取得双向样本或语义身份，不宣布区分成功 |
| 显示顺序 | UNAVAILABLE | CANDIDATE；可观察纵向位置 | 不等于完整历史、消息分组或到达顺序 |
| 稳定消息 ID | UNAVAILABLE | UNAVAILABLE | 不用正文、坐标或行号伪造 message ID |
| 同文不同消息、重复观察去重 | NOT_TESTED | NOT_TESTED | 缺少可信身份基础，不实施去重算法 |
| 会话切换与 generation 失效 | NOT_TESTED | NOT_TESTED | 仅获准测试一个会话，未扩大读取范围 |

实际 AX 结果：未打开聊天时 `complete=true, truncated=false, nodes=5, maxDepth=2`；用户打开测试
会话 A 后 `complete=true, truncated=false, nodes=6, maxDepth=3`。后者仍只有 window、三个系统
button 和两个 group；没有会话、消息、正文、消息角色或标识。完整遍历表示当前 AX 暴露树已读完，
**不表示微信业务内容完整**，也不是因节点预算耗尽而“漏了聊天”。

对授权 native ID 的窗口截图作本地裁剪，只将右侧聊天区交给既有 Apple Vision OCR，没有对左侧
其他会话预览做 OCR。原截图 1984×1504 pixels（含阴影），根据实际截图测量裁剪 x=712、y=76、
width=1160、height=1280 pixels；该测量只适用本帧，不固化成微信布局 Adapter。人工查看裁剪图
确认了范围。`Vision.runOCR({provider:'apple',lang:'ch'})` 实际返回 `lang=zh-Hans`、8 行；其中混有
标题、时间、正文、编辑器占位符和图标误识别，多行内容也被拆成独立行。这是 OCR 候选结果，
不是八条消息。未访问或执行对话中的链接/文本。

## 可复现探针及安全边界

从仓库根目录运行（依赖上述本地签名脚手架）：

```sh
./scripts/run_macos_stable.sh -script tests/wechat/tools/support-readonly-probe.js -console-mode script
```

默认只取应用/窗口元数据，不读取 AX 聊天内容、不启动微信、不激活或选择聊天。应用未运行、
多主进程、目标不在前台时明确返回相应状态。窗口标题默认脱敏。

受控 AX 诊断使用本地 `.runtime/` JSON 文件，通过 `OPENDESK_WECHAT_PROBE_CONFIG` 指定，结构为：

```json
{
  "mode": "ax",
  "retainAuthorizedTestContent": false,
  "authorization": {
    "scope": "entire-test-window",
    "pid": 12345,
    "exePath": "/absolute/WeChat.app/Contents/MacOS/WeChat",
    "windowId": 12345,
    "expiresAt": 0,
    "testSessionLabel": "本次人工确认的测试会话，仅诊断标签"
  }
}
```

以上 PID/windowId/路径只是占位，必须由当前元数据和明确授权替换；`expiresAt` 必须为未来 60 秒
以内的 Unix milliseconds，启动 AX 读取前还须至少剩余 3500ms。标签不能校验会话，也不会写入客户档案。只有整个窗口内容都在授权范围
内时才能使用该模式；它不能自动过滤未授权侧栏，不能作为生产观察器。默认将 name/value/identifier
映射为本次报告内的脱敏 token；token 不作为业务 ID。只在获准保存测试内容时显式开启本地原文保存。
本轮原文、截图和 OCR 均仅在忽略目录中，不入库。

探针没有任何微信输入 API、`support.fillDraft`、发送动作或 React Bridge。Runtime capability 本身
仍是可信本地入口的通用能力，报告里的 `readOnly=true` 描述本探针所用操作，**不是新增的 native
只读沙箱证明**。失焦/换窗、过期授权、不完整树和异常结果不发布业务事件；没有后台轮询或自动重试。
错误仅保存结构化字段，不复制任意异常正文。授权时间校验用于拒绝过期启动和晚到结果；原生 AX
不保证强制取消，不能承诺在到期时刻撤回已进入操作系统的读取。

## 验证与证据

本地证据根目录：`.runtime/tests/ai-customer-support/r24/`（不提交）。

| 证据 | 内容与边界 |
|---|---|
| `provenance.json`、`provenance-final.json`、`runtime-build-info.txt`、`worktree-status.txt` | 来源 HEAD、主程序/host/HTML/JS 哈希、构建信息和并行改动范围 |
| `probe-1793276810317.json` | 初始辅助进程歧义拒绝，没有读聊天 |
| `probe-1793276848291.json`、`metadata-runtime.log` | 实际主进程和窗口定位，无聊天读取 |
| `probe-1793276874981.json`、`ax-runtime.log` | 空聊天现场，实际 5 节点 AX 树 |
| `probe-1793277091198.json`、`ax-chat-runtime.log` | 用户打开测试聊天后，实际 6 节点 AX 树 |
| `probe-1793277417166.json`、`ax-final-runtime.log` | 最终修复源码实际加载重验，仍为6节点、无业务绑定 |
| `wechat-window.png`、`wechat-test-chat.png`、`wechat-chat-region.png` | 同一个 native window 的现场及右侧裁剪；仅本地保存 |
| `ocr-current-snapshot.js/json`、`ocr-runtime.log` | 实际离线 Apple Vision 调用及原始 8 行候选，不含网络调用 |
| `targeted-tests.tap`、`targeted-tests-final.tap` | 初次22/22；审查修复后 R2.3 14 项 + 探针安全10项 = 24/24 离线通过，不是微信 live 24/24 |

历史纠偏：`probe-1793276874981.json` 使用早期探针逻辑，把未解析的业务字段批量标成了
`CANDIDATE`，但其5节点树没有这些字段；这是探针状态误判，不作为字段可用证据。原始报告保留。
当前源码只将实际捕获的 AX 树标为待审候选，业务字段保持 `UNAVAILABLE`；最终字段结论以本报告的
人工对照矩阵及最终6节点原文为准。

新增 10 项检查覆盖：默认不读聊天、无应用/前台安全退出、主进程歧义拒绝、错 PID/executable/window
及过期/过长授权拒绝、默认脱敏、原文保存须显式指定、换窗/失焦丢弃晚到树、局部树/AX 超时不伪造
成功。它们使用合成 mock，只证明相应探针控制逻辑。JS 语法与 `git diff --check` 通过。

真实微信的连续收信、同文两条、客服自身消息、三会话切换、异步旧结果、移动/缩放/最小化/恢复、
实际撤权/暂停、AX 超时/虚拟列表，以及 React 最新消息/多答案均为 **NOT_TESTED**；没有以离线
反例测试代替这些真实场景。独立审查发现并修复了数字/boolean AX value 默认脱敏缺口和临近到期仍
启动完整读取的问题，分别补有反例。最终探针 source SHA-256 为
`5a9f43761e2bcdd22951726b223fd2d5eb0f96dfc51bb24ab9da61c8f2a8548a`，最终真实 Runtime
用这个摘要执行并产生上述候选报告。全程未填微信草稿、未发送、未跟随聊天链接，也未启动第二套助手 UI。

## 六维评分与阶段出口

本轮只验证了窗口定位与一次受限聊天观察，无法形成六维 ≥95 的合格评分。为避免用很小的分母制造
100 分，六维完整验收均记 `NOT_SCORED`，综合平均也记 `NOT_SCORED`：

| 维度（满分100，目标≥95） | 当前实测覆盖 | 已运行检查通过率 | 分数 |
|---|---|---|---|
| 窗口定位与跟随 | 授权窗口定位1项；跟随变化未测 | 定位1/1；跟随 NOT_TESTED | NOT_SCORED |
| 客户会话准确性 | 已打开聊天的 AX 与截图对照1项 | 可信身份门槛0/1 | NOT_SCORED |
| 消息、角色及去重 | AX/OCR可读性1项；角色/去重未测 | 可信消息门槛0/1 | NOT_SCORED |
| Native/React业务联动 | 因P1门槛未进入 | NOT_TESTED | NOT_SCORED |
| 权限、安全与客户隔离 | 探针10项离线控制；本次只读运行 | 离线10/10；业务隔离 NOT_TESTED | NOT_SCORED |
| 真实运行可靠性 | 单次现场；无持续观察 | NOT_TESTED | NOT_SCORED |

这些通过率对应列明检查，不能解释为生产成熟度。缺少可信身份与消息归属是当前功能阻断；没有制造
客户绑定成功，也没有因自动绑定而发生串话。

下一步先解决两件事：并行签名工程进入 master 后补齐 R2.3 可复现性；为当前微信取得可验证的会话
身份和双向消息依据。可以单独评估“用户显式确认一个短生命周期会话 + 只读 OCR 候选建议”的有限
产品方案，但它仍不能标为自动可信绑定，不能关联演示客户/订单，且本轮未实现。仅当可靠识别门槛
满足后，才推进 P2 微信只读 Adapter 和 P3 同一 React owner 的动态会话隔离；当前不进入 R2.5，
不提前做微信写入。将来 R2.5 复用现有 Desktop 容器，重点才是本地知识/RAG/可信多答案。
