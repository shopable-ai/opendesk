# Window target 交付记录

## 实施范围

以 `db02cd29d00d955646981d426e4d5b484ac536d4` 为基线，向现有 Window facade 增加只读目标查询；不引入独立 Runtime、应用别名库或窗口句柄缓存。

| 文件 | 本轮修改 |
| --- | --- |
| `polyfills/003-window.js` | 复用 native Window.list / App.get 实现同步 list(target?)、异步 get(target) 和 wait(target, options?)。 |
| `types/window.d.ts` | 明确目标联合类型、等待选项、同步列表返回值与取消错误。 |
| `automation/recorder_actions.go` | 生成器调用公共 window.get；仅成功枚举后无匹配时允许唯一 executable-only 回退。 |
| `docs/api/window.md` | 公共参数、返回值、错误、平台边界与独立接口条目。 |
| `tests/runtime-api/window-target.js` | 独立目标查询与等待测试入口；使用实际 polyfill 源码与模拟 backend，提取实际生成器 helper 进行回归。 |
| `tests/human-to-recipe/coordinate-recipe.js` | 原有生成回放测试接入实际公共查询实现，不再只模拟旧 list 接口；断言结构化歧义错误。 |

## 有效决定

- `WindowTarget` 是查询条件，`WindowInfo` 是当前观察快照；不把录制 PID、handle、窗口 id 当作跨运行的永久身份。
- 一个 target 使用 `id/pid/app/exePath/exeName` 中至多一个身份字段，可叠加精确 title；title 可单独使用。不会猜测裸字符串的含义。
- `app` 复用已有 App target 解释及平台别名；`exePath/exeName` 精确匹配窗口元数据，不能误转为应用包路径/显示名称。
- `list()` 保持同步及无参数行为，返回 0..N 项；`get()` 要求恰好一个身份和几何有效的匹配。
- 先计数后验证唯一行，不能丢掉几何错误或 unresolved 行后假装唯一。负桌面坐标允许。
- `get()` 不隐式启动、聚焦、恢复、等待或放宽条件。旧动作 API 参数不变。
- `wait()` 只重试成功查询的空结果；backend 同名 NOT_FOUND、歧义、权限、几何错误均终止。超时/取消/完成均清理自有 timer 和监听器。
- 等待使用当前 Execution 的受管 timer。同步原生调用无法被 JS timeout 强制抢占；Runtime 销毁后不承诺 Promise 回调仍会执行。
- Recorder 的标题回退仍属业务恢复策略；未知 identityKind 明确失败，不默认解释成 exeName。

## 验证状态

本次任务为将变更直接提交现有远端分支。已进行源码与 Git 差异核对；**未在本轮运行测试、构建、lint、代码生成或真机桌面操作**。此前其他会话的测试数量与评分不作为本次提交的验收证据。

新 API 当前标记为 Experimental。测试文件存在不等于测试通过；模拟 backend 也不等于 macOS/Windows 真机通过。现有机器索引/总测试门禁未在本轮重新生成；新增专项入口需按下方命令单独运行。后续更新总索引时应从当前源码/类型重新生成，不沿用旧的 list Promise 声明。

## 后续验证入口

在仓库根目录，使用包含本次改动的 OpenDesk 构建：

```bash
./dist/opendesk -script tests/runtime-api/window-target.js -console-mode script
./dist/opendesk -script tests/human-to-recipe/coordinate-recipe.js -console-mode script
```

专项测试检查精确匹配、应用多 PID、参数拒绝、无匹配/歧义、负坐标、无效几何/身份、后台错误、等待期限、取消及资源清理、Recorder 回退边界。Recorder 组合测试仍使用合成录制文件并替换全部输入对象，不操作真实业务。

真机验收另需覆盖 macOS 和 Windows 可枚举范围、平台 App 名称解析、启动后窗口出现、窗口移动/关闭重建、同应用多窗口，以及真实生成/回放。尚未执行这些验证。

## 明确不包含

不扩展旧 focus/maximize/restore 等动作的 target 参数，不增加 window.resolve，不扩展 UI.within 或 Accessibility scope，不修改另一个 agent-to-recipe 工作流，不自动重新生成、覆盖或执行已有录制产物。
