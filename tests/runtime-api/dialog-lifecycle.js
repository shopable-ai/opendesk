// Native, public-JavaScript Dialog smoke. Run through the official
// scripts/test_runtime_apis.sh dialog gate with -ui and the bundled host.
// The gate acknowledges each real native button through the documented,
// PID-scoped mouse.clickForPID API after independently proving its AXPress
// capability. Do not add option callbacks: Dialog is Promise-only.

async function main() {
  const settlementCounts = Object.create(null);
  const finallyCounts = Object.create(null);
  const track = (label, promise, flow) => {
    settlementCounts[label] = 0;
    finallyCounts[label] = 0;
    return promise
      .then(value => {
        settlementCounts[label]++;
        flow.push('then');
        return value;
      })
      .catch(error => {
        settlementCounts[label]++;
        flow.push('catch');
        throw error;
      })
      .finally(() => {
        finallyCounts[label]++;
        flow.push('finally');
      });
  };

  const order = ['before-alert'];
  console.log(JSON.stringify({ dialogNonBlockingState: order.slice() }));
  const alertFlow = [];
  const alertResult = track('initialAlert', alert({
    title: 'Dialog lifecycle alert',
    message: 'The AX controller acknowledges this native alert.',
    okText: 'Acknowledge alert',
  }), alertFlow);
  if (!(alertResult instanceof Promise)) throw new Error('alert did not return a native Promise');
  order.push('after-alert-call');
  console.log(JSON.stringify({ dialogNonBlockingState: order.slice() }));
  await sleep(120);
  order.push('event-loop-tick-before-settlement');
  console.log(JSON.stringify({ dialogNonBlockingState: order.slice() }));
  if (order.join(',') !== 'before-alert,after-alert-call,event-loop-tick-before-settlement') {
    throw new Error('alert synchronously blocked the EventLoop');
  }
  if (await alertResult !== undefined) throw new Error('alert resolution changed');
  order.push('after-alert-settlement');
  if (alertFlow.join(',') !== 'then,finally') {
    throw new Error('alert Promise continuation changed: ' + alertFlow.join(','));
  }

  const busyAlertFlow = [];
  const first = track('busyAlert', Dialog.alert({
    title: 'Dialog lifecycle busy',
    message: 'The second Dialog call must reject instead of opening.',
    okText: 'Acknowledge busy',
  }), busyAlertFlow);
  await sleep(200);
  const busyFlow = [];
  const busyError = await track(
    'busyRejection',
    Dialog.confirm({ message: 'This must not be displayed.' }),
    busyFlow,
  ).catch(error => error);
  if (!busyError || busyError.code !== 'DIALOG_BUSY' || busyError.operation !== 'Dialog.confirm') {
    throw new Error('concurrent Dialog call did not reject with DIALOG_BUSY');
  }
  if (busyFlow.join(',') !== 'catch,finally') {
    throw new Error('Dialog catch/finally control flow changed: ' + busyFlow.join(','));
  }
  await first;
  if (busyAlertFlow.join(',') !== 'then,finally') {
    throw new Error('busy alert continuation changed: ' + busyAlertFlow.join(','));
  }

  const continuation = [];
  const confirmed = track('confirmed', Dialog.confirm({
    title: 'Dialog lifecycle continuation',
    message: 'The AX controller confirms the default action.',
    confirmText: 'Confirm continuation',
    cancelText: 'Cancel cancellation',
  }), continuation);
  if (await confirmed !== true || continuation.join(',') !== 'then,finally') {
    throw new Error('Dialog then/catch/finally control flow changed: ' + continuation.join(','));
  }

  const confirmCancelFlow = [];
  const canceled = await track('confirmCanceled', Dialog.confirm({
    title: 'Dialog lifecycle cancellation',
    message: 'The AX controller chooses Cancel.',
    confirmText: 'Continue',
    cancelText: 'Cancel',
  }), confirmCancelFlow);
  if (canceled !== false) throw new Error('confirm cancellation did not resolve false');
  if (confirmCancelFlow.join(',') !== 'then,finally') {
    throw new Error('confirm cancellation entered the wrong Promise branch');
  }

  const typedValue = 'dialog-runtime-api-typed';
  const promptFlow = [];
  const entered = track('promptEntered', Dialog.prompt({
    title: 'Dialog lifecycle prompt',
    message: 'The separate public JavaScript controller types a fixed value before AXPressing Save.',
    placeholder: 'runtime-api',
    defaultValue: '',
    confirmText: 'Save',
    cancelText: 'Cancel',
    maxLength: 64,
  }), promptFlow);
  const enteredValue = await entered;
  if (enteredValue !== typedValue) throw new Error('native prompt did not return the typed value after Save');
  if (promptFlow.join(',') !== 'then,finally') throw new Error('prompt success entered the wrong Promise branch');

  const typedAlertFlow = [];
  await track('typedResultAlert', Dialog.alert({
    title: `Dialog typed result: ${enteredValue}`,
    message: `Prompt returned: ${enteredValue}`,
    level: 'success',
    okText: 'Acknowledge typed result',
  }), typedAlertFlow);

  const promptCancelFlow = [];
  const canceledPrompt = await track('promptCanceled', Dialog.prompt({
    title: 'Dialog lifecycle prompt cancellation',
    message: 'The AX controller chooses Cancel; the Promise must resolve null.',
    placeholder: 'This value is not submitted',
    confirmText: 'Save',
    cancelText: 'Cancel prompt',
    maxLength: 64,
  }), promptCancelFlow);
  if (canceledPrompt !== null) throw new Error('prompt cancellation did not resolve null');
  if (promptCancelFlow.join(',') !== 'then,finally') {
    throw new Error('prompt null cancellation entered the catch branch');
  }

  const nullAlertFlow = [];
  await track('nullResultAlert', Dialog.alert({
    title: 'Dialog canceled result: null',
    message: 'Prompt returned: null (the user canceled).',
    level: 'warning',
    okText: 'Acknowledge null result',
  }), nullAlertFlow);

  for (const label of Object.keys(settlementCounts)) {
    if (settlementCounts[label] !== 1 || finallyCounts[label] !== 1) {
      throw new Error(`Dialog ${label} did not settle/finalize exactly once: ${settlementCounts[label]}/${finallyCounts[label]}`);
    }
  }

  console.log(JSON.stringify({
    dialogLifecycle: 'passed',
    typedValue: enteredValue,
    promptCanceled: canceledPrompt,
    nonBlockingOrder: order,
    successFlow: continuation,
    rejectionFlow: busyFlow,
    settlementCounts,
    finallyCounts,
  }));
}

await main();
