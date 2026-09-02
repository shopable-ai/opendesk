# WeChat layout visualizer

This is an opt-in offline visualization tool for an existing screenshot. It is
not a Go package test and it does not capture or operate a desktop window.

Run from the repository root:

```bash
go run ./tests/wechat/tools/visualize-layout \
  --image .runtime/tests/wechat/wechat_validation/wechat_original.png \
  --output .runtime/tests/wechat/wechat_validation
```

Generated PNG and JSON files must stay below `.runtime/`; the tool rejects any
output directory outside that root.
