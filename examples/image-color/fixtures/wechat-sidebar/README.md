# 微信侧栏图标模板

这些 PNG 都是从上级的 [`../wechat-panel.png`](../wechat-panel.png) 逐像素裁剪出的真实微信界面
模板；它们是版本化测试输入，不是 `.runtime/` 运行产物。除设置与菜单外，每个模板为 `24 × 22`；
设置与菜单为 `32 × 28`，以保留足够稳定边缘，避免三个平行短线出现歧义。模板不包含会变化的未读
提示、账号头像或会话列表内容。

| 模板 | 真实侧栏目标 | 上级截图裁剪区域 |
| --- | --- | --- |
| `contacts.png` | 联系人（未选中） | `x=18, y=159, width=24, height=22` |
| `favorites.png` | 收藏 | `x=18, y=207, width=24, height=22` |
| `channels.png` | 视频号 | `x=18, y=255, width=24, height=22` |
| `mini-programs.png` | 小程序 | `x=18, y=303, width=24, height=22` |
| `look.png` | 看一看 | `x=18, y=351, width=24, height=22` |
| `mobile.png` | 手机 | `x=18, y=548, width=24, height=22` |
| `settings.png` | 设置与菜单 | `x=14, y=592, width=32, height=28` |

绿色已选中的“消息”图标仍保存在相邻的
[`../wechat-message/selected.png`](../wechat-message/selected.png)，裁剪区域为 `(18,111) 24 × 22`。
“联系人”的绿色已选中 counterpart 位于
[`../wechat-contacts/selected.png`](../wechat-contacts/selected.png)，它来自另一个真实侧栏状态截图；二者
可以作为同一联系人按钮的有序状态数组。不要把不同按钮的灰/绿色图标当作同一控件的状态模板。

正确的两组状态数组分别是：消息
`[../wechat-message/unselected.png, ../wechat-message/selected.png]`，联系人
`[contacts.png, ../wechat-contacts/selected.png]`。它们来自不同 source fixture 仅用于确定性测试；生产请从
同一微信版本、主题、DPI 与缩放下重新裁取每一对模板。
所有模板的裁剪完整性、全图/ROI 匹配一致性和 ROI 搜索空间缩减由
[`../../../../tests/runtime-api/image-color-wechat-roi.js`](../../../../tests/runtime-api/image-color-wechat-roi.js)
验证；可视化人工验收使用
[`../../wechat-template-match-visual.js`](../../wechat-template-match-visual.js)。
