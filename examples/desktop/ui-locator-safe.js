// Run from repository root against a disposable, fully visible native textField.
// This example is read-only unless OPENDESK_EXAMPLE_ALLOW_WRITE=1 is explicit.
// ./dist/opendesk -script examples/desktop/ui-locator-safe.js -console-mode script
'use strict';

const env = Execution.env;
const title = env.OPENDESK_EXAMPLE_WINDOW_TITLE;
const pid = Number(env.OPENDESK_EXAMPLE_WINDOW_PID);
const identifier = env.OPENDESK_EXAMPLE_INPUT_IDENTIFIER;
if (typeof title !== 'string' || !title.trim() ||
    !Number.isSafeInteger(pid) || pid <= 0 ||
    typeof identifier !== 'string' || !identifier.trim()) {
  throw new Error('Specify WINDOW_TITLE, WINDOW_PID, and INPUT_IDENTIFIER for a disposable fixture');
}

const win = await window.wait({ title, pid }, { timeout: 10000, polling: 200 });
const field = UI.within(win).locator({ role: 'textField', identifier });
await field.waitFor({ state: 'exists', timeout: 5000 });

const initialValue = await field.getValue();
console.log(JSON.stringify({ mode: 'read-only', initialValue, windowId: win.id }));

if (env.OPENDESK_EXAMPLE_ALLOW_WRITE === '1') {
  if (typeof env.OPENDESK_EXAMPLE_TEXT !== 'string') {
    throw new Error('Explicit OPENDESK_EXAMPLE_TEXT is required before native input');
  }
  // Native action submitted at most once. A failed/unknown result is terminal.
  const receipt = await field.setValue(env.OPENDESK_EXAMPLE_TEXT);
  const observed = await field.getValue();
  if (observed !== env.OPENDESK_EXAMPLE_TEXT) {
    throw new Error('The current native value does not match the requested text');
  }
  console.log(JSON.stringify({
    mode: 'native-setValue', actionState: receipt.actionState,
    verified: receipt.verified === true, observedValue: observed,
  }));
}
