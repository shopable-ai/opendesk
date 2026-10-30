# Trusted local business adapters

Requires **Node.js 22 or newer** and the example's installed dependencies (including esbuild). From the **repository root**, run this offline example (choose a fresh output filename each run):

```sh
node examples/ai-customer-support/scripts/sync-business.mjs --adapter examples/ai-customer-support/integrations/demo-adapter.mjs --store store-demo --source crm --out .runtime/business-sync/multistore-v1.json
```

The parent prints one JSON receipt with a fixed code and, on success, a repository-relative output path. It prints no records, cursors, adapter IDs, raw exceptions, stacks, or hook console output. Files are private (`0600`), limited to 1 MiB of UTF-8 serialized JSON, and published atomically without replacing any existing destination. Output must be a `.json` file beneath this repository's `.runtime/`; existing directory symlinks and output symlinks are rejected. Paths are resolved against the current working directory. Directories are created as needed. Do not relocate/replace output directories concurrently with a sync run.

Advance the demo by passing `--cursor demo-v1` with a fresh `--out .runtime/business-sync/multistore-v2.json`; it returns `demo-v2` and version 2 records. Passing `--cursor demo-v2` again returns the identical version 2 records and cursor. Omitting the cursor starts at version 1. Unknown demo cursors fail. The fixture uses entirely fictional `crm-product-1`, `crm-customer-1`, `crm-order-1`, and `crm-image-1` identities, one requested store/source, and no live conversation mapping.

The UI owns cursor checkpoints. A CLI receipt means **prepared**, never **applied**. The CLI stores no cursor state. `previousCursor` is exactly the requested cursor (`null` when omitted). Only a fully successful output contains the new cursor. Import the snapshot into the UI data workspace for preview, then apply it explicitly. CLI validation is the domain's standalone `parseBusinessSnapshot` contract; the UI preview additionally checks foreign references, local conflicts, identity, versions, and cursor continuity against its workspace. A successful CLI run does not prove an import will apply. Run one source page sequentially: every referenced entity must be in that page or already exist in the UI workspace. Apply each page successfully before using its cursor for the next page; this is not an atomic transaction spanning all upstream pages.

## Adapter contract

Name a local `.mjs` file explicitly with `--adapter <path>`; no default adapter discovery, remote modules, or uploaded scripts are executed by the CLI. Export this object as its default export:

```js
export default {
  id: 'my-crm',
  async pull(context) {
    // context = Object.freeze({ storeId, sourceId, cursor: null | string })
    // Read credentials explicitly from the external host environment here.
    // Fetch only from a fixed approved endpoint using read-only credentials.
    // Map upstream IDs into stable IDs scoped to this store/source.
    return { cursor: 'upstream-page-2', records: [] };
  },
  async normalize(record, context) {
    // Optional. Return each normalized entity; never discard/reorder implicitly.
    return record;
  },
  async afterSync(summary) {
    // Optional count-only observer AFTER validation, BEFORE file publication.
    // Object.freeze({ product, order, image, customer, deleted, total })
    // Throw to veto publication. This hook does not mean the UI applied data.
  },
};
```

The `id` and requested store/source IDs are 1–128 ASCII letters/digits/dots/underscores/hyphens, starting with a letter or digit. A requested cursor is a nonempty string of at most 512 characters without control characters. `pull` is required; `normalize` and `afterSync` are optional. All stages may return promises. Normalization runs sequentially for every record before domain validation. The observer receives only frozen counts, with no entity data, IDs, credentials, or cursors. The serialized snapshot is fixed before the observer runs, so mutations to retained records cannot change the eventual output. Observer exceptions prevent output and cursor publication, although external observer side effects cannot be rolled back.

The output contract is:

```js
{
  schemaVersion: 1, storeId, sourceId,
  previousCursor: null /* or requested string */, cursor: 'next-cursor',
  records: [{
    storeId, sourceId, kind: 'product', // product | order | image | customer
    id: 'stable-id', version: 1, updatedAt: '2026-10-30T00:00:00.000Z',
    deleted: false, data: { /* exact kind-specific domain fields */ }
  }]
}
```

Tombstones use `deleted: true` and `data: null`. Use the canonical types and validation in `../src/domain/business.ts`; do not put secrets in any entity field. Currency is fixed CNY under the current legacy domain: `order.amount` is a nonnegative yuan number with at most two decimal places; it is not a general multi-currency API. Product data includes all Product fields (`id`, `sku`, `name`, `category`, `price` as a validated `¥39.90` CNY display string, `model`, `summary`, `specs`, `images`, `imageType`, `color`, `source`, `updated`). The demo shows complete customer, order, and optional image records. Records must all match the requested store and source. Unknown fields and malformed payloads fail the whole batch.

## Execution and credential boundaries

`--timeout-ms` defaults to 10000 and accepts integers from 100 through 60000. The deadline covers validator loading, adapter import, pull, normalization, serialization, validation, and the observer. The parent independently revalidates worker DTOs with the same domain parser and binds store/source/previousCursor to the request before publishing. Raw worker stdout/stderr are discarded with a combined 64 KiB budget; excess output terminates the run with `WORKER`. The parent terminates the worker on success, failure, crash, or timeout, including synchronous infinite loops. Timeout or failure publishes no file. Existing destinations always fail; concurrent publishers cannot overwrite one another. Failed publication can leave newly created directories; temporary output files are removed on ordinary completion/failure.

**This is fault isolation, not a security sandbox.** Trusted modules have full Node authority: filesystem, network, environment credentials, subprocesses and their side effects. They can bypass console suppression, deliberately send forged worker messages, spawn child processes, modify files, or make remote writes. Worker termination does not terminate independently spawned subprocesses or undo remote effects. Symlink checks and no-clobber publication protect ordinary CLI use; they do not defend against malicious trusted code or hostile concurrent filesystem mutation. Review adapter code and dependencies before executing it.

“Pull-only” describes this CLI's interface and the intended adapter operation; it cannot enforce remote read-only behavior. Provide narrowly scoped read-only credentials outside the browser and snapshots, approve endpoint allowlists in adapter code, bound pagination/HTTP response sizes and request deadlines, and prohibit production mutations in adapter implementations. The parent discards worker stdout/stderr and emits fixed failure codes, but hooks must not deliberately leak secrets through filesystem/network side channels or snapshot fields. No live CRM, OAuth, entitlement, production writeback, or message sending is implemented or verified here.

The demo adapter itself is offline. Integration tests additionally exercise a custom HTTP adapter against an actual ephemeral loopback HTTP server with fictional data and an environment credential. That proves the extension's HTTP path locally; it does not prove connectivity or schema mapping for any real CRM.

Run the real CLI integration tests from the repository root:

```sh
node --test examples/ai-customer-support/tests/business-sync.test.mjs
```

## Generic JSON / HTTP read-only examples (P4)

These examples use the same CLI and domain validator, with no new dependencies.
They are **trusted local Node code, not a sandbox**. They do not call Runtime APIs,
start the desktop app, configure UI persistence, or apply snapshots automatically.

From the **repository root**, run the default offline JSON adapter (use a fresh
output name on reruns):

```sh
node examples/ai-customer-support/scripts/sync-business.mjs --adapter examples/ai-customer-support/integrations/generic-json-adapter.mjs --store store-demo --source generic-crm --out .runtime/business-sync/generic-page-1.json
```

After previewing and successfully applying that page in the UI, prepare page 2:

```sh
node examples/ai-customer-support/scripts/sync-business.mjs --adapter examples/ai-customer-support/integrations/generic-json-adapter.mjs --store store-demo --source generic-crm --cursor generic-page-1 --out .runtime/business-sync/generic-page-2.json
```

`--cursor generic-page-2` returns an empty terminal page with the same cursor.
Unknown offline cursors fail. `fixtures/generic-page-*.json` are sanitized,
fictional upstream data: the first page contains product/customer/image, the
second contains an order referring to the first page. No real customer, endpoint,
credential, or conversation mapping is included. These are maintained example
fixtures; run output belongs under `.runtime/` (already ignored by the repository).

### Mapping and pagination

`generic-page.mjs` maps this explicit example protocol, shared by JSON and HTTP:

```js
{ request_cursor: null /* or exact requested string */,
  next_cursor: 'opaque-next-cursor',
  rows: [{ type: 'customer', external_id: 42, revision: 1,
    modified_at: '2026-10-30T00:00:00.000Z', deleted: false,
    fields: { display_name: 'Fictional customer' } }] }
```

Every invocation reads **one page only**, at most 100 rows and 64 KiB UTF-8 JSON.
`request_cursor` must match exactly; `next_cursor` must be nonempty, at most 512
characters, without controls. An unchanged cursor requires an empty page. Cursors
are opaque checkpoint data and must never carry credentials or PII. The adapter
neither follows a next-page URL nor loops over pages, saves checkpoints, retries,
or sorts/discards rows. Respect the CLI/UI sequential-apply contract above.

IDs become `<kind>-<SHA256([sourceId, kind, trimmed upstream ID])>`; nonnegative
safe integer IDs and their decimal strings map identically. Case and punctuation
are preserved in the hash input, preventing lossy punctuation replacement.
Store ownership stays on the entity wrapper; source is included in the hash
because domain identity is store/kind/id. References use the same mapping.
Changing source or this ID policy creates new identities; keep both stable.
This hashing is identity normalization, not anonymization of real personal data.

Fields are copied explicitly, never spread from upstream objects. Names/SKUs are
trimmed; `price_fen` and `total_fen` require nonnegative safe integers and become
CNY display price/yuan amount. Orders map pending/paid/shipped/complete/cancelled
to the domain statuses; unknown statuses fail. Use the fixtures as the complete
field map. Product styling is a fixed example bag illustration, specs/tags/notes
are empty, customer conversationId is null, image dataUrl is null. Remote images,
CRM notes, emails, and arbitrary metadata are not imported. `deleted: true`
produces a tombstone (`data: null`) with the same normalized ID. Invalid fields,
duplicate IDs, dates or domain payloads fail the entire page. The canonical
parser remains the final authority; the UI additionally validates references.

### HTTP host configuration and boundaries

`generic-http-adapter.mjs` is an alternative adapter, never the default. It uses
only GET and the same upstream page protocol. Production HTTPS endpoint allowlist
`APPROVED_HTTPS_ENDPOINTS` is intentionally empty. A developer must review the
upstream protocol, authorization scope, privacy, and exact endpoint, then edit
that constant in code. No environment variable can expand the production
allowlist. Keep allowed production endpoints HTTPS, without URL credentials,
query or fragment; redirects are always rejected (including same-origin ones).

Host-only environment configuration:

| Variable | Purpose |
| --- | --- |
| `BUSINESS_HTTP_ENDPOINT` | Exact endpoint approved in adapter code |
| `BUSINESS_HTTP_TOKEN` | Read-only bearer credential from the trusted host environment |
| `BUSINESS_HTTP_ALLOW_LOOPBACK=1` | Explicit test opt-in for HTTP IP literals `127.0.0.1` or `[::1]`, only path `/records` |

Loopback is a local test exception, not a production endpoint configuration.
Do not use `localhost` aliases, URL credentials, query secrets, or an arbitrary
endpoint path. The adapter adds only `store`, `source`, `limit=100`, and optional
`cursor` query parameters. It sends the credential only in `Authorization`.
Supply real credentials through your host's secret environment mechanism; do not
paste them into CLI arguments, fixture JSON, UI configuration, snapshots or logs.
Do not import these adapters into the browser. They never return environment or
HTTP diagnostics. Credential echoes in decoded response strings/keys or mapped
DTOs veto publication, including JSON-escaped echoes. That guard is not general
PII redaction: review all explicitly mapped upstream data before production use.

Each HTTP pull has a 1500 ms deadline covering headers and the entire streamed
body, a 64 KiB response cap (declared and streamed/decompressed bytes), JSON media
type validation, no redirects, and no retries. The CLI's separate `--timeout-ms`
(default 10000) also covers adapter import, normalization and validation. Failures
return the CLI's fixed `HOOK_FAILED`/`SCHEMA`/`TIMEOUT` code with no output file;
raw status bodies, endpoint exceptions, stacks and bearer values are not logged.
The worker is not a sandbox and cannot protect against malicious adapter code.
No live CRM endpoint or production authorization was verified.

From the **repository root**, run real CLI + ephemeral loopback tests:

```sh
node --test examples/ai-customer-support/tests/business-adapters.test.mjs
```

The test creates and closes only its own ephemeral IP-loopback listeners. It
passes a fictional host token, checks one GET per page and cursor parameters,
sequential domain imports, tombstones, endpoint rejection, redirects, malformed
or oversized responses, stalled headers/body, and no credential-bearing snapshot
or CLI output. Temporary test artifacts stay under
`.runtime/tests/ai-customer-support/`. Existing desktop/services are untouched.
