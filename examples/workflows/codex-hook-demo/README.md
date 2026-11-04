# OD-CODEX-HOOK-DEMO — Codex Hook → OpenDesk → Codex A/B 最小技术验证

**检索词：`OD-CODEX-HOOK-DEMO`。** 本文件是跨对话唯一进度记录。续接时必须先读取这里和真实 `state.json`，不要依据聊天文字重放已执行或结果未知的步骤。

## 1. 原始目标（不得漂移）

保留官方 **Codex 桌面客户端**执行任务、呈现对话的现有功能。人手在 Codex 启动无业务副作用的演示任务 A；Codex 的真实生命周期 Hook 将 A 的事件发给本机 OpenDesk；OpenDesk 接收、记录、按固定 `A → B` 顺序在**同一个官方客户端**创建、填入、提交 B；Codex 的 B Hook 被 OpenDesk 记录并结束。**只允许 A、B 两项，不使用 Codex 队列、Redis、另一个自动化平台，也不修改 OpenDesk Browser / Web Flow。**

**分工**：Codex 运行任务并发通知；OpenDesk 处理通知并操作下一项；本示例用固定 next-task 函数 `submitB()` 代替队列。无需通用 HTTP API 或新 Go 接口，直接复用可信 `-script` 中现有 `Webhook.listen()`、`window`、`UI.within()`、`App` 和 `File`。

## 2. 代码归属与真实前提

- `main.js`：由 OpenDesk **可信本地** Runtime 执行的进程内 Webhook + 单次桌面动作；运行时生成 UUID，绑定会话与回合，持久化事件与提交状态。
- `sender.py`：官方 Codex `UserPromptSubmit` / `Stop` 的快速、窄范围转发；不会替 Codex 排队、执行第二项或阻止官方流程。
- `hooks.example.json`：官方 Hook 配置模板；**必须合并**进当前已信任的 `<repo>/.codex/hooks.json`，不要覆盖其他 Hook。
- `profile.example.json`：待 Mac 实机确认的三个语义定位器（旧会话不存在而新会话才出现的标记、编辑框、提交按钮）。模板的 `confirmed:false` 与 `REPLACE_` 会明确拒绝桌面输入。
- `tests/codex-hook-demo/main.test.cjs`：Node VM 的流程**组件测试**；`tests/codex-hook-demo/test_sender.py`：Python 事件过滤和 localhost HTTP 客户端**组件测试**。测试不使用官方 Codex 窗口或真实 OpenDesk 原生驱动。

本方案开发时只读取了远程 GitHub 仓库 `shopable-ai/opendesk` 的 `master` 快照（基线 `909effdc2e1cbeca57ba0e265b6d6f7a57f42041`），**没有读取用户 Mac 上的 Git 工作树**。将代码合入本机前，先检查分支、`AGENTS.md`、已有同名实现和未提交修改；不要强行覆盖。`examples/workflows/codex-hook-demo/` 在该远端快照中尚不存在。原有 `examples/local-webhook-order-query/` 证明可复用入口，`docs/api/webhook.md` 描述了只监听 `127.0.0.1` 的 P0 本地 Webhook。

相关官方资料：
- Codex Hook 输入、`Stop` 语义、文件放置和可信审查：https://learn.chatgpt.com/docs/hooks
- Codex 桌面快捷键（启动前仍须按实际版本核对 Cmd+N）：https://learn.chatgpt.com/docs/reference/commands
- OpenDesk 合同：`docs/api/webhook.md`、`docs/api/window.md`、`docs/api/desktop-ui.md`、`docs/api/input.md`、`docs/frameworks/ui-locator-repair.md`。

## 3. 当前状态与证据（2026-11-04）

| 子项 | 当前结论 | 证据 |
| --- | --- | --- |
| 官方 Hook 文档、仓库 API 与 `AGENTS.md` | `SOURCE_REVIEWED` | 上述 URLs、GitHub 基线 SHA |
| 本地受信 Webhook、身份隔离、持久状态、A→B→停止逻辑 | `SOURCE_IMPLEMENTED` | 本目录 `main.js`, `sender.py` |
| 业务组件测试 | `COMPONENT_TESTED` | `node --test tests/codex-hook-demo/main.test.cjs`：14/14；`python3 -m unittest discover -s tests/codex-hook-demo -p 'test_*.py' -v`：3/3 |
| 真实 Codex 版本、Hook 在 Mac 实际启用与信任 | `NOT_TESTED` | 当前开发执行环境为 Linux，未连接用户 Mac |
| A 的真实 Hook、OpenDesk 实机收件 | `NOT_TESTED` | **没有**真实 Hook 投递日志 |
| Mac 辅助功能授权、真实新建/填写/提交 B | `NOT_TESTED` | **没有**实窗截图或任务创建证据 |
| B 的真实 Hook、结果和 A→B→停止 | `NOT_TESTED` | **没有** B 的真实执行凭据 |

**严禁把组件测试里的伪造 Hook 数据、VM 模拟窗口或测试用 localhost 服务器当成真实闭环。**

## 4. 本机最短启动与验收（仅 macOS；目标 Codex 官方桌面）

下面所有相对命令以实际 OpenDesk 仓库根目录为工作目录，示例假设它是 `/Users/shopme/Documents/workspace/opendesk`。如果本机已有实现，先核对而非重复复制。同一轮只启动一个 `main.js` 进程。

### 4.1 检查并合入

```bash
cd /Users/shopme/Documents/workspace/opendesk
git status --short --branch
cat AGENTS.md
find examples -iname '*codex*hook*' -print
# 代码已提交到 GitHub master，先只读核对实际本机状态，避免重复应用旧补丁/ZIP：
git fetch origin master
git diff --name-status HEAD..origin/master -- examples/workflows/codex-hook-demo tests/codex-hook-demo
# 由本机执行者检查分支、未提交修改、文件冲突后，按需安全 fast-forward；不得直接覆盖本地改动。
node --check examples/workflows/codex-hook-demo/main.js
node --test tests/codex-hook-demo/main.test.cjs
python3 -m unittest discover -s tests/codex-hook-demo -p 'test_*.py' -v
```

### 4.2 安装 Codex Hook 并核对本机版本

1. 先用 Codex 桌面客户端的 About/设置核对**实际版本和当前工作空间**，确定 Codex 当前项目工作目录位于本仓库；在 macOS 系统检查已安装的官方 Codex bundle ID、原有 Hook 和快捷键映射。不能假定当前机器的客户端一定与参考文档一致。
2. 将本目录 `hooks.example.json` 中的 `UserPromptSubmit` 和 `Stop` handler **合并**到 `<repo>/.codex/hooks.json`（或当前有效的 user-level Hook 配置）；不要覆盖已有 hooks，也不要增加相互冲突的 `Stop` continuation Hook。模板 `python3 "$(git rev-parse --show-toplevel)/examples/workflows/codex-hook-demo/sender.py"` 通过当前仓库定位本地脚本。
3. 在 Codex CLI 输入 `/hooks` 或按桌面客户端版本的 Hooks 设置页，**审阅并信任**这个非托管 Hook 的确切配置/hash；每次修改需重新审阅。运行前验证 Python 3、Hook 执行用户与 OpenDesk 在同一台 Mac、同一用户安全上下文。不要将监听地址与 Bearer token 发到公网。
4. `Stop` **不包含可靠的“任务整体成功”布尔字段**；`stop_hook_active:false` 只是没有先前 Stop continuation 的信号。这个演示只以 **同一 `session_id`/`turn_id` + 精确 DONE 标记 + 无其他继续执行的 Stop Hook** 认定简单 A/B 回合结束。它不能替代未来复杂任务的业务结果验证。`SessionEnd` 可能在关闭/长期空闲后才触发，因此不用它驱动 B。

### 4.3 校准桌面目标（必要的本机人工前置，不能猜定位器）

在 Mac 打开 Codex，确认辅助功能/输入监控的 OS 权限仅授予真实 OpenDesk 可执行宿主。使用 **Accessibility Inspector** 或现有 OpenDesk Accessibility 只读检查，找到当前版本以下三个确切目标，填入 `.runtime/tests/codex-hook-demo/profile.json`：

- `composer`：Codex 官方聊天输入区的**唯一可读写**原生 `textField`（需要实际支持 `setValue` 和同引用回读）；
- `submit`：新会话中**唯一**的原生 `button` 提交控件（实际 role/name/identifier）；
- `newThreadIndicator`：仅在进入**全新且尚无消息的会话主区域**才出现，且在已完成任务 A 的会话中**不存在**的独特原生 `staticText`/`heading`。**侧栏常驻“新建会话”按钮不是有效标记。**

配置样例：

```bash
mkdir -p .runtime/tests/codex-hook-demo
cp -n examples/workflows/codex-hook-demo/profile.example.json .runtime/tests/codex-hook-demo/profile.json
chmod 700 .runtime/tests/codex-hook-demo
# 检查并编辑 profile.json 中三组真实 AX 识别字段，最后才改 confirmed 为 true。
```

若该版本的 Codex 编辑器只暴露 `contentEditable`、AX 不支持独立 value 或没有可区分新会话标记，**本示例应拒绝输入并保持 NOT_TESTED/BLOCKED**，不能为了跑通而用盲坐标、直接 Enter、放宽远程权限或使用虚构 identifier。下一步才根据实际窗口截图/AX 证据作最小定位策略修复。

### 4.4 启动 OpenDesk；人工在 Codex 中提交 A

```
cd /Users/shopme/Documents/workspace/opendesk
./dist/opendesk -script examples/workflows/codex-hook-demo/main.js -console-mode script -log-dir .runtime/tests/codex-hook-demo/opendesk-log
```

保持这个进程运行。`main.js` 首次打印 `OD_CODEX_DEMO_READY={"runId":...,"aPrompt":...}`，**只复制 `aPrompt` 的值**到已处于本仓库工作空间的官方 Codex 桌面客户端输入区并提交。不要手动创建 B。`endpoint.json` 内含本机 listener Bearer **密钥**，不要复制到聊天、版本库或公开测试证据。`state.json` 保存本轮身份、阶段和事件。

成功所需真实日志顺序：

```
RUN_INITIALIZED
A_BOUND
A_STOP_ACCEPTED
B_NEW_THREAD_RESERVED
B_SUBMIT_RESERVED
B_PROMPT_SUBMITTED
B_STOP_ACCEPTED
```

`B_SUBMIT_ACTION_RETURNED` 是辅助日志，可能在 `B_PROMPT_SUBMITTED` 前后到达；它**不能**单独证明 B 已被 Codex 接收。`state.json` 的终态 `DONE` 必须有 `A_STOP_ACCEPTED`、`B_PROMPT_SUBMITTED`、`B_STOP_ACCEPTED` 及其不同的真实 session/turn 身份（B 的 session 与 A 不同），同时请保留两个官方客户端会话真实截图/日志以及 OpenDesk 实际目标窗口与 B 内容回读凭据。仅在这些证据齐全时才记 `MAC_DESKTOP_VERIFIED` 或 `PRODUCT_DONE`（本轮尚没有）。

**不要自动清理 `.runtime` 后重启。** `state.json` 存在会拒绝启动另一次运行，这是为避免未知提交的重复副作用；须先人工确认上轮结果与状态，再将旧证据归档至 `.runtime/tests/codex-hook-demo/archive-<runId>/`，重建一个全新 runId。不要把删除状态当成重试策略。

## 5. 异常、重复与失败边界

| 情况 | 本 Demo 行为 |
| --- | --- |
| A 的 `Stop` 重复到达 | 按已绑定 `sessionId+turnId` 与不可逆的 `B_DISPATCH_RESERVED` 拒绝再次调度 B；Webhook 的 deliveryId 去重是额外的短期防线 |
| 其他会话/回合/历史 runId/普通聊天 | 不与本次固定 A/B 模板、工作目录或身份一致 → 忽略或 `403/409`；无桌面动作 |
| `Stop` 继续中、回答不含精确 DONE 标记、缺少 A PromptSubmit | 不向 OpenDesk 报完成；A 不启动 B。其他继续执行 Hook 的可能性仍须通过客户端配置排除 |
| 无 profile/权限/官方窗口、Codex 不在前台或已有草稿 | 提交前 `BLOCKED`，保存错误码，无 B 点击；不会自动跳过授权或切换窗口 |
| Cmd+N 已发但“新会话”结果未确认，或文本已编辑 | `PAUSED_UNKNOWN`，保存状态，不自动再发 Cmd+N / 重输 / 点击；防止覆盖用户草稿 |
| 已准备单次提交且点击回执异常/超时 | `PAUSED_UNKNOWN`，`bSubmitAttempted:true`，**不重试**；若随后实际 B `UserPromptSubmit`/`Stop` 到来，允许同一轮只读对账收口 |
| Hook 收件失败、OpenDesk 进程中断/关闭 | Codex Hook 仍返回 `{ "continue": true }`，不阻断用户原回合；失败在本机 Hook stderr 显示。OpenDesk 状态不把未收到事件伪装为成功，也不自动重建 listener |
| B 最终完成 | `DONE` 并 `hook.close()`；不存在第三个任务，也无递归任务队列 |

保留运行报告和证据在 `.runtime/tests/codex-hook-demo/`；本目录源文件**不**保存凭据。Hook 超时/网络失败不等于业务回滚，也不能自动发第二次 B。`Stop` 只适用于此次精确且无外部副作用的 A/B 一行输出任务。

## 6. 独立代码/可靠性复查与评分

以下是**实现与测试用例分开的第二轮静态审查**（同一 AI 执行，不是第三方人员代码审计），不是 Mac 真机验收：

| 维度（每项 100） | 初评 | 依据 / 待补证 |
| --- | ---: | --- |
| 职责边界与最小性 | 96 | 单个示例，Hook 只转发、OpenDesk 决策；无队列平台/Runtime 改动 |
| 权限与事件隔离 | 94 | 可信本地 Webhook、0600 secret、runId/session/turn/cwd/来源收紧；未验证真实 macOS 权限 |
| 一次性提交与未知处理 | 95 | 提交前持久预留、不会自动二次点击；测试覆盖晚到 B 事件和竞态 |
| 桌面结果可验证性 | 78 | 已实现新会话 marker 前后态、原生读回、B PromptSubmit/Stop；未知 Codex AX 实际可用性 |
| 测试覆盖及交付 | 88 | 17 个组件测试通过，**无**真机 Hook 与 A/B 实窗证据 |
| **平均** | **90.2** | 质量目标 95/100 尚未达到；不能用评分替代真实证据 |

## 7. 最新唯一下一步（V1.2 分阶段验证，不重复开发）

**先在实际 Mac 上独立验证“OpenDesk 能在指定项目的官方 Codex 客户端创建、提交一条新任务”的能力，不立即重放 A→B。**
原始 A→B→停止目标不变；但新对话执行能力未实机通过前，不应把 Hook、调度和 UI 混成一次验收。

依次推进，若某阶段已有真实证据则跳过：

| 任务 | 目标与独立验收 |
| --- | --- |
| T01 | 核对官方 Codex、App Server、Deep Link、macOS 权限和 OpenDesk 当前入口的真实版本及能力 |
| T02 | 独立识别 Codex 本地工作目录/项目身份；不要把 ChatGPT Project 与本地项目混淆；未知归属停止 |
| T03 | 独立验证在**指定项目**准备新对话，优先官方入口；若只预填则仅记 `DRAFT_READY` |
| T04 | 在不覆盖用户草稿的前提下输入固定任务，并对实际输入值严格回读 |
| T05 | 对固定演示任务**单次**提交，取得官方线程及执行证据；未知结果标为 `SUBMISSION_UNKNOWN` 且不重试 |
| T06 | 将 T02–T05 封装为可单独运行的 OpenDesk 可信本地脚本，运行组件及实机测试；**不依赖 Hook** |

通过 T01–T06 后，下一阶段才将已验证的创建任务脚本接入原有 `Webhook.listen`，最后验收 A→B→停止。

**证据状态：**此前只有 14 项 Node + 3 项 Python 组件测试（Linux 环境）通过。提交代码到远端 GitHub 不意味着用户 Mac 的本地目录已同步，不意味着官方 Hook 已启用，也不意味着 T01–T06 或 A/B 实机通过。继续之前先核对本机工作树、`.runtime/tests/codex-hook-demo/state.json`、真实客户端版本和已存在的执行记录。禁止重放 UNKNOWN。
