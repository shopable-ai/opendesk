# Browser automation dual-stack continuation prompt

你现在接手 /Users/a0000/Documents/workspace/testMonkey-go 的浏览器自动化接口体系升级工作。

背景要求：
1. 这个项目不是标准 Node.js Puppeteer/Playwright 项目，而是 Go + goja + polyfills + robotgo 的混合运行时。
2. 当前目标不是破坏式替换旧接口，而是继续推进“双栈并存 + 逐步迁移”：
   - legacy：保留历史脚本兼容
   - upgraded：统一抽象兼容层
   - playwright：面向新脚本的 Playwright 风格 facade
3. 必须基于实际代码继续推进，不允许凭空假设。
4. 你必须把 upgraded / playwright 明确当作“compatibility shim”审视，而不是把它当成完整 Playwright runtime 误报完成。
5. 现在已经出现多次中断/停止，因此下一轮必须尽量一次性完成，不允许在分数偏低时过早收尾。

你必须先读取并理解这些关键文件：
- /Users/a0000/Documents/workspace/testMonkey-go/automation/utils.go
- /Users/a0000/Documents/workspace/testMonkey-go/automation/browser.go
- /Users/a0000/Documents/workspace/testMonkey-go/automation/runtime_stack.go
- /Users/a0000/Documents/workspace/testMonkey-go/automation/page.go
- /Users/a0000/Documents/workspace/testMonkey-go/polyfills/000-page.js
- /Users/a0000/Documents/workspace/testMonkey-go/polyfills/010-browser-automation-upgraded.js
- /Users/a0000/Documents/workspace/testMonkey-go/automation/browser_compat_test.go
- /Users/a0000/Documents/workspace/testMonkey-go/pkg/execution/runner.go
- /Users/a0000/Documents/workspace/testMonkey-go/pkg/http/handler.go
- /Users/a0000/Documents/workspace/testMonkey-go/main.go
- /Users/a0000/Documents/workspace/testMonkey-go/docs/browser-automation-stacks.md
- /Users/a0000/Documents/workspace/testMonkey-go/docs/browser-automation-test-matrix.md
- /Users/a0000/Documents/workspace/testMonkey-go/examples/browser_stack_legacy_smoke.js
- /Users/a0000/Documents/workspace/testMonkey-go/examples/browser_stack_upgraded_smoke.js
- /Users/a0000/Documents/workspace/testMonkey-go/examples/browser_stack_playwright_smoke.js

上一轮已完成事项：
1. 已显式注入 `page____Inject` / `browser____Inject` / `context____Inject`
2. 已新增 Browser + BrowserContext 基础骨架
3. 已新增 stack 选择：`legacy | upgraded | playwright`
4. 已新增 upgraded/playwright facade 文件：`polyfills/010-browser-automation-upgraded.js`
5. 已补齐并验证一批 facade routing 测试，包括：
   - `click/type/press/evaluate`
   - `browser.pages/getContext/getPage`
   - `context.getBrowser/getPage`
   - `page/context/browser close`
   - `locator.click/type/press/waitFor/evaluate`
6. 已验证：
   - legacy stack smoke 通过
   - upgraded stack smoke 通过
   - playwright stack smoke 通过
7. 当前文档已明确：playwright 仍是 facade/shim，不是完整运行时

本轮工作目标：
A. 继续补齐 upgraded/playwright 层的真实可用接口，优先处理：
- `page.click(selector, options)`
- `page.type(selector, text, options)`
- `page.press(selector, key, options)`
- `page.evaluate(fn, arg)`
- `page.waitForSelector(selector, options)`
- `browser.pages()`
- `browser.open({ url })`
- `context.newPage()`
- `cookies/storage/session` 读写一致性
- `locator.screenshot()`

B. 为多个接口补充测试，不仅是 smoke，还要覆盖：
- legacy 路径仍可用
- upgraded 路径接口可调用
- playwright facade 路径可调用
- CLI `-stack` 选择可工作
- HTTP `stack` 字段可工作
- 不同 facade 下 `page/browser/context` 别名是否正确
- close 后重复调用 / 边界输入 / 缺失能力 fallback 是否符合当前 shim 设计

C. 必须加入“反方攻击 / 破坏性验证”视角：
- 故意构造 `Object.create(base)` / prototype shadowing 场景，验证 facade 不会递归到自己
- 故意让底层只暴露 `Close` / `NewPage` / `Pages` 等 UpperCamel 方法，验证兼容层能否正确探测
- 故意让底层缺少 `waitForSelector` / `click` / `evaluate` 等方法，验证 fallback 行为是否明确、是否会报出可解释错误
- 故意混用 legacy page 与 upgraded/playwright facade，验证不会 silently route 到错误对象
- 故意多次 close、多次 newContext/newPage、空 pages/null pages，验证不会出现错误别名或错误回退
- 对文档里声称支持的接口，尽量做“正向 + 反向”两类测试

D. 必须提供测试证据，而不是只写“已通过”：
- 每次运行测试后，记录实际命令
- 记录关键通过结果（至少包含测试名、suite、exit code）
- 对 smoke / CLI / HTTP 验证，保存 stdout/stderr/summary 路径
- 在最终汇报中列出“证据文件路径”或命令输出摘要
- 若某项无法自动化验证，要明确说明阻塞点和缺失环境

E. 优先新增最小但有价值的测试，而不是大而空的测试：
- Go 单元测试优先
- goja runtime 注入 + facade alias/routing 测试优先
- JS smoke 示例其次
- 若某能力当前只是 facade 而非真实浏览器能力，要明确测试它的“别名/路由/兼容”是否正确，而不是伪造不存在的完整 DOM 能力

F. 增加一个 macOS 常见软件的真实烟测脚本，但要遵守环境差异：
- 优先选择系统常见应用作为验证目标，例如：Safari、TextEdit、Finder、Preview、Notes（按可用性降级）
- 不要假设第三方软件一定存在
- 脚本必须先做可用性检查，再决定测试目标
- 若软件不存在，脚本应输出 skip / fallback 证据，而不是直接失败
- 脚本目标是验证 runtime 在真实 macOS 桌面环境里至少能完成一条基础链路（如 open / activate / title/url/wait/screenshot 之一），不是要求完整 DOM 自动化

G. 不要删除 legacy 代码；只允许新增/扩展/包裹。

H. 必须先拆分任务，再推进；禁止把大任务一把梭收尾。
- 先把总任务拆成若干小任务包（例如：facade routing、negative tests、HTTP/CLI、macOS smoke、docs/evidence）
- 每个小任务包要有输入文件、目标、验证命令、通过标准
- 只有当一个小任务包达到高分，才能进入下一个；最终再做总体汇总评分

I. 你必须进行“3个专家 × 20轮讨论”的盲区审计与自我否决，不允许只做一轮浅层讨论。
- 专家角色至少包括：
  1. 兼容层/运行时架构专家
  2. 测试与质量保证专家
  3. 反方攻击/失效模式专家
- 总计至少 20 轮讨论（round 1 ~ round 20），每轮必须有：
  - 当前目标
  - 三位专家各自意见
  - 至少一个反方攻击点
  - 是否推翻前一轮某个假设
  - 该轮评分
  - 是否进入下一轮的理由
- 讨论不是闲聊，必须驱动实际任务优先级、测试设计或代码/文档修改决策

J. 评分是强制项，不能只讨论不评分。
- 每一轮都必须评分，且要有明确公式，不能只给拍脑袋分数。
- 推荐总分 100 分，公式至少显式包含：
  - C: Correctness / correctness evidence（正确性与证据）
  - R: Risk resistance / adversarial robustness（抗反方攻击能力）
  - T: Test depth / evidence quality（测试深度与证据质量）
  - M: Maintainability / migration clarity（可维护性与迁移清晰度）
  - E: Environment realism（真实环境覆盖度）
- 必须给出类似这种明确公式：
  `Score = 0.30*C + 0.25*R + 0.20*T + 0.15*M + 0.10*E`
  其中每项先按 0~100 打分，再加权。
- 如果你采用别的公式，必须明确解释权重理由。

K. 必须自我否决与盲区审计。
- 每 3~5 轮至少做一次“盲区审计”小结：
  - 当前分数为什么还不够高
  - 最可能被误判为“完成”但其实未完成的点
  - 哪些测试只是 facade 通过，不代表真实能力通过
  - 哪些证据还缺失
- 每 5 轮至少做一次“自我否决”：
  - 假设当前方案是错的，最可能错在哪
  - 如果要推翻自己，会从哪个接口或测试开始

L. 不要在低分时过早停止。
- 如果总体分数还明显低于 95，不允许轻易结束
- 必须继续多轮优化，直到：
  1. 分数已难以提升，且说明为什么难以提升；或
  2. 受真实环境/外部依赖阻塞，并明确列出阻塞证据
- 只有在“难以继续提升”时，才允许停止

建议执行顺序：
1. 重新扫描当前改动后的相关文件
2. 先把总任务拆成小任务包
3. 列出仍未完成的 upgraded/playwright 差距
4. 列出“反方攻击面 / 易失真语义 / 文档声称但证据薄弱”的清单
5. 启动 3 专家第 1~20 轮讨论，并在讨论中动态调整优先级
6. 先补最关键的 facade 路由缺口
7. 直接新增测试：
   - automation 层测试
   - main / pkg/http 入口测试
   - 必要的 macOS 常见软件 smoke 脚本
8. 运行最小必要测试，并保留证据
9. 输出：
   - 新增/修改文件列表
   - 测试矩阵
   - 通过项 + 反方攻击验证项
   - 证据路径
   - 每轮分数与总体分数
   - 仍待迁移项

测试设计要求：
- 不要依赖真实外部浏览器除非绝对必要
- 尽量通过 goja runtime + 注入对象 + facade alias 验证行为
- 对无法完全真实验证的能力，至少验证调用链和对象结构正确
- 如果发现现有语义无法支撑 Playwright 风格接口，要在代码里显式标注“兼容外观”与“真实能力边界”
- 任何“支持”声明都尽量配对至少一条自动化证据；没有证据就降级为“设计上支持 / shim 支持 / 需真实环境进一步验证”

交付格式要求：
1. 现状差距摘要
2. 任务拆分与优先级
3. 20轮专家讨论摘要（含每轮评分）
4. 本轮修改内容
5. 新增/调整测试用例列表
6. 测试执行结果
7. 测试证据（命令、关键输出、产物路径）
8. 每轮评分变化与最终总评分
9. 实际修改文件列表
10. 仍待迁移项
11. 为什么现在可以停止，或者为什么还不能停止
