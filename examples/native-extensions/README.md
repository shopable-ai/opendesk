# Native Extension Plugin examples

Status: **Experimental**. The first supported user path is a plugin author on
their own macOS machine: compile an executable, place a source-free bundle
beside OpenDesk, then run normal local CLI JavaScript. The plugin is not a Stable
SDK, publisher authentication system, or sandbox.

Public publisher asset status: **Not Published / Not Verified**. These
repository files are maintainable source and documentation, not a public
download. A five-minute consumer must already have a matching precompiled
archive from a trusted publisher. Archives under `.runtime/` are local
acceptance handoff evidence only, never a public Release Asset.

## Local plugin-author quickstart

Prerequisites: an installed local `opendesk` CLI and a complete compiled
`com.example.go-basic` bundle. The author compiles the executable; OpenDesk only
strictly validates the finished manifest and executable. The complete bundle is:

```text
com.example.go-basic/
  extension.json
  bin/
    native-ext-go-basic        # native-ext-go-basic.exe in the Windows archive
```

The directory name must equal the manifest `id`. Install the whole directory in
the program-relative root of the executable that will run it:

| Distribution form | Program-relative root |
| --- | --- |
| CLI / portable | `<program-directory>/native-extensions/` |
| macOS `.app` | `OpenDesk.app/Contents/Resources/NativeExtensions/` |

Build/install a source-free macOS `go-basic` bundle. Run this from the OpenDesk
repository root; `PROGRAM_DIR` must contain the local `opendesk` to run:

```bash
ROOT="$(pwd -P)"
PLUGIN_SRC="$ROOT/examples/native-extensions/go-basic"
PROGRAM_DIR="/absolute/path/to/program-directory"
BUNDLE="$PROGRAM_DIR/native-extensions/com.example.go-basic"
test -x "$PROGRAM_DIR/opendesk"
test ! -e "$BUNDLE"
install -d -m 700 "$BUNDLE/bin" "$BUNDLE/types"
go -C "$PLUGIN_SRC" build -trimpath -buildvcs=false -o "$BUNDLE/bin/native-ext-go-basic" .
cp "$PLUGIN_SRC/extension.json" "$BUNDLE/extension.json"
cp "$PLUGIN_SRC/types/index.d.ts" "$BUNDLE/types/index.d.ts"
chmod -R go-w "$BUNDLE"
test -x "$BUNDLE/bin/native-ext-go-basic"
```

`go-basic` is a Darwin/Linux/Windows implementation candidate. `macos-vision`
uses Apple Vision and is macOS-only. This repository's runtime/security evidence
is macOS-only. Linux and Windows are **Not Evaluated** for target-machine Runtime
and have only matching-source cross-compile/package checks; they are not
Unsupported.

Save the complete [`quickstart.js`](quickstart.js) business script as
`<program-directory>/quickstart.js`:

```js
function main() {
  const hello = NativeExtensions.goBasic.hello({ name: "OpenDesk" });
  const sum = NativeExtensions.goBasic.add({ a: 20, b: 22 });
  console.log(JSON.stringify({ hello, sum }));
}

main();
```

The declared working directory for this public example is
`<program-directory>`. From it, run the exact one-line command below. Local CLI
JavaScript provides `NativeExtensions` by default; no experimental flag is used:

```bash
cd /absolute/path/to/program-directory && ./opendesk -script ./quickstart.js -console-mode script
```

Expected business output:

```json
{"hello":{"message":"Hello OpenDesk"},"sum":{"value":42}}
```

### Reproducible macOS Vision OCR input

`macos-vision` is a **macOS-only** example. It is compiled and installed as a
second source-free bundle in the same program-relative root. Its PNG input is
caller-owned business data, so it is saved beside the user script rather than
inside either extension bundle or Native Extension persistent Evidence. The
repository supplies a project-created, synthetic fixture with no user data:
[`opendesk-ocr-123.png`](../../tests/extensions/native-process/fixtures/ocr/opendesk-ocr-123.png).
It is expected to read as `OPENDESK OCR 123\n你好 456`.

The repository also includes an optional caller-owned JPEG input,
[`ocr-test.jpg`](ocr-test.jpg). `ocr-quickstart.js` prefers `ocr-test.jpg` when
it is present beside the script, and falls back to the deterministic
`ocr-test.png` used by the formal plugin gate. Neither image is part of an
extension bundle.

Run this setup from the OpenDesk repository root. `PROGRAM_DIR` must contain
the `opendesk` executable used for the call:

```bash
ROOT="$(pwd -P)"
PROGRAM_DIR="/absolute/path/to/program-directory"
PLUGIN_SRC="$ROOT/examples/native-extensions/macos-vision"
BUNDLE="$PROGRAM_DIR/native-extensions/com.example.macos-vision"
test -x "$PROGRAM_DIR/opendesk"
test ! -e "$BUNDLE"
ARCH="$(uname -m)"
SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"
install -d -m 700 "$BUNDLE/bin" "$BUNDLE/types"
xcrun swiftc -O -target "${ARCH}-apple-macosx12.0" -sdk "$SDK_PATH" \
  "$PLUGIN_SRC/main.swift" -framework Vision -framework ImageIO \
  -o "$BUNDLE/bin/native-ext-macos-vision"
cp "$PLUGIN_SRC/extension.json" "$BUNDLE/extension.json"
cp "$PLUGIN_SRC/types/index.d.ts" "$BUNDLE/types/index.d.ts"
chmod -R go-w "$BUNDLE"
cp "$ROOT/tests/extensions/native-process/fixtures/ocr/opendesk-ocr-123.png" "$PROGRAM_DIR/ocr-test.png"
cp "$ROOT/examples/native-extensions/ocr-quickstart.js" "$PROGRAM_DIR/ocr-quickstart.js"
```

如果使用仓库中已经准备好的 `dist/` 产物，固定从仓库根目录执行下面这一条即可；
脚本会读取 `dist/ocr-test.jpg`，若不存在则读取 `dist/ocr-test.png`：

```bash
./dist/opendesk -script ./dist/ocr-quickstart.js -console-mode script
```

如果源文件 `examples/native-extensions/ocr-test.jpg` 存在而 `dist/ocr-test.jpg` 尚不存在，
脚本会通过 `File.exists`/`File.copy` 自动复制一次；不需要手动切换工作目录或预先复制图片。

The declared working directory remains `<program-directory>`. Run this exact
public one-line command from it:

```bash
cd /absolute/path/to/program-directory && ./opendesk -script ./ocr-quickstart.js -console-mode script
```

Expected console output:

```json
{"text":"OPENDESK OCR 123\n你好 456"}
```

If the namespace is missing, save `<program-directory>/native-extension-diagnostics.js`:

```js
function main() {
  console.log(JSON.stringify({
    plugins: NativeExtensions.list(),
    diagnostics: NativeExtensions.diagnostics()
  }, null, 2));
}

main();
```

Run it with `cd /absolute/path/to/program-directory && ./opendesk -script
./native-extension-diagnostics.js -console-mode script`. `list()`, `get()` and
`diagnostics()` are read-only and start zero children. Typical codes are
`root_unavailable` (program-relative root absent), `invalid_manifest`, `unsafe_bundle`, `digest_mismatch`,
`duplicate_plugin_id`, and `duplicate_namespace`.

Normal calls are
`NativeExtensions.<namespace>.<method>(businessParams)` or the same call with a
second `{ timeoutMs }` argument. `NativeExtensions.get(pluginId)` performs one
canonical lookup. The Host binds plugin id, executable, wire method, protocol,
version and default timeout; ordinary scripts never supply those routing fields.
Discovery does not execute bundle JavaScript, and V1.1 custom facades remain a
separate future Goal. HTTP, MCP, and all other remote execution transports never
inject, enable, redirect, or call Native Extensions.

## Example bundles and responsibilities

- `go-basic`: Go standard library only; `hello` and `add`.
- `macos-vision`: Foundation, ImageIO, and Apple Vision; real `ocr` on macOS 12+.

Publishers produce one source-free precompiled archive per OS/architecture.
Users install one matching archive. Authors use their plugin language's normal
release toolchain; OpenDesk only validates the finished bundle and invokes its
executable. Optional `.d.ts` files are editor-only and are never discovered or
executed.

| Repository file | Role | Install into `NativeExtensions/`? |
| --- | --- | --- |
| `go-basic/main.go` | Go author's Protocol V0 source | No |
| `go-basic/go.mod` | Go author's module metadata | No |
| `go-basic/extension.json` | Copied to the compiled bundle root | Yes |
| `go-basic/types/index.d.ts` | Optional editor declarations | Optional: `types/index.d.ts` |
| [`quickstart.js`](quickstart.js) | Consumer business script using `NativeExtensions.goBasic.*` | No; any user script directory |

The compiled target result is a source-free
`com.example.go-basic/extension.json + bin/native-ext-go-basic + optional
types/index.d.ts` bundle. Do not install only the executable, and do not put
`main.go`, `go.mod` or `quickstart.js` in the plugin root.

## Plugin author workflow

Use the language's standard release tool in the plugin's own repository. The
defaults below build the maintained `go-basic` example from this OpenDesk
checkout. This is an example-specific recipe: a third-party author must replace
the bundle id, executable name, manifest contract and paths as well as
`PLUGIN_SRC`, `STAGE`, and `SCHEMA`. The build consumes only plugin sources and
the manifest, never OpenDesk Core packages:

```bash
ROOT="$(git rev-parse --show-toplevel)"
PLUGIN_SRC="${PLUGIN_SRC:-$ROOT/examples/native-extensions/go-basic}"
STAGE="${STAGE:-$ROOT/.runtime/build/native-extension-author}"
GO_BUNDLE="$STAGE/com.example.go-basic"
test ! -e "$GO_BUNDLE" || { echo "remove or archive the prior local output: $GO_BUNDLE" >&2; exit 1; }
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
ROOT="$(git rev-parse --show-toplevel)"
PLUGIN_SRC="${PLUGIN_SRC:-$ROOT/examples/native-extensions/macos-vision}"
STAGE="${STAGE:-$ROOT/.runtime/build/native-extension-author}"
BUNDLE="$STAGE/com.example.macos-vision"
test ! -e "$BUNDLE" || { echo "remove or archive the prior local output: $BUNDLE" >&2; exit 1; }
ARCH="$(uname -m)"
SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"
mkdir -p "$BUNDLE/bin" "$BUNDLE/types"
xcrun swiftc -O -target "${ARCH}-apple-macosx12.0" -sdk "$SDK_PATH" \
  "$PLUGIN_SRC/main.swift" -framework Vision -framework ImageIO \
  -o "$BUNDLE/bin/native-ext-macos-vision"
cp "$PLUGIN_SRC/extension.json" "$BUNDLE/extension.json"
cp "$PLUGIN_SRC/types/index.d.ts" "$BUNDLE/types/index.d.ts"
test -x "$BUNDLE/bin/native-ext-macos-vision"
```

Test the wire executable before packaging:

```bash
ROOT="$(git rev-parse --show-toplevel)"
STAGE="${STAGE:-$ROOT/.runtime/build/native-extension-author}"
GO_BUNDLE="$STAGE/com.example.go-basic"
WIRE_DIR="$STAGE/wire-proof"
mkdir -p "$WIRE_DIR"
printf '%s\n' '{"protocol":"opendesk-native-extension","version":1,"id":"smoke-1","method":"hello","params":{"name":"OpenDesk"}}' \
  | "$GO_BUNDLE/bin/native-ext-go-basic" \
  >"$WIRE_DIR/wire.stdout" 2>"$WIRE_DIR/wire.stderr"
test "$(wc -l < "$WIRE_DIR/wire.stdout" | tr -d ' ')" = 1
python3 - "$WIRE_DIR/wire.stdout" <<'PY'
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
ROOT="$(git rev-parse --show-toplevel)"
STAGE="${STAGE:-$ROOT/.runtime/build/native-extension-author}"
GO_BUNDLE="$STAGE/com.example.go-basic"
SCHEMA="${SCHEMA:-$ROOT/schemas/native-extension/extension-manifest-v1.schema.json}"
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
filesystem and network access; the plugin is not a sandbox.

For the current macOS `go-basic` stage, create the archive, write a checksum
file, and verify it with:

```bash
ROOT="$(git rev-parse --show-toplevel)"
STAGE="$ROOT/.runtime/build/native-extension-author"
DIST="$ROOT/.runtime/dist/native-extension-author"
mkdir -p "$DIST"
GO_ARCHIVE="com.example.go-basic_0.1.0_darwin-$(uname -m).tar.gz"
tar -czf "$DIST/$GO_ARCHIVE" \
  -C "$STAGE" com.example.go-basic
(cd "$DIST" && shasum -a 256 "$GO_ARCHIVE" > checksums.txt)
(cd "$DIST" && shasum -a 256 -c checksums.txt)
```

If the complete Vision bundle was assembled by the preceding Swift recipe,
package it separately and add it to the verified checksum file:

```bash
ROOT="$(git rev-parse --show-toplevel)"
STAGE="$ROOT/.runtime/build/native-extension-author"
DIST="$ROOT/.runtime/dist/native-extension-author"
VISION_ARCHIVE="com.example.macos-vision_0.1.0_darwin-$(uname -m).tar.gz"
test -f "$STAGE/com.example.macos-vision/extension.json"
test -x "$STAGE/com.example.macos-vision/bin/native-ext-macos-vision"
tar -czf "$DIST/$VISION_ARCHIVE" \
  -C "$STAGE" com.example.macos-vision
(cd "$DIST" && shasum -a 256 "$VISION_ARCHIVE" >> checksums.txt)
(cd "$DIST" && shasum -a 256 -c checksums.txt)
```

If an author chooses to archive the source-free bundle, unpack the whole bundle
into `<program-directory>/native-extensions/`; never copy only its executable.
Then start a new local CLI execution from the declared program directory:

```bash
cd /absolute/path/to/program-directory && ./opendesk -script ./quickstart.js -console-mode script
```

The installed Host smoke must produce
`{"hello":{"message":"Hello OpenDesk"},"sum":{"value":42}}`. It replaces
neither the direct wire test nor archive checksum verification.

Use the target platform's normal archiver in release CI; Windows conventionally
publishes a `.zip`. The formal proof assembles source-free Linux amd64 and
Windows amd64 Go bundles, sets the Windows target manifest to the exact `.exe`
path, and records archive/binary SHA-256 values. These recipes and cross-build
artifacts are compile/package evidence only, not target-OS Runtime evidence.

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

The declared working directory for this package example is `$PACKAGE`; run the
same public one-line form from it:

```bash
ROOT="$(pwd -P)"
PACKAGE="$ROOT/.runtime/build/native-plugin-example"
cd "$PACKAGE" && ./opendesk -script ./quickstart.js -console-mode script
```

`quickstart.js` proves the ordinary business-only `hello` and `add` call shape
and their result. The formal `.js` Runtime suite separately verifies discovery,
`list/get/diagnostics`, immutable bindings, option errors and privacy. The proof
harness also runs real Apple Vision OCR against a maintained fixture so the
copy-paste quickstart needs no hidden JavaScript global.

## Install and upgrade semantics

Use only the program-relative root at the top of this page. Install or replace a
bundle only between Runtime executions; the registry is frozen and V1 has no hot
reload. If a target already exists, stop active executions and perform an
explicit staged replacement. Never merge-copy a new version over a live bundle
or copy only the executable. Duplicate id/namespace candidates are quarantined.

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
python3 tests/extensions/native-process/tools/smoke-harness/main.py
python3 tests/extensions/native-plugin/tools/proof-harness/main.py
```

The plugin proof builds current Host/Go/Swift sources, creates a source-free
package under `/private/tmp`, runs the documented program-directory quickstart,
and verifies portable/`.app` discovery, zero-child initialization and
list/get/diagnostics, immutable descriptors, hello/add, real Apple Vision OCR,
fresh one-shot children, resource provenance, and privacy-minimized Evidence.

V1 deliberately does not auto-run custom JavaScript. A future V1.1 adapter
requires a dedicated restricted Goja realm and a JSON-only cross-realm boundary.
