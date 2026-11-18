# AI 客服助手：候选审核与人工交接（2026-11-06）

本轮完成 GitHub 上游调研、候选引用审核与人工交接功能，保持六页及约 380px 布局；未新增依赖、模型请求或真实平台接入。**领域/状态测试、类型检查、构建和新功能浏览器检查通过；完整原生 gate 未通过，不能报告全量验收完成。**

需求与取舍见 [DESIGN.md](../../examples/ai-customer-support/DESIGN.md) 的 2026-11-06 节及[上游研究](../research/ai-customer-support-references-20261106.md)。开始时 HEAD 为 `f42d26c2`，已有大量未提交修改；本轮未建分支、提交或推送。并行任务继续修改原生自动回复、state/Settings、fixture、启动器与文件桥，未覆盖或回滚这些工作。

## 实现

- `src/domain/ai.ts`：按候选 ID 解析自身引用；完整分句比对取消 24 条截断；拒绝把否定语句中的子串当完整分句相同。缺引用、原文缺失、部分覆盖、冲突和当前人工新增内容明确待核实。文字相同不意味着语义支持、业务适用、来源真实或时效有效。
- `src/views/Reply.tsx`：每个版本使用自己保存的 `result/candidateId`，展示审核计数与提醒；折叠的人工交接预览包含当前问题、选中编辑稿、项目/request、引用 ref/Hash 和未核实项。复制前读取当前编辑器值；切客户重派生，停止观察隐藏。纯文本整理不代表已转接、创建工单或发送。
- `src/styles.css`：交接文本框适应窄面板；实窗发现本地测试自动回复的文字按钮误用图标尺寸后，仅对该区域覆盖尺寸，解决重叠。
- 新增 `tests/reply-review.test.mjs`、`tests/reply-review-browser.mjs`，扩展 `tests/source-review.test.mjs`；正式脚本重建唯一 HTML。README/DESIGN/研究记录同步更新。`preview/index.html` 含当前其他并行改动，不能把整个生成物差量归入本轮。

## 验证结果

以下命令工作目录均为仓库根目录。运行产物不提交，位于 `.runtime/tests/ai-customer-support/research-improvements-20261106/`。

| 验证 | 结果与范围 |
| --- | --- |
| `npm --prefix examples/ai-customer-support run typecheck` | PASS；集成后与最终复核均通过 |
| `npm --prefix examples/ai-customer-support run build` | PASS；生成自包含 HTML，无新增 CDN 或平行页面 |
| `npm --prefix examples/ai-customer-support test` | PASS，280/280，见 `unit-tests.log`；其中审核相关 11 项已先红后绿，覆盖 >24 段、否定、候选隔离与缺证据 |
| `node examples/ai-customer-support/tests/reply-review-browser.mjs` | PASS，12 项；见 `browser-final.log`、`browser/result.json`。ego 真实操作正式 HTML，Native Bridge 和剪贴板写入为合成桩；不代表真实 Query、模型或系统剪贴板 |
| 浏览器关键交互 | 候选自身引用、完整 26 段与尾部未知声明、预览/显式复制、编辑重审、重查保留旧版本、新版本使用新证据、未完成编辑直接复制、切客户隔离、观察停止隐藏、未发起填草稿动作 |
| `node --check …/tests/reply-review-browser.mjs`、限定 `git diff --check` | PASS；本例无单独 lint script，不虚报额外 lint |
| 原样普通一行命令 `./examples/ai-customer-support/scripts/run-desktop.sh` | PASS 启动与当前 React 加载；两次自有实例均受控退出。真实 CUA 向自有测试聊天添加问题、展开交接并观察当前客户/问题/稿件；没有点击发送或授权自动回复 |
| 正式 `./examples/ai-customer-support/scripts/run-desktop.sh --verify` | **FAIL**；首次 17 项检查通过后，在窗口重开后的「暂停观察」定位报 `STALE_TARGET / actionState:not_started`。见下述第一运行 |
| 新实例的同命令复核 | **FAIL**；14 项检查通过后，窗口后端报 `BACKEND_FAILED: osascript timed out after 3s`。未继续重试或重放动作；见第二运行 |
| 静态复核 | 未发现本轮改动的 P1/P2 问题；复核指出的新增版本/直接复制测试缺口已补入最后两项浏览器回归 |

正式原生运行目录（仓库相对路径）：

1. `.runtime/tests/ai-customer-support/20261106-reliability/runs/20261106-023905-4165/`
2. `.runtime/tests/ai-customer-support/20261106-reliability/runs/20261106-024116-6353/`

各目录的 `native-results.json` 保留 FAIL，不用前面通过项覆盖失败。首次已通过真实消息进入 React、去重、草稿填入独立回读、客户隔离、人工草稿保护、跟随/缩放及最小化等部分检查，但后续步骤尚未全部验收。失败发生在窗口定位/后端操作路径；本轮未证明其根因，也未修改通用 Runtime 或并行 controller 来掩盖失败。

## 代码、加载、视觉、功能分层

| 层次 | 证据与限制 |
| --- | --- |
| 代码已修改 | 上述源码、单元测试与 `final-hashes.json`；保留已有 dirty |
| 实际已加载 | 普通入口与原生 gate 的 `launch.json`、`artifact-sha256.txt`、`react-rendered.json` 绑定正式 HTML。所测 HTML SHA-256：`2eb336fc61c7b749fb14c8531a4a8f6c86a825092bf470b530b911f139d1caf7` |
| 视觉已确认 | CUA 实窗观察展开的交接摘要：客户/问题/编辑稿正确，文本框及复制按钮可随面板滚动查看，底部草稿操作仍可见。初次按钮重叠保留在 `native-before.png`；修复后的第一运行 `01-message-react.png` 已检查，文字按钮换行排列，无原先重叠。`browser/candidate-review.png`、`browser/handoff-preview.png` 是合成桥的浏览器截图，不能代替原生实窗 |
| 功能已验证 | 新审核/交接行为由领域与 ego 检查证明；原生加载与交接展开由实窗证明；真实草稿部分由上述 17 项中的独立回读证明。完整 native gate、真实模型来源和系统剪贴板不在已通过结论内 |

复用固定开发签名 `dist/OpenDesk.app` 及其 `OpenDesk UI.app`，签名时间为 2026-11-06 02:16，相关 native UI 源码修改时间早于该包；本轮仅更改外部加载的 React/领域代码，未引入新宿主能力。实际可信页面加载提供兼容证据，不宣称新的 clean/native 构建。运行记录分别保存主程序、宿主、fixture 和 HTML 的路径/Hash；不以旧报告代替本轮加载。

本轮 UI 与浏览器资源已释放，自有 fixture 已清理；未终止其他任务的服务/进程。原生截图工具在窗口失焦隐藏后也出现过超时，未将缺失截图推定为通过。

后续应先修复并重验正式原生 gate 的窗口生命周期/校准路径，再使用获授权商家知识建立检索与生成的独立评测。真实微信、生产消息、外部工单、动态订单承诺和模型质量提升均未在本轮宣称完成。
