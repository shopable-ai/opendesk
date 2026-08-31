# schemas

本目录保存项目正式维护、需要版本化评审的 JSON Schema 数据契约。Schema
描述稳定工件格式，不保存运行结果；生成的实例、校验日志和临时快照必须写入
`.runtime/`，长期测试样本应放在对应的 `tests/<domain>/fixtures/`。

## 目录边界

- `automation/`：视觉理解、语义推理、动作决策、golden sample 和 replay 工件。
- `runtime-api/`：JavaScript Runtime API catalog、事件、证据清单和运行摘要。

新增 Schema 必须满足：

1. 使用 JSON Schema Draft 2020-12；
2. 文件名采用 `<artifact>.schema.json`；
3. `$id` 使用 `https://opendesk.dev/schemas/<domain>/<file>`；
4. 被生产代码或测试引用，并随消费者变更一起验证；
5. 不在根目录继续堆放未分类 Schema。
