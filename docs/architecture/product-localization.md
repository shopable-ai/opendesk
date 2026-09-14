# OpenDesk Product Localization Architecture

> Status: **Localization Core implemented; Native language switching / platform-live qualification pending.**  
> Scope: OpenDesk-owned presentation, App Manifest presentation references, App Shell / Tray, official applications, Custom UI / App packages, locale preference and catalog qualification.  
> Stage naming: this document uses **L0–L4** (`Localization Stage 0` through `Localization Stage 4`) to avoid confusion with repository `P0` product/contract priority terminology.  
> Related: [App Package Format](app-package-format.md), [App Shell、Tray / Menu Bar 与 Single-Instance 设计](app-shell-tray-menu.md)

## 1. Decision

OpenDesk has one product-level localization path:

```text
OS locale + localePreference
            ↓
      Locale Resolver
            ↓
      resolvedLocale
            ↓
      Catalog Loader
            ↓
       t(key, params)
            ↓
Manifest labelKey / App Shell / product presentation
```

Localization must not be implemented as page-specific `if locale == ...` branches and must not be duplicated by macOS, Windows, HTML, Recorder or other presentation owners.

The current implementation lives in `pkg/localization`. App Shell consumes it before native menu construction. Native backends receive resolved strings and do not parse localization JSON themselves.

## 2. L0 locale contract

L0 supports exactly these persisted preferences:

```text
auto
zh-CN
en-US
```

Three concepts remain separate:

- `localePreference`: durable user choice (`auto`, `zh-CN`, `en-US`);
- `systemLocale`: raw/normalized operating-system locale used when preference is `auto`;
- `resolvedLocale`: supported product locale actually used for lookup.

Product default locale is:

```text
zh-CN
```

Examples:

```text
localePreference = auto
systemLocale = en-GB
resolvedLocale = en-US
```

```text
localePreference = zh-CN
systemLocale = en-US
resolvedLocale = zh-CN
```

## 3. Resolver

Resolution is deterministic and independently testable.

L0 mapping:

```text
zh-CN       → zh-CN
zh-Hans     → zh-CN
zh-Hans-CN  → zh-CN

en          → en-US
en-US        → en-US
en-GB        → en-US
en-AU        → en-US
other en-*   → en-US

unsupported  → zh-CN product fallback
```

`zh-TW` and `zh-HK` are **not** described as `zh-CN` equivalents. Until Traditional Chinese is supported they are unsupported locales and therefore reach the product fallback.

Explicit supported preferences always win over `systemLocale`.

## 4. Locale Core

`pkg/localization` owns the shared core.

The stable Go semantic surface includes:

```text
GetLocalePreference()
GetResolvedLocale()
SetLocalePreference(...)
ResolveLocale(...)
Translate(...)
TranslateWithFallback(...)
```

`Manager` owns:

```text
preference
resolver
OS locale detection
catalog loading/cache
fallback
simple {name} interpolation
diagnostics + deduplication
```

This is intentionally a small core and does not introduce a large third-party i18n framework or ICU implementation.

Calling:

```text
SetLocalePreference("auto")
SetLocalePreference("zh-CN")
SetLocalePreference("en-US")
```

updates the manager's in-memory `resolvedLocale` immediately after persistence. The Native Language Menu implemented later may therefore change preference and rebuild/refresh native presentation without inventing another locale system or requiring a process restart.

## 5. OS locale detection

Platform owners are separated by build tags:

```text
pkg/localization/locale_system_darwin.go
pkg/localization/locale_system_windows.go
pkg/localization/locale_system_other.go
```

Current sources:

- macOS: global `AppleLocale` preference;
- Windows: `GetUserDefaultLocaleName`;
- other platforms: `LC_ALL`, `LC_MESSAGES`, then `LANG` as a compatibility source.

OS locale detection failure is fail-soft. It emits a stable diagnostic and resolves to product default rather than preventing OpenDesk startup.

## 6. Preference persistence

`localePreference` is durable user configuration, not an environment-only switch, global variable or compile-time constant.

The default preference file is resolved from the operating system user config directory and stored under:

```text
OpenDesk/preferences.json
```

Document shape:

```json
{
  "localePreference": "en-US"
}
```

Writes use a temporary file plus rename, and the preference directory/file is created with user-only permissions where supported by the host filesystem.

Missing preference means `auto`.

Invalid persisted values such as:

```text
ja-JP
foo
empty value
malformed JSON
```

must not stop startup. They recover to `auto` and emit `I18N_PREFERENCE_INVALID`.

## 7. Official catalog ownership

Official OpenDesk catalogs are package-owned runtime resources:

```text
apps/opendesk/locales/
├── zh-CN.json
└── en-US.json
```

L0 intentionally uses one JSON object per locale. Namespace splitting is deferred until catalog size demonstrates a need.

Keys are stable semantic identifiers, for example:

```text
menu.open
menu.assistant
menu.recorder
menu.schedulerCenter
menu.newSchedule
menu.permissions
menu.runtimeLog
menu.examples
menu.apiDocs
menu.developer
menu.runtimeStatus
menu.measurement
menu.inspector
menu.logs
menu.debug
menu.debugNormal
menu.debugDetailed
menu.helpAndSupport
menu.website
menu.help
menu.customize
menu.language
menu.language.auto
menu.language.zhCN
menu.language.enUS
menu.quit
```

Source sentences are not keys. `t("计划中心")` is not a supported authoring pattern.

Third-party Apps own their own package catalogs; they are not required to write keys into the official OpenDesk catalog.

## 8. Translation and interpolation

Lookup supports:

```text
t(key)
t(key, params)
```

The Go implementation exposes equivalent `Translate` methods.

L0 interpolation is deliberately simple:

```json
{
  "example.count": "共 {count} 项"
}
```

with `{count: 3}` renders:

```text
共 3 项
```

Plural/select rules and full ICU MessageFormat are not part of L0.

## 9. Fallback and fail-soft behavior

Presentation lookup order is fixed:

```text
resolved locale catalog
→ zh-CN product fallback catalog
→ legacy label (Manifest presentation only)
→ safe key representation
```

A missing translation never returns an empty string solely because localization data is incomplete.

Catalog failures handled fail-soft include:

```text
file missing
read/permission error
malformed JSON
root is not an object
non-string catalog value
missing key
```

Localization resource failure is not equivalent to fatal OpenDesk startup failure when a fallback presentation remains available.

## 10. Diagnostics

Stable L0 codes include:

```text
I18N_MISSING_KEY
I18N_CATALOG_MISSING
I18N_CATALOG_INVALID
I18N_PREFERENCE_INVALID
I18N_SYSTEM_LOCALE_UNAVAILABLE
```

Diagnostics can include:

```text
locale
key
fallback
path
error
```

Diagnostic codes are never localized. Repeated equivalent diagnostics are deduplicated in-process to avoid uncontrolled log spam.

## 11. App Manifest `labelKey`

`MenuItem` supports an additive presentation reference:

```json
{
  "id": "open-scheduler-center",
  "labelKey": "menu.schedulerCenter",
  "label": "计划中心",
  "action": "scheduler.center"
}
```

Semantics:

```text
labelKey = stable presentation reference
label    = legacy / compatibility fallback presentation
action   = stable machine action ID
id       = stable machine menu ID
```

`id` and `action` are never localized.

Legacy manifests remain valid:

```json
{
  "id": "some-action",
  "label": "My command",
  "action": "app.command"
}
```

A menu item may also use `labelKey` without a legacy `label`; if all catalogs miss the key, the safe key representation is used.

`labelKey` is an additive optional schema-v1 field. `schemaVersion` remains `1`; no schema v2 was introduced for this presentation-only extension. The Runtime validator and maintained Draft 2020-12 authoring schema are updated together.

## 12. Manifest → App Shell → Native boundary

The owner chain is:

```text
Manifest
→ pkg/appshell ResolveMenuLabel
→ pkg/localization
→ resolved nativeMenuItem labels
→ macOS / Windows native backend
```

Native backends do not load catalogs and do not maintain locale fallback rules.

The official OpenDesk composed menu also resolves framework-owned presentation (`Open`, `Developer`, `Help`, `Quit`, etc.) through the same Locale Core.

Runtime menu patches continue to use stable menu IDs. Localization does not change action dispatch semantics.

## 13. Release packaging

Official App Mode release closure explicitly includes:

```text
locales/zh-CN.json
locales/en-US.json
```

in:

```text
apps/opendesk/.release/app-mode-runtime-files.txt
```

`internal/appmodepayload` qualification verifies that both catalogs are staged into the official App Mode payload. Therefore source checkout and official staged App Mode use the same catalog data.

Catalogs are runtime resources; they are not embedded only in tests and are not expected to be fetched remotely at startup.

## 14. UI locale is not AI conversation language

OpenDesk UI locale and AI conversation language are independent.

Changing `localePreference` must not rewrite:

```text
AI system prompts
assistant model-channel instructions
user prompts
conversation content
```

Examples:

```text
UI = en-US; user speaks Chinese → AI may answer Chinese
UI = zh-CN; user asks for English → AI may answer English
```

Locale Core controls only OpenDesk-owned presentation.

## 15. Custom UI and App boundary

Native and HTML presentation must ultimately consume the same resolved locale decision; Custom UI must not invent another locale preference store.

L0 does not migrate every Custom UI page. L1 may provide a small adapter for official product surfaces. L2 formalizes package-owned localization for third-party Apps/plugins while preserving catalog ownership isolation.

## 16. Qualification

Implemented automated coverage includes:

- resolver mapping and unsupported fallback;
- preference default/set/reload/invalid persistence behavior;
- runtime preference changes updating resolved locale;
- current-locale catalog hits;
- product fallback hits;
- missing key and safe representation;
- interpolation;
- missing/malformed/invalid catalog fail-soft behavior;
- system-locale detection failure fallback;
- legacy `label` compatibility;
- `labelKey + label` and `labelKey`-only manifest semantics;
- stable action IDs;
- official release payload inclusion of both catalogs.

The next local/CI qualification pass must run the complete repository gates and platform builds against the committed implementation.

## 17. L0–L4 roadmap

### L0 — Localization Foundation

Core implementation now exists for resolver, persistence, catalogs, Manifest `labelKey`, App Shell initial label resolution, fallback, diagnostics and release packaging.

Remaining before claiming the whole L0 user experience complete:

```text
Native Tray/Menu language submenu
Language → auto / 简体中文 / English
native menu refresh/rebuild after switching
macOS live qualification
Windows live qualification
```

### L1 — Official Product UI Migration

Migrate official surfaces onto the shared Locale Core, recommended order:

```text
Official Shell
AI Assistant chrome
Scheduler Center
Recorder
Permissions Center
Runtime Log
Developer Tools
Measurement Session
```

Do not introduce per-page localization systems.

### L2 — App / Plugin / Custom UI localization contract

Formalize package-owned catalog metadata, Custom UI locale adapter, namespace isolation, samples, authoring docs and package qualification.

### L3 — Language expansion and translation operations

Add languages based on market need (for example `ja-JP`, `zh-TW`, `ko-KR`, `de-DE`, `fr-FR`, `es-ES`) primarily through catalogs, review and qualification rather than business-code branches.

### L4 — Advanced localization

Demand-driven capabilities may include RTL, advanced plural/select formatting, typography/font qualification, localized distribution metadata and visual/pseudo-locale regression.

## 18. Stage transition rule

A stage is ready to advance only when its stable contracts are documented, applicable automated tests are green, platform-live gaps are explicit, and the next stage can reuse the previous stage without creating a competing locale system.

In particular:

```text
L1 must reuse pkg/localization.
Native language switching must call SetLocalePreference rather than create another preference store.
macOS/Windows native owners must consume resolved presentation rather than parse catalogs.
AI conversation language remains outside the UI locale contract.
```

## 19. Current implementation boundary

As of the Localization Core implementation:

```text
Locale Core source                         implemented
OS locale adapters                        implemented
localePreference persistence              implemented
zh-CN / en-US catalogs                    implemented
Manifest labelKey                         implemented
legacy label compatibility                implemented
fallback + diagnostics                    implemented
initial App Shell/native menu resolution  implemented
official release payload catalogs         implemented
Native Language submenu                   pending
live native language switching UX         pending
macOS live qualification                  pending
Windows live qualification                pending
```

Therefore the accurate status is:

> **Localization Core implemented; Native language switching / platform-live qualification pending.**

Do not describe the whole Localization L0 experience as complete until those remaining native switching and live-platform gates are closed.
