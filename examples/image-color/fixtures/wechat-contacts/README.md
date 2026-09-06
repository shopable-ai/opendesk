# 微信“联系人”按钮状态模板

- `selected.png`：从 [`../wechat-sidebar-states.png`](../wechat-sidebar-states.png) 的
  `x=18, y=69, width=24, height=22` 精确裁剪；原始下载图中的坐标为 `(18,159,24,22)`。
- 未选中对应模板继续使用 [`../wechat-sidebar/contacts.png`](../wechat-sidebar/contacts.png)，它从
  [`../wechat-panel.png`](../wechat-panel.png) 的 `(18,159,24,22)` 精确裁剪。

这两张是同一个“联系人”入口的两种状态，可以按
`[unselectedContacts, selectedContacts]` 传给 `ImageColor.findImage`。不要把本目录的绿色联系人图与
灰色消息图标放在同一个数组中；它们是不同控件，并且会同时出现在同一截图中。

稳定 fixture 用 `threshold: 1`；实际环境应重新采集同主题、同 DPI 的两态模板，并先在紧凑 ROI 内以
`0.95` 作为起点建立基线，同时校验命中位置和业务状态。
