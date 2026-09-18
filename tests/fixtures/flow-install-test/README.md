# OpenDesk Install Test fixture

This is the reusable, non-secret business payload for Flow installation qualification.

Contract:

- packaging / verification / installation must not execute `main.js`;
- only an explicit Flow Runner / `flow run` action may execute it;
- execution writes only inside `Flow.dataDir`:
  - `install-test.marker`
  - `result.json`
  - `run.json`
- `install-test.marker` contains exactly:
  `OpenDesk Install Test: explicit run succeeded`.

The signed `.odflow` is generated per qualification run with an ephemeral Ed25519 key. No production key or committed private key is required.
