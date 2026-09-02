(() => {
  const { assert, equal, test } = RuntimeAPITest;
  const helper = FloatingToolbarTest;

  test({
    name: 'FloatingWindow accepts every reviewed built-in icon without opening a large icon gallery',
    tier: 'custom-ui',
    covers: ['FloatingWindow.addButton', 'FloatingWindow.close'],
  }, async () => {
    const registryPath = File.join(File.cwd(), 'pkg/customui/assets/toolbar-icons-v1.json');
    const registry = JSON.parse(File.read(registryPath));
    equal(registry.schemaVersion, 1, 'toolbar icon registry schema changed');
    equal(registry.icons.length, 150, 'toolbar icon registry must keep 150 reviewed entries');
    const names = registry.icons.map(icon => icon.name);
    equal(new Set(names).size, 150, 'toolbar icon registry contains duplicate names');
    const batches = [];
    for (let start = 0; start < registry.icons.length; start += 32) {
      const icons = registry.icons.slice(start, start + 32);
      const toolbar = new FloatingWindow();
      for (let index = 0; index < icons.length; index += 1) {
        toolbar.addButton('icon' + index, icons[index].name, icons[index].name, () => {});
      }
      batches.push({ start, count: icons.length, names: icons.map(icon => icon.name) });
      await toolbar.close();
    }
    helper.evidence.iconRegistry = { path: registryPath, count: names.length, batches };
    helper.persist();
  });

  test({
    name: 'FloatingWindow wrap demo declares maxWidth, two-column, and two-row layouts',
    tier: 'custom-ui',
    covers: ['FloatingWindow.constructor', 'FloatingWindow.addButton'],
  }, async () => {
    const demoPath = File.join(File.cwd(), 'examples/custom-ui/floating-toolbar-wrap-demo.json');
    const demo = JSON.parse(File.read(demoPath));
    equal(demo.schemaVersion, 1, 'wrap demo schema changed');
    equal(demo.layouts.map(item => item.id).join(','), 'maxWidth,maxColumns,maxRows', 'wrap demo layout order changed');
    equal(JSON.stringify(demo.layouts.map(item => item.toolbar)), JSON.stringify([
      { maxWidth: 252 }, { maxColumns: 2 }, { maxRows: 2 },
    ]), 'wrap demo constraints changed');
    equal(JSON.stringify(demo.layouts.map(item => item.buttonCount)), JSON.stringify([6, 5, 7]), 'wrap demo button counts changed');
    helper.evidence.layout.wrapDemo = { path: demoPath, layouts: demo.layouts };
    helper.persist();
  });

  test({
    name: 'FloatingWindow native host keeps normal 1 and 5 button toolbars compact and ordered',
    tier: 'custom-ui',
    covers: ['FloatingWindow.addButton', 'FloatingWindow.getButtonState', 'FloatingWindow.show', 'FloatingWindow.close', 'Screen.screenshot'],
  }, async () => {
    const cases = [
      { count: 1, x: 100, y: 100, width: 60, height: 81 },
      { count: 5, x: 180, y: 120, width: 252, height: 81 },
    ];
    const accessibilityEvidence = { schemaVersion: 1, fiveButtons: [] };
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
          equal(states[index].tooltip, 'Button ' + index, 'native tooltip changed');
          equal(states[index].renderedText, '', 'native icon-only button rendered text');
          assert(states[index].revision > 0, 'button revision missing');
        }
        accessibilityEvidence.fiveButtons = states.map(state => ({
          id: state.id, name: state.accessibilityName, localBounds: state.localBounds, screenBounds: state.screenBounds,
        }));
      }
      if (item.count === 1) {
        equal(states[0].label, longLabel, 'long semantic label changed');
        equal(states[0].tooltip, longLabel, 'long native tooltip was truncated');
        equal(states[0].accessibilityName, longLabel, 'long Accessibility label was truncated');
      }
      const screenshotNames = { 1: 'one-button', 5: 'five-buttons' };
      const visual = await helper.screenshot(screenshotNames[item.count], shown.bounds);
      helper.evidence.layout[String(item.count)] = { shown, states, visual };
      await toolbar.close();
    }
    await File.ensureDir(helper.root);
    helper.evidence.accessibility = accessibilityEvidence;
    await File.write(File.join(helper.root, 'accessibility.json'), JSON.stringify(accessibilityEvidence, null, 2));
    helper.persist();
  });

  test({
    name: 'FloatingWindow toolbar constraints wrap in declaration order and keep adaptive native bounds',
    tier: 'custom-ui',
    covers: ['FloatingWindow.constructor', 'FloatingWindow.addButton', 'FloatingWindow.getButtonState', 'FloatingWindow.show', 'FloatingWindow.close', 'Screen.screenshot'],
  }, async () => {
    const cases = [
      { name: 'max-width-five-columns', count: 6, toolbar: { maxWidth: 252 }, columns: 5, width: 252, height: 129 },
      { name: 'two-columns', count: 5, toolbar: { maxColumns: 2 }, columns: 2, width: 108, height: 177 },
      { name: 'two-rows', count: 7, toolbar: { maxRows: 2 }, columns: 4, width: 204, height: 129 },
    ];
    const layouts = {};
    for (const item of cases) {
      const toolbar = helper.toolbar(item.count, { toolbar: item.toolbar });
      const shown = await toolbar.show();
      equal(shown.bounds.width, item.width, item.name + ' native width changed');
      equal(shown.bounds.height, item.height, item.name + ' native height changed');
      const states = [];
      for (let index = 0; index < item.count; index += 1) {
        const state = await helper.state(toolbar, 'button' + index);
        const row = Math.floor(index / item.columns);
        equal(state.localBounds.x, 10 + (index % item.columns) * 48, item.name + ' x/order changed');
        equal(state.localBounds.y, 8 + row * 48, item.name + ' y/wrap changed');
        states.push(state);
      }
      const visual = await helper.screenshot(item.name, shown.bounds);
      layouts[item.name] = { constraint: item.toolbar, shown, states, visual };
      await toolbar.close();
    }
    helper.evidence.layout.wrapConstraints = layouts;
    helper.persist();
  });
})();
