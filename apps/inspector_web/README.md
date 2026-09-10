# OpenDesk Accessibility Workbench

`apps/inspector_web` is a plain HTML/CSS/JavaScript site for reviewing a bounded,
read-only Accessibility observation. It contains no Go package, Node launcher,
HTTP backend, native collection, authorization, or artifact policy.

The site is not embedded in, built into, or served by OpenDesk. Choose any one
static-file server and serve this directory directly. For example, from the
repository root:

```bash
python3 -m http.server 60845 --bind 127.0.0.1 --directory apps/inspector_web
```

Open `http://127.0.0.1:60845/` and click **Connect OpenDesk**. `serve`, `anywhere`,
or another static server works the same way; do not run a second server or a Node
helper. The normal OpenDesk app must already be listening on `127.0.0.1:60844`.
For a non-default control port, add an encoded `control` query parameter, such as
`?control=http%3A%2F%2F127.0.0.1%3A61954%2Fapi%2Faccessibility-workbench%2Fv1%2Flaunch`.

The page's explicit connect action asks OpenDesk to create an ephemeral,
authenticated native API listener. OpenDesk accepts only a real loopback socket,
a plain-HTTP loopback page Origin, the custom control header, and a `frontendUrl`
whose Origin matches that page. It does not bind or close the frontend port.

The only integration boundary is the documented HTTP control/data contract.
OpenDesk contains no copy or adapter for these files, and its status menu and
CLI do not launch this site.

Frontend model and static-safety tests run from the repository root:

```bash
node --test tests/accessibility-workbench/model.test.js
```

The static server only distributes frontend files. Native Accessibility calls
still go through the already-running OpenDesk process and its short-lived
authorization; the browser page never receives a general script-execution API.
