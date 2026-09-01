// Run from the repository root with:
// ./dist/opendesk -ui -script examples/custom-ui/toolbar-vertical-quick-replies.js -console-mode script -log-dir .runtime/examples/custom-ui/toolbar-vertical-quick-replies
// Edit toolbar-vertical-quick-replies.json to change copy, order, or layout.
const configPath = File.join(File.cwd(), 'examples/custom-ui/toolbar-vertical-quick-replies.json');
const toolbarConfig = JSON.parse(File.read(configPath));

const helperPath = File.join(File.cwd(), 'examples/custom-ui/toolbar-example.js');
(0, eval)(File.read(helperPath) + '\n//# sourceURL=' + helperPath);

await ToolbarExample.run({
  config: toolbarConfig,
  logPrefix: 'VERTICAL_QUICK_REPLY',
  async onButtonClick(button, toolbar) {
    clipboard.copy(button.reply);
    await ToolbarExample.setExclusiveActive(toolbar, toolbarConfig.buttons, button.id);
    console.log('VERTICAL_QUICK_REPLY_SELECTED=' + JSON.stringify({
      id: button.id,
      label: button.label,
      text: button.reply,
    }));
  },
});
