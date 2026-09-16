from pathlib import Path
import json
ROOT=Path.cwd(); changed=[]
def read(p): return (ROOT/p).read_text(encoding='utf-8')
def write(p,s): (ROOT/p).write_text(s,encoding='utf-8'); changed.append(p)
p='docs/architecture/desktop-automation/desktop-measurement.md'; s=read(p)
s=s.replace('`Tab / Alt / 1–4 / I / Esc / Arrow` 会话按键语义','`Tab / Shift+Tab / Alt / Option / 1–4 / I / Esc` 会话按键语义')
s+='''

## 20. Frozen core、Native invariant 与 Product Extension（2026-09-16）

权威顺序：明确用户需求/后续纠正 → 可执行 Prototype → FROZEN ORACLE → 本文 Native/Framework 合同及明确扩展 → Production → Tests/Qualification。

| 层 | 合同 | 依据与边界 |
|---|---|---|
| Frozen HTML Oracle | 十个主 Toolbar 控件、四个工具、Magnet、Margin、Update、Adjust/Continue、Inspector、HUD、Esc、Session/Snapshot | `ORACLE.md` 与可执行 HTML/CSS/JS；不能从旧 Production 或测试反推 |
| Native / Framework invariant | 干净 capture、真实窗口身份、单 owner/surface、token 校验、坐标映射、资源释放、Recorder 输入隔离 | 本文既有 capture/session/native 章节；harness 不是实现 |
| EXT-TARGET | Inspector 显式选择/确认真实目标窗口 | 既有目标窗口合同；不得劫持 Tab 或冒充 UI Candidate |
| EXT-LOCAL | Inspector 人工局部参照 | 最多一个 Local；用户显式选择；不增加 Esc 层级 |
| EXT-OUTPUT | 简明/中文/结构化编码、保存格式、保存正式结果、Authoring handoff | 低频能力留在 Inspector；核心 Evidence 不依赖 Result/outputFormat |
| 未批准 | 旧 Region resize/nudge、多级 Esc | 无当前需求依据；不是 Product Extension |

`NOT_SUPPORTED_BY_HTML` 不等于产品禁止；`Production 已实现` 也不等于需求确认。首次默认 Region；同一 Service 内退出后工具保留；新 Session Magnet 重置 ON、Alt 重置 OFF。Region 有效重拖产生新的 Target；Arrow 不修改测量。详情按钮是 open，I 是 toggle；Esc 只有“Inspector 开则关闭，否则退出”。Update 保留工具/Magnet/pointer/Inspector-open，清理旧结果/候选/Local/drag；Adjust 清理 pointer/Inspector/Alt/drag，Continue 重新冻结同一 Session。

Micro HUD 必须由真实 pointer hover 驱动并在边缘翻转，四角 class 只能作为未收到 pointer 前的 fallback。Corner HUD、status、Toolbar、Inspector 是独立信息层。生产 Result 中明确命名的 ratio 字段继续保持 0–1；HTML percentage 修正不得破坏既有 ratio API。
'''
write(p,s)
write('docs/quality/desktop-measurement-qualification.md','''# Desktop Measurement Qualification Matrix

> FROZEN HTML Oracle 是交互合同；自动化执行记录是仓库证明；真实 macOS/Windows 运行证据是平台资格。源码存在不等于测试已运行，更不等于真机 PASS。

## 状态与证据

`PASS_STATIC` = 已完成源码核对；`PASS_AUTOMATED` = 有本次对应源码运行记录；`LOCAL_REQUIRED` = 需要真实主机验证；`NOT_RUN` = 没有执行证据；`FAIL` = 已执行且失败。浏览器合成测试、MemoryDriver 与 hosted CI 不代替用户实际加载的 Mac/Windows 产物。

## 当前产品合同

| 合同 | 仓库验证 | 真机要求 |
|---|---|---|
| Toolbar 十项、默认 Region、active/disabled/tooltip/层级 | browser + layout tests | 实窗截图对照 Oracle |
| Point / Frozen Source Pixel / 三级坐标 | model + session + browser | capture、实际 pointer、Retina |
| Region candidate click / 有效重拖新 Target | candidate + session + browser | 真实候选；不是 body/八向编辑 |
| Point↔Point / 第三点新组 | model + browser | 物理鼠标 |
| Region↔Region ≥5×5 / relation summary | model + session + browser | H/V gap、overlap、center delta 对照 |
| percentage 0–100；真正 ratio 不变 | browser numerical regression | 本地不得重新裁决语义 |
| Tab/Shift+Tab 仅当前 Snapshot Candidate | candidate tests | 不换目标窗口、不 capture、不改 token |
| Magnet ON / Alt 临时暂停和边界清理 | session + browser + host contract | Option down/up、Exit/re-entry、blur |
| 1/2/3/4、I toggle、Details open | session + browser + host contract | Native 输入不能双触发 |
| Esc：Inspector open 则关闭，否则退出 | session + browser | 不增加局部编辑/copy menu Esc 层级 |
| Inspector 无 Result 仍含 Snapshot/mapping/reference/pointer/candidate | evidence + browser | 实际面板与复制 |
| Update persistence/cleanup | lifecycle + browser | hide→clean capture→patch→show |
| Adjust/Continue | lifecycle + browser | 真实桌面可操作、同 Session、新 Snapshot |
| Exit cleanup | lifecycle + browser | 窗口/监听/候选/token 清理，可重入 |
| Micro HUD pointer-follow + edge flip | host bridge static contract | 必须真实移动鼠标截图；四角 fallback 不算通过 |
| Recorder / 菜单 / 全局快捷键 | integration + shortcut single source | 三入口复用，Recorder 输入隔离 |
| Product Extensions | structured/save/authoring tests | 输出/剪切板/文件和可见 Evidence 一致 |

Region resize handles 与 Arrow nudge 的旧正向验收已废弃，只保留“不得重新进入当前产品合同”的负向防漂移。

## LOCAL REQUIRED

真实构建 Runtime、UI host、App package；源码/资源/二进制/PID/加载路径 provenance；旧进程/单实例；controlled restart；实窗截图；Toolbar 视觉；Micro HUD 真正跟随/翻转；全部鼠标/键盘；Update；Adjust/Continue；Exit；Recorder entry；全局快捷键；macOS Accessibility/capture/clipboard/签名；DPI、多屏、负坐标；完整 macOS qualification。Windows 需独立真机 qualification，Mac 上不能代签。

每条真实 evidence 记录实际 SHA、build/host hash、时间、平台、操作、期望/实际、截图/日志路径。缺设备或权限就记录 `LOCAL_REQUIRED` / `NOT_RUN` 与原因，绝不能伪造 PASS。
''')
manifest=json.loads(read('tests/desktop-measurement/qualification-manifest.json'))
manifest['contract']={'oracle':'apps/opendesk/prototypes/desktop-measurement/ORACLE.md','status':'FROZEN','date':'2026-09-16','nativeEvidencePolicy':'Repository changes, synthetic browser tests and hosted CI do not qualify the user runtime.'}
manifest['requiredInteractions']=['toolbar-inventory','point','region-new-measurement-no-resize','two-point','two-region-summary','candidate-tab-same-snapshot','alt-boundary-reset','details-open-i-toggle','esc-inspector-else-exit','inspector-evidence-without-result','pointer-following-micro-hud','update-persistence-cleanup','adjust-continue','exit-cleanup','recorder-entry-isolation','global-shortcut','native-capture-clipboard','binary-host-resource-provenance']
write('tests/desktop-measurement/qualification-manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
write('tests/desktop-measurement/local-codex-validation.md','''# OpenDesk Desktop Measurement Local Runtime / Visual Qualification

## 目标需求

证明网页版已经冻结并写入 `master` 的 Desktop Measurement 代码，确实进入当前 Mac 的真实运行产物，并完成真实视觉、真实交互和 macOS qualification。

最终用户链路必须成立：

菜单 / Recorder / CommandOrControl+Shift+M
→ 同一个 Measurement Session
→ 当前源码对应的真实 Native Measurement Surface
→ Frozen Snapshot
→ Point / Region / Point↔Point / Region↔Region
→ Magnet / Local Reference / Margin
→ pointer-following Micro HUD + Corner HUD + status + bottom Toolbar
→ Inspector Evidence
→ Update
→ Adjust / Continue
→ Exit
→ 可重新进入且无旧进程/旧资源/旧状态污染。

发现运行期问题时，沿失败链做最小修复并立即重新验证。最终目标不是“能打开”，而是证明当前源码、构建物、UI host、App package、实际 PID 与实窗行为是一条可追溯链。

## 当前状态

网页版已冻结产品合同；不要重新设计 Prototype、重新解释 Oracle、重新决定 percentage 语义、Region handles、Arrow nudge 或 Esc 层级。

固定合同包括：默认 Region；percentage 是 0–100，真正 ratio 字段仍是 0–1；Region 再次有效拖拽开始新的测量，没有 body/8-handle edit；Arrow 不修改测量；Details 是 open、I 是 toggle；Esc 只“先关闭 Inspector，否则退出 Measurement”；新 Session Magnet ON、Alt OFF；Micro HUD 必须真实跟随 pointer 并在边缘翻转。

正式 Product Extension 仍可存在于 Inspector：真实目标窗口选择/确认、人工局部参照、更多输出格式、保存结果、Authoring handoff。它们不能改变上述 Frozen core。

## 本轮执行

从当前 `master` 构建，不使用历史二进制或历史 host。

先建立 provenance：当前 HEAD、实际 Runtime 二进制、实际 CustomUI host/App package、资源加载路径、PID、构建时间/hash 必须彼此对应；检查并清理会导致误加载的旧进程，但不要破坏无关用户进程。

随后 controlled restart，使用真实产品入口打开 Measurement。对每个关键状态保留截图/日志等 evidence。

真实验证至少覆盖：首次打开与三入口复用；Toolbar 十项视觉/active/disabled；hover 时 Micro HUD 持续跟随并在右/下边缘翻转；Point 和 Frozen Source Pixel；Region 候选锁定、语义 Local Reference、人工重拖新 Target；两点和两区域 relation；Tab/Shift+Tab；Magnet/Option；Details/I/Esc；无 Result Inspector Evidence 与复制；Update persistence/cleanup；Adjust 后桌面真实可操作、Continue 同 Session 新 Snapshot；Exit 完整清理并再次进入；Recorder 输入隔离；全局快捷键；Accessibility/capture/clipboard；Retina、负坐标和可用的多屏场景。

若视觉或交互失败：先确认加载 provenance，再沿实际失败链定位到 Runtime / CustomUI host / Measurement production；只做最小必要修复，补对应回归测试后重新构建、重启、复验。不要通过修改 Oracle、降低断言或恢复旧 resize/nudge 行为让测试变绿。

## 完成标准

- 当前 `master` → Runtime → UI host → App package → PID → 实际 Measurement Surface provenance：PASS
- 不存在旧二进制/旧 host/旧资源误加载：PASS
- 三入口复用唯一 Session：PASS
- Toolbar、Corner HUD、status、Inspector 的实窗视觉层级：PASS
- Micro HUD 真实 pointer-following + edge flip：PASS
- Point / Region / 两点 / 两区域：PASS
- Candidate / Tab / Shift+Tab / Magnet / Option：PASS
- Region 重拖是新测量，无 handles/Arrow nudge：PASS
- Details open、I toggle、Esc 两层：PASS
- Inspector 无 Result Evidence 与结构化复制：PASS
- Update persistence/cleanup：PASS
- Adjust / Continue：PASS
- Exit cleanup + re-entry：PASS
- Recorder entry/input isolation + global shortcut：PASS
- macOS Accessibility / capture / clipboard / 签名相关实际行为：PASS
- 当前设备可覆盖的 Retina / DPI / 负坐标 / 多屏：PASS；缺硬件项明确 LOCAL_REQUIRED，不伪造 PASS
- qualification 文档/manifest 只把有真实 evidence 的 macOS case 更新为 PASS；Windows 保持 NOT_RUN/LOCAL_REQUIRED，除非真的在 Windows 真机执行。

## 必要边界

- 不重新设计或解冻已经冻结的 HTML Oracle。
- 不恢复 Region resize handles、Arrow nudge 或旧多级 Esc。
- 不用源码阅读、CI、MemoryDriver 或浏览器样机冒充真机 PASS。
- 不为了通过验收扩大为无关架构重构；修复必须对应实际失败链。
- 所有真实 evidence 写入 `.runtime/tests/desktop-measurement/`，正式资格结论再同步到 `docs/quality/desktop-measurement-qualification.md` 与 manifest。
''')
print(json.dumps(changed,ensure_ascii=False))
