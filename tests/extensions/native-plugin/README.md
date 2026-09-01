# Native Extension Plugin V1 acceptance

This domain is the real Runtime acceptance for the **Experimental** manifest
auto-discovery and host-generated immutable JavaScript binding.

Run on macOS with Go, Python 3, and Xcode Command Line Tools:

```bash
./scripts/test_native_extension_plugins.sh
```

The harness builds the current `cmd/opendesk`, Go basic extension, and Swift
Apple Vision extension. It creates a source-free package at
`/private/tmp/opendesk-native-plugin-proof-<runId>/`, then starts it from a
different empty cwd and verifies:

- default CLI has no `NativeExtensions` global, performs no discovery, and
  starts zero children;
- opt-in discovery/list/get/diagnostics starts zero children and does not
  execute a deliberately hostile `facade.js`;
- portable, macOS current-user OS-standard, and `.app` Resources roots;
- `NativeExtensions.goBasic.hello({ ... })`, `.add({ ... })`, and real
  `NativeExtensions.macosVision.ocr({ ... })` without routing fields;
- frozen/null-prototype root and namespace bindings;
- exactly one fresh one-shot child for each actual method call;
- packaged polyfills/jslibs provenance rather than repository cwd fallback;
- privacy-minimized discovery/call Evidence and complete package SHA-256
  inventory.

Run products and reports stay under `.runtime/tests/extensions/native-plugin/`;
the isolated proof directory is disposable. Do not commit either.

Strict manifest/path/collision/permission/artifact-replacement cases are covered
by `pkg/nativeextension/discovery_test.go`. Goja descriptor, closure routing,
third-party JS inertness, and Evidence privacy cases are covered by
`automation/native_extensions_test.go`. HTTP and MCP fail-closed tests remain in
their transport packages.
