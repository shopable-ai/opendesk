# OpenDesk Product Localization Architecture

> Status: **L0 implementation complete; platform-live qualification pending.**  
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

The shared core lives in `pkg/localization`. App Shell configures it from the current App package before native menu construction. Native backends receive resolved strings and do not parse localization JSON or own locale fallback rules.

The repository-owned OpenDesk product additionally owns the Native Language Menu. Stable locale actions are consumed by App Shell before ordinary JavaScript action dispatch, call the same Locale Core, persist the preference, and refresh only localization-owned native presentation.

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

persists the validated choice and immediately updates the manager's `resolvedLocale`. The Native Language Menu reuses exactly this operation; it does not own a second preference store or resolver.

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

The default preference file is resolved from the operating-system user config directory and stored under:

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

Invalid persisted values such as `ja-JP`, an empty value, an unknown value, or malformed JSON must not stop startup. They recover to `auto` and emit a stable preference diagnostic.

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

The language entry is deliberately discoverable in either UI locale:

```text
语言 / Language
├─ 自动（跟随系统） / System Default
├─ 简体中文
└─ English
```

Language names are self-identifying. The selected `localePreference` is represented by a presentation-only `✓` prefix; it does not change the stable action ID.

Third-party Apps own their package catalogs; they are not required to write keys into the official OpenDesk catalog.

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

with `{count: 3}` renders `共 3 项`.

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

Runtime menu refresh failures are also logged as localization diagnostics without converting a locale failure into a business action.

Diagnostics can include locale, key, fallback, path and error. Diagnostic codes are never localized. Repeated equivalent diagnostics are deduplicated in-process to avoid uncontrolled log spam.

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

Initial presentation uses:

```text
Manifest / framework semantic key
→ pkg/appshell ResolveMenuLabel
→ pkg/localization
→ resolved nativeMenuItem labels
→ macOS / Windows native backend
```

Native backends do not load catalogs and do not maintain locale fallback rules.

The official OpenDesk composed menu localizes framework-owned presentation (`Open`, `Recorder`, `Developer`, `Debug`, `Language`, `Help`, `Quit`, etc.) through the same Locale Core.

Native language switching uses stable machine IDs:

```text
opendesk.locale.auto
opendesk.locale.zh-CN
opendesk.locale.en-US
```

The runtime chain is:

```text
Native menu click
→ App Shell NativeHost localization adapter
→ SetLocalePreference()
→ durable persistence
→ resolve locale / catalog
→ refresh localization-owned native labels
```

Locale actions are consumed before ordinary business dispatch and are never forwarded to JavaScript for interpretation.

The official recursive `nativeMenuItem.Children` tree remains an implementation detail of the repository-owned OpenDesk product. L0 does **not** add generic public `children/submenu` fields to third-party App Manifest menus.

### Runtime state merge rule

Locale refresh changes presentation only. It must not reset runtime-owned state:

```text
enabled   preserved
visible   preserved
runtime-owned dynamic label preserved
debug mode selection preserved
```

For framework debug labels, the runtime-selected `Normal` / `Detailed` state is retained while the base label is retranslated. For other labels explicitly replaced by Runtime, locale refresh leaves that runtime-owned label untouched.

Windows rebuilds the visible menu from current presentation/state when the tray menu opens. macOS indexes stable leaf and product-submenu IDs so the existing native menu can update in place. No large event bus or second menu runtime is introduced.

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

Repository automated coverage includes:

- resolver mapping and unsupported fallback;
- preference default/set/reload/invalid persistence behavior;
- runtime preference changes updating resolved locale;
- current-locale catalog hits and product fallback hits;
- missing key, safe representation and interpolation;
- missing/malformed/invalid catalog fail-soft behavior;
- system-locale detection failure fallback;
- legacy `label`, `labelKey + label`, and `labelKey`-only manifest semantics;
- unknown localization fields remain rejected;
- stable business action IDs;
- official `Language` submenu and three stable locale actions;
- selected-preference presentation;
- runtime `zh-CN → en-US`, `en-US → zh-CN`, and explicit → `auto` switching through a fake NativeHost;
- locale actions do not reach the business sink;
- runtime-owned label, `enabled`, `visible`, and debug-mode state survive locale refresh;
- official release payload inclusion of both catalogs.

Repository/CI tests are code-level evidence. They are not a substitute for clicking the real native menu on macOS and Windows.

## 17. L0–L4 roadmap

### L0 — Localization Foundation + Native Language Menu

The repository implementation includes resolver, persistence, catalogs, Manifest `labelKey`, initial App Shell label resolution, fallback/diagnostics, official release packaging, the repository-owned Language submenu, stable locale actions and immediate native presentation refresh.

Remaining qualification gates before claiming L0 fully qualified are platform-live checks:

```text
macOS real build / real menu switching / restart persistence
Windows real build / real tray switching / restart persistence
official distribution payload inspection on both platforms
repair any platform-specific failures discovered by those checks
```

### L1 — Official Product UI Migration

Migrate official non-native surfaces onto the shared Locale Core, recommended order:

```text
AI Assistant chrome
Scheduler Center
Recorder UI
Permissions Center
Runtime Log
Developer Tools pages
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
Native language switching calls SetLocalePreference; it does not create another preference store.
macOS/Windows native owners consume resolved presentation rather than parse catalogs.
AI conversation language remains outside the UI locale contract.
```

## 19. Current implementation boundary

Current repository boundary:

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
Native Language submenu                   implemented
stable auto / zh-CN / en-US actions       implemented
runtime native menu refresh               implemented
runtime state preservation                implemented
automated App Shell switching coverage    implemented
macOS live switching qualification        pending
Windows live switching qualification      pending
```

Therefore the accurate status is:

> **L0 implementation complete; platform-live qualification pending.**

Do not describe macOS or Windows live switching as verified until the native build, click, restart-persistence and release-payload checks have actually run on those platforms.
