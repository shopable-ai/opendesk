# OpenDesk App Package Format

> Status: P0 contract  
> Manifest: `opendesk.app.json`  
> Current schema: `schemaVersion: 1`

## Purpose

`opendesk.app.json` is the stable package manifest for OpenDesk Script Apps / App Mode. The Runtime validates the package before executing business JavaScript so it can answer:

- which package this is;
- which manifest schema it uses;
- which package version it declares;
- whether the current OpenDesk Runtime is compatible;
- whether entry/resources remain inside the package root;
- which capabilities the package declares as metadata.

This contract does not define an App Store, installer, updater, license server, secret store, remote dependency resolver, protected recipe format, or user-data migration framework.

## Package layout

A minimal versioned package is:

```text
my-app/
├── opendesk.app.json
├── main.js
└── assets/
    ├── tray.ico
    └── tray-template.png
```

Example:

```json
{
  "schemaVersion": 1,
  "id": "com.example.my-app",
  "version": "1.0.0",
  "name": "My App",
  "runtime": {
    "minVersion": "0.1.0"
  },
  "entry": "main.js",
  "singleInstance": true,
  "window": {
    "mainId": "main",
    "closeBehavior": "hide"
  },
  "tray": {
    "enabled": true,
    "icons": {
      "windows": "assets/tray.ico",
      "macos": "assets/tray-template.png"
    },
    "tooltip": "My App",
    "primaryAction": "opendesk.open",
    "menuMode": "merge",
    "menu": []
  },
  "capabilities": ["custom-ui"]
}
```

## Version model

Four version concepts are intentionally separate:

| Version | Meaning | P0 owner |
| --- | --- | --- |
| OpenDesk Runtime version | version of the executable/runtime that loads packages | Runtime build |
| App Package version | version of one Script App | `version` |
| Manifest schema version | version of the `opendesk.app.json` format | `schemaVersion` |
| User data schema version | version of app-owned persisted user data | future, not part of P0 manifest migration |

`version` and `runtime.minVersion` use SemVer without a leading `v`.

## Schema versioning

### Version 1

`schemaVersion: 1` is the first long-term manifest contract.

- `version` is required.
- `name`, `runtime.minVersion`, and `capabilities` are optional.
- unknown fields are rejected rather than silently ignored.
- a future/unknown `schemaVersion` fails closed before package resources or JavaScript are executed.
- Runtime does not rewrite or automatically migrate the manifest on disk.

### Legacy v0 compatibility

For compatibility with App Mode packages created before this contract, omission of `schemaVersion` is treated as legacy v0.

Legacy v0 continues to accept the previously published fields (`id`, `entry`, `singleInstance`, `window`, `tray`). It cannot opt into v1-only metadata (`version`, `name`, `runtime`, `capabilities`) without setting `schemaVersion: 1`.

New packages should always publish schema v1. Legacy support exists to avoid breaking already-created App Mode packages, not as a recommended authoring format.

## Identity

`id` is required and is a stable package identity.

Rules:

- lowercase ASCII reverse-DNS form, for example `com.example.invoice-helper`;
- at least two dot-separated segments;
- no whitespace, Unicode, `/`, `\\`, drive-prefix syntax, or uppercase letters;
- maximum 255 bytes overall;
- maximum 63 bytes per segment.

The same rules apply on macOS and Windows. Package identity participates in single-instance identity and may be used by current/future app-data namespacing. Changing `id` therefore means creating a different application identity; it is not a cosmetic rename.

## Runtime compatibility

Schema v1 can declare:

```json
{
  "runtime": {
    "minVersion": "0.1.0"
  }
}
```

The loader checks compatibility before resolving the entry file or starting JavaScript. An older Runtime fails with `APP_RUNTIME_TOO_OLD` and tells the user the required/current versions and to upgrade OpenDesk.

P0 deliberately does not define `runtime.maxVersion`. Maximum-version constraints create unnecessary future blocking and should only be introduced if OpenDesk later has a demonstrated compatibility model that needs them.

`pkg/runtimeversion.Current` is the Runtime compatibility version source. It defaults to the current P0 baseline and is designed for release-build injection with Go `-ldflags -X`. Build/release pipelines must keep the published desktop artifact version and this Runtime compatibility version aligned.

## Resource path rules

`entry`, `tray.icons.windows`, `tray.icons.macos`, and future package-relative resource fields use the same fail-closed rules:

- package-relative paths only;
- no POSIX absolute paths;
- no Windows drive paths;
- no `..` traversal;
- no NUL;
- referenced resources must exist and be regular files;
- the resolved real path must remain below the canonical package root;
- symlinks cannot be used to escape the package root.

Examples rejected by the loader include:

```text
../evil.js
/tmp/evil.js
C:\\outside\\evil.js
..\\outside\\evil.js
```

Tray icon extension/content validation remains part of App Shell resource validation on every host OS.

## Capabilities

`capabilities` is optional schema-v1 metadata. Tokens are lowercase stable identifiers such as `custom-ui` or `desktop-automation`.

P0 semantics are intentionally limited:

- syntax and duplicate declarations are validated;
- declarations can support documentation, diagnostics, packaging review, and future prerequisite checks;
- declarations do **not** grant permissions;
- declarations do **not** sandbox JavaScript;
- declarations do **not** prove that a permission/security boundary is enforced.

A future permission system must define enforceable Runtime behavior separately rather than retroactively describing metadata as security enforcement.

## Secrets and user configuration

`opendesk.app.json` is source/package metadata and is not a secret store. API keys, passwords, access tokens, customer credentials, or machine-specific secrets must not be placed in this manifest.

User configuration, secrets, and persistent user-data schema are separate contracts.

## Validation pipeline

The package loader follows this order:

```text
package root
→ read manifest
→ detect schema version
→ strict JSON/schema decode
→ semantic validation
→ Runtime compatibility validation
→ entry/resource containment validation
→ normalized Package
→ App Shell / JavaScript execution
```

This order is deliberate. A package that needs a newer Runtime should fail with a compatibility diagnostic before an unrelated missing entry/resource error from code the current Runtime should not run.

## Error model

Package validation uses typed `PackageError` values with stable codes and optional field/expected/actual/fix context. P0 codes include:

```text
APP_PACKAGE_ROOT_INVALID
APP_PACKAGE_MANIFEST_NOT_FOUND
APP_PACKAGE_MANIFEST_INVALID
APP_PACKAGE_SCHEMA_UNSUPPORTED
APP_PACKAGE_ID_INVALID
APP_PACKAGE_VERSION_INVALID
APP_PACKAGE_ENTRY_MISSING
APP_PACKAGE_RESOURCE_MISSING
APP_PACKAGE_RESOURCE_ESCAPE
APP_PACKAGE_RESOURCE_INVALID
APP_PACKAGE_CAPABILITY_INVALID
APP_RUNTIME_TOO_OLD
APP_RUNTIME_VERSION_INVALID
```

Human-readable details remain actionable, while callers/tests can classify failures through the stable code rather than brittle string matching.

## Unknown fields

OpenDesk deliberately rejects unknown semantic fields in the current schema. This prevents misspellings such as `runtime.minVerison` from silently behaving as if no compatibility requirement were declared.

Future additive metadata must first become part of a supported schema/contract. A future schema version fails closed on an older Runtime.

## Distribution

App Package format is independent from the outer delivery container:

```text
macOS .app
└── Contents/Resources/AppMode/
    ├── opendesk.app.json
    ├── main.js
    └── assets/

Windows portable/custom app
└── app-mode/
    ├── opendesk.app.json
    ├── main.js
    └── assets/
```

The same manifest/path/compatibility validation runs before business code in development and distribution layouts.

## Non-goals for P0

P0 does not implement:

- App Store / Marketplace;
- License server;
- auto updater;
- MSI/MSIX or macOS installer policy;
- code signing/notarization policy;
- protected recipe/source encryption;
- secret manager;
- npm-style dependency resolution;
- remote package download;
- user-data migration framework;
- capability-based permission enforcement.

These systems may build on package identity/version/schema later, but they must not overload the P0 manifest contract.
