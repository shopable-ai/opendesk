// Run from the repository root with:
// ./dist/opendesk -ui -script examples/custom-ui/icon-catalog.js -console-mode script -log-dir .runtime/examples/custom-ui/icon-catalog
//
// Scroll one real Custom UI window to browse all 150 built-in icons in a
// 10-column grid. Hover an icon for its full name and copy hint; click it to
// copy one ready-to-paste FloatingWindow.addButton() line. Close the window to
// finish.

const exampleRoot = File.join(File.cwd(), 'examples/custom-ui');
const registryPath = File.join(File.cwd(), 'pkg/customui/assets/toolbar-icons-v1.json');
const catalogHTMLPath = File.join(exampleRoot, 'icon-catalog.html');
const registry = JSON.parse(File.read(registryPath));
if (registry.schemaVersion !== 1 || !Array.isArray(registry.icons) || registry.icons.length !== 150) {
  throw new Error('expected the Custom UI v1 registry to contain exactly 150 icons');
}

const names = registry.icons.map(icon => icon.name);
if (new Set(names).size !== names.length) {
  throw new Error('the Custom UI icon registry contains duplicate names');
}

function buttonIDFor(icon) {
  return 'icon-' + icon.replace(/[^A-Za-z0-9_-]/g, '-');
}

function usageFor(icon) {
  return 'toolbar.addButton("' + buttonIDFor(icon) + '", "动作说明", "' + icon + '", () => {});';
}

const buttonIDs = names.map(buttonIDFor);
if (new Set(buttonIDs).size !== buttonIDs.length || buttonIDs.some(id => !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id))) {
  throw new Error('the Custom UI icon registry does not map to unique valid button ids');
}

const panel = await ui.createWindow({
  id: 'customUIIconCatalog',
  kind: 'normal',
  title: 'Custom UI · 150 个内置图标',
  // Start in the upper-left safe area while keeping the window draggable.
  bounds: { x: 24, y: 24, width: 1240, height: 740 },
  alwaysOnTop: false,
  draggable: true,
  theme: 'dark',
  content: { file: catalogHTMLPath },
});

const controls = panel.controls();
const iconControls = controls.filter(control => control.type === 'button');
if (iconControls.length !== 150 || iconControls.map(control => control.id).join('\n') !== buttonIDs.join('\n')) {
  throw new Error('the Runtime icon catalog must expose all 150 icon buttons in registry order');
}

let selectedID = '';
let copying = false;
for (let index = 0; index < names.length; index += 1) {
  const icon = names[index];
  const buttonID = buttonIDs[index];
  panel.control(buttonID).on('click', async () => {
    if (copying) return;
    copying = true;
    const usage = usageFor(icon);
    try {
      await clipboard.copy(usage);
      if (selectedID && selectedID !== buttonID) {
        await panel.control(selectedID).update({ classes: ['icon-card'], active: false });
      }
      await panel.control(buttonID).update({ classes: ['icon-card', 'is-copied'], active: true });
      await panel.control('catalogStatus').update({ text: '已复制：' + usage });
      selectedID = buttonID;
      console.log('CUSTOM_UI_ICON_COPIED=' + JSON.stringify({
        id: buttonID,
        icon,
        usage,
        index: index + 1,
        count: names.length,
      }));
    } catch (error) {
      await panel.control('catalogStatus').update({ text: '复制失败：' + icon });
      console.error('CUSTOM_UI_ICON_CATALOG_ERROR=' + JSON.stringify({
        id: buttonID,
        icon,
        code: error && error.code,
        message: error && error.message,
      }));
    } finally {
      copying = false;
    }
  });
}

const shown = await panel.show();
console.log('CUSTOM_UI_ICON_CATALOG_READY=' + JSON.stringify({
  registryPath,
  catalogHTMLPath,
  count: names.length,
  buttonCount: iconControls.length,
  columns: 10,
  rows: 15,
  first: names[0],
  last: names[names.length - 1],
  window: shown,
  copiedValue: 'one-line FloatingWindow.addButton() code',
}));

const closed = await panel.waitUntilClosed();
console.log('CUSTOM_UI_ICON_CATALOG_COMPLETE=' + JSON.stringify({
  count: names.length,
  status: closed.status,
  onScreen: closed.onScreen,
}));
