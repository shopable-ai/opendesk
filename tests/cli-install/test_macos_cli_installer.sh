#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INSTALLER="${ROOT_DIR}/scripts/install_macos_cli.sh"
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/opendesk-cli-install.XXXXXX")"

cleanup() {
  rm -rf "${WORK_DIR}"
}
trap cleanup EXIT

[[ "$(uname -s)" == Darwin ]] || {
  printf 'SKIP: macOS CLI installer test requires Darwin\n'
  exit 0
}

app_bundle="${WORK_DIR}/OpenDesk.app"
bin_dir="${WORK_DIR}/bin"
runtime="${app_bundle}/Contents/MacOS/opendesk"
ui_host="${app_bundle}/Contents/Helpers/opendesk-ui-host"
mkdir -p "$(dirname "${runtime}")" "$(dirname "${ui_host}")"

cat >"${runtime}" <<'EOF'
#!/bin/sh
printf 'FAKE_OPENDESK_V1=%s\n' "$*"
EOF
cat >"${ui_host}" <<'EOF'
#!/bin/sh
exit 0
EOF
chmod 755 "${runtime}" "${ui_host}"

bash "${INSTALLER}" --app-bundle "${app_bundle}" --bin-dir "${bin_dir}"
[[ -x "${bin_dir}/opendesk" ]]
grep -Fqx '# OpenDesk CLI launcher; managed by scripts/install_macos_cli.sh' "${bin_dir}/opendesk"
[[ "$(PATH="${bin_dir}:/usr/bin:/bin" opendesk smoke)" == 'FAKE_OPENDESK_V1=smoke' ]]

quoted_bundle="${WORK_DIR}/OpenDesk's.app"
mv "${app_bundle}" "${quoted_bundle}"
bash "${INSTALLER}" --update --app-bundle "${quoted_bundle}" --bin-dir "${bin_dir}"
[[ "$(PATH="${bin_dir}:/usr/bin:/bin" opendesk quoted)" == 'FAKE_OPENDESK_V1=quoted' ]]
app_bundle="${quoted_bundle}"
runtime="${app_bundle}/Contents/MacOS/opendesk"

cat >"${runtime}" <<'EOF'
#!/bin/sh
printf 'FAKE_OPENDESK_V2=%s\n' "$*"
EOF
chmod 755 "${runtime}"
bash "${INSTALLER}" --update --app-bundle "${app_bundle}" --bin-dir "${bin_dir}"
[[ "$(PATH="${bin_dir}:/usr/bin:/bin" opendesk refresh)" == 'FAKE_OPENDESK_V2=refresh' ]]

conflict_dir="${WORK_DIR}/conflict"
mkdir -p "${conflict_dir}"
printf 'user-owned command\n' >"${conflict_dir}/opendesk"
if bash "${INSTALLER}" --app-bundle "${app_bundle}" --bin-dir "${conflict_dir}"; then
  printf 'installer overwrote an unmanaged command\n' >&2
  exit 1
fi
[[ "$(cat "${conflict_dir}/opendesk")" == 'user-owned command' ]]

legacy_dir="${WORK_DIR}/legacy"
mkdir -p "${legacy_dir}"
cat >"${legacy_dir}/opendesk" <<'EOF'
#!/bin/sh
# Stable global entry point for the fixed macOS application bundle.
exec /Applications/OpenDesk.app/Contents/MacOS/opendesk "$@"
EOF
chmod 755 "${legacy_dir}/opendesk"
bash "${INSTALLER}" --adopt-legacy-launcher --app-bundle "${app_bundle}" --bin-dir "${legacy_dir}"
grep -Fqx '# OpenDesk CLI launcher; managed by scripts/install_macos_cli.sh' "${legacy_dir}/opendesk"

bash "${INSTALLER}" --uninstall --bin-dir "${bin_dir}"
[[ ! -e "${bin_dir}/opendesk" && ! -L "${bin_dir}/opendesk" ]]
bash "${INSTALLER}" --uninstall --bin-dir "${legacy_dir}"
[[ ! -e "${legacy_dir}/opendesk" && ! -L "${legacy_dir}/opendesk" ]]

printf 'PASS: managed CLI install, update, conflict protection, and uninstall\n'
