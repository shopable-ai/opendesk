# Flow Runner controller

This directory contains the reusable Flow Runner controller, compact player, and global-shortcut decorator used by the OpenDesk product.

- `controller.js` owns Runnable Entry discovery, ordering, selection, list management, Run/Stop and Flow Catalog integration.
- `player-controller.js` adds the compact high-frequency player.
- `shortcut-controller.js` owns state-scoped Run/Stop shortcuts.

A Runnable Entry may be a JavaScript `.js`/`.mjs` file, an `.odpkg` Protected Package, or an Installed Flow. Keep JavaScript path and `-script` terminology where it identifies the real Runtime payload; use `entry`/`entries` for cross-type state.

The product composition lives in `../flow-runner.js`. It supplies `runnableRoot`, creates the App-owned execution bridge, and publishes `OpenDeskProductFlowRunner`.

`apps/opendesk/script-runner-v1/` is a legacy / frozen historical implementation and is not imported by this directory or the product entrypoint.
