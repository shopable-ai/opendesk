// The dialog gate writes the reviewed, current native AX button bounds to
// RUNTIME_API_EXTRA. This public Runtime API test can type a fixed non-secret
// prompt fixture, then performs exactly one documented PID-scoped AXPress. It
// does not create, mock, or inspect Dialog.

async function main() {
  const target = globalThis.RUNTIME_API_EXTRA && globalThis.RUNTIME_API_EXTRA.dialogAX;
  if (!target || !Number.isInteger(target.hostPid) || target.hostPid <= 0 ||
      !Number.isFinite(target.x) || !Number.isFinite(target.y) ||
      typeof target.title !== 'string' || typeof target.button !== 'string') {
    throw new Error('dialog AX controller requires reviewed hostPid, x, y, title, and button');
  }
  if (target.inputText !== undefined) {
    if (typeof target.inputText !== 'string' || target.inputText.length === 0) {
      throw new Error('dialog AX controller inputText must be a non-empty string');
    }
    // The host gives its real prompt control native focus before this separate
    // public JavaScript controller types into it.
    await sleep(100);
    await keyboard.type(target.inputText);
    await sleep(100);
  }
  await mouse.clickForPID(target.hostPid, target.x, target.y);
  console.log(JSON.stringify({
    dialogAXController: 'pressed',
    hostPid: target.hostPid,
    title: target.title,
    button: target.button,
    x: target.x,
    y: target.y,
    typedLength: typeof target.inputText === 'string' ? target.inputText.length : 0,
  }));
}

await main();
