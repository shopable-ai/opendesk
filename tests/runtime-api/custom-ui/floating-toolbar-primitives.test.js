(() => {
  const { assert, equal, test } = RuntimeAPITest;
  const helper = FloatingToolbarTest;
  const evidenceRoot = File.join(File.cwd(), '.runtime', 'tests', 'custom-ui', 'floating-toolbar-primitives');

  async function capture(name, bounds) {
    await File.ensureDir(evidenceRoot);
    const path = File.join(evidenceRoot, name + '.png');
    const result = await Screen.screenshot({ clip: bounds, path, returnType: 'object' });
    assert(result.sizeBytes > 100 && await File.exists(path), name + ' screenshot was not written');
    return { path, sizeBytes: result.sizeBytes, bounds };
  }

  test({
    name: 'FloatingWindow native toolbar items preserve compact groups, state, lifecycle and accessibility boundary',
    tier: 'custom-ui',
    covers: [
      'FloatingWindow.addButton', 'FloatingWindow.addSeparator', 'FloatingWindow.addSpacer',
      'FloatingWindow.getState', 'FloatingWindow.on', 'FloatingWindow.setDraggable',
      'FloatingWindow.setPosition', 'FloatingWindow.show', 'FloatingWindow.hide', 'FloatingWindow.close',
      'FloatingWindow.waitUntilClosed', 'Screen.screenshot',
    ],
  }, async () => {
    const toolbar = new FloatingWindow({ x: 140, y: 360, alwaysOnTop: true, draggable: true });
    toolbar.addButton('copy', '复制', 'doc.on.doc', () => {});
    toolbar.addButton('reply', '回复', 'pause.fill', () => {});
    toolbar.addSeparator('reply-order-divider');
    toolbar.addButton('order', '订单', 'doc.text.fill', () => {});
    toolbar.addSpacer('order-help-space');
    toolbar.addButton('help', '帮助', 'gearshape.fill', () => {});

    const declared = await toolbar.getState();
    equal(declared.status, 'hidden', 'pre-show toolbar state is not hidden');
    equal(declared.visible, false, 'pre-show toolbar is visible');
    equal(declared.draggable, true, 'pre-show draggable state changed');
	    equal(declared.bounds.width, 213, 'pre-show separator/spacer width did not use compact group gaps');
    equal(declared.bounds.height, 81, 'pre-show compact height changed');
    equal(declared.hostPid, undefined, 'pre-show state unexpectedly has a native identity');

    let moveEvents = 0;
    let closeEvents = 0;
    const moves = [];
    toolbar.on('move', event => { moveEvents += 1; moves.push(event); });
    toolbar.on('close', event => { closeEvents += 1; moves.push({ close: event }); });

    let shown = await toolbar.show();
    assert(shown.visible && shown.onScreen && shown.hostPid > 0 && shown.nativeWindowId > 0, 'shown toolbar has no native state');
    const primitiveVisual = await capture('horizontal-separator-spacer', shown.bounds);
    const copy = await helper.state(toolbar, 'copy');
    const reply = await helper.state(toolbar, 'reply');
    const order = await helper.state(toolbar, 'order');
    const help = await helper.state(toolbar, 'help');
    equal(reply.localBounds.x - copy.localBounds.x, 48, 'ordinary button gap changed before separator');
    equal(order.localBounds.x - reply.localBounds.x, 57, 'separator did not retain its compact 8 + 1 + 8pt visual boundary');
	    equal(help.localBounds.x - order.localBounds.x, 48, 'fixed spacer did not resolve to a compact 8pt group gap');
    equal(order.localBounds.x - (reply.localBounds.x + reply.localBounds.width), 17, 'separator edge gap changed');
	    equal(help.localBounds.x - (order.localBounds.x + order.localBounds.width), 8, 'spacer stacked a second native stack gap');
    const structuralRead = await helper.expectUIError(() => toolbar.getButtonState('reply-order-divider'), 'NOT_FOUND', 'FloatingWindow.getButtonState');
    equal(structuralRead.capability, 'button', 'separator was exposed as a button capability');

    const moved = await toolbar.setPosition(320, 360);
    await helper.waitFor(() => moveEvents >= 1, 'setPosition did not emit a toolbar move lifecycle event');
    equal(moved.bounds.x, 320, 'setPosition readback changed');
    equal((await toolbar.setDraggable(false)).draggable, false, 'setDraggable(false) did not read back');
    equal((await toolbar.setDraggable(true)).draggable, true, 'setDraggable(true) did not read back');
    equal((await toolbar.hide()).visible, false, 'hide did not update shared WindowState');
    shown = await toolbar.show();
    assert((await toolbar.getState()).visible, 'show after hide did not restore WindowState');

    const waiter = toolbar.waitUntilClosed();
    const closedByController = await toolbar.close();
    const closed = await waiter;
    equal(closedByController.status, 'closed', 'controller close did not return a closed state');
    equal(closed.status, 'closed', 'waitUntilClosed did not return terminal state');
    await helper.waitFor(() => closeEvents === 1, 'close lifecycle event was not emitted exactly once');

    const wrap = new FloatingWindow({ x: 140, y: 500, toolbar: { maxColumns: 2 } });
    wrap.addButton('one', '一', 'play.fill', () => {});
    wrap.addButton('two', '二', 'pause.fill', () => {});
    wrap.addSeparator('wrap-divider');
    wrap.addButton('three', '三', 'stop.fill', () => {});
    wrap.addButton('four', '四', 'timer', () => {});
    const wrapShown = await wrap.show();
    const one = await helper.state(wrap, 'one');
    const two = await helper.state(wrap, 'two');
    const three = await helper.state(wrap, 'three');
    const four = await helper.state(wrap, 'four');
    equal(two.localBounds.x - one.localBounds.x, 48, 'wrap first row changed');
    equal(three.localBounds.x, 10, 'natural wrap did not start at padding');
    equal(three.localBounds.y - one.localBounds.y, 48, 'natural wrap row gap changed');
    equal(four.localBounds.x - three.localBounds.x, 48, 'separator was rendered at the new row start');
    const wrapVisual = await capture('horizontal-wrap-natural-boundary', wrapShown.bounds);
    await wrap.close();

    const vertical = new FloatingWindow({ x: 520, y: 360, orientation: 'vertical' });
    vertical.addButton('top', '顶部', 'play.fill', () => {});
    vertical.addSeparator('vertical-divider');
    vertical.addButton('middle', '中间', 'doc.text.fill', () => {});
    vertical.addSpacer('vertical-space');
    vertical.addButton('bottom', '底部', 'stop.fill', () => {});
    const verticalShown = await vertical.show();
    equal(verticalShown.bounds.width, 60, 'vertical primitive toolbar width changed');
	    equal(verticalShown.bounds.height, 186, 'vertical separator/spacer height changed');
    const verticalVisual = await capture('vertical-separator-spacer', verticalShown.bounds);
    await vertical.close();

    const source = File.read(File.join(File.cwd(), 'pkg/customui/machost/floating_toolbar_darwin.m'));
    assert(source.includes('self.accessibilityElement = NO;') && source.includes('self.accessibilityHidden = YES;'),
      'native structural primitives lost their non-button Accessibility contract');

    const negative = new FloatingWindow();
    const leading = await helper.expectUIError(() => negative.addSeparator('leading'), 'INVALID_SPEC', 'FloatingWindow.addSeparator');
    equal(leading.capability, 'structure');
    negative.addButton('first', 'First', 'timer');
    negative.addSeparator('divider');
    const consecutive = await helper.expectUIError(() => negative.addSpacer('consecutive'), 'INVALID_SPEC', 'FloatingWindow.addSpacer');
    equal(consecutive.capability, 'structure');
    const trailing = await helper.expectUIError(() => negative.show(), 'INVALID_SPEC', 'FloatingWindow.show');
    equal(trailing.capability, 'structure');
    const duplicate = await helper.expectUIError(() => negative.addButton('divider', 'Duplicate', 'timer'), 'DUPLICATE_ID', 'FloatingWindow.addButton');
    equal(duplicate.capability, 'item');

    const maxItems = new FloatingWindow();
    maxItems.addButton('button0', 'Button 0', 'timer');
    for (let index = 1; index < 32; index += 1) {
      maxItems.addSpacer('space' + index);
      maxItems.addButton('button' + index, 'Button ' + index, 'timer');
    }
    const itemOverflow = await helper.expectUIError(() => maxItems.addSeparator('over-item-limit'), 'INVALID_SPEC', 'FloatingWindow.addSeparator');
    equal(itemOverflow.capability, 'item');

    helper.evidence.primitives = {
      declared, shown, moveEvents, closeEvents, moves,
      horizontal: { copy, reply, order, help, screenshot: primitiveVisual },
      wrapping: { shown: wrapShown, screenshot: wrapVisual },
      vertical: { shown: verticalShown, screenshot: verticalVisual },
      limits: { maxButtons: 32, maxItems: 63, verticalButtons: 5, verticalItems: 9 },
      accessibility: { structuralItemsAreNotButtonState: true, nativeSourceContract: true },
    };
    helper.persist();
  });
})();
