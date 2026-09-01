# Native Extension Plugin V1.0.1 examples

Status: **Experimental**. Normal users install a publisher-built bundle; they do
not compile OpenDesk or the extension. V1.0.1 is not a Stable SDK, publisher
authentication system, or sandbox.

## Five-minute consumer quickstart

Prerequisites: an installed `opendesk` CLI and a precompiled
`com.example.go-basic` archive that exactly matches the current OS and CPU. After
verifying the publisher's checksum/signature, unpack it. The complete bundle is:

```text
com.example.go-basic/
  extension.json
  bin/
    native-ext-go-basic        # native-ext-go-basic.exe in the Windows archive
```

The directory name must equal the manifest `id`. Install the whole directory in
the single recommended current-user root:

| Platform | Canonical current-user root |
| --- | --- |
| macOS | `$HOME/Library/Application Support/OpenDesk/NativeExtensions/` |
| Linux | `${XDG_DATA_HOME:-$HOME/.local/share}/OpenDesk/NativeExtensions/` |
| Windows | `%LOCALAPPDATA%\OpenDesk\NativeExtensions\` via the LocalAppData Known Folder |

macOS first install (an absolute `HOME` is required):

```bash
SOURCE="/absolute/path/com.example.go-basic"
case "$HOME" in /*) ;; *) echo "HOME must be absolute" >&2; exit 1;; esac
INSTALL_ROOT="$HOME/Library/Application Support/OpenDesk/NativeExtensions"
TARGET="$INSTALL_ROOT/com.example.go-basic"
test -f "$SOURCE/extension.json"
test -x "$SOURCE/bin/native-ext-go-basic"
test ! -e "$TARGET"
install -d -m 700 "$INSTALL_ROOT"
cp -R "$SOURCE" "$TARGET"
chmod -R go-w "$TARGET"
```

Linux first install. A non-empty relative `XDG_DATA_HOME` is an error; it is
never interpreted relative to the current working directory:

```bash
SOURCE="/absolute/path/com.example.go-basic"
case "${XDG_DATA_HOME-}" in
  /*) DATA_HOME="$XDG_DATA_HOME" ;;
  "") case "$HOME" in /*) DATA_HOME="$HOME/.local/share" ;; *) echo "HOME must be absolute" >&2; exit 1;; esac ;;
  *) echo "XDG_DATA_HOME must be absolute when set" >&2; exit 1 ;;
esac
INSTALL_ROOT="$DATA_HOME/OpenDesk/NativeExtensions"
TARGET="$INSTALL_ROOT/com.example.go-basic"
test -f "$SOURCE/extension.json"
test -x "$SOURCE/bin/native-ext-go-basic"
test ! -e "$TARGET"
install -d -m 700 "$INSTALL_ROOT"
cp -R "$SOURCE" "$TARGET"
chmod -R go-w "$TARGET"
```

Windows PowerShell first install uses the LocalAppData Known Folder, not roaming
`APPDATA`:

```powershell
$source = 'C:\absolute\path\com.example.go-basic'
$dataHome = [Environment]::GetFolderPath('LocalApplicationData')
if (-not [IO.Path]::IsPathFullyQualified($dataHome)) { throw 'LocalAppData must be absolute' }
$installRoot = Join-Path $dataHome 'OpenDesk\NativeExtensions'
$target = Join-Path $installRoot 'com.example.go-basic'
if (Test-Path $target) { throw "target already exists: $target" }
New-Item -ItemType Directory -Force -Path $installRoot | Out-Null
Copy-Item -Recurse -LiteralPath $source -Destination $target
```

Save this complete file as `/absolute/path/hello.js`:

```js
function main() {
  const hello = NativeExtensions.goBasic.hello({ name: "OpenDesk" });
  const sum = NativeExtensions.goBasic.add({ a: 20, b: 22 });
  console.log(JSON.stringify({ hello, sum }));
}

main();
```

Run it from any working directory. The flag is required because the registry is
Experimental and disabled by default:

```bash
opendesk -experimental-native-extension \
  -script /absolute/path/hello.js \
  -console-mode script
```

Expected business output:

```json
{"hello":{"message":"Hello OpenDesk"},"sum":{"value":42}}
```

If the namespace is missing, save `/absolute/path/native-extension-diagnostics.js`:

```js
function main() {
  console.log(JSON.stringify({
    plugins: NativeExtensions.list(),
    diagnostics: NativeExtensions.diagnostics()
  }, null, 2));
}

main();
```

Run it with the same `-experimental-native-extension` command. `list()`,
`get()` and `diagnostics()` are read-only and start zero children. Typical
codes are `root_unavailable` (root absent), `user_root_unavailable` (canonical
base invalid), `invalid_manifest`, `unsafe_bundle`, `digest_mismatch`,
`duplicate_plugin_id`, and `duplicate_namespace`.

Normal calls are
`NativeExtensions.<namespace>.<method>(businessParams)` or the same call with a
second `{ timeoutMs }` argument. `NativeExtensions.get(pluginId)` performs one
canonical lookup. The Host binds plugin id, executable, wire method, protocol,
version and default timeout; ordinary scripts never supply those routing fields.
Discovery does not execute bundle JavaScript, and V1.1 custom facades remain a
separate future Goal.

## Example bundles and responsibilities

- `go-basic`: Go standard library only; `hello` and `add`.
- `macos-vision`: Foundation, ImageIO, and Apple Vision; real `ocr` on macOS 12+.

Publishers produce one source-free precompiled archive per OS/architecture.
Users install one matching archive. Authors use their plugin language's normal
release toolchain; OpenDesk only validates the finished bundle and invokes its
executable. Optional `.d.ts` files are editor-only and are never discovered or
executed.

## Plugin author workflow

Use the language's standard release tool in the plugin's own repository. A Go
authoring workspace needs only the plugin sources and manifest, not OpenDesk Core:

```bash
PLUGIN_SRC="/absolute/path/to/go-basic-plugin"
STAGE="/absolute/path/to/plugin-output"
GO_BUNDLE="$STAGE/com.example.go-basic"
mkdir -p "$GO_BUNDLE/bin" "$GO_BUNDLE/types"
go -C "$PLUGIN_SRC" build \
  -trimpath -buildvcs=false \
  -o "$GO_BUNDLE/bin/native-ext-go-basic" .
cp "$PLUGIN_SRC/extension.json" "$GO_BUNDLE/extension.json"
cp "$PLUGIN_SRC/types/index.d.ts" "$GO_BUNDLE/types/index.d.ts"
test -x "$GO_BUNDLE/bin/native-ext-go-basic"
```

The equivalent target-platform release commands are shown below. Select one
recipe; the current macOS proof executes the Go and `swiftc` recipes. SwiftPM,
Xcode, Cargo and CMake lines are target-platform author/CI templates and are not
claimed as current proof results:

```bash
swift build -c release --package-path /absolute/path/to/swift-plugin
xcodebuild -project /absolute/path/Plugin.xcodeproj -scheme Plugin -configuration Release build
cargo build --release --manifest-path /absolute/path/to/rust-plugin/Cargo.toml
cmake -S /absolute/path/to/cpp-plugin -B /absolute/path/to/cpp-plugin/build -DCMAKE_BUILD_TYPE=Release
cmake --build /absolute/path/to/cpp-plugin/build --config Release
```

The repository's single-file Apple Vision example uses the copyable macOS
release command below; production multi-file plugins should normally use SwiftPM
or Xcode:

```bash
PLUGIN_SRC="/absolute/path/to/macos-vision-plugin"
BUNDLE="/absolute/path/to/plugin-output/com.example.macos-vision"
ARCH="$(uname -m)"
SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"
mkdir -p "$BUNDLE/bin"
xcrun swiftc -O -target "${ARCH}-apple-macosx12.0" -sdk "$SDK_PATH" \
  "$PLUGIN_SRC/main.swift" -framework Vision -framework ImageIO \
  -o "$BUNDLE/bin/native-ext-macos-vision"
```

Test the wire executable before packaging:

```bash
GO_BUNDLE="/absolute/path/to/plugin-output/com.example.go-basic"
printf '%s\n' '{"protocol":"opendesk-native-extension","version":1,"id":"smoke-1","method":"hello","params":{"name":"OpenDesk"}}' \
  | "$GO_BUNDLE/bin/native-ext-go-basic" \
  >"$GO_BUNDLE/wire.stdout" 2>"$GO_BUNDLE/wire.stderr"
test "$(wc -l < "$GO_BUNDLE/wire.stdout" | tr -d ' ')" = 1
python3 - "$GO_BUNDLE/wire.stdout" <<'PY'
import json, pathlib, sys
response = json.loads(pathlib.Path(sys.argv[1]).read_text())
assert response == {"protocol":"opendesk-native-extension","version":1,"id":"smoke-1","ok":True,"result":{"message":"Hello OpenDesk"}}, response
PY
```

stdout must contain exactly one response JSON object. Diagnostics belong on
stderr. The expected stdout object is asserted above, not merely printed.

After the final build, calculate the executable digest, write it to the target
manifest, then validate that manifest against the formal Draft 2020-12 schema.
This example assumes `jsonschema==4.23.0` is installed in the CI Python
environment:

```bash
GO_BUNDLE="/absolute/path/to/plugin-output/com.example.go-basic"
SCHEMA="/absolute/path/to/extension-manifest-v1.schema.json"
python3 - "$GO_BUNDLE/extension.json" "$GO_BUNDLE/bin/native-ext-go-basic" <<'PY'
import hashlib, json, pathlib, sys
manifest_path, executable_path = map(pathlib.Path, sys.argv[1:])
manifest = json.loads(manifest_path.read_text())
manifest["executableSha256"] = hashlib.sha256(executable_path.read_bytes()).hexdigest()
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
PY
python3 - "$SCHEMA" "$GO_BUNDLE/extension.json" <<'PY'
import json, pathlib, sys
from jsonschema.validators import validator_for
schema, instance = [json.loads(pathlib.Path(p).read_text()) for p in sys.argv[1:]]
validator = validator_for(schema); validator.check_schema(schema); validator(schema).validate(instance)
PY
```

Schema success is necessary but not sufficient: Host validation additionally
enforces case-fold collisions, reserved names, ownership/mode, containment and
digest checks.

Publish separate target archives instead of one bundle containing every
platform binary, for example:

```text
com.example.go-basic_0.1.0_darwin-arm64.tar.gz
com.example.go-basic_0.1.0_linux-amd64.tar.gz
com.example.go-basic_0.1.0_windows-amd64.zip
checksums.txt
```

Each target archive has the same id/version/namespace/method contract, but may
have a target-specific `executable` path and digest. A Windows bundle normally
uses `bin/native-ext-go-basic.exe`; its manifest must name that exact relative
path. If `executableSha256` is present, calculate it from the final staged
binary, then do not mutate the binary. A release archive should contain runtime
assets only—no compiler cache, repository, or assumption that `facade.js` runs.

Publisher signatures, notarization, SBOMs and archive checksums belong to the
publisher/CI release process. The optional manifest executable SHA-256 detects a
content mismatch but does not authenticate a publisher or transitive
`.dylib/.so/.dll`/script-module dependencies. Prefer self-contained executables,
keep all runtime assets non-writable by other users, and sign/checksum the whole
archive. An invoked extension inherits the OpenDesk user's environment, cwd,
filesystem and network access; V1.0.1 is not a sandbox.

For the current macOS example stage, create and verify archives with:

```bash
ROOT="$(pwd -P)"
STAGE="$ROOT/.runtime/build/native-extension-author"
DIST="$ROOT/.runtime/dist/native-extension-author"
mkdir -p "$DIST"
tar -czf "$DIST/com.example.go-basic_0.1.0_darwin-$(uname -m).tar.gz" \
  -C "$STAGE" com.example.go-basic
tar -czf "$DIST/com.example.macos-vision_0.1.0_darwin-$(uname -m).tar.gz" \
  -C "$STAGE" com.example.macos-vision
shasum -a 256 "$DIST"/*.tar.gz
```

Install the verified archive as one complete bundle using the consumer command
at the top of this page. Then start a new execution from an unrelated cwd with
the same complete `hello.js`:

```bash
cd /private/tmp
opendesk -experimental-native-extension \
  -script /absolute/path/hello.js \
  -console-mode script
```

The installed Host smoke must produce
`{"hello":{"message":"Hello OpenDesk"},"sum":{"value":42}}`. It replaces
neither the direct wire test nor archive checksum verification.

Use the target platform's normal archiver in release CI; Windows conventionally
publishes a `.zip`. The formal proof also assembles source-free Linux amd64 and
Windows amd64 Go bundles, sets the Windows target manifest to the exact `.exe`
path, and records archive/binary SHA-256 values. They remain compile/package
evidence, not target-OS Runtime evidence.

## Build the repository proof package

The following is for OpenDesk repository maintainers testing the bundled
examples. It builds OpenDesk as well as the plugins; a third-party plugin author
does not need this step. Run from the repository root. All output remains under
`.runtime/`:

```bash
ROOT="$(pwd -P)"
PACKAGE="$ROOT/.runtime/build/native-plugin-example"
mkdir -p \
  "$PACKAGE/native-extensions/com.example.go-basic/bin" \
  "$PACKAGE/native-extensions/com.example.go-basic/types" \
  "$PACKAGE/native-extensions/com.example.macos-vision/bin" \
  "$PACKAGE/native-extensions/com.example.macos-vision/types"

go build -o "$PACKAGE/opendesk" ./cmd/opendesk
go -C examples/native-extensions/go-basic build \
  -o "$PACKAGE/native-extensions/com.example.go-basic/bin/native-ext-go-basic" .

ARCH="$(uname -m)"
SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"
xcrun swiftc \
  -target "${ARCH}-apple-macosx12.0" \
  -sdk "$SDK_PATH" \
  examples/native-extensions/macos-vision/main.swift \
  -framework Vision \
  -framework ImageIO \
  -o "$PACKAGE/native-extensions/com.example.macos-vision/bin/native-ext-macos-vision"

cp examples/native-extensions/go-basic/extension.json \
  "$PACKAGE/native-extensions/com.example.go-basic/extension.json"
cp examples/native-extensions/go-basic/types/index.d.ts \
  "$PACKAGE/native-extensions/com.example.go-basic/types/index.d.ts"
cp examples/native-extensions/macos-vision/extension.json \
  "$PACKAGE/native-extensions/com.example.macos-vision/extension.json"
cp examples/native-extensions/macos-vision/types/index.d.ts \
  "$PACKAGE/native-extensions/com.example.macos-vision/types/index.d.ts"
cp -R polyfills jslibs "$PACKAGE/"
cp examples/native-extensions/quickstart.js "$PACKAGE/quickstart.js"
```

`polyfills/` and `jslibs/` are copied next to `opendesk` as required core
Runtime assets. They are not plugin facade code.

Run this block from the repository root; the Runtime process itself switches to
an unrelated empty cwd before loading the packaged script:

```bash
ROOT="$(pwd -P)"
PACKAGE="$ROOT/.runtime/build/native-plugin-example"
cd /private/tmp
"$PACKAGE/opendesk" \
  -experimental-native-extension \
  -script "$PACKAGE/quickstart.js" \
  -console-mode script
```

`quickstart.js` proves list/get, immutability, hello, add, and diagnostics. The
formal proof harness separately runs real Apple Vision OCR against a maintained
fixture so the copy-paste quickstart needs no hidden JavaScript global.

## Install and upgrade semantics

Use only the canonical current-user formula and first-install commands at the
top of this page. Install or replace a bundle only between Runtime executions;
the registry is frozen and V1 has no hot reload. If a target already exists,
stop active executions and perform an explicit staged replacement. Never
merge-copy a new version over a live bundle, copy only the executable, or let a
current-user duplicate override a publisher bundle: duplicate id/namespace
candidates are all quarantined.

## `.app` staging before codesign

Build and sign an app with the complete bundles staged before codesign:

```text
OpenDesk.app/Contents/Resources/NativeExtensions/
```

For example:

```bash
ROOT="$(pwd -P)"
PACKAGE="$ROOT/.runtime/build/native-plugin-example"
DIST="$ROOT/.runtime/build/native-plugin-example-app"
NATIVE_EXTENSIONS_SOURCE="$PACKAGE/native-extensions" \
DIST_DIR="$DIST" CODESIGN_IDENTITY=- \
  ./scripts/build_macos_app.sh
codesign --verify --deep --strict "$DIST/OpenDesk.app"
```

The build rejects relative/symlink staging roots and non-bundle direct children.
Do not mutate Resources after signing.

## Manifest and protocol

The public manifest schema is
`schemas/native-extension/extension-manifest-v1.schema.json`. The existing wire
protocol remains:

```json
{
  "protocol": "opendesk-native-extension",
  "version": 1,
  "id": "req-1",
  "method": "hello",
  "params": { "name": "OpenDesk" }
}
```

The extension echoes `id` and returns either `ok: true` with `result`, or
`ok: false` with a structured error. stdout contains exactly one JSON response;
diagnostics go to stderr.

## Diagnostics and low-level V0

```js
console.log(JSON.stringify(NativeExtensions.list(), null, 2));
console.log(JSON.stringify(NativeExtensions.diagnostics(), null, 2));
```

`list/get/diagnostics` never launch a child. Bundle `facade.js` is never loaded
in V1.

Direct Host CLI remains available for protocol diagnostics:

```bash
opendesk \
  -native-extension /absolute/path/to/native-ext-go-basic \
  -native-method hello \
  -native-params '{"name":"OpenDesk"}'
```

The low-level JavaScript `NativeExtension.call` compatibility surface requires
the separate `-experimental-unsafe-native-extension-call` local flag. Do not
use it as the normal plugin interface; HTTP/MCP cannot enable it.

## Verified acceptance

```bash
./scripts/test_native_process_extensions.sh
./scripts/test_native_extension_plugins.sh
```

The plugin proof builds current Host/Go/Swift sources, creates a source-free
package under `/private/tmp`, starts it from another empty cwd, verifies
portable/current-user/`.app` discovery, zero-child initialization and
list/get/diagnostics, immutable descriptors, hello/add, real Apple Vision OCR,
fresh one-shot children, resource provenance, and privacy-minimized Evidence.

V1 deliberately does not auto-run custom JavaScript. A future V1.1 adapter
requires a dedicated restricted Goja realm and a JSON-only cross-realm boundary.
