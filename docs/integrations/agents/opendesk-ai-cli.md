# OpenDesk AI CLI Agent Skill

Use `opendesk ai` as the first-choice desktop execution surface for Codex, Claude Code and shell-based coding
agents. Start from the repository root with `go run ./cmd/opendesk ai schema` (or `./opendesk ai schema` for a
built root binary). Parse stdout as JSON only; keep stderr as diagnostics.

Desktop interaction policy:

1. Use an existing parameterized recipe with `opendesk ai run` when available.
2. Otherwise check `opendesk ai capabilities`, find the target window, and use its metadata before screenshots.
3. Prefer target-window screenshots. Use window-local or relative ROI when known.
4. Prefer deterministic `window`, `mouse`, `keyboard`, `scroll`, `clipboard`, and `app` primitives after state is known.
5. Use Vision or image matching only when metadata and deterministic actions cannot identify the target.
6. Verify with the smallest relevant observation and save a reusable recipe after a stable workflow is discovered.
7. Full-screen screenshots are fallback only.

Never treat `app open-url` as browser DOM automation. Do not invoke destructive system operations, Experimental
Native Extensions, or unsafe diagnostics through this default surface. Respect `permission_required` and
`unsupported_platform` responses rather than retrying blindly.

See [AI CLI](../../api/ai-cli.md) for the full machine contract, coordinates, evidence, and recipe inputs.
