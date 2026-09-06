// The target must already be the reviewed foreground fixture. This example never
// focuses by title, picks the first app/window, retries an action, or sends Escape.

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

function requireAccessibilityMenus() {
  const capabilities = Accessibility.getCapabilities();
  if (!capabilities.hostAuthorization.enabled) throw new Error('Accessibility is not enabled for this execution');
  if (!capabilities.implementation.available || !capabilities.implementation.menus) {
    throw new Error('The native Accessibility menu backend is unavailable');
  }
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

async function foregroundTargetWindow() {
  const target = (await fixtureTarget.window()).window;
  if (!target.isForeground) throw new Error('The explicit fixture window must already be foreground');
  return target;
}

function parseJSONEnv(name) {
  let parsed;
  try {
    parsed = JSON.parse(requiredEnv(name));
  } catch (_) {
    throw new Error(name + ' must contain valid JSON');
  }
  return parsed;
}

function verificationProperty() {
  const property = requiredEnv('OPENDESK_ACCESSIBILITY_VERIFY_PROPERTY');
  if (['value', 'name', 'identifier', 'enabled', 'selected', 'checked', 'expanded'].indexOf(property) < 0) {
    throw new Error('OPENDESK_ACCESSIBILITY_VERIFY_PROPERTY is not an allowed verification property');
  }
  return property;
}

async function main() {
  requireAccessibilityMenus();
  const within = await foregroundTargetWindow();
  const path = parseJSONEnv('OPENDESK_ACCESSIBILITY_MENU_PATH_JSON');
  if (!Array.isArray(path) || path.length === 0) throw new Error('OPENDESK_ACCESSIBILITY_MENU_PATH_JSON must be a non-empty array');
  const finalActionJSON = optionalEnv('OPENDESK_ACCESSIBILITY_MENU_FINAL_ACTION_JSON');
  const options = { within, timeout: EXAMPLE_TIMEOUT_MS, maxDepth: 8, maxNodes: 1000 };
  if (finalActionJSON) options.finalAction = parseJSONEnv('OPENDESK_ACCESSIBILITY_MENU_FINAL_ACTION_JSON');
  const verifySelector = selector('OPENDESK_ACCESSIBILITY_VERIFY');
  const property = verificationProperty();
  const expected = requiredEnv('OPENDESK_ACCESSIBILITY_EXPECTED_VALUE');
  let verification = null;
  let failure = null;
  try {
    const action = await UI.tapMenuItem(path, options);
    verification = await Accessibility.find(verifySelector, { within, timeout: EXAMPLE_TIMEOUT_MS, maxDepth: 8, maxNodes: 1000 });
    if (!verification) throw new Error('The independent verification selector did not match the controlled fixture');
    const readback = await Accessibility.read(verification, { properties: [property], timeout: EXAMPLE_TIMEOUT_MS });
    if (!Object.prototype.hasOwnProperty.call(readback.properties, property) ||
        String(readback.properties[property]) !== expected) {
      throw new Error('The fixture readback did not match the expected state');
    }
    console.log('[ACCESSIBILITY-MENU] ' + JSON.stringify({
      requestId: action.requestId,
      backend: action.backend,
      action: action.action,
      actionState: action.actionState,
      completedLevels: action.completedLevels,
      expansionOccurred: action.expansionOccurred,
      verified: true,
    }));
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    if (verification) {
      try {
        await Accessibility.release(verification);
      } catch (error) {
        if (!failure) throw error;
      }
    }
  }
}

await main();
