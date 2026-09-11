// From repository root:
// ./dist/opendesk -no-ui -script tests/runtime-api/custom-ui-notify-disabled.js -console-mode script
// Omit -no-ui in a script directory without a capability config to test the no-grant path.
'use strict';
if (ui.getCapabilities().enabled) throw new Error('this test requires UI disabled');
if (typeof ui.toast !== 'function') throw new Error('toast facade must exist while UI is disabled');
let failure;
try { await ui.toast('must not appear'); } catch (error) { failure = error; }
if (!failure || failure.code !== 'UI_DISABLED') throw new Error('disabled toast must fail with UI_DISABLED');
if (failure.operation && failure.operation !== 'ui.toast') throw new Error('disabled toast should report ui.toast operation');
let legacyFailure;
try { await ui.notify('must not appear'); } catch (error) { legacyFailure = error; }
if (!legacyFailure || legacyFailure.code !== 'UI_DISABLED') throw new Error('legacy disabled notify must fail with UI_DISABLED');
console.log('CUSTOM_UI_TOAST_DISABLED_PASS');
