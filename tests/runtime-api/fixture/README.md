# Runtime API browser fixture

`index.html` and `server.py` form the local browser page/loopback server used
by Runtime API contract and live-composition tests. The singular directory name
is retained because `scripts/test_runtime_apis.js` consumes this exact
domain-local path; it is not a generic repository fixture directory.

Keep this fixture deterministic and free of generated output. Test logs,
screenshots, generated scripts, and process metadata belong under
`.runtime/tests/runtime-api/`.
