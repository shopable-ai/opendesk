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

缺任一关键项，不运行后再补写。