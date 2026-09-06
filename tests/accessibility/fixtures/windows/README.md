# Windows Accessibility fixture

This Win32 application is the Windows counterpart of the AppKit fixture. It
uses standard controls so Windows UI Automation exposes typed control patterns;
numeric Win32 control IDs are stable UIA AutomationIds. It includes unique and
duplicate buttons, a disabled button, editable/read-only/protected edit fields,
checkbox and radio controls, nested menus, duplicate menu names, and a submenu
whose final child is inserted 200 ms after the submenu opens.

From the repository root, cross-compile the x86-64 executable with:

```sh
./tests/accessibility/fixtures/windows/build.sh
```

The executable is written to
`.runtime/tests/accessibility/windows/OpenDeskAccessibilityFixture.exe`.
Windows live execution is intentionally a separate target-system acceptance
step; a macOS cross-build is not reported as Windows Runtime evidence.

Run the executable from the repository root on Windows as follows; its JSON
counter file remains test-only data:

```powershell
.\.runtime\tests\accessibility\windows\OpenDeskAccessibilityFixture.exe --state .runtime\tests\accessibility\windows\state.json
```

Control AutomationIds are `101` (invoke), `102` and `103` (duplicate), `104`
(disabled), `105` (editable), `106` (read-only), `107` (protected), `108`
(checkbox), and `109`/`110` (radio). Menu command IDs occupy `201` through
`208`. The JSON state records action counts (including `setValueCount`) and current values without touching
real applications or user data.
