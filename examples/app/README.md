# 应用场景示例

本目录保存应用特定的公开示例，不是通用 Runtime API 的实现层。
本轮只增加从通用窗口示例分离的千牛窗口场景；其余历史应用脚本尚未因此完成审查。

## 千牛窗口（Windows）

从仓库根目录进行只读查询：

```powershell
.\dist\opendesk.exe -script examples/app/qianniu-window.js -console-mode script
```

按 `exeName === AliWorkbench.exe`（大小写不敏感）筛选，仅输出 ID/PID。不会读取聊天、
商品或窗口内容。需要标题时先设置 `$env:OPENDESK_EXAMPLE_SHOW_TITLES = '1'`，用毕移除。
macOS 上明确失败，不借用其他应用窗口冒充千牛。

设置置顶必须明确输入实际标题与 PID，以及 on/off 和授权。例如以下变量值需替换为自己的测试窗口：

```powershell
$env:OPENDESK_EXAMPLE_WINDOW_TITLE = '你的千牛测试窗口完整标题'
$env:OPENDESK_EXAMPLE_WINDOW_PID = '12345'
$env:OPENDESK_EXAMPLE_QIANNIU_TOPMOST = 'on'
$env:OPENDESK_EXAMPLE_ALLOW_WINDOW_CHANGE = '1'
try { .\dist\opendesk.exe -script examples/app/qianniu-window.js -console-mode script }
finally {
  Remove-Item Env:OPENDESK_EXAMPLE_WINDOW_TITLE, Env:OPENDESK_EXAMPLE_WINDOW_PID, Env:OPENDESK_EXAMPLE_QIANNIU_TOPMOST, Env:OPENDESK_EXAMPLE_ALLOW_WINDOW_CHANGE -ErrorAction SilentlyContinue
}
```

没有 mode 时只读；非法 mode 或未授权时失败。动作前核对唯一标题、PID、稳定身份、可用能力和
可执行文件名。这里没有读取旧置顶状态的公开接口，不自动关闭置顶、不假装恢复；on/off 都是
用户明确选择的状态变更。API 返回后还需视觉确认效果，不能只凭日志宣布视觉通过。
旧通用 `examples/window.js` 不再自动执行这里的动作。
