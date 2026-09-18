#!/bin/sh
# Build a fresh, verifiable Notify Demo package without retaining signing material.
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <new-output.odflow>" >&2
  exit 64
fi

output=$1
case "$output" in
  *.odflow) ;;
  *) echo "output must end in .odflow" >&2; exit 64 ;;
esac
if [ -e "$output" ]; then
  echo "refusing to overwrite existing output: $output" >&2
  exit 73
fi

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
runtime="$repo_root/dist/opendesk"
source_dir="$repo_root/examples/flow-distribution/notify-demo"
if [ ! -x "$runtime" ]; then
  echo "OpenDesk runtime is missing or not executable: $runtime" >&2
  exit 69
fi

output_dir=$(dirname -- "$output")
mkdir -p "$output_dir"
key_dir=$(mktemp -d "${TMPDIR:-/tmp}/opendesk-notify-demo.XXXXXX")
cleanup() {
  rm -rf -- "$key_dir"
}
trap cleanup EXIT HUP INT TERM

private_key="$key_dir/publisher-private.pem"
public_key="$key_dir/publisher-public.pem"
openssl genpkey -algorithm Ed25519 -out "$private_key" >/dev/null 2>&1
openssl pkey -in "$private_key" -pubout -out "$public_key" >/dev/null 2>&1

"$runtime" flow pack "$source_dir" -o "$output" \
  --flow-id com.example.opendesk.notify-demo \
  --name "Notify Demo" \
  --version 1.0.0 \
  --publisher-id com.example.opendesk.example-publisher \
  --publisher-key-id example-notify-demo-ed25519-2026 \
  --entry main.js \
  --public-key "$public_key" \
  --signing-key "$private_key" \
  --platforms darwin,windows \
  --file main.js \
  --file clawdesk.runtime.json
"$runtime" flow verify "$output" --public-key "$public_key"
