(function () {
  "use strict";

  const model = globalThis.OpenDeskWorkbenchModel;
  const apiPrefix = "/api/accessibility-inspector/v1";
  const controlPath = "/api/accessibility-workbench/v1/launch";
  const defaultControlURL = "http://127.0.0.1:60844" + controlPath;
  let apiOrigin = "";
  const elements = {};
  const state = {
    token: "", sessionId: "", sessionToken: "", windows: [],
    observation: null, selectedNode: null, validation: null, review: null, handoff: null,
    launchPhase: "idle", snapshotPhase: "idle", selectionStatus: "none", selectionAnchor: null,
    validationPhase: "idle",
    collapsedNodeIds: new Set(),
    scopeEpoch: 0, observationSequence: 0, validationSequence: 0,
    observationController: null, validationController: null
  };
  const ids = [
    "connect-opendesk", "connection-badge", "capability-summary", "window-select", "refresh-windows",
    "create-session", "take-snapshot", "close-session", "limit-depth", "limit-nodes",
    "limit-timeout", "global-message", "tree-completeness", "tree-search", "tree",
    "preview-state", "layout-empty", "layout", "observation-meta", "selection-state",
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

  function apiError(payload, fallback) {
    if (payload && typeof payload.message === "string") return payload.message;
    return fallback || "Accessibility Workbench request failed";
  }

  function configureAPIOrigin(value) {
    if (!value) return "";
    const candidate = new URL(value);
    const loopback = candidate.hostname === "127.0.0.1" || candidate.hostname === "localhost";
    if (candidate.protocol !== "http:" || !loopback || candidate.username || candidate.password ||
        candidate.pathname !== "/" || candidate.search || candidate.hash) {
      throw new Error("The Workbench API endpoint must be a plain HTTP loopback origin.");
    }
    return candidate.origin;
  }

  function configureControlURL(value) {
    const candidate = new URL(value || defaultControlURL);
    configureAPIOrigin(candidate.origin);
    if (candidate.pathname !== controlPath || candidate.search || candidate.hash) {
      throw new Error("The OpenDesk control URL must use the Workbench launch path without query or fragment data.");
    }
    return candidate.href;
  }

  function currentFrontendURL() {
    const candidate = new URL(location.href);
    configureAPIOrigin(candidate.origin);
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
    state.handoff = null;
    setBadge(elements["validation-state"], "NOT_VALIDATED", "neutral");
    elements["validation-detail"].textContent = "Edited candidate requires fresh backend validation; snapshot filtering does not validate it.";
    updateButtons();
  }

  function updateButtons() {
    const paired = Boolean(state.token);
    const scoped = Boolean(state.sessionId && state.sessionToken);
    const observationCurrent = Boolean(state.observation && state.observation.freshness !== "stale" && state.snapshotPhase !== "loading");
    const selected = Boolean(state.selectedNode && observationCurrent && state.selectionStatus !== "stale");
    elements["connect-opendesk"].disabled = paired || state.launchPhase === "loading";
    elements["connect-opendesk"].hidden = paired;
    elements["refresh-windows"].disabled = !paired || scoped;
    elements["window-select"].disabled = !paired || scoped;
    elements["create-session"].disabled = !paired || scoped || !elements["window-select"].value;
    elements["take-snapshot"].disabled = !scoped || state.snapshotPhase === "loading";
    elements["close-session"].disabled = !scoped;
    elements["validate-locator"].disabled = !scoped || !selected || state.validationPhase === "loading" || Object.keys(currentLocator()).length === 0;
    elements["save-review"].disabled = !scoped || !selected || Object.keys(currentLocator()).length === 0;
    elements["import-handoff"].disabled = !scoped || !selected;
    elements["export-handoff"].disabled = !state.review || !observationCurrent;
    elements["copy-agent"].disabled = !state.review || !observationCurrent;
    elements["copy-js"].disabled = !state.review || !observationCurrent;
  }

  async function connectToOpenDesk() {
    state.launchPhase = "loading";
    setBadge(elements["connection-badge"], "Connecting", "pending");
    message("Asking the already-running OpenDesk service for a short-lived Workbench session…", "info");
    updateButtons();
    try {
      const query = new URLSearchParams(location.search);
      const controlURL = configureControlURL(query.get("control") || defaultControlURL);
      const response = await fetch(controlURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OpenDesk-Workbench-Control": "1"
        },
        body: JSON.stringify({ frontendUrl: currentFrontendURL() })
      });
      let payload;
      try { payload = await response.json(); } catch (_) { payload = null; }
      if (!response.ok || !payload || payload.code !== 0 || !payload.data || typeof payload.data.url !== "string") {
        throw new Error(apiError(payload, "OpenDesk control request failed with HTTP " + response.status));
      }
      location.replace(payload.data.url);
    } catch (error) {
      state.launchPhase = "idle";
      setBadge(elements["connection-badge"], "Not connected", "neutral");
      updateButtons();
      throw error;
    }
  }

  async function pair() {
    const fragment = new URLSearchParams(location.hash.replace(/^#/, ""));
    const code = fragment.get("pair") || "";
    apiOrigin = configureAPIOrigin(fragment.get("api") || "");
    history.replaceState(null, "", location.pathname + location.search);
    if (!code) throw new Error("Missing one-time pairing code. Launch Workbench from OpenDesk again.");
    const paired = await request("/pair", { method: "POST", body: { code } });
    state.token = paired.token;
    setBadge(elements["connection-badge"], "Paired", "good");
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
    state.windows = [];
    const select = elements["window-select"];
    select.replaceChildren();
    const loading = document.createElement("option");
    loading.value = "";
    loading.textContent = "Refreshing window list…";
    select.appendChild(loading);
    updateButtons();
    let windows;
    try {
      windows = await request("/windows");
    } catch (error) {
      loading.textContent = "Window refresh failed";
      throw error;
    }
    state.windows = Array.isArray(windows) ? windows : [];
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = state.windows.length ? "Choose a window" : "No eligible windows";
    select.appendChild(placeholder);
    for (const item of state.windows) {
      const option = document.createElement("option");
      option.value = item.windowId;
      option.textContent = (item.application ? item.application + " · " : "") + (item.title || "Untitled") + " · pid " + item.pid;
      select.appendChild(option);
    }
    message(state.windows.length + " eligible window(s). Nothing is observed until you choose one and open its scope.", "success");
    updateButtons();
  }

  async function createSession() {
    const windowId = elements["window-select"].value;
    if (!windowId) return;
    const data = await request("/sessions", { method: "POST", body: { windowId, limits: limits() } });
    state.sessionId = data.sessionId;
    state.sessionToken = data.sessionToken;
    state.scopeEpoch += 1;
    state.observation = null;
    state.selectedNode = null;
    state.selectionStatus = "none";
    state.selectionAnchor = null;
    state.collapsedNodeIds.clear();
    state.review = null;
    state.handoff = null;
    message("Scoped session opened for the explicitly selected window. Tree selection remains read-only.", "success");
    updateButtons();
    await takeSnapshot();
  }

  async function takeSnapshot() {
    message("Resolving the selected window and taking a bounded Accessibility snapshot…", "info");
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
    const previousSelection = state.selectionAnchor ||
      (previousObservation && state.selectedNode ? model.selectionAnchor(previousObservation.root, state.selectedNode) : null);
    state.snapshotPhase = "loading";
    state.validation = null;
    state.review = null;
    state.handoff = null;
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
    container.replaceChildren();
    container.setAttribute("aria-busy", state.snapshotPhase === "loading" ? "true" : "false");
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
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent = "No accessibility observation available.";
      container.appendChild(empty);
      return;
    }
    const query = elements["tree-search"].value.trim();
    if (query) {
      const matches = model.searchSnapshot(root, query);
      for (const entry of matches) container.appendChild(treeRow(entry.node, entry.depth, false));
      if (!matches.length) {
        const empty = document.createElement("p");
        empty.className = "hint";
        empty.textContent = "No nodes in this captured snapshot match the preview search.";
        container.appendChild(empty);
      }
      return;
    }
    container.appendChild(treeBranch(root, 0));
  }

  function treeBranch(node, depth) {
    const branch = document.createElement("div");
    branch.appendChild(treeRow(node, depth, true));
    const children = Array.isArray(node.children) ? node.children : [];
    if (children.length) {
      const childContainer = document.createElement("div");
      childContainer.className = "tree-children";
      if (state.collapsedNodeIds.has(node.nodeId)) childContainer.classList.add("collapsed");
      childContainer.dataset.parent = node.nodeId || "";
      for (const child of children) childContainer.appendChild(treeBranch(child, depth + 1));
      branch.appendChild(childContainer);
    }
    return branch;
  }

  function treeRow(node, depth, collapsible) {
    const row = document.createElement("div");
    row.className = "tree-row" + (state.selectedNode && state.selectedNode.nodeId === node.nodeId ? " selected" : "");
    row.style.paddingLeft = Math.min(depth * 14, 140) + "px";
    row.setAttribute("role", "treeitem");
    row.setAttribute("aria-level", String(depth + 1));
    const children = Array.isArray(node.children) ? node.children : [];
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "tree-toggle";
    const collapsed = state.collapsedNodeIds.has(node.nodeId);
    toggle.textContent = collapsible && children.length ? (collapsed ? "▸" : "▾") : "·";
    toggle.disabled = !(collapsible && children.length);
    toggle.setAttribute("aria-label", "Expand or collapse node");
    if (collapsible && children.length) row.setAttribute("aria-expanded", collapsed ? "false" : "true");
    toggle.addEventListener("click", function () {
      const childContainer = row.parentElement && row.parentElement.querySelector(":scope > .tree-children");
      if (!childContainer) return;
      const nowCollapsed = childContainer.classList.toggle("collapsed");
      if (nowCollapsed) state.collapsedNodeIds.add(node.nodeId);
      else state.collapsedNodeIds.delete(node.nodeId);
      toggle.textContent = nowCollapsed ? "▸" : "▾";
      row.setAttribute("aria-expanded", nowCollapsed ? "false" : "true");
    });
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tree-node";
    const label = document.createElement("span");
    label.className = "tree-label";
    const role = document.createElement("span");
    role.className = "tree-role";
    role.textContent = node.role || "unknown";
    label.append(role, document.createTextNode(" · " + (node.name || node.identifier || "unnamed")));
    const flags = document.createElement("span");
    flags.className = "tree-flags";
    flags.textContent = model.nodeFlags(node).join(" · ");
    button.append(label, flags);
    button.addEventListener("click", function () { selectNode(node); });
    row.append(toggle, button);
    return row;
  }

  function selectNode(node) {
    if (state.validationController) state.validationController.abort();
    state.validationSequence += 1;
    state.selectedNode = node;
    state.selectionStatus = state.observation && state.observation.freshness === "stale" ? "stale" : "selected";
    state.selectionAnchor = state.observation ? model.selectionAnchor(state.observation.root, node) : null;
    state.validation = null;
    state.review = null;
    state.handoff = null;
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
  }

  function renderSelection() {
    if (!state.selectedNode) {
      setBadge(elements["selection-state"], "No node", "neutral");
      elements["raw-properties"].textContent = "Select a tree node.";
      return;
    }
    if (state.selectionStatus === "stale" || (state.observation && state.observation.freshness === "stale")) {
      setBadge(elements["selection-state"], "Stale selection", "bad");
      elements["raw-properties"].textContent = "STALE — shown only from the previous observation; do not use for review or handoff.\n\n" +
        JSON.stringify(model.nodeDetails(state.selectedNode), null, 2);
      return;
    }
    const label = state.selectionStatus === "preserved" ? "Restored" : (state.selectedNode.nodeId || "Selected");
    setBadge(elements["selection-state"], label, state.selectionStatus === "preserved" ? "warn" : "good");
    elements["raw-properties"].textContent = JSON.stringify(model.nodeDetails(state.selectedNode), null, 2);
  }

  function renderLayout() {
    const container = elements.layout;
    container.replaceChildren();
    container.classList.remove("ready");
    elements["layout-empty"].hidden = false;
    if (state.snapshotPhase === "loading" || (state.observation && state.observation.freshness === "stale")) {
      setBadge(elements["preview-state"], "Stale", "bad");
      elements["layout-empty"].textContent = "Layout mapping is disabled until a current observation succeeds.";
      return;
    }
    const mapping = model.layoutMapping(state.observation, Math.max(container.clientWidth, 320), 460);
    if (!mapping.available) {
      setBadge(elements["preview-state"], "Tree only", "warn");
      elements["layout-empty"].textContent = "Layout unavailable: " + mapping.reason + ". Native bounds are shown as facts only and are never guessed into browser or mouse coordinates.";
      return;
    }
    container.classList.add("ready");
    elements["layout-empty"].hidden = true;
    setBadge(elements["preview-state"], "Logical mapping", "good");
    for (const box of mapping.boxes) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "layout-box" + (state.selectedNode && state.selectedNode.nodeId === box.nodeId ? " selected" : "");
      button.style.left = box.left + "px";
      button.style.top = box.top + "px";
      button.style.width = box.width + "px";
      button.style.height = box.height + "px";
      button.title = box.label + " · logical " + JSON.stringify(box.logicalBounds);
      button.setAttribute("aria-label", "Select " + box.label + " in the captured observation");
      button.addEventListener("click", function () {
        const entry = model.flattenTree(state.observation.root).find(item => item.node.nodeId === box.nodeId);
        if (entry) selectNode(entry.node);
      });
      container.appendChild(button);
    }
  }

  function renderMeta() {
    const list = elements["observation-meta"];
    list.replaceChildren();
    if (!state.observation) return;
    const entries = [
      ["Observation", state.observation.observationId], ["Observed", state.observation.observedAt],
      ["Execution", state.observation.executionId], ["Request", state.observation.requestId],
      ["Backend", state.observation.backend], ["Completeness", model.completeness(state.observation).label],
      ["Reason", state.observation.reason || "none"], ["Freshness", state.observation.freshness || "unknown"],
      ["Stale reason", state.observation.staleReason || "none"],
      ["Nodes / depth", state.observation.stats ? String(state.observation.stats.nodes) + " / " + String(state.observation.stats.maxDepth) : "unknown"],
      ["Evidence", state.observation.evidenceSource]
    ];
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
    const payload = {
      observationId: state.observation.observationId,
      selectedNodeId: state.selectedNode.nodeId,
      businessAlias: elements["business-alias"].value,
      humanNote: elements["human-note"].value,
      intendedUsage: elements["intended-usage"].value,
      locator: currentLocator()
    };
    const data = await request("/sessions/" + encodeURIComponent(state.sessionId) + "/review", { method: "PUT", body: payload });
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
    if (file.size <= 0 || file.size > 65536) throw new Error("Imported handoff must be a non-empty JSON file no larger than 64 KiB.");
    let handoff;
    try { handoff = JSON.parse(await file.text()); }
    catch (_) { throw new Error("Imported handoff is not valid JSON data."); }
    const data = await request("/sessions/" + encodeURIComponent(state.sessionId) + "/import", {
      method: "POST", body: { selectedNodeId: state.selectedNode.nodeId, handoff }
    });
    const review = data.review || {};
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
    await navigator.clipboard.writeText(value);
    message(label + " copied. Captured and human-authored text remains untrusted data.", "success");
  }

  async function closeSession() {
    if (!state.sessionId) return;
    const sessionId = state.sessionId;
    state.scopeEpoch += 1;
    state.observationSequence += 1;
    state.validationSequence += 1;
    if (state.observationController) state.observationController.abort();
    if (state.validationController) state.validationController.abort();
    await request("/sessions/" + encodeURIComponent(sessionId), { method: "DELETE" });
    state.sessionId = "";
    state.sessionToken = "";
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
    renderObservation();
    message("Inspector session stopped and execution-scoped Accessibility resources released.", "success");
    updateButtons();
  }

  function bind() {
    elements["connect-opendesk"].addEventListener("click", () => run(connectToOpenDesk));
    elements["refresh-windows"].addEventListener("click", () => run(loadWindows));
    elements["window-select"].addEventListener("change", updateButtons);
    elements["create-session"].addEventListener("click", () => run(createSession));
    elements["take-snapshot"].addEventListener("click", () => run(takeSnapshot));
    elements["close-session"].addEventListener("click", () => run(closeSession));
    elements["tree-search"].addEventListener("input", renderTree);
    for (const id of ["locator-role", "locator-name", "locator-identifier"]) {
      elements[id].addEventListener("input", markLocatorEdited);
    }
    elements["validate-locator"].addEventListener("click", () => run(validateLocator));
    elements["save-review"].addEventListener("click", () => run(saveReview));
    elements["import-handoff"].addEventListener("change", () => run(importHandoff));
    elements["export-handoff"].addEventListener("click", () => run(exportHandoff));
    elements["copy-agent"].addEventListener("click", () => run(async function () { await copyText(model.agentPrompt(await ensureHandoff()), "Agent handoff prompt"); }));
    elements["copy-js"].addEventListener("click", () => run(async function () { await copyText(model.jsSnippet(await ensureHandoff()), "OpenDesk JavaScript locator snippet"); }));
  }

  async function run(operation) {
    try { await operation(); }
    catch (error) { message(error && error.message || String(error), "error"); }
  }

  document.addEventListener("DOMContentLoaded", function () {
    cacheElements();
    bind();
    renderObservation();
    const fragment = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (fragment.get("pair")) {
      run(pair);
    } else {
      setBadge(elements["connection-badge"], "Not connected", "neutral");
      message("OpenDesk stays independent. Click Connect OpenDesk only when you want a short-lived inspection session.", "info");
      updateButtons();
    }
  });

  addEventListener("pagehide", function () {
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
