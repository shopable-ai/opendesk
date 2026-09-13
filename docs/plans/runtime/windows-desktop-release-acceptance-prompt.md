# OpenDesk Windows Desktop Release Acceptance

## 目标需求

在真实 Windows 11 用户桌面环境中，完成 OpenDesk Desktop / CLI / Native UI Host 的最终交互与发布安全验收，证明源码阶段已经冻结的“**一个产品、一个普通用户启动入口、内部 helper 自动运行**”模型在真实机器上成立。

最终用户链路必须成立：

```text
安装或解压待验收的 OpenDesk Windows artifact
→ 普通用户只启动 opendesk-desktop.exe / 对应唯一产品快捷方式
→ 不出现意外 Console 或第二次 UAC
→ OpenDesk 主产品正常进入运行状态
→ Script Runner / Recorder / Scheduler Center / Runtime Log / Permissions Center 可从同一产品生命周期使用
→ 首次需要 host-backed UI 时 Runtime 自动启动 ui-host/opendesk-ui-host.exe
→ 用户从不手动启动 CLI 或 helper
→ 关闭 / Quit / crash / logout 等生命周期不会留下不可控 orphan helper
```

CLI 必须保持独立开发入口：

```text
opendesk.exe
→ PowerShell / Terminal / automation
→ 保持 Console 语义
→ 不成为第二个普通用户桌面应用
```

## 当前状态

源码 contract 已使用三个不同角色：

```text
opendesk-desktop.exe
opendesk.exe
ui-host/opendesk-ui-host.exe
```

Windows build / distribution、Installed App Builder、provenance、payload checker、CI contract 和相关文档已经按该角色模型收口。

本轮不是重新设计入口，不把 helper 合并回单进程，也不重新实现 Custom UI protocol。目标是取得真实 Windows 发布证据并修复验收发现的最小必要缺陷。

## 本轮执行

使用当前最新 `master` 产生新的 win-x64 artifact，在真实 Windows 11 用户会话中按发布链路验收。

先验证 artifact 本身，再验证普通用户行为；发现失败时沿实际失败链路做最小修复并重新构建/重测。每个结论必须区分 automated/hosted evidence 与 interactive/clean-machine evidence。

需要覆盖：

- Desktop entry / CLI entry 的 PE architecture 与 subsystem；
- Explorer 或正式 shortcut 一次启动 Desktop，确认无 Console、无多余用户启动步骤；
- App Shell / Tray、主窗口、Script Runner、Recorder、Scheduler Center、Runtime Log、Permissions Center 的打开、关闭、再次打开；
- Native UI Host 首次需要时自动创建，用户不手动运行；
- helper PID / parent lifecycle，正常 Quit、主窗口关闭、Runtime crash、helper crash 后的资源与进程状态；
- Desktop 与 CLI 同时/先后调用时的 single-instance 和 action routing；
- Unicode / space install path 与非仓库 working directory；
- WebView2 可用与缺失场景，按照实际选择的 Evergreen / Fixed Version 策略验证；
- 普通操作不触发管理员提权；
- 若本轮 artifact 已进行正式 Authenticode signing：验证 Desktop、CLI、Native UI Host 和实际加载 native payload 的签名、Publisher、timestamp，并验证修改文件后签名失效；
- 对待发布的 signed artifact 检查 SmartScreen、Smart App Control、Microsoft Defender；有企业目标时再补代表性 EDR；
- 如果当前 artifact 尚未拥有正式 Publisher certificate，不伪造签名/信誉 PASS，将这些项标记为 BLOCKED 并保留可复现证据；
- clean-machine / non-developer-machine 上确认最终 artifact 不依赖源码仓库、Go、开发态绝对路径或临时 helper。

如果发现父进程异常退出会遗留 helper，优先评估并实现 Windows Job Object / kill-on-close 或等价的 OS-native ownership；如果 helper crash 需要恢复，只允许 bounded restart，不引入无限 respawn。

## 完成标准

- 普通用户只执行一次 Desktop 启动动作即可使用 OpenDesk；PASS。
- `opendesk-desktop.exe` 为 GUI subsystem，`opendesk.exe` 为 Console subsystem，路径不存在大小写折叠；PASS。
- Native UI Host 由 Runtime 自动启动，用户无需运行第二个程序；PASS。
- Script Runner、Recorder、Scheduler Center、Runtime Log、Permissions Center 的真实窗口链路符合当前产品 contract；PASS。
- 正常 Quit 后 Runtime-owned helper 全部退出；异常退出不存在长期 orphan helper；PASS，或产生明确 BLOCKED 缺陷并修复后重测。
- Desktop / CLI single-instance 与 action routing 没有制造第二个独立产品生命周期；PASS。
- 普通 Desktop / helper 创建无意外 Console / UAC；PASS。
- WebView2 的部署策略和缺失行为可预测、可修复；PASS。
- signed release（如果已经具备正式签名基础设施）所有 executable/native payload Publisher 和 timestamp 符合 release policy；PASS。
- SmartScreen / Smart App Control / Defender 的实际结果有机器、系统版本、artifact hash、签名状态和截图/日志证据；PASS 或准确记录外部信誉 BLOCKED，不能用代码测试替代。
- artifact 搬离源码工作区后仍可启动并完成核心产品链路；PASS。
- 所有验收证据保存在 `.runtime/tests/windows-release/` 或当前仓库既有等价 evidence 目录，不把运行产物提交为源码。

## 必要边界

- 不重新把 Desktop / CLI 改回只靠大小写区分的文件名。
- 不要求用户手动启动 `opendesk.exe` 或 `opendesk-ui-host.exe` 才能使用 Desktop。
- 不通过关闭 Defender / SmartScreen / Smart App Control 来制造 PASS；需要区分软件缺陷、签名缺失和外部信誉。
- 不用 self-signed certificate 冒充 consumer publisher qualification。
- 不为 UI helper 请求管理员权限，不把 helper 改成网络服务、TEMP 落地执行或运行时下载 EXE。
- 不因为 Task Manager 出现多个内部进程就判定产品失败；验收的是用户入口数量、进程 ownership、签名/路径可信度和生命周期。
- 不把 hosted GitHub runner 的构建成功等同于真实交互式 Windows release qualification。