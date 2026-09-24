# trace-distill 示例：Calculator 必要步骤提炼

> 目的：展示如何从事实轨迹提炼必要路径，不展示 Calculator 专用算法。

## 输入

来源：

- TaskContract；
- DemonstrationDossier；
- Raw Trace；
- runtime value 来源和消费者关系。

示例事实：

- 第一次计算后读取 firstResult；
- 第二次计算输入使用该运行时值。

## 处理判断

### 保留

第一次读取必须保留。

原因：

它不仅是验证结果，也是后续步骤的数据生产者。

### 保留

第二次准备状态。

原因：

它服务于第二次计算起点，不能仅因为动作名称相似而删除。

### 保留

数字串中的重复字符。

例如：

110

展开后：

1,1,0

两个 1 不能因为相同而合并。

## 输出示例

DistilledSteps：

```
prepare first calculation
→ execute first expression
→ read runtime value firstResult
→ prepare second calculation
→ consume firstResult
→ read final result
```

## 不支持的结论

本示例不证明所有动作都必须保留，也不证明复杂去噪已经完成。

删除、合并必须基于原始事实、状态变化和数据依赖判断。
