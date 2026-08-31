# General Automation Targets

`LocateAnything` 的价值不应该只局限于 WeChat。

当前仓库里已经有通用桌面自动化能力，适合纳入下一轮 LocateAnything 联动验证的目标包括：

| App class | Typical surfaces | Why it matters |
| --- | --- | --- |
| Safari / browser | address bar, active tab content, search field, primary CTA | 最常见的桌面信息查询与操作入口 |
| Finder | sidebar list, file grid/list, toolbar search, confirm buttons | 文件管理是高频通用自动化场景 |
| Notes / Mail / Calendar | sidebar, editor/composer, send/create buttons, header title | 典型的“列表 + 详情 + 输入区”三栏或两栏结构 |
| Generic dialog / settings app | title bar, left nav, confirm/cancel, search box | 验证 LocateAnything 对通用系统 UI 的泛化性 |

## Immediate Next Smoke

优先复用仓库现成脚本：

- `examples/mac/v1_stage_b_browser_probe.js`
- `examples/mac/safari_url_input_flow.js`

理由：

- 不依赖 WeChat 专有 region report
- 更能体现 `LocateAnything` 对常见软件的普适性
- 和当前的 `search/input/button/title` surface 映射高度一致

## Suggested LocateAnything Extension

下一轮可以新增一个 `stage_03b_generic_app_assisted`：

1. baseline browser probe
2. browser probe + LocateAnything address-bar / search-field assist
3. 通用 send/confirm button pointing

这样可以直接对比：

- WeChat 特化工作流
- 常见桌面应用的通用工作流
