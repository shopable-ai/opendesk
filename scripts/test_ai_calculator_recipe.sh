#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  printf '[SKIP] macOS Calculator live recipe requires macOS.\n'
  exit 0
fi

if [[ "${OPENDESK_LIVE_CALCULATOR:-0}" != "1" ]]; then
  printf '[SKIP] Set OPENDESK_LIVE_CALCULATOR=1 to permit real Calculator UI input.\n'
  exit 0
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "$repo_root"

binary="${OPENDESK_BINARY:-$repo_root/dist/opendesk}"
recipe="$repo_root/examples/ai-cli/macos-calculator-recipe.js"
layout_perturb="$repo_root/tests/ai-calculator/macos-calculator-layout-perturb.js"
run_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
run_dir="$repo_root/.runtime/tests/ai-calculator/$run_id"
mkdir -p "$run_dir"

if [[ ! -x "$binary" ]]; then
  printf '[PREREQUISITE] OpenDesk binary is not executable: %s\n' "$binary" >&2
  exit 2
fi
if [[ ! -f "$recipe" ]]; then
  printf '[PREREQUISITE] Calculator recipe is missing: %s\n' "$recipe" >&2
  exit 2
fi
if [[ ! -f "$layout_perturb" ]]; then
  printf '[PREREQUISITE] Calculator layout perturbation script is missing: %s\n' "$layout_perturb" >&2
  exit 2
fi
if ! command -v node >/dev/null 2>&1; then
  printf '[PREREQUISITE] node is required to validate JSON envelopes in this live gate.\n' >&2
  exit 2
fi

capabilities="$($binary ai capabilities)"
printf '%s\n' "$capabilities" > "$run_dir/capabilities.json"
CAPABILITIES_JSON="$capabilities" node <<'NODE'
const envelope = JSON.parse(process.env.CAPABILITIES_JSON);
if (!envelope.ok) throw new Error(`capabilities failed: ${JSON.stringify(envelope.error)}`);
const permissions = envelope.result && envelope.result.permissions;
if (!permissions || permissions.screenCapture !== true || permissions.accessibility !== true) {
  console.error('[PREREQUISITE] Grant Screen Recording and Accessibility to the OpenDesk host, restart it, then retry.');
  process.exit(4);
}
const vision = envelope.result.capabilities && envelope.result.capabilities.vision;
if (!vision || vision.supported !== true) {
  console.error('[OCR] No standard Vision provider is currently usable; the recipe will check the existing macOS Vision extension fallback and fail closed if it is unavailable to ai run.');
}
NODE

printf '[LIVE] runId=%s evidence=%s\n' "$run_id" "$run_dir"

run_case() {
  local label="$1"
  local input="$2"
  local expect_layout_recovery="${3:-0}"
  local stdout_path="$run_dir/$label.stdout.json"
  local stderr_path="$run_dir/$label.stderr.log"
  local output
  local status

  set +e
  output="$($binary ai run "$recipe" --input "$input" 2>"$stderr_path")"
  status=$?
  set -e
  printf '%s\n' "$output" > "$stdout_path"

  CASE_LABEL="$label" CASE_STATUS="$status" CASE_OUTPUT="$output" REPO_ROOT="$repo_root" EXPECT_LAYOUT_RECOVERY="$expect_layout_recovery" node <<'NODE'
const fs = require('fs');
const path = require('path');
const label = process.env.CASE_LABEL;
const status = Number(process.env.CASE_STATUS);
let envelope;
try {
  envelope = JSON.parse(process.env.CASE_OUTPUT);
} catch (error) {
  console.error(`[${label}] invalid AI CLI JSON envelope: ${error.message}`);
  process.exit(1);
}
const result = envelope.result || {};
const artifacts = result.artifacts || {};
console.log(`[${label}] executionId=${result.executionId || '<missing>'} artifact=${artifacts.runDir || '<missing>'} exit=${status}`);
if (status !== 0 || envelope.ok !== true) {
  console.error(`[${label}] ${JSON.stringify(envelope.error || { message: 'ai run failed' })}`);
  process.exit(1);
}
const resultPath = path.resolve(process.env.REPO_ROOT, artifacts.runDir, 'calculator-result.json');
const document = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
if (document.passed !== true || !Array.isArray(document.calculations) || document.calculations.some(item => item.verified !== true)) {
  throw new Error(`${label} Calculator business verification did not pass: ${resultPath}`);
}
if (process.env.EXPECT_LAYOUT_RECOVERY === '1') {
  const layout = document.layout || {};
  const initial = layout.initialBounds || {};
  const final = layout.finalBounds || {};
  if (
    layout.recovered !== true
    || layout.verified !== true
    || !Array.isArray(layout.recoveryActions)
    || !layout.recoveryActions.includes('select-basic-with-command-1')
    || initial.width !== 574
    || initial.height !== 321
    || final.width !== 232
    || final.height !== 321
    || initial.x !== final.x
    || initial.y !== final.y
  ) {
    throw new Error(`${label} did not record the verified 574x321 -> 232x321 position-preserving recovery: ${resultPath}`);
  }
}
NODE
}

active_window() {
  "$binary" ai window active
}

screen_info() {
  "$binary" ai screen info
}

run_case scenario-1 '{"expression":"12+5","expected":"17"}'
run_case scenario-2 '{"expression":"16*3","expected":"48"}'
run_case scenario-3 '{"expression":"560880/8+120","expected":"70230"}'
run_case scenario-4 '{"expression":"125*8","expected":"1000","followUp":{"expression":"{result}/4+37","expected":"287"}}'

run_case scenario-5-old-state '{"expression":"987","expected":"987"}'
run_case scenario-5 '{"expression":"16*3","expected":"48"}'

active_json="$(active_window)"
screen_json="$(screen_info)"
IFS=$'\t' read -r move_title move_x move_y < <(
  ACTIVE_JSON="$active_json" SCREEN_JSON="$screen_json" node <<'NODE'
const active = JSON.parse(process.env.ACTIVE_JSON).result;
const screen = JSON.parse(process.env.SCREEN_JSON).result.virtualBounds;
const maxX = screen.x + screen.width - active.width;
const maxY = screen.y + screen.height - active.height;
const candidateX = active.x + (active.x + 160 <= maxX ? 160 : -160);
const candidateY = active.y + (active.y + 80 <= maxY ? 80 : -80);
const x = Math.max(screen.x, Math.min(maxX, candidateX));
const y = Math.max(screen.y, Math.min(maxY, candidateY));
process.stdout.write(`${active.title}\t${Math.round(x)}\t${Math.round(y)}\n`);
NODE
)
"$binary" ai window move --title "$move_title" --x "$move_x" --y "$move_y" > "$run_dir/scenario-6-move.json"
MOVE_RESULT="$(cat "$run_dir/scenario-6-move.json")" EXPECTED_X="$move_x" EXPECTED_Y="$move_y" node <<'NODE'
const envelope = JSON.parse(process.env.MOVE_RESULT);
const result = envelope.result || {};
if (envelope.ok !== true || result.x !== Number(process.env.EXPECTED_X) || result.y !== Number(process.env.EXPECTED_Y)) {
  throw new Error(`Scenario 6 window move was not applied: ${JSON.stringify(envelope)}`);
}
NODE
run_case scenario-6 '{"expression":"16*3","expected":"48"}'

perturb_stdout="$run_dir/scenario-7-perturb.stdout.json"
perturb_stderr="$run_dir/scenario-7-perturb.stderr.log"
set +e
perturb_output="$("$binary" ai run "$layout_perturb" 2>"$perturb_stderr")"
perturb_status=$?
set -e
printf '%s\n' "$perturb_output" > "$perturb_stdout"
CASE_STATUS="$perturb_status" CASE_OUTPUT="$perturb_output" REPO_ROOT="$repo_root" node <<'NODE'
const fs = require('fs');
const path = require('path');
const status = Number(process.env.CASE_STATUS);
const envelope = JSON.parse(process.env.CASE_OUTPUT);
const result = envelope.result || {};
const artifacts = result.artifacts || {};
console.log(`[scenario-7-perturb] executionId=${result.executionId || '<missing>'} artifact=${artifacts.runDir || '<missing>'} exit=${status}`);
if (status !== 0 || envelope.ok !== true) {
  throw new Error(`Scenario 7 layout perturbation failed: ${JSON.stringify(envelope.error || {})}`);
}
const evidencePath = path.resolve(process.env.REPO_ROOT, artifacts.runDir, 'calculator-layout-perturb.json');
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
if (evidence.passed !== true || evidence.changed !== true) {
  throw new Error(`Scenario 7 did not produce a verified Calculator bounds change: ${evidencePath}`);
}
NODE
run_case scenario-7 '{"expression":"16*3","expected":"48"}' 1

printf '[PASS] Calculator Agent-to-Recipe scenarios 1-7 passed; evidence=%s\n' "$run_dir"
