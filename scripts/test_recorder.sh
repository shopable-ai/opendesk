#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
run_id="${RECORDER_TEST_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-contract}"
evidence_root="${RECORDER_EVIDENCE_ROOT:-$repo_root/.runtime/tests/recorder/$run_id}"
mkdir -p "$evidence_root"

cd "$repo_root"
go test ./pkg/recorder ./pkg/mcpserver ./apps/recorder ./tests/recorder/tools/...

python3 - "$repo_root" "$evidence_root" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
evidence = pathlib.Path(sys.argv[2])
schemas = sorted((root / "schemas" / "recorder").glob("*.schema.json"))
for path in schemas:
    json.loads(path.read_text())
summary = {
    "ok": True,
    "scope": "Recorder contract and integration tests",
    "schemaCount": len(schemas),
    "schemas": [str(path.relative_to(root)) for path in schemas],
}
(evidence / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
print(json.dumps(summary))
PY
