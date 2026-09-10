const expectation = globalThis.RUNTIME_API_EXTRA;

if (!expectation || typeof expectation !== "object") {
  throw new Error("CUSTOM_UI_CONFIG_EXPECTATION_MISSING");
}

const capabilities = ui.getCapabilities();
const actual = {
  enabled: capabilities.enabled,
  activationSource: capabilities.activationSource,
  executionActivationSource: Execution.activationSource,
  floatingWindowDefined: typeof FloatingWindow !== "undefined",
  notifyOutcome: null,
};

for (const key of ["enabled", "activationSource", "executionActivationSource", "floatingWindowDefined"]) {
  if (actual[key] !== expectation[key]) {
    throw new Error(
      "CUSTOM_UI_CONFIG_MISMATCH " + key +
      " actual=" + JSON.stringify(actual[key]) +
      " expected=" + JSON.stringify(expectation[key])
    );
  }
}

if (capabilities.enabled && capabilities.available) {
  const hint = await ui.notify({message: "Custom UI authorization probe", timeoutMs: 80});
  const state = await hint.getState();
  if (!state.visible || !state.notification
      || state.notification.message !== "Custom UI authorization probe") {
    throw new Error("CUSTOM_UI_CONFIG_NOTIFY_NOT_VISIBLE");
  }
  const closed = await hint.waitUntilClosed();
  if (closed.status !== "closed") throw new Error("CUSTOM_UI_CONFIG_NOTIFY_NOT_CLOSED");
  actual.notifyOutcome = "native";
} else {
  let notifyError = null;
  try { await ui.notify("must not appear"); } catch (error) { notifyError = error; }
  const expectedCodes = capabilities.enabled
    ? ["UNSUPPORTED_PLATFORM", "UI_HOST_NOT_FOUND"]
    : ["UI_DISABLED"];
  if (!notifyError || !expectedCodes.includes(notifyError.code)) {
    throw new Error(
      "CUSTOM_UI_CONFIG_NOTIFY_ERROR actual=" +
      JSON.stringify(notifyError && notifyError.code) +
      " expected=" + JSON.stringify(expectedCodes)
    );
  }
  actual.notifyOutcome = notifyError.code;
}

console.log("CUSTOM_UI_CONFIG_OK=" + JSON.stringify(actual));
