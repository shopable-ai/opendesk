# 桌面测量：中文交互样机与验证资产

## 直接打开

在浏览器打开 [`prototype/index.html`](prototype/index.html)。这是用户已确认的中文单文件样机，不需要安装前端依赖、运行 OpenDesk 或启动 HTTP 服务。

从仓库根目录在 macOS 上可执行：

```sh
open tests/desktop-measurement/prototype/index.html
```

Windows 可在文件管理器中双击同一文件，或从仓库根目录运行：

```powershell
Start-Process .\tests\desktop-measurement\prototype\index.html
```

浏览器直接打开本地文件时可能限制剪切板；页面提供手工复制回退。这些是体验入口说明，本次资产入库没有在 macOS／Windows 上重新执行上述命令。

## 职责与入口

- [唯一产品设计](../../docs/architecture/desktop-automation/desktop-measurement.md)：用户流程、功能树、状态机、目标与参照、快照、几何和原生验收门槛。
- [历史样机验证记录](../../docs/quality/desktop-measurement-prototype.md)：上一轮 16 项模型测试与 34 项浏览器检查的范围，不代表当前原生产品 PASS。
- [下一轮实施提示词](../../prompts/desktop-measurement-implementation.md)：直接推进真实 Measurement Session，而非重做网页样机。

放在 `tests/desktop-measurement/`，而不是 `apps/`：本目录负责产品设计验证，不能被当作正式测量应用入口，也不能成为 Runtime／Desktop App 发行依赖。正式实现复用已有产品 owner 和 native surface，不从此目录启动第二个应用。

## 页面哪些部分属于正式设计

中间画面上的参照虚线、目标实线、距离线、角落信息和小工具条是交互参照。页面顶部的模拟三入口、底部的场景／显示器切换器属于样机控制器，不能照搬进正式产品。

背景、窗口、吸附候选和显示器均为合成数据。页面不读取真实桌面，不连接 OpenDesk Runtime，也不从网页注册系统级快捷键。取色来自合成 Canvas 的冻结源像素；剪切板成功测试使用替身，不能替代系统剪切板验收。

建议体验顺序：区域相对窗口 → 点与颜色 → 两点 → 两区域 → 区域越界 → 四角避让 → 详情开关 → 三档复制 → 退出及再次进入。支持框选、拖动、八方向尺寸手柄、1–4 切换工具、Tab 切换候选、Alt 暂停吸附和方向键微调。

## 源文件与维护

`prototype/template.html` 与 `prototype/model.js` 是原交付包的模板和模型；`prototype/index.html` 是保留的单文件浏览器入口。三者导入时原样保存，关系为将模板中的唯一 `/*__MODEL__*/` 替换为模型全文。更新源文件时保持三者一致，不能分别发展成不同方案。

`model.test.js` 是 Node 宿主侧模型测试，`browser.test.py` 是 Python Playwright 浏览器测试；二者都不是 OpenDesk Runtime API 或真实桌面测试。模型仅用于样机与合同校验，不能复制成第二套 Runtime Geometry。

`fixtures/export-example.json` 是历史合成导出的固定样例，包含 `prototypeOnly: true`。其中时间、快照 ID、窗口与坐标都是样例值，不用于定位真实业务窗口。

## 后续复验

仅在获准执行测试时，从仓库根目录运行：

```sh
node --test tests/desktop-measurement/model.test.js
python3 tests/desktop-measurement/browser.test.py
```

浏览器测试需要 Python Playwright 和可用的 Chromium；优先使用已安装的 chromium／google-chrome，否则使用 Playwright 浏览器。本次入库不安装依赖、不运行测试、不启动真实桌面。

浏览器测试的新输出统一写入 `.runtime/tests/desktop-measurement/prototype/`，不写回源码、fixture 或历史证据目录。Node 测试结果输出到终端；需要保留时也写到同一 `.runtime/` 测试域。入库只调整测试文件的相对路径、证据输出位置和 UTF-8 读写，不改变原有断言。

未具备环境的原生权限、焦点、Recorder 隔离、物理多屏、系统剪切板和资源清理保持 NOT_RUN，不能沿用网页 PASS。
