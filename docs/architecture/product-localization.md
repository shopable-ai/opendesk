# OpenDesk Product Localization Architecture

> Status: design approved; L0 implementation pending  
> Scope: OpenDesk product UI, App Manifest, App Shell / Tray, official applications, Custom UI / App packages, locale-sensitive presentation, localization qualification  
> Stage naming: this document uses **L0–L4** (`Localization Stage 0` through `Localization Stage 4`) to avoid confusion with the repository's existing `P0` product/contract priority terminology.  
> Related: [App Package Format](app-package-format.md), [App Shell、Tray / Menu Bar 与 Single-Instance 设计](app-shell-tray-menu.md)

## 1. Decision

OpenDesk adopts a single product-level localization architecture:

```text
OS locale + user locale preference
                ↓
          Locale Resolver
                ↓
          resolvedLocale
                ↓
        Locale Catalog Loader
                ↓
          t(key, params)
                ↓
┌─────────────────────────────────────┐
│ App Manifest / Tray / Native Menu   │
│ Official product UI                 │
│ App / Plugin / Custom UI adapters   │
└─────────────────────────────────────┘
```

Localization is not implemented as page-specific `if (locale === ...)` branches and is not limited to HTML pages.

The first executable stage is **L0: Localization Foundation**, which must close an end-to-end `zh-CN` / `en-US` loop through Locale Core, App Manifest and Tray / Menu before broad product-string migration begins.

## 2. Goals

The architecture must make these outcomes normal:

- the default locale can follow the operating system;
- a user can explicitly select a supported locale and keep that choice after restart;
- Native Tray / Menu and product UI consume the same locale decision;
- user-facing copy is referenced by stable semantic keys;
- machine-facing contracts remain stable and language-independent;
- adding a new language is primarily catalog translation and qualification work rather than business-code modification;
- official OpenDesk UI and third-party Apps can share locale resolution without sharing translation ownership;
- missing or invalid localization resources degrade predictably and remain diagnosable.

## 3. Non-goals

The localization system must not become:

- a second application framework;
- a new Recipe or Runtime execution model;
- a remote translation CMS in L0;
- a reason to introduce a large i18n dependency into Runtime;
- a mechanism that translates action IDs, APIs, CLI arguments, Recipe semantics or diagnostic codes;
- a mechanism that forces AI response language to follow UI language;
- a requirement to translate the entire repository in one migration.

## 4. Terminology

### 4.1 `localePreference`

The user's persisted choice.

L0 supports:

```text
auto
zh-CN
en-US
```

The value is intentionally separate from the active locale.

### 4.2 `resolvedLocale`

The actual locale selected after resolving the user preference, OS locale, supported locales and fallback rules.

Examples:

```text
localePreference = auto
OS locale = zh-CN
resolvedLocale = zh-CN
```

```text
localePreference = en-US
OS locale = zh-CN
resolvedLocale = en-US
```

### 4.3 Locale catalog

App-owned mapping from stable semantic keys to user-facing messages for one locale.

Example keys:

```text
menu.assistant
menu.schedulerCenter
menu.newSchedule
menu.permissions
menu.runtimeLog
menu.examples
menu.apiDocs
menu.quit
```

The source-language sentence itself must not be used as the key.

## 5. Stable machine contracts are never translated

The following remain language-independent:

```text
Action IDs
Menu IDs
App IDs
Manifest field names
JavaScript API names
Runtime API names
Recipe structure and semantics
Error codes
Structured status values
Diagnostic field names
CLI arguments
Internal protocol fields
```

For example these remain unchanged regardless of UI locale:

```text
assistant.open
scheduler.center
scheduler.new
permissions.open
runtime.log
opendesk.examples
```

Only human-facing presentation is localized, such as labels, titles, descriptions, placeholders, button text, menu text, toasts, empty states, help copy and user-facing error messages.

## 6. Locale resolution

Locale resolution follows a deterministic order:

```text
explicit user preference
→ supported exact locale
→ supported language-family fallback where explicitly defined
→ product default locale
```

When `localePreference = auto`, the resolver starts from the operating-system locale.

L0 minimum behavior:

```text
zh-CN       → zh-CN
zh-Hans-CN  → zh-CN
en-US       → en-US
en-GB       → en-US when en-US is the only supported English locale
unknown     → product default
```

`zh-TW` must not be described as equivalent to `zh-CN`. If a Traditional Chinese locale is not yet supported, any fallback is a compatibility fallback only and must be documented as such.

Locale normalization should follow BCP 47 conventions where practical. The resolver must be deterministic and covered by tests.

## 7. Locale Core

The product needs a small localization core, not a large framework.

The internal semantic surface should cover at least:

```text
getLocalePreference()
getResolvedLocale()
setLocalePreference(...)
resolveLocale(...)
t(key, params?)
```

Exact names and module ownership may follow the current Runtime/App architecture. L0 does not require publishing these as new public Runtime APIs if they are only product-internal concerns.

Locale Core responsibilities:

```text
Locale Resolver
Catalog Loader
Message lookup / interpolation
Fallback
Missing-key diagnostics
Date / number / relative-time formatting adapters
Preference persistence integration
```

Locale-sensitive formatting should use standard JavaScript facilities where possible:

```text
Intl.DateTimeFormat
Intl.NumberFormat
Intl.RelativeTimeFormat
```

OpenDesk should not hand-build its own date and number format database.

## 8. Catalog ownership and layout

Official OpenDesk strings are owned by the official OpenDesk App.

Recommended scalable layout:

```text
apps/opendesk/locales/
├─ zh-CN/
│  ├─ common.json
│  ├─ menu.json
│  ├─ assistant.json
│  ├─ scheduler.json
│  ├─ recorder.json
│  └─ ...
└─ en-US/
   ├─ common.json
   ├─ menu.json
   ├─ assistant.json
   ├─ scheduler.json
   ├─ recorder.json
   └─ ...
```

A simpler `zh-CN.json` / `en-US.json` layout is acceptable for the first implementation if the loader and key namespace can grow without contract breakage.

Rules:

- keys describe semantics, not source wording;
- changing displayed wording must not require changing action IDs or business contracts;
- duplicate product-specific localization systems must not be created per page;
- catalogs belong to their App/package owner.

## 9. App Manifest localization

Localization must work before or while the App Shell builds Native Tray / Menu. It cannot be an HTML-only feature.

The intended menu direction is:

```json
{
  "id": "open-scheduler-center",
  "labelKey": "menu.schedulerCenter",
  "action": "scheduler.center"
}
```

instead of treating the Chinese or English display string as the stable contract.

An App may declare localization metadata such as a default locale and locale-resource location. The exact schema must be frozen against the current package loader and strict schema rules during L0 implementation.

### 9.1 Compatibility requirement

Existing manifests that only contain `label` must keep working.

The intended resolution order is:

```text
labelKey exists
→ current locale catalog
→ fallback locale catalog
→ legacy inline label when present
→ safe diagnostic representation / key
```

Missing translation resources must not make an otherwise compatible application impossible to start unless the manifest/resource contract itself is invalid in a way explicitly defined by the schema.

If `labelKey` or top-level localization metadata changes the formal Manifest schema, `app-package-format.md`, the loader/validator and its qualification tests must be updated together.

## 10. Tray / Native Menu integration

Tray / Menu is the first mandatory end-to-end consumer because it is native product UI and currently derives initial business-menu labels from the App Manifest.

L0 success means:

```text
OpenDesk starts
→ localePreference is loaded
→ Locale Resolver chooses resolvedLocale
→ App catalog is loaded
→ native Tray/Menu labels are resolved
→ menu Action IDs remain unchanged
```

Changing the locale may rebuild the native menu if in-place mutation is not appropriate. L0 does not justify creating a large event bus only for localization.

The framework-owned system items such as Open / Quit and manifest-owned business items must eventually follow the same active locale, while retaining separate ownership of action semantics.

## 11. Preference persistence

Language preference is durable user configuration, not a build constant or test-only environment variable.

Expected behavior:

```text
User selects en-US
→ localePreference is persisted
→ product/native UI is refreshed or rebuilt
→ OpenDesk exits
→ OpenDesk starts again
→ en-US remains selected
```

If OpenDesk does not yet have a suitable general Settings surface, L0 may implement the persistence and a minimal testable switching path first. A full Settings Center must not be invented solely for localization.

## 12. Fallback and failure handling

The following cases must be explicitly tested:

- key exists in current locale;
- key only exists in fallback locale;
- key exists in neither locale;
- locale catalog file is absent;
- locale catalog JSON is malformed;
- persisted preference names a locale no longer supported;
- OS locale is unknown;
- App uses legacy inline `label` only;
- App uses `labelKey` plus legacy `label` fallback.

Fallback must be predictable. Localization failures should not silently route to another business action or mutate stable machine contracts.

## 13. Missing-key diagnostics

Missing localization data must be diagnosable with stable machine-readable context, for example:

```text
I18N_MISSING_KEY
locale=en-US
key=menu.someThing
fallback=zh-CN
```

Production logging should avoid uncontrolled repeated noise; repeated missing-key diagnostics may be deduplicated.

Diagnostic codes and fields remain stable English/machine identifiers even when the product UI is localized.

## 14. Error localization boundary

Runtime/controller layers should prefer stable structured errors:

```json
{
  "code": "OFFICIAL_ACTION_UNAVAILABLE",
  "params": {
    "action": "opendesk.marketplace"
  }
}
```

A presentation layer may render the corresponding user-facing message with the current locale.

Logs retain the stable error code and structured context.

Localization work must not trigger a repository-wide rewrite of all historical errors during L0. Only the paths required by the active localization stage should be migrated.

## 15. UI locale is not AI conversation language

OpenDesk treats product UI language and AI conversation language as independent concerns.

Examples:

```text
UI = en-US
User writes Chinese
AI may answer Chinese
```

```text
UI = zh-CN
User explicitly asks for English
AI should answer English
```

Changing UI locale must not inject a hidden instruction forcing AI responses into that locale.

Only OpenDesk-owned presentation text around the conversation follows product locale.

## 16. Third-party App / Plugin boundary

Every App/package owns its own translation catalog and namespace.

Do not require a third-party App to add keys to the official OpenDesk catalog.

Target ownership:

```text
OpenDesk official catalog
→ owned by official OpenDesk App

Third-party App catalog
→ owned by that App/package

Runtime/App Shell
→ resolves locale and loads the package's declared resources
```

This keeps package distribution independent and prevents global key collisions.

## 17. Custom UI direction

Custom UI should eventually receive or resolve the current product/App locale through a small adapter rather than inventing another locale-selection system.

L0 does not require migrating every Custom UI page. The contract must, however, avoid making Native UI and HTML UI choose independent active locales.

## 18. Qualification strategy

Localization qualification should grow with the stages and eventually include:

- resolver unit tests;
- catalog load/fallback tests;
- Manifest compatibility tests;
- native Tray/Menu label tests;
- preference persistence tests;
- translation-key completeness checks;
- orphan-key checks where useful;
- hard-coded user-facing-copy checks on migrated surfaces;
- pseudo-locale visual qualification;
- platform-specific UI overflow/truncation checks;
- release-language completeness gates.

The goal is not 100% automated translation quality. The goal is preventing contract regressions, missing resources and obvious UI breakage.

## 19. Localization roadmap: L0–L4

`L0–L4` are implementation stages, not product severity/priority labels.

### L0 — Localization Foundation

**Goal:** prove the architecture with the smallest real native-product loop.

Required scope:

```text
localePreference / resolvedLocale
Locale Resolver
Catalog Loader / t()
zh-CN + en-US
preference persistence
App Manifest localization contract
legacy label compatibility
Tray / Native Menu localization
fallback + missing-key diagnostics
core tests
architecture documentation
```

Primary acceptance:

- `auto` follows a supported OS locale;
- explicit `zh-CN` and `en-US` work and persist;
- Tray/Menu labels switch while action IDs do not;
- old manifests containing only `label` remain valid;
- missing localization data degrades predictably;
- relevant tests/builds pass.

**Not part of L0:** translating every OpenDesk window.

### L1 — Official Product UI Migration

**Entry condition:** L0 contracts and Tray/Menu behavior are stable.

**Goal:** move official user-facing surfaces onto the shared Locale Core.

Recommended migration order:

```text
Official Shell
AI Assistant shell/chrome
Scheduler Center
Recorder
Permissions Center
Runtime Log user-facing UI
Developer Tools
Measurement Session
other official product surfaces
```

L1 must remove migrated surfaces' duplicate locale logic and hard-coded user-facing strings where practical.

AI conversation language remains independent.

L1 qualification includes per-surface `zh-CN` / `en-US` checks, common dialog/toast/error copy and layout regression review.

### L2 — App / Plugin / Custom UI Localization Contract

**Entry condition:** official-product migration has validated the core model.

**Goal:** make localization a supported package/app capability rather than an official-App special case.

Expected scope:

```text
formal App-owned catalog contract
resource ownership and containment rules
Custom UI locale adapter
plugin/app namespace isolation
public authoring documentation
sample localized App
package qualification fixtures
pseudo-locale support for developers
CI checks for missing keys / incompatible catalogs
```

L2 must not force third-party Apps to write into OpenDesk official translation resources.

### L3 — Language Expansion and Translation Operations

**Entry condition:** adding a language no longer requires product architecture changes.

**Goal:** expand market languages and establish maintainable translation operations.

Candidate languages are selected by actual market/customer need. Likely examples include:

```text
ja-JP
zh-TW
ko-KR
de-DE
fr-FR
es-ES
```

L3 covers:

```text
real language catalogs
terminology/glossary ownership
translation review workflow
release completeness checks
locale-specific date/number/relative-time validation
layout expansion review
fallback policy for language families
```

Adding a language at L3 should primarily mean catalog + translation + qualification, not modifying each business module.

### L4 — Advanced Localization and Release Qualification

**Entry condition:** multiple production locales are shipping reliably.

**Goal:** close advanced internationalization requirements based on demonstrated need.

Possible scope:

```text
RTL / bidirectional UI when required
advanced plural/select message formatting
locale-specific typography and font fallback validation
keyboard/accessibility localization review
localized installer / release metadata where applicable
localized help/docs/web surfaces where commercially justified
translation provenance/versioning
screenshot/pseudo-locale visual regression
full release-language qualification matrix
```

L4 is demand-driven. OpenDesk must not build every possible localization feature before a real target language or market needs it.

## 20. Stage transition rule

Do not start the next stage merely because the previous stage has code committed.

A stage is considered ready to advance when:

```text
its stable contracts are documented
its acceptance tests are passing where the current environment can run them
known platform-live gaps are explicitly separated from code defects
the next stage can reuse the previous stage instead of duplicating it
```

In particular:

```text
L0 must not be bypassed by directly translating every page.
L1 must not invent per-page localization frameworks.
L2 must not be designed around one official App only.
L3 must not require new business-code branches for each language.
L4 must remain demand-driven.
```

## 21. Recommended implementation sequence for L0

```text
1. Re-read current master HEAD and relevant App/Runtime code.
2. Locate the authoritative manifest schema/validator and native Tray/Menu consumer.
3. Locate the authoritative product preference persistence mechanism.
4. Freeze the minimal localization Manifest contract.
5. Implement Locale Resolver and catalog loading.
6. Add zh-CN and en-US official catalogs.
7. Add labelKey support with legacy label compatibility.
8. Migrate official OpenDesk Tray/Menu labels.
9. Persist localePreference and refresh/rebuild native menu on change.
10. Add fallback and missing-key diagnostics.
11. Add resolver/catalog/manifest/tray/persistence tests.
12. Update app-package-format.md and app-shell-tray-menu.md when their formal contracts change.
13. Run available unit, contract, build and platform qualification.
14. Record environment-only/live-platform gaps separately from code defects.
```

## 22. L0 acceptance contract

L0 is complete only when all applicable statements are true:

```text
✓ zh-CN is supported
✓ en-US is supported
✓ auto resolves the OS locale predictably
✓ explicit locale preference persists
✓ native Tray/Menu consumes localization resources
✓ App Manifest supports stable labelKey semantics
✓ legacy label-only manifests remain compatible
✓ action IDs and other machine contracts do not change with locale
✓ fallback is deterministic
✓ missing keys are diagnosable
✓ malformed/missing optional localization data does not create uncontrolled startup failure
✓ UI locale does not control AI conversation language
✓ tests pass in available environments
✓ formal architecture/package/tray documentation reflects the implemented contract
```

## 23. Future language addition contract

Once L2/L3 is reached, adding a normal left-to-right language should ideally require only:

```text
new locale catalog
translation/review
locale registration/support declaration
qualification
```

If adding a conventional new language still requires editing Recorder, Assistant, Scheduler, Tray and other business modules independently, the localization architecture has not reached its intended maturity.

## 24. Current implementation boundary

At the time this document is introduced, the design is approved but L0 should be treated as pending until the repository implementation, tests and relevant platform verification demonstrate the acceptance contract above.

This document is the long-lived architecture source of truth. Implementation sessions may update it when a verified contract changes, but should not create competing localization architecture documents for individual product surfaces.
