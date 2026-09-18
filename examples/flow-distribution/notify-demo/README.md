# Notify Demo

This public Flow example is intentionally small and low risk. The same `main.js` is used both as a raw JavaScript Flow and as the entry point of the packaged `notify-demo.odflow`.

When the Flow is explicitly run, it sends one OpenDesk system notification and writes one fixed console line. Installing the package never runs `main.js`.

> Install ≠ Run. Seeing a successful install only means the Flow was registered. The notification is allowed to appear only after an explicit Run.

The current canonical operating-system notification API is the global `notify()`. `ui.notify()` is a compatibility alias for `ui.toast()` and is intentionally not used here.

The generated `flow.json` uses the repository's strict .odflow v1 schema. That schema does not currently define description or capability/permission fields, and `notify()` does not require a separate Flow capability declaration, so this example does not invent any.

## JavaScript smoke test

1. Drag `main.js` into OpenDesk using the existing raw-JavaScript Flow import path.
2. Confirm the Flow is loaded/registered.
3. Explicitly click Run.
4. Confirm the system notification titled **OpenDesk Flow Example** appears and the console contains:
   `OpenDesk Notify Demo: notification requested after explicit run.`

The script does not write files, access the network, invoke shell commands, launch third-party apps, modify system settings, use secrets, or start background work.

## .odflow smoke test

1. Drag `notify-demo.odflow` into OpenDesk.
2. Complete the existing package/signature/trust/install flow.
3. Confirm Flow Runner shows **Notify Demo**.
4. Confirm that no Notify Demo notification appears merely because installation completed.
5. Explicitly click Run.
6. Confirm the same system notification and fixed console line appear exactly once.

Canceling install, signature/digest rejection, and a normal successful install must all leave `main.js` unexecuted. The stricter marker/malicious/throw-on-run fixtures under `tests/` remain the automated zero-execution proof; this example does not replace them.

## Rebuild with the official Flow builder

Run from the repository root. The signing key is ephemeral test material under `.runtime/`; no production key or committed private key is used.

```bash
rm -rf .runtime/examples/notify-demo && mkdir -p .runtime/examples/notify-demo/keys && openssl genpkey -algorithm Ed25519 -out .runtime/examples/notify-demo/keys/publisher-private.pem >/dev/null 2>&1 && openssl pkey -in .runtime/examples/notify-demo/keys/publisher-private.pem -pubout -out .runtime/examples/notify-demo/keys/publisher-public.pem >/dev/null 2>&1 && ./dist/opendesk flow pack examples/flow-distribution/notify-demo -o .runtime/examples/notify-demo/notify-demo.odflow --flow-id com.example.opendesk.notify-demo --name "Notify Demo" --version 1.0.0 --publisher-id com.example.opendesk.example-publisher --publisher-key-id example-notify-demo-ed25519-2026 --entry main.js --public-key .runtime/examples/notify-demo/keys/publisher-public.pem --signing-key .runtime/examples/notify-demo/keys/publisher-private.pem --platforms darwin,linux,windows --file main.js && ./dist/opendesk flow verify .runtime/examples/notify-demo/notify-demo.odflow --public-key .runtime/examples/notify-demo/keys/publisher-public.pem && unzip -p .runtime/examples/notify-demo/notify-demo.odflow flow.json > .runtime/examples/notify-demo/flow.json && rm .runtime/examples/notify-demo/keys/publisher-private.pem
```

The checked-in `notify-demo.odflow` is a convenience artifact for direct drag testing. Rebuilding with the command above produces a newly signed example package from the same `main.js`; because the development signing key is intentionally ephemeral, the publisher fingerprint changes on rebuild.
