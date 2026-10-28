# Codex Prompt Shortcuts R1.2 增量交付记录

2026-10-27，master。**整体未完成。** 原始目标保持：默认跟随真实 Codex、安全追加已有草稿、不发送、配置可靠、Browser 数据迁移。按用户后续纠偏，先修核心功能，仅做相关增量验证，未启动低相关性矩阵或五维评分轮次。末尾“22:32 增量：精确窗口刷新与隐藏后恢复”为最新候选状态；前段 hash/PID/截图属于其注明的历史运行，不替代最新源码证据。

## 本轮实际修复

- 默认启用 Events 窗口跟随；显式 `OPENDESK_CODEX_SHORTCUTS_MODE=copy` 才独立复制且不订阅外部窗口。保留既有原生栏、logo、三槽分页、管理器和两个消息通道。
- 相对位置约束在窗口与显示器可见交集内；目标过小或显示器边界不可用时隐藏。仍是保守窗口相对回退，未证明精确内容区或动态 composer 避让。
- 统一拒绝/异常/未知结果后的全文复制、精确剪贴板读回、具体原因反馈；未知结果锁定输入链路，不重放。
- 移除不能证明选区和 IME 安全的候选粘贴路径。当前 helper 仅只读预检，已有草稿和空草稿都不输入。**安全追加仍是未完成 P0，不能据此把产品目标降格成复制 Demo。**
- 复用现有 FileHandle 增加非阻塞内核独占锁；新锁协议持有稳定 inode，异常退出后持锁证明无活跃 owner，原样备份未完成记录再恢复，绝不重放保存。旧 nonce/未知锁保留拒绝。首次锁文件通过修正后的 `File.writeNew` 完整初始化再原子发布，失败清理不删除已发布路径，避免 split lock。未建立第二个 Runtime、Host 或业务配置源。
- 保存读取前冻结条目 ID 与编辑版本，防止切换 A→B 后将 A 内容存到 B。删除、导入、核对、排序完成时保护操作期间的新草稿；确认对话也检查版本。
- 修复保存反馈把渲染引起的版本变化误当新编辑：以实际 dirty 状态提示。相关 3 项用例通过，最终自有窗口截图显示简短的“已保存并从文件读回”。
- 手填短标签在保存时核验 1–2 个可见字素。导入去重键对齐 Browser 的 NFC、CRLF→LF、trim，存储正文原文不变。导出提示 Browser 的 8 KiB 库限额。

## 要求与证据矩阵

PASS 仅表示该行明确写出的范围；内存通过不代表真实桌面通过。

| 要求 | 当前状态 | 源码、测试及真实证据边界 |
| --- | --- | --- |
| 真实 Codex 身份、PID、native handle、前后台 | BLOCKED | CUA 对 `/Applications/ChatGPT.app` 再次明确拒绝 `com.openai.codex`；未换通道访问 |
| 多窗口、关闭重启、短暂焦点变化 | BLOCKED | 有身份核验源码和内存用例，无真实 Codex 证据 |
| 默认开启跟随、其他应用前台隐藏 | BLOCKED | 默认接线及 8 个事件订阅内存通过；真实行为受上述限制 |
| 内容内部左侧、居中、输入区避让 | BLOCKED | 新 frame 边界内存通过；底部仅预留 152pt，不保证动态输入区避让 |
| 移动/缩放延迟、拖动保存、跨屏恢复 | BLOCKED | 既有源码；未做 Codex live 验收 |
| 空草稿输入、已有草稿安全追加 | FAIL | 公开 AX 契约没有可靠文本选区、末端插入点和组合态；helper 主动拒绝，未提交输入 |
| 不覆盖、不按 Enter、不切 backend 重试 | PASS | 当前 helper 无写入动作；不能据此声称追加功能已达成 |
| 多行、长草稿、Unicode、选区、IME | BLOCKED | 复制 Unicode 已实测；composer 场景未验证，可靠表示/安全追加尚未实现 |
| 拒绝后自动全文复制及原因 | PASS | 5 类拒绝内存用例通过；自有管理器实际全文复制与剪贴板精确比对通过 |
| unknown/异常不重试、回读失败不报成功 | PASS | 定向内存用例通过；真实 Codex unknown 场景未运行 |
| 管理器新建、编辑、保存读回、复制、导出 | PASS | 隔离库真实原生窗口完成，revision 0→1→2，正文含换行、Emoji、组合音标 |
| 删除、启停、排序、列表/工具栏分页 | NOT_TESTED | 已有源码和内存覆盖；本轮只新增删除交错回归，未扩大 live 场景 |
| 保存等待时切换记录不写错 ID | PASS | 新增交错用例验证 A/B 均未被改写，返回 EDIT_CHANGED |
| 保存/删除期间新草稿保留 | PASS | 相关增量用例通过；删除期间新正文及 dirty 均保留 |
| 未保存关闭保护、保存失败和未知提交 | PASS / NOT_TESTED | 关闭/故障/unknown 定向内存通过；新增异常退出恢复、保存门禁、只读核对与明确保存的自有 Runtime 主路径通过。全部故障 live 场景仍未测 |
| 草稿异常退出恢复、活跃实例隔离 | PASS | 当前 main.js + recovery.js 的真实 Runtime 双 execution 争锁、受控 SIGKILL、重启完整 Unicode 恢复、核对不重放、明确保存一次通过；只覆盖最近确认 checkpoint |
| 连续崩溃基线、第三版本、未提交意图保留 | PASS | 独立静态审查发现 3 个 HIGH 后修复，定向内存通过；这些故障未全部做 live 注入 |
| 管理器关闭后原生栏恢复 | PASS | 自有窗口实际关闭管理后截图；只有同一自有 toolbar |
| 重启后数据恢复 | PASS | 隔离库 revision 2；同一源码/固定宿主重启后真实原生栏恢复“验收”槽位；不含相对位置恢复 |
| 跨进程同锁互斥 | PASS | Mac 隔离双进程竞争验证活跃 owner 不被抢占；并发及 baseline/revision 定向内存通过 |
| 两个管理 execution 保存无丢失更新 | NOT_TESTED | 底层跨进程互斥及冲突保护已验证；未声称双管理器完整写入 live 通过 |
| 新协议崩溃锁安全恢复 | PASS | 明确自建 holder 进程 SIGKILL 后新进程取得内核锁；遗留记录逐字备份、fixture 库字节未变，无保存重放；证据 kernel-lock/receipt-result.json |
| 旧版 nonce/未知锁迁移 | BLOCKED | 旧 writer 不参与内核协议，无法仅靠新锁证明旧 owner 退出；保留未知内容并拒绝，不按年龄删除 |
| Browser v1/v2 双向模型校验 | PASS | 独立 Browser 正式 model 8 项通过；实际 Runtime 导出另由正式 parser/plan 校验通过 |
| 预览确认、去重、图片降级、无效/超限 | PASS | 正式 Browser model 与实际本例 handler 内存集成通过；Browser UI 未操作 |
| 正式 Browser UI 导入与持久化 | NOT_TESTED | 不把 model/schema 通过表述为 UI 迁移通过；8 KiB overLimit 被正式模型拒绝 |
| Retina/边缘/负坐标/双屏/Space/Mission Control/遮挡/浅色/键盘 | NOT_TESTED | 当前截图为本机 Retina 自有窗口；其余没有本轮 live 证据，不模拟通过 |

## 增量验证

证据根目录：`.runtime/tests/codex-prompt-shortcuts-r12/`，均为本地运行产物，不提交。

- 开始时业务基线：`node --test tests/custom-ui/codex-prompt-shortcuts.test.cjs`，127 项，125 通过、2 项可选 oracle 跳过。
- helper 修改后：`node --test tests/custom-ui/codex-prompt-insert.test.cjs`，65/65 通过；这是内存安全测试。
- 中途组合 211 项中 1 个旧状态文案断言失败；已调整为当前“写入未就绪”事实，并在下面相关定向用例通过后停止扩大重跑。未宣称最终全组重新通过。
- `node --test --test-name-pattern='edits arriving|failed new-item save|reconcile rejects|cancelled reconciliation|failed reconciliation|native manager close|cancelled explicit close|explicit calibration|default startup|relative placement|automatically copies full Unicode|thrown input helper|failed fallback|invalid manual label' tests/custom-ui/codex-prompt-shortcuts.test.cjs`：18/18，通过，`core-incremental.tap`。
- `node --test --test-name-pattern='^(save pending field reads|delete pending persistence)' tests/custom-ui/codex-prompt-shortcuts.test.cjs`：2/2，通过，`edit-races.tap`。
- `OPENDESK_BROWSER_MODEL=/Users/shopme/Documents/workspace/opendesk-browser/examples/sidebar-tools/prompt-shortcuts/trusted/model.js node --test tests/custom-ui/codex-prompt-browser-compat.test.cjs`：8/8，通过，`browser-final.tap`。Browser HEAD `66974f0f232a8435ae5d2a9693f9eb56b38848e6`，观察时 clean；模型 SHA256 `9916ab6b843794ce87c104834a85982c8e2b23d91a1240ae7f004db47bff7f50`。
- 自有窗口 `own-core-current-logs/`：新建、编辑、保存、读回、复制、导出实际通过；`actual-export-oracle.json`：实际导出被正式 Browser 读取，正文匹配，added=1，overLimit=false。
- 自有窗口探针首次因前台变化安全停止，未提交动作；后续仅使用明确自有 PID/handle 的 AX 动作。重启后 toolbar 的标题查询及仅 PID 查询均返回 NOT_FOUND，未获得 AX 树；未继续扩大探测，最终以自有 getState 提供的固定 nativeWindowId 截图核验。该观察限制没有伪报通过。
- 持久化改动后仅运行 `node --test --test-name-pattern='persist|post-commit|STALE|exclusive lock|lock release|precommit|reconcile|reconciliation|inactive v1|active kernel|new draft input|selection change' tests/custom-ui/codex-prompt-shortcuts.test.cjs`：22/22，通过，`kernel-lock/persistence.tap`。
- `./dist/opendesk -script tests/runtime-api/file-lock.js -console-mode script`：真实 Mac 单句柄幂等、第二句柄排斥、关闭释放、关闭后拒绝、独占完整发布。隔离双进程实际运行同一 lock.js：活跃竞争、SIGKILL 恢复、精确保留备份、未知旧锁拒绝，`kernel-lock/receipt-result.json`。首次探针因直接 CLI 的同脚本替换机制取消 holder，已保留 failure 记录；改用两个薄测试入口加载同一 helper 后验证，没有制造第二套 Runtime。
- 保存反馈修复后仅运行 `node --test --test-name-pattern='clean successful save|edits arriving|save pending field reads' tests/custom-ui/codex-prompt-shortcuts.test.cjs`：3/3，通过，`kernel-lock/save-feedback.tap`。
- 当前构建自有管理器：`kernel-lock/ui-save-result.json` 确认完整正文、revision 1 与 released receipt；最终源码的 `feedback-logs/summary.json` 为 succeeded。两个 AX 静态文本读回探针未能确认状态文字（保留失败日志），未重放保存，改以实际查看的 `kernel-lock/manager-final.png` 证明状态文案；不将 AX oracle 报为通过。
- 原生边界刷新固定开发构建并校验签名；API 文档 generate/check 和合同检查通过。导航检查仍报告既有 canonical gaps，未扩大解释为全部 API 语义认证。
- 未新增或重跑 Toast、tooltip、catalog、全仓、Windows、VM 等低相关性验证。

## 入口、构建与真实加载

普通入口从仓库根目录执行：

```bash
./opendesk -ui -script examples/custom-ui/codex-prompt-shortcuts/main.js -console-mode script -log-dir .runtime/examples/custom-ui/codex-prompt-shortcuts
```

该默认 follow 命令本轮未实际执行，避免触及已被拒绝的 Codex 访问；不得写成命令通过。根目录 `opendesk` 实际是 128-byte 构建转发 shell，非旧独立二进制；`dist/opendesk` 同样指向开发 App 主程序，未覆盖这些入口。

本轮实际运行使用隔离数据目录和显式 copy 模式，唯一脚本仍是仓库 main.js：

```bash
OPENDESK_CODEX_SHORTCUTS_MODE=copy /Users/shopme/Documents/workspace/opendesk/opendesk -ui -script /Users/shopme/Documents/workspace/opendesk/examples/custom-ui/codex-prompt-shortcuts/main.js -console-mode script -log-dir /Users/shopme/Documents/workspace/opendesk/.runtime/tests/codex-prompt-shortcuts-r12/restart-final-logs
```

实际工作目录：`/Users/shopme/Documents/workspace/opendesk/.runtime/tests/codex-prompt-shortcuts-r12/fixture`，故其 library.json 只是受控测试 fixture，未增设生产库。

主程序 `dist/OpenDesk.app/Contents/MacOS/opendesk`，host `dist/OpenDesk.app/Contents/Helpers/opendesk-ui-host`。本轮原生修改后按正式 `scripts/build_macos_app.sh` 刷新，最终构建时间 2026-10-27 19:14:07；主程序 SHA256 `30341ca8bf28ec4300bcc184a604433d758676233f8ba9f13dc243ca14632e1c`，host `a898af76bf51f63c423b9e9612002e09f972ebe744ff75b01ffb94cc918f1e14`。`codesign --verify --deep --strict` 通过，固定 `com.opendesk.cli`/adhoc 身份未改。构建是在阶段提交前进行，嵌入 VCS 仍为 `39ff3eeb…`、modified=true；不能冒称由干净的新 HEAD 构建。随后主程序源码仅调整新增行的行尾，未改变编译语义；外部 main.js 修复保存反馈后受控重启并记录加载 hash。

前段自有运行 host PID 2592、3823、4316，已经 scoped SIGINT 清理。锁能力验证的 host 11365、17088、17653 均由管理器“退出”正常结束；最终 17653/nativeWindowId 167442，`feedback-logs/summary.json` 为 succeeded，fileHandles/uiWindows/uiHostProcesses 均归零。最终源码 SHA256 `c23d83f5a28df8188050c3cd866c2eb40d6595a17ebd9818990a79da5197fc89`。实际工作目录为 `kernel-lock/feedback-fixture`，同样显式 copy、同一 main.js 与固定启动入口；未访问 Codex。全部自有实例已退出，保护服务 84099/84111、93082 保留，见 `kernel-lock/processes-final.txt`。本轮双进程锁探针只 SIGKILL 它自行创建且记录 PID 的 holder。

生产库前后 SHA256 均为 `046f55a4cef84b8be6aa77e50158c441a18cc477146ece1c13880bf5bcf8a4e4`，schema1、revision6、两条，settings 未变。

## 视觉、评分与 Git 边界

- 代码已修改：是。实际已加载：核心配置修复已在固定开发宿主加载；最终源码 SHA256 `c23d83f5a28df8188050c3cd866c2eb40d6595a17ebd9818990a79da5197fc89` 的加载与正常退出记录独立保留；早前 `5c3b22c0…` 仅属前段复制/重启证据。
- 视觉已确认：已实际查看自有 `manager-current.png`、`toolbar-current.png`、`toolbar-restarted.png`，仅含隔离数据。管理器导出长路径曾挤高底部状态，已改为短结果、完整路径留日志；最终还实际查看 `kernel-lock/manager-final.png`，760×600 原有分栏与正确保存反馈。未重新触发导出来验证其最终文案，不声称全视觉通过。
- 功能已验证：上表明确的自有配置/复制及模型集成范围；真实 Codex 产品功能未通过。
- 产品完整性、桌面交互、原生可靠性、数据安全、测试维护五维均未最终评分，综合分未计算，未满足各 ≥95。按最新用户指令先完成核心，不为凑评分追加评审或边缘测试。
- 本轮直接修改：main.js、insert.js、lock.js、README.zh-CN.md、业务测试、helper 测试、新 Browser 兼容测试及本记录；持久化基础另含 automation/file.go、file_handle.go、file_lock_unix.go、file_lock_other.go、utils.go、File 类型、正式 File API 文档/生成导航与 file-lock.js。继承的 native Toast/tooltip、资产、catalog 等未在本轮重写。此前状态/差异留于 `inherited-status.txt`、`inherited.patch`、`main.before.js`。
- 开始时 fetch 后 master 和 origin/master 均为 `39ff3eebad34de5c020ebe699909129600d76d56`。本轮对归属明确且独立的 File 持久化基础 9 个文件作阶段提交 `b7280bef765a4fe5c6076643d5c8313733d39e2b`，遵守 Lore；提交明确标明产品验收未完成。产品 main/README/业务测试仍混有继承修改，连同本轮 lock.js 保留工作区，未混入 native Toast/tooltip、资产等他人修改或 `.runtime/`。跨聊天只读清单请求超时，不能推断无并行 owner。未建分支/worktree/PR，不批量暂存、不 force push。推送与远端 SHA 核验见下方最终 Git 记录。

后续必要条件：具备允许访问 Codex 的验收环境；实现可证明选区/末端插入点/IME 状态的正式 Runtime 能力及单次输入回读；旧协议锁需先取得 owner 退出证据后安全迁移。原始产品目标保持未完成。

## 阶段 Git 记录

阶段提交 `b7280bef765a4fe5c6076643d5c8313733d39e2b` 仅包含 9 个归属明确的 File API/实现/JS 测试文件。产品整体验收未完成，main.js、lock.js 及混合继承改动保留未提交。已推送 `origin master`；服务器 `refs/heads/master`、本地 HEAD、origin/master 均为上述 SHA，祖先关系分叉计数 `0 0`。工作区仍保留未提交产品/继承修改，暂存区为空。

## 19:43 续接增量：草稿崩溃恢复

本次仅修改 `main.js`、新增脚本本地 `recovery.js`、对应业务内存测试、README 和本报告。`insert.js`、`lock.js`、Browser 兼容实现、原生 Host/Runtime、通知、品牌资产和布局没有修改。未扩大执行 Browser、Toast、tooltip、catalog、全仓或跨平台矩阵。未向原聊天发消息、未改变旧 goal 状态。

- 开始时只读核验 HEAD、origin/master、服务器 master 都为 `b7280be…`；生产库 hash 与交接一致。本次未取得可核对的跨聊天清单结果，不能据此推断没有并行 owner；不覆盖继承修改。
- 新增每实例持锁的草稿恢复记录、按序 checkpoint 与读回、提交前意图记录。重启恢复先阻止保存，只读核对后保留草稿；不会自动重放业务写入。明确放弃先确认 clean checkpoint，关闭失败保持内存编辑可用。
- 独立静态审查曾发现 3 个 HIGH：连续两次崩溃会丢原始基线、核对绕过未知提交且清除意图、关闭 checkpoint 等待期间丢输入。已分别保留原始基线、只接受原/预期版本并在清意图前独占精确备份、建立关闭屏障并对在途输入取消关闭；新增对应回归。同一独立审查者复核当前修复，确认这三项均已解决，未发现此范围仍有阻塞问题。静态审查不作动态通过证据。
- 第一轮相关内存 32/32，通过，`draft-recovery/incremental.tap`；审查修复后只跑受影响恢复/关闭/核对，18/18，通过，`draft-recovery/review-fixes.tap`（其中新恢复用例共 13 项）。不把两轮相加冒充独立 50 项。
- 最终真实运行 `draft-recovery-final/result.json`：唯一生产 main.js 在隔离 cwd `draft-recovery-final/fixture`，显式 copy，同一固定根启动器；第一 host 23143 的活跃草稿未被另一个真实 execution 接管。只 SIGKILL Node controller 自建并记录的主进程；旧自有 host 随 pipe 结束退出。第二 host 23229 恢复精确正文，含空白、换行、Emoji、组合音标；恢复前点保存被 `RECONCILE_REQUIRED` 拒绝且库未创建；核对不创建库；之后明确保存一次得到 revision 1、正文精确，正常退出。日志中的该错误为预期门禁证据。
- `draft-recovery-final/own-after-crash-logs/summary.json` 为 succeeded，源码 hash `26f999fb991fb3af7e5c3774a8636012dc01b774b488c416b1ac4fb16daa8b87`；`recovery.js` hash `02f88dd6db8075c5f73c6e1f25694eaeb93884e300c9a31aeaf36845215c049f`。只增加外部 JavaScript；主程序/host hash 与前段配套构建一致，签名复核通过，未重新构建或替换签名包内容。
- 已实际查看 `draft-recovery-final/manager-recovered.png`：仅含隔离验收文字的自有窗口，760×600 分栏、完整草稿和“磁盘已核对；恢复草稿仍未保存，将另存为新条目”可见，无布局调整。截图由已核验的自有 PID/native handle 单窗采集，不含 Codex。
- 最终 cleanup 事件确认 fileHandles、fileJSONWorkers/Temps、uiWindows、uiHostProcesses、eventSubscriptions 为 0。保护的 installed OpenDesk 84099/84111 和 Browser native-host 93082 保留。生产库仍为 `046f55a4cef84b8be6aa77e50158c441a18cc477146ece1c13880bf5bcf8a4e4`，未写入。
- 限制：恢复最近确认的 checkpoint，不承诺进程在 checkpoint 完成前终止时的最后一笔编辑，也不承诺断电持久性。干净记录与意图备份保留，尚无自动清理。双管理器完整保存无丢失更新、全部故障 live 注入、Browser UI、Codex 全部主路径仍未完成。

安全追加能力另经独立源码/合同核对：当前公开属性无文本选择范围/caret；元素 `selected` 不是文本选择；macOS owner 未实现 IME 组合态证明；`setValue` 写整个值，键盘输入分 UTF-16 批次投递，均不能满足目标。最小正式能力需同一受管 ref 的完整文本/范围/组合态（含 unknown）及带版本前置的单次追加；仅添加 AX 范围仍无法证明组合态或消除读后写竞态。严格保证需要目标编辑事务协作，当前没有已核验的 Codex 路径。未添加一个只能在自有编辑器通过、却声称适用于 Codex 的 API；P0 追加仍 FAIL，Codex live 继续 BLOCKED，未换通道探测。

代码已修改：是；实际已加载：上述最终 hash；视觉已确认：仅上述自有窗口；功能已验证：本节范围。五维尚未最终评分，综合分未计算，整体未完成。产品接线与测试仍有继承混合改动，本次未新提交/推送；当前 HEAD 和远端仍是已推送的 File 基础阶段 `b7280be…`，暂存区为空，不把它写成产品完成。

## 核心跟随与层级续接

本轮目标为 G1 跟随身份与移动/缩放收敛、G2 层级与焦点隔离、G3 相对位置恢复、G4 安全追加。第一项工程产物为下表；开始时重新核对主程序/host/main/recovery 和生产库 hash 均与上节一致，master/HEAD/origin/master 仍为 `b7280bef765a4fe5c6076643d5c8313733d39e2b`，暂存区为空。受保护进程 84099/84111、93082 路径和启动时间一致，未终止。沿用已发生的 Codex 访问拒绝，不重复探针或换通道。

| 核心项 | 源码实现 | 内存验证 | 自有受控实窗 | 真实 Codex 实窗 | 最终状态 |
| --- | --- | --- | --- | --- | --- |
| G1 身份、移动/缩放后 500ms 收敛、前后台与生命周期 | JS registry + app/PID/id/handle；有效目标在动画中变化直接更新位置；原生移动保持布局尺寸 | 相关身份/动画/拖动取消覆盖通过；新增尺寸 JS Runtime 回归四轮通过 | 历史移动/缩放 390/414/459ms、后续移动 353ms；最新构建换窗/切回 1123/864ms，替换 968ms；旧窗口句柄拒绝 | BLOCKED：既有访问拒绝 | 当前 500ms FAIL；真实 Codex BLOCKED |
| G1 内容左侧、居中与动态 composer 避让 | profile 窗口相对 24/64/152pt 回退；精确内容与动态避让未实现 | 回退边界、无效区域覆盖 | 已查看左侧居中和拖动后截图；固定输入标记未覆盖 | BLOCKED | FAIL：动态避让缺口 |
| G2 原生层级、可见/onScreen、焦点与管理器隔离 | 拖动等待不阻塞失焦；管理器取消旧拖动 | 精确 toolbar 与共享 host 其他窗口隔离覆盖通过 | toolbar layer3、目标 layer0 且实图可见；失焦隐藏 404ms，管理器显示时隐藏 | BLOCKED | 自有局部 PASS；真实 Codex BLOCKED |
| G3 拖动、相对偏移、重启恢复与旧绑定失效 | 读回前后取消版本核验、相对偏移持久化和回读 | 排队/在途回调/首次读回期间取消覆盖通过 | 真实拖动 +90/+30，隔离库保存；快捷栏与目标进程同时重启仍恢复；新 PID 已核对，旧窗口/进程句柄 STALE_TARGET | BLOCKED | 自有局部 PASS；真实 Codex BLOCKED |
| G4 空/非空、Unicode、选区/caret、IME、单次安全追加 | 未实现，现有 helper 只读拒绝并全文复制 | 复用已有拒绝/未知结果安全覆盖；定向复核能力 | 复制与数据证据复用；不造自有编辑器冒称 Codex 支持 | BLOCKED | FAIL：必要编辑事务能力缺少 |

验收以事件时间和实际 native bounds 为准，稳定后 500ms 内收敛；固定 sleep 不作通过证据。自有窗口必须有明确测试身份与真实 handle，不伪装 Codex。无新信息时停止探针；未通过核心前不启动五维评分。

### 当前实现与实测边界

- 用户最新要求优先 ChatGPT（Codex）桌面应用，并以 JavaScript 支持后续多软件。新增脚本本地 `targets.js`，默认仅注册 `com.openai.codex`；`main.js` 惰性加载 registry，保留非空 `settings.appBundleId` 的显式覆盖语义。新增 profile 可同时检测，但 Claude 尚无经核验的真实 profile，未编造标识或适配通过结论。无新 Runtime、Host、公共 API 或库 schema。
- 实际修复：拖动 debounce 不再阻塞失焦隐藏、目标移动或更换；不再用 750ms 时间窗吞掉快速真实拖动，改为比对精确 native bounds；管理器/重置/关闭跟随取消旧拖动，延迟保存前复核当前前台目标；显示动画尾部目标 bounds 变化立即排入下一次同步，避免永久隐藏。独立静态审查额外发现首次 `getState` 在途期间可跨取消重建 timer 的 MEDIUM，已补先红后绿回归并修复，审查者定向复核撤回发现。
- 最终内存命令为 README 的三文件组合：234 项，232 通过、2 项 optional Browser oracle 跳过、0 失败，`core-follow/final-integration.tap`。未设置本次可选 Browser model 路径，复用前段 8/8 的模型证据；未宣称本次重跑 Browser UI。`git diff --check` 通过。没有运行全仓/native/跨平台矩阵。
- 自有测试用固定根启动器、原有签名开发主程序与 host，两个普通 OpenDesk execution，目标标题明确标注 NOT Codex。精确查询仅限预先登记的自有 PID/id/native handle；没有访问 Codex，没有替换目标 bundle ID。测试对生产 main 仅替换末尾 `main()` 为 `main(false)`，另注入限定自有身份快照、已知句柄前台解析及 scoped Events；自身目标 move/resize/close 通过事件文件传输。因此这些证据不能证明生产全局 Events 后端、真实 Codex 应用发现或目标 UI 区域测量通过。
- `core-follow/phase-one-v7.json`：13 个场景完成状态/几何读回，含自有移动/缩放 390/414/459ms、无关前台隐藏 404ms、管理器隐藏、双窗口及替换后旧 handle 拒绝。切回前台 619ms、关闭管理器恢复 507ms、第二窗口 535ms、窗口替换 849ms，不能把整轮写成 500ms 通过。整轮后因 agent 未及时回写截图检查信号，harness 在截图等待处以 `OWN_VISUAL_REVIEW_TIMEOUT` 退出；保留 `failure-v7.json` 和 `core-v7.log`，不将该轮标为整体成功。
- 实际查看第一阶段的自有 `follow-visible.png`、`before-drag.png` 后，仅补受影响的拖动和重启：`drag-result.json` 与 `restart-result.json` 均 passed、errors=[]。真实 mouse 拖动本次精确 native toolbar 顶部 +90/+30，隔离库保存相对偏移，目标再移动后栏仍按偏移定位（该次观测 585ms）；重启后恢复 +90/+30，实际定位读回 138ms。另实际查看 `after-drag.png` 和 `restart-relative-offset.png`：五按钮原生栏可见、尺寸和对齐正常，底部固定输入标记没有被覆盖；这些截图只含自有测试内容，不证明 Codex composer 避让。没有为测试新增自有编辑器并声称可安全追加 Codex。
- 最终 main.js SHA256 `91c69d9717ccdd01dace23a6a924c7f5c3d78c214385323f0cd344dc8b74038d`、targets.js `62a5c1d4bfffa5d0fab223b420dfc3715465b5c0385d307cbc376815a53cdb3e`。拖动与重启 harness 从这些正式路径读取并加载同一源码；日志本身的 script_hash 对应 harness，不冒称正式入口 hash。配套主程序/host 的路径、构建时间及 hash 与上节一致，签名复核通过；本轮只改外部 JS，没有重建或覆盖签名包。文首普通默认 follow 一行命令仍未执行，真实 Codex live gate 仍 BLOCKED。
- 拖动、重启与自有目标均已正常退出，cleanup 的 fileHandles、fileJSONWorkers/Temps、uiWindows、uiHostProcesses、eventSubscriptions、timers 为 0；保护的 84099/84111、93082 进程仍在且启动时间一致。生产库 SHA256 仍为 `046f55a4cef84b8be6aa77e50158c441a18cc477146ece1c13880bf5bcf8a4e4`，未改写。
- 本次直接修改仅 main.js、targets.js、对应两个测试文件、README 和本记录；insert.js/lock.js/recovery.js、native UI、品牌、Browser 与其他继承改动未重写。master/HEAD/origin/master 仍为 `b7280be…`，本次没有提交、推送、新分支或 worktree，暂存区保持空。五维无最终评分，综合分未计算，原始产品目标未完成。

代码已修改：是；实际已加载：上述 main/targets 的自有 scoped harness；视觉已确认：仅自有窗口；功能已验证：本节明确的跟随/隔离/相对偏移范围。待完成项仍为允许访问真实 Codex 的环境、精确内容与动态输入区适配、全面 500ms 跟随、G4 所需正式编辑事务能力；不以自有测试替代它们。

### 21:04 增量：直接目标配置与显示恢复耗时

用户要求继续以 JavaScript 直接设置应用目标并完善位置/层级。本轮只修改 main.js、targets.js、各自现有测试、README 和本记录；生产默认目标仍是 `com.openai.codex`。业务脚本本身通过公开 App/Window/Events API 工作，不依赖 CUA；但既有 CUA 针对 Codex 的明确拒绝不能通过 CLI/截图改道执行同一受限访问，本轮没有读取 Codex 窗口或屏幕内容。

- 修复显式 `settings.appBundleId` 匹配已注册应用时丢失专属区域规则的问题：仅查询指定身份，同时保留其 `contentArea`；未知应用仍使用明确回退；同一 bundle 有多个 layout profile 时在查询前拒绝。默认 profile 显示名为“ChatGPT（Codex）桌面应用”，未增加未核验的 Claude 标识。
- 原生显示后的采样从 6×100ms 调整为最多 15×40ms；稳定状态仍要求连续匹配的 native bounds/visible/onScreen，并逐轮核验当前目标与前台。稳定帧的主动等待从约 300ms 降至约 120ms；native API 实际耗时另计，不宣称严格 600ms 总超时或 500ms 全面保证。
- `direct-target/before.tap` 的 4 个相关断言先失败；修复后 `after.tap` 10/10（含动画/失焦回归）。最终 `node --test tests/custom-ui/codex-prompt-shortcuts.test.cjs tests/custom-ui/codex-prompt-targets.test.cjs`：172 项，170 通过、2 项可选 Browser oracle 跳过，0 失败，`integration.tap`。insert/lock/recovery 未改，未重跑旧的 helper、Browser UI、native 或全仓矩阵。`git diff --check` 通过。
- 真实运行固定根启动器和原有签名 host，仅测试本次创建的两个自有 OpenDesk execution：目标 host 81884/nativeWindowId 167705，toolbar host 81941/nativeWindowId 167711。沿用上节的 exact-own window/app/event 接线，无全局窗口读取、无 Codex 访问。`direct-target/result.json` passed=true、errors=[]；移动 353ms、失焦隐藏 243ms、切回显示 486ms、管理器隐藏 85ms、关闭管理器恢复 455ms。切回和管理器关闭后的同步流程完全结束分别为 628/597ms，几何/可见收敛与同步结束分别记录；只证明这些有限自有场景，旧的双窗口/替换等场景未重验。
- 已实际查看 `direct-target/current-position.png`：原生栏 bounds=(264,266,60,280)，目标=(240,90,920,720)，符合当前左侧/垂直居中的窗口相对回退。toolbar layer=3、visible/onScreen=true、alpha=1，五按钮正常，固定底部输入标记未遮挡；图中明确标注自有目标，不证明真实 Codex 内容区、动态 composer 或层级验收通过。
- 本次 main SHA256 `9f1d3475c585dfeb918249e86732d9b17656b538f768f856ad7a67ac9c7eab3c`、targets SHA256 `6998ba4339b6a339d856049c601bd508cb9f524c1fcc7f279b3360541767a1b7`。自有 harness 从正式路径读取源码，末尾 main(false) 与 scoped 接线边界同上节；harness hash 不冒称正式入口 hash。主程序/host SHA 与 19:14 构建一致，codesign 深度严格复核通过；只改外部 JS，未重建或修改签名包。普通默认 follow 一行命令仍未执行，真实 Codex gate 未通过。
- 自有测试已正常退出，资源清理结果和生产库核验见该目录的最终检查；受保护服务不改动，暂存区保持空。本轮未提交或推送。代码已修改、在自有 harness 实际加载、仅自有窗口视觉确认、上述有限功能已验证；G4、动态避让和真实 Codex 状态仍按前表保留，不评分、不标产品完成。

### 21:18 增量：动画中更新位置与进程生命周期

本次仅继续修复 main.js 的跟随逻辑和现有业务回归，更新 README 与本记录。目标适配仍采用 JavaScript registry，默认目标及生产库不变；没有执行真实 Codex 默认入口或改道读取 Codex。

- 首轮自有双窗口运行发现切换 963ms、窗口替换 856ms。有效目标的 frame 在原生显示动画中改变时，旧逻辑会 hide 后重播 show。新增“动画中有效目标移动/更换只显示一次”的两个回归，`lifecycle/animation-before.tap` 先失败；修改后直接更新同一栏的位置，保留精确身份、前台和连续 native bounds 核验。无有效目标时仍立即隐藏；其他读回阶段的有效变化排入同步，不重新显示。
- 定向 8/8 通过；最终 `node --test tests/custom-ui/codex-prompt-shortcuts.test.cjs tests/custom-ui/codex-prompt-targets.test.cjs`：174 项，172 通过、2 项可选 Browser oracle 跳过、0 失败，`lifecycle/integration.tap`。本次没有修改 insert/lock/recovery、Runtime/native/API 文档或 Browser，没有重复运行其历史矩阵；`git diff --check` 通过。
- 实窗沿用限定自有 native handle 的双 execution 接线和固定根启动器。`lifecycle/windows-result-before.json` 保留修复前数据；最新 `windows-result.json` 功能断言 passed=true，初始 131ms、第二窗口 376ms、切回 349ms、替换 724ms（同步完成 838ms）。旧窗口读回拒绝为 STALE_TARGET。passed 只表示身份、收敛和偏移断言，不表示 500ms 全项通过；替换仍超过 500ms，保留 FAIL。测试框架的 scoped Events 和应用组快照不能证明生产全局事件或 Codex 应用发现通过。
- 两个进程均退出后重新启动目标及快捷栏：目标 host PID 84695→85999，toolbar host 85638→86047。真实 App.get 的自有 host 路径快照包含新目标 PID、排除旧 PID；旧进程窗口明确拒绝 STALE_TARGET。`lifecycle/process-result.json` 确认同一隔离库仍为 offsetX=90、offsetY=30，初始定位读回 137ms。偏移来自前轮实际鼠标拖动的库副本，没有直接写入待验证的偏移。不能据此声称真实 Codex 重启已通过。
- 已查看最新 `second-window.png`、`replacement-window.png` 和 `process-restarted.png`。自有五按钮栏可见、无内部裁切，底部固定输入标记未被覆盖；保留已拖动的位置，不把测试背景文字当作真实内容区测量。真实 Codex 内容边界、动态 composer 避让和所有显示器场景仍未验证。
- 本次 main SHA256 `a1e218825d6239180eccbc31a2acac534e47174d22bcd98c2f360afa61c1b9aa`，targets 保持 `6998ba4339b6a339d856049c601bd508cb9f524c1fcc7f279b3360541767a1b7`。harness 从正式路径读取相同外部源码，仍用 main(false) 与明确的自有接线；运行日志 script_hash 属于 harness。配套 native SHA 与 19:14 固定构建相同，没有覆盖签名包。一次复测命令漏加 -ui，因 UI_DISABLED 失败，保留 `windows-after-logs`；补回文档已有的 -ui 后，`windows-after-ui-logs` 与 `process-restart-logs` 均 succeeded，不隐去失败，也不将其解释为 Codex 被拦截。
- 自有实例全部正常退出。`lifecycle/final-checks.json` 的各次 cleanup 全部资源计数为 0，已知自有 host 不再运行；84099/84111、93082 的路径和启动时间保持一致。生产库 SHA256 仍为 `046f55a4cef84b8be6aa77e50158c441a18cc477146ece1c13880bf5bcf8a4e4`，未改写。HEAD/origin/master 仍为 `b7280bef765a4fe5c6076643d5c8313733d39e2b`，暂存区为空，本次无提交、推送或新分支。

代码已修改：是；实际已加载：仅上述自有 harness；视觉已确认：仅上述自有窗口；功能已验证：有限跟随、生命周期与真实保存偏移恢复。剩余核心缺口是窗口替换耗时、精确内容与动态输入区适配、可靠单次安全追加，以及获准环境下真实 Codex 验收；G1 未全面通过、G4 FAIL、真实 Codex BLOCKED，继续不评分、不标产品完成。

### CLI 增量：移动时保持原生工具栏固定尺寸

用户明确要求直接调用 OpenDesk CLI 继续完善。本次实际运行 JS 接口回归与限定自有窗口的跟随脚本，没有调用 CUA，也没有通过 CLI 改道访问 Codex。目标与跟随业务仍为原有 JS；修复位于 macOS native owner 的已有 setBounds 分支，仅对原生 toolbar 使用布局确定的固定 minSize，防止位置调用把 WindowServer 动画缩小帧固化。未增加公共 API 或依赖。

- 问题证据：`cli-follow-delay/before-trace.json` 记录实际位置调用逐步保留 274/270pt 高度，原始栏为 280pt。新增正式 JS 回归 `tests/runtime-api/custom-ui-toolbar-position.js`；最初只在隐藏状态移动的版本四轮通过，未触发问题。补上“显示后立即移动”后，旧构建第一轮稳定高度 276pt，明确报 POSITION_CHANGED_FIXED_TOOLBAR_SIZE，`custom-ui-toolbar-position/before-visible-move/summary.json` 为 failed。没有用未触发竞态的早期通过掩盖失败。
- 原生修复仅 10 行，基于创建时已固定的布局尺寸；运行时移动不能永久改变工具栏尺寸。正式 `scripts/build_macos_app.sh` 刷新同一开发 App，保持 com.opendesk.cli 和原 adhoc 身份，`codesign --verify --deep --strict dist/OpenDesk.app` 通过。首次构建因 PATH 未找到 Go 停止，随后指定本机现有 `/Users/shopme/.local/opt/go1.25.13-amd64/bin/go` 完成；没有下载编译器或修改系统 PATH。构建包含既有 AppKit deprecation warnings，没有编译错误。
- 修复后从仓库根目录实际执行：`./dist/opendesk -ui -script tests/runtime-api/custom-ui-toolbar-position.js -console-mode script -log-dir .runtime/tests/custom-ui-toolbar-position/after`。四轮 hidden/show/立即 setPosition 均保持原始 60×280pt，位置读回正确；同一脚本 SHA256 `69a9c8e45d65575aa8ca30b8e4082bb34ce19a770c73f697501d692d4d7937b2`，after 日志为 succeeded。没有编写 Go 测试替代公共 JS 回归。
- 当前主程序 SHA256 `c2a1abb57a95f644b3e2785935b4f9e1a802cedba370ee00bcfce00adaf49edd`，host `328eff93c8705b349cf838698cb49552c0676239b97116f05789199ea82e092c`；文件构建时间 2026-10-27 21:39:38。HEAD 为 b7280bef…，工作树仍有既有修改，不是干净提交构建。main.js/targets.js 本次未改，SHA 仍为 a1e21882…/6998ba43…。详细路径/hash 与运行边界见 `cli-follow-delay/provenance.json`。
- 自有跟随复验仍从正式 main 路径加载相同 JS，只注入前述 exact-own 接线与 main(false)；本次增加只读方法时序记录，无额外输入。旧构建同轮切换/切回/替换为 911/331/794ms；当前构建为 1123/864/968ms，替换同步结束为 1226ms。新构建的位置调用全部保持 60×280pt，旧窗口返回 STALE_TARGET，+90/+30 偏移保持。功能断言 passed 不表示性能通过，当前 500ms 明确 FAIL；不能继续用早前 376ms 声称当前构建通过。目标核验的调用中位数也由 68ms 变为 175ms，尚不能把整轮差异归因于本次补丁或环境，不再增加无依据重跑。
- 已实际查看当前 `second-window.png` 与 `replacement-window.png`：五按钮原生栏完整，layer3、目标 layer0，底部固定输入标记未覆盖。保持已保存拖动偏移，测试内容占位文字有覆盖；没有据此声称真实内容适配或动态 composer 避让通过。普通 Codex 默认 follow 一行入口仍未运行，真实 Codex gate 仍 BLOCKED；完整 Runtime catalog、Browser、跨平台与旧复制/锁/恢复矩阵本次未重跑。
- 全部自有进程正常退出，各次 native/API 日志 cleanup 资源计数为 0；受保护 84099/84111、93082 的路径与启动时间一致。生产库 SHA 仍为 046f55a4…，暂存区为空，HEAD/origin/master 未变，无新分支、提交或推送。`git diff --check` 通过；证据为 `cli-follow-delay/final-checks.json`。

本次直接修改：native_darwin.m、上述正式 JS 回归、README 与本记录。代码已修改并在刷新后的自有宿主实际加载，尺寸与自有层级视觉已确认，尺寸保持功能已验证；整体跟随性能、动态避让、安全追加和真实 Codex 验收仍未完成，不评分、不标产品完成。

### 22:32 增量：精确窗口刷新与隐藏后恢复

本轮从实际 AGENTS、混合工作树、正式启动器及 21:39 配套构建开始核对，再读取上述历史证据。修复了跟随路径的 native 查询开销和一个隐藏动画恢复竞态，并实际运行 OpenDesk CLI JavaScript。**整体仍未完成：当前候选没有有效窗口截图，真实 Codex BLOCKED，精确内容区、动态 composer 与安全追加未交付。** 未访问 Codex、未运行文首默认 Codex 命令；既有 CUA 明确拒绝的边界没有通过 CLI、截图或新会话绕过。

#### 修改与耗时归属

- `automation/window_manager_darwin.go` 的精确刷新原先先枚举并补全所有可见窗口的进程元数据，再另查前台窗口；每次前台 PID 查询又启动两次 `lsappinfo`。现在 `automation/cgwindow_darwin.go` 在一次 CoreGraphics 快照内按既定 PID/native handle 精确匹配、拒绝重复身份，只补全请求 owner，仍比较完整返回 ID；同进程其他窗口不能据此获得 foreground。保留取消、失效、应用身份与前台核验，没有用缓存或删减核验凑耗时。
- 前台 PID 改用实时 Process Manager 查询，失败关闭；未增加公共 API 或依赖。曾尝试 `NSWorkspace.frontmostApplication`，但 CLI 无 AppKit runloop 时观察到旧前台 PID，无关前台不隐藏的失败保留于 `exact-refresh/follow-stale-workspace/`，该实现已撤回。当前 Process Manager 接口已 deprecated，现有 macOS 编译/运行通过，其他系统版本兼容性仍是限制。
- 同一正式 JS 回归、16 次 exact refresh：旧构建 min/median/max=78/85/162ms，最终串行复验为 0/1/51ms。仅过滤 owner 的中间候选 median=43ms，不作为最终结果。旧 main 的约 175ms 目标核验是组合调用，不能与单次 `window.current` 混为一项。
- 最终跟随 trace 的 count/min/median/max（ms）：`targetWindow`=88/2/4/33，`window.current`=244/0/1/30，`getState`=224/0/1/21，`setPosition`=13/0/14/16，`show`=3/3/13/298，`hide`=3/1/2/3。`targetWindow` 含自有应用快照接线，不能推出生产发现耗时。20 个 `event.received` 是时间点，不是事件传输耗时为零；自有文件事件/ack 开销包含在整段收敛中，未单独量化，正式全局 Events 未运行。原生 show 动画开销仍存在。
- `main.js` 修复隐藏读回为 274pt、show 恢复 280pt 时把正确最终中心误判成 POSITION_UNCONFIRMED 的竞态。仅在连续 native bounds 已相同、且与最终高度算出的目标中心精确匹配时接纳；任意漂移仍拒绝，每轮仍复核目标。先红回归见 `inset-before.tap`；修复后的 13 个定向用例全部通过，包含错误 bounds、show 漂移、失焦、旧拖动/重置/管理器取消。未重跑历史全矩阵。
- 删除已退役 `lsappinfoPIDPattern` 的私有 Go 测试，并更新原分类行；公开行为用新正式 `tests/runtime-api/window-current-owned-macos.js` 验证，未新增 Go 公共契约测试。insert/targets/lock/recovery、本轮之前的 native 尺寸保护、Toast、tooltip、品牌及其他混合改动未重写。

#### 当前 CLI、构建与受控实窗证据

从仓库根目录实际运行正式 JS（仅创建/查询本 execution 自有窗口），本轮将输出定向到 `exact-refresh/verified-current`：

```bash
OPENDESK_CURRENT_EVIDENCE=.runtime/tests/codex-prompt-shortcuts-r12/exact-refresh/verified-current ./opendesk -ui -script tests/runtime-api/window-current-owned-macos.js -console-mode script -log-dir .runtime/tests/codex-prompt-shortcuts-r12/exact-refresh/verified-current-logs
```

`verified-current/result.json` passed=true：同进程 A/B 精确前台、同句柄移动/缩放、关闭重建、旧句柄 STALE_TARGET；16 次采样全部保留。该脚本 SHA256 为 `9fb6ad2a506a2ae81f035cbc1f9d224c695313035c52d0f17e1278576faa2ff9`，旧/新构建使用相同脚本。它不是默认 Codex 业务入口。

`follow-final/` 沿用两个普通 execution、已登记自有窗口、隔离库与事件文件接线。固定根启动器实际加载正式路径 main.js，末尾改为 main(false)，注入已知自有句柄的前台解析、应用快照和 scoped Events；没有替换为 Codex 身份。计时从 native 目标操作确认后的 snapshot 入口开始，包含后续状态/应用读回、文件 ack 与同步；按连续匹配的真实 native bounds/visible/onScreen 收敛判断，非固定 sleep 或最好一轮。最终完整轮次如下：

| 场景 | 收敛 ms | 同步结束 ms |
| --- | ---: | ---: |
| move-0 / resize-0 | 254 / 153 | 254 / 153 |
| move-1 / resize-1 | 161 / 163 | 161 / 163 |
| move-2 / resize-2 | 165 / 151 | 165 / 151 |
| 同 toolbar host 的无关普通窗口前台→隐藏 | 77 | 77 |
| 返回目标前台 | 258 | 317 |
| 管理器保持隐藏 / 关闭后恢复 | 31 / 148 | 31 / 238 |
| 第二窗口 / 返回第一窗口 | 223 / 198 | 223 / 198 |
| 关闭重建 / 旧句柄拒绝 | 188 | 188 |

另有初始读回 72ms，计时在 main(false) 完成后，不能当完整启动耗时。14 个场景状态/几何断言 passed=true、timingPassed=true、errors=[]，只证明该轮受控接线；不推广为生产 500ms 全面通过。+90/+30 来自前轮真实拖动的隔离库副本，当前随动仍保持，未直接写入期望偏移；本轮没有重新执行真实拖动或进程重启。

最终目标 host PID=16690，toolbar host PID=16711/nativeWindowId=168049；toolbar 读回 60×280pt、layer=3、visible/onScreen=true，目标为普通 layer=0。**本轮实际查看 `second-window.png`、`replacement-window.png` 发现只有桌面壁纸，无目标和工具栏，视觉验收 FAIL。** native screencapture 报无法从 rect 创建图像后，现有 fallback 输出了这两张图片；原因未查明，不能据此断言某项系统权限缺失。不得把状态读回、旧轮有效截图或该 PNG 文件存在当成当前候选可见/边距/裁切/输入区避让已确认。不再无依据重复截图探针。

失败及无效轮次均保留：`follow-stale-workspace` 的前台陈旧；`follow-live` 因两个 native UI 测试并行争抢焦点而无效（执行失误，已改串行）；`follow-serial` 暴露最终高度恢复竞态。最终结论仅使用修复后串行的 `follow-final` 与随后单独运行的正式接口测试，不挑取失败轮次中的快数据。

配套 App 通过正式 `scripts/build_macos_app.sh`、本机既有 Go 1.25.13 工具链刷新同一固定路径、com.opendesk.cli 与原 adhoc 身份。当前主程序构建时间 22:22:09、SHA256=`1454fb7f5deed9e7b1c2da6ec22bf128607eff6386f3e47164af16c6948e4e1c`，host SHA256=`328eff93c8705b349cf838698cb49552c0676239b97116f05789199ea82e092c`。外部 main SHA256=`a678126e483678ddc92bb936c4d5ec9a66c5c21908a1b040acb212abe8b256a6`，targets 保持 6998ba43…；native 构建后只有外部 JS 竞态修复，无需修改签名包。`provenance.json` 保存完整路径/hash，运行 summary 的 script_hash 是 harness，不冒称 main。构建与当前深度严格签名校验通过，含系统 API deprecation warnings。

#### 四列状态与未完成项

| 需求 | 源码实现 | 内存验证 | 自有受控实窗 | 真实 Codex 实窗 |
| --- | --- | --- | --- | --- |
| G1 精确身份与 500ms 跟随 | 本轮优化 exact refresh，保留身份核验 | 本轮相关 13/13 | 当前 14 场景读回通过，最长 258ms；旧句柄拒绝；当前视觉 FAIL；进程重启未重跑 | BLOCKED，默认入口未运行 |
| G1 内容内左侧居中/动态避让 | 仍为 left24/top64/bottom152 的窗口相对回退 | 仅回退约束回归 | 未测真实内容区，当前截图无效 | BLOCKED；动态 composer 未实现 |
| G2 前台/管理器/精确 host 隔离 | 保留 exact toolbar 身份与前台核验 | 本轮含失焦/漂移回归 | 同 host 无关窗口隐藏77ms、管理器隐藏/返回、layer/visible/onScreen 读回；全局 Events 未运行、视觉 FAIL | BLOCKED |
| G3 相对拖动与取消 | 保留版本取消/在途保护 | 本轮含重置/管理器/在途拖动回归 | 既有真实拖动库副本 +90/+30 随动保持；新拖动/重启未重跑 | BLOCKED |
| G4 安全追加/精确复制 | 仍拒绝输入；缺选区/caret/IME 与原子追加保护契约 | helper 本轮未改、未重跑 | 本轮未输入、未以自有编辑器替代验收 | 安全追加未完成；真实输入 BLOCKED |

正式 `Accessibility` 可读属性不能证明上述文本状态；当前 G4 的拒绝并全文复制仅是安全兜底，不算追加交付。空草稿同样不能豁免这些条件。没有用全框重填、无保护粘贴、Enter 或 backend 重试。

代码已修改：是。当前构建与源码实际已加载：仅上述正式接口及自有 scoped harness。当前窗口视觉已确认：否，FAIL。功能已验证：仅表中当前读回范围。真实 Codex：BLOCKED。未改原目标，无评分或完成声明。

#### 数据、服务与最终检查

`exact-refresh/final-checks.json`（22:32）确认生产库 SHA256 仍为 `046f55a4cef84b8be6aa77e50158c441a18cc477146ece1c13880bf5bcf8a4e4`，未用于测试；84099/84111 路径与 Oct16 启动时间保持，93082 在本轮开始和结束时均已不存在，未对其操作。本轮自有 execution 全部正常退出，已记录 cleanup 所有资源计数为 0，开发 App 进程无残留。所有运行产物在已忽略的 `.runtime/`，无根 temp。

`git diff --check`、三个 Go 文件 gofmt 和 `codesign --verify --deep --strict dist/OpenDesk.app` 通过。分类台账仅更新已有一行；目录审计报 62 项错误：7 行既有格式问题、60 个当前未登记 Go 测试、总数 360 与已登记 300 不符。未新增 Go 测试文件，未擅自修整无关台账或运行全仓测试；审计不能写成通过。完整报告 `.runtime/tests/test-architecture/audit.json`。master、HEAD 与本地 origin/master 仍 b7280bef…，未 fetch、提交、推送、创建/切换分支，暂存区为空，保留其他混合改动。
