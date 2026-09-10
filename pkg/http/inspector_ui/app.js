(function () {
  "use strict";

  const model = globalThis.OpenDeskWorkbenchModel;
  const elements = {};
  const state = {
    token: "", sessionId: "", sessionToken: "", windows: [],
    observation: null, selectedNode: null, validation: null, review: null, handoff: null
  };
  const ids = [
    "connection-badge", "capability-summary", "window-select", "refresh-windows",
    "create-session", "take-snapshot", "close-session", "limit-depth", "limit-nodes",
    "limit-timeout", "global-message", "tree-completeness", "tree-search", "tree",
    "preview-state", "layout-empty", "layout", "observation-meta", "selection-state",
    "raw-properties", "business-alias", "human-note", "intended-usage", "locator-role",
    "locator-name", "locator-identifier", "validate-locator", "validation-state",
    "validation-detail", "save-review", "export-handoff", "copy-agent", "copy-js",
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

  async function request(path, options) {
    const init = Object.assign({ method: "GET", headers: {} }, options || {});
    init.headers = Object.assign({}, init.headers, { "X-OpenDesk-Inspector": "1" });
    if (state.token) init.headers.Authorization = "Bearer " + state.token;
    if (state.sessionToken) init.headers["X-OpenDesk-Inspector-Session"] = state.sessionToken;
    if (Object.prototype.hasOwnProperty.call(init, "body")) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(init.body);
    }
    const response = await fetch("/api/inspector/v1" + path, init);
    let payload;
    try { payload = await response.json(); } catch (_) { payload = null; }
    if (!response.ok || !payload || payload.code !== 0) {
      throw new Error(apiError(payload, "Inspector HTTP " + response.status));
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
    state.validation = null;
    state.handoff = null;
    setBadge(elements["validation-state"], "NOT_VALIDATED", "neutral");
    elements["validation-detail"].textContent = "Edited candidate requires fresh backend validation; snapshot filtering does not validate it.";
    updateButtons();
  }

  function updateButtons() {
    const paired = Boolean(state.token);
    const scoped = Boolean(state.sessionId && state.sessionToken);
    const selected = Boolean(state.selectedNode && state.observation);
    elements["refresh-windows"].disabled = !paired || scoped;
    elements["window-select"].disabled = !paired || scoped;
    elements["create-session"].disabled = !paired || scoped || !elements["window-select"].value;
    elements["take-snapshot"].disabled = !scoped;
    elements["close-session"].disabled = !scoped;
    elements["validate-locator"].disabled = !scoped || !selected || Object.keys(currentLocator()).length === 0;
    elements["save-review"].disabled = !scoped || !selected || Object.keys(currentLocator()).length === 0;
    elements["export-handoff"].disabled = !state.review;
    elements["copy-agent"].disabled = !state.review;
    elements["copy-js"].disabled = !state.review;
  }

  async function pair() {
    const fragment = new URLSearchParams(location.hash.replace(/^#/, ""));
    const code = fragment.get("pair") || "";
    history.replaceState(null, "", location.pathname + location.search);
    if (!code) throw new Error("Missing one-time pairing code. Launch Workbench from OpenDesk again.");
    const paired = await request("/pair", { method: "POST", body: { code } });
    state.token = paired.token;
    setBadge(elements["connection-badge"], "Paired", "good");
    message("Paired to this loopback OpenDesk process. Tokens are kept only in page memory.", "success");
    updateButtons();
    await Promise.all([loadCapabilities(), loadWindows()]);
  }

  async function loadCapabilities() {
    const data = await request("/capabilities");
    const accessibility = data && data.accessibility || {};
    const backend = accessibility.backend || accessibility.platform || "unknown backend";
    const availability = accessibility.available === false ? "unavailable" : "available";
    elements["capability-summary"].textContent = backend + " · " + availability;
  }

  async function loadWindows() {
    message("Reading the bounded list of windows available for explicit selection…", "info");
    const windows = await request("/windows");
    state.windows = Array.isArray(windows) ? windows : [];
    const select = elements["window-select"];
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
    state.observation = null;
    state.selectedNode = null;
    state.review = null;
    state.handoff = null;
    message("Scoped session opened for the explicitly selected window. Tree selection remains read-only.", "success");
    updateButtons();
    await takeSnapshot();
  }

  async function takeSnapshot() {
    message("Resolving the selected window and taking a bounded Accessibility snapshot…", "info");
    try {
      const observation = await request("/sessions/" + encodeURIComponent(state.sessionId) + "/observations", {
        method: "POST", body: { limits: limits() }
      });
      state.observation = observation;
      state.selectedNode = null;
      state.validation = null;
      state.review = null;
      state.handoff = null;
      elements["tree-search"].value = "";
      renderObservation();
      const completeness = model.completeness(observation);
      message("Accessibility observation captured: " + completeness.label + ".", completeness.tone === "good" ? "success" : "warning");
    } catch (error) {
      if (state.observation) state.observation.freshness = "stale";
      renderObservation();
      throw error;
    }
  }

  function renderObservation() {
    renderTree();
    renderLayout();
    renderMeta();
    renderSelection();
    const completeness = model.completeness(state.observation);
    setBadge(elements["tree-completeness"], completeness.label, completeness.tone);
    updateButtons();
  }

  function renderTree() {
    const container = elements.tree;
    container.replaceChildren();
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
    const children = Array.isArray(node.children) ? node.children : [];
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "tree-toggle";
    toggle.textContent = collapsible && children.length ? "▾" : "·";
    toggle.disabled = !(collapsible && children.length);
    toggle.setAttribute("aria-label", "Expand or collapse node");
    toggle.addEventListener("click", function () {
      const childContainer = row.parentElement && row.parentElement.querySelector(":scope > .tree-children");
      if (!childContainer) return;
      const collapsed = childContainer.classList.toggle("collapsed");
      toggle.textContent = collapsed ? "▸" : "▾";
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
    state.selectedNode = node;
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
    setBadge(elements["selection-state"], state.selectedNode.nodeId || "Selected", "good");
    elements["raw-properties"].textContent = JSON.stringify(state.selectedNode, null, 2);
  }

  function renderLayout() {
    const container = elements.layout;
    container.replaceChildren();
    container.classList.remove("ready");
    elements["layout-empty"].hidden = false;
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
      ["Reason", state.observation.reason || "none"], ["Evidence", state.observation.evidenceSource]
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
    const receipt = await request("/sessions/" + encodeURIComponent(state.sessionId) + "/validate", {
      method: "POST", body: { locator: currentLocator(), limits: limits() }
    });
    state.validation = receipt;
    state.handoff = null;
    setBadge(elements["validation-state"], receipt.status, model.validationTone(receipt.status));
    elements["validation-detail"].textContent = receipt.status + " · receipt " + receipt.receiptId + " · execution " + (receipt.executionId || "unknown") + " · performedAction=false";
    message("Live locator validation completed with " + receipt.status + ".", receipt.status === "UNIQUE" ? "success" : "warning");
    updateButtons();
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
    await request("/sessions/" + encodeURIComponent(state.sessionId), { method: "DELETE" });
    state.sessionId = "";
    state.sessionToken = "";
    state.observation = null;
    state.selectedNode = null;
    state.validation = null;
    state.review = null;
    state.handoff = null;
    renderObservation();
    message("Inspector session stopped and execution-scoped Accessibility resources released.", "success");
    updateButtons();
  }

  function bind() {
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
    run(pair);
  });
})();
