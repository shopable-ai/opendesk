// The value is generated only at runtime. It must be accepted by the native
// password control, but neither the value nor its derived text is logged.
(async () => {
  const value = Dialog.prompt({
    title: 'Dialog secure prompt smoke', message: 'Enter a generated private value.',
    secure: true, placeholder: 'private value', maxLength: 64,
  });
  await sleep(500);
  await keyboard.type(String(Date.now()));
  await keyboard.press('ENTER');
  const result = await value;
  if (typeof result !== 'string' || result.length === 0) throw new Error('secure prompt was not confirmed');
  console.log(JSON.stringify({ dialogSecure: 'passed' }));
})();
