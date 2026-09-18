'use strict';

const capabilities = ui.getCapabilities();
if (!capabilities.enabled) {
  throw new Error('Notify Demo requires the adjacent clawdesk.runtime.json UI capability.');
}

const toast = await ui.toast({
  message: 'Notify Demo is running.',
  caption: 'This OpenDesk toast appears only after you explicitly run the Flow.',
  level: 'success',
  timeoutMs: 5000,
});

console.log('OpenDesk Notify Demo: toast requested after explicit run (activation=' + capabilities.activationSource + ').');
await toast.waitUntilClosed();
