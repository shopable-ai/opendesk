# TASK-005 — Rich Clipboard

Status: DONE
Priority: P1
Depends on: TASK-003 recommended for change events

## Goal

在现有稳定文本 `clipboard.copy/paste/clear` 基础上补齐桌面自动化常用的富剪贴板能力，而不是替换当前接口。

## MVP 候选

```js
clipboard.read(options?)
clipboard.write(payload)
clipboard.getFormats()
```

Payload 至少评估：

```text
text/plain
text/html
text/rtf
image/png
files / file URLs
```

如 TASK-003 已完成，可增加：

```js
clipboard.onChange(callback)
```

但底层应尽量复用统一 Events 系统，而不是建立第二套 watcher。

## 必须解决

- 与现有 `copy/paste/clear` 向后兼容。
- 空剪贴板的真实语义；修复或明确当前 `clear()` 写入单个空格的历史行为。
- format negotiation。
- 图片字节与路径返回策略。
- 文件列表跨平台表示。
- 大对象内存限制。
- 隐私：默认日志/Evidence 不记录剪贴板正文。

## 非目标

- 不做 clipboard history 产品。
- 不持久化用户剪贴板内容。
- 不默认监控所有 clipboard 数据。

## 测试

至少覆盖：

1. 现有文本 API 回归。
2. plain text。
3. HTML/RTF（平台允许时）。
4. PNG image。
5. file list。
6. clear semantics。
7. unsupported format。
8. 大 payload 限制。
9. change event（如果 Events 已实现）。

## Done

- 现有文本 API 不破坏。
- 至少 macOS 对文本 + 图片/文件中的一种富格式有真实 evidence。
- 日志不泄露剪贴板正文。
- 文档、类型、机器索引同步。

## Execution record — 2026-09-02

Decision: EXTEND

Base HEAD: `147485f86867ad8bb5c1ad0908f45889a7b73ffb`

Final Commit: this task-closing commit

### Audit

- 现有 `automation/clipboard.go`、全局 helper、类型、文档与正式 Runtime API 测试只覆盖文本；
  `clear()` 历史上写入单个空格，空字符串也会被改写成空格。
- MCP、HTTP、Recorder、Scheduler、Native Extension、integrations 与 `third_party` 均没有可复用的
  rich clipboard backend；TASK-003 已提供唯一的 `Events` clipboard watcher。
- macOS `NSPasteboard` 原生支持 string、HTML、RTF、PNG、file URL 与 `changeCount`，因此本任务在
  既有 `clipboard` 对象上扩展 thin native backend，没有新建第二套 Clipboard API 或 watcher。

### Implementation

- 保留 `copy` / `paste` / `clear`；新增同步 `read(options?)`、`write(payload)`、
  `getFormats()`、`getCapabilities()`，公共 canonical formats 为 `text/plain`、`text/html`、
  `text/rtf`、`image/png`、`files`。
- macOS CGO backend 使用 `NSPasteboard`；RTF/PNG 以 canonical base64 跨 Goja 边界，文件 URL
  转为 clean absolute existing paths。非 macOS/non-CGO rich 方法明确 `NOT_SUPPORTED`。
- `clear()` 现在真正移除 pasteboard formats，`copy('')` 保留空文本 representation；旧文本 helper
  仍转发同一实现。
- 聚合上限 16 MiB，单个 text/HTML 上限 4 MiB，文件最多 256 个；PNG 解码 header、RTF header、
  base64、UTF-8 与路径全部在触碰系统剪贴板前校验。
- `read()` 公开 canonical/native/derived/unsupported format metadata 与 `changeCount`。未知私有
  native type 保持 fail-closed；已知纯文本兼容 representation 与 legacy `styl` sidecar 分别映射或
  标为 derived，不伪装成独立可恢复正文。
- 错误使用稳定 `code` / `operation`，不包含正文或文件路径；没有增加 MCP/HTTP surface，也没有
  增加 `clipboard.onChange`，继续使用 `Events.on('clipboard.changed', ...)`。

### Tests

- `go test ./automation -count=1` -> PASS；覆盖文本回归、真实空字符串/clear、全部格式、筛选读取、
  unsupported format、oversize、隐私、JS binding、derived metadata 与 Darwin metadata。
- `./scripts/test_runtime_apis.sh unit` -> PASS；证据位于
  `.runtime/tests/runtime-api/20260901T190744Z-43818/`。
- `OPENDESK_RUNTIME_API_LIVE_FILTER=clipboard.test.js ./scripts/test_runtime_apis.sh live` 中正式
  clipboard live case -> PASS，9 个 clipboard/global helper method 均完成 behavior coverage；证据位于
  `.runtime/tests/runtime-api/20260901T191111Z-48621/`。同一总入口之后的既有 Custom UI recording
  tray AXPress case 失败，与本任务无关；cleanup gate PASS 且无残留进程。
- `go test ./...` -> TASK-005 相关 package PASS；`pkg/visionrun` 仍有此前同样的 4 个无关失败：
  两个缺 real validation input、一个缺 `capture_contract.json`、一个缺当前 preflight report。

### Evidence

- 从仓库根目录原样执行文档命令：
  `go run ./cmd/opendesk -script examples/clipboard/rich-smoke.js -console-mode script` -> PASS。
- 实机：macOS 12.7.6 / amd64，backend=`nspasteboard`；一次真实 write/read 验证 text、HTML、RTF、
  PNG、file list 五种格式，随后验证真实 clear 与 TASK-003 polling `clipboard.changed`。
- 原剪贴板在内存中恢复；Evidence 不含正文、base64 bytes 或文件路径：
  `.runtime/tests/platform-primitives/task-005-clipboard/rich-smoke.json`。

### API and documentation

- 公共类型：`types/clipboard.d.ts`。
- 用户文档：`docs/api/clipboard.md`，同步 `docs/api/index.md`。
- 机器索引与正式 conformance：`docs/api/runtime-api.ai.json`、`tests/runtime-api/manifest.js`、
  unit/live clipboard tests。
- 可复制示例：`examples/clipboard/rich-smoke.js`。

### Remaining

- Rich formats 当前仅 macOS 验证，其他平台保留显式 unsupported capability；Stable 文本接口不变。
- 不实现 clipboard history、默认内容监控或第二套 watcher；未知私有 native formats 不能由当前
  canonical payload 无损恢复，自动化在覆盖操作者剪贴板前必须检查 `unsupportedNativeFormats`。

## API optimization follow-up — 2026-09-02

- 保留 `copy(string)` / `paste()` 的稳定文本契约，不用 object overload 模糊旧接口；复杂内容继续
  统一使用 `write(payload)` / `read(options)`。
- `read()` 读取全部表示；显式 `read({formats: []})` 改为 metadata-only，不读取正文。富内容读取在
  前后核对 `changeCount`，变化时重试一次，持续变化则抛出 `CLIPBOARD_CHANGED`。
- `write()` 不再只检查 format 是否出现，而是逐项核对 text、HTML、RTF、PNG bytes 和文件路径；
  非 canonical base64 在写入前拒绝。普通 `public.url` 不再误判为 file list。
- `getCapabilities()` 补齐聚合、文本、文件数和路径长度 limits；用户文档、类型、机器索引、公开示例
  和 JavaScript unit/live tests 同步。
- 当前源码验证：clipboard Go 聚焦测试 PASS；Runtime API contract 306/306 PASS；unit 431/431 PASS；
  `OPENDESK_RUNTIME_API_LIVE_FILTER=clipboard.test.js ./scripts/test_runtime_apis.sh live-only` 为 1/1 PASS
  且 cleanup PASS（覆盖 9 个 clipboard/global helper 方法）；仓库 `rich-smoke.js` 注释中的一行
  当前源码命令原样 PASS，macOS
  `nspasteboard` 实测五种格式、事件、真实 clear 和原剪贴板恢复。
- `scripts/test_runtime_apis.sh live` 的 clipboard case 通过，但总入口的无关 Custom UI 后置 gate 为
  11/14、3 个 FloatingWindow case 失败；cleanup PASS。该总入口不能表述为整体通过。
