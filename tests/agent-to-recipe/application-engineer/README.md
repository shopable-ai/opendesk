# application-engineer review tests

工作目录均为仓库根目录 `/Users/mac/Documents/workspace/clawdesk`。本目录只验证截图提取资料的整理、AppProfile 检查、审阅视图和基线绑定修订；不运行计算器、不验证点击、读数或完整业务。

## 已实际运行的程序测试

```sh
python3 -m unittest discover -s tests/agent-to-recipe/application-engineer -p 'test_*.py' -v
```

覆盖：合法／非法数据，重复或悬空 ID、父关系、非有限值、unknown 保留，仿射裁剪缩放和宽零键，Unicode 符号，明确展示／隐藏集合，同源原图／叠加／简化／属性视图，默认隐藏关系线，修订同步、错版和覆盖拒绝、依赖重验、冻结输入确定性、HTML 注入和路径越界。fixture 与程序输出不计为模型识别准确率。

普通 discovery 未提供真实提取环境变量时，真实证据比较测试明确 skip。下列命令已用两份 `.runtime` 冻结资料单独运行，比较另一张未用于实现调整的真实截图提取；其标准由同期截图／窗口记录和提取后人工逐项核对形成，不是隐藏真值或独立审阅者：

```sh
OPENDESK_REAL_MODEL_EXTRACTION=.runtime/automation-authoring/calculator-application-engineer-20260908/attempts/application-review-002/held-out/model-extraction.actual.raw.json OPENDESK_REAL_MODEL_STANDARD=.runtime/automation-authoring/calculator-application-engineer-20260908/attempts/application-review-002/held-out/comparison-standard.json python3 -m unittest tests/agent-to-recipe/application-engineer/test_model_extraction.py -v
```

## 已实际运行的真实资料接线

当前 Codex 宿主用 `view_image` original detail 读取真实 PNG 字节；没有调用 OCR、`Vision.analyzeLayout()` 或 `opendesk ai` 冒充模型。原始输出由 Agent 先保存，下面的程序只核对并整理它：

```sh
python3 workflows/agent-to-recipe/skills/application-engineer/scripts/review.py ingest-extraction --profile .runtime/automation-authoring/calculator-application-engineer-20260908/attempts/application-review-001/app-profile.json --extraction .runtime/automation-authoring/calculator-application-engineer-20260908/attempts/application-review-002/model-extraction.actual.raw.json --output .runtime/automation-authoring/calculator-application-engineer-20260908/attempts/application-review-002/app-profile.r003.json --extraction-root-id task --extraction-root .runtime/automation-authoring/calculator-application-engineer-20260908 --new-revision r003 --changed-at 2026-09-08T20:31:00+08:00 --actor-id /root
```

该命令证明当前实际输出的截图 ref/hash/尺寸、observation、20 个目标和范围数据可被下游消费；不证明模型盲测准确率，也不把导入标成人工批准。

应用明确修订后的 r004 已单独检查；重新生成最终审阅页的命令是：

```sh
python3 workflows/agent-to-recipe/skills/application-engineer/scripts/review.py render --profile .runtime/automation-authoring/calculator-application-engineer-20260908/attempts/application-review-002/app-profile.json --previous-profile .runtime/automation-authoring/calculator-application-engineer-20260908/attempts/application-review-002/app-profile.r003.json --output-dir .runtime/automation-authoring/calculator-application-engineer-20260908/attempts/application-review-002/views-r004 --root runtime-ai=.runtime/ai --force
```

`overlay.png`、`simplified.png` 和复制的原图已由当前 Agent 实际查看。当前 Codex 会话没有可用 in-app Browser/Chrome 实例，因此 `review.html` 的真实浏览器整页渲染检查为 not-run；HTML 字符串测试没有被当作视觉通过。

运行日志位于 `.runtime/tests/agent-to-recipe/application-engineer/`。
