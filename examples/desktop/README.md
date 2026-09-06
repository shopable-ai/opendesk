# 通用桌面示例

所有命令从仓库根目录运行。请使用可丢弃的测试窗口，不使用聊天、支付或含未保存重要数据的窗口。
这不是新的自动化框架；`support/target-window.js` 只是三份示例复用的目标核对逻辑。

## 只读窗口查询

```bash
./opendesk -script examples/desktop/window-inspect.js -console-mode script
```

只输出窗口 ID、PID 和几何信息，不聚焦、不调整窗口、不读内容、不截图，默认不打印标题或进程路径。
确实需要选择测试窗口时，从仓库根目录运行下面的显式标题查询（标题可能含隐私）：

```bash
OPENDESK_EXAMPLE_SHOW_TITLES=1 ./opendesk -script examples/desktop/window-inspect.js -console-mode script
```

## 指定窗口输入

先在测试编辑器的可丢弃文本字段放好光标，再把下面的标题和 PID 替换为刚查询到的真实值：

```bash
OPENDESK_EXAMPLE_WINDOW_TITLE='OpenDesk input test' OPENDESK_EXAMPLE_WINDOW_PID=12345 OPENDESK_EXAMPLE_ALLOW_INPUT=1 ./opendesk -script examples/desktop/keyboard.js -console-mode script
```

脚本核对唯一的精确标题、PID 和已解析 native identity，聚焦此目标并再次验证活动窗口，
只调用一次 `keyboard.type('Hello from OpenDesk')`。不点击控件、不按 Enter、不执行 Meta+d，
不会有意触发提交/发送。完成日志只表示输入已派发，须人工确认字段内容。
**窗口身份不能证明焦点控件可编辑，也不能证明它不会为文本输入绑定其他业务动作。**
执行期间不要切换焦点；不要使用终端/真实业务窗口。没有配置、重复标题、未解析 ID、窗口
重建、聚焦失败时拒绝输入。检查与 OS 输入不是原子操作，仍存在焦点竞争，不能声称绝不会误输入。

## 指定窗口位置演示

只用于已确认是普通、非最大化/全屏的测试窗口：

```bash
OPENDESK_EXAMPLE_WINDOW_TITLE='OpenDesk window test' OPENDESK_EXAMPLE_WINDOW_PID=12345 OPENDESK_EXAMPLE_ALLOW_WINDOW_CHANGE=1 ./opendesk -script examples/desktop/window-controls.js -console-mode script
```

它保持宽高和 y 不变，将 x 增加 20，核对误差不超过 2，然后在 finally 中恢复并核对原 bounds。
核对有上限，不进行无限重试。不会最大化、最小化、关闭、杀进程、聚焦或修改置顶。
当前 API 不提供全部窗口状态读取，无法自动证明初始窗口为普通窗口；bounds 恢复也不是完整
窗口/焦点状态恢复。发现身份变化或 bounds 已被其他操作者改变时，拒绝用旧快照覆盖，报告失败，
请人工检查窗口。操作失败和恢复失败都保留在 Error 的独立字段，不覆盖主错误。

旧 `examples/window.js` 现在仅转发到只读查询，不再顺便操作千牛；`window-more.js` 转发到
上述显式目标示例，不再隐式控制当前活动窗口。旧 `keyboard.js` 也继承新的输入前置条件。
千牛特定操作单独位于 [应用示例](../app/README.md)，不能混回通用窗口示例。

## 验证与平台

支持矩阵以 [Window API](../../docs/api/window.md) 为准；Unsupported 明确失败，Partial 的真实
效果仍需实际主机验证。Windows PowerShell 先用 `$env:OPENDESK_EXAMPLE_WINDOW_TITLE` 等设置
实际值，再运行 `.\dist\opendesk.exe -script examples/desktop/keyboard.js -console-mode script`；用毕移除所设环境变量。
这些是命令说明，不是 macOS 或 Windows 已实机通过的声明。

单项 `tests/runtime-api/single/window.js` 和 `single/keyboard.js` 验证接口组；示例命令、可视窗口效果
及正式 live gate 各自验收。不得遍历此目录自动运行所有 `.js`，support 文件也不是入口。
