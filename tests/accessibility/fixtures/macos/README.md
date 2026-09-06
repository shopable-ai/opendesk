# macOS Accessibility fixture

This AppKit application is isolated test data for the native Accessibility
Runtime. It exposes stable accessibility identifiers, ambiguous names,
disabled/read-only/protected controls, writable text, check/radio state, a
dynamic child, and two- and three-level menus. A JSON state file records input
counts, so an acceptance test can distinguish acknowledgement from a real side
effect without touching user data.

From the repository root, build it with the OpenDesk JavaScript Runtime:

```bash
./dist/opendesk -script tests/accessibility/fixtures/macos/build.js -console-mode script -log-dir .runtime/tests/accessibility/fixture-build
```

Build and launch one owned fixture instance with:

```bash
./dist/opendesk -script tests/accessibility/fixtures/macos/launch.js -console-mode script -log-dir .runtime/tests/accessibility/fixture-launch
```

The app, PID, log, and state are written below
`.runtime/tests/accessibility/macos/`. The state includes `setValueCount` as
well as invoke/check/radio/menu counters. Stop only the PID recorded by the helper:

```bash
./dist/opendesk -script tests/accessibility/fixtures/macos/stop.js -console-mode script -log-dir .runtime/tests/accessibility/fixture-stop
```

Notable identifiers include `fixture.window.main`, `fixture.invoke`,
`fixture.duplicate.first`, `fixture.duplicate.second`, `fixture.disabled`,
`fixture.text.editable`, `fixture.text.readonly`, `fixture.text.protected`,
`fixture.checkbox`, `fixture.radio.one`, and `fixture.radio.two`. Menu
identifiers use the `fixture.menu.*` prefix. `Delayed Submenu` materializes its
child 200 ms after the submenu opens; `Reveal Dynamic Control` does the same for
`fixture.dynamic.child`.
