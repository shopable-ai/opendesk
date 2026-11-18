#!/usr/bin/env bash
# B must satisfy A's designated requirement for the owner and every nested Mach-O.
set -euo pipefail
[[ $# == 2 ]] || { echo 'Usage: check_macos_signing_continuity.sh BUILD_A.app BUILD_B.app' >&2; exit 1; }
A="${1%/}"
B="${2%/}"
[[ -d "${A}/Contents" && -d "${B}/Contents" ]] || { echo 'Two app bundles are required' >&2; exit 1; }
[[ "$(shasum -a 256 "${A}/Contents/MacOS/opendesk" | awk '{print $1}')" != "$(shasum -a 256 "${B}/Contents/MacOS/opendesk" | awk '{print $1}')" ]] || {
  echo 'A/B owner binaries are identical; this is not a changed-build continuity test' >&2; exit 1;
}
for app in "${A}" "${B}"; do codesign --verify --deep --strict "${app}"; done
old_cdhash="$(codesign -d --verbose=4 "${A}" 2>&1 | sed -n 's/^CDHash=//p')"
new_cdhash="$(codesign -d --verbose=4 "${B}" 2>&1 | sed -n 's/^CDHash=//p')"
[[ -n "${old_cdhash}" && -n "${new_cdhash}" && "${old_cdhash}" != "${new_cdhash}" ]] || {
  echo 'A/B CodeDirectory hashes must differ; a changed CMS signature alone is insufficient' >&2; exit 1;
}
check_pair() {
  local old="$1" new="$2" requirement
  requirement="$(codesign -d -r- "${old}" 2>&1 | sed -n 's/^designated => //p')"
  [[ -n "${requirement}" && "${requirement}" != *cdhash* ]] || {
    echo "No persistent certificate-bound designated requirement: ${old}" >&2; return 1;
  }
  [[ "${requirement}" == *anchor* || "${requirement}" == *certificate* ]] || {
    echo "No certificate constraint: ${old}" >&2; return 1;
  }
  codesign --verify --strict -R "=${requirement}" "${new}"
  printf 'CONTINUITY_OK %s\n' "${new}"
}
check_pair "${A}" "${B}"
while IFS= read -r -d '' old; do
  [[ "${old}" != "${A}/Contents/MacOS/opendesk" ]] || continue
  case "$(file -b "${old}")" in Mach-O*) ;; *) continue ;; esac
  relative="${old#"${A}/"}"
  [[ -f "${B}/${relative}" ]] || { echo "Missing updated helper: ${relative}" >&2; exit 1; }
  check_pair "${old}" "${B}/${relative}"
done < <(find "${A}/Contents" -type f -print0)
if [[ -d "${A}/Contents/Helpers/OpenDesk UI.app" ]]; then
  [[ -d "${B}/Contents/Helpers/OpenDesk UI.app" ]] || { echo 'Missing updated nested UI app' >&2; exit 1; }
  check_pair "${A}/Contents/Helpers/OpenDesk UI.app" "${B}/Contents/Helpers/OpenDesk UI.app"
fi
printf 'Changed-build certificate continuity passed. TCC grants still require real App upgrade validation.\n'
