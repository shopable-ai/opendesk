// Run from the repository root with:
// ./opendesk -ui -script examples/custom-ui/icon-list.js -console-mode script -log-dir .runtime/examples/custom-ui/icon-list
//
// Scroll one real Custom UI window to browse every default icon in a 10-column
// grid. The list includes semantic AI and automation IDs alongside common SF
// Symbol names. Hover an icon for its full name and copy hint; click it to
// copy one ready-to-paste FloatingWindow.addButton() line. Close the window to
// finish.

const exampleRoot = File.join(File.cwd(), 'examples/custom-ui');
const registryPath = File.join(File.cwd(), 'pkg/customui/assets/toolbar-icons-v1.json');
const iconListHTMLPath = File.join(exampleRoot, 'icon-list.html');
const registry = JSON.parse(File.read(registryPath));
if (registry.schemaVersion !== 1 || !Array.isArray(registry.icons) || registry.icons.length < 100 || registry.icons.length > 256) {
  throw new Error('expected the Custom UI v1 registry to contain 100–256 icons');
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
  id: 'customUIIconList',
  kind: 'normal',
  title: 'Custom UI · ' + names.length + ' 个默认图标',
  // Start in the upper-left safe area while keeping the window draggable.
  bounds: { x: 24, y: 24, width: 1240, height: 740 },
  alwaysOnTop: false,
  draggable: true,
  theme: 'dark',
  content: { file: iconListHTMLPath },
});

const controls = panel.controls();
const iconControls = controls.filter(control => control.type === 'button');
if (iconControls.length !== names.length || iconControls.map(control => control.id).join('\n') !== buttonIDs.join('\n')) {
  throw new Error('the Runtime icon list must expose every registry button in registry order');
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
      console.error('CUSTOM_UI_ICON_LIST_ERROR=' + JSON.stringify({
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
console.log('CUSTOM_UI_ICON_LIST_READY=' + JSON.stringify({
  registryPath,
  iconListHTMLPath,
  count: names.length,
  buttonCount: iconControls.length,
  columns: 10,
  rows: Math.ceil(names.length / 10),
  first: names[0],
  last: names[names.length - 1],
  window: shown,
  copiedValue: 'one-line FloatingWindow.addButton() code',
}));

const closed = await panel.waitUntilClosed();
console.log('CUSTOM_UI_ICON_LIST_COMPLETE=' + JSON.stringify({
  count: names.length,
  status: closed.status,
  onScreen: closed.onScreen,
}));
