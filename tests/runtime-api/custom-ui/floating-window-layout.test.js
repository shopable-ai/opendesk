(() => {
  const { assert, equal, test } = RuntimeAPITest;
  const helper = FloatingToolbarTest;

  test({
    name: 'FloatingWindow native host owns ordered 1, 5, 20 and 32 button layout',
    tier: 'custom-ui',
    covers: ['FloatingWindow.addButton', 'FloatingWindow.getButtonState', 'FloatingWindow.show', 'FloatingWindow.close', 'Screen.screenshot'],
  }, async () => {
    const cases = [
      { count: 1, x: 100, y: 100, width: 60, height: 81 },
      { count: 5, x: 180, y: 120, width: 252, height: 81 },
      // Keep large captures below unrelated operator dialogs without changing
      // the host-owned size/wrap assertions.
      { count: 20, x: 260, y: 600, width: 960, height: 129 },
      { count: 32, x: 40, y: 760, width: 960, height: 129 },
    ];
    const accessibilityEvidence = { schemaVersion: 1, fiveButtons: [], thirtyTwoButtons: [] };
    for (const item of cases) {
      const longLabel = 'Long toolbar label retained in tooltip and Accessibility';
      const toolbar = helper.toolbar(item.count, {
        ...item,
        labelFor: index => item.count === 1 && index === 0 ? longLabel : 'Button ' + index,
      });
      const shown = await toolbar.show();
      equal(shown.bounds.x, item.x, item.count + ' buttons changed x');
      equal(shown.bounds.y, item.y, item.count + ' buttons changed y');
      equal(shown.bounds.width, item.width, item.count + ' buttons changed window width');
      equal(shown.bounds.height, item.height, item.count + ' buttons changed window height');
      const states = [];
      for (let index = 0; index < item.count; index += 1) states.push(await helper.state(toolbar, 'button' + index));
      for (let index = 1; index < states.length; index += 1) {
        const previous = states[index - 1].localBounds;
        const current = states[index].localBounds;
        if (index % 19 === 0) {
          equal(current.x, 10, 'wrapped row did not restart at host padding');
          equal(current.y - previous.y, 48, 'wrapped row gap changed');
        } else {
          equal(current.x - previous.x, 48, 'declaration order or 8pt gap changed');
          equal(current.y, previous.y, 'button wrapped before host limit');
        }
      }
      if (item.count === 5) {
        for (let index = 0; index < 5; index += 1) {
          equal(states[index].accessibilityName, 'Button ' + index, 'Accessibility name changed');
          equal(states[index].renderedText, '', 'native icon-only button rendered text');
          assert(states[index].revision > 0, 'button revision missing');
        }
        accessibilityEvidence.fiveButtons = states.map(state => ({
          id: state.id, name: state.accessibilityName, localBounds: state.localBounds, screenBounds: state.screenBounds,
        }));
      }
      if (item.count === 1) {
        equal(states[0].label, longLabel, 'long semantic label changed');
        equal(states[0].accessibilityName, longLabel, 'long Accessibility label was truncated');
      }
      if (item.count === 32) {
        const uniqueBounds = new Set(states.map(state => JSON.stringify(state.screenBounds)));
        equal(uniqueBounds.size, 32, '32-button native AX bounds are not unique');
        assert(states.every(state => state.screenBounds.width > 0 && state.screenBounds.height > 0), '32-button AX bounds are invalid');
        accessibilityEvidence.thirtyTwoButtons = states.map(state => ({
          id: state.id, name: state.accessibilityName, screenBounds: state.screenBounds,
        }));
      }
      const screenshotNames = { 1: 'one-button', 5: 'five-buttons', 20: 'twenty-buttons', 32: 'thirty-two-buttons' };
      const visual = await helper.screenshot(screenshotNames[item.count], shown.bounds);
      helper.evidence.layout[String(item.count)] = { shown, states, visual };
      await toolbar.close();
    }
    await File.ensureDir(helper.root);
    helper.evidence.accessibility = accessibilityEvidence;
    await File.write(File.join(helper.root, 'accessibility.json'), JSON.stringify(accessibilityEvidence, null, 2));
    helper.persist();
  });
})();
