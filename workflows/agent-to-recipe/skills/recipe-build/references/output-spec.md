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

## CandidateManifest

至少固定 scriptRef/hash、关键 dependency refs/hashes、entryCommand、workingDirectory、inputContract、supported/excluded scope、limitations、sourceMapping、apiRefs、upstream refs 和 revalidation impact。

CandidateManifest 不能引用未来 Qualification 作为生成前提，也不能把历史 pass 写成当前 Candidate verdict。

## 禁止

- 为通过 Calculator 写死 `110` 或 `660`。
- 用 JS arithmetic 替代必须从 UI 读取的 firstResult。
- 入口仍写死却宣称参数化。
- sourceMapping 存在但实际代码使用另一路常量/fixture。
- 通过缩小 supported scope 遮盖原任务未实现。
- 代码修改后沿用旧 candidate hash/qualification。