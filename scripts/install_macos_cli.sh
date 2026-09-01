#!/usr/bin/env bash

# Install a per-user, managed `opendesk` launcher for a fixed macOS App bundle.
# The launcher deliberately execs the bundle executable rather than copying or
# symlinking it, so macOS permissions and bundled helper discovery stay bound to
# the same OpenDesk.app that the user installed in /Applications.

set -euo pipefail

readonly MANAGED_MARKER='# OpenDesk CLI launcher; managed by scripts/install_macos_cli.sh'
readonly DEFAULT_APP_BUNDLE='/Applications/OpenDesk.app'

operation=install
app_bundle="${OPENDESK_APP_BUNDLE:-${DEFAULT_APP_BUNDLE}}"
bin_dir="${OPENDESK_CLI_BIN_DIR:-${HOME}/.local/bin}"
adopt_legacy_launcher=false

usage() {
  cat <<'EOF'
Install a managed `opendesk` command for an installed OpenDesk.app.

Usage:
  bash scripts/install_macos_cli.sh [--app-bundle PATH] [--bin-dir PATH]
  bash scripts/install_macos_cli.sh --update [--app-bundle PATH] [--bin-dir PATH]
  bash scripts/install_macos_cli.sh --adopt-legacy-launcher --bin-dir PATH
  bash scripts/install_macos_cli.sh --uninstall [--bin-dir PATH]

Defaults:
  app bundle: /Applications/OpenDesk.app
  command directory: ~/.local/bin

The installer only replaces a launcher bearing its managed marker. It refuses
to overwrite a pre-existing command from another tool. --update is idempotent:
the launcher always delegates to the selected App bundle, so replacing that App
bundle updates the runtime without reinstalling the command.

--adopt-legacy-launcher is an explicit migration only for the exact temporary
launcher emitted by an older OpenDesk setup. It does not adopt arbitrary files.
EOF
}

die() {
  printf 'OpenDesk CLI installer: %s\n' "$*" >&2
  exit 1
}

is_managed_launcher() {
  local path="$1"
  [[ -f "${path}" && ! -L "${path}" ]] || return 1
  grep -Fqx "${MANAGED_MARKER}" "${path}"
}

is_adoptable_legacy_launcher() {
  local path="$1"
  [[ -f "${path}" && ! -L "${path}" ]] || return 1
  cmp -s "${path}" <(printf '%s\n' \
    '#!/bin/sh' \
    '# Stable global entry point for the fixed macOS application bundle.' \
    'exec /Applications/OpenDesk.app/Contents/MacOS/opendesk "$@"')
}

absolute_directory() {
  local directory="$1"
  [[ "${directory}" = /* ]] || die "directory must be absolute: ${directory}"
  mkdir -p "${directory}"
  [[ -d "${directory}" && ! -L "${directory}" ]] || die "command directory is not a real directory: ${directory}"
  (cd "${directory}" && pwd -P)
}

shell_single_quote() {
  printf "'"
  printf '%s' "$1" | sed "s/'/'\\\\''/g"
  printf "'"
}

while (($# > 0)); do
  case "$1" in
    --app-bundle)
      (($# >= 2)) || die '--app-bundle requires a path'
      app_bundle="$2"
      shift 2
      ;;
    --bin-dir)
      (($# >= 2)) || die '--bin-dir requires a path'
      bin_dir="$2"
      shift 2
      ;;
    --update)
      [[ "${operation}" == install || "${operation}" == update ]] || die '--update and --uninstall cannot be combined'
      operation=update
      shift
      ;;
    --uninstall)
      [[ "${operation}" == install || "${operation}" == uninstall ]] || die '--update and --uninstall cannot be combined'
      operation=uninstall
      shift
      ;;
    --adopt-legacy-launcher)
      adopt_legacy_launcher=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      usage >&2
      die "unknown argument: $1"
      ;;
  esac
done

[[ "$(uname -s)" == Darwin ]] || die 'this installer supports macOS only'
if [[ "${operation}" == uninstall ]]; then
  [[ "${bin_dir}" = /* ]] || die "directory must be absolute: ${bin_dir}"
  if [[ ! -d "${bin_dir}" || -L "${bin_dir}" ]]; then
    printf 'OpenDesk CLI is not installed at %s/opendesk\n' "${bin_dir}"
    exit 0
  fi
  bin_dir="$(cd "${bin_dir}" && pwd -P)"
  target="${bin_dir}/opendesk"
  if [[ ! -e "${target}" && ! -L "${target}" ]]; then
    printf 'OpenDesk CLI is not installed at %s\n' "${target}"
    exit 0
  fi
  is_managed_launcher "${target}" || die "refusing to remove unmanaged command: ${target}"
  rm "${target}"
  printf 'Removed managed OpenDesk CLI: %s\n' "${target}"
  exit 0
fi

bin_dir="$(absolute_directory "${bin_dir}")"
target="${bin_dir}/opendesk"

[[ "${app_bundle}" = /* ]] || die "app bundle must be absolute: ${app_bundle}"
[[ -d "${app_bundle}" && ! -L "${app_bundle}" ]] || die "app bundle is not a real directory: ${app_bundle}"
app_bundle="$(cd "${app_bundle}" && pwd -P)"
[[ "${app_bundle}" != *$'\n'* && "${app_bundle}" != *$'\r'* ]] || die 'app bundle path must not contain a line break'
runtime="${app_bundle}/Contents/MacOS/opendesk"
ui_host="${app_bundle}/Contents/Helpers/opendesk-ui-host"
[[ -f "${runtime}" && -x "${runtime}" ]] || die "OpenDesk runtime is missing or not executable: ${runtime}"
[[ -f "${ui_host}" && -x "${ui_host}" ]] || die "bundled UI host is missing or not executable: ${ui_host}"

if [[ -e "${target}" || -L "${target}" ]]; then
  if is_managed_launcher "${target}"; then
    :
  elif [[ "${adopt_legacy_launcher}" == true ]] && is_adoptable_legacy_launcher "${target}"; then
    printf 'Adopting exact legacy OpenDesk launcher: %s\n' "${target}"
  else
    die "refusing to overwrite unmanaged command: ${target}"
  fi
elif [[ "${operation}" == update ]]; then
  die "cannot update because no managed OpenDesk CLI is installed at: ${target}"
fi

tmp_launcher="$(mktemp "${bin_dir}/.opendesk-launcher.XXXXXX")"
cleanup() { rm -f "${tmp_launcher}"; }
trap cleanup EXIT
runtime_literal="$(shell_single_quote "${runtime}")"
cat >"${tmp_launcher}" <<EOF
#!/bin/sh
${MANAGED_MARKER}
# Source App bundle: ${app_bundle}
set -eu

runtime=${runtime_literal}
if [ ! -x "\${runtime}" ]; then
  printf '%s\n' "OpenDesk runtime is unavailable: \${runtime}" >&2
  exit 127
fi
exec "\${runtime}" "\$@"
EOF
chmod 755 "${tmp_launcher}"
mv -f "${tmp_launcher}" "${target}"
trap - EXIT

printf 'Installed managed OpenDesk CLI: %s\n' "${target}"
printf 'Runtime: %s\n' "${runtime}"
if [[ ":${PATH}:" != *":${bin_dir}:"* ]]; then
  printf 'Add this directory to your shell PATH, then start a new shell:\n  export PATH="%s:$PATH"\n' "${bin_dir}"
fi
