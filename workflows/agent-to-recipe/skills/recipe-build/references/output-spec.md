# recipe-build｜输出规格

## 主产物

输出普通 JS + CandidateManifest + 本次实际检查记录。可读说明只投影同版事实，不成为第二套过程或资格记录。

## 必须保留的映射

| 需要证明 | Candidate/源码应提供 |
| --- | --- |
| Procedure → code | sourceMapping 到具体源码区域/helper |
| Business Step inputs | 实际变量/参数/producer return 的来源 |
| runtime dataflow | producer return → transform → consumer call |
| parameterization | inputContract → validation → actual consumer |
| operation rule | target/locator/read/wait/action 与 apiRef |
| failure stop | guard/error path/unknown-side-effect stop |
| final output | terminal read/return/print 的代码路径 |

## 策略与应用操作的实现交付

在现有 sourceMapping、dependencies、inputContract、limitations 和检查记录中说明实际采用的操作/路径、来源规则、范围、选择输入及停止分支，不新增 StrategyManifest。每个生产分支都有批准依据；待验证想法不伪装成可选备用，也不保留大段注释备用代码。

内联、helper、应用操作/Adapter 和模块按真实维护需求选择。复用现有 helper 时冻结其版本；任何关键 helper、规则、策略配置或模块依赖变化都要重新判断 Candidate 与重验范围。上游批准的策略参数必须从真实入口经过校验流到 consumer，不能只给一个无人消费的配置对象。

S11 检查记录将代码映射、真实 Runtime/入口检查和未运行的 UI/资格分开。当前任务 stage-review.md 链接同版 Candidate 及检查，不成为第二份策略或过程真相。

## CandidateManifest

至少固定 scriptRef/hash、关键 dependency refs/hashes、entryCommand、workingDirectory、inputContract、supported/excluded scope、limitations、sourceMapping、apiRefs、upstream refs 和 revalidation impact。

CandidateManifest 不能引用未来 Qualification 作为生成前提，也不能把历史 pass 写成当前 Candidate verdict。

模块入口同时绑定源入口及实际依赖，并在执行证据中保存 loader/build provenance 和实际 payload 身份。`.mjs` 源文件 hash 与 Execution.scriptHash 不混同；普通 `.js` 不强制改模块。不把 Node/bundler 成功写成 OpenDesk 入口成功，更不写成桌面 Fresh Run。

## 禁止

- 为通过 Calculator 写死 `110` 或 `660`。
- 用 JS arithmetic 替代必须从 UI 读取的 firstResult。
- 入口仍写死却宣称参数化。
- sourceMapping 存在但实际代码使用另一路常量/fixture。
- 通过缩小 supported scope 遮盖原任务未实现。
- 代码修改后沿用旧 candidate hash/qualification。
- 动作效果 unknown 后，因 auto/手工策略选择而换后端重做；部分完成时重放前缀。
- 将参考操作名、非公开 CommonJS 或未经核实的 module/import 能力当作当前可执行合同。
