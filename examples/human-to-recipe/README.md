# Human-to-Recipe 普通 JS 示例

`calculator-current.recipe.js` 是固定 Calculator 任务的普通 JS 候选。先阅读其
`main()`，再按需要查看窗口、读取和 C/AC helper；正常运行不需要 Agent 逐步规划。

从仓库根目录，在已确认 Calculator 控制交接且符合脚本支持范围时运行：

```sh
./dist/opendesk -script examples/human-to-recipe/calculator-current.recipe.js -console-mode normal
```

业务顺序为按钮 `25 × 4 + 10 =`、本次读取 `firstResult`、清空 UI 并保留变量、
按钮 `6 × firstResult =`、本次读取 `finalResult`。正常结果只包含两个实际读值。
必要输入回执通过已公开的 `console.debug` 保存到本次 execution artifact；
`normal` 隐藏调试日志，`script` 模式可用于查看，但回执不证明业务完成。

当前支持范围是已记录的 macOS Calculator Basic 232×321 和中文原生标签。
起点沿用整数读取规则；本次计算结果保留原 1..12 位非负整数字符串格式，包含零及前导零。小数、错误显示、
其他布局或语言未获支持时，脚本在输入前停止。原始录制的实际操作者仍需按
材料记录区分，不能从 Recorder 或脚本文件存在推断真人录制已通过。

人类审阅入口为本任务 `.runtime/tests/human-to-recipe/partial-authoring/stage-review.md`；
它分别记录源码审阅、受控消费、实际命令、独立资格、视觉和真人链。
独立资格入口是 `tests/human-to-recipe/tools/qualify-calculator-partial.cjs`，
必须消费本次冻结的 Human plan 和源码 hash。公开命令、资格 Gate 和视觉证据
分别验收，历史 Runtime 的 PASS 不转移给当前依赖。

`calculator-115.semantic.recipe.js` 是另一项旧任务的维护样本，用于解释原录制来源、
业务 Episode 和已限定的相对点策略；它不提供当前两段任务的结果或资格。
