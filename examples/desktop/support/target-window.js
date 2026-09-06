// Shared example-local targeting guard. Load as a factory; not a standalone script or a new Runtime API.
// Title actions and global keyboard input are not atomic with these checks; use disposable test windows.
(function createTargetWindowGuard() {
  'use strict';
  function requireCapability(name) {
    const matrix = window.getCapabilities();
    const entry = matrix && matrix.capabilities && matrix.capabilities[name];
    if (!entry || entry.supported !== true) throw new Error('Example requires capability: ' + name);
  }
  function identity(info) {
    return info && typeof info.id === 'string' && /:native:/.test(info.id)
      && Number.isInteger(info.pid) && info.pid > 0;
  }
  async function unique(title, pid) {
    requireCapability('window.list');
    const rows = await window.list();
    if (!Array.isArray(rows)) throw new Error('Window list is invalid');
    // The action API is title-based: reject duplicates even when only one PID matches.
    const matches = rows.filter(row => row.title === title);
    if (matches.length !== 1 || matches[0].pid !== pid || !identity(matches[0])) {
      throw new Error('Expected one exact-title window with the requested PID and resolved native identity');
    }
    return matches[0];
  }
  async function select() {
    const title = Execution.env.OPENDESK_EXAMPLE_WINDOW_TITLE;
    const rawPid = Execution.env.OPENDESK_EXAMPLE_WINDOW_PID;
    if (typeof title !== 'string' || !title.trim() || !/^[1-9][0-9]*$/.test(String(rawPid || ''))) {
      throw new Error('Set OPENDESK_EXAMPLE_WINDOW_TITLE and OPENDESK_EXAMPLE_WINDOW_PID for a disposable test window');
    }
    const pid = Number(rawPid);
    if (!Number.isSafeInteger(pid)) throw new Error('Invalid window PID');
    const info = await unique(title, pid);
    return Object.freeze({ title, pid, id: info.id });
  }
  async function current(target) {
    const info = await unique(target.title, target.pid);
    if (info.id !== target.id) throw new Error('Window identity changed; refusing stale target');
    return info;
  }
  async function focused(target) {
    await current(target);
    requireCapability('window.active');
    const active = await window.getActiveWindow();
    if (!active || active.id !== target.id || active.pid !== target.pid || active.title !== target.title) {
      throw new Error('Target is not the verified active window; stop further input and inspect any already dispatched text');
    }
  }
  async function focus(target) {
    requireCapability('window.focus');
    requireCapability('window.active');
    await current(target);
    await window.focus(target.title);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await current(target);
      const active = await window.getActiveWindow();
      if (active && active.id === target.id && active.pid === target.pid && active.title === target.title) return;
      await page.waitForTimeout(50);
    }
    throw new Error('Window focus was not verified; no input will be sent');
  }
  return Object.freeze({ requireCapability, select, current, focused, focus });
})
