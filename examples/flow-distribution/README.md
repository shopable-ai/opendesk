# OpenDesk Flow distribution example

This directory is a small, readable `.odflow` example. It contains one JavaScript entry point and one packaged resource:

- `main.js` reads `assets/message.txt` through `Flow.resolve()`.
- `main.js` writes `result.json` to `Flow.dataDir` only when the installed Flow is explicitly run.

Installation is import-and-register only; it never executes the Flow. The user must first run `flow list` to find the returned `installId`, then explicitly call `flow run <installId>`.

## Build from the repository root

The following one-line command creates short-lived test signing material under `.runtime/`, builds a new `.odflow` under `.runtime/examples/flow-distribution/`, then deletes the private key. The private key is never placed in this example directory or in the archive:

```bash
mkdir -p .runtime/examples/flow-distribution/keys .runtime/examples/flow-distribution && openssl genpkey -algorithm Ed25519 -out .runtime/examples/flow-distribution/keys/publisher-private.pem >/dev/null 2>&1 && openssl pkey -in .runtime/examples/flow-distribution/keys/publisher-private.pem -pubout -out .runtime/examples/flow-distribution/keys/publisher-public.pem >/dev/null 2>&1 && ./dist/opendesk flow pack examples/flow-distribution -o .runtime/examples/flow-distribution/example.odflow --flow-id com.example.opendesk.flow-distribution --name "Flow Distribution Example" --version 1.0.0 --publisher-id com.example.opendesk.example-publisher --publisher-key-id example-ed25519-2026 --entry main.js --public-key .runtime/examples/flow-distribution/keys/publisher-public.pem --signing-key .runtime/examples/flow-distribution/keys/publisher-private.pem --platforms darwin,linux,windows --file main.js --file assets/message.txt && rm .runtime/examples/flow-distribution/keys/publisher-private.pem
```

The generated archive contains `flow.json`, `flow.sig`, `trust/publisher.pub`, `main.js`, and `assets/message.txt`. It does not contain the signing private key. The generated `.odflow` and public test key are runtime artifacts under `.runtime/`, which is intentionally not a source or distribution directory.

## Inspect, verify, install, and run

Run these commands from the repository root. They use an isolated app-data root so the example does not modify the normal OpenDesk catalog:

```bash
export OPENDESK_APP_DATA_DIR="$PWD/.runtime/examples/flow-distribution/app-data"
./dist/opendesk flow inspect .runtime/examples/flow-distribution/example.odflow
./dist/opendesk flow verify .runtime/examples/flow-distribution/example.odflow --public-key .runtime/examples/flow-distribution/keys/publisher-public.pem
./dist/opendesk flow install .runtime/examples/flow-distribution/example.odflow --trust-flow
./dist/opendesk flow list
```

Copy the `installId` returned by `flow install` or shown by `flow list`, then run it explicitly:

```bash
./dist/opendesk flow run <installId> --log-dir .runtime/examples/flow-distribution/run-logs
cat .runtime/examples/flow-distribution/app-data/flow-data/<installId>/result.json
./dist/opendesk flow uninstall <installId> --remove-data
```

Before `flow run`, `result.json` does not exist. The install command does not invoke `main.js`; only the explicit run command creates the business result. `--trust-flow` approves this package for the isolated example and does not establish publisher-wide trust.
