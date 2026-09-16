'use strict';
// Desktop Measurement Interaction Oracle. This file intentionally models product
// interaction/state only; it is not a native capture, AX/UIA, OCR or locator runtime.
(function installDesktopMeasurementOracle(root) {
  const M = root.MeasureModel;
  const V = root.MeasureVisual;
  const R = root.MeasureRecords;
  if (!V || !R) throw new Error('Visual resolver and Session Records must load before interaction core');
  if (!M) throw new Error('MeasureModel must be loaded before interaction-core.js');

  const $ = id => document.getElementById(id);
  const stage = $('stage');
  const overlay = $('overlay');
  const desktop = $('desktop');
  const NS = 'http://www.w3.org/2000/svg';
  const clone = value => value == null ? value : structuredClone(value);
  const fmt = value => Number.isFinite(value) ? Number(value.toFixed(2)).toString() : '—';
  const area = rect => rect ? Math.max(0, rect.width) * Math.max(0, rect.height) : 0;
  const inside = (point, rect) => !!(point && rect
    && point.x >= rect.x && point.x < rect.x + rect.width
    && point.y >= rect.y && point.y < rect.y + rect.height);

  const E = {
    active: false,
    adjusting: false,
    phase: 'IDLE',
    session: 0,
    generation: 0,
    snapshotRevision: 0,
    snapshotId: null,
    source: '',
    mode: 'region',
    magnet: true,
    alt: false,
    pointer: null,
    candidate: null,
    stack: [],
    layer: 0,
    target: null,
    localReference: null,
    marginView: 'window',
    pointResult: null,
    pointPair: [],
    regionPair: [],
    dragStart: null,
    dragCurrent: null,
    inspectorOpen: false,
    status: '',
    candidateEpoch: 0,
    pending: false,
    visualRuns: 0,
    pixelCache: [],
    live: {scroll: 0, tab: 0, menu: false},
    lastCopy: null,
    sessionId: '', reference: null, referenceCandidate: null, referenceDown: null,
    currentSnapshot: null, records: [], pointerRevision: 0, lastResolveAt: -Infinity,
    exportStatus: null, metrics: {pointerMoveCount: 0, semanticResolveCount: 0, candidateReuse: 0},
  };

  let W = 0;
  let H = 0;
  let origin = {x: 0, y: 0};
  let win = null;
  let nodes = [];
  let byId = new Map();
  let tiles = [];
  let rawCanvases = new Map();
  let analysisCanvas = null;
  let analysisPixels = null;
  let resolveTimer = null;
  let toastTimer = null;
  let visual = V.create();
  let journal = null;
  let inspectorRevision = '';
  const isMeasuring = () => E.active && E.phase === 'MEASURING' && !!E.snapshotId;
  const isSelecting = () => E.active && E.phase === 'REFERENCE_SELECTING';
  const canResolve = () => isMeasuring() && E.magnet && !E.alt && !!E.pointer && !E.target && windowAt(E.pointer)?.id === win?.id;
  const canRecord = () => isMeasuring() && !!(E.mode === 'region' && E.target
    || E.mode === 'point' && E.pointResult || E.mode === 'pp' && E.pointPair.length === 2
    || E.mode === 'rr' && E.regionPair.length === 2);
  const escapeText = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));


  function absPoint(point) { return {x: point.x + origin.x, y: point.y + origin.y}; }
  function localPoint(point) { return {x: point.x - origin.x, y: point.y - origin.y}; }
  function absRect(rect) { return {...rect, x: rect.x + origin.x, y: rect.y + origin.y}; }
  function localRect(rect) { return {...rect, x: rect.x - origin.x, y: rect.y - origin.y}; }

  function notify(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 1800);
  }

  function setStatus(message) {
    E.status = message;
    $('status').textContent = message;
  }

  function svg(name, attrs) {
    const el = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs || {})) el.setAttribute(key, String(value));
    return el;
  }

  function roundedRect(ctx, rect, fill, radius = 7) {
    ctx.beginPath();
    ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function text(ctx, value, x, y, size = 12, color = '#657783', weight = 400) {
    ctx.font = `${weight} ${size}px -apple-system, "Segoe UI", "Noto Sans CJK SC", sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  }

  function node(id, label, localBounds, parentId, role = 'group') {
    return {
      id, label, rect: absRect(localBounds), parentId, role,
      provider: 'synthetic-ui-tree',
      reliability: 'fixture-not-native',
    };
  }

  function defineScene() {
    const shiftY = E.live.scroll * -28;
    const wx = W > 1000 ? 62 : 24;
    const wy = 66;
    const ww = Math.max(420, Math.min(1032, W - (W > 1120 ? 366 : 68)));
    const wh = Math.max(330, Math.min(610, H - 118));
    const listW = ww > 730 ? 224 : ww > 500 ? 158 : 96;
    const navW = 56;
    const chatX = wx + navW + listW;
    const chatW = ww - navW - listW;
    const windowRect = {x: wx, y: wy, width: ww, height: wh};
    const chat = {x: chatX, y: wy + 44, width: chatW, height: wh - 44};
    const inputH = Math.min(164, wh * .30);
    const composer = {x: chatX + 18, y: wy + wh - inputH - 14 + shiftY, width: chatW - 36, height: inputH};
    const input = {x: composer.x + 12, y: composer.y + 38, width: composer.width - 24, height: Math.max(34, composer.height - 94)};
    const send = {x: composer.x + composer.width - 100, y: composer.y + composer.height - 43, width: 86, height: 29};
    const bubble = {x: chatX + 52, y: wy + 140 + shiftY, width: Math.max(120, Math.min(320, chatW - 88)), height: 76};
    nodes = [
      node('window', E.live.tab ? '微信 · 文件' : '微信 · 产品讨论', windowRect, null, 'window'),
      node('chat', E.live.tab ? '文件区' : '聊天区', chat, 'window', 'group'),
      node('composer', '输入区', composer, 'chat', 'group'),
      node('input', '文本输入框', input, 'composer', 'textField'),
      node('send', '发送按钮', send, 'composer', 'button'),
      node('bubble', E.live.tab ? '文件卡片' : '消息气泡', bubble, 'chat', 'group'),
      node('conversations', '会话列表', {x: wx + navW, y: wy + 44, width: listW, height: wh - 44}, 'window', 'list'),
    ];
    // A second real fixture window makes Reference acquisition demonstrable.
    const note = {x: W-286, y: Math.min(H-238, 356), width: 256, height: 192};
    nodes.push(node('notes-window', '备忘录 · 校准笔记', note, null, 'window'));
    nodes.push(node('note-input', '笔记输入区', {x: note.x+16, y: note.y+48, width: 224, height: 122}, 'notes-window', 'textField'));
    byId = new Map(nodes.map(item => [item.id, item]));
    win = byId.get(E.reference ? E.reference.id : 'window');
  }

  function drawScene(ctx) {
    const windowRect = localRect(byId.get('window').rect);
    const chat = localRect(byId.get('chat').rect);
    const list = localRect(byId.get('conversations').rect);
    const composer = localRect(byId.get('composer').rect);
    const input = localRect(byId.get('input').rect);
    const send = localRect(byId.get('send').rect);
    const bubble = localRect(byId.get('bubble').rect);

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#e9eef1'); bg.addColorStop(.62, '#dce6ed'); bg.addColorStop(1, '#c8dae5');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#ffffff25';
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    text(ctx, '合成桌面（非真实系统）', 20, 26, 10, '#688593', 500);

    ctx.shadowColor = '#365a7533'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 14;
    roundedRect(ctx, windowRect, '#f7f8fa', 11);
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.save(); ctx.beginPath(); ctx.roundRect(windowRect.x, windowRect.y, windowRect.width, windowRect.height, 11); ctx.clip();
    ctx.fillStyle = '#f8f9fa'; ctx.fillRect(windowRect.x, windowRect.y, windowRect.width, 44);
    ['#e68c84', '#e8c577', '#95bca7'].forEach((color, i) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(windowRect.x + 18 + i * 16, windowRect.y + 21, 4.5, 0, Math.PI * 2); ctx.fill();
    });
    text(ctx, E.live.tab ? '微信 · 文件' : '微信', windowRect.x + 82, windowRect.y + 26, 12, '#526b79', 550);
    if (E.live.menu) {
      roundedRect(ctx, {x: windowRect.x + windowRect.width - 188, y: windowRect.y + 42, width: 168, height: 106}, '#ffffff', 7);
      text(ctx, '合成菜单', windowRect.x + windowRect.width - 168, windowRect.y + 68, 11, '#506774', 550);
      text(ctx, '置顶窗口', windowRect.x + windowRect.width - 168, windowRect.y + 94, 10, '#6d818d');
      text(ctx, '清空记录', windowRect.x + windowRect.width - 168, windowRect.y + 119, 10, '#6d818d');
    }
    ctx.fillStyle = '#e4eaf0'; ctx.fillRect(windowRect.x, windowRect.y + 44, 56, windowRect.height - 44);
    roundedRect(ctx, {x: windowRect.x + 12, y: windowRect.y + 65, width: 32, height: 32}, '#91b5b8', 8);
    text(ctx, '林', windowRect.x + 21, windowRect.y + 87, 14, '#f6ffff', 500);
    ctx.fillStyle = '#f0f3f6'; ctx.fillRect(list.x, list.y, list.width, list.height);
    roundedRect(ctx, {x: list.x + 12, y: list.y + 13, width: list.width - 24, height: 27}, '#e3e9ed', 6);
    text(ctx, '⌕  搜索', list.x + 23, list.y + 31, 11, '#91a5b0');
    ctx.fillStyle = '#f7f9fb'; ctx.fillRect(chat.x, chat.y, chat.width, chat.height);
    text(ctx, E.live.tab ? '文件传输助手' : '陈一 · 产品讨论', chat.x + 24, chat.y + 34, 14, '#3b5869', 550);
    ctx.fillStyle = '#e7edf1'; ctx.fillRect(chat.x, chat.y + 53, chat.width, 1);
    roundedRect(ctx, bubble, E.live.tab ? '#eef1df' : '#e8eef3', 8);
    text(ctx, E.live.tab ? 'measurement-evidence.json' : '坐标、尺寸和边距最好一起提供。', bubble.x + 13, bubble.y + 29, 11, '#5d7688');
    roundedRect(ctx, composer, '#ffffff', 8);
    ctx.strokeStyle = '#e1e8ed'; ctx.strokeRect(composer.x + .5, composer.y + .5, composer.width - 1, composer.height - 1);
    roundedRect(ctx, input, '#fafbfc', 4);
    text(ctx, '在这里输入消息…', input.x + 10, input.y + 24, 11, '#b1bfc8');
    roundedRect(ctx, send, '#d9eee4', 5); text(ctx, '发送', send.x + 30, send.y + 19, 11, '#548770', 550);
    ctx.restore();
    const note = localRect(byId.get('notes-window').rect);
    roundedRect(ctx, note, '#fff7d9', 9);
    text(ctx, '备忘录 · 校准笔记', note.x+16, note.y+28, 12, '#766943', 550);
    roundedRect(ctx, localRect(byId.get('note-input').rect), '#fffcf2', 4);
    text(ctx, '先选择窗口，再开始测量。', note.x+26, note.y+78, 11, '#8e805a');
  }

  function drawLiveDesktop() {
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    desktop.width = Math.round(W * ratio); desktop.height = Math.round(H * ratio);
    desktop.style.width = `${W}px`; desktop.style.height = `${H}px`;
    const ctx = desktop.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawScene(ctx);
    $('live-state').textContent = `scroll=${E.live.scroll} · tab=${E.live.tab} · menu=${E.live.menu ? 'open' : 'closed'}`;
  }

  function displayLayout() {
    const mode = $('display-mode').value;
    origin = {x: mode === 'retina' ? 0 : -Math.round(W / 2), y: mode === 'negative' ? -180 : 0};
    if (mode === 'mixed') {
      const left = Math.floor(W / 2);
      return [{x: 0, width: left, scale: 1}, {x: left, width: W - left, scale: 2}];
    }
    return [{x: 0, width: W, scale: mode === 'negative' ? 1.25 : 2}];
  }

  function captureSnapshot(reason) {
    if (!E.reference) throw new Error('Reference must be explicitly confirmed before capture');
    W = Math.max(640, stage.clientWidth);
    H = Math.max(380, stage.clientHeight);
    const parts = displayLayout();
    defineScene();
    drawLiveDesktop();
    $('scene').replaceChildren();
    rawCanvases.clear();
    tiles = parts.map((part, index) => {
      const canvas = document.createElement('canvas');
      canvas.className = 'raw';
      canvas.style.cssText = `position:absolute;left:${part.x}px;top:0;width:${part.width}px;height:${H}px`;
      canvas.width = Math.round(part.width * part.scale);
      canvas.height = Math.round(H * part.scale);
      const ctx = canvas.getContext('2d', {willReadFrequently: true});
      ctx.scale(canvas.width / part.width, canvas.height / H);
      ctx.translate(-part.x, 0);
      drawScene(ctx);
      $('scene').append(canvas);
      const displayId = `demo-display-${index + 1}`;
      rawCanvases.set(displayId, canvas);
      return {
        displayId,
        logicalBounds: {x: origin.x + part.x, y: origin.y, width: part.width, height: H},
        pixelSize: {width: canvas.width, height: canvas.height},
        scaleX: canvas.width / part.width,
        scaleY: canvas.height / H,
        colorSpace: 'sRGB',
      };
    });
    analysisCanvas = document.createElement('canvas');
    analysisCanvas.width = W; analysisCanvas.height = H;
    const analysis = analysisCanvas.getContext('2d', {willReadFrequently: true});
    drawScene(analysis);
    analysisPixels = analysis.getImageData(0, 0, W, H);
    E.snapshotRevision += 1;
    E.snapshotId = `${E.sessionId}-g${E.generation}-r${E.snapshotRevision}`;
    E.reference = {id: win.id, kind: 'window', label: win.label, bounds: clone(win.rect),
      source: 'synthetic-window-fixture', reliability: 'fixture-not-native'};
    E.currentSnapshot = {snapshotId: E.snapshotId, token: token(), referenceWindow: clone(E.reference),
      displayMapping: clone(tiles), capturedAt: new Date().toISOString(), prototypeOnly: true};
    visual.reset({snapshotId: E.snapshotId, image: analysisPixels, origin: clone(origin), referenceBounds: clone(win.rect)});
    E.pixelCache = [];
    E.target = null;
    E.localReference = null;
    E.pointResult = null;
    E.pointPair = [];
    E.regionPair = [];
    E.candidate = null;
    E.stack = [];
    E.layer = 0;
    E.dragStart = null;
    E.dragCurrent = null;
    overlay.setAttribute('viewBox', `0 0 ${W} ${H}`);
    setStatus(`${reason}：已生成新的冻结 Snapshot ${E.snapshotId}`);
    render();
  }

  function token() {
    return {sessionId: E.sessionId, generation: E.generation, snapshotId: E.snapshotId};
  }

  function sameToken(a, b) {
    return !!(a && b && a.sessionId === b.sessionId && a.generation === b.generation && a.snapshotId === b.snapshotId);
  }

  function invalidateAsync() {
    E.candidateEpoch += 1;
    E.pending = false;
    clearTimeout(resolveTimer);
    resolveTimer = null;
  }

  function rawColor(point) {
    if (!point) return null;
    const mapped = M.logicalToPixel(point, tiles);
    if (!mapped) return null;
    const canvas = rawCanvases.get(mapped.displayId);
    const ctx = canvas && canvas.getContext('2d', {willReadFrequently: true});
    if (!ctx) return null;
    const rgba = Array.from(ctx.getImageData(mapped.x, mapped.y, 1, 1).data);
    return {
      hex: '#' + rgba.slice(0, 3).map(value => value.toString(16).padStart(2, '0')).join('').toUpperCase(),
      rgba,
      imagePixel: {x: mapped.x, y: mapped.y},
      displayId: mapped.displayId,
      scaleX: mapped.scaleX,
      scaleY: mapped.scaleY,
      colorSpace: 'sRGB',
      source: 'frozen-synthetic-source-pixel',
      interpolation: 'none',
    };
  }

  function semanticAt(point) {
    // Hit-test immutable snapshot nodes; no native AX traversal on pointermove.
    if (!win || windowAt(point)?.id !== win.id) return [];
    return nodes.filter(item => {
      if (!inside(point, item.rect)) return false;
      let parent = item;
      while (parent.parentId) parent = byId.get(parent.parentId);
      return parent.id === win.id;
    }).sort((a,b) => area(a.rect)-area(b.rect) || a.id.localeCompare(b.id));
  }

  function windowAt(point) {
    return [...nodes].reverse().find(item => item.role === 'window' && inside(point, item.rect)) || null;
  }

  function previewNode(item) {
    return item ? {...clone(item), state: 'preview', snapshotId: E.snapshotId,
      semantic: item.provider === 'synthetic-ui-tree'} : null;
  }

  function metrics() {
    return clone({...E.metrics, ...visual.stats});
  }

  function visualAt(point, expectedToken, expectedEpoch) {
    const candidate = visual.resolve(point, Number($('tolerance').value),
      () => canResolve() && sameToken(expectedToken, token()) && expectedEpoch === E.candidateEpoch);
    E.visualRuns = visual.stats.floodFillRuns;
    return candidate;
  }

  function chooseLocalReference(target) {
    if (!target || !target.parentId || target.provider !== 'synthetic-ui-tree') return null;
    let parent = byId.get(target.parentId);
    while (parent && parent.id !== win.id) {
      const nearlySame = Math.abs(parent.rect.x - target.rect.x) <= 2
        && Math.abs(parent.rect.y - target.rect.y) <= 2
        && Math.abs((parent.rect.x + parent.rect.width) - (target.rect.x + target.rect.width)) <= 2
        && Math.abs((parent.rect.y + parent.rect.height) - (target.rect.y + target.rect.height)) <= 2;
      if (!nearlySame && parent.role !== 'technical-wrapper') {
        return {
          id: parent.id, label: parent.label, bounds: clone(parent.rect),
          source: 'synthetic-ui-tree', reliability: 'fixture-not-native',
        };
      }
      parent = parent.parentId ? byId.get(parent.parentId) : null;
    }
    return null;
  }

  function resolveNow(expectedToken, expectedEpoch) {
    resolveTimer = null; E.pending = false;
    if (!canResolve() || !sameToken(expectedToken, token()) || expectedEpoch !== E.candidateEpoch) return;
    E.lastResolveAt = performance.now();
    const provider = $('provider').value;
    let stack = provider === 'visual' ? [] : semanticAt(E.pointer);
    E.metrics.semanticResolveCount += provider === 'visual' ? 0 : 1;
    const hasControl = stack.some(item => item.role !== 'window');
    if (provider === 'visual' || provider === 'auto' && !hasControl) {
      const found = visualAt(E.pointer, expectedToken, expectedEpoch);
      // A Window ancestor has its own window provenance; it is not flood-fill output.
      stack = found ? [found, {...clone(win), provider: 'synthetic-window-fixture', semantic: false}] : stack;
    }
    if (!canResolve() || !sameToken(expectedToken, token()) || expectedEpoch !== E.candidateEpoch) return;
    const previous = E.candidate && E.candidate.id;
    E.stack = stack.map(previewNode);
    const retained = E.stack.findIndex(item => item.id === previous);
    E.layer = retained >= 0 ? retained : 0;
    E.candidate = clone(E.stack[E.layer] || null);
    setStatus(E.candidate
      ? `候选预览：${E.candidate.label} · ${E.candidate.provider} · 点击锁定，Enter 记录`
      : '没有可靠候选；请人工框选。视觉推断不会冒充语义控件。');
    render();
  }

  function scheduleResolve() {
    if (!canResolve()) {
      if (!E.target && E.candidate) { invalidateAsync(); E.candidate = null; E.stack = []; E.layer = 0; }
      return;
    }
    const provider = $('provider').value;
    const semantic = provider === 'visual' ? [] : semanticAt(E.pointer);
    const sameStack = semantic.length && E.stack.length === semantic.length
      && semantic.every((item,i) => item.id === E.stack[i].id);
    if (E.candidate && inside(E.pointer,E.candidate.rect) && sameStack) {
      E.metrics.candidateReuse++; return;
    }
    // Do not pin an ancestor across child boundaries. This is a cheap cache hit-test.
    if (provider !== 'visual' && semantic.some(item => item.role !== 'window')) {
      E.candidate = null; E.stack = []; E.layer = 0;
    } else {
      const reuse = visual.reuse(E.pointer, Number($('tolerance').value));
      if (reuse.hit) {
        if (reuse.candidate) {
          const id = E.candidate && E.candidate.id;
          E.stack = [reuse.candidate, previewNode({...win, provider: 'synthetic-window-fixture'})];
          E.layer = Math.max(0,E.stack.findIndex(item => item.id === id));
          E.candidate = clone(E.stack[E.layer]);
        } else { E.candidate = null; E.stack = []; E.layer = 0; }
        E.metrics.candidateReuse++; return;
      }
      E.candidate = null; E.stack = []; E.layer = 0;
    }
    // Latest-pointer trailing throttle: continuous movement cannot starve resolution.
    if (resolveTimer !== null) return;
    E.pending = true;
    const expectedToken = clone(token()), expectedEpoch = E.candidateEpoch;
    const delay = Math.max(0, V.DEFAULTS.throttleMs-(performance.now()-E.lastResolveAt));
    resolveTimer = setTimeout(() => resolveNow(expectedToken, expectedEpoch), delay);
  }

  function screenPointFromEvent(event) {
    const rect = stage.getBoundingClientRect();
    return absPoint({x: event.clientX - rect.left, y: event.clientY - rect.top});
  }

  function pointerMove(point) {
    if (!E.active || E.adjusting) return;
    E.metrics.pointerMoveCount++; E.pointerRevision++; E.pointer = point;
    if (isSelecting()) {
      E.referenceCandidate = clone(windowAt(point)); render(); return;
    }
    if (!isMeasuring()) return;
    if (E.dragStart) E.dragCurrent = point;
    scheduleResolve();
    render();
  }

  function setMode(mode) {
    if (!isMeasuring()) return;
    invalidateAsync();
    if (!['point', 'region', 'pp', 'rr'].includes(mode)) return;
    E.mode = mode;
    E.target = null; E.localReference = null; E.pointResult = null; E.pointPair = []; E.regionPair = [];
    E.dragStart = null; E.dragCurrent = null; E.candidate = null; E.stack = []; E.layer = 0;
    setStatus({point: '点：移动鼠标查看三级坐标与源像素颜色；点击确认。', region: '区域：磁吸候选点击锁定；拖拽可人工框选。', pp: '两点：依次点击两个点。', rr: '两区域：依次拖拽两个区域。'}[mode]);
    render();
  }

  function lockCandidate() {
    if (!isMeasuring() || !E.candidate || E.alt || !E.magnet || !inside(E.pointer,E.candidate.rect) || E.candidate.snapshotId !== E.snapshotId) return false;
    E.target = {...clone(E.candidate), state: 'confirmed'};
    E.localReference = chooseLocalReference(E.target);
    E.marginView = 'window';
    setStatus(`已锁定 Target：${E.target.label}；局部参照：${E.localReference ? E.localReference.label : '无可靠局部参照'}`);
    invalidateAsync();
    render();
    return true;
  }

  function manualTarget(bounds) {
    E.target = {state: 'confirmed', snapshotId: E.snapshotId, id: 'manual-target', label: '人工区域', rect: bounds, parentId: null, role: null, provider: 'manual', reliability: 'user-confirmed'};
    E.localReference = null;
    E.marginView = 'window';
    setStatus('已锁定人工 Target；未编造局部参照。');
    render();
  }

  function pointerDown(point) {
    if (isSelecting()) {
      const candidate = windowAt(point);
      E.referenceDown = candidate ? {id: candidate.id, rect: clone(candidate.rect), point: clone(point)} : null;
      return;
    }
    if (!isMeasuring()) return;
    E.pointer = point;
    // Never commit a stale candidate from a previous pointer location.
    if (E.candidate && !inside(point,E.candidate.rect)) { E.candidate = null; E.stack = []; }
    E.dragStart = point; E.dragCurrent = point;
  }

  function pointerUp(point) {
    if (isSelecting()) {
      const candidate = windowAt(point), down = E.referenceDown;
      E.referenceDown = null;
      if (candidate && down && candidate.id === down.id
        && JSON.stringify(candidate.rect) === JSON.stringify(down.rect)
        && Math.hypot(point.x-down.point.x,point.y-down.point.y) < 5) confirmReference(candidate.id);
      return;
    }
    if (!isMeasuring()) return;
    E.pointer = point;
    const start = E.dragStart || point;
    const dragRect = {
      x: Math.min(start.x, point.x), y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y),
    };
    const dragged = dragRect.width >= 5 && dragRect.height >= 5;
    E.dragStart = null; E.dragCurrent = null;

    if (E.mode === 'point') {
      E.pointResult = {absolute: clone(point), color: rawColor(point)};
      setStatus('点已确认；颜色来自冻结 Snapshot 源像素。');
    } else if (E.mode === 'region') {
      if (dragged) manualTarget(dragRect);
      else if (!lockCandidate()) setStatus('当前没有可靠候选；拖拽可人工框选。');
    } else if (E.mode === 'pp') {
      E.pointPair.push(clone(point));
      if (E.pointPair.length > 2) E.pointPair = [clone(point)];
      setStatus(E.pointPair.length === 1 ? '第一点已锁定，请选择第二点。' : '两点距离已形成。');
    } else if (E.mode === 'rr') {
      if (!dragged) { setStatus('两区域模式需要拖拽正宽高区域。'); return; }
      E.regionPair.push(dragRect);
      if (E.regionPair.length > 2) E.regionPair = [dragRect];
      setStatus(E.regionPair.length === 1 ? '第一区域已锁定，请拖拽第二区域。' : '两区域距离已形成。');
    }
    render();
  }

  function signedMargins(target, reference) {
    return M.relative(target, reference).signedEdges;
  }

  function targetBounds() {
    if (E.target && E.target.rect) return E.target.rect;
    if (E.mode === 'rr' && E.regionPair.length) return E.regionPair[E.regionPair.length - 1];
    return null;
  }

  function currentRegionForPointer() {
    if (E.target && E.target.rect && inside(E.pointer, E.target.rect)) return E.target.rect;
    if (E.candidate && E.candidate.rect && inside(E.pointer, E.candidate.rect)) return E.candidate.rect;
    return null;
  }

  function coordinateTriple(point) {
    if (!point || !win) return null;
    const region = currentRegionForPointer();
    return {
      screen: clone(point),
      window: {x: point.x - win.rect.x, y: point.y - win.rect.y},
      region: region ? {x: point.x - region.x, y: point.y - region.y} : null,
    };
  }

  function appendRect(rect, className) {
    if (!rect) return;
    const local = localRect(rect);
    overlay.append(svg('rect', {x: local.x, y: local.y, width: local.width, height: local.height, class: className}));
  }

  function appendLine(a, b, className) {
    const first = localPoint(a), second = localPoint(b);
    overlay.append(svg('line', {x1: first.x, y1: first.y, x2: second.x, y2: second.y, class: className}));
  }

  function drawMask() {
    if (!win) return;
    const r = localRect(win.rect);
    const d = `M0 0H${W}V${H}H0Z M${r.x} ${r.y}H${r.x + r.width}V${r.y + r.height}H${r.x}Z`;
    overlay.append(svg('path', {d, class: 'mask', 'fill-rule': 'evenodd'}));
    appendRect(win.rect, 'window-outline');
  }

  function drawMarginLines(target) {
    if (!target || !$('margin-table')) return;
    let reference = win && win.rect;
    const local = E.localReference || (!E.target && chooseLocalReference(E.candidate));
    if (E.marginView === 'local' && local) reference = local.bounds;
    if (!reference) return;
    const tc = {x: target.x + target.width / 2, y: target.y + target.height / 2};
    appendLine({x: reference.x, y: tc.y}, {x: target.x, y: tc.y}, 'margin-line');
    appendLine({x: tc.x, y: reference.y}, {x: tc.x, y: target.y}, 'margin-line');
    appendLine({x: target.x + target.width, y: tc.y}, {x: reference.x + reference.width, y: tc.y}, 'margin-line');
    appendLine({x: tc.x, y: target.y + target.height}, {x: tc.x, y: reference.y + reference.height}, 'margin-line');
  }

  function renderOverlay() {
    overlay.replaceChildren();
    if (isSelecting()) {
      if (E.referenceCandidate) appendRect(E.referenceCandidate.rect, 'window-preview');
      return;
    }
    if (!isMeasuring()) return;
    drawMask();
    if (E.candidate && !E.target) appendRect(E.candidate.rect, 'candidate');
    const target = targetBounds();
    if (target) appendRect(target, 'candidate locked');
    if (E.localReference) appendRect(E.localReference.bounds, 'local-reference');
    if (target) drawMarginLines(target);
    else if (E.candidate) drawMarginLines(E.candidate.rect);
    if (E.dragStart && E.dragCurrent) {
      appendRect({x: Math.min(E.dragStart.x, E.dragCurrent.x), y: Math.min(E.dragStart.y, E.dragCurrent.y), width: Math.abs(E.dragCurrent.x - E.dragStart.x), height: Math.abs(E.dragCurrent.y - E.dragStart.y)}, 'candidate');
    }
    if (E.pointPair.length === 1) {
      const p = localPoint(E.pointPair[0]); overlay.append(svg('circle', {cx: p.x, cy: p.y, r: 4, class: 'handle'}));
    } else if (E.pointPair.length === 2) {
      appendLine(E.pointPair[0], E.pointPair[1], 'distance-line');
    }
    if (E.regionPair.length >= 1) appendRect(E.regionPair[0], 'candidate locked');
    if (E.regionPair.length >= 2) {
      appendRect(E.regionPair[1], 'candidate locked');
      appendLine({x: E.regionPair[0].x + E.regionPair[0].width / 2, y: E.regionPair[0].y + E.regionPair[0].height / 2}, {x: E.regionPair[1].x + E.regionPair[1].width / 2, y: E.regionPair[1].y + E.regionPair[1].height / 2}, 'distance-line');
    }
  }

  function renderMicro() {
    const micro = $('micro');
    if (!isMeasuring() || !E.pointer) { micro.hidden = true; return; }
    const triple = coordinateTriple(E.pointer);
    const color = rawColor(E.pointer);
    const regionText = triple.region ? `${fmt(triple.region.x)} / ${fmt(triple.region.y)}` : '—';
    micro.textContent = `屏幕   ${fmt(triple.screen.x)} / ${fmt(triple.screen.y)}\n窗口   ${fmt(triple.window.x)} / ${fmt(triple.window.y)}\n区域   ${regionText}\n■ ${color ? color.hex : '—'}`;
    micro.hidden = false;
    const stageRect = stage.getBoundingClientRect();
    let x = E.pointer.x - origin.x + 16, y = E.pointer.y - origin.y + 18;
    const width = 176, height = 72;
    if (x + width > stageRect.width - 6) x = E.pointer.x - origin.x - width - 16;
    if (y + height > stageRect.height - 6) y = E.pointer.y - origin.y - height - 16;
    micro.style.left = `${Math.max(6, x)}px`; micro.style.top = `${Math.max(6, y)}px`;
  }

  function marginCell(value) {
    const cls = value < 0 ? 'negative' : '';
    return `<span class="${cls}">${fmt(value)}</span>`;
  }

  function renderHUD() {
    const hud = $('hud');
    if (!E.active || E.adjusting) { hud.hidden = true; return; }
    hud.hidden = false;
    if (isSelecting()) {
      $('hud-title').textContent = '选择参照窗口 · Live';
      $('hud-source').textContent = '尚未冻结';
      $('hud-size').textContent = E.referenceCandidate ? E.referenceCandidate.label : '移动鼠标选择窗口';
      $('margin-table').replaceChildren();
      const r = E.referenceCandidate && E.referenceCandidate.rect;
      $('hud-meta').textContent = r ? `${fmt(r.x)} / ${fmt(r.y)} · ${fmt(r.width)} × ${fmt(r.height)} · 单击确认后才冻结；Esc 退出。` : '没有窗口候选；不会把背景当作 Reference。';
      return;
    }
    $('hud-title').textContent = canRecord() ? '已锁定 · 待记录' : E.candidate ? '候选预览 · 未确认' : '桌面测量';
    const object = E.target || E.candidate;
    $('hud-source').textContent = object ? `${object.semantic || object.provider === 'synthetic-ui-tree' ? 'UI Tree' : object.provider === 'manual' ? 'Manual' : object.provider === 'synthetic-window-fixture' ? 'Window' : 'Visual'} · ${E.layer+1}/${Math.max(1,E.stack.length)} · 磁吸${E.magnet ? '开' : '关'}${E.alt ? '（临时暂停）' : ''}` : `磁吸定位 · ${E.magnet ? '开' : '关'}${E.alt ? '（临时暂停）' : ''}`;
    const target = targetBounds() || (!E.pointResult && E.pointPair.length !== 2 && E.candidate ? E.candidate.rect : null);
    const local = E.localReference || (!E.target && chooseLocalReference(E.candidate));
    // Completed pair relation must precede the generic last-region Target HUD.
    if (E.mode === 'rr' && E.regionPair.length === 2) {
      const result = M.rectangles(E.regionPair[0], E.regionPair[1]);
      $('hud-size').textContent = `两区域　H gap ${fmt(result.horizontalGap)} · V gap ${fmt(result.verticalGap)}`;
      $('margin-table').innerHTML = '';
      $('hud-meta').textContent = `overlap ${fmt(result.overlapArea)} · center Δ ${fmt(result.centerDelta.x)} / ${fmt(result.centerDelta.y)}`;
    } else if (target) {
      $('hud-size').textContent = `${object ? object.label : '区域'}　${fmt(target.width)} × ${fmt(target.height)}`;
      const windowMargins = signedMargins(target, win.rect);
      const localMargins = local ? signedMargins(target, local.bounds) : null;
      let html = '<span class="head">边距参照</span><span class="head">左</span><span class="head">上</span><span class="head">右</span><span class="head">下</span>';
      html += `<span class="${E.marginView === 'window' ? 'selected' : ''}">整个窗口</span>${marginCell(windowMargins.left)}${marginCell(windowMargins.top)}${marginCell(windowMargins.right)}${marginCell(windowMargins.bottom)}`;
      if (localMargins) html += `<span class="${E.marginView === 'local' ? 'selected' : ''}">${escapeText(local.label)}</span>${marginCell(localMargins.left)}${marginCell(localMargins.top)}${marginCell(localMargins.right)}${marginCell(localMargins.bottom)}`;
      $('margin-table').innerHTML = html;
      const proportion = M.relative(target,win.rect).percentage;
      $('hud-meta').textContent = `${local ? local.label+' › ' : ''}${object ? object.label : '区域'} · 比例 ${fmt(proportion.width)}% × ${fmt(proportion.height)}% · 最多两组边距；Overlay 当前只突出：${E.marginView === 'local' && local ? local.label : '整个窗口'}。`;
    } else if (E.pointResult) {
      $('hud-size').textContent = `点　${fmt(E.pointResult.absolute.x)} / ${fmt(E.pointResult.absolute.y)}　${E.pointResult.color ? E.pointResult.color.hex : '—'}`;
      $('margin-table').innerHTML = '';
      $('hud-meta').textContent = '点坐标与颜色均来自当前冻结 Snapshot；不会从蒙版或 HUD 混合像素取色。';
    } else if (E.pointPair.length === 2) {
      const result = M.points(E.pointPair[0], E.pointPair[1]);
      $('hud-size').textContent = `两点距离　${fmt(result.straightDistance)}`;
      $('margin-table').innerHTML = '';
      $('hud-meta').textContent = `ΔX ${fmt(result.dx)} · ΔY ${fmt(result.dy)} · H ${fmt(result.horizontalDistance)} · V ${fmt(result.verticalDistance)}`;
    } else {
      $('hud-size').textContent = '移动鼠标开始测量';
      $('margin-table').innerHTML = '';
      $('hud-meta').textContent = `Snapshot ${E.snapshotId || '—'} · generation ${E.generation}`;
    }
  }

  function structuredData() {
    const target = targetBounds();
    const windowReference = E.snapshotId ? clone(E.reference) : null;
    const localReference = E.localReference ? clone(E.localReference) : null;
    return {
      schemaVersion: 'desktop-measurement-oracle/v2',
      prototypeOnly: true,
      phase: E.phase,
      confirmation: canRecord() ? 'confirmed' : 'preview',
      snapshot: E.snapshotId ? token() : null,
      coordinateSpace: {screen: 'screen-logical', window: 'window-relative-logical', region: 'local-region-relative-logical', image: 'capture-pixel', percentage: 'percentage-0-100'},
      displayMapping: clone(tiles),
      target: target ? {
        bounds: clone(target),
        source: E.target ? E.target.provider : E.mode,
        reliability: E.target ? E.target.reliability : 'user-confirmed',
        windowRelative: M.relative(target, win.rect),
        localRelative: localReference ? M.relative(target, localReference.bounds) : null,
      } : null,
      windowReference,
      localReference,
      margins: target ? {
        targetToWindow: signedMargins(target, win.rect),
        targetToLocal: localReference ? signedMargins(target, localReference.bounds) : null,
        activeOverlayRelation: E.marginView,
      } : null,
      pointer: E.pointer ? {coordinates: coordinateTriple(E.pointer), rawPixelColor: rawColor(E.pointer)} : null,
      point: E.pointResult ? clone(E.pointResult) : null,
      twoPoint: E.pointPair.length === 2 ? M.points(E.pointPair[0], E.pointPair[1]) : null,
      spacing: E.regionPair.length === 2 ? M.rectangles(E.regionPair[0], E.regionPair[1]) : null,
      candidate: E.target || E.candidate ? {
        id: (E.target || E.candidate).id, label: (E.target || E.candidate).label,
        source: (E.target || E.candidate).provider, provider: (E.target || E.candidate).provider,
        reliability: (E.target || E.candidate).reliability,
        semantic: (E.target || E.candidate).provider === 'synthetic-ui-tree',
        state: E.target ? 'confirmed' : 'preview', snapshotId: E.snapshotId,
        geometry: clone((E.target || E.candidate).rect), evidence: clone((E.target || E.candidate).evidence || null),
      } : null,
      stableRelocationEvidence: E.target && E.target.provider === 'synthetic-ui-tree' ? {semanticCandidateId: E.target.id, role: E.target.role, label: E.target.label, windowLabel: win && win.label} : {windowLabel: win && win.label},
      runtimeEvidence: {absoluteGeometryIsRuntimeEvidenceOnly: true, sourcePixelsAreFrozenSnapshotOnly: true, visualCandidateIsNotSemantic: E.target && E.target.provider === 'pixel-region-growing'},
    };
  }

  function renderInspector() {
    $('inspector').hidden = !E.inspectorOpen || !isMeasuring();
    if (!E.inspectorOpen || !isMeasuring()) return;
    $('json-info').textContent = JSON.stringify(structuredData(), null, 2);
    $('session-json').textContent = E.lastCopy?.kind === 'session' ? E.lastCopy.text : '';
    const key = `${E.sessionId}:${journal ? journal.revision : 0}`;
    if (key !== inspectorRevision) {
      inspectorRevision = key;
      $('session-records').replaceChildren();
      for (const record of E.records) {
        const li = document.createElement('li');
        li.textContent = `${record.id} · ${record.label} · ${record.type} · ${record.status} · ${record.snapshotId}`;
        $('session-records').append(li);
      }
    }
  }

  function renderButtons() {
    const measuring = isMeasuring();
    $('tools').querySelectorAll('button').forEach(button => { button.disabled = !measuring; });
    document.querySelectorAll('[data-mode]').forEach(button => button.classList.toggle('active', button.dataset.mode === E.mode));
    $('magnet-toggle').classList.toggle('active', E.magnet);
    const local = E.localReference || (!E.target && chooseLocalReference(E.candidate));
    $('margin-toggle').textContent = E.marginView === 'local' && local ? `边距：${local.label}` : '边距：窗口';
    $('margin-toggle').disabled = !measuring || !local;
    $('record-actions').hidden = !measuring;
    $('record-current').disabled = !canRecord();
    $('record-from-details').disabled = !canRecord();
    $('view-records').textContent = `测量记录 (${journal ? journal.count : 0})`;
    $('copy-all').disabled = !journal || journal.count === 0;
    $('save-session').disabled = !journal || journal.count === 0;
    $('continue').hidden = !E.adjusting;
  }

  function render() {
    const measuring = isMeasuring(), selecting = isSelecting();
    for (const id of ['scene','tools']) $(id).hidden = !measuring;
    for (const id of ['overlay','status']) $(id).toggleAttribute('hidden', !measuring && !selecting);
    if (!measuring && !selecting) $('toast').hidden = true;
    stage.classList.toggle('measuring', measuring);
    stage.classList.toggle('selecting', selecting);
    stage.classList.toggle('adjusting', E.active && E.adjusting);
    $('live-controls').hidden = !E.adjusting && !selecting;
    $('idle').hidden = E.active;
    renderOverlay(); renderMicro(); renderHUD(); renderInspector(); renderButtons();
    if (measuring || selecting) $('status').textContent = E.status;
  }

  function begin(source) {
    if (E.active) {
      if (E.adjusting) return continueMeasurement(source || 're-entry');
      notify('同一个 Measurement Session 已经打开；不会创建第二个实例。');
      return clone(token());
    }
    E.active = true; E.adjusting = false; E.session += 1; E.generation = 0;
    E.sessionId = `prototype-${globalThis.crypto?.randomUUID?.() || Date.now()+'-'+E.session}`;
    E.source = source || 'manual'; E.inspectorOpen = false; E.magnet = true; E.marginView = 'window';
    E.alt = false; E.pointer = null; E.snapshotId = null; E.reference = null; E.records = [];
    E.currentSnapshot = null; E.exportStatus = null; E.lastResolveAt = -Infinity;
    E.metrics = {pointerMoveCount: 0, semanticResolveCount: 0, candidateReuse: 0};
    visual = V.create(); journal = R.create(E.sessionId); inspectorRevision = '';
    E.live = {scroll: 0, tab: 0, menu: false};
    startReferenceSelection();
    return clone(token());
  }

  function startReferenceSelection() {
    invalidateAsync(); visual.reset();
    E.phase = 'REFERENCE_SELECTING'; E.adjusting = false; E.snapshotId = null;
    E.reference = null; E.currentSnapshot = null; E.referenceDown = null;
    E.pointer = null; E.alt = false; E.inspectorOpen = false;
    E.target = null; E.localReference = null; E.pointResult = null; E.pointPair = []; E.regionPair = [];
    E.candidate = null; E.stack = []; E.dragStart = null; E.dragCurrent = null;
    tiles = []; rawCanvases.clear(); analysisPixels = null; analysisCanvas = null; $('scene').replaceChildren();
    W = Math.max(640,stage.clientWidth); H = Math.max(380,stage.clientHeight);
    displayLayout(); defineScene(); drawLiveDesktop();
    E.referenceCandidate = clone(win); // suggestion is not a locked Reference
    overlay.setAttribute('viewBox',`0 0 ${W} ${H}`);
    setStatus('真实桌面仍为 Live：移动鼠标选择窗口，单击确认后冻结；Esc 退出。'); render();
  }

  function confirmReference(id) {
    if (!isSelecting()) return false;
    const candidate = nodes.find(item => item.id === id && item.role === 'window');
    if (!candidate) return false;
    E.reference = {id: candidate.id}; E.referenceCandidate = null;
    E.phase = 'FREEZING'; E.generation++;
    try { captureSnapshot('确认 Reference'); }
    catch (error) { startReferenceSelection(); notify(`冻结失败：${error.message}`); return false; }
    E.phase = 'MEASURING'; E.pointer = null; render(); return true;
  }

  function reselectReference() {
    if (!E.active) return false;
    E.generation++; startReferenceSelection(); return true;
  }

  function refreshSnapshot() {
    if (!isMeasuring()) return null;
    invalidateAsync(); E.phase = 'FREEZING'; E.generation += 1;
    captureSnapshot('更新画面'); E.phase = 'MEASURING'; render();
    return clone(token());
  }

  function adjustInterface() {
    if (!isMeasuring()) return;
    invalidateAsync(); visual.reset();
    E.generation += 1; // immediately invalidates all results from the visible snapshot
    E.snapshotId = null; // old frozen pixels remain hidden, but no longer identify the current UI state
    E.phase = 'ADJUSTING'; E.adjusting = true; E.inspectorOpen = false; E.pointer = null;
    E.alt = false; E.dragStart = null; E.dragCurrent = null;
    E.target = null; E.localReference = null; E.pointResult = null; E.pointPair = []; E.regionPair = []; E.candidate = null; E.stack = [];
    drawLiveDesktop();
    render();
  }

  function continueMeasurement(source) {
    if (!E.active) return begin(source || 'continue');
    if (!E.adjusting) return refreshSnapshot();
    invalidateAsync(); E.phase = 'FREEZING'; E.generation += 1; E.adjusting = false;
    captureSnapshot('继续测量'); E.phase = 'MEASURING'; render();
    return clone(token());
  }

  function exitMeasurement() {
    if (!E.active) return;
    invalidateAsync();
    E.phase = 'IDLE'; E.active = false; E.adjusting = false; E.snapshotId = null; E.pointer = null;
    E.alt = false; E.status = ''; E.lastCopy = null; E.layer = 0;
    clearTimeout(toastTimer); toastTimer = null; $('toast').hidden = true;
    $('status').textContent = ''; $('json-info').textContent = '';
    analysisCanvas = null; analysisPixels = null; visual.reset();
    E.records = []; E.currentSnapshot = null; E.reference = null; E.referenceCandidate = null; E.referenceDown = null; journal = null;
    E.target = null; E.localReference = null; E.pointResult = null; E.pointPair = []; E.regionPair = []; E.stack = []; E.candidate = null;
    E.dragStart = null; E.dragCurrent = null; E.inspectorOpen = false; E.pixelCache = []; tiles = []; rawCanvases.clear();
    $('scene').replaceChildren(); overlay.replaceChildren(); $('micro').hidden = true; $('hud').hidden = true; $('inspector').hidden = true; $('live-controls').hidden = true;
    render();
  }

  function applyAsyncCandidate(candidateToken, candidate) {
    if (!canResolve() || !sameToken(candidateToken,token())
      || candidateToken.epoch !== E.candidateEpoch || candidateToken.pointerRevision !== E.pointerRevision
      || candidateToken.provider !== $('provider').value || !candidate || !inside(E.pointer,candidate.rect)
      || candidate.snapshotId !== E.snapshotId) return false;
    E.candidate = previewNode(candidate); E.stack = [previewNode(candidate)]; E.layer = 0; render(); return true;
  }

  function cycleCandidate(direction) {
    if (!canResolve() || !E.stack.length) return;
    E.layer = (E.layer + direction + E.stack.length) % E.stack.length;
    E.candidate = clone(E.stack[E.layer]);
    setStatus(`候选层级：${E.candidate.label} · ${E.candidate.provider}`); render();
  }

  function recordMeasurement(label) {
    if (!canRecord() || !journal) return false;
    const d = structuredData(), type = E.mode;
    const geometry = type === 'region' ? clone(d.target.bounds) : type === 'point' ? clone(d.point.absolute)
      : type === 'pp' ? {a: clone(E.pointPair[0]), b: clone(E.pointPair[1])} : {a: clone(E.regionPair[0]), b: clone(E.regionPair[1])};
    const samplePoint = type === 'point' ? geometry : type === 'region'
      ? {x: geometry.x+geometry.width/2, y: geometry.y+geometry.height/2} : null;
    try {
      let snapshot = journal.data().snapshots.find(item => item.snapshotId === E.snapshotId);
      if (!snapshot) snapshot = {...clone(E.currentSnapshot), sourceImages: [...rawCanvases].map(([displayId,canvas]) =>
        ({displayId, encoding: 'data-url/png', data: canvas.toDataURL('image/png')}))};
      journal.add({status: 'confirmed', type, label: label || E.target?.label || ({point:'点',pp:'两点距离',rr:'两区域距离'}[type]),
        token: token(), geometry, coordinates: type === 'point' ? M.pointRelative(geometry,E.reference.bounds) : d.target,
        margins: d.margins, candidate: type === 'region' ? d.candidate : null,
        sourcePixel: samplePoint ? {point: samplePoint, ...rawColor(samplePoint)} : null,
        stableRelocationEvidence: d.stableRelocationEvidence, runtimeEvidence: d.runtimeEvidence,
      }, snapshot, token());
      E.records = journal.data().measurements;
      $('record-label').value = '';
      setMode(E.mode); // successful Record consumes the current result; repeated Enter cannot duplicate it
      notify(`已加入测量记录 (${journal.count})；仅在内存，退出前请复制全部或保存。`);
      render(); return true;
    } catch (error) { notify(error.message); return false; }
  }

  async function copyAll() {
    if (!journal || !journal.count) return false;
    const current = journal, value = JSON.stringify(current.data(),null,2);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(value);
      if (journal !== current) return false;
      E.lastCopy = {status: 'success', kind: 'session', text: value};
      notify('已复制全部 Session Evidence；复制不等于保存文件。'); return true;
    } catch (error) {
      if (journal !== current) return false;
      E.lastCopy = {status: 'unavailable', kind: 'session', text: value};
      $('session-json').textContent = value; notify('剪切板不可用；完整 Session JSON 已显示在详情中。'); return false;
    }
  }

  async function saveSession() {
    if (!journal || !journal.count) return false;
    const current = journal, data = current.data(), ids = data.measurements.map(m => m.id);
    const filename = `${E.sessionId}.measurement.json`;
    let writer = null;
    try {
      if (typeof window.showSaveFilePicker === 'function') {
        const handle = await window.showSaveFilePicker({suggestedName: filename, types: [{description:'Measurement Session',accept:{'application/json':['.json']}}]});
        writer = await handle.createWritable();
        data.measurements.forEach(m => { m.status = 'saved'; m.persistence = {status:'saved',destination:handle.name}; });
        await writer.write(JSON.stringify(data,null,2)); await writer.close(); writer = null;
        if (journal !== current) return true;
        current.markSaved(ids,handle.name); E.records = current.data().measurements;
        E.exportStatus = {status:'saved',destination:handle.name}; notify('Session Evidence 已保存。'); render(); return true;
      }
      // Direct-open browsers cannot choose a repository path. A download request is not a durable-save acknowledgement.
      const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
      E.exportStatus = {status:'download-requested',filename};
      notify('已请求浏览器保存 JSON；请确认文件已落盘，尚未标记 saved。'); return true;
    } catch (error) {
      if (writer?.abort) { try { await writer.abort(); } catch (_) { /* preserve original error */ } }
      if (journal !== current) return false;
      E.exportStatus = {status: error.name === 'AbortError' ? 'cancelled' : 'failed',message:error.message};
      notify(`未保存：${error.message}`); return false;
    }
  }

  overlay.addEventListener('pointermove', event => pointerMove(screenPointFromEvent(event)));
  overlay.addEventListener('pointerdown', event => { overlay.setPointerCapture?.(event.pointerId); pointerDown(screenPointFromEvent(event)); });
  overlay.addEventListener('pointerup', event => pointerUp(screenPointFromEvent(event)));

  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
  $('magnet-toggle').addEventListener('click', () => { if (!E.active || E.adjusting) return; E.magnet = !E.magnet; invalidateAsync(); E.candidate = null; E.stack = []; setStatus(`磁吸定位已${E.magnet ? '开启' : '关闭'}。`); scheduleResolve(); render(); });
  $('margin-toggle').addEventListener('click', () => { if (!isMeasuring() || !(E.localReference || chooseLocalReference(E.candidate))) return; E.marginView = E.marginView === 'window' ? 'local' : 'window'; render(); });
  $('refresh').addEventListener('click', refreshSnapshot);
  $('adjust').addEventListener('click', adjustInterface);
  $('continue').addEventListener('click', () => continueMeasurement('adjust-continue'));
  $('details').addEventListener('click', () => { if (!E.active || E.adjusting) return; E.inspectorOpen = true; render(); });
  $('details-close').addEventListener('click', () => { E.inspectorOpen = false; render(); });
  $('exit').addEventListener('click', exitMeasurement);
  $('restart').addEventListener('click', () => begin('restart'));
  $('entry-dev').addEventListener('click', () => begin('developer-menu'));
  $('entry-rec').addEventListener('click', () => begin('recorder-toolbar'));
  $('entry-key').addEventListener('click', () => begin('global-shortcut'));
  $('provider').addEventListener('change', () => { invalidateAsync(); E.candidate = null; E.stack = []; E.layer = 0; scheduleResolve(); render(); });
  $('display-mode').addEventListener('change', () => { if (isMeasuring()) refreshSnapshot(); else if (isSelecting()) startReferenceSelection(); else { W = stage.clientWidth; H = stage.clientHeight; displayLayout(); defineScene(); drawLiveDesktop(); } });
  $('tolerance').addEventListener('change', () => { invalidateAsync(); E.candidate = null; E.stack = []; scheduleResolve(); render(); });
  $('live-scroll').addEventListener('click', () => { E.live.scroll = (E.live.scroll + 1) % 4; defineScene(); drawLiveDesktop(); if (isSelecting()) { E.referenceCandidate = clone(windowAt(E.pointer) || win); render(); } });
  $('live-tab').addEventListener('click', () => { E.live.tab = E.live.tab ? 0 : 1; defineScene(); drawLiveDesktop(); if (isSelecting()) { E.referenceCandidate = clone(windowAt(E.pointer) || win); render(); } });
  $('live-menu').addEventListener('click', () => { E.live.menu = !E.live.menu; defineScene(); drawLiveDesktop(); if (isSelecting()) { E.referenceCandidate = clone(windowAt(E.pointer) || win); render(); } });
  $('copy-json').addEventListener('click', async () => {
    if (!E.active || E.adjusting || !E.inspectorOpen) return;
    const copyToken = clone(token());
    const stillCurrent = () => E.active && !E.adjusting && sameToken(copyToken, token());
    const value = JSON.stringify(structuredData(), null, 2);
    try {
      if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(value);
      if (!stillCurrent()) return;
      E.lastCopy = {status: 'success', text: value}; notify('已复制结构化 Measurement Evidence。');
    } catch (error) {
      if (!stillCurrent()) return;
      E.lastCopy = {status: 'unavailable', text: value}; notify('浏览器剪切板不可用；结构化数据仍保留在详情中。');
    }
  });

  $('record-current').addEventListener('click', () => recordMeasurement($('record-label').value));
  $('record-from-details').addEventListener('click', () => recordMeasurement($('record-label').value));
  $('view-records').addEventListener('click', () => { E.inspectorOpen = true; render(); });
  $('copy-all').addEventListener('click', copyAll);
  $('save-session').addEventListener('click', saveSession);
  $('reselect-reference').addEventListener('click', reselectReference);
  overlay.addEventListener('pointercancel', () => { E.dragStart = null; E.dragCurrent = null; E.referenceDown = null; render(); });
  window.addEventListener('blur', () => { E.alt = false; invalidateAsync(); E.candidate = null; E.stack = []; render(); });
  window.addEventListener('keydown', event => {
    if (!E.active) return;
    if (event.key === 'Escape' && isSelecting()) { exitMeasurement(); return; }
    if (!isMeasuring() || event.isComposing) return;
    if (event.key === 'Escape') {
      if (E.inspectorOpen) { E.inspectorOpen = false; render(); } else exitMeasurement();
      return;
    }
    if (event.target.closest?.('input,textarea,select,[contenteditable=true]')) return;
    if (event.key === 'Enter' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (canRecord()) { event.preventDefault(); recordMeasurement($('record-label').value); } return;
    }
    if (event.key === 'Alt') { E.alt = true; E.candidate = null; E.stack = []; invalidateAsync(); render(); return; }
    if (event.key === 'Tab') { event.preventDefault(); cycleCandidate(event.shiftKey ? -1 : 1); return; }
    if (event.key.toLowerCase() === 'i') { E.inspectorOpen = !E.inspectorOpen; render(); return; }
    const modes = {'1': 'point', '2': 'region', '3': 'pp', '4': 'rr'};
    if (modes[event.key]) setMode(modes[event.key]);
  });
  window.addEventListener('keyup', event => {
    if (event.key === 'Alt') { E.alt = false; if (E.active && !E.adjusting) { scheduleResolve(); render(); } }
  });
  window.addEventListener('resize', () => { if (isMeasuring()) refreshSnapshot(); else if (isSelecting()) startReferenceSelection(); });

  const api = {
    begin,
    refreshSnapshot,
    adjustInterface,
    continueMeasurement,
    exitMeasurement,
    data: structuredData,
    token: () => clone(token()),
    applyAsyncCandidate,
    setMode,
    lockCandidate, confirmReference, reselectReference, recordMeasurement, copyAll, saveSession,
    sessionEvidence: () => journal ? journal.data() : null,
    candidateToken: () => ({...token(),epoch:E.candidateEpoch,pointerRevision:E.pointerRevision,provider:$('provider').value}),
    get metrics() { return metrics(); },
    get state() { return E; },
    get origin() { return clone(origin); },
    get nodes() { return clone(nodes); },
  };
  root.MeasureDemo = Object.freeze(api);

  requestAnimationFrame(() => begin('prototype-auto'));
})(globalThis);
