# recipe-qualify｜独立 Skill 审查基线

七项分别检查：方法正确性、输入输出完整性、责任边界、失败处理、案例解释、下游消费/发布可用性、跨应用复制。

95+ 最低条件：
- exact Candidate/contract/environment/scope 强绑定；
- scenario 和 scopeRefs 运行前定义；
- requested 内未测项不能被移到 excluded；
- one run、repeatability、parameterization 三种 claim 明确分离；
- parameterization 需要同一 Candidate 的合法变参证据；
- PASS 不扩大环境/输入/布局/平台范围；
- S12 不 patch Candidate 或降低标准；
- checker/static review 不冒充 live qualification。