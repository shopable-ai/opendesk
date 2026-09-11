// Read-only display mode inspection.
const capabilities = Screen.getDisplayCapabilities();
const displays = Screen.getDisplays();

const report = {
  capabilities,
  displays: displays.map(display => ({
    ...display,
    currentMode: capabilities.modes.read ? Screen.getDisplayMode(display.id) : null,
    modeCount: capabilities.modes.list ? Screen.listDisplayModes(display.id).length : 0,
  })),
};

console.log(JSON.stringify(report, null, 2));
