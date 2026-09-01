const evidenceDirectory = '.runtime/tests/platform-primitives/task-008-window-parity';
const evidencePath = `${evidenceDirectory}/example.json`;
const capabilities = window.getCapabilities();
const windows = window.list();

let activeReadable = false;
try {
  const active = await window.getActiveWindow();
  activeReadable = Boolean(active && active.id && active.pid >= 0);
} catch (_) {
  activeReadable = false;
}

const evidence = {
  schemaVersion: 1,
  platform: capabilities.platform,
  backend: capabilities.backend,
  capabilities: capabilities.capabilities,
  windowCount: windows.length,
  activeReadable,
};

File.ensureDir(evidenceDirectory);
File.write(evidencePath, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ ok: true, evidence: evidencePath }));
