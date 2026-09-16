# Desktop Measurement Qualification Matrix

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
