(() => {
  const { assert, equal, test } = RuntimeAPITest;
  const helper = FloatingToolbarTest;

  function buttonIDFor(icon) {
    return 'icon-' + icon.replace(/[^A-Za-z0-9_-]/g, '-');
  }

  function usageFor(icon) {
    return 'toolbar.addButton("' + buttonIDFor(icon) + '", "动作说明", "' + icon + '", () => {});';
  }

  function tooltipFor(icon) {
    return icon + ' · 点击复制按钮代码';
  }

  test({
    name: 'icon list renders, scrolls and exposes all default Custom UI buttons',
    tier: 'custom-ui',
    covers: [
      'ui.createWindow', 'WindowHandle.controls', 'WindowHandle.control', 'ControlHandle.on',
      'ControlHandle.getState', 'ControlHandle.update', 'mouse.click', 'mouse.clickForPID',
      'mouse.wheel', 'clipboard.copy', 'clipboard.paste', 'Screen.screenshot', 'WindowHandle.close',
    ],
  }, async () => {
    const registryPath = File.join(File.cwd(), 'pkg/customui/assets/toolbar-icons-v1.json');
    const sourceHTMLPath = File.join(File.cwd(), 'examples/custom-ui/icon-list.html');
    const sourceControllerPath = File.join(File.cwd(), 'examples/custom-ui/icon-list.js');
    const registry = JSON.parse(File.read(registryPath));
    equal(registry.schemaVersion, 1, 'icon registry schema changed');
    const iconCount = registry.icons.length;
    equal(iconCount, 160, 'default icon registry count changed');
    const names = registry.icons.map(icon => icon.name);
    const ids = names.map(buttonIDFor);
    equal(new Set(names).size, iconCount, 'icon names are not unique');
    equal(new Set(ids).size, iconCount, 'icon button ids are not unique');

    const scenarioDefaults = {
      'ai.assistant': 'brain',
      'ai.generate': 'wand.and.rays',
      'ai.analyze': 'doc.text.magnifyingglass',
      'ai.search': 'text.magnifyingglass',
      'automation.run': 'arrow.triangle.2.circlepath',
      'automation.schedule': 'clock.arrow.circlepath',
      'automation.trigger': 'bolt.circle.fill',
      'automation.configure': 'gearshape.2.fill',
      'automation.review': 'rectangle.and.hand.point.up.left.fill',
      'automation.approve': 'hand.tap.fill',
    };
    for (const [name, systemSymbol] of Object.entries(scenarioDefaults)) {
      const icon = registry.icons.find(item => item.name === name);
      assert(icon, 'missing default icon for ' + name);
      equal(icon.systemSymbol, systemSymbol, name + ' changed its reviewed SF Symbol');
    }

    const html = File.read(sourceHTMLPath);
    const controller = File.read(sourceControllerPath);
    assert(!/<script\b/i.test(html), 'Runtime catalog HTML contains a business script');
    assert(!/\bonclick\s*=/i.test(html), 'Runtime catalog HTML contains an inline handler');
    assert(controller.includes("kind: 'normal'"), 'public catalog stopped using one normal scrollable Custom UI window');
    assert(controller.includes('content: { file: iconListHTMLPath }'), 'public icon list stopped loading the generated restricted HTML');
    assert(controller.includes('bounds: { x: 24, y: 24, width: 1240, height: 740 }'), 'public catalog stopped starting in the upper-left safe area');
    assert(/\.icon-card img\{width:48px;height:48px/.test(html), 'Runtime catalog cards lost their compact icon size');
    assert(!/\.icon-card::after/.test(html) && !/content:attr\(data-index\)/.test(html), 'Runtime catalog reintroduced repeated visual numbers or copy hints');
    for (const name of names) {
      const id = buttonIDFor(name);
      const tooltip = tooltipFor(name);
      assert(html.includes('id="' + id + '"'), id + ' is missing from Runtime HTML');
      assert(html.includes('title="' + tooltip + '"'), id + ' lost its complete title tooltip');
      assert(html.includes('aria-label="' + tooltip + '"'), id + ' lost its complete aria-label');
    }

    const fixtureDir = File.join(RuntimeAPITest.context.runDir, 'generated', 'icon-list');
    await File.ensureDir(fixtureDir);
    const fixturePath = File.join(fixtureDir, 'icon-list.html');
    await File.write(fixturePath, html);
    const panel = await ui.createWindow({
      id: 'runtimeAPIIconList', kind: 'normal', title: 'Custom UI Icon List Test',
      bounds: { x: 80, y: 60, width: 1240, height: 740 }, alwaysOnTop: false, draggable: true, theme: 'dark',
      content: { file: fixturePath },
    });

    const buttonControls = panel.controls().filter(control => control.type === 'button');
    equal(buttonControls.length, iconCount, 'real WindowHandle did not expose every default icon button');
    equal(buttonControls.map(control => control.id).join('\n'), ids.join('\n'), 'real button order differs from the registry');

    let selectedID = '';
    let copied = null;
    for (let index = 0; index < names.length; index += 1) {
      const icon = names[index];
      const id = ids[index];
      panel.control(id).on('click', async () => {
        const usage = usageFor(icon);
        await clipboard.copy(usage);
        if (selectedID && selectedID !== id) {
          await panel.control(selectedID).update({ classes: ['icon-card'], active: false });
        }
        await panel.control(id).update({ classes: ['icon-card', 'is-copied'], active: true });
        await panel.control('catalogStatus').update({ text: '已复制：' + usage });
        selectedID = id;
        copied = { id, icon, usage, index: index + 1 };
      });
    }

    const shown = await panel.show();
    assert(shown.onScreen && shown.alpha > 0 && shown.hostPid > 0 && shown.nativeWindowId > 0, 'catalog window is not visibly hosted');
    const evidenceDir = File.join(helper.root, 'icon-list');
    await File.ensureDir(evidenceDir);
    async function screenshot(name) {
      const path = File.join(evidenceDir, name + '.png');
      const capture = await Screen.screenshot({ clip: shown.bounds, path, returnType: 'object' });
      assert(capture.sizeBytes > 100 && await File.exists(path), name + ' screenshot was not written');
      return { path, sizeBytes: capture.sizeBytes };
    }

    const states = [];
    for (let index = 0; index < ids.length; index += 1) {
      const state = await panel.control(ids[index]).getState();
      equal(state.type, 'button', ids[index] + ' is not a real button state');
      equal(state.text, tooltipFor(names[index]), ids[index] + ' text/tooltip source changed');
      equal(state.accessibilityName, tooltipFor(names[index]), ids[index] + ' native Accessibility name changed');
      assert(state.localBounds.width > 0 && state.localBounds.height > 0, ids[index] + ' was not laid out');
      states.push({ id: state.id, accessibilityName: state.accessibilityName, localBounds: state.localBounds });
    }
    const firstBefore = await panel.control(ids[0]).getState();
    const lastBefore = await panel.control(ids[ids.length - 1]).getState();
    assert(lastBefore.localBounds.y > shown.bounds.height * 2, 'catalog does not have a real overflowing scroll layout');
    const top = await screenshot('top');

    await mouse.move(firstBefore.screenBounds.x + firstBefore.screenBounds.width / 2, firstBefore.screenBounds.y + firstBefore.screenBounds.height / 2);
    await new Promise(resolve => setTimeout(resolve, 1600));
    const tooltip = await screenshot('first-tooltip');
    await mouse.clickForPID(shown.hostPid, firstBefore.screenBounds.x + firstBefore.screenBounds.width / 2, firstBefore.screenBounds.y + firstBefore.screenBounds.height / 2);
    await helper.waitFor(() => copied && copied.id === ids[0], 'first icon AXPress did not reach its JavaScript callback');
    equal(await clipboard.paste(), usageFor(names[0]), 'first icon copied the wrong one-line usage');
    const firstActive = await panel.control(ids[0]).getState();
    assert(firstActive.active && firstActive.classes.includes('is-copied'), 'first icon has no visible copied state');
    equal((await panel.control('catalogStatus').getState()).text, '已复制：' + usageFor(names[0]), 'copy feedback text changed');
    const firstCopied = await screenshot('first-copied');

    await mouse.move(shown.bounds.x + shown.bounds.width / 2, shown.bounds.y + shown.bounds.height - 90);
    await mouse.wheel({ deltaY: 6000, steps: 30, delay: 10 });
    await new Promise(resolve => setTimeout(resolve, 400));
    const firstAfter = await panel.control(ids[0]).getState();
    const lastAfter = await panel.control(ids[ids.length - 1]).getState();
    assert(firstAfter.localBounds.y < -shown.bounds.height, 'wheel did not scroll the first icon out of view');
    assert(lastAfter.localBounds.y >= 72 && lastAfter.localBounds.y + lastAfter.localBounds.height <= shown.bounds.height, 'wheel did not make the last icon visible');
    const bottom = await screenshot('bottom');

    await mouse.click(lastAfter.screenBounds.x + lastAfter.screenBounds.width / 2, lastAfter.screenBounds.y + lastAfter.screenBounds.height / 2);
    await helper.waitFor(() => copied && copied.id === ids[ids.length - 1], 'last icon pointer click did not reach its JavaScript callback');
    equal(await clipboard.paste(), usageFor(names[names.length - 1]), 'last icon copied the wrong one-line usage');
    assert((await panel.control(ids[ids.length - 1]).getState()).active, 'last icon has no visible copied state');
    assert(!(await panel.control(ids[0]).getState()).active, 'previous copied state was not cleared');
    const lastCopied = await screenshot('last-copied');

    const closed = await panel.close();
    const waited = await panel.waitUntilClosed();
    equal(closed.status, 'closed', 'catalog close did not reach terminal state');
    equal(waited.status, 'closed', 'catalog waitUntilClosed did not resolve closed');
    equal(waited.onScreen, false, 'catalog remained on screen after close');
    await ui.closeAll();

    const result = {
      schemaVersion: 1,
      registryPath,
      sourceHTMLPath,
      sourceControllerPath,
      count: names.length,
      buttonCount: buttonControls.length,
      first: { name: names[0], id: ids[0], before: firstBefore.localBounds, after: firstAfter.localBounds },
      last: { name: names[names.length - 1], id: ids[ids.length - 1], before: lastBefore.localBounds, after: lastAfter.localBounds },
      accessibilityNames: states.map(state => state.accessibilityName),
      clipboard: await clipboard.paste(),
      copied,
      screenshots: { top, tooltip, firstCopied, bottom, lastCopied },
      lifecycle: { closeStatus: closed.status, waitStatus: waited.status, onScreen: waited.onScreen },
    };
    await File.write(File.join(evidenceDir, 'result.json'), JSON.stringify(result, null, 2));
    helper.evidence.iconCatalog = result;
    helper.persist();
  });
})();
