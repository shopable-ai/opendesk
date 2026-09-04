// Run from the repository root with:
// ./opendesk -ui -script examples/custom-ui/toolbar-vertical-quick-replies.js -console-mode script -log-dir .runtime/examples/custom-ui/toolbar-vertical-quick-replies
// Edit the JSON file to change reply copy, button order, or the right-center
// anchor position on the active display. The FloatingWindow setup stays here so this
// file remains a complete, readable Runtime API example.
const configPath = File.join(File.cwd(), 'examples/custom-ui/toolbar-vertical-quick-replies.json');
const toolbarConfig = JSON.parse(File.read(configPath));

const toolbar = new FloatingWindow(toolbarConfig.toolbar);

toolbar.onError(error => {
  console.error('VERTICAL_QUICK_REPLY_ERROR=' + JSON.stringify({
    code: error.code,
    operation: error.operation,
    targetId: error.targetId,
    message: error.message,
  }));
});

for (const button of toolbarConfig.buttons) {
  toolbar.addButton(button.id, button.label, button.icon, () => {
    clipboard.copy(button.reply);
    console.log('VERTICAL_QUICK_REPLY_COPIED=' + JSON.stringify({
      id: button.id,
      label: button.label,
      text: button.reply,
    }));
  });
}

const shown = await toolbar.show();
console.log('VERTICAL_QUICK_REPLY_READY=' + JSON.stringify({
  orientation: toolbarConfig.toolbar.orientation,
  position: toolbarConfig.toolbar.position,
  bounds: shown.bounds,
  buttonIds: toolbarConfig.buttons.map(button => button.id),
}));

await toolbar.waitUntilClosed();
