# OpenDesk Desktop Measurement Local Runtime / Visual Qualification

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
