// Self-contained real native UI behavior used unchanged before and after packaging.
// The canonical test opens the Dialog, captures it, presses its default action,
// and compares the semantic result written by both executions.
'use strict';

const title = 'OpenDesk Protected Package Equivalence';
const capabilities = Dialog.getCapabilities();
if (!capabilities.enabled || !capabilities.available || !capabilities.confirm) {
  throw new Error('native Dialog.confirm capability is required');
}

const accepted = await Dialog.confirm({
  title,
  message: 'Runtime equivalence is visible.\nChoose Approve Equivalence to continue.',
  level: 'info',
  confirmText: 'Approve Equivalence',
  cancelText: 'Cancel',
  defaultAction: 'confirm',
});

const result = {
  schemaVersion: 1,
  contract: 'protected-package-native-ui-v1',
  title,
  action: accepted ? 'approved' : 'canceled',
  accepted,
};
File.write(
  File.join(Execution.artifactDir, 'business-result.json'),
  JSON.stringify(result, null, 2) + '\n',
);
if (!accepted) throw new Error('native UI equivalence was not approved');
console.log('protected-package-native-ui:approved');
