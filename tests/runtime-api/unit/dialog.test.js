(() => {
  const { assert, equal, test } = RuntimeAPITest;
  RuntimeAPITest.contractObject('Dialog');

  test({
    name: 'Dialog is injected fail-closed with a stable disabled capability report',
    tier: 'unit',
    covers: ['Dialog.getCapabilities'],
  }, async () => {
    const capabilities = Dialog.getCapabilities();
    equal(capabilities.enabled, false, 'Dialog unexpectedly enabled without ui');
    equal(capabilities.available, false, 'disabled Dialog reported available');
    equal(capabilities.activationSource, 'disabled', 'unexpected Dialog activation source');
    equal(capabilities.maxConcurrent, 1, 'Dialog concurrency contract changed');
  });

  test({
    name: 'disabled Dialog methods reject with DIALOG_DISABLED and no prompt data',
    tier: 'unit',
    covers: ['Dialog.alert', 'Dialog.confirm', 'Dialog.prompt'],
  }, async () => {
    for (const [name, invoke] of [
      ['Dialog.alert', () => Dialog.alert('message')],
      ['Dialog.confirm', () => Dialog.confirm('message')],
      ['Dialog.prompt', () => Dialog.prompt({ message: 'message', secure: true })],
    ]) {
      let error = null;
      try { await invoke(); } catch (caught) { error = caught; }
      assert(error, name + ' did not reject');
      equal(error.code, 'DIALOG_DISABLED', name + ' returned the wrong code');
      equal(error.operation, name, name + ' returned the wrong operation');
      equal(error.capability, 'ui', name + ' omitted ui capability');
      assert(!String(error.message).includes('message'), name + ' leaked prompt/message content');
    }
  });

  test({
    name: 'global dialog aliases are thin forwards to Dialog',
    tier: 'unit',
    covers: ['global.alert', 'global.confirm', 'global.prompt'],
  }, async () => {
    const calls = [];
    await RuntimeAPITest.withGlobal('Dialog', {
      alert: value => { calls.push(['alert', value]); return Promise.resolve(undefined); },
      confirm: value => { calls.push(['confirm', value]); return Promise.resolve(true); },
      prompt: value => { calls.push(['prompt', value]); return Promise.resolve('value'); },
      getCapabilities: () => ({}),
    }, async () => {
      equal(await alert('alert message'), undefined, 'alert alias changed resolution');
      equal(await confirm('confirm message'), true, 'confirm alias changed resolution');
      equal(await prompt('prompt message'), 'value', 'prompt alias changed resolution');
    });
    equal(JSON.stringify(calls), JSON.stringify([
      ['alert', 'alert message'], ['confirm', 'confirm message'], ['prompt', 'prompt message'],
    ]), 'aliases did not forward exactly once');
  });
})();
