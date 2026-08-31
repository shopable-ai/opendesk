# Third-party source policy

`third_party/` is an intentional exception, not a general dependency or output
directory. OpenDesk uses local module replacements because a small set of
macOS compatibility fixes is not available in the pinned upstream releases.

## Pinned upstreams

| Local module | Upstream version | Local patch surface |
| --- | --- | --- |
| `github.com/go-vgo/robotgo` | `v0.110.5` | `key.go`, `robotgo.go`, `screen/screengrab_c.h` |
| `github.com/kbinani/screenshot` | `v0.0.0-20240820160931-a8a2c5d0e191` | `darwin.go` |

The authoritative pins and replacements are in the root `go.mod`. The upstream
licenses and module metadata must remain in each copied module.

## Rules

- Do not add application code, generated output, fixtures or arbitrary copied
  libraries here.
- Keep local changes limited to documented compatibility patches. A new changed
  upstream file requires an explanation in this README in the same change.
- Review updates by comparing each local module with the exact version in the Go
  module cache; never update by copying an unpinned branch snapshot.
- Preserve user changes in a dirty worktree and review each patch before
  refreshing the upstream baseline.

## Update and removal

For an upstream update:

1. change the pinned version explicitly;
2. obtain that exact module version through normal Go module tooling;
3. reapply only the still-required compatibility changes;
4. compare the complete local tree with the pinned module;
5. run the macOS build and focused keyboard/screenshot automation tests.

Remove a vendored module when its required fixes are present upstream and the
same macOS checks pass without the local replacement. Remove the `replace` line
and the corresponding directory together so this exception cannot become stale
or unused.
