# OpenDesk Desktop Measurement Native Qualification / Repair

## 目标需求

让当前已经完成 Frozen Oracle 与仓库静态闭环的 Desktop Measurement，在真实 Native Host 上完成可追溯资格验证。

最终链路必须成立：

```text
当前已收口源码
→ clean native build
→ binary / resource provenance
→ 平台权限
→ Native Measurement Surface
→ 真实鼠标 / 键盘 / clipboard / global shortcut
→ Retina / DPI / 多显示器 / negative origin
→ evidence
→ 发现失败时最小修复
→ clean rebuild
→ 原失败场景重测
→ Qualification
```

只有真实主机、真实本次构建物和可追溯 evidence 实际通过的项目，才允许从 `NOT_RUN` / `LOCAL_REQUIRED` 更新为 `PASS`。

## 当前状态

网页版静态闭环已经完成：Frozen Oracle、Production 静态合同、自动测试定义和 Qualification 文档已经按当前合同重新核验并收口。

已有真实 macOS 证据仅证明：Developer 菜单存在、桌面测量快捷键显示为 `⌘⇧M`、菜单入口能够出现 Native Measurement Surface。fresh-bundle 后续流程遇到 macOS Screen Recording consent，因此 macOS 完整物理资格仍不是 PASS；Windows 物理资格也保持 `NOT_RUN`，除非真的在 Windows 主机执行。

browser、MemoryDriver、synthetic、Go unit/integration 或 hosted CI 都不能替代真实 Native Qualification。

## 本轮执行

直接从当前源码进行 clean native build，并首先证明实际 Runtime、UI host、App bundle / executable、资源加载路径、PID 和构建 hash 属于同一轮产物。

随后处理当前平台真实权限，使用产品真实入口验证 Native Measurement Surface 与完整交互。发现失败时，沿实际 failure chain 定位，只做最小必要修复；修复后必须 clean rebuild，并重新执行原失败场景以及受影响回归场景。

当前 Mac 上先完成 macOS 能真实完成的全部资格；没有真实 Windows 主机时，Windows 保持 `NOT_RUN` / `LOCAL_REQUIRED`，不要在 macOS 上代签。

## 完成标准

- clean build 与实际运行 bundle / binary / resources provenance：PASS
- Screen Recording、Accessibility 等真实平台权限与 fresh-bundle 场景：PASS
- Developer / Recorder / global shortcut 三入口进入同一个唯一 Measurement Session：PASS
- `CommandOrControl+Shift+M` 在真实 OS 上注册、触发、退出、重入：PASS
- `PREPARING → FREEZING → MEASURING → ADJUSTING → FREEZING → MEASURING → IDLE`：PASS
- Frozen Snapshot、Update、Adjust / Continue、Exit / re-entry：PASS
- Point、Region、Point↔Point、Region↔Region：PASS
- 已有 Region 后重新测量必须是 fresh Region drag；不存在 body/8-handle resize/move：PASS
- Arrow / Shift+Arrow 不修改锁定 geometry：PASS
- Magnet、Alt/Option temporary suspend、Candidate Stack、Tab / Shift+Tab：PASS
- Target Window 与 Snapshot UI Candidate 不混淆：PASS
- Source / Display / WindowLocal coordinates、Frozen Source Pixel color、Window / Local Reference margins：PASS
- Micro HUD、Corner HUD、Toolbar、Inspector 的真实视觉和交互：PASS
- 真实 mouse / keyboard / clipboard / global shortcut：PASS
- 当前主机可覆盖的 Retina / DPI / multi-display / negative-origin：PASS；缺硬件场景明确保留 `LOCAL_REQUIRED`
- Recorder entry isolation、MeasurementEvidence、structured output 与 authoring / qualification consumer 的真实链路：PASS
- 每一个 Native `PASS` 都有可追溯到本次 binary、主机环境、时间和操作的 evidence：PASS
- 任一 native failure 修复后已经 clean rebuild，并对原失败场景重新验证：PASS
- Windows 只有在真实 Windows 主机执行后才能更新对应物理资格；否则保持 `NOT_RUN`：PASS

## 必要边界

- 不重新制作 HTML Prototype，不重新提取或冻结 ORACLE，不重新设计 Measurement，不重新执行历史 P0 → P4。
- 不通过降低 Frozen Oracle、测试断言或 Qualification 标准让失败变绿。
- 不把源码存在、browser、MemoryDriver、synthetic、Go test 或 hosted CI 冒充 Native PASS。
- 不做无关重构；native failure 只做沿真实失败链路的最小修复。
- Qualification / manifest 只能根据真实、可追溯的本地主机 evidence 更新。
