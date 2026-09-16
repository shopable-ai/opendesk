# Desktop Measurement Prototype

本目录是长期 UI / Interaction Oracle，不是 Production Runtime，不读取真实桌面，不替代 AX/UIA、Native Host、Geometry 或 Recorder。

## 直接体验

```bash
open apps/opendesk/prototypes/desktop-measurement/index.html
```

无需 npm install 或 HTTP Server。依次体验：进入 Live 窗口选择 → 移动到聊天窗口或备忘录窗口 → 单击确认后冻结 → Hover 看 Candidate 尺寸/边距 → Tab 换层 → 点击锁定 → Enter／记录 → 继续下一个 → 测量记录 → 复制全部／保存 JSON。

“Live”场景、窗口、UI Tree 和源像素全部是浏览器合成测试替身，不是实际 macOS/Windows 桌面。

## 唯一维护关系

`index.html` 只保留 DOM 与相对资源引用；`prototype.css` 是唯一样式；`model.js` 保留原数学模型；`interaction-core.js` 是唯一状态/交互 owner；`visual-resolver.js` 提供有预算的 Snapshot 局部像素分析；`records.js` 只负责本 Session 的显式记录。`template.html` 仅跳转，不维护第二套页面。

当前合同入口是 `ORACLE.md`。`ORACLE.baseline-2026-09-16.md` 是本轮保存的原始冻结文档，必须结合当前 Amendment 阅读，不能用其旧的“没有窗口选择／没有历史／只有当前结果复制”否决本轮用户修订。

## 关键边界

进入不截图；窗口建议不是确认。只有确认／更新／继续测量才创建 Snapshot；正式颜色、坐标、区域与边距绑定该帧。Micro HUD 只承载指针信息，Corner HUD 区分候选预览与已锁定。最多 Window + 一个 Local Reference，Overlay 同时一组四边距；原十项 Toolbar 保持。

磁吸关闭／Alt 暂停不运行视觉解析。缓存、64ms trailing throttle、有限 ROI、像素/面积/时间上限保护 pointermove；透明、背景连接、截断、不可靠轮廓拒绝候选并允许人工框选。Visual 永远不是 semantic control。

点击锁定 ≠ 记录 ≠ 保存。Enter／记录仅追加已确认结果到内存，随后继续测量；Update/Adjust/重选不删除历史。退出会销毁未保存内存，先复制全部或保存。浏览器下载请求不冒充文件已落盘；选择器写入并关闭成功才标记 saved。快照源图在首次 Record 时纳入 Session JSON，多个记录共享同一快照。

## 测试与正式实现

```bash
node --test tests/desktop-measurement/model.test.js tests/desktop-measurement/amendment.test.js
python tests/desktop-measurement/browser.test.py
```

Browser harness 读取并内联完全相同的模块源码，不复制另一套交互。合成测试不代替 Native 权限、窗口捕获、输入、剪切板、多屏/DPI、Recorder 隔离或实际加载产物验收。

正式合同：`docs/architecture/desktop-automation/desktop-measurement.md`；当前差距：同目录 `desktop-measurement-amendment-2026-09-17.md`；正式实现仍由 `pkg/measurement/**`、`pkg/customui/**`、`cmd/opendesk/**measurement**` 和现有 Recorder 集成承担。当前 Amendment 不等于这些 Native 能力已经全部同步。

截图、日志、导出的 JSON 和测试报告只放 `.runtime/`。生产任务产物优先复用 `.runtime/automation-authoring/<task-id>/measurement/`，不得写入 `apps/opendesk/**`。浏览器样机不能替用户决定仓库文件系统路径。
