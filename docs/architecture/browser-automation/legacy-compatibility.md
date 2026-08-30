# Legacy raw browser escape hatches migration note

本文记录 testMonkey-go 浏览器自动化双栈迁移中，仍然存在但不应继续扩散的 legacy raw escape hatches。

## 1. 这类 escape hatch 是什么

典型代表：
- `globalThis.page____ChromePage____Object`
- 任何直接暴露底层外部浏览器对象、进程对象、窗口对象的隐藏全局变量
- 任何绕过 `page` / `pageUpgraded` / `browserUpgraded` / `contextUpgraded` facade 直接调用底层对象的方法

它们的共同特点：
- 不受统一 facade 约束
- 不保证 legacy / upgraded / playwright 三栈行为一致
- 很容易把“看起来像 Playwright/Puppeteer”误当成“真正的 Playwright/Puppeteer 语义”

## 2. 为什么要限制它们

双栈迁移的目标不是把历史脚本一次性推翻，而是：
- legacy 继续兼容
- upgraded 提供统一兼容层
- playwright 提供 Playwright 风格 facade

raw escape hatch 会破坏这个目标，因为它：
1. 绕过 facade，导致测试只证明某个私有对象可用，而不是统一接口可用
2. 无法稳定映射到 `legacy | upgraded | playwright`
3. 容易让新脚本绑定到不可维护的私有结构
4. 使文档声明与自动化证据脱节

## 3. 当前建议迁移路径

优先使用这些公开路径：
- legacy 历史脚本：
  - `page`
  - `mouse`
  - `keyboard`
  - `touchscreen`
- 新兼容层：
  - `pageUpgraded`
  - `browserUpgraded`
  - `contextUpgraded`
  - `Automation.getLegacy()`
  - `Automation.getUpgraded()`
  - `Automation.getPlaywrightFacade()`
- Playwright 风格入口：
  - `playwright.chromium.launch()`

如果历史逻辑依赖 raw 对象能力，请先做这三步：
1. 明确该能力属于哪一层：page / context / browser / system
2. 判断是否只是“路由/别名/兼容外观”能力，还是需要真实运行时语义
3. 在能用 facade 表达时，先补 facade + 测试，不要继续扩散 raw global

## 4. 当前证据边界

当前已自动化验证的，是这些 facade 能力：
- `click/type/press/evaluate`
- `browser.pages/getContext/getPage/open`
- `context.getBrowser/getPage/newPage`
- `page/context/browser close`
- `locator.click/type/press/waitFor/evaluate/screenshot`

当前未自动化证明的，不应通过 raw escape hatch 被误报为“已经支持”：
- 完整 DOM selector 语义
- 完整 tab/session 生命周期
- 真正 Playwright runtime 级别行为
- 任意第三方浏览器内部对象的稳定兼容性

## 5. 迁移策略建议

对于已有脚本：
- 如果 raw escape hatch 只是偶发调试用途：保留但标记为 legacy-only
- 如果 raw escape hatch 是业务脚本主路径：应拆出最小公共能力，迁移到 facade
- 如果该能力本质上无法通过当前 JS facade 表达：
  - 先记录为 runtime boundary
  - 再评估是否值得做最小 Go 扩展

## 6. 文档和评估口径

在后续评估里，必须区分：
- facade 通过
- shim 支持
- 真实运行时支持
- raw escape hatch 私有能力

同时建议从这些主入口进入：
- 总体栈与边界：`docs/browser-automation-stacks.md`
- 测试矩阵与 HTTP / macOS smoke 路径：`docs/browser-automation-test-matrix.md`
- HTTP 真实探针：`examples/browser_stack_http_e2e_smoke.py`
- macOS 最小真实桌面链路：`examples/browser_stack_macos_app_smoke.js`

任何只依赖 raw escape hatch 的能力：
- 不能计入“统一兼容层已支持”
- 不能计入“playwright facade 已支持”
- 只能记为 legacy-special / private-path capability
