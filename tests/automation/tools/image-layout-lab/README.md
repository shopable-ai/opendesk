# Image layout lab

This standalone developer tool replaces former image-generating and layout-diagnostic files that accumulated under `examples/`. It is not part of the public Examples catalog and never writes generated output to the source tree.

Generate the maintained fixture set from the repository root:

```bash
go run ./tests/automation/tools/image-layout-lab all
```

The default output is `.runtime/tests/automation/image-layout/`. An optional output directory is accepted only when it remains below `.runtime/`.

Analyze the generated progressive cases:

```bash
./dist/opendesk -script tests/automation/tools/image-layout-lab/analyze-progressive.js -console-mode script
```

Validate known separator positions against the generated fixtures:

```bash
./dist/opendesk -script tests/automation/tools/image-layout-lab/validate-algorithm.js -console-mode script
```

Older real-application experiments that depended on arbitrary visible windows, ad-hoc `.runtime/temp` paths, Node `child_process`, or placeholder image paths are retained only under `.archive/examples-root-legacy/image-layout/` for historical reference; they are not active tools or examples.
