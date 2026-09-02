# Image layout lab

This standalone developer tool replaces the former image-generating
`automation/*_test.go` files. It is not part of `go test` and never writes to
the source tree.

Run from the repository root:

```bash
go run ./tests/automation/tools/image-layout-lab all
```

The default output is `.runtime/tests/automation/image-layout/`. An optional
output directory is accepted only when it remains below `.runtime/`.
