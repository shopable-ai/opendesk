await notify({
  title: 'OpenDesk',
  message: 'This is an example notification',
  sound: true,
  timeout: 3000,
});

await sleep(3000);
notify('OpenDesk example notification');
