const watcherA = await Audio.watchSound({
  source: { type: 'system' },
  references: [{ id: 'reference-a', path: 'reference.wav' }],
}, () => {});

const watcherB = await Audio.watchSound({
  source: { type: 'system' },
  references: [{ id: 'reference-b', path: 'reference.wav' }],
}, () => {});

// Consume separate teardown Interrupts. Goja clears an Interrupt after one
// abrupt Promise job, so both retained reactions must remain bounded.
watcherA.wait().catch(() => { for (;;) {} });
watcherB.wait().catch(() => { for (;;) {} });

File.write('armed', 'true');
for (;;) {}
