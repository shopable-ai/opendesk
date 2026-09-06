# WeChat sidebar button template acceptance 20260906 r1

This directory is an isolated, immutable fixture bundle for the matching acceptance scripts whose names end in `20260906-r1`.

- `sources/message-selected-panel-880x640.png` contains selected Messages and unselected Contacts.
- `sources/contacts-selected-sidebar-62x290.png` contains unselected Messages and selected Contacts at the same image-pixel coordinates.
- `states/` stores ordered `[unselected, selected]` template pairs for those two controls.
- `buttons/` stores distinct templates for the remaining sidebar controls. Distinct buttons are always matched separately, never as state alternatives.
- `fixture-manifest.json` freezes dimensions, crop bounds, ordering, source provenance, and SHA-256 identities.

`generate-fixtures-20260906-r1.js` was used once to copy the two source images and crop every template through documented `File.copy`, `ImageColor.clip`, and `ImageColor.save` Runtime APIs. Before writing, it verifies both source dimensions and SHA-256 identities. It checks every destination and refuses to overwrite any existing file; after generation it verifies all 12 output digests. It is not part of routine test execution.

From the repository root, run the deterministic JavaScript Runtime API scenario with:

```bash
./opendesk -script tests/runtime-api/image-color-wechat-sidebar-button-template-acceptance-20260906-r1.js -console-mode script
```

Run the real Custom UI inspection window with:

```bash
./opendesk -ui -script tests/runtime-api/image-color-wechat-sidebar-button-template-visual-acceptance-20260906-r1.js -console-mode script
```

The static scenario verifies all 12 fixture SHA-256 identities, exact crop integrity, full-source/ROI result equality, image-global hit coordinates, state `templateIndex`, opposite-state rejection, safe action ordering, and reduced ROI search space. For each distinct button it records any cross-row candidate at the real-screen starting threshold `0.95`, then proves separation at a fixture-calibrated threshold no lower than `0.95`; production use must still keep the button-specific row ROI. A local UI adapter seam verifies selected/no-op, unselected/single-tap/reclassify, unknown/fail-closed, and unchanged-postcondition behavior without invoking a real desktop input API.

The Custom UI window displays the same fixture, state, ROI, actual-hit, center-point, cross-row calibration, and pass/fail evidence for manual review. It performs no WeChat or desktop click; closing its own acceptance window only ends the test execution.
