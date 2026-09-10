# Recorder 的 IME 与最终文本结果

日期：2026-09-10

## 结论

Recorder 不应把低层按键产生的字符等同于应用最终接受的文本。对于可读、可写、非安全且已聚焦的编辑控件，权威事实应是输入稳定后的控件值变化；物理 press/release 与低层字符只保留为快捷键、特殊键和因果关联证据。目标应用不暴露可验证最终值时，完整的 Basic Latin `KEY_TYPED` 仍可成为基础候选中的低层文本 fallback，即使其来源被粗分为输入法／未知或带有“不是 IME commit”的 gap；生成物必须把它留作显式可编辑变量，不能宣称它就是 committed text。

这不是针对某个中文输入法的特例。IME 可能把一串 Latin 按键组合成一个或多个 Unicode 字符，也可能用 Space、Enter、数字键或候选窗口完成提交。按键流描述的是用户和输入法的交互过程，控件最终值才描述应用收到的文本结果。因此 fallback 的 `ready` 只表示录制结构完整、可以生成候选；生产前仍须由 human-to-recipe 结合明确业务目标确认或参数化该变量，并由独立 Oracle 验证最终结果。

## 浏览器工具的共同做法

W3C UI Events 把 `compositionstart`、`compositionupdate`、`compositionend` 与普通键盘事件分开定义，`compositionend.data` 表示会话产生的最终字符；规范还明确指出，仅凭键盘事件不能可靠判断当前 IME 状态，Enter、Space 等按键与接受候选并非一一对应。[UI Events](https://www.w3.org/TR/uievents/) 与 [Input Events Level 2](https://www.w3.org/TR/input-events-2/) 因而提供了两个可迁移原则：显式区分 composing 与 committed，记录编辑结果而不是猜测每个键的字符含义。

Chrome DevTools Recorder 的公开步骤模型把文本控件变化记录为带最终 `value` 的 `change` step，而 `keyDown`／`keyUp` 是独立步骤。[Recorder reference](https://developer.chrome.com/docs/devtools/recorder/reference) 所对应的 Chromium 实现还会关联 change step 与其输入按键，并移除已由 change 覆盖的输入型 keyDown，避免结果和原因被重放两次。[RecordingSession.ts（固定 revision）](https://chromium.googlesource.com/devtools/devtools-frontend.git/+/44e3006b8549ceeffe023b3578930a8440156f52/front_end/panels/recorder/models/RecordingSession.ts)

`@puppeteer/replay` 的正式 schema 同样把 `{type: "change", value}` 与 `keyDown`／`keyUp` 分开。[Schema.ts](https://github.com/puppeteer/replay/blob/main/src/Schema.ts) Playwright 建议绝大多数文本输入使用 `locator.fill()`，只有页面确实依赖逐键处理时才使用 `pressSequentially()`；这等价于默认表达目标状态、按需表达击键过程。[Playwright input actions](https://playwright.dev/docs/input) Puppeteer 的 Locator 也以 `fill()` 表达字段结果，而 `Keyboard.type()` 明确逐字符派发 keydown/keypress/input/keyup，不能被当作 IME 提交结果的替代品。[Puppeteer locators](https://pptr.dev/guides/page-interactions) [Keyboard.type](https://pptr.dev/api/puppeteer.keyboard.type)

Selenium 的 Actions API 保留按键 down/up 以表达物理组合，同时常用元素交互通过 `sendKeys` 后读取元素 `value` 断言结果。这说明按键 API 和结果 Oracle 是两个层次，调用返回不等于业务结果已确认。[Selenium keyboard actions](https://www.selenium.dev/documentation/webdriver/actions_api/keyboard/) [Selenium element interactions](https://www.selenium.dev/documentation/webdriver/elements/interactions/)

## 桌面 Accessibility / UI Automation 的映射

macOS Accessibility 的 `kAXValueAttribute` 是编辑文本字段的内容，`kAXFocusedAttribute` 表示对象是否持有键盘焦点，适合分别充当最终状态和路由前置条件。[kAXValueAttribute](https://developer.apple.com/documentation/applicationservices/kaxvalueattribute) [kAXFocusedAttribute](https://developer.apple.com/documentation/applicationservices/kaxfocusedattribute) Recorder 不能仅凭字段曾经聚焦就写值；生成脚本需要在同一活动窗口内唯一解析目标，并在写前、写后都验证 focus 与 value 指纹。

Windows UI Automation 的 `ValuePattern` 提供字符串值和 `SetValue`，但微软文档指出多行编辑器可能改用 `TextPattern`，而后者不提供写入，必要时只能使用模拟输入。[ValuePattern.SetValue](https://learn.microsoft.com/en-us/dotnet/api/system.windows.automation.valuepattern.setvalue?view=windowsdesktop-10.0) [Implementing the Value control pattern](https://learn.microsoft.com/en-us/dotnet/framework/ui-automation/implementing-the-ui-automation-value-control-pattern) 可迁移原则是：平台能力必须逐控件证明；没有可读写 value 合同的平台或控件不能假装已经取得最终结果。

## Clawdesk 设计

1. 只有同时显式声明 `captureKeyboard: true` 与 `keyboardContent: "non-sensitive-test"`，才启动最终文本采样；宿主仍必须由 `-allow-recorder-capture` 授权。
2. 只读取已聚焦、可写、非安全 `textField`。密码/安全字段拒绝读取；manifest 只保存 before/after 的 UTF-16LE SHA-256、长度和必要的插入差异，不保存未变化的完整上下文。
3. 编辑控件可缺少指针 bounds，因为几何不是读取焦点 value 的必要条件；此时必须至少具备 name 或 identifier。重放时仍须在精确活动窗口内唯一解析，并验证写前/写后 focus 与 value 指纹。
4. macOS 只保存当前文本输入源的粗分类：直接键盘布局、输入法/输入模式或未知；不保存具体输入法 ID、名称或语言。粗分类和 `key-typed-is-not-an-ime-commit` gap 决定语义资格，不决定完整 Basic Latin 事实能否进入低层 fallback。
5. 已验证最终值继续生成权威 `text-edit`。取不到最终值时，Basic Latin fallback 生成命名变量并声明“可能是输入法拼音”；human-to-recipe 必须在生产化时确认、改名或参数化，并使用独立 Oracle。不可表示的 composition/dead key、事件丢失、无配对边界、动作窗口缺失，以及已验证非 ASCII patch 与 Enter/Tab 的副作用边界歧义继续 fail closed。
6. `text-edit` 吸收其关联物理键，避免先写最终值又重复击键。快捷键、导航键和无法由值变化表达的应用副作用仍由物理事件建模。

## 2026-09-09 WeChat 录制包诊断

`.runtime/recordings/rec-20260909T191353.280448000Z-62ee91400ca2` 的终结 manifest 证明键盘捕获和非敏感声明均已开启，但没有任何 `textEdits`。同一输入区域的 pointer context 明确记录 `semanticStatus: "unavailable"` 与 `semanticReason: "accessibility element has no usable bounds"`；旧的焦点文本探测也把 bounds 作为硬条件，且没有把探测错误写入包，因此现有证据能确定“最终值通道没有产出”，并强烈定位到这个错误的几何前置条件，但不能从历史包恢复当时被丢弃的具体 AX 字段。

raw 中每个拉丁 `KEY_TYPED` 都带 `key-typed-is-not-an-ime-commit`，第二段依次组成 `ceshi chengg 123`。早期 builder 忽略该 gap，直接把拼音字面量写进 `keyboard.type()`；随后一版为避免冒充最终中文而用 `text-outcome-unverified` 阻塞整包。当前分层规则保留这项语义警告但不再牺牲基础候选：重新制作时可生成显式低层变量，仍不会根据后来观察到的“测试成功123”反向修改历史事实、把拼音升级为最终中文或自动执行脚本。只有下游确认／参数化该变量并通过独立 Oracle，才能取得对应业务结果的 production 资格。

## 2026-09-10 WeChat／CEF 无最终值包复核

后续两个包 `rec-20260910T055916.912606000Z-9ae5d84459b1` 与 `rec-20260910T062525.136747000Z-a0aaf6981215` 进一步证明问题不是 libuiohook 丢字符：WeChat 的 AX 表面只暴露窗口和标题栏按钮，`AXFocusedUIElement` 不可得；raw 仍分别完整保存 17／32 个 Basic Latin `KEY_TYPED`，来源为 `unknown` 且带 `key-typed-is-not-an-ime-commit`。旧 `actions.json` 的 `text-outcome-unverified`／`unassociated-key-evidence`／`unresolved-event` 数量分别为 17／34／17 和 32／64／37；第二包的后一组还包含 6 次 Backspace press 只对应一个 release。

用当前构建静态重建后，两包都写入不覆盖旧文件的 `actions.r002.json`，readiness 为 `ready`、issues 为空，并成功生成 `verification: "not-run"` 的 v3 candidate。第一包形成 5 个 actions；第二包形成 15 个 actions，其中三段 Basic Latin 作为显式低层变量，6 次 Backspace 折叠为 `repeatCount: 6`。这只证明基础候选结构完整：这些变量仍可能是输入法拼音，不证明 WeChat 最终出现了相应中文。该轮没有执行生成脚本或发送任何桌面输入，也没有固定业务 Oracle，因此状态是 generated／statically reviewed，而不是 live verified／qualified。
