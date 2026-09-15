# 桌面测量中文样机：历史验证与入库记录

> 2026-09-14，保存已确认方案的验证资产。本页记录上传交付包中的历史结果，不是本轮重新运行测试的报告，也不是 OpenDesk 原生产品验收。

## 入口与本次保存范围

[唯一产品设计](../architecture/desktop-automation/desktop-measurement.md) · [中文 HTML 样机](../../apps/opendesk/prototypes/desktop-measurement/index.html) · [样机资产说明](../../apps/opendesk/prototypes/desktop-measurement/README.md) · [验证说明](../../tests/desktop-measurement/README.md) · [下一轮实施提示词](../../prompts/desktop-measurement-implementation.md)。

设计正文继续只维护 canonical 文件。样机现由 `apps/opendesk/prototypes/desktop-measurement/` 长期保存，作为 OpenDesk 产品的 UI / Interaction Oracle；这表示产品所有权，不表示它是正式应用入口，也不表示样机会进入 Runtime 生产执行链路。Node / Playwright 验证、fixtures 与导入清单继续留在 `tests/desktop-measurement/`。

2026-09-15 仅进行了目录职责调整：`index.html`、`template.html`、`model.js` 复用原 Git blob 迁移，样机内容没有因目录迁移而修改。导入时旧路径与当前路径同时记录在 [`import-manifest.json`](../../tests/desktop-measurement/import-manifest.json)，避免重写历史。

源文件一致性：原单文件 HTML 和交付包中的 `prototype/index.html` 字节相同，SHA-256 为 `8ff69e481d09778e7870228bba143c5b90a123af414f97503e424784082a34c5`。模板插入模型全文与单文件 HTML 一致。

原始 PNG 截图、完整 ZIP 和逐次运行日志不作为维护源码入库；来源清单保留各文件校验值，不能把清单等同于原始图像证据。后续截图、日志和下载结果统一写入 `.runtime/tests/desktop-measurement/prototype/`。新对话可直接打开已入库 HTML 理解交互，不依赖原对话附件；若要复查当时的原始截图，则仍需原始交付包。

## 历史验证记录（原报告内容）

范围：独立 HTML 样机，不是 OpenDesk Runtime 或原生桌面验收。

### 几何模型

16 项 / 16 项通过。详细 TAP 输出见原交付证据 `evidence/model-tests.txt`；其中一项包含 1000 组矩形恒等式。

### 浏览器交互

34 项 / 34 项通过。浏览器脚本异常：0。

| 检查 | 状态 | 证据边界 |
| --- | --- | --- |
| 默认测量界面不打开详情 | PASS | 浏览器合成样机 |
| 默认同时绘制参照与目标 | PASS | 浏览器合成样机 |
| 三个网页模拟入口复用同一会话 | PASS | 浏览器合成样机 |
| 鼠标移动不会切换锁定参照 | PASS | 浏览器合成样机 |
| 2x冻结源蓝色像素取色 | PASS | 浏览器合成样机 |
| 像素色包含源图坐标与显示器 | PASS | 浏览器合成样机 |
| 详情只在用户请求时打开 | PASS | 浏览器合成样机 |
| Esc关闭详情而非结束会话 | PASS | 浏览器合成样机 |
| 打开关闭详情不污染原始取色 | PASS | 浏览器合成样机 |
| 两点真实样机数据导出距离 | PASS | 浏览器合成样机 |
| 两区域间距与重叠分别导出 | PASS | 浏览器合成样机 |
| 越过参照右边缘显示负44 | PASS | 浏览器合成样机 |
| 距离标签不藏在角落信息下 | PASS | 浏览器合成样机 |
| 角落避让 top-left | PASS | 浏览器合成样机 |
| 角落避让 top-right | PASS | 浏览器合成样机 |
| 角落避让 bottom-left | PASS | 浏览器合成样机 |
| 角落避让 bottom-right | PASS | 浏览器合成样机 |
| 负逻辑坐标仍正确取色 | PASS | 浏览器合成样机 |
| 双屏模拟保留不同像素映射 | PASS | 浏览器合成样机 |
| 拖动区域更新位置不改变大小 | PASS | 浏览器合成样机 |
| 拖动尺寸手柄可调整区域 | PASS | 浏览器合成样机 |
| 方向键微调区域一个逻辑单位 | PASS | 浏览器合成样机 |
| Tab可切换更大候选 | PASS | 浏览器合成样机 |
| 按住Alt暂停吸附 | PASS | 浏览器合成样机 |
| 第1档复制经适配器接收 | PASS | 剪切板适配器为测试替身；不是系统剪切板验收 |
| 第2档复制经适配器接收 | PASS | 剪切板适配器为测试替身；不是系统剪切板验收 |
| 第3档复制经适配器接收 | PASS | 剪切板适配器为测试替身；不是系统剪切板验收 |
| 剪切板不可用时显示手动复制而非虚报成功 | PASS | 浏览器合成样机 |
| 保存可解析结构化JSON | PASS | 浏览器合成样机 |
| 更换参照需显式确认且不更换源快照 | PASS | 浏览器合成样机 |
| 退出移除所有测量层并清理样机会话引用 | PASS | 浏览器合成样机 |
| 退出后测量快捷键不产生结果 | PASS | 浏览器合成样机 |
| 退出后可通过Recorder模拟入口新建会话 | PASS | 浏览器合成样机 |
| 没有浏览器脚本异常 | PASS | [] |

### 真实环境待验收

所有系统级结论仍为 NOT_RUN：macOS 与 Windows 原生 surface、窗口焦点、全局快捷键、真实 Recorder 事件、系统剪切板、多物理显示器、真实 Retina／混合 DPI、进程异常后的 topmost／hook／快照清理。

设计覆盖自评 96/100，不是独立专家评分，不是原生发布评分。设计审查与真机验收分别记录，不能平均分掩盖任一 P0 缺口。
