# recipe-build 示例｜Calculator 的 Procedure → Business Step → JS

> 本例解释实现映射，不定义通用 Calculator 规则，也不是 Fresh Run 证据。

## 输入语义

Procedure 已确认：

```text
B025: 读取第一次实际结果 -> firstResult
B040: 第二次计算消费 firstResult
transform: characters
B050: 读取 finalResult -> final output
```

应用规则/API 也已由上游提供。

## 正确映射

```js
const firstResult = await readCalculatorResult(win);
await pressKeys(win, ["6", "×", ...firstResult, "="]);
const finalResult = await readCalculatorResult(win);
return finalResult;
```

关键不是语法，而是来源链：

```text
B025/read -> firstResult
firstResult -> characters -> B040 input
B050/read -> final output
```

## 错误 1：硬编码示范答案

```js
const firstResult = "110";
```

即使最后得到 660，也破坏 runtime producer。

## 错误 2：读取了但消费者不用

```js
const firstResult = await readCalculatorResult(win);
await pressKeys(win, ["6", "×", "1", "1", "0", "="]);
```

sourceMapping 可以看起来正确，但真实 dataflow 是假的。

## 错误 3：JS 重算 UI 结果

```js
const firstResult = String(25 * 4 + 10);
```

若合同要求结果必须来自 Calculator UI，这属于重新设计/绕过业务证据，不允许。

## 错误 4：缺 final read

第二式点击结束后直接 `return "660"`，不能实现 B050。

## sourceMapping

候选应能明确指出 B025、B040、B050 分别由哪些源码区域实现，并关联所用 apiRef/operation rule。代码中若出现额外 fallback，也必须有明确工程来源，而不是临时猜测。