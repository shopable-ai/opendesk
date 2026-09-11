# Window platform diagnostics

This directory contains maintainer-oriented manual diagnostics for native window behavior. They are not public Examples and are not listed by OpenDesk Examples.

- `capabilities.js`: records window capability metadata and basic read availability.
- `macos-window-actions.js`: exercises macOS window actions against the active test window.
- `macos-visible-actions.js`: visibly minimizes/restores/moves the active test window and sends pointer/keyboard input.
- `macos-smoke.js`: historical macOS window smoke coverage.

These scripts can affect the active desktop. Use only with disposable test windows and do not treat a successful run as the formal Runtime API gate.
