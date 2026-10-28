# Claude Code / OpenCode 提示词输入与延迟

2026-10-28，工作目录 `/Users/shopme/Documents/workspace/opendesk`，现有 `master`，HEAD `b7280bef765a4fe5c6076643d5c8313733d39e2b`。未创建或切换分支、提交或推送。共享脏树含其他任务的 native/API/跟随修改；整个 diff 不属于本轮。

当前配套开发包已重建并实际加载。Claude Desktop Code 与 OpenCode 的空稿、连续插入和选区后备追加，共六个真实按钮场景，独立 Copy 均逐字相等。最终 Claude 精确为空字符串，OpenCode 精确为一个空格。两个自有快捷栏及其 host 均已退出。全程未发送 Enter 或模型请求，未操作 Codex UI，未修改账户、权限或 provider。

本轮减少了原生读取开销，但没有实现瞬时输入。Claude 两个常用场景首次有新增文字帧的完成时间，从上一份 toolbar-06 样本的 1.401/1.167 秒降到 1.228/0.994 秒；每场景只有一个新样本，截图自身有耗时，不能据此承诺稳定百分比或毫秒级渲染延迟。OpenCode 新样本为 0.928/0.865 秒，没有本轮可比的旧包样本。

## 改动与保留的边界

- `automation/accessibility_backend_darwin.go`：`read(ref)` 根据请求生成属性 mask，不再无条件执行完整属性读取；直接验证 ref 所属 AXWindow 的 PID、native window ID、CG owner/bounds 和 AX anchor。读取前后保留窗口并重新校准，比较未舍入 CG 几何和原生窗口身份。移除这条只读路径上重复的前台窗口 rediscovery；`find`、`perform` 的原验证链不变。真实权限、超时和 backend 错误继续传播。
- `insert.js`：为 target、guard、context、prepare/find 和每次 read 加入分段计时；`main.js` 仅接收并记录可选计时详情。共享文件中的跟随和 scene fencing 修改保留其他任务归属。
- `tests/runtime-api/accessibility.js`：在现有 exact-window helper 中增加单属性读取，检查只返回请求字段及 bounds 投影；OpenCode 观察测试允许当前 AXDescription 派生的名称，不再把历史空名称当成必要条件。
- README 与本记录同步实际行为和证据。没有新增依赖、Go 公共 API 测试、持久配置或公共 Runtime API。

已聚焦且选区为空时，在当前光标处粘贴一次完整 body，不先移动光标、全选 Copy、重建完整树或加分隔换行。未聚焦或存在选区时，原后备路径保留：按已验证控件边界聚焦、折叠到末尾，非空稿追加两个换行及 body，并通过 Copy 检查完整后缀。后台只读准备 ref；点击仍执行新鲜的窗口/元素检查，Claude 仍执行一次完整 Code 结构检查。输入忙碌拒绝重入；目标变化、dispose 和未知输入锁止语义保留。

focused Web 路径返回 `PASTE_OBSERVED / verified:false / actionState:acknowledged`，只表示键盘派发返回、AX 值发生变化且目标仍正确。逐字比较来自另一个验收控制器，不冒充产品自身保证。所有 composition provider 仍未资格化，返回真实 `unknown`；已知 active 或非空 marked range 拒绝。未启用 `prepareTextAppend`，没有原子事务、并发编辑隔离或 IME inactive 保证。

## 真实按钮与可见文字

新证据根目录为 `.runtime/tests/prompt-shortcuts-input-20261028/latency-r2/`。合成正文 UTF-16 长度 32，含首尾双空格、换行、tab、emoji 和组合字符，不进行 trim 或 Unicode 规范化。所有场景完成后另行全选 Copy，以实际全文比较。

| 场景 / 文件前缀 | 独立全文 | 最后无新增文字帧完成 | 首次有新增文字帧完成 | 点击至反馈 |
| --- | --- | --- | --- | --- |
| Claude 空稿 `claude-empty-01` | 精确 32 单元 | 1.008 秒 | 1.228 秒 | 1.454 秒 |
| Claude 连续 `claude-append-01` | 精确 64，body + body | 0.766 秒 | 0.994 秒 | 1.350 秒 |
| Claude 选区 `claude-selected-01` | 精确 98，原稿 + 两换行 + body | 1.241 秒 | 1.511 秒 | 2.959 秒 |
| OpenCode 空稿 `opencode-empty-01` | 精确 32 单元 | 0.652 秒 | 0.928 秒 | 1.352 秒 |
| OpenCode 连续 `opencode-append-01` | 精确 64，body + body | 0.585 秒 | 0.865 秒 | 1.200 秒 |
| OpenCode 选区 `opencode-selected-01` | 精确 98，原稿 + 两换行 + body | 未取得有效采样 | 未取得有效采样 | 2.842 秒 |

起点是发出真实按钮鼠标动作前的时刻；反馈使用日志中的实际 feedback 时间，不使用控制器稍后的轮询完成时间。逐帧截图仅限目标输入区及扩展区域，人工查看 `*-contact.png`；AX 返回、像素差和反馈不能替代文字可见证据。截图单次约 0.15–0.28 秒。保守采集范围为最后无字帧的采集开始至首个有字帧完成；详见 `timings.json`，不是把两帧完成时间当成精确渲染上下界。

OpenCode 悬停提示浮层在部分帧遮挡首行，0.928/0.865 秒时通过新增的第二行/第三行辨认输入已出现；不能称为完整正文无遮挡的时间。选区场景的固定截图区域漏掉了向下扩展的新行，未用它推断可见时间。对应 `*-window.png` 保留完整目标窗口及扩展后的输入框，全文核对为 true。Claude 输入区与换行已目视确认；OpenCode 完整视觉验收存在提示浮层遮挡，判为未通过，不能用功能通过替代。

### 延迟分段

Claude 旧 toolbar-06 的“context-ready → field-read”分别约 516/404ms，新包直接计时的首个 read 为 127/151ms，写后 read 为 157/139ms。新 OpenCode 首个 read 为 163/207ms。旧链路反复校准窗口并读取不需要的属性，是可消除的开销；本轮只消除冗余，没有移除新鲜安全检查。

Claude 的完整 Code 结构检查仍约 359–373ms，前台守卫和键盘派发也占用时间。旧 toolbar-06 的空稿/连续点击至反馈约 2.115/1.683 秒，新样本为 1.454/1.350 秒。系统负载、后台跟随、应用渲染及截图采样都会影响结果，以上为单机样本。

旧证据在 `latency/toolbar-06/`、`claude-empty-08-*`、`claude-append-02-*`。原旧报告备份于 `latency-r2/input-report-before-native-read.md`，不沿用其“最新未验证”或旧 PID 状态。

## 加载、构建与执行来源

仓库根实际执行并完成官方固定入口构建：

```bash
GO_BIN=/Users/shopme/.local/opt/go1.25.13-amd64/bin/go scripts/build_macos_app.sh
```

日志为 `build.log`、错误分类修正后的 `build-02.log`。复用现有 `com.opendesk.cli` 与构建脚本配置的签名身份，`codesign --verify --deep --strict dist/OpenDesk.app` 通过。`./opendesk` 转发到 `dist/OpenDesk.app/Contents/MacOS/opendesk`。没有用旧二进制替代本轮 native 修改的构建。

本轮两次自有入口均从仓库根按下列形式实际运行，第二次将末尾目录改为 `toolbar-02`：

```bash
OPENDESK_SHORTCUTS_TARGET_CONFIG=.runtime/tests/prompt-shortcuts-input-20261028/targets.json OPENDESK_SHORTCUTS_LIBRARY_DIR=/Users/shopme/Documents/workspace/opendesk/.runtime/tests/prompt-shortcuts-input-20261028/latency-r2/library ./opendesk -ui -script examples/custom-ui/codex-prompt-shortcuts/main.js -console-mode script -log-dir .runtime/tests/prompt-shortcuts-input-20261028/latency-r2/toolbar-01
```

这是本机有明确两个 PID/executable 范围及隔离库的测试命令。默认、不带范围的公开启动行本轮未运行，避免访问延期的 Codex UI。`settings.offsetX` 是旧 Codex 偏移，不能为 scoped Claude/OpenCode 建立独立偏移；本轮没有将其误认为实际位置证据。每次按钮点位均取本实例最新 FOLLOW 回执并由真实窗口确认。跨 execution 的普通 `window.list/current` 未能解析自有浮动栏，失败日志保留；未依此猜点或结束别人的窗口。

| 实际加载文件 | SHA-256 |
| --- | --- |
| 主程序 | `e7ccda541b9483976261fde0c5baaabaead67f84258f28be97f29703402b97ff` |
| UI host | `44e68f6db6cada6fd7c2de0344a4bfef3fffaddefde7dfe9b7bc2d3d83c98a09` |
| main.js | `e34e6a37d8d33433e437aa55879c5f424152a65f91c91203d2d0a216492d79fc` |
| insert.js | `11701b6716fe6d9b94ce13b9a8e388e4b0d0e97fade4f2c96a709de09041016d` |
| targets.js | `a83b421f6d46f2176e4fb7a1106cc4ab82e669e0544601fd07fb45a5404fbf9a` |
| darwin native read 源码 | `f5944689ca95854f69eaa30f4795ba0a1aff9e00311a95fa8930a8cb40353d47` |

`toolbar-01/02` 各有脚本、helper、targets 和 loaded-provenance 快照；`final-provenance.json` 记录最终源码、测试和二进制。主程序来自当前脏树配套构建，不代表其中无关功能已全部验收。现场为 Claude 4.29.0 / PID 42296 / 窗口 170722，以及 OpenCode 2.2.0 / PID 19778 / 窗口 170075；目标重启后不得复用这些 identity。

## 草稿对账、失败与清理

toolbar-01 的前三次按钮回调与三个 Claude 测量一一对应，独立全文均通过。随后额外出现三次不由测量控制器发起的回调，原因未定，不纳入样本；发现后退出本实例并重新对账，没有 Undo、重放未知输入或结束其他进程。toolbar-02 只有三次回调，与三个 OpenCode 场景一一对应。

早期 OpenCode 位于另一个 `demo` 空白会话标签，AX 值为 U+200B，选区读取失败，Copy 未改变探针剪贴板；没有将它当成已恢复稿。之后通过历史截图回到原 `/Users/shopme` 标签，观察到单空格，再出现 AX 空段落表示和选区零长度。空白 Copy 未取得文本，未伪造空稿逐字前置证明；后续单次、无替换的 body 粘贴后，独立 Copy 精确等于 body，才证明该次内容没有隐藏前缀或后缀。额外标签未被写入正文。

`opencode-final-restore-result.json` 确认完整合成稿 98 单元已保存并仅清除此已知测试稿，恢复实际全文为精确 `" "`。`claude-final-recheck-result.json` 在所有自有栏退出后重新 Copy，实际全文精确 `""`。均保留实窗截图和 `sent:false`。未把 AX 的 `"\n"` 直接当成真实空字符串。

多次早期控制器因 foreground、焦点、选区或 Copy 不可验证而拒绝，原日志保留。`window.activate` 曾先返回验证失败，控制器只做有界同身份观察，直至新鲜 `getAppWindow` 确认前台后才输入；没有让产品新增自动激活。未聚焦 Claude 和 U+200B 空白控件的 text-state backend 失败仍是实际限制，本轮没有吞掉错误或放宽选区检查。

自有 toolbar-01 主程序/host 70299/70750、toolbar-02 主程序/host 92564/92622 均已退出；取消日志不是成功输入回执。其他安装实例及服务未结束。并行“修复快捷窗口闪烁与置顶判断”任务最后读到已清理自己的测试进程，没有向该任务发消息。

## 验证与交付状态

仓库根运行：

```bash
node --test --test-timeout=10000 tests/custom-ui/codex-prompt-shortcuts.test.cjs tests/custom-ui/codex-prompt-targets.test.cjs tests/custom-ui/codex-prompt-insert.test.cjs tests/custom-ui/codex-prompt-storage.test.cjs
```

`unit-tests-final.log`：480 项，478 通过，0 失败，2 项可选 Browser oracle 跳过。覆盖直接光标输入、原稿和 Unicode、后备选区保护、异步 ref 准备/释放、取消、目标变化、重入、未知锁止及诚实回执。JS 语法、限定文件 diff whitespace 检查和 Go 格式检查通过。

实际直接执行 Runtime JS 测试：

```bash
OPENDESK_AX_READONLY_PROBE_PID=19778 OPENDESK_AX_READONLY_PROBE_TARGET=OpenCode OPENDESK_AX_READONLY_PROBE_EXE=/Applications/OpenCode.app/Contents/MacOS/OpenCode OPENDESK_AX_READONLY_PROBE_WINDOW=1 ./opendesk -script tests/runtime-api/accessibility.js -console-mode script -log-dir .runtime/tests/prompt-shortcuts-input-20261028/latency-r2/ax-readonly-04
```

最终 6 项通过、0 失败，含实际单属性 role/nativeRole/focused/value/textInputState/bounds 读取及精确坐标校准。早期错误前台/控件状态失败与历史空名称断言失败保留；未把旧失败改写为通过。

额外 JS `mapping-change.js` 复用正式 helper，保留同一 field ref，将精确 OpenCode 窗口水平移动 8pt：旧映射的 bounds-only read 按预期抛 `STALE_TARGET`，随后恢复实际前置几何。`mapping-change-02` 与 `mapping-change-result.json` 为通过证据；`-01` 仅因控制器 eval 作用域错误，未移动窗口。未扩大到窗口销毁、secure field、目标系统多平台或完整 Runtime catalog。

| 交付层次 | 状态 |
| --- | --- |
| 代码已修改 | 是；原生 read 减少冗余，安全校准与前台输入守卫保留 |
| 实际已加载 | 是；配套重建包、签名、脚本快照及双应用按钮回执对应 |
| 视觉已确认 | Claude 输入区及新字采样通过；OpenCode 新字已观察，悬停提示遮挡导致完整视觉验收未通过；选区场景缺少有效首字采样 |
| 功能已验证 | 六场景逐字相等；最终原稿恢复；离线 478 通过；Runtime 6 通过及移动拒绝通过 |

后续若继续缩短 Claude 延迟，应单独评估新鲜 Code 结构验证和精确前台查询的成本，不能简单删除检查。OpenCode 提示浮层遮挡及未聚焦状态读取属于明确保留的限制；当前不承诺“点击即零延迟出现”。
