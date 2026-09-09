# Vendored libuiohook

OpenDesk vendors the upstream `kwhat/libuiohook` 1.2.2 source used by the
Recorder native input adapter. The source is compiled into the OpenDesk binary;
Recorder does not search `PATH` or download a library at runtime.

- Upstream: `https://github.com/kwhat/libuiohook`
- Tag: `1.2.2`
- Commit: `23acecfe207f8a8b5161bec97a8a6fd6ad0aea88`
- Upstream archive SHA-256 (canonical `git archive` bytes):
  `ef564f09730af0bc30e4d965dac82c536bca837fcba78ddbca7744368d7b233a`
- Public header SHA-256:
  `61f3039ccf6c49e894c4ef326c38165eb422d868429e328f3cccaad9abc74651`
- License: GNU Lesser General Public License v3 or later. See
  `COPYING.LESSER.md` and `COPYING.md`.

Only the public header, logger, and platform implementation sources required by
the OpenDesk build are copied here. `automation/recorder_uiohook_bridge.c` is the
single OpenDesk adapter; the upstream platform hooks are not forked.
