// Run from the repository root:
// go run ./cmd/opendesk -script examples/events/clipboard-changed.js -console-mode script

const evidenceDirectory = '.runtime/tests/platform-primitives/task-003-events';
const evidencePath = File.join(evidenceDirectory, 'clipboard-changed.json');
const previousText = clipboard.paste();
const capabilities = Events.getCapabilities();

if (!capabilities.events['clipboard.changed'].supported) {
  throw new Error('clipboard.changed is not supported on this platform');
}

try {
  const pending = Events.once('clipboard.changed', { timeout: 5000 });

  // Give the polling backend one complete baseline interval before mutation.
  await sleep(500);
  clipboard.copy(`opendesk-events-smoke-${Date.now()}`);

  const event = await pending;
  const evidence = {
    schemaVersion: 1,
    task: 'TASK-003-event-watcher',
    platform: System.getPlatformInfo(),
    event: {
      schemaVersion: event.schemaVersion,
      type: event.type,
      backend: event.backend,
      timestamp: event.timestamp,
      sequence: event.sequence,
      coalesced: event.coalesced,
      changeCount: event.data.changeCount,
      contentIncluded: event.data.contentIncluded,
    },
    capability: capabilities.events['clipboard.changed'],
    clipboardContentRecorded: false,
  };

  File.ensureDir(evidenceDirectory);
  File.write(evidencePath, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ ok: true, evidencePath, event: evidence.event }));
} finally {
  // The legacy text Clipboard API cannot preserve non-text formats; this smoke
  // restores the prior text value and never writes it to logs/evidence.
  clipboard.copy(previousText);
}
