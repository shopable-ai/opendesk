#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

EVIDENCE_DIR="$ROOT_DIR/.runtime/tests/test-architecture/final"
RUN_ID="20260902-test-architecture-final"
SOUND_CANCEL_RUN_ID="20260902-test-architecture-sound-cancel"
mkdir -p "$EVIDENCE_DIR/bin" "$EVIDENCE_DIR/tools"

run_required() {
  local name="$1"
  shift
  echo "[TEST-ARCHITECTURE] START $name"
  set +e
  "$@" >"$EVIDENCE_DIR/$name.log" 2>&1
  local status=$?
  set -e
  printf '%s\n' "$status" >"$EVIDENCE_DIR/$name.exit-status"
  if [[ "$status" -ne 0 ]]; then
    echo "[TEST-ARCHITECTURE] FAIL $name status=$status" >&2
    tail -120 "$EVIDENCE_DIR/$name.log" >&2
    exit "$status"
  fi
  echo "[TEST-ARCHITECTURE] PASS $name"
}

run_observed() {
  local name="$1"
  shift
  echo "[TEST-ARCHITECTURE] OBSERVE $name"
  set +e
  "$@" >"$EVIDENCE_DIR/$name.log" 2>&1
  local status=$?
  set -e
  printf '%s\n' "$status" >"$EVIDENCE_DIR/$name.exit-status"
  echo "[TEST-ARCHITECTURE] OBSERVED $name status=$status"
}

run_required audit-before node scripts/audit_test_architecture.js "$EVIDENCE_DIR/audit-before.json"
run_required node-syntax node --check scripts/audit_test_architecture.js
run_required repo-layout ./scripts/audit_repo_layout.sh
run_required go-test-root go test ./... -count=1
run_required go-test-live-default-skip go test ./automation -run '^(TestDarwinAudioDeviceEnumerationMetadataDecodes|TestDarwinRichClipboardMetadataCanBeReadWithoutContent)$' -count=1 -v
run_required go-build-opendesk go build -o "$EVIDENCE_DIR/bin/opendesk" ./cmd/opendesk
shasum -a 256 "$EVIDENCE_DIR/bin/opendesk" >"$EVIDENCE_DIR/bin/opendesk.sha256"

run_required runtime-api-smoke env OPENDESK_RUNTIME_API_RUN_ID="$RUN_ID" ./scripts/test_runtime_apis.sh smoke
run_required runtime-api-sound-cancel env OPENDESK_RUNTIME_API_RUN_ID="$SOUND_CANCEL_RUN_ID" ./scripts/test_runtime_apis.sh sound-cancel

run_required tool-image-layout go run ./tests/automation/tools/image-layout-lab all "$EVIDENCE_DIR/tools/image-layout"
run_required build-wechat-visualizer go build -o "$EVIDENCE_DIR/bin/wechat-visualize-layout" ./tests/wechat/tools/visualize-layout

set +e
"$EVIDENCE_DIR/bin/wechat-visualize-layout" --image "$EVIDENCE_DIR/does-not-exist.png" --output "$ROOT_DIR/docs" >"$EVIDENCE_DIR/tool-output-boundary.log" 2>&1
tool_boundary_status=$?
set -e
printf '%s\n' "$tool_boundary_status" >"$EVIDENCE_DIR/tool-output-boundary.exit-status"
if [[ "$tool_boundary_status" -ne 2 ]] || ! grep -q 'output directory must stay below .runtime' "$EVIDENCE_DIR/tool-output-boundary.log"; then
  echo "[TEST-ARCHITECTURE] tool output boundary did not fail closed" >&2
  exit 1
fi

run_required native-extension-linux-compile env GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go test -c -o "$EVIDENCE_DIR/bin/nativeextension-linux-amd64.test" ./pkg/nativeextension
run_required native-extension-windows-compile env GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go test -c -o "$EVIDENCE_DIR/bin/nativeextension-windows-amd64.test.exe" ./pkg/nativeextension
run_observed opencv-tagged-package go test -tags opencv ./automation -run '^TestImageColorFindPosUsesOpenCVBackend$' -count=1
run_observed vendor-kbinani-compile bash -c 'cd third_party/kbinani-screenshot && go test -run "^$" ./...'
run_observed vendor-robotgo-compile bash -c 'cd third_party/robotgo && go test -run "^$" ./...'

run_required audit-after node scripts/audit_test_architecture.js "$EVIDENCE_DIR/audit-after.json"
run_required source-no-drift node -e '
  const fs = require("fs");
  const before = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const after = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  if (before.sourceSnapshot.closureSha256 !== after.sourceSnapshot.closureSha256) {
    const beforeFiles = new Map((before.sourceSnapshot.files || []).map(({ file, sha256 }) => [file, sha256]));
    const afterFiles = new Map((after.sourceSnapshot.files || []).map(({ file, sha256 }) => [file, sha256]));
    const changes = [];
    for (const file of new Set([...beforeFiles.keys(), ...afterFiles.keys()])) {
      const beforeDigest = beforeFiles.get(file);
      const afterDigest = afterFiles.get(file);
      if (beforeDigest === afterDigest) continue;
      changes.push(beforeDigest === undefined ? `added:${file}` : afterDigest === undefined ? `removed:${file}` : `changed:${file}`);
    }
    const detail = changes.length === 0 ? " (file manifest unavailable)" : ` (${changes.slice(0, 20).join(", ")}${changes.length > 20 ? ", ..." : ""})`;
    throw new Error(`source drift: ${before.sourceSnapshot.closureSha256} -> ${after.sourceSnapshot.closureSha256}${detail}`);
  }
  process.stdout.write(`${after.sourceSnapshot.closureSha256}\n`);
' "$EVIDENCE_DIR/audit-before.json" "$EVIDENCE_DIR/audit-after.json"

node - "$EVIDENCE_DIR" "$RUN_ID" <<'NODE'
const fs = require('fs');
const path = require('path');
const evidenceDir = process.argv[2];
const runId = process.argv[3];
const status = (name) => Number(fs.readFileSync(path.join(evidenceDir, `${name}.exit-status`), 'utf8').trim());
const audit = JSON.parse(fs.readFileSync(path.join(evidenceDir, 'audit-after.json'), 'utf8'));
const summary = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: 'passed',
  sourceSnapshot: audit.sourceSnapshot,
  required: {
    architectureAudit: status('audit-after'),
    repositoryLayout: status('repo-layout'),
    goRoot: status('go-test-root'),
    liveTestsDefaultSkip: status('go-test-live-default-skip'),
    buildOpenDesk: status('go-build-opendesk'),
    runtimeAPISmoke: status('runtime-api-smoke'),
    runtimeAPISoundCancel: status('runtime-api-sound-cancel'),
    imageLayoutTool: status('tool-image-layout'),
    wechatVisualizerBuild: status('build-wechat-visualizer'),
    linuxNativeExtensionCompile: status('native-extension-linux-compile'),
    windowsNativeExtensionCompile: status('native-extension-windows-compile'),
    sourceNoDrift: status('source-no-drift'),
  },
  observed: {
    opencvTaggedPackage: status('opencv-tagged-package'),
    vendorKbinaniCompile: status('vendor-kbinani-compile'),
    vendorRobotgoCompile: status('vendor-robotgo-compile'),
  },
  runtimeAPIRun: `.runtime/tests/runtime-api/${runId}`,
  runtimeAPISoundCancelRun: '.runtime/tests/runtime-api/20260902-test-architecture-sound-cancel',
  evidenceDirectory: path.relative(process.cwd(), evidenceDir),
};
fs.writeFileSync(path.join(evidenceDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`[TEST-ARCHITECTURE] COMPLETE ${summary.evidenceDirectory}/summary.json`);
NODE
