// A Dialog Promise with no await/then/catch/finally must not pin the execution.
// The wait gives the real native window time to appear before normal teardown
// closes it; do not add a handler to `forgotten`.

async function main() {
  const forgotten = Dialog.alert({
    title: 'Dialog unobserved cleanup',
    message: 'This native alert is deliberately not observed.',
    okText: 'Close during teardown',
  });
  if (!(forgotten instanceof Promise)) throw new Error('Dialog.alert did not return a native Promise');
  await sleep(700);
  console.log(JSON.stringify({ dialogUnobserved: 'created-and-left-unobserved' }));
}

await main();
