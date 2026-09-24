# recipe-build 示例：Calculator 普通 JavaScript 映射

> 目的：展示过程如何落实为普通 OpenDesk JavaScript。

## 输入

来源：

- SemanticProcedure；
- 应用规则；
- 已选 Runtime API。

## 映射关系

业务步骤：

```
读取第一次结果
```

对应实现：

```
const firstResult = await readCalculatorResult(win)
```

业务步骤：

```
第二次输入消费 firstResult
```

对应实现：

```
['6','×',...firstResult,'=']
```

## 检查

代码必须保持：

- 运行时读取来源；
- 数据生产者和消费者关系；
- 停止条件。

不能为了通过固定案例写死最终答案。
