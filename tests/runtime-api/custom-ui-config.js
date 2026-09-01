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

console.log("CUSTOM_UI_CONFIG_OK=" + JSON.stringify(actual));
