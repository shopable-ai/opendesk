# recipe-qualify 示例｜Calculator 的一次运行、重复运行与参数化

> 本例解释资格证据强度，不是本轮新的真实桌面验收。

## 固定对象

资格开始前固定：
- exact Candidate/scriptHash；
- TaskContract；
- requested scope；
- environment/build；
- scenarios 与 Oracle。

## 1. 一次 Fresh Run 能证明什么

如果同一 Candidate 的正常入口实际运行一次，独立观察到业务流程和 finalResult 满足合同，QualificationRecord 可以证明：

```text
该 Candidate 在这一次明确输入、环境、范围内成功。
```

不能据此写：
- 稳定重复运行；
- 任意表达式；
- 任意布局；
- 所有平台；
- 参数化支持。

## 2. 重复运行证据

若 requested claim 是 repeatable，需要至少两个独立 Fresh Run：

```text
Run 1: clean attributable start -> exact Candidate -> independent evidence
Run 2: new clean attributable start -> same exact Candidate -> independent evidence
```

两个 run 都必须绑定同一 frozen Candidate。改代码后的第二次不是同一 Candidate 的重复性证据。

## 3. 参数化证据

若 Candidate 声明输入可参数化，资格不能只跑示范值 `25,4,10,6`。

至少还要选一个合同允许、不同于示范值的合法 input，通过同一 inputContract 和同一 frozen Candidate 执行，证明：

```text
caller input
-> Candidate validation
-> Business Step consumer
-> actual UI execution/result
```

修改源码里的数字后再运行，不是参数化；helper 有参数但 entry 仍写死，也不是参数化。

## 4. PASS 不能扩大范围

假设 requested scope 包含：
- fixed demonstration input；
- one legal varied input。

只跑第一项成功，第二项没跑。正确记录是第一项 exercised/qualified，第二项 not-run，overall 不能把第二项移入 excluded 后宣称全请求 PASS。

## 5. 中间数据链仍要验

最终 660 正确并不足够。若合同要求第二式使用本次 firstResult，则资格应有证据确认 production Candidate 真正消费 runtime value；硬编码 110 的候选即使最终结果相同也不应通过对应 criterion。