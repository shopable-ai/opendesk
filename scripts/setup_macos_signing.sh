#!/usr/bin/env bash
# One-time, per-user development identity. Does not change system/user trust.
set -euo pipefail
[[ "$(uname -s)" == Darwin ]] || { echo 'macOS only' >&2; exit 1; }
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT_DIR}/scripts/macos_signing.sh"
SIGNING_DIR="${HOME}/Library/Application Support/OpenDesk/development-signing"
MACOS_SIGNING_CONFIG="${MACOS_SIGNING_CONFIG:-${SIGNING_DIR}/config.json}"
register_keychain() {
  local selected="$1" entry search_list existing=()
  [[ "${selected}" == /* && -f "${selected}" ]] || { echo 'Configured keychain is missing or not absolute' >&2; return 1; }
  search_list="$(security list-keychains -d user)" || { echo 'Cannot read existing keychain search list; preserving it unchanged' >&2; return 1; }
  while IFS= read -r entry; do
    entry="$(printf '%s' "${entry}" | sed 's/^[[:space:]]*"//;s/"[[:space:]]*$//')"
    [[ -z "${entry}" ]] || existing+=("${entry}")
    [[ "${entry}" != "${selected}" ]] || return 0
  done <<< "${search_list}"
  # codesign needs the keychain registered even with --keychain. Preserve all
  # current entries and the default keychain; this is not a trust setting.
  if [[ ${#existing[@]} == 0 ]]; then security list-keychains -d user -s "${selected}"
  else security list-keychains -d user -s "${existing[@]}" "${selected}"; fi
}
if [[ -f "${MACOS_SIGNING_CONFIG}" ]]; then
  if [[ $# != 0 && "${1:-}" != --resume ]]; then
    echo 'Development identity is already pinned; setup will not rotate or ignore a requested new identity.' >&2
    exit 1
  fi
  register_keychain "$(/usr/bin/plutil -extract keychain raw -o - "${MACOS_SIGNING_CONFIG}")"
  MACOS_SIGNING_MODE=development macos_signing_load
  printf 'Reusing pinned development identity: %s\n' "${CODESIGN_IDENTITY}"
  exit 0
fi
umask 077
mkdir -p "$(dirname "${MACOS_SIGNING_CONFIG}")"
CONFIG_DESTINATION="${MACOS_SIGNING_CONFIG}"
MACOS_SIGNING_CONFIG="${CONFIG_DESTINATION}.pending.$$"
trap 'rm -f "${MACOS_SIGNING_CONFIG}"' EXIT
if [[ $# == 2 && "$1" == --identity ]]; then
  # Reuse an existing identity in the current keychain search list. A keychain
  # path can be selected explicitly; no existing private key is exported.
  CODESIGN_IDENTITY="$2"
  [[ "${CODESIGN_IDENTITY}" =~ ^[A-Fa-f0-9]{40}$ ]] || { echo 'Pass the certificate SHA-1, not its name' >&2; exit 1; }
  selected_keychain="${CODESIGN_KEYCHAIN:-$(security default-keychain -d user | sed 's/^[[:space:]]*"//;s/"[[:space:]]*$//')}"
  /usr/bin/plutil -create xml1 "${MACOS_SIGNING_CONFIG}"
  /usr/bin/plutil -insert identity -string "${CODESIGN_IDENTITY}" "${MACOS_SIGNING_CONFIG}"
  /usr/bin/plutil -insert keychain -string "${selected_keychain}" "${MACOS_SIGNING_CONFIG}"
  /usr/bin/plutil -convert json "${MACOS_SIGNING_CONFIG}"
  register_keychain "${selected_keychain}"
  MACOS_SIGNING_MODE=development macos_signing_load
  mv "${MACOS_SIGNING_CONFIG}" "${CONFIG_DESTINATION}"
  printf 'Pinned existing development identity: %s\n' "${CODESIGN_IDENTITY}"
  exit 0
fi
resume=0
if [[ $# == 1 && "$1" == --resume ]]; then resume=1
elif [[ $# != 0 ]]; then echo 'Usage: setup_macos_signing.sh [--identity CERTIFICATE_SHA1 | --resume]' >&2; exit 1; fi
mkdir -p "${SIGNING_DIR}"
chmod 700 "${SIGNING_DIR}"
KEYCHAIN="${SIGNING_DIR}/opendesk-development.keychain-db"
PASSWORD_FILE="${SIGNING_DIR}/keychain-password"
# Refuse to silently replace an interrupted setup or lost configuration.
if [[ "${resume}" == 0 ]]; then
  [[ ! -e "${KEYCHAIN}" && ! -e "${PASSWORD_FILE}" && ! -e "${SIGNING_DIR}/certificate.pem" ]] || {
    echo "Existing signing material without config at ${SIGNING_DIR}; use --resume to recover it, do not rotate it." >&2; exit 1;
  }
# Private material is outside the checkout. The PKCS#12 backup stays encrypted.
/usr/bin/openssl rand -base64 48 > "${PASSWORD_FILE}"
cat > "${SIGNING_DIR}/certificate.cnf" <<'CONF'
[req]
distinguished_name = subject
x509_extensions = signing
prompt = no
[subject]
CN = OpenDesk Local Development
O = OpenDesk Local Development
[signing]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
subjectKeyIdentifier = hash
CONF
/usr/bin/openssl req -new -newkey rsa:3072 -x509 -days 3650 -sha256 \
  -config "${SIGNING_DIR}/certificate.cnf" -passout "file:${PASSWORD_FILE}" \
  -keyout "${SIGNING_DIR}/private-key.encrypted.pem" -out "${SIGNING_DIR}/certificate.pem"
fi
for material in keychain-password certificate.pem private-key.encrypted.pem; do
  [[ -f "${SIGNING_DIR}/${material}" ]] || { echo "Missing recovery material: ${material}" >&2; exit 1; }
done
/usr/bin/openssl pkcs12 -export -inkey "${SIGNING_DIR}/private-key.encrypted.pem" \
  -passin fd:3 -in "${SIGNING_DIR}/certificate.pem" \
  -out "${SIGNING_DIR}/identity.p12" -passout fd:4 3<"${PASSWORD_FILE}" 4<"${PASSWORD_FILE}"
# Pass this private keychain explicitly to codesign. Never add trust roots,
# change the default keychain or use import -A (unrestricted key access).
if [[ ! -f "${KEYCHAIN}" ]]; then security create-keychain -p "$(cat "${PASSWORD_FILE}")" "${KEYCHAIN}"; fi
security unlock-keychain -p "$(cat "${PASSWORD_FILE}")" "${KEYCHAIN}"
identity="$(/usr/bin/openssl x509 -in "${SIGNING_DIR}/certificate.pem" -noout -fingerprint -sha1 | cut -d= -f2 | tr -d ':')"
if ! security find-identity -p codesigning "${KEYCHAIN}" | grep -qi "${identity}"; then
  security import "${SIGNING_DIR}/identity.p12" -k "${KEYCHAIN}" -P "$(cat "${PASSWORD_FILE}")" -T /usr/bin/codesign
fi
register_keychain "${KEYCHAIN}"
/usr/bin/plutil -create xml1 "${MACOS_SIGNING_CONFIG}"
/usr/bin/plutil -insert identity -string "${identity}" "${MACOS_SIGNING_CONFIG}"
/usr/bin/plutil -insert keychain -string "${KEYCHAIN}" "${MACOS_SIGNING_CONFIG}"
/usr/bin/plutil -insert passwordFile -string "${PASSWORD_FILE}" "${MACOS_SIGNING_CONFIG}"
/usr/bin/plutil -convert json "${MACOS_SIGNING_CONFIG}"
MACOS_SIGNING_MODE=development macos_signing_load
mv "${MACOS_SIGNING_CONFIG}" "${CONFIG_DESTINATION}"
printf 'Pinned development identity: %s\nConfiguration: %s\n' "${CODESIGN_IDENTITY}" "${CONFIG_DESTINATION}"
printf 'Back up this private directory securely (contains key + recovery password): %s\n' "${SIGNING_DIR}"
printf 'Global certificate trust and TCC permissions were not changed. First App migration may require user authorization once.\n'
