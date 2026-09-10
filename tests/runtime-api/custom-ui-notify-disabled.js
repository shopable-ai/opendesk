// From repository root:
// ./dist/opendesk -no-ui -script tests/runtime-api/custom-ui-notify-disabled.js -console-mode script
// Omit -no-ui in a script directory without a capability config to test the no-grant path.
'use strict';
if (ui.getCapabilities().enabled) throw new Error('this test requires UI disabled');
let failure;
try { await ui.notify('must not appear'); } catch (error) { failure = error; }
if (!failure || failure.code !== 'UI_DISABLED') throw new Error('disabled notify must fail with UI_DISABLED');
console.log('CUSTOM_UI_NOTIFY_DISABLED_PASS');
