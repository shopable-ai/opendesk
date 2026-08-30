# EXECUTION_FAILURE_CASES

## 目的

记录真实执行中具有复用价值的失败案例。

这里只保留：

- 可复现的问题
- 已定位的根因
- 修复策略
- 后续 guard / contract 变化

这里不保存普通运行日志，不保存无结论的重复尝试。

## 记录模板

```text
### [日期] 标题

- 阶段：
- 现象：
- 根因：
- 分类：structure / recognition / validation / action / runtime
- 修复：
- 后续 guard：
- 是否已验证：
```

---

### [2026-04-07] activeWindow 截图主体漂移到浏览器

- 阶段：真实微信非发送探测
- 现象：header OCR 读到的是浏览器标题，不是微信聊天头部
- 根因：`activeWindow` 在执行过程中被其他窗口抢走，导致局部截图主体错误
- 分类：runtime
- 修复：局部截图前增加窗口稳定性守卫；不把该问题误判为结构识别失败
- 后续 guard：
  - 截图前检查当前活动窗口是否仍是微信
  - 检查窗口 bounds 是否发生漂移
- 是否已验证：部分验证，仍需在无人干预条件下完整回归

### [2026-04-07] 副屏/负坐标窗口导致 screen clip 失真

- 阶段：真实微信模板重定位
- 现象：局部截图宽高异常放大，模板匹配结果失真
- 根因：微信窗口位于副屏或负坐标区域时，整屏 clip 的坐标换算不稳定
- 分类：runtime
- 修复：优先使用统一 fresh screenshot 做结构验证；worker 侧在截图策略上继续收敛
- 后续 guard：
  - 记录窗口是否位于负坐标区域
  - 对异常截图结果做 fail-fast
- 是否已验证：问题已稳定复现，最终截图策略仍在收敛

### [2026-04-07] targetChatName 明确时仍可能误点非目标候选行

- 阶段：open_chat
- 现象：候选行模板命中后，header 验证失败
- 根因：候选行列表里未先按目标名做强约束过滤
- 分类：action
- 修复：当 `targetChatName` 存在时，只允许点击匹配目标名的 candidate；否则进入 search flow
- 后续 guard：
  - open_chat 前强制 target match
  - header 不通过立即 stop
- 是否已验证：代码已修复，真实环境仍需稳定窗口条件下复验

### [2026-04-07] region_map 旧脚本对窗口变化过于脆弱

- 阶段：region mapping
- 现象：`wechat_region_map.js` 在新窗口状态下报 “通用 layout 结果不足以映射微信语义区域”
- 根因：旧 worker 对 header separator 等启发式要求过硬，缺少更强的 fallback
- 分类：recognition
- 修复：使用 unified `visionrun validate` 接 fresh screenshot 做真实验证，不再把旧 region_map 当唯一真相源
- 后续 guard：
  - 保留 region_map 作为辅助 worker，而非唯一 gate
  - 真实 gate 以 unified visionrun 为准
- 是否已验证：已验证，fresh screenshot 可被 unified validate 通过
