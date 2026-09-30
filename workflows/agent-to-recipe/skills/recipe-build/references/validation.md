# recipe-build｜正确性检查

| 检查 | 正确要求 | 典型错误 |
| --- | --- | --- |
| Procedure mapping | 每个 Business Step 有实现 | JS 重设计/删业务步骤 |
| runtime producer | 真实 read/helper return | hardcoded/Expected/历史值 |
| consumer binding | consumer 实际接收 producer 值 | sourceMapping 写对但调用仍用常量 |
| transform | 只做 Procedure 允许的变换 | 临时 number cast/重算改变业务含义 |
| parameter entry | inputContract 真流到业务 call | helper 参数化但主入口写死 |
| failure stop | unknown/invalid 在副作用前后正确停 | catch 后继续点击/提交 |
| async order | await 与顺序保持语义 | 未等待读取完成就消费 |
| terminal | final read/return/print 可达 | 只输出 Expected/常量 |
| candidate freeze | hash 对应实际 bytes | 改码后继续引用旧 Candidate |
| scope | 实现与原支持范围一致 | limitations 偷偷缩任务 |

## 操作策略、封装与模块检查

以下是检查要求，不是本轮执行结果；沿用统一五维制度与适用 Gate，不新增策略总分。

| 检查 | 必须能证明 | 应拒绝的反例 |
| --- | --- | --- |
| 上游选择一致 | 每条生产路径追到固定 Procedure 与 AppProfile/规则 | S9 与 S10 不同选择，代码静默挑一个 |
| 默认正常路径 | 合法输入完成原任务，真实值流入消费者 | 所有场景一律拒绝来“确保安全” |
| 备用资格 | 每条可选路径有批准、范围、证据与安全切换条件 | 未验证路径、注释代码或虚构 API 进入 auto |
| 策略参数真实消费 | 仅上游批准时有入口、枚举校验与实际分支 | 配置存在但不生效；非法值偷偷回退 |
| 副作用故障 | unknown 停止，partial 不重放前缀，取消/权限/预算仍生效 | 超时换坐标再次提交；已成功因回执异常重做 |
| 范围与漂移 | 依赖变化触发对应重验，范围内成功与范围外拒绝分列 | 拒绝新环境却写跨版本兼容通过 |
| 最小封装 | 内联/helper/Adapter/模块各有真实需求，职责不漂移 | 简单脚本强制 Registry；Adapter 重写整个业务 |
| 模块入口 | 核对实际 `.mjs` 文件入口及真实依赖、main 生命周期与失败传播 | 把文件支持外推到 `-script-text` 或非公开 CommonJS |
| 候选身份 | 入口源文件/依赖与实际 payload 绑定，变化使旧资格失效 | 将源 .mjs hash 当 Execution.scriptHash，或改 helper 沿用旧 PASS |

可对冻结生产字节开展控制流/数据流和故障注入检查，但 mock 不认证真实 UI、原生取消或业务结果。OpenDesk 入口必须由真实可执行文件验证，Node/bundler 成功不能替代；未运行保持 not-run。

## Calculator 反例

- 正确：`const firstResult = await read...; ...firstResult...`
- 错误：`const firstResult = "110"`
- 错误：先真实 read，但第二式仍使用常量 `110`
- 错误：`const firstResult = 25*4+10`
- 错误：return 660 但没有 final UI read
- 错误：函数接收参数，但 entry 永远调用 `run(25,4,10,6)` 却宣称 parameterized。

静态 checker 只能证明其覆盖的代码模式/引用关系，不能证明真实 Runtime、UI 或 Fresh Run。
