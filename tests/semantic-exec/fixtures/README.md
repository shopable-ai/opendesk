# Semantic execution fixtures

This directory contains the scenario/expected-result pairs for the semantic
execution maintenance and smoke suites.

- `scenarios/` describes each deterministic execution case.
- `expected/` records the corresponding expected outcome.

Each basename must remain paired across the two directories. The Go consumers
are `pkg/benchmark` and `pkg/operator`; update their focused tests when adding
or changing a pair. Runtime evidence and ad-hoc scenarios belong under
`.runtime/tests/semantic-exec/` until promoted deliberately.
