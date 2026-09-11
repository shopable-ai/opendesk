(function () {
  "use strict";

  if (globalThis.top !== globalThis.self) {
    const blocked = document.createElement("p");
    blocked.textContent = "Accessibility Workbench refuses to run inside an embedded frame. Open the Inspector page directly.";
    document.body.replaceChildren(blocked);
    return;
  }

  const model = globalThis.OpenDeskWorkbenchModel;
  const apiPrefix = "/api/accessibility-inspector/v1";
  const controlPath = "/api/accessibility-workbench/v1/launch";
  const defaultHandoffDetail = "Export contains selected facts and human review only; it does not claim a verified result.";
  let apiOrigin = location.origin;
  const elements = {};
  const state = {
    token: "", sessionId: "", sessionToken: "", windows: [],
    scopeWindow: null, scopeGeneration: null, sessionPhase: "idle", windowPhase: "idle",
    observation: null, selectedNode: null, validation: null, review: null, handoff: null,
    launchPhase: "idle", snapshotPhase: "idle", selectionStatus: "none", selectionAnchor: null,
    validationPhase: "idle",
    collapsedNodeIds: new Set(), showStructureNodes: false,
    scopeEpoch: 0, observationSequence: 0, validationSequence: 0,
    visualSequence: 0, visualPhase: "idle", visual: null, visualNotice: null,
    boxMode: "selected", visualController: null, visualExpiryTimer: null,
    observationController: null, validationController: null, pendingImportContext: null,
    pageAccess: null, launchError: ""
  };
  const ids = [
    "connection-badge", "capability-summary", "getting-started", "how-to-use",
    "guide-progress", "guide-title", "guide-detail", "guide-hint", "guide-action",
    "guide-step-connect", "guide-step-target", "guide-step-scope", "guide-step-inspect", "window-select", "refresh-windows",
    "origin-route", "current-page-url", "required-page-url", "origin-copy-status",
    "interface-preview", "interface-preview-detail",
    "create-session", "take-snapshot", "close-session", "limit-depth", "limit-nodes",
    "limit-timeout", "target-state", "target-title", "target-meta", "target-warning",
    "global-message", "tree-completeness", "tree-count", "tree-search",
    "tree-view-toggle", "tree-compression", "tree",
    "preview-state", "capture-visual", "boxes-selected", "boxes-all", "visual-status",
    "visual-status-title", "visual-status-detail", "selection-indicator", "visual-stage",
    "visual-image", "visual-overlay", "layout-empty", "layout", "observation-meta", "selection-state",
    "raw-properties", "business-alias", "human-note", "intended-usage", "locator-role",
    "locator-name", "locator-identifier", "validate-locator", "validation-state",
    "validation-detail", "save-review", "import-handoff", "export-handoff", "copy-agent", "copy-js",
    "handoff-detail"
  ];

  function cacheElements() {
    for (const id of ids) elements[id] = document.getElementById(id);
  }

  function setBadge(element, label, tone) {
    element.textContent = label;
    element.className = "badge " + (tone || "neutral");
  }

  function message(text, tone) {
    elements["global-message"].textContent = text;
    elements["global-message"].className = "message " + (tone || "info");
  }

  function clearHandoffDetail() {
    elements["handoff-detail"].textContent = defaultHandoffDetail;
  }

  function clearVisualData() {
    if (state.visualExpiryTimer) clearTimeout(state.visualExpiryTimer);
    state.visualExpiryTimer = null;
    state.visual = null;
    if (elements["visual-image"]) elements["visual-image"].removeAttribute("src");
  }

  function invalidateVisual(title, detail, tone) {
    if (state.visualController) state.visualController.abort();
    state.visualController = null;
    state.visualSequence += 1;
    state.visualPhase = "idle";
    clearVisualData();
    state.visualNotice = title ? {
      title,
      detail: detail || "Capture visual again for the current observation.",
      tone: tone || "neutral"
    } : null;
  }

  function scheduleVisualExpiry(capture) {
    if (state.visualExpiryTimer) clearTimeout(state.visualExpiryTimer);
    const delay = Date.parse(String(capture && capture.expiresAt || "")) - Date.now();
    if (!Number.isFinite(delay) || delay <= 0) {
      expireVisual();
      return;
    }
    state.visualExpiryTimer = setTimeout(expireVisual, Math.min(delay, 2147483647));
  }

  function expireVisual() {
    clearVisualData();
    state.visualPhase = "idle";
    state.visualNotice = {
      title: "Visual expired",
      detail: "The short-lived pixels were cleared. Capture visual again; Logical Layout remains current.",
      tone: "warn"
    };
    renderLayout();
    renderMeta();
    updateButtons();
  }

  function sameObservedNode(left, right) {
    if (!left || !right) return false;
    if (left === right) return true;
    return Boolean(left.nodeId && right.nodeId && String(left.nodeId) === String(right.nodeId));
  }

  function selectedWindow() {
    const windowId = elements["window-select"].value;
    return state.windows.find(candidate => candidate && candidate.windowId === windowId) || null;
  }

  function renderTarget() {
    const scoped = Boolean(state.sessionId && state.sessionToken && state.scopeWindow);
    const candidate = scoped ? state.scopeWindow : selectedWindow();
    const presentation = model.windowPresentation(candidate, document.title);
    if (!candidate) {
      setBadge(elements["target-state"], "No target", "neutral");
      elements["target-title"].textContent = "Choose a target from the refreshed list";
      elements["target-meta"].textContent = "No active-window guess or fuzzy title matching is used.";
      elements["target-warning"].hidden = true;
      elements["target-warning"].textContent = "";
      return;
    }
    setBadge(elements["target-state"], scoped ? "Scope open" : "Selected", scoped ? "good" : "warn");
    elements["target-title"].textContent = presentation.application + " · “" + presentation.title + "”";
    elements["target-meta"].textContent = presentation.meta +
      (scoped ? " · session " + state.sessionId + " · generation " + String(state.scopeGeneration) :
        " · verify this row, then open its scope");
    elements["target-warning"].hidden = !presentation.possibleInspector;
    elements["target-warning"].textContent = presentation.possibleInspector
      ? "Possible self-selection: this candidate has the exact Inspector page title. Verify its application, PID, bounds, and picker identity before continuing."
      : "";
  }

  function guideState() {
    if (state.pageAccess && !state.pageAccess.canConnect) {
      const copyAvailable = Boolean(state.pageAccess.loopbackURL);
      return {
        step: "preview", progress: "Preview only", title: "Continue on the computer running OpenDesk",
        detail: "This address is outside the local-only or explicitly enabled trusted-LAN Inspector boundary.",
        hint: copyAvailable
          ? "Use the fixed 127.0.0.1:60844 URL on the OpenDesk computer. LAN access must first be enabled from the Developer tray menu."
          : "Open the fixed Inspector URL from the OpenDesk Developer tray menu.",
        action: "copy-loopback", label: copyAvailable ? "Copy loopback URL" : "Preview only", disabled: !copyAvailable
      };
    }
    const paired = Boolean(state.token);
    const scoped = Boolean(state.sessionId && state.sessionToken && state.scopeWindow);
    const candidate = scoped ? state.scopeWindow : selectedWindow();
    const observationCurrent = Boolean(state.observation && state.observation.freshness !== "stale");
    if (!paired) {
      if (state.launchPhase === "loading") return {
        step: "connect", progress: "Step 1 of 4", title: "Connecting this page to OpenDesk…",
        detail: "Keep OpenDesk running while the short-lived read-only connection is created.",
        hint: "This does not choose or inspect a target window yet.", action: "connecting", label: "Connecting…", disabled: true
      };
      return {
        step: "connect", progress: "Step 1 of 4", title: "Open the app or webpage you want to inspect",
        detail: "For a webpage, move its active tab into a separate browser window. Leave the target open, then connect this page to OpenDesk.",
        hint: state.launchError || "If Connect fails, verify OpenDesk is running and, for LAN, that trusted-LAN access is enabled.", action: "connect", label: state.launchError ? "Try connecting again" : "Connect to OpenDesk"
      };
    }
    if (!scoped && !candidate) {
      if (state.windowPhase === "loading") return {
        step: "target", progress: "Step 2 of 4", title: "Loading the target-window list…",
        detail: "OpenDesk is collecting only the window identities you can explicitly choose.",
        hint: "Nothing is inspected while this list loads.", action: "loading-windows", label: "Loading windows…", disabled: true
      };
      if (state.windowPhase === "error" || (state.windowPhase === "ready" && state.windows.length === 0)) return {
        step: "target", progress: "Step 2 of 4", title: "No target window is available yet",
        detail: "Open or restore the app window you want to inspect, then refresh the list.",
        hint: "For a webpage, its tab must be active in a separate, non-minimized browser window.",
        action: "refresh-windows", label: "Refresh target windows"
      };
      return {
        step: "target", progress: "Step 2 of 4", title: "Choose the window you actually want to inspect",
        detail: "Use the Target window list below. Match the application and exact title; use PID, bounds, and picker identity only to distinguish duplicates.",
        hint: "The active window and this Inspector page are never selected automatically.", action: "choose-target", label: "Go to target list"
      };
    }
    if (!scoped) {
      const presentation = model.windowPresentation(candidate, document.title);
      if (state.sessionPhase === "loading") return {
        step: "scope", progress: "Step 3 of 4", title: "Opening the selected window read-only…",
        detail: presentation.application + " · “" + presentation.title + "”",
        hint: "Open scope binds only this exact picker identity.", action: "opening-scope", label: "Opening window…", disabled: true
      };
      return {
        step: "scope", progress: "Step 3 of 4", title: "Open “" + presentation.title + "” as the target",
        detail: "Check the Selected target window strip below. If it is correct, open its scope—a temporary read-only connection to exactly that native window.",
        hint: presentation.meta, action: "open-scope", label: "Open selected window"
      };
    }
    if (state.snapshotPhase === "loading") return {
      step: "inspect", progress: "Step 4 of 4", title: "Reading the target’s UI tree…",
      detail: "OpenDesk is collecting the controls and text exposed by the selected window.",
      hint: "Refreshing the tree never captures pixels. Visual capture is a separate explicit action.",
      action: "reading-tree", label: "Reading UI tree…", disabled: true
    };
    if (!observationCurrent) return {
      step: "inspect", progress: "Step 4 of 4", title: "Read the selected window’s UI tree",
      detail: "The target is open, but there is no current tree. Refresh it now.",
      hint: "If the target was closed or rebuilt, stop this scope and choose the new window.",
      action: "refresh-tree", label: "Refresh UI tree"
    };
    if (!state.observation.root) return {
      step: "inspect", progress: "Step 4 of 4", title: "This window exposed no UI rows",
      detail: "Restore or activate the target’s content, then refresh. A browser target must keep its intended tab active in that target window.",
      hint: "Workbench cannot invent controls that the app does not expose through AX/UIA.",
      action: "refresh-tree", label: "Try refreshing the tree"
    };
    if (!state.selectedNode || state.selectionStatus === "stale") return {
      step: "inspect", progress: "Step 4 of 4", title: "Click a row in the UI tree",
      detail: "On desktop the tree is on the left; on a small screen it is directly below. Click any row to inspect that control or text.",
      hint: "Use the ↻ button beside Open scope whenever you want a fresh tree.",
      action: "go-to-tree", label: "Go to UI tree"
    };
    return {
      step: "done", progress: "Ready", title: "You are inspecting “" + model.nodePresentation(state.selectedNode).primary + "”",
      detail: "Its properties are in the Inspector pane. Validate, review, or export only if you need a reusable locator handoff.",
      hint: "For ordinary inspection, selecting the row is enough.", action: "refresh-tree", label: "Refresh UI tree"
    };
  }

  function renderGuide() {
    if (!elements["guide-action"]) return;
    const guide = guideState();
    elements["guide-progress"].textContent = guide.progress;
    elements["guide-title"].textContent = guide.title;
    elements["guide-detail"].textContent = guide.detail;
    elements["guide-hint"].textContent = guide.hint;
    elements["guide-action"].textContent = guide.label;
    elements["guide-action"].disabled = Boolean(guide.disabled);
    elements["guide-action"].dataset.action = guide.action;
    const order = ["connect", "target", "scope", "inspect"];
    const currentIndex = guide.step === "done" ? order.length : order.indexOf(guide.step);
    order.forEach(function (step, index) {
      const item = elements["guide-step-" + step];
      item.classList.toggle("complete", index < currentIndex || guide.step === "done");
      item.classList.toggle("current", index === currentIndex);
      if (index === currentIndex) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
  }

  async function performGuideAction() {
    const action = guideState().action;
    if (action === "copy-loopback") {
      await writeClipboard(state.pageAccess.loopbackURL);
      elements["origin-copy-status"].textContent = "Loopback URL copied. Open it in a browser on the computer running OpenDesk.";
      return;
    }
    if (action === "connect") return connectToOpenDesk();
    if (action === "refresh-windows") return loadWindows();
    if (action === "open-scope") return createSession();
    if (action === "refresh-tree") return takeSnapshot();
    if (action === "choose-target") {
      elements["window-select"].scrollIntoView({ behavior: "smooth", block: "center" });
      elements["window-select"].focus();
      return;
    }
    if (action === "go-to-tree") {
      const firstRow = elements.tree.querySelector('[role="treeitem"]');
      (firstRow || elements.tree).scrollIntoView({ behavior: "smooth", block: "center" });
      if (firstRow) firstRow.focus();
    }
  }

  function apiError(payload, fallback) {
    if (payload && typeof payload.message === "string") return payload.message;
    return fallback || "Accessibility Workbench request failed";
  }

  function controlResponseError(response, payload) {
    if (response && response.status === 404) {
      return new Error("OpenDesk answered on this computer, but that running app does not expose Workbench control. Quit, update, and restart that OpenDesk.app; do not start a companion dist/opendesk process.");
    }
    return new Error(apiError(payload, "OpenDesk control request failed with HTTP " + (response ? response.status : "unknown")));
  }

  function normalizedControlError(error) {
    if (error && error.name === "TypeError") {
      return new Error("No compatible same-origin Workbench response came from OpenDesk on port 60844. Start, update, or restart that single OpenDesk.app.");
    }
    return error instanceof Error ? error : new Error(String(error));
  }

  function currentFrontendURL() {
    const candidate = new URL(location.href);
    const access = model.pageAccess(candidate.href);
    if (!access.canConnect) {
      throw new Error("Inspector accepts only its plain HTTP loopback URL or an explicitly enabled private-LAN URL.");
    }
    candidate.search = "";
    candidate.hash = "";
    return candidate.href;
  }

  function apiURL(path) {
    return apiOrigin + apiPrefix + path;
  }

  async function request(path, options) {
    const init = Object.assign({ method: "GET", headers: {} }, options || {});
    init.headers = Object.assign({}, init.headers, { "X-OpenDesk-Inspector": "1" });
    if (state.token) init.headers.Authorization = "Bearer " + state.token;
    if (state.sessionToken) init.headers["X-OpenDesk-Inspector-Session"] = state.sessionToken;
    if (Object.prototype.hasOwnProperty.call(init, "body")) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(init.body);
    }
    const response = await fetch(apiURL(path), init);
    let payload;
    try { payload = await response.json(); } catch (_) { payload = null; }
    if (!response.ok || !payload || payload.code !== 0) {
      const error = new Error(apiError(payload, "Inspector HTTP " + response.status));
      error.httpStatus = response.status;
      error.responseCode = payload && payload.code;
      throw error;
    }
    return payload.data;
  }

  function limits() {
    return {
      maxDepth: Number(elements["limit-depth"].value),
      maxNodes: Number(elements["limit-nodes"].value),
      timeout: Number(elements["limit-timeout"].value)
    };
  }

  function currentLocator() {
    const locator = {};
    const role = elements["locator-role"].value;
    const name = elements["locator-name"].value;
    const identifier = elements["locator-identifier"].value;
    if (role) locator.role = role;
    if (name !== "") locator.name = name;
    if (identifier) locator.identifier = identifier;
    return locator;
  }

  function markLocatorEdited() {
    if (state.validationController) state.validationController.abort();
    state.validationSequence += 1;
    state.validation = null;
    state.review = null;
    state.handoff = null;
    clearHandoffDetail();
    setBadge(elements["validation-state"], "NOT_VALIDATED", "neutral");
    elements["validation-detail"].textContent = "Edited candidate requires fresh backend validation; snapshot filtering does not validate it.";
    updateButtons();
  }

  function updateButtons() {
    const paired = Boolean(state.token);
    const scoped = Boolean(state.sessionId && state.sessionToken);
    const openingScope = state.sessionPhase === "loading";
    const observationCurrent = Boolean(state.observation && state.observation.freshness !== "stale" && state.snapshotPhase !== "loading");
    const selected = Boolean(state.selectedNode && observationCurrent && state.selectionStatus !== "stale");
    const selectedWithId = Boolean(selected && String(state.selectedNode.nodeId || "").trim());
    document.body.classList.toggle("page-connected", paired);
    elements["refresh-windows"].disabled = !paired || scoped || openingScope;
    elements["window-select"].disabled = !paired || scoped || openingScope;
    elements["create-session"].disabled = !paired || scoped || openingScope || !elements["window-select"].value;
    elements["take-snapshot"].disabled = !scoped || state.snapshotPhase === "loading";
    elements["capture-visual"].disabled = !scoped || !observationCurrent ||
      state.visualPhase === "loading" || !state.observation || !state.observation.root;
    elements["capture-visual"].textContent = state.visualPhase === "loading" ? "Capturing…" : "Capture visual";
    elements["boxes-selected"].setAttribute("aria-pressed", state.boxMode === "selected" ? "true" : "false");
    elements["boxes-all"].setAttribute("aria-pressed", state.boxMode === "all" ? "true" : "false");
    elements["close-session"].disabled = !scoped;
    elements["validate-locator"].disabled = !scoped || !selected || state.validationPhase === "loading" || Object.keys(currentLocator()).length === 0;
    elements["save-review"].disabled = !scoped || !selectedWithId || Object.keys(currentLocator()).length === 0;
    elements["save-review"].title = selected && !selectedWithId
      ? "Save unavailable: this snapshot node has no node ID" : "Save review";
    elements["import-handoff"].disabled = !scoped || !selectedWithId;
    const importLabel = document.querySelector('label[for="import-handoff"]');
    if (importLabel) {
      importLabel.setAttribute("aria-disabled", elements["import-handoff"].disabled ? "true" : "false");
      importLabel.tabIndex = elements["import-handoff"].disabled ? -1 : 0;
      importLabel.title = selected && !selectedWithId
        ? "Import unavailable: this snapshot node has no node ID" : "Import JSON";
    }
    elements["export-handoff"].disabled = !state.review || !observationCurrent;
    elements["copy-agent"].disabled = !state.review || !observationCurrent;
    elements["copy-js"].disabled = !state.review || !observationCurrent;
    renderGuide();
  }

  async function connectToOpenDesk() {
    if (!state.pageAccess || !state.pageAccess.canConnect) {
      throw new Error("This address is outside the Inspector local-only or trusted-LAN boundary.");
    }
    state.launchPhase = "loading";
    state.launchError = "";
    setBadge(elements["connection-badge"], "Connecting", "pending");
    message("Asking the already-running OpenDesk service for a short-lived Workbench session…", "info");
    updateButtons();
    try {
      const frontendURL = currentFrontendURL();
      const response = await fetch(controlPath, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OpenDesk-Workbench-Control": "1"
        },
        body: JSON.stringify({})
      });
      let payload;
      try { payload = await response.json(); } catch (_) { payload = null; }
      if (!response.ok || !payload || payload.code !== 0 || !payload.data || typeof payload.data.url !== "string") {
        throw controlResponseError(response, payload);
      }
      const launchURL = new URL(payload.data.url);
      const launchFrontendURL = new URL(launchURL.href);
      launchFrontendURL.hash = "";
      if (launchFrontendURL.href !== frontendURL || launchURL.origin !== location.origin || !launchURL.hash) {
        throw new Error("OpenDesk returned a Workbench pairing URL outside this 60844 origin.");
      }
      // The trusted URL differs from the current page only by its fragment, so
      // location.replace() would be a same-document navigation and would not
      // run DOMContentLoaded again. Consume the returned fragment directly;
      // pair() clears any visible fragment before sending the one-time code.
      await pair(launchURL.hash);
    } catch (error) {
      error = normalizedControlError(error);
      state.launchPhase = "idle";
      state.launchError = error && error.message || String(error);
      elements["capability-summary"].textContent = "OpenDesk has not connected";
      setBadge(elements["connection-badge"], "Not connected", "warn");
      updateButtons();
      throw error;
    }
  }

  async function pair(fragmentValue) {
    const fragment = new URLSearchParams(String(fragmentValue === undefined ? location.hash : fragmentValue).replace(/^#/, ""));
    const code = fragment.get("pair") || "";
    if (fragment.get("api")) throw new Error("Inspector no longer accepts a separate API origin.");
    apiOrigin = location.origin;
    history.replaceState(null, "", location.pathname + location.search);
    if (!code) throw new Error("Missing one-time pairing code. Launch Workbench from OpenDesk again.");
    const paired = await request("/pair", { method: "POST", body: { code } });
    state.token = paired.token;
    state.launchError = "";
    elements["interface-preview"].open = true;
    setBadge(elements["connection-badge"], "Connected", "good");
    message("Paired to the OpenDesk Workbench API. Tokens are kept only in page memory.", "success");
    updateButtons();
    await Promise.all([loadCapabilities(), loadWindows()]);
  }

  async function loadCapabilities() {
    const data = await request("/capabilities");
    const accessibility = data && data.accessibility || {};
    const backend = accessibility.backend || accessibility.platform || "unknown backend";
    const implementation = accessibility.implementation || {};
    const permission = accessibility.permission || {};
    const authorization = accessibility.hostAuthorization || {};
    const availability = implementation.available === false ? "backend unavailable" :
      (permission.required && !permission.granted ? "permission denied" : "available");
    const policy = authorization.readOnly === true && authorization.valueAllowed === false ? "read-only · no value" : "policy unknown";
    elements["capability-summary"].textContent = backend + " · " + availability + " · " + policy;
  }

  async function loadWindows() {
    message("Reading the bounded list of windows available for explicit selection…", "info");
    state.windowPhase = "loading";
    state.windows = [];
    const select = elements["window-select"];
    select.replaceChildren();
    const loading = document.createElement("option");
    loading.value = "";
    loading.textContent = "Refreshing window list…";
    select.appendChild(loading);
    renderTarget();
    updateButtons();
    let windows;
    try {
      windows = await request("/windows");
    } catch (error) {
      state.windowPhase = "error";
      loading.textContent = "Window refresh failed";
      renderTarget();
      updateButtons();
      throw error;
    }
    state.windows = Array.isArray(windows) ? windows : [];
    state.windowPhase = "ready";
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = state.windows.length ? "Choose a window" : "No eligible windows";
    select.appendChild(placeholder);
    for (const item of state.windows) {
      const presentation = model.windowPresentation(item, document.title);
      const option = document.createElement("option");
      option.value = item.windowId;
      option.textContent = presentation.label;
      select.appendChild(option);
    }
    message(state.windows.length + " eligible window(s). Nothing is observed until you choose one and open its scope.", "success");
    renderTarget();
    updateButtons();
  }

  async function createSession() {
    const windowId = elements["window-select"].value;
    if (!windowId) return;
    const candidate = selectedWindow();
    if (!candidate) throw new Error("The selected picker identity is no longer in the current window list. Refresh and choose again.");
    const presentation = model.windowPresentation(candidate, document.title);
    if (presentation.possibleInspector && !globalThis.confirm(
      "This candidate has the exact title of the Inspector page and may be this browser window.\n\n" +
      presentation.application + " · PID " + presentation.pid + "\n" + presentation.meta +
      "\n\nOpen this scope only if you intend to inspect that exact window."
    )) return;
    state.sessionPhase = "loading";
    message("Binding a read-only scope to the exact selected window identity…", "info");
    updateButtons();
    try {
      const data = await request("/sessions", { method: "POST", body: { windowId, limits: limits() } });
      if (!data.window || data.window.windowId !== windowId) {
        throw new Error("OpenDesk returned a scope for a different picker identity.");
      }
      state.sessionId = data.sessionId;
      state.sessionToken = data.sessionToken;
      state.scopeWindow = data.window;
      state.scopeGeneration = data.generation;
      state.scopeEpoch += 1;
      invalidateVisual(null);
      state.observation = null;
      state.selectedNode = null;
      state.selectionStatus = "none";
      state.selectionAnchor = null;
      state.collapsedNodeIds.clear();
      state.review = null;
      state.handoff = null;
      state.pendingImportContext = null;
      clearHandoffDetail();
      renderTarget();
      message("Scoped session opened for the explicitly selected window. Tree selection remains read-only.", "success");
      updateButtons();
      await takeSnapshot();
    } finally {
      state.sessionPhase = "idle";
      updateButtons();
    }
  }

  async function takeSnapshot() {
    message("Resolving the selected window and taking a bounded Accessibility snapshot…", "info");
    invalidateVisual("Visual cleared", "The UI tree is refreshing. Capture visual again after the new observation is ready.", "neutral");
    if (state.observationController) state.observationController.abort();
    if (state.validationController) state.validationController.abort();
    state.validationSequence += 1;
    state.validationPhase = "idle";
    const controller = new AbortController();
    state.observationController = controller;
    const epoch = state.scopeEpoch;
    const sequence = ++state.observationSequence;
    const sessionId = state.sessionId;
    const previousObservation = state.observation;
    const previousSelection = model.refreshSelectionAnchor(
      previousObservation && previousObservation.root,
      state.selectedNode,
      state.selectionAnchor
    );
    state.snapshotPhase = "loading";
    state.validation = null;
    state.review = null;
    state.handoff = null;
    state.pendingImportContext = null;
    clearHandoffDetail();
    renderObservation();
    try {
      const observation = await request("/sessions/" + encodeURIComponent(sessionId) + "/observations", {
        method: "POST", body: { limits: limits() }, signal: controller.signal
      });
      if (epoch !== state.scopeEpoch || sequence !== state.observationSequence || sessionId !== state.sessionId) return;
      state.observation = observation;
      state.snapshotPhase = "idle";
      const restored = model.restoreSelection(observation.root, previousSelection);
      state.selectedNode = restored.node;
      state.selectionStatus = restored.status;
      state.selectionAnchor = restored.node ? model.selectionAnchor(observation.root, restored.node) : null;
      state.collapsedNodeIds.clear();
      state.visualNotice = {
        title: "Visual cleared",
        detail: "The UI tree was refreshed. Capture visual again for this observation.",
        tone: "neutral"
      };
      renderObservation();
      const completeness = model.completeness(observation);
      const selectionNote = restored.status === "preserved" ? " The prior selection was uniquely restored." :
        (restored.status === "stale" ? " The prior selection disappeared or became ambiguous and was not reused." : "");
      message("Accessibility observation captured: " + completeness.label + "." + selectionNote,
        completeness.tone === "good" ? "success" : "warning");
    } catch (error) {
      if (controller.signal.aborted || epoch !== state.scopeEpoch || sessionId !== state.sessionId) return;
      state.snapshotPhase = "error";
      if (state.observation) {
        state.observation.freshness = "stale";
        state.observation.staleReason = error && error.message || String(error);
      }
      state.selectionStatus = state.selectedNode ? "stale" : "none";
      state.validation = null;
      state.review = null;
      state.handoff = null;
      renderObservation();
      throw error;
    } finally {
      if (state.observationController === controller) state.observationController = null;
    }
  }

  async function captureVisual() {
    const observation = state.observation;
    if (!observation || observation.freshness === "stale" || !state.sessionId) return;
    if (state.visualController) state.visualController.abort();
    clearVisualData();
    const controller = new AbortController();
    state.visualController = controller;
    const epoch = state.scopeEpoch;
    const sequence = ++state.visualSequence;
    const sessionId = state.sessionId;
    const observationId = String(observation.observationId || "");
    const generation = Number(observation.generation);
    state.visualPhase = "loading";
    state.visualNotice = {
      title: "Capturing current target…",
      detail: "OpenDesk is verifying the exact window identity and bounds before and after capture.",
      tone: "neutral"
    };
    renderLayout();
    updateButtons();
    try {
      const capture = await request("/sessions/" + encodeURIComponent(sessionId) + "/visual-captures", {
        method: "POST",
        body: { observationId, generation },
        signal: controller.signal
      });
      if (controller.signal.aborted || epoch !== state.scopeEpoch || sequence !== state.visualSequence ||
          sessionId !== state.sessionId || observationId !== String(state.observation && state.observation.observationId || "")) return;
      const status = model.visualCaptureState(capture, state.observation, state.sessionId, state.scopeGeneration);
      if (!status.current) throw new Error("OpenDesk returned a visual that does not match the current observation (" + status.reason + ").");
      state.visual = capture;
      state.visualPhase = "idle";
      state.visualNotice = null;
      scheduleVisualExpiry(capture);
      renderLayout();
      renderMeta();
      updateButtons();
      const provenance = capture.captureProvenance || {};
      const foreground = provenance.foregroundVerified === true ? "foreground verified" : "foreground not verified";
      if (status.usable) {
        message("Visual captured for this exact observation · " + foreground + " · expires automatically.", "success");
      } else {
        message("Visible bounds may be occluded, so the pixels are not used as the reference. Logical Layout remains active.", "warning");
      }
    } catch (error) {
      if (controller.signal.aborted || epoch !== state.scopeEpoch || sequence !== state.visualSequence) return;
      clearVisualData();
      state.visualPhase = "error";
      state.visualNotice = visualFailure(error);
      if (error && error.httpStatus === 409 && state.observation) {
        state.observation.freshness = "stale";
        state.observation.staleReason = "VISUAL_TARGET_CHANGED";
        state.selectionStatus = state.selectedNode ? "stale" : "none";
        state.review = null;
        state.handoff = null;
      }
      renderObservation();
      message(state.visualNotice.title + ". " + state.visualNotice.detail, "warning");
    } finally {
      if (state.visualController === controller) state.visualController = null;
      if (state.visualPhase === "loading") state.visualPhase = "idle";
      updateButtons();
    }
  }

  function visualFailure(error) {
    const status = error && error.httpStatus;
    if (status === 403) return {
      title: "Screen capture permission denied",
      detail: "Allow Screen Recording for OpenDesk, then choose Capture visual again. Logical Layout remains available.",
      tone: "bad"
    };
    if (status === 409) return {
      title: "Target changed",
      detail: "The window identity or bounds no longer match this observation. Refresh the UI tree before capturing again.",
      tone: "bad"
    };
    if (status === 503) return {
      title: "Visual capture unavailable",
      detail: "This system cannot provide trusted target pixels. Continue with Logical Layout or retry after permissions change.",
      tone: "warn"
    };
    if (status === 429) return {
      title: "Capture is busy",
      detail: "Wait for the current read-only operation to finish, then choose Capture visual again.",
      tone: "warn"
    };
    return {
      title: "Visual capture failed",
      detail: "No pixels were kept. Logical Layout remains available; choose Capture visual to retry.",
      tone: "warn"
    };
  }

  function renderObservation() {
    renderTree();
    renderLayout();
    renderMeta();
    renderSelection();
    const presentation = model.observationState(state.observation, state.snapshotPhase);
    setBadge(elements["tree-completeness"], presentation.label, presentation.tone);
    updateButtons();
  }

  function renderTree() {
    const container = elements.tree;
    const focusedItem = document.activeElement && document.activeElement.closest
      ? document.activeElement.closest(".tree-node") : null;
    const focusedViewKey = focusedItem ? focusedItem.dataset.viewKey : "";
    const restoreTreeFocus = container.contains(document.activeElement);
    container.replaceChildren();
    container.setAttribute("aria-busy", state.snapshotPhase === "loading" ? "true" : "false");
    elements["tree-view-toggle"].textContent = state.showStructureNodes ? "Hide structure" : "Show structure";
    elements["tree-view-toggle"].setAttribute("aria-pressed", state.showStructureNodes ? "true" : "false");
    elements["tree-view-toggle"].setAttribute("aria-label",
      state.showStructureNodes ? "Hide structural nodes and use compact tree" : "Show structural nodes in the full tree");
    elements["tree-view-toggle"].title = state.showStructureNodes
      ? "Return to the compact tree" : "Show every structural and empty node";
    if (state.snapshotPhase === "loading" || (state.observation && state.observation.freshness === "stale")) {
      const status = document.createElement("p");
      status.className = state.snapshotPhase === "loading" ? "tree-status loading" : "tree-status stale";
      status.textContent = state.snapshotPhase === "loading"
        ? "Refreshing: the tree below is the previous observation and is not current."
        : "Stale observation: refresh failed or the target changed. Review, validation, and handoff actions are disabled.";
      container.appendChild(status);
    }
    const root = state.observation && state.observation.root;
    if (!root) {
      elements["tree-count"].textContent = "0 nodes";
      elements["tree-compression"].textContent = state.showStructureNodes ? "Full tree when available" : "Compact view";
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "No accessibility observation available.";
      container.appendChild(empty);
      return;
    }
    const query = elements["tree-search"].value.trim();
    const preserveNodeIds = state.selectedNode && state.selectedNode.nodeId ? [state.selectedNode.nodeId] : [];
    const preserveNodes = state.selectedNode ? [state.selectedNode] : [];
    const baselineCompactView = model.buildTreeView(root);
    const compactView = preserveNodes.length
      ? model.buildTreeView(root, { preserveNodeIds, preserveNodes })
      : baselineCompactView;
    const treeView = state.showStructureNodes
      ? model.buildTreeView(root, { showStructureNodes: true, preserveNodeIds, preserveNodes })
      : compactView;
    const total = treeView.stats.totalNodes;
    if (query) {
      const matches = model.searchSnapshot(root, query);
      const hiddenMatches = matches.filter(entry => model.hiddenReason(baselineCompactView, entry.node)).length;
      elements["tree-count"].textContent = matches.length + " / " + total + " matches";
      elements["tree-compression"].textContent = hiddenMatches
        ? hiddenMatches + " from compacted structure · search covers full tree"
        : "Search covers the full tree";
      matches.forEach((entry, index) => {
        const value = model.nodeValue(entry.node);
        const visualKind = value.level === "structure" || value.level === "noise"
          ? "structure" : (value.isContainer ? "container" : "content");
        const origin = model.hiddenReason(baselineCompactView, entry.node);
        container.appendChild(treeRow({
          node: entry.node,
          viewKey: String(entry.node.nodeId || "search-" + index),
          visualKind,
          structuralSummary: false,
          compressedAncestors: [],
          rawChildCount: Array.isArray(entry.node.children) ? entry.node.children.length : 0,
          children: []
        }, entry.depth, false, index + 1, matches.length, origin));
      });
      if (!matches.length) {
        const empty = document.createElement("p");
        empty.className = "hint";
        empty.textContent = "No nodes in this captured snapshot match the preview search.";
        container.appendChild(empty);
      }
      ensureTreeTabStop(restoreTreeFocus, focusedViewKey);
      return;
    }
    if (state.showStructureNodes) {
      elements["tree-count"].textContent = total + (total === 1 ? " node · full" : " nodes · full");
      elements["tree-compression"].textContent = "Original hierarchy · no nodes hidden";
    } else {
      elements["tree-count"].textContent = treeView.stats.visibleNodes + " / " + total + " nodes";
      const hidden = [];
      if (treeView.stats.hiddenStructure) hidden.push(treeView.stats.hiddenStructure + " structure folded");
      if (treeView.stats.hiddenLeaves) hidden.push(treeView.stats.hiddenLeaves + " empty hidden");
      elements["tree-compression"].textContent = hidden.length ? hidden.join(" · ") : "No low-value nodes hidden";
    }
    container.appendChild(treeBranch(treeView.root, 0, 1, 1));
    ensureTreeTabStop(restoreTreeFocus, focusedViewKey);
  }

  function treeBranch(view, depth, position, setSize) {
    const branch = document.createElement("div");
    branch.className = "tree-branch";
    branch.setAttribute("role", "none");
    if (view.compressedAncestors.length) {
      const hint = document.createElement("div");
      hint.className = "tree-structure-fold";
      hint.style.paddingLeft = Math.min(depth * 13 + 20, 150) + "px";
      const count = view.compressedAncestors.length;
      hint.textContent = count + (count === 1 ? " level" : " levels");
      hint.title = "Folded structural path: " + view.compressedAncestors.map(item => item.role).join(" › ");
      hint.setAttribute("aria-hidden", "true");
      branch.appendChild(hint);
    }
    branch.appendChild(treeRow(view, depth, true, position, setSize, ""));
    const children = view.children;
    if (children.length) {
      const childContainer = document.createElement("div");
      childContainer.className = "tree-children";
      childContainer.setAttribute("role", "group");
      if (state.collapsedNodeIds.has(view.viewKey)) childContainer.classList.add("collapsed");
      childContainer.dataset.parent = view.viewKey;
      children.forEach((child, index) => {
        childContainer.appendChild(treeBranch(child, depth + 1, index + 1, children.length));
      });
      branch.appendChild(childContainer);
    }
    return branch;
  }

  function treeRow(view, depth, collapsible, position, setSize, origin) {
    const node = view.node;
    const children = view.children;
    const presentation = model.nodePresentation(node, {
      visualKind: view.visualKind,
      structuralSummary: view.structuralSummary
    });
    const row = document.createElement("div");
    row.className = "tree-row" +
      " is-" + view.visualKind +
      (view.structuralSummary ? " is-structure-summary" : "") +
      (sameObservedNode(state.selectedNode, node) ? " selected" : "") +
      (node.focused === true ? " is-focused" : "") +
      (node.enabled === false ? " is-disabled" : "");
    row.style.paddingLeft = Math.min(depth * 13, 130) + "px";
    row.setAttribute("role", "none");
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "tree-toggle";
    const collapsed = state.collapsedNodeIds.has(view.viewKey);
    toggle.textContent = collapsible && children.length ? (collapsed ? "›" : "⌄") : "";
    toggle.disabled = !(collapsible && children.length);
    toggle.tabIndex = -1;
    if (toggle.disabled) toggle.setAttribute("aria-hidden", "true");
    else {
      toggle.setAttribute("aria-label", (collapsed ? "Expand " : "Collapse ") + presentation.accessibleLabel);
      toggle.title = collapsed ? "Expand group" : "Collapse group";
    }
    toggle.addEventListener("click", function () {
      const childContainer = row.nextElementSibling;
      if (!childContainer) return;
      const nowCollapsed = childContainer.classList.toggle("collapsed");
      if (nowCollapsed) state.collapsedNodeIds.add(view.viewKey);
      else state.collapsedNodeIds.delete(view.viewKey);
      toggle.textContent = nowCollapsed ? "›" : "⌄";
      toggle.setAttribute("aria-label", (nowCollapsed ? "Expand " : "Collapse ") + presentation.accessibleLabel);
      toggle.title = nowCollapsed ? "Expand group" : "Collapse group";
      button.setAttribute("aria-expanded", nowCollapsed ? "false" : "true");
    });
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tree-node";
    button.dataset.viewKey = view.viewKey;
    if (node.nodeId) button.dataset.nodeId = String(node.nodeId);
    button.setAttribute("role", "treeitem");
    button.setAttribute("aria-level", String(depth + 1));
    button.setAttribute("aria-posinset", String(position));
    button.setAttribute("aria-setsize", String(setSize));
    button.setAttribute("aria-selected", sameObservedNode(state.selectedNode, node) ? "true" : "false");
    let accessibleLabel = presentation.accessibleLabel;
    if (view.compressedAncestors.length) {
      accessibleLabel += ", after " + view.compressedAncestors.length + " compressed structural " +
        (view.compressedAncestors.length === 1 ? "level" : "levels");
    }
    if (origin) accessibleLabel += origin === "structure" ? ", hidden structural node in compact view" : ", hidden empty leaf in compact view";
    button.setAttribute("aria-label", accessibleLabel);
    button.title = accessibleLabel;
    if (collapsible && children.length) button.setAttribute("aria-expanded", collapsed ? "false" : "true");
    button.tabIndex = sameObservedNode(state.selectedNode, node) ? 0 : -1;
    const role = document.createElement("span");
    role.className = "tree-role-icon";
    role.textContent = presentation.icon;
    role.setAttribute("aria-hidden", "true");
    role.title = presentation.role;
    const primary = document.createElement("span");
    primary.className = "tree-primary" + (presentation.fallback ? " fallback" : "");
    primary.textContent = view.structuralSummary
      ? children.length + (children.length === 1 ? " branch" : " branches")
      : presentation.primary;
    primary.setAttribute("aria-hidden", "true");
    if (origin) {
      const source = document.createElement("span");
      source.className = "tree-origin";
      source.textContent = origin === "structure" ? "hidden structure" : "hidden empty";
      source.title = origin === "structure"
        ? "This match is folded out of Compact view" : "This empty leaf is hidden in Compact view";
      source.setAttribute("aria-hidden", "true");
      primary.appendChild(source);
    }
    const states = document.createElement("span");
    states.className = "tree-state-icons";
    states.setAttribute("aria-hidden", "true");
    for (const item of presentation.states) {
      const status = document.createElement("span");
      status.className = "tree-state " + item.key;
      status.textContent = item.symbol;
      status.title = item.label;
      states.appendChild(status);
    }
    const childCount = document.createElement("span");
    childCount.className = "tree-child-count";
    childCount.textContent = children.length ? String(children.length) : "";
    if (view.rawChildCount !== children.length) {
      childCount.title = children.length + " visible of " + view.rawChildCount + " direct children";
    }
    childCount.setAttribute("aria-hidden", "true");
    button.append(role, primary, states, childCount);
    button.addEventListener("click", function () { selectNode(node, { source: "tree" }); });
    button.addEventListener("keydown", function (event) { handleTreeKeydown(event, button, toggle, children.length > 0); });
    row.append(toggle, button);
    return row;
  }

  function visibleTreeItems() {
    return Array.from(elements.tree.querySelectorAll(".tree-node")).filter(item => item.offsetParent !== null);
  }

  function focusTreeItem(item) {
    if (!item) return;
    for (const candidate of elements.tree.querySelectorAll(".tree-node")) candidate.tabIndex = candidate === item ? 0 : -1;
    item.focus();
  }

  function ensureTreeTabStop(restoreFocus, focusedViewKey) {
    const items = visibleTreeItems();
    if (!items.length) return;
    const previouslyFocused = items.find(item => item.dataset.viewKey === focusedViewKey);
    const selected = items.find(item => item.getAttribute("aria-selected") === "true");
    const target = previouslyFocused || selected || items[0];
    for (const item of items) item.tabIndex = item === target ? 0 : -1;
    if (restoreFocus) target.focus();
  }

  function handleTreeKeydown(event, button, toggle, hasChildren) {
    const items = visibleTreeItems();
    const index = items.indexOf(button);
    let target = null;
    if (event.key === "ArrowDown") target = items[index + 1] || null;
    else if (event.key === "ArrowUp") target = items[index - 1] || null;
    else if (event.key === "Home") target = items[0];
    else if (event.key === "End") target = items[items.length - 1];
    else if (event.key === "ArrowRight" && hasChildren) {
      if (button.getAttribute("aria-expanded") === "false") toggle.click();
      else target = button.closest(".tree-row").nextElementSibling && button.closest(".tree-row").nextElementSibling.querySelector(".tree-node");
    } else if (event.key === "ArrowLeft") {
      if (hasChildren && button.getAttribute("aria-expanded") === "true") toggle.click();
      else {
        const parentChildren = button.closest(".tree-children");
        target = parentChildren && parentChildren.previousElementSibling && parentChildren.previousElementSibling.querySelector(".tree-node");
      }
    } else return;
    event.preventDefault();
    if (target) focusTreeItem(target);
  }

  function selectNode(node, options) {
    if (state.validationController) state.validationController.abort();
    state.validationSequence += 1;
    state.selectedNode = node;
    state.selectionStatus = state.observation && state.observation.freshness === "stale" ? "stale" : "selected";
    state.selectionAnchor = state.observation ? model.selectionAnchor(state.observation.root, node) : null;
    state.validation = null;
    state.review = null;
    state.handoff = null;
    state.pendingImportContext = null;
    clearHandoffDetail();
    const locator = model.locatorFromNode(node);
    elements["locator-role"].value = locator.role || "";
    elements["locator-name"].value = locator.name === undefined ? "" : locator.name;
    elements["locator-identifier"].value = locator.identifier || "";
    elements["business-alias"].value = "";
    elements["human-note"].value = "";
    elements["intended-usage"].value = "";
    setBadge(elements["validation-state"], "NOT_VALIDATED", "neutral");
    elements["validation-detail"].textContent = "This candidate has not been validated. Validation will run on the live backend.";
    renderTree();
    renderLayout();
    renderSelection();
    updateButtons();
    const source = options && options.source;
    requestAnimationFrame(function () {
      if (source === "overlay") {
        const treeItem = elements.tree.querySelector('.tree-node[aria-selected="true"]');
        if (treeItem) {
          treeItem.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
          focusTreeItem(treeItem);
        }
        return;
      }
      const selectedBox = document.querySelector('.mapping-box[aria-pressed="true"]');
      if (selectedBox) selectedBox.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    });
  }

  function renderSelection() {
    if (!state.selectedNode) {
      if (state.selectionStatus === "stale") {
        setBadge(elements["selection-state"], "Selection stale", "bad");
        elements["raw-properties"].textContent = "The prior selection disappeared or became ambiguous in the current observation and was not reused. Select a current tree node.";
      } else {
        setBadge(elements["selection-state"], "No node", "neutral");
        elements["raw-properties"].textContent = "Select a tree node.";
      }
      return;
    }
    if (state.selectionStatus === "stale" || (state.observation && state.observation.freshness === "stale")) {
      setBadge(elements["selection-state"], "Stale selection", "bad");
      elements["raw-properties"].textContent = "STALE — shown only from the previous observation; do not use for review or handoff.\n\n" +
        JSON.stringify(model.nodeDetails(state.selectedNode), null, 2);
      return;
    }
    const label = state.selectionStatus === "preserved" ? "Restored" : "Selected";
    setBadge(elements["selection-state"], label, state.selectionStatus === "preserved" ? "warn" : "good");
    elements["raw-properties"].textContent = JSON.stringify(model.nodeDetails(state.selectedNode), null, 2);
  }

  function renderLayout() {
    const logical = elements.layout;
    const visualStage = elements["visual-stage"];
    const visualImage = elements["visual-image"];
    const visualOverlay = elements["visual-overlay"];
    logical.replaceChildren();
    visualOverlay.replaceChildren();
    logical.classList.remove("ready");
    visualStage.hidden = true;
    visualStage.classList.remove("ready");
    visualImage.removeAttribute("src");
    elements["layout-empty"].hidden = false;
    const observationStale = state.snapshotPhase === "loading" ||
      (state.observation && state.observation.freshness === "stale");
    let captureState = model.visualCaptureState(
      state.visual, state.observation, state.sessionId, state.scopeGeneration
    );
    if (state.visual && !captureState.current) {
      const reason = captureState.reason;
      clearVisualData();
      if (!state.visualNotice || reason === "capture-expired") {
        state.visualNotice = {
          title: reason === "capture-expired" ? "Visual expired" : "Visual cleared",
          detail: "The pixels no longer match the current observation. Capture visual again; Logical Layout remains available.",
          tone: "warn"
        };
      }
      captureState = { current: false, usable: false, reason };
    }
    if (observationStale) {
      setBadge(elements["preview-state"], "Stale", "bad");
      setVisualStatus("Logical Layout paused", "Refresh the UI tree to restore a current mapping, then capture visual again if needed.", "bad");
      elements["layout-empty"].textContent = "Layout mapping is disabled until a current observation succeeds.";
      renderSelectionIndicator(0, false);
      return;
    }
    if (captureState.current && captureState.usable) {
      const capture = state.visual;
      const provenance = capture.captureProvenance || {};
      const image = capture.image || {};
      visualStage.hidden = false;
      visualStage.classList.add("ready");
      visualImage.src = image.dataUrl;
      const target = model.windowPresentation(capture.window, document.title);
      visualImage.alt = "Short-lived pixel capture of " + target.application + " · " + target.title;
      const availableWidth = visualStage.clientWidth || Math.max(visualStage.parentElement.clientWidth - 24, 0);
      const availableHeight = visualStage.clientHeight || 420;
      const mapping = model.layoutMapping(state.observation, availableWidth, availableHeight);
      renderMappingBoxes(visualOverlay, mapping, "visual");
      setBadge(elements["preview-state"], "Visual current", "good");
      setVisualStatus(
        "Exact window pixels",
        formatCaptureProvenance(capture, "Exact-window capture; other windows are excluded."),
        "good"
      );
      elements["layout-empty"].hidden = true;
      return;
    }
    if (captureState.current && captureState.reason === "occlusion-risk") {
      setBadge(elements["preview-state"], "Occlusion risk", "warn");
      setVisualStatus(
        "Visible bounds / may be occluded",
        formatCaptureProvenance(state.visual, "Pixels are withheld because another window may cover the target."),
        "warn"
      );
    } else if (state.visualPhase === "loading") {
      setBadge(elements["preview-state"], "Capturing", "pending");
      setVisualStatus(state.visualNotice.title, state.visualNotice.detail, "neutral");
    } else if (state.visualNotice) {
      setVisualStatus(state.visualNotice.title, state.visualNotice.detail, state.visualNotice.tone);
    } else {
      setVisualStatus(
        "Logical Layout",
        "No pixels are stored. Choose Capture visual for a short-lived image bound to this observation.",
        "neutral"
      );
    }
    const availableWidth = logical.clientWidth || Math.max(logical.parentElement.clientWidth - 24, 0);
    const availableHeight = logical.clientHeight || 420;
    const mapping = model.layoutMapping(state.observation, availableWidth, availableHeight);
    if (!mapping.available) {
      if (!captureState.current) setBadge(elements["preview-state"], "Tree only", "warn");
      elements["layout-empty"].textContent = "Logical Layout unavailable: " + mapping.reason + ". Bounds remain facts only and are never guessed into browser or mouse coordinates.";
      renderSelectionIndicator(0, false);
      return;
    }
    logical.classList.add("ready");
    elements["layout-empty"].hidden = true;
    if (!captureState.current) setBadge(elements["preview-state"], "Logical Layout", "good");
    renderMappingBoxes(logical, mapping, "logical");
  }

  function setVisualStatus(title, detail, tone) {
    elements["visual-status"].className = "visual-status " + (tone || "neutral");
    elements["visual-status-title"].textContent = title || "Logical Layout";
    elements["visual-status-detail"].textContent = detail || "";
  }

  function formatCaptureProvenance(capture, prefix) {
    const provenance = capture && capture.captureProvenance || {};
    const foreground = provenance.foregroundVerified === true ? "true" : "false";
    const occlusion = provenance.occlusionRisk === true ? "true" : "false";
    const capturedAt = new Date(String(capture && capture.capturedAt || ""));
    const expiresAt = new Date(String(capture && capture.expiresAt || ""));
    const capturedLabel = Number.isFinite(capturedAt.getTime()) ? capturedAt.toLocaleTimeString() : "unknown time";
    const expiresLabel = Number.isFinite(expiresAt.getTime()) ? expiresAt.toLocaleTimeString() : "unknown time";
    return prefix + " Captured " + capturedLabel + "; expires " + expiresLabel +
      ". foregroundVerified=" + foreground + " · occlusionRisk=" + occlusion +
      " · " + String(provenance.method || "unknown provenance") + ".";
  }

  function renderMappingBoxes(container, mapping, surface) {
    const boxes = model.overlayBoxes(mapping, state.selectedNode, state.boxMode);
    renderSelectionIndicator(boxes.length, Boolean(mapping && mapping.available));
    boxes.forEach(function (box, index) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mapping-box " + surface + (box.selected ? " selected" : "");
      button.style.left = box.left + "px";
      button.style.top = box.top + "px";
      button.style.width = box.width + "px";
      button.style.height = box.height + "px";
      button.style.zIndex = box.selected ? "1001" : String(Math.min(Number(box.depth) + 1, 1000));
      button.dataset.nodeId = String(box.nodeId || "");
      button.title = (box.selected ? "Selected: " : "Select: ") + box.label + " · logical " + JSON.stringify(box.logicalBounds);
      button.setAttribute("aria-label", (box.selected ? "Selected element, " : "Select element, ") + box.label);
      button.setAttribute("aria-pressed", box.selected ? "true" : "false");
      button.tabIndex = box.selected || (!state.selectedNode && index === 0) ? 0 : -1;
      button.addEventListener("click", function () {
        if (box.node) selectNode(box.node, { source: "overlay" });
      });
      button.addEventListener("focus", function () {
        for (const candidate of container.querySelectorAll(".mapping-box")) candidate.tabIndex = candidate === button ? 0 : -1;
      });
      button.addEventListener("keydown", function (event) { handleMappingKeydown(event, button, container); });
      container.appendChild(button);
    });
  }

  function renderSelectionIndicator(boxCount, mappingAvailable) {
    if (!state.selectedNode) {
      elements["selection-indicator"].textContent = "No node selected. Select a tree row to show its solid 2px selection box.";
      return;
    }
    const summary = model.nodeSummary(state.selectedNode);
    if (!mappingAvailable || boxCount === 0) {
      elements["selection-indicator"].textContent = "Selected: " + summary + ". Its bounds are unavailable in the current mapping.";
      return;
    }
    const mode = state.boxMode === "all" ? boxCount + " mapped boxes shown" : "selected box only";
    elements["selection-indicator"].textContent = "Selected: " + summary + " — solid 2px selection box; " + mode + ".";
  }

  function handleMappingKeydown(event, button, container) {
    const buttons = Array.from(container.querySelectorAll(".mapping-box"));
    const index = buttons.indexOf(button);
    let target = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") target = buttons[index + 1] || buttons[0];
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") target = buttons[index - 1] || buttons[buttons.length - 1];
    else if (event.key === "Home") target = buttons[0];
    else if (event.key === "End") target = buttons[buttons.length - 1];
    else return;
    event.preventDefault();
    if (target) target.focus();
  }

  function renderMeta() {
    const list = elements["observation-meta"];
    list.replaceChildren();
    if (!state.observation) return;
    const entries = [
      ["Observation", state.observation.observationId], ["Observed", state.observation.observedAt],
      ["Session / generation", state.sessionId + " / " + String(state.observation.generation)],
      ["Execution", state.observation.executionId], ["Request", state.observation.requestId],
      ["Backend", state.observation.backend], ["Completeness", model.completeness(state.observation).label],
      ["Reason", state.observation.reason || "none"], ["Freshness", state.observation.freshness || "unknown"],
      ["Stale reason", state.observation.staleReason || "none"],
      ["Nodes / depth", state.observation.stats ? String(state.observation.stats.nodes) + " / " + String(state.observation.stats.maxDepth) : "unknown"],
      ["Evidence", state.observation.evidenceSource]
    ];
    if (state.visual) {
      const capture = state.visual;
      const provenance = capture.captureProvenance || {};
      entries.push(
        ["Visual capture", capture.captureId],
        ["Visual observation", capture.observationId],
        ["Visual generation", capture.generation],
        ["Visual captured / expires", String(capture.capturedAt) + " / " + String(capture.expiresAt)],
        ["Capture scope / method", String(provenance.scope || "unknown") + " / " + String(provenance.method || "unknown")],
        ["foregroundVerified", provenance.foregroundVerified],
        ["occlusionRisk", provenance.occlusionRisk],
        ["Screenshot persisted", provenance.persisted]
      );
    } else if (state.visualNotice) {
      entries.push(["Visual state", state.visualNotice.title]);
    }
    for (const [key, value] of entries) {
      const term = document.createElement("dt");
      term.textContent = key;
      const detail = document.createElement("dd");
      detail.textContent = value === undefined || value === null ? "unknown" : String(value);
      list.append(term, detail);
    }
  }

  async function validateLocator() {
    message("Running fresh window resolution and Accessibility.find/read/release…", "info");
    if (state.validationController) state.validationController.abort();
    const controller = new AbortController();
    state.validationController = controller;
    state.validationPhase = "loading";
    setBadge(elements["validation-state"], "VALIDATING", "pending");
    updateButtons();
    const epoch = state.scopeEpoch;
    const sequence = ++state.validationSequence;
    const sessionId = state.sessionId;
    const locator = currentLocator();
    try {
      const receipt = await request("/sessions/" + encodeURIComponent(sessionId) + "/validate", {
        method: "POST", body: { locator, limits: limits() }, signal: controller.signal
      });
      if (epoch !== state.scopeEpoch || sequence !== state.validationSequence || sessionId !== state.sessionId ||
          !model.sameLocator(locator, currentLocator())) return;
      state.validation = receipt;
      state.handoff = null;
      setBadge(elements["validation-state"], receipt.status, model.validationTone(receipt.status));
      elements["validation-detail"].textContent = receipt.status + " · receipt " + receipt.receiptId + " · execution " + (receipt.executionId || "unknown") + " · performedAction=false";
      message("Live locator validation completed with " + receipt.status + ".", receipt.status === "UNIQUE" ? "success" : "warning");
      updateButtons();
    } catch (error) {
      if (controller.signal.aborted || epoch !== state.scopeEpoch || sequence !== state.validationSequence || sessionId !== state.sessionId) return;
      throw error;
    } finally {
      if (state.validationController === controller) {
        state.validationController = null;
        state.validationPhase = "idle";
        updateButtons();
      }
    }
  }

  async function saveReview() {
    const selectionContext = model.selectionContext(state.observation, state.selectedNode);
    if (!selectionContext) throw new Error("Select a current observation node before saving a review.");
    const payload = {
      observationId: state.observation.observationId,
      selectedNodeId: state.selectedNode.nodeId,
      businessAlias: elements["business-alias"].value,
      humanNote: elements["human-note"].value,
      intendedUsage: elements["intended-usage"].value,
      locator: currentLocator()
    };
    const data = await request("/sessions/" + encodeURIComponent(state.sessionId) + "/review", { method: "PUT", body: payload });
    if (!model.sameSelectionContext(selectionContext, state.observation, state.selectedNode)) {
      throw new Error("The observation or selected node changed while the review was being saved. The returned review was not attached to the new selection.");
    }
    if (!data.review || data.review.selectedNodeId !== selectionContext.nodeId) {
      throw new Error("OpenDesk returned a review for a different selected node.");
    }
    state.review = data.review;
    state.handoff = data.handoff;
    elements["handoff-detail"].textContent = "Saved a human review and structured handoff locally. recipeVerification remains not-run. Artifact: " + data.artifactPath;
    message("Human review saved without changing the immutable Accessibility observation.", "success");
    updateButtons();
  }

  async function importHandoff() {
    if (state.validationController) state.validationController.abort();
    state.validationSequence += 1;
    const file = elements["import-handoff"].files && elements["import-handoff"].files[0];
    elements["import-handoff"].value = "";
    if (!file) return;
    const selectionContext = state.pendingImportContext || model.selectionContext(state.observation, state.selectedNode);
    state.pendingImportContext = null;
    if (!model.sameSelectionContext(selectionContext, state.observation, state.selectedNode)) {
      throw new Error("The observation or selected node changed while the import file was being chosen. Select the intended node and import again.");
    }
    if (file.size <= 0 || file.size > 65536) throw new Error("Imported handoff must be a non-empty JSON file no larger than 64 KiB.");
    let handoff;
    try { handoff = JSON.parse(await file.text()); }
    catch (_) { throw new Error("Imported handoff is not valid JSON data."); }
    if (!model.sameSelectionContext(selectionContext, state.observation, state.selectedNode)) {
      throw new Error("The observation or selected node changed while the import file was being read. Import was canceled.");
    }
    const data = await request("/sessions/" + encodeURIComponent(state.sessionId) + "/import", {
      method: "POST", body: { selectedNodeId: selectionContext.nodeId, handoff }
    });
    if (!model.sameSelectionContext(selectionContext, state.observation, state.selectedNode)) {
      throw new Error("The observation or selected node changed while OpenDesk was importing the handoff. The returned review was not attached to the new selection.");
    }
    const review = data.review || {};
    if (review.selectedNodeId !== selectionContext.nodeId) {
      throw new Error("OpenDesk returned an imported review for a different selected node.");
    }
    state.review = review;
    state.handoff = data.handoff;
    state.validation = null;
    state.validationPhase = "idle";
    elements["business-alias"].value = review.businessAlias || "";
    elements["human-note"].value = review.humanNote || "";
    elements["intended-usage"].value = review.intendedUsage || "";
    const locator = review.locator || {};
    elements["locator-role"].value = locator.role || "";
    elements["locator-name"].value = locator.name === undefined ? "" : locator.name;
    elements["locator-identifier"].value = locator.identifier || "";
    setBadge(elements["validation-state"], "NOT_VALIDATED", "neutral");
    elements["validation-detail"].textContent = "Imported validation claims were discarded. Revalidate this locator against the current live window.";
    elements["handoff-detail"].textContent = "Imported as untrusted data and saved with source hash " + (review.importSourceHash || "unknown") + ". Waiting for fresh backend validation and Agent processing.";
    message("Imported human review data without trusting its validation claims.", "success");
    updateButtons();
  }

  async function ensureHandoff() {
    if (state.handoff) return state.handoff;
    if (!state.review) await saveReview();
    state.handoff = await request("/sessions/" + encodeURIComponent(state.sessionId) + "/handoff");
    return state.handoff;
  }

  async function exportHandoff() {
    const handoff = await ensureHandoff();
    const blob = new Blob([JSON.stringify(handoff, null, 2) + "\n"], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "opendesk-accessibility-handoff.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 0);
  }

  async function copyText(value, label) {
    await writeClipboard(value);
    message(label + " copied. Captured and human-authored text remains untrusted data.", "success");
  }

  async function writeClipboard(value) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(value);
        return;
      } catch (_) {
        // Plain HTTP trusted-LAN origins may not expose the async Clipboard API.
      }
    }
    const field = document.createElement("textarea");
    field.value = value;
    field.readOnly = true;
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    if (!copied) throw new Error("Copy failed. Select the Inspector URL shown on the page and copy it manually.");
  }

  async function closeSession() {
    if (!state.sessionId) return;
    const sessionId = state.sessionId;
    state.scopeEpoch += 1;
    state.observationSequence += 1;
    state.validationSequence += 1;
    if (state.observationController) state.observationController.abort();
    if (state.validationController) state.validationController.abort();
    invalidateVisual(null);
    await request("/sessions/" + encodeURIComponent(sessionId), { method: "DELETE" });
    state.sessionId = "";
    state.sessionToken = "";
    state.scopeWindow = null;
    state.scopeGeneration = null;
    state.observation = null;
    state.selectedNode = null;
    state.snapshotPhase = "idle";
    state.selectionStatus = "none";
    state.selectionAnchor = null;
    state.collapsedNodeIds.clear();
    state.validation = null;
    state.validationPhase = "idle";
    state.review = null;
    state.handoff = null;
    state.pendingImportContext = null;
    clearHandoffDetail();
    renderObservation();
    renderTarget();
    message("Inspector session stopped and execution-scoped Accessibility resources released.", "success");
    updateButtons();
  }

  function bind() {
    elements["guide-action"].addEventListener("click", () => run(performGuideAction));
    elements["refresh-windows"].addEventListener("click", () => run(loadWindows));
    elements["window-select"].addEventListener("change", function () {
      invalidateVisual(null);
      renderTarget();
      updateButtons();
    });
    elements["create-session"].addEventListener("click", () => run(createSession));
    elements["take-snapshot"].addEventListener("click", () => run(takeSnapshot));
    elements["capture-visual"].addEventListener("click", () => run(captureVisual));
    elements["boxes-selected"].addEventListener("click", function () {
      state.boxMode = "selected";
      renderLayout();
      updateButtons();
    });
    elements["boxes-all"].addEventListener("click", function () {
      state.boxMode = "all";
      renderLayout();
      updateButtons();
    });
    elements["close-session"].addEventListener("click", () => run(closeSession));
    elements["tree-search"].addEventListener("input", renderTree);
    elements["tree-view-toggle"].addEventListener("click", function () {
      state.showStructureNodes = !state.showStructureNodes;
      renderTree();
    });
    for (const id of ["locator-role", "locator-name", "locator-identifier"]) {
      elements[id].addEventListener("input", markLocatorEdited);
    }
    elements["validate-locator"].addEventListener("click", () => run(validateLocator));
    elements["save-review"].addEventListener("click", () => run(saveReview));
    elements["import-handoff"].addEventListener("click", function () {
      state.pendingImportContext = model.selectionContext(state.observation, state.selectedNode);
    });
    const importLabel = document.querySelector('label[for="import-handoff"]');
    if (importLabel) importLabel.addEventListener("keydown", function (event) {
      if ((event.key === "Enter" || event.key === " ") && importLabel.getAttribute("aria-disabled") !== "true") {
        event.preventDefault();
        elements["import-handoff"].click();
      }
    });
    elements["import-handoff"].addEventListener("change", () => run(importHandoff));
    elements["export-handoff"].addEventListener("click", () => run(exportHandoff));
    elements["copy-agent"].addEventListener("click", () => run(async function () { await copyText(model.agentPrompt(await ensureHandoff()), "Agent handoff prompt"); }));
    elements["copy-js"].addEventListener("click", () => run(async function () { await copyText(model.jsSnippet(await ensureHandoff()), "OpenDesk JavaScript locator snippet"); }));
    addEventListener("resize", renderLayout);
  }

  async function run(operation) {
    try { await operation(); }
    catch (error) { message(error && error.message || String(error), "error"); }
  }

  document.addEventListener("DOMContentLoaded", function () {
    cacheElements();
    bind();
    state.pageAccess = model.pageAccess(location.href);
    document.body.classList.remove("page-pending");
    document.body.classList.add(state.pageAccess.mode === "trusted-lan" ? "page-lan" : (state.pageAccess.canConnect ? "page-local" : "page-preview"));
    elements["origin-route"].hidden = state.pageAccess.mode === "local";
    elements["current-page-url"].textContent = state.pageAccess.currentURL;
    elements["required-page-url"].textContent = state.pageAccess.loopbackURL || "http://127.0.0.1:60844/accessibility-workbench/";
    if (!state.pageAccess.canConnect) {
      elements["interface-preview"].open = false;
      elements["interface-preview-detail"].textContent = "Inactive controls are available only as a visual preview on this device.";
      elements["capability-summary"].textContent = "No OpenDesk data at this address";
      setBadge(elements["connection-badge"], "Preview only", "warn");
    } else if (state.pageAccess.mode === "trusted-lan") {
      elements["interface-preview"].open = false;
      elements["interface-preview-detail"].textContent = "Connect only on a private developer network you trust.";
      elements["capability-summary"].textContent = "Trusted-LAN access uses plaintext HTTP";
      setBadge(elements["connection-badge"], "LAN · HTTP", "warn");
    }
    renderTarget();
    renderObservation();
    const fragment = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (fragment.get("pair") && state.pageAccess.canConnect) {
      run(pair);
    } else {
      if (fragment.get("pair")) history.replaceState(null, "", location.pathname + location.search);
      if (state.pageAccess.canConnect) {
        setBadge(elements["connection-badge"], "Ready to connect", "neutral");
        message(state.pageAccess.mode === "trusted-lan"
          ? "Trusted-LAN mode is enabled for this OpenDesk process. HTTP traffic is plaintext; connect only on a private developer network you trust."
          : "OpenDesk stays local-only. Connect only when you want a short-lived inspection session.",
        state.pageAccess.mode === "trusted-lan" ? "warning" : "info");
      } else {
        message("This address is outside the Inspector access boundary. Use the tray menu's fixed local URL or explicitly enable trusted-LAN access.", "warning");
      }
      updateButtons();
    }
  });

  addEventListener("pagehide", function () {
    clearVisualData();
    if (!state.token) return;
    const headers = {
      "X-OpenDesk-Inspector": "1",
      Authorization: "Bearer " + state.token
    };
    if (state.sessionToken) headers["X-OpenDesk-Inspector-Session"] = state.sessionToken;
    if (state.sessionId) {
      void fetch(apiURL("/sessions/" + encodeURIComponent(state.sessionId)), {
        method: "DELETE", headers, keepalive: true
      });
    }
    void fetch(apiURL("/authorization"), {
      method: "DELETE", headers, keepalive: true
    });
  });
})();
