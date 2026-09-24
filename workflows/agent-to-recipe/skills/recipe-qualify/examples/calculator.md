# recipe-qualify 示例：Calculator 验证范围

> 目的：展示资格验证如何描述范围，而不是扩大结论。

## 验证对象

固定 Candidate。

固定 TaskContract。

固定验证范围。

## 可以证明

一次 Fresh Run：

- 该候选完成一次固定任务。

两次独立 Fresh Run：

- 同一候选在声明范围内具备重复运行证据。

## 不能证明

固定 Calculator 通过不能推出：

- 任意表达式；
- 任意布局；
- 所有平台；
- 所有参数组合。

## 输出

QualificationRecord 应明确：

- candidate；
- scope；
- evidence；
- pass/fail/not-run/blocked。
