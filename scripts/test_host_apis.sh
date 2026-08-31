#!/usr/bin/env bash
set -euo pipefail

echo "[DEPRECATED] scripts/test_host_apis.sh is a compatibility wrapper; use scripts/test_runtime_apis.sh" >&2
if ! printenv CLAWDESK_RUNTIME_API_LIVE_FILTER >/dev/null 2>&1 && printenv HOST_API_LIVE_FILTER >/dev/null 2>&1; then
  export CLAWDESK_RUNTIME_API_LIVE_FILTER="$(printenv HOST_API_LIVE_FILTER)"
fi
if ! printenv CLAWDESK_RUNTIME_API_BROWSER_APP >/dev/null 2>&1 && printenv HOST_API_BROWSER_APP >/dev/null 2>&1; then
  export CLAWDESK_RUNTIME_API_BROWSER_APP="$(printenv HOST_API_BROWSER_APP)"
fi
exec "$(cd "$(dirname "$0")" && pwd)/test_runtime_apis.sh" "$@"
