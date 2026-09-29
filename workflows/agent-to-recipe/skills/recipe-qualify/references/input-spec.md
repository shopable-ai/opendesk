# recipe-qualify｜输入规格

## 必需输入

实际读取：qualification request、固定 TaskContract bytes/content ref、success/failure criteria、CandidateManifest、script/dependency bytes/hash、entry command、workingDirectory、Procedure/AppProfile/API refs、requested scope、运行前 scenarios、current environment/build、权限/副作用授权、预算、独立 observation source。

既有证据只有在 candidate/dependencies/environment/scope/validity 全匹配时才能复用；复用旧证据不是新的 Fresh Run。

## 运行前充分性

必须能回答：
1. 验的是哪个 exact Candidate？
2. requested scope 每一项是什么？
3. 每个 scope 用哪个 scenario 覆盖？
4. scenario 的 input/oracle/evidence source 在运行前是否确定？
5. Candidate 正常入口和环境是否可实际执行？
6. Oracle 是否与 production input 隔离？
7. 必要上游来源、当前候选的阶段退出与合法接续依据是否合格？显式数据流阻断是否由同字节独立证据解除，而不是忽略或借另一候选报告？

S12 进入检查与最终 S12 退出不同：不能要求尚未发生的 live 结果作为启动前必需输入。Calculator 正式请求增加内容绑定的 `stageReviewRef`，由正常资格入口执行 S11→S12 检查；源代码、合同和依赖必须与该记录一致。已有 Candidate 的接续不等于重新完成新生产隔离。

缺任一关键项，不运行后再补写。历史资格、一次成功或静态检查不能缩减最新请求明确的运行次数和范围。
