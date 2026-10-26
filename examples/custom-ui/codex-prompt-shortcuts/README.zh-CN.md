# OpenDesk × Codex Desktop Prompt Shortcuts R1.1

## 原始产品目标

只复用现有 OpenDesk JavaScript Runtime，使 macOS Codex 桌面应用前台时，在其对话内容区左侧出现可拖动的纵向提示词快捷栏；可多条管理、保持配置、跟随窗口、从 OpenDesk Browser 提示词快捷按钮导入，点击不自动发送。不是第二套桌面运行时、浏览器 Host 或独立客户端。

### 本轮已经落入源码的功能

- 单脚本入口：main.js；原生受限 Custom UI 两个窗口（floating 按钮栏、normal 管理器），无独立 HTTP/iframe Host。
- 纵向单列、38×38 按钮、5px 间距、400px 最大高度与滚动；设置入口、提示词悬停名称/摘要、系统主题 CSS。
- 按 Codex 应用精确名称寻找运行 PID；也可输入由真实 Mac App.list 验证的 bundle ID。只有当前 foreground 属于目标进程或此 execution 所有的 UI Host 时才保持浮栏。
- 窗口移动/缩放/关闭/聚焦、显示器变化由原有 Events 触发窗口身份再验证与位置修正，非事件自行决定目标。默认窗口内左侧和纵向中部，避让估算的标题/输入区。
- 用户可通过拖动栏头设置相对位置，重置位置；保存在唯一 local JSON 数据源中。负屏幕坐标按 logical coordinates 处理，不乘 Retina 比例。
- 文本提示词列表、新建/编辑/删除/排序/启停，显示名称和短标签，未保存时页面内切换/关闭按钮确认；多页列表支持最多 80 条。
- JSON v1/v2 Browser 显式导入，在确认对话框说明追加数与图片降级；默认追加并按正文去重，保留原记录；v2 纯文字备份导出。
- File.writeNew 独占锁、File.writeJSON 原子替换、revision 检查与写后读回。异常退出的 stale lock 不会被自动删除。
- **安全默认只复制**：点击前刷新 Codex 身份，成功复制到系统剪贴板并提示。绝不发送、粘贴或盲目重试。Codex 富文本编辑器的 AX 结构尚未由真实 Mac 证明，不能默认把 UI.setValue 当成安全插入。

### 当前尚未完成的验收或能力

- Codex 实际 bundle ID、编辑器输入控件、对话内容左边缘精确位置：NOT_TESTED。
- 原生 Mac、Codex 版本、显示器移动跟随延迟、Mission Control/全屏 Space、交互视觉截图：NOT_TESTED。
- 在当前 Codex 草稿的非破坏性自动插入及独立回读：NOT_IMPLEMENTED，继续使用复制回退。
- 系统标题栏关闭按钮的不可丢草稿拦截：NOT_VERIFIED（自定义“关闭管理”按钮已做未保存确认）。
- 跨应用自动同步、本地连接、网页授权、AI 修改审批：P1 NOT_IMPLEMENTED。
- File JSON 的跨进程独占锁仅保护遵循此锁的本脚本实例；不提供完整事务、掉电持久性或对其他写入者的通用 CAS。

## 正式运行入口

在本地仓库 /Users/shopme/Documents/workspace/opendesk 根目录执行：

~~~bash
./opendesk -ui -script examples/custom-ui/codex-prompt-shortcuts/main.js -console-mode script -log-dir .runtime/examples/custom-ui/codex-prompt-shortcuts
~~~

首次没有配置会自动显示管理窗口。新建提示词时仅正文必填；保存后提示词显示在 Codex 前台窗口左侧，点击只复制，不触发 Enter。通过齿轮重新打开管理窗口。关闭 Codex 或切换别的应用应隐藏浮栏；恢复前台后应重现。该行为必须经过真实 Mac 验证才可记录 PASS。

本地配置文件：

~~~text
.runtime/examples/custom-ui/codex-prompt-shortcuts/library.json
~~~

示例 Schema：

~~~json
{
  "schemaVersion": 1,
  "revision": 1,
  "prompts": [
    {
      "id": "ps_example123",
      "body": "请审阅代码",
      "name": "代码审阅",
      "label": "审阅",
      "enabled": true,
      "order": 0
    }
  ],
  "settings": {
    "appBundleId": "",
    "offsetX": 0,
    "offsetY": 0
  }
}
~~~

首次可留空 appBundleId，此时 OpenDesk App.get 按应用名 Codex 精确匹配；若本地名字不同，需要先用 App.list() 查证实际身份，再在管理界面保存 Bundle ID。不要凭窗口标题猜测。

Browser 正式提示词工具的备份须为 format 等于 opendesk.prompt-shortcuts 且 version 为 1 或 2 的 JSON。管理页中填写其绝对路径，预览并确认导入。出现图片按钮时，会明确提示本版仅迁移文字正文，并将按钮以文字形式呈现，不会静默假装保留图片资源。导出生成新的文件，输出其本地路径。

### 锁冲突恢复

提示库保存时使用本目录 library.lock。若提示已有锁：先核对是否仍有 OpenDesk 脚本实例正在运行；如确定相关进程已经停止、没有并发读写，才手动移走历史 lock 并重新打开。这不是自动覆盖或忽略数据冲突。

## 静态测试和真实验收

纯数据模型 Node 测试：

~~~bash
node --test tests/custom-ui/codex-prompt-shortcuts.test.cjs
~~~

真实验收必须执行本页的 OpenDesk 一行命令，并依次验证 Codex 前后台、启动/关闭/重启、移动/缩放、拖动保存、单屏/双屏/Retina/负坐标、真实层级、快捷栏视觉与键盘操作、保存重开、v1/v2 JSON 导入、异常/并发锁、剪贴板内容及禁止自动发送。禁止把 Node 模拟测试当作真实 Mac GUI PASS。

优先记录实际 Codex 应用身份、当前 Runtime binary 的构建来源、窗口快照、日志及必要的已脱敏实窗截图。若出现 Native Runtime API 与正式 docs/api 文档不符，应先核对现有能力并只做必要增量修复，不新建第二套 UI 或 Runtime。

质量评分采用产品完整性、桌面交互、原生可靠性、数据安全、测试与维护五项独立百分制；未跑过真实 Mac 的维度应标为 NOT_SCORED / NOT_TESTED，不得预设 95 分。
