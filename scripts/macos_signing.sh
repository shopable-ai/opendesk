#!/usr/bin/env bash
# Shared macOS signing policy. No certificate/key generation occurs at build time.

macos_signing_fail() { printf 'macOS signing: %s\n' "$*" >&2; return 1; }

macos_signing_load() {
  local purpose="${1:-sign}"
  [[ "${purpose}" == sign || "${purpose}" == verify ]] || { macos_signing_fail 'invalid policy purpose'; return 1; }
  MACOS_SIGNING_CONFIG="${MACOS_SIGNING_CONFIG:-${HOME}/Library/Application Support/OpenDesk/development-signing/config.json}"
  # Old explicit opt-outs remain experimental aliases for CI callers.
  MACOS_SIGNING_MODE="${MACOS_SIGNING_MODE:-}"
  if [[ -z "${MACOS_SIGNING_MODE}" ]]; then
    if [[ "${SKIP_CODESIGN:-0}" == 1 ]]; then MACOS_SIGNING_MODE=unsigned
    elif [[ "${CODESIGN_IDENTITY:-}" == - ]]; then MACOS_SIGNING_MODE=adhoc
    else MACOS_SIGNING_MODE=development; fi
  fi
  case "${MACOS_SIGNING_MODE}" in
    unsigned|adhoc)
      printf 'WARNING: %s experimental build; no persistent TCC identity or release qualification.\n' "${MACOS_SIGNING_MODE}" >&2
      return 0 ;;
    development|release) ;;
    *) macos_signing_fail 'MACOS_SIGNING_MODE must be development, release, adhoc or unsigned'; return 1 ;;
  esac
  [[ "${SKIP_CODESIGN:-0}" != 1 && "${CODESIGN_IDENTITY:-}" != - ]] || {
    macos_signing_fail 'stable signing cannot skip signing or use ad-hoc'; return 1;
  }
  if [[ "${MACOS_SIGNING_MODE}" == development ]]; then
    [[ -f "${MACOS_SIGNING_CONFIG}" ]] || {
      macos_signing_fail 'development identity not configured. Run ./scripts/setup_macos_signing.sh once (or select an explicit experimental mode).'; return 1;
    }
    local configured_identity password_file
    configured_identity="$(/usr/bin/plutil -extract identity raw -o - "${MACOS_SIGNING_CONFIG}")" || return 1
    [[ -z "${CODESIGN_IDENTITY:-}" || "${CODESIGN_IDENTITY}" == "${configured_identity}" ]] || {
      macos_signing_fail 'CODESIGN_IDENTITY differs from the pinned development certificate'; return 1;
    }
    CODESIGN_IDENTITY="${configured_identity}"
    CODESIGN_KEYCHAIN=""
    password_file=""
    if [[ "${purpose}" == sign ]]; then
      CODESIGN_KEYCHAIN="$(/usr/bin/plutil -extract keychain raw -o - "${MACOS_SIGNING_CONFIG}")" || return 1
      password_file="$(/usr/bin/plutil -extract passwordFile raw -o - "${MACOS_SIGNING_CONFIG}" 2>/dev/null || true)"
    fi
    if [[ -n "${password_file}" ]]; then
      [[ -f "${password_file}" && ! -L "${password_file}" && "$(stat -f '%u:%Lp' "${password_file}")" == "$(id -u):600" ]] || {
        macos_signing_fail 'dedicated keychain password file must be owned by this user with mode 600'; return 1;
      }
      security unlock-keychain -p "$(cat "${password_file}")" "${CODESIGN_KEYCHAIN}" || return 1
    fi
  else
    [[ -n "${CODESIGN_IDENTITY:-}" ]] || { macos_signing_fail 'release requires a Developer ID Application certificate SHA-1'; return 1; }
    CODESIGN_KEYCHAIN="${CODESIGN_KEYCHAIN:-}"
  fi
  [[ "${CODESIGN_IDENTITY}" =~ ^[A-Fa-f0-9]{40}$ ]] || { macos_signing_fail 'identity must be an exact 40-digit certificate SHA-1, never a display name'; return 1; }
  # Running already-signed code needs the public pin only. Never unlock a
  # keychain or require the developer's private key merely to launch the app.
  [[ "${purpose}" != verify ]] || return 0
  if [[ -n "${CODESIGN_KEYCHAIN}" ]]; then
    [[ "${CODESIGN_KEYCHAIN}" == /* && -f "${CODESIGN_KEYCHAIN}" ]] || { macos_signing_fail 'configured keychain is missing or not absolute'; return 1; }
  fi
  local identities
  if [[ "${MACOS_SIGNING_MODE}" == release ]]; then
    if [[ -n "${CODESIGN_KEYCHAIN}" ]]; then
      identities="$(security find-identity -v -p codesigning "${CODESIGN_KEYCHAIN}")" || return 1
    else
      identities="$(security find-identity -v -p codesigning)" || return 1
    fi
    printf '%s\n' "${identities}" | grep -i "${CODESIGN_IDENTITY}" | grep -q 'Developer ID Application:' || {
      macos_signing_fail 'release requires an available, valid Developer ID Application identity'; return 1;
    }
  else
    # A private self-signed identity can be valid for our certificate-pinned DR
    # without changing the user's global certificate trust settings.
    identities="$(security find-identity -p codesigning "${CODESIGN_KEYCHAIN}")" || return 1
    printf '%s\n' "${identities}" | grep -qi "${CODESIGN_IDENTITY}" || {
      macos_signing_fail 'pinned certificate/private key is unavailable; restore it, do not generate a replacement'; return 1;
    }
  fi
}

macos_signing_requirement() {
  # Pin the actual signing certificate, whether self-signed or Apple-issued.
  printf 'identifier "%s" and certificate leaf = H"%s"' "$1" "${CODESIGN_IDENTITY}"
}

macos_signing_sign_one() {
  local target="$1" identifier="$2" args=(--force --sign "${CODESIGN_IDENTITY}" --identifier "$2")
  [[ -z "${CODESIGN_KEYCHAIN:-}" ]] || args+=(--keychain "${CODESIGN_KEYCHAIN}")
  if [[ "${MACOS_SIGNING_MODE}" == development ]]; then
    args+=(--timestamp=none --requirements "=designated => $(macos_signing_requirement "${identifier}")")
  else
    args+=(--options runtime --timestamp)
  fi
  codesign "${args[@]}" "${target}" || return 1
}

macos_signing_sign_app() {
  local app="$1" bundle_id="$2" target relative identifier
  [[ "${bundle_id}" =~ ^[A-Za-z0-9][A-Za-z0-9.-]+$ ]] || { macos_signing_fail 'invalid signing identifier'; return 1; }
  case "${MACOS_SIGNING_MODE}" in
    unsigned) return 0 ;;
    adhoc) codesign --force --deep --sign - "${app}" && codesign --verify --deep --strict "${app}"; return $? ;;
  esac
  # Sign leaf Mach-O code first; do not rely on --deep to select or repair code.
  while IFS= read -r -d '' target; do
    [[ "${target}" != "${app}/Contents/MacOS/opendesk" ]] || continue
    case "$(file -b "${target}")" in Mach-O*) ;; *) continue ;; esac
    relative="${target#"${app}/Contents/"}"
    identifier="${bundle_id}.$(printf '%s' "${relative}" | tr '/ ' '..')"
    if [[ "${relative}" == 'Helpers/OpenDesk UI.app/Contents/MacOS/opendesk-ui-host' ]]; then
      identifier="${bundle_id}.ui-host"
    fi
    macos_signing_sign_one "${target}" "${identifier}" || return 1
    codesign --verify --strict "${target}" || return 1
    if [[ "${MACOS_SIGNING_MODE}" == development ]]; then
      codesign --verify -R "=$(macos_signing_requirement "${identifier}")" "${target}" || return 1
    fi
  done < <(find "${app}/Contents" -type f -print0)
  # Seal the helper bundle after its executable, before sealing the parent.
  local ui_app="${app}/Contents/Helpers/OpenDesk UI.app"
  if [[ -d "${ui_app}" ]]; then
    macos_signing_sign_one "${ui_app}" "${bundle_id}.ui-host" || return 1
    codesign --verify --strict "${ui_app}" || return 1
    if [[ "${MACOS_SIGNING_MODE}" == development ]]; then
      codesign --verify -R "=$(macos_signing_requirement "${bundle_id}.ui-host")" "${ui_app}" || return 1
    fi
  fi
  macos_signing_sign_one "${app}" "${bundle_id}" || return 1
  macos_signing_verify_app "${app}" "${bundle_id}"
}

macos_signing_verify_app() {
  local app="$1" bundle_id="$2"
  codesign --verify --deep --strict "${app}" || return 1
  case "${MACOS_SIGNING_MODE}" in
    development) codesign --verify -R "=$(macos_signing_requirement "${bundle_id}")" "${app}" ;;
    release)
      codesign --verify -R "=$(macos_signing_requirement "${bundle_id}")" "${app}" || return 1
      codesign -dv "${app}" 2>&1 | grep -q '^Authority=Developer ID Application:' ;;
    *) macos_signing_fail 'stable launcher refuses experimental signatures'; return 1 ;;
  esac
}
