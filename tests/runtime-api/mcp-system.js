// Safe native System contract checks. No addresses, raw command output, desktop
// permissions, audio playback, network traffic or external model calls.
function check(value, message) {
  if (!value) throw new Error(`mcp-system: ${message}`);
}

check(typeof System.getNetworkInterfaces === 'function', 'network query exposed');
check(typeof System.getPowerInfo === 'function', 'power query exposed');
const interfaces = System.getNetworkInterfaces();
check(Array.isArray(interfaces), 'network query returns a synchronous array');
const counters = ['bytesSent', 'bytesRecv', 'packetsSent', 'packetsRecv', 'errors', 'drops'];
for (const entry of interfaces) {
  check(entry !== null && typeof entry === 'object' && !Array.isArray(entry), 'interface object');
  check(typeof entry.name === 'string', 'interface name is a string');
  for (const key of counters) {
    check(typeof entry[key] === 'number' && Number.isFinite(entry[key]) &&
      entry[key] >= 0 && Number.isInteger(entry[key]), 'nonnegative finite integer counter');
  }
  check(Object.keys(entry).sort().join(',') === ['name', ...counters].sort().join(','),
    'interface fields contain counters only, no addresses');
}
const power = System.getPowerInfo();
check(power !== null && typeof power === 'object' && !Array.isArray(power) &&
  typeof power.then !== 'function', 'power query returns a synchronous object');
check(Object.keys(power).every(key => key === 'batteryData'), 'power keys match raw-text contract');
if (Object.prototype.hasOwnProperty.call(power, 'batteryData')) {
  check(typeof power.batteryData === 'string', 'optional batteryData is raw text');
}
// Never print interface names, addresses, counters or batteryData, including in errors.
console.log(JSON.stringify({ test: 'mcp-system', ok: true,
  networkStructure: true, powerStructure: true }));
