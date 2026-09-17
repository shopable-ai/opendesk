'use strict';
// Prototype-only Reference Selection lifecycle adapter.
// It hardens the synthetic Oracle's input gate and makes FREEZING observable.
(function installReferenceSelectionLifecycle(root) {
  const demo = root.MeasureDemo;
  const stage = document.getElementById('stage');
  const overlay = document.getElementById('overlay');
  if (!demo || !stage || !overlay) throw new Error('MeasureDemo must load before selection-lifecycle.js');

  const CLICK_TOLERANCE_PX = 8;
  let pending = null;
  let freezeVersion = 0;
  let freezeDelayMs = 180;
  let failNextFreeze = false;
  let liveTick = 0;
  let frozenAtTick = null;
  const fixture = {
    hidden: new Set(),
    offsets: new Map(),
  };

  const clone = value => value == null ? value : structuredClone(value);
  const sameRect = (a, b) => !!(a && b
    && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);
  const inside = (point, rect) => !!(point && rect
    && point.x >= rect.x && point.x < rect.x + rect.width
    && point.y >= rect.y && point.y < rect.y + rect.height);

  function screenPoint(event) {
    const bounds = stage.getBoundingClientRect();
    const origin = demo.origin;
    return {x: event.clientX - bounds.left + origin.x, y: event.clientY - bounds.top + origin.y};
  }

  function effectiveWindows() {
    return demo.nodes.filter(node => node.role === 'window' && !fixture.hidden.has(node.id)).map(node => {
      const offset = fixture.offsets.get(node.id) || {x: 0, y: 0};
      return {...node, rect: {...node.rect, x: node.rect.x + offset.x, y: node.rect.y + offset.y}};
    });
  }

  function windowAt(point) {
    return [...effectiveWindows()].reverse().find(node => inside(point, node.rect)) || null;
  }

  function setSelectionPrompt(message) {
    const instruction = document.getElementById('selection-instruction');
    if (instruction) {
      instruction.hidden = false;
      instruction.textContent = message || '移动鼠标选择窗口 · 单击开始测量 · Esc 取消';
    }
  }

  function hideSelectionPrompt() {
    const instruction = document.getElementById('selection-instruction');
    if (instruction) instruction.hidden = true;
  }

  function renderFreezing(candidate) {
    stage.classList.remove('selecting');
    stage.classList.add('freezing');
    document.getElementById('tools').hidden = true;
    document.getElementById('live-controls').hidden = true;
    const hud = document.getElementById('hud');
    hud.hidden = false;
    document.getElementById('hud-title').textContent = '正在冻结参照窗口';
    document.getElementById('hud-source').textContent = 'FREEZING · 尚未进入测量';
    document.getElementById('hud-size').textContent = candidate.label;
    document.getElementById('margin-table').replaceChildren();
    document.getElementById('hud-meta').textContent = 'Reference 已由有效单击确认；正在创建 Frozen Snapshot。';
    document.getElementById('status').textContent = '正在冻结确认窗口…取消或失败都不会产生可测 Snapshot。';
    setSelectionPrompt('正在冻结已确认窗口 · Esc 取消');
  }

  function restoreSelecting(message) {
    pending = null;
    frozenAtTick = null;
    demo.reselectReference();
    setSelectionPrompt();
    if (message) document.getElementById('status').textContent = message;
  }

  function beginFreeze(candidate) {
    if (!candidate || demo.state.phase !== 'REFERENCE_SELECTING') return false;
    const request = ++freezeVersion;
    pending = null;
    frozenAtTick = liveTick;
    demo.state.referenceCandidate = null;
    demo.state.reference = {id: candidate.id};
    demo.state.phase = 'FREEZING';
    renderFreezing(candidate);
    setTimeout(() => {
      if (request !== freezeVersion || !demo.state.active || demo.state.phase !== 'FREEZING') return;
      if (failNextFreeze) {
        failNextFreeze = false;
        restoreSelecting('冻结失败：未创建 Snapshot；桌面已恢复 Live，可重新选择窗口。');
        return;
      }
      // confirmReference owns the existing capture path and requires SELECTING as its gate.
      // The reset is not rendered, so the observable lifecycle remains FREEZING -> MEASURING.
      demo.state.phase = 'REFERENCE_SELECTING';
      const ok = demo.confirmReference(candidate.id);
      if (!ok) {
        restoreSelecting('冻结失败：Reference 已失效；桌面保持 Live，请重新选择。');
        return;
      }
      hideSelectionPrompt();
    }, freezeDelayMs);
    return true;
  }

  function cancelPending() {
    pending = null;
    demo.state.referenceDown = null;
  }

  overlay.addEventListener('pointerdown', event => {
    if (demo.state.phase !== 'REFERENCE_SELECTING') return;
    event.stopImmediatePropagation();
    cancelPending();
    if (event.button !== 0 || event.isPrimary === false) return;
    const point = screenPoint(event);
    const candidate = windowAt(point);
    if (!candidate) return;
    pending = {
      pointerId: event.pointerId,
      button: event.button,
      point,
      id: candidate.id,
      rect: clone(candidate.rect),
    };
    overlay.setPointerCapture?.(event.pointerId);
  }, true);

  overlay.addEventListener('pointerup', event => {
    if (demo.state.phase !== 'REFERENCE_SELECTING') return;
    event.stopImmediatePropagation();
    const down = pending;
    pending = null;
    try { overlay.releasePointerCapture?.(event.pointerId); } catch (_) { /* capture may already be gone */ }
    if (!down || down.button !== 0 || event.button !== 0 || event.isPrimary === false
      || event.pointerId !== down.pointerId) return;
    const point = screenPoint(event);
    const candidate = windowAt(point);
    const distance = Math.hypot(point.x - down.point.x, point.y - down.point.y);
    if (!candidate || candidate.id !== down.id || !sameRect(candidate.rect, down.rect)
      || distance > CLICK_TOLERANCE_PX) return;
    beginFreeze(candidate);
  }, true);

  overlay.addEventListener('pointercancel', event => {
    if (demo.state.phase === 'REFERENCE_SELECTING') event.stopImmediatePropagation();
    cancelPending();
  }, true);

  overlay.addEventListener('contextmenu', event => {
    if (demo.state.phase === 'REFERENCE_SELECTING') event.preventDefault();
  }, true);

  window.addEventListener('blur', cancelPending, true);
  window.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || demo.state.phase !== 'FREEZING') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    freezeVersion += 1;
    cancelPending();
    demo.exitMeasurement();
    hideSelectionPrompt();
  }, true);

  // Prototype observer: the live source clock continues after freeze while the captured
  // Snapshot token and frozenAtTick stay fixed. This is instrumentation, not product chrome.
  const liveProbe = document.getElementById('live-source-probe');
  const observer = document.getElementById('oracle-observer');
  setInterval(() => {
    liveTick += 1;
    if (liveProbe) liveProbe.textContent = `LIVE source · ${liveTick}`;
    if (observer) {
      const snapshot = demo.state.snapshotId || 'none';
      observer.textContent = `Prototype observer · live=${liveTick} · frozenAt=${frozenAtTick ?? 'none'} · snapshot=${snapshot}`;
    }
    if (demo.state.phase === 'REFERENCE_SELECTING') setSelectionPrompt();
    else if (demo.state.phase === 'MEASURING') hideSelectionPrompt();
  }, 250);

  const test = Object.freeze({
    failNextFreeze() { failNextFreeze = true; },
    setFreezeDelay(ms) { freezeDelayMs = Math.max(0, Number(ms) || 0); },
    closeWindow(id) { fixture.hidden.add(id); },
    moveWindow(id, dx, dy) { fixture.offsets.set(id, {x: Number(dx) || 0, y: Number(dy) || 0}); },
    restoreWindows() { fixture.hidden.clear(); fixture.offsets.clear(); },
    cancelFreeze() { freezeVersion += 1; cancelPending(); if (demo.state.active) demo.exitMeasurement(); },
  });

  root.MeasureReferenceSelection = Object.freeze({
    get state() {
      return {pending: clone(pending), liveTick, frozenAtTick, freezeVersion, clickTolerancePx: CLICK_TOLERANCE_PX};
    },
    test,
  });

  setSelectionPrompt();
})(globalThis);
