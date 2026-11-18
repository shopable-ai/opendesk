(function () {
  function rejectsCoordinate(action) {
    try {
      action();
    } catch (error) {
      if (error instanceof TypeError && String(error).includes('supported coordinate range')) return;
      throw error;
    }
    throw new Error('Expected invalid mouse coordinate to throw synchronously');
  }

  const invalid = [
    undefined, null, NaN, Infinity, -Infinity, '12', true, {},
    { valueOf() { throw new Error('mouse should not coerce objects'); } },
    12n, 2147483648, -2147483649, Number.MAX_SAFE_INTEGER,
  ];
  for (const api of [mouse, page.mouse, mappedPage.mouse, returnedPage.mouse]) {
    for (const name of ['click', 'move']) {
      rejectsCoordinate(() => api[name]());
      rejectsCoordinate(() => api[name](12));
      for (const value of invalid) {
        rejectsCoordinate(() => api[name](value, 20));
        rejectsCoordinate(() => api[name](-20, value));
      }
    }
  }
  for (const api of [mouse, page.mouse]) {
    rejectsCoordinate(() => api.clickPoint({ x: 2147483648, y: 20, coordinateSpace: 'screen' }));
    rejectsCoordinate(() => api.clickPoint({ x: -20, y: -2147483649, coordinateSpace: 'screen' }));
  }
  const rejectedState = mouseBoundaryState();
  if (rejectedState.checks !== 0 || rejectedState.calls.length !== 0) {
    throw new Error('Invalid input reached a permission check or dispatch');
  }

  if (mouse.click(13, -19, { delay: 80, clickCount: 2, button: 'right' }) !== undefined) {
    throw new Error('mouse.click must return undefined');
  }
  page.mouse.click(-4.75, 9.75);
  page.mouse.clickPoint({ x: -5.5, y: -6.5, coordinateSpace: 'screen' }, { Delay: 25 });
  mouse.move(-2147483648, 2147483647);
  page.mouse.move(-13, -19, { steps: 2, curve: 'easeInOut' });
  mappedPage.mouse.click(2, -3, undefined);
  returnedPage.mouse.move(-3, 4);

  const expected = [
    ['click', 13, -19, 'right', 2, 80],
    ['click', -4, 9, 'left', 1, 0],
    ['click', -5, -6, 'left', 1, 25],
    ['move', -2147483648, 2147483647, 1, 'linear'],
    ['move', -13, -19, 2, 'easeInOut'],
    ['click', 2, -3, 'left', 1, 0],
    ['move', -3, 4, 1, 'linear'],
  ];
  const state = mouseBoundaryState();
  if (state.checks !== expected.length || JSON.stringify(state.calls) !== JSON.stringify(expected)) {
    throw new Error('Unexpected mouse dispatch: ' + JSON.stringify(state));
  }
})();
