# 关键片段到完整 Calculator Recipe

用户任务是：按按钮计算 `25 × 4 + 10 =`，实际读取 `firstResult`，清空界面而保留变量，按按钮输入 `6 × firstResult =`，实际读取并输出 `finalResult`。110、660 只属于预期判据。

下面是维护用 fixture，不能作为真人录制、现场数值或资格证据。实际工作包仍以自己的 raw/actions、Human plan、AppProfile、精确 JS 和独立报告为权威。

| 已有事实及来源 | 缺口与阻塞原因 | 最小补证与 owner | 下游实际消费 |
| --- | --- | --- | --- |
| 固定 actions 只有 `2、5、×、4、+、1、0、=` | 按钮不证明读取过结果；包 ready 不证明完整任务覆盖 | Human plan 对照完整用户声明，不重问已明确目标 | 原 8 个 action 各有唯一 disposition/source map，只进入第一段 |
| 用户明确规定“本次 firstResult” | 缺当前显示对象、实际读取方式及格式 | application-engineer 定向确认显示与按钮身份，复用仍适用规则 | `readCalculatorResult()` 取得实际字符串并与当前主显示器比较 |
| 用户明确清空界面并保留变量 | 单次零显示不证明全表达式清除，也不证明变量传递 | 复核有限 C→AC 规则、停止条件和对应限定证据 | `const firstResult` 保留；clear 只改 UI，后续展开其字符 |
| 第二段未录制 | 缺完整任务执行及终点证据 | Human owner 增加有来源的 Episode；H7 验证完整精确候选 | `['6','×',...firstResult,'=']` 的实际后续输入和终点读取 |

行为决定仍只维护在 Human plan。v2 的材料引用、补证条目和本次数据边允许补充 Episode 没有历史 action；不创建假 action，不把新 Agent 观察写回 raw。原录制执行者无法确定时保持 unknown，采集工具 Recorder 不等于真人。

同一 `application-engineer` 的限定 harden 复用检查接收 Human v2 与 Agent 原生过程，返回同版 Profile 操作及原 sourceRefs/unknowns。受控消费者实际执行候选，使用该输出的窗口/显示规则；改错显示对象时必须在输入前停止。这个切片不认证完整 Profile、独立模型 Producer 或 live 能力。

当前复用的正式普通 JS 资产是 `examples/agent-to-recipe/calculator-current.js`。它的关键业务正文为：

```js
const firstInput = await clickCalculatorButtons(win,['2','5','×','4','+','1','0','=']);
const firstResult = await readCalculatorResult(win);
const secondClear = await clearCalculator(win);
const secondInput = await clickCalculatorButtons(win,['6','×',...firstResult,'=']);
const finalResult = await readCalculatorResult(win);
```

读取、唯一性、清空、窗口/焦点/布局及未知动作停止规则都在该实际源码中；独立 Gate 执行冻结的同一文件，不维护测试专用业务流程。重用源码不继承它的历史资格。

从仓库根目录生成带明确 fixture 标记的维护样本：

```sh
node tests/human-to-recipe/tools/calculator-partial-fixture.cjs --complete-fixture
```

输出给出实际 plan/candidate 路径和 SHA-256；所有材料落入 `.runtime/`，原始包与原候选不覆盖。生产生成前运行同一个 Human validator/scorer，必须所有硬门槛通过、总分 ≥95、关键维度达到最低分。当前 API inventory 的更新不改变权重。

从仓库根目录，使用输出中的实际 plan 与经过源码审阅的 candidate hash：

```sh
node tests/human-to-recipe/tools/qualify-calculator-partial.cjs --controlled <plan.json> --reviewed-source-sha256 <candidate-sha256>
```

该入口对本次读值作受控变化，观察真正后续输入，验证故障后的停止；这是受控证据。Node vm 不是安全沙箱，必须先审阅源码。冻结报告同时绑定 plan、来源、规则、scorer/validator/Gate、Runtime、其加载的 polyfills 和独立观察脚本；任何消费依赖变化均使旧记录失效。

真实 H7 使用同一个入口的 `--live`，只在 Calculator 已由本任务独占且无在途/未知输入时运行。它按候选的普通 `./dist/opendesk -script <实际候选路径> -console-mode script` 命令启动两个独立完整 Fresh Run，并分别启动独立只读观察 execution。每次都重新取得 firstResult，任何失败停止；不能把分段/不同 run 的数值拼为成功。

排错从第一个不成立的边界开始：材料损坏回 Recorder/H2；业务覆盖或数据边回 Human plan；显示/清空/身份规则回 application-engineer；源码漂移回生成；观察器/Oracle/场景回 H7。保留有效上游，新版本重新固定受影响依赖。窗口被其他任务操作、动作效果未知或预算无新信息时先停止，不能靠重复输入或降低断言取得资格。

当前工作的状态与可读证据指向原工作包 `stage-review.md` 和实际 Gate 报告；本教学样本没有可单独编辑的进度或评分。
