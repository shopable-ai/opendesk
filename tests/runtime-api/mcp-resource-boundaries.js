// Inert capability/discovery only: no windows, permission requests or plugin
// methods. The MCP harness explicitly opts the second session into resources.
function check(value, message) {
  if (!value) throw new Error(`mcp-resource-boundaries: ${message}`);
}
const enabled = Execution.input.enabled;
const caps = ui.getCapabilities();
check(caps.enabled === enabled, 'UI authorization');
check(typeof caps.available === 'boolean', 'driver reports known availability');
check(typeof caps.platform === 'string', 'driver platform');
check(typeof NativeExtension === 'undefined', 'unsafe native bridge stays disabled');
let pluginCount = 0;
if (enabled) {
  const plugins = NativeExtensions.list();
  check(Array.isArray(plugins), 'registry list');
  pluginCount = plugins.length;
  const diagnostics = NativeExtensions.diagnostics();
  check(diagnostics && typeof diagnostics === 'object', 'registry diagnostics');
  for (const id of [undefined, null, '', ' space ', 1]) {
    let error;
    try { NativeExtensions.get(id); } catch (caught) { error = caught; }
    check(error && error.code === 'invalid_params', 'invalid registry id rejects synchronously');
  }
  let missing = 'com.opendesk.fixture.absent';
  while (plugins.some(plugin => plugin.id === missing)) missing += '.absent';
  let error;
  try { NativeExtensions.get(missing); } catch (caught) { error = caught; }
  check(error && error.code === 'unknown_plugin', 'unregistered canonical id rejects without invocation');
} else {
  check(typeof FloatingWindow === 'undefined', 'toolbar constructor absent without UI authorization');
  check(typeof NativeExtensions === 'undefined', 'registry absent without authorization');
  check(caps.available === false, 'disabled UI cannot be available');
}
// Availability here is only the existing inert owner probe; it is not a
// host handshake, a visual check or a native plugin invocation.
console.log(JSON.stringify({test: 'mcp-resource-boundaries', enabled,
  ui: {enabled: caps.enabled, available: caps.available, platform: caps.platform, driver: caps.driver},
  pluginCount, hostHandshakeChecked: false, pluginInvocationChecked: false}));
