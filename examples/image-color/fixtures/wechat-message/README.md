# 微信“消息”按钮状态模板

- `selected.png`：从上级的 [`../wechat-panel.png`](../wechat-panel.png) 精确裁剪，区域为
  `x=18, y=111, width=24, height=22`。
- `unselected.png`：从上级的 [`../wechat-sidebar-states.png`](../wechat-sidebar-states.png) 精确裁剪，区域为
  `x=18, y=21, width=24, height=22`。该 source 是用户提供的 62×290 侧栏截图去掉头像后，从原图
  `(18,111,24,22)` 逐像素保留的稳定区域。

两图都是**同一个“消息”入口**的真实视觉状态，状态数组固定按下面顺序传入：

```js
const states = [
  './examples/image-color/fixtures/wechat-message/unselected.png', // templateIndex: 0
  './examples/image-color/fixtures/wechat-message/selected.png',   // templateIndex: 1
];
```

它们是版本化稳定测试输入，不是 `.runtime/` 运行产物。测试会用 `ImageColor.diff` 验证每张模板与各自
source crop 精确一致，并在两张 source 上断言 `findImage` 分别回显 `templateIndex` 0 和 1。

两张 fixture 来自不同截图，适合确定性契约验证；生产脚本应在相同的微信版本、主题、DPI 和缩放下采集
自己的两态模板。不要通过改色、resize 或降低阈值来伪造另一状态。
