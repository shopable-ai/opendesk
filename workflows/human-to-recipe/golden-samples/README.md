# Human-to-Recipe Golden Samples

本目录保存语义生成与静态审阅的冻结期望，不是第二套可执行生产入口。生产文件仍以 `examples/human-to-recipe/` 为准；golden 只能在同一 build plan、来源和 review 决定下更新，并由测试做字节比较。

当前状态：

- `calculator.js`：已存在 production/gate/evidence 分层；golden 必须与 `examples/human-to-recipe/calculator-115.semantic.recipe.js` 字节一致。
- `calculator-115.semantic-build-plan.json`：固定同一 actions 的 revision/hash/raw reference、逐动作 disposition/source map、三个 Business Episode、Target/Locator/Geometry、运行门禁与 Gate→production 源码绑定；可由仓库内 validator 重新读取实际 actions 字节核对。
- TextEdit：只以 `examples/ai-cli/macos-textedit-recipe.js` 校准 Geometry 和复杂窗口生命周期；它尚未拆成 human production/gate，不在本目录伪造第二份已资格 golden。

golden 通过只证明确定性输出没有意外漂移。语法、Runtime 合同、普通用户命令、独立资格 Gate 和真实视觉证据仍分别验收。
