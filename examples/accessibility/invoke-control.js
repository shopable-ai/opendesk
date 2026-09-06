// This example never chooses a current/first window. Supply an exact fixture window,
// exact action selector, and an independently readable verification property.

const EXAMPLE_TIMEOUT_MS = 10000;
const exampleRoot = String(Execution.workdir || File.cwd());
const fixtureTarget = (0, eval)(File.read(File.join(exampleRoot, 'examples', 'accessibility', 'lib', 'fixture-target.js')));

function requiredEnv(name) {
  const value = System.getEnv(name);
  if (typeof value !== 'string' || value.length === 0) throw new Error(name + ' is required');
  return value;
}

function optionalEnv(name) {
  const value = System.getEnv(name);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function requireAccessibility() {
  const capabilities = Accessibility.getCapabilities();
  if (!capabilities.hostAuthorization.enabled) throw new Error('Accessibility is not enabled for this execution');
  if (!capabilities.implementation.available) throw new Error('The native Accessibility backend is unavailable');
  if (!capabilities.permission.granted) throw new Error('The native Accessibility permission is not granted');
}

function selector(prefix) {
  const role = requiredEnv(prefix + '_ROLE');
  const name = optionalEnv(prefix + '_NAME');
  const identifier = optionalEnv(prefix + '_IDENTIFIER');
  if (!name && !identifier) throw new Error(prefix + '_NAME or ' + prefix + '_IDENTIFIER is required');
  const result = { role };
  if (name) result.name = name;
  if (identifier) result.identifier = identifier;
  return result;
}

async function targetWindow() {
  return (await fixtureTarget.window()).window;
}

function verificationProperty() {
  const property = requiredEnv('OPENDESK_ACCESSIBILITY_VERIFY_PROPERTY');
  if (['value', 'name', 'identifier', 'enabled', 'selected', 'checked', 'expanded'].indexOf(property) < 0) {
    throw new Error('OPENDESK_ACCESSIBILITY_VERIFY_PROPERTY is not an allowed verification property');
  }
  return property;
}

async function main() {
  requireAccessibility();
  const within = await targetWindow();
  const actionSelector = selector('OPENDESK_ACCESSIBILITY_CONTROL');
  const verifySelector = selector('OPENDESK_ACCESSIBILITY_VERIFY');
  const property = verificationProperty();
  const expected = requiredEnv('OPENDESK_ACCESSIBILITY_EXPECTED_VALUE');
  const refs = [];
  let failure = null;
  try {
    const target = await Accessibility.find(actionSelector, { within, timeout: EXAMPLE_TIMEOUT_MS, maxDepth: 8, maxNodes: 1000 });
    if (!target) throw new Error('The exact action selector did not match the controlled fixture');
    refs.push(target);
    const action = await Accessibility.perform(target, { action: 'invoke' }, { timeout: EXAMPLE_TIMEOUT_MS });
    const verification = await Accessibility.find(verifySelector, { within, timeout: EXAMPLE_TIMEOUT_MS, maxDepth: 8, maxNodes: 1000 });
    if (!verification) throw new Error('The independent verification selector did not match the controlled fixture');
    refs.push(verification);
    const readback = await Accessibility.read(verification, { properties: [property], timeout: EXAMPLE_TIMEOUT_MS });
    if (!Object.prototype.hasOwnProperty.call(readback.properties, property) ||
        String(readback.properties[property]) !== expected) {
      throw new Error('The fixture readback did not match the expected state');
    }
    console.log('[ACCESSIBILITY-INVOKE] ' + JSON.stringify({
      requestId: action.requestId,
      backend: action.backend,
      action: action.action,
      actionState: action.actionState,
      verified: true,
    }));
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    let cleanupFailure = null;
    for (let index = refs.length - 1; index >= 0; index -= 1) {
      try {
        await Accessibility.release(refs[index]);
      } catch (error) {
        if (!cleanupFailure) cleanupFailure = error;
      }
    }
    if (!failure && cleanupFailure) throw cleanupFailure;
  }
}

await main();
