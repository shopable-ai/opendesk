# 2026-05-19 OpenDesk MCP macOS Smoke Report

> 历史真机验证报告。记录当时环境与证据，不代表 2026-08 当前版本已经重新执行相同 smoke。

## 环境与目标

目标：验证 MCP server / Hermes / macOS 基础感知链路，以及 `inspect -> find -> act` 在当时环境中的真实边界。

当时 OCR 环境缺少：

```text
PADDLE_OCR_ENDPOINT
```

## 已实际验证成功

- MCP binary build 成功；
- Hermes 能连接 server，并发现工具；
- `tm_status` 成功；
- `tm_permissions` 成功返回权限状态；
- `tm_list_windows` 成功，可枚举窗口；
- `tm_screenshot` 成功；
- `tm_inspect_desktop` 成功，可聚合 status / permissions / active window / displays；
- layout-only `tm_find_target` 能返回 candidate；
- `tm_act_on_target previewOnly` 在低风险 focus target 上成功；
- 随后一次低风险真实 focus 动作成功。

## 当时没有完成的闭环

没有证明：

```text
inspect
-> find(真实 OCR / detect-ui 文本目标)
-> act
```

原因：

- `tm_ocr` 受 `PADDLE_OCR_ENDPOINT` 缺失阻塞；
- `tm_detect_ui` 同样受 OCR provider 阻塞；
- `tm_find_target strategy=detect_ui|hybrid` 因相同外部前置条件无法完成真实文本/UI target discovery。

## Layout-only 边界

当时 layout strategy 可生成类似 `Region 01` 的区域 candidate，但该 label 只代表布局区域，不能被当作真实文本/UI 语义目标。

因此：

```text
layout candidate available
!= host-friendly semantic target proven
```

## 当时形成的实现改进

围绕这次 smoke，MCP host-facing contract 后续增加/强化了：

- OCR provider 缺失的 structured external blocker；
- `failedStep` / `rootCause` / `wrappedError`；
- provider / missingConfigKey；
- remediation / host continuation hint；
- stale candidate 的最小 revalidation；
- ambiguity guard 的 reason / hostHint；
- runtime adapter error wrapping 与部分 helper tests。

## 历史结论

当时可以确认：

- server / stdio / Hermes discoverability 正常；
- 基础 screenshot / inspect / window 链路可工作；
- safe action preview 和低风险 focus 可工作；
- OCR-dependent semantic target discovery 被外部 provider 配置明确阻塞。

不能把该历史结果升级为“当前版本所有 macOS 真机链路已通过”。

后续每次需要证明当前版本可用时，应重新按：

```text
docs/integrations/mcp/testing/manual-smoke-macos.md
```

执行，并记录新的 commit SHA、macOS/Host 环境与结果。
