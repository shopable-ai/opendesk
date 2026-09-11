# OpenDesk Accessibility Workbench

`apps/inspector_web` is the source-owned HTML/CSS/JavaScript frontend for a
bounded, read-only Accessibility observation and an explicitly requested,
short-lived pixel capture. The current OpenDesk development checkout serves
these source files directly; `scripts/build_macos_app.sh` copies the same files
into `OpenDesk.app/Contents/Resources/inspector_web` so the app and UI always
come from one build.

The single local entry is:

```text
http://127.0.0.1:60844/accessibility-workbench/
```

Open it from the macOS tray menu under **Developer → Open Inspector**, or enter
the URL directly, then click **Connect**. Page, launch control
(`POST /api/accessibility-workbench/v1/launch`), and data
(`/api/accessibility-inspector/v1/*`) use the same `60844` origin. There is no
Python `60845` server, `control` query parameter, CORS bridge, or random API
listener in the normal workflow.

LAN access is an explicit trusted developer-network mode. It starts off on every
OpenDesk process launch and is enabled only from **Developer → Allow Inspector
from LAN**. **Copy Inspector LAN URL** copies
`http://<local-private-IP>:60844/accessibility-workbench/`. The LAN page displays
a persistent plaintext-HTTP warning. Use this only on a private network you
trust; do not expose or forward the port to the public internet.

Both modes require an exact IP `Host`, exact same-origin HTTP `Origin`, a real
loopback or private socket peer allowed by the active policy, a one-time pairing
code, one in-memory Bearer client, per-session tokens, and the existing pair,
client, session, and visual TTLs. Forwarded requests, public peers, forged local
hosts, cross-origin traffic, and a second active client are rejected. The helper
can change LAN state only through a loopback-only internal endpoint authenticated
by a random token passed in its argv. That state is not persisted.

The Inspector API remains read-only and narrowly routed. It does not grant or
proxy script execution, Scheduler, MCP, generic Runtime, arbitrary files, or UI
actions. The frontend source remains here for development and tests, while the
OpenDesk server exposes only `index.html`, `app.css`, `app.js`, and `model.js`
under the fixed page path.

The UI tree opens in a compact view: empty leaves are hidden and single-child
structural chains are folded without removing named, identified, actionable, or
stateful nodes. **Show structure** restores the complete captured hierarchy, and
search always covers the complete snapshot even while compact view is active.

Use the page in this order:

1. Click **Connect**.
2. Choose one exact target row by application, window title, PID, bounds, and the
   page's short-lived picker identity; then click **Open scope**.
3. Read or refresh the tree. Select a node only when you want to review its facts
   or validate a locator.
4. Optionally choose **Capture visual**. Refreshing the tree never captures pixels.
   Use **Selected** for one solid 2px red selection box or **All boxes** for the
   selected box plus low-interference blue context boxes. Tree rows and boxes
   select each other and remain keyboard-operable.
5. Validate, save, and export the review. These actions remain read-only and do
   not claim that an automation recipe or business result has run.

Visual capture is a dedicated Inspector-only operation, not an expansion of the
public `page.screenshot` API. Its request accepts only the current
`observationId` and `generation`; the existing Bearer and session tokens are both
required. The backend fixes the target, bounds, format, payload limit, and 30
second expiry. It verifies the exact native window identity and bounds before and
after capture, never focuses or raises the target, returns a PNG data URL, and
does not persist the pixels. A new observation, target/session change, close,
bounds/identity mismatch, or expiry clears the image immediately.

On macOS, OpenDesk first attempts an exact CGWindow-ID capture that excludes
other windows. If a platform can only capture visible screen bounds, the response
and UI say **Visible bounds / may be occluded**, report `foregroundVerified` and
`occlusionRisk`, and keep **Logical Layout** as the active reference. Unsupported
capture, permission denial, target change, invalid provenance, and expired data
also fall back to Logical Layout with a recovery action; logical bounds are never
presented as target pixels.

For the macOS AX backend, element `nativeBounds` are projected only when the
window root and each element name the exact same native coordinate space. The
mapping is window-relative and is never reused as a browser or mouse coordinate;
mixed or missing coordinate spaces remain unmapped facts.

The page keeps one **Start here** action visible throughout this flow. It changes
with the current state: connect, focus the target list, open the selected window,
go to the UI tree, or refresh the tree. The four-step explanation and inactive
workspace are collapsed before connection, which avoids duplicating Connect in
the header and keeps the first screen focused. Once the tree appears, ordinary
inspection only requires clicking a tree row; validation and handoff controls are
optional advanced steps.

The target is a native application window, not an active-window guess. Duplicate
titles remain separate picker rows and the backend binds the session to the exact
chosen window identity. A title that exactly matches this page is warned as a
possible self-selection because browser JavaScript cannot read its own native OS
window ID.

OpenDesk, the target application, and the same-origin Inspector page are expected to
run together. One OpenDesk process permits one connected Workbench frontend at a
time; a second page can load the static files but its **Connect** request receives
a conflict until the first page revokes, closes, or expires. This does not stop
normal OpenDesk work or the target application.

For a web target, put the target tab in a separate native browser window and keep
that tab active in that window. Another tab in the Inspector's own browser window
is not a separately selectable target window. The Inspector always reads the
browser's platform AX/UIA tree; pixels are optional, explicit, and short-lived.
Keep the target window open and non-minimized so it remains enumerable. Chrome
exposes web content only to the extent that its platform accessibility tree is
enabled and the page supplies accessible semantics; canvas, virtualized, or
otherwise unexposed content may still be absent.

The integration boundary is the documented same-origin HTTP control/data
contract. The macOS status menu opens the fixed page URL and changes only the
process-local trusted-LAN policy; it never receives Inspector bearer or session
credentials.

Frontend model and static-safety tests run from the repository root:

```bash
node --test tests/accessibility-workbench/model.test.js
```

OpenDesk serves only the frontend allowlist plus the narrow Inspector routes.
Native Accessibility calls still go through its short-lived authorization; the
browser page never receives a general script-execution API.
