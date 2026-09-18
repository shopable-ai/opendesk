// Refined ordinary Recipe; examples/app/qianniu.js remains Legacy / Evidence Case.
// Framework: docs/frameworks/demonstration-to-automation-pipeline.md, section 10.
// From repository root:
// ./dist/opendesk -script examples/app/qianniu-recipe.js -console-mode script
// Configuration: .runtime/recipes/qianniu/config.json (see adjacent example JSON).
// No CommonJS, new Runtime, hidden global config, automatic send, or shipment.
// The supplied layout is a candidate until qualified on the real Windows Qianniu.

// ---- Task / Qianniu application knowledge ---------------------------------
const QIANNIU = Object.freeze({
  exeName: 'AliWorkbench.exe',
  notificationSuffix: '消息通知',
  receptionSuffix: '-接待中心',
  contact: '和我联系',
  copyTitle: '点我复制',
  states: Object.freeze(['待发货', '待付款', '退款完成', '订单关闭']),
});
const LIMITS = Object.freeze({
  configBytes: 65536, textLength: 500, messageLength: 16000,
  windowWaitMs: 5000, valueMs: 3000, httpMs: 10000,
  clipboardWaitMs: 2500, pollingMs: 100, maxPolls: 25,
});
const CONFIG_PATH = '.runtime/recipes/qianniu/config.json';

// ---- Pure Result / Evidence / configuration helpers ----------------------
function stop(status, code, reason) {
  const error = new Error(reason);
  error.recipeStatus = status;
  error.recipeCode = code;
  throw error;
}
function requireThat(condition, code, reason) {
  if (!condition) stop('blocked', code, reason);
}
function textKey(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}
function requireText(value, max, label) {
  requireThat(typeof value === 'string' && value.trim().length > 0 &&
    value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
    'INVALID_TEXT', label + '必须是有界的实际文本，不能用空值或对象补值');
  return value;
}
function fields(value, allowed, label) {
  requireThat(value && typeof value === 'object' && !Array.isArray(value),
    'INVALID_CONFIG', label + '必须是对象');
  requireThat(Object.keys(value).every(key => allowed.indexOf(key) >= 0),
    'INVALID_CONFIG', label + '包含未支持字段；发送和发货不是本 Recipe 的能力');
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.keys(value).forEach(key => freeze(value[key]));
    Object.freeze(value);
  }
  return value;
}
function percentRegion(value) {
  fields(value, ['left', 'top', 'width', 'height'], '百分比区域');
  requireThat(['left', 'top', 'width', 'height'].every(k =>
    typeof value[k] === 'number' && Number.isFinite(value[k]) && value[k] >= 0) &&
    value.width > 0 && value.height > 0 && value.left + value.width <= 100 &&
    value.top + value.height <= 100, 'INVALID_CONFIG', '区域必须采用父区域的 0..100 百分比');
}
function layoutProfile(value, regions) {
  fields(value, ['minWidth', 'maxWidth', 'minHeight', 'maxHeight'].concat(regions), '窗口布局');
  ['minWidth', 'maxWidth', 'minHeight', 'maxHeight'].forEach(key => {
    requireThat(Number.isFinite(value[key]) && value[key] > 0,
      'INVALID_CONFIG', '布局需要实测的正数尺寸范围');
  });
  requireThat(value.minWidth <= value.maxWidth && value.minHeight <= value.maxHeight,
    'INVALID_CONFIG', '布局尺寸范围无效');
  regions.forEach(key => percentRegion(value[key]));
}
function validateConfig(raw) {
  // Snapshot once: callers cannot change task authority during an awaited step.
  let config;
  try { config = JSON.parse(JSON.stringify(raw)); }
  catch (_) { stop('blocked', 'INVALID_CONFIG', '配置必须是普通 JSON'); }
  fields(config, ['version', 'mode', 'windows', 'task', 'api', 'layout', 'draftLocator'], '配置');
  requireThat(config.version === 1 && ['inspect', 'draft'].indexOf(config.mode) >= 0,
    'INVALID_CONFIG', 'version 必须为 1，mode 只能为 inspect 或 draft');
  fields(config.windows, ['notificationTitle', 'receptionTitle'], '窗口配置');
  requireText(config.windows.notificationTitle, 500, '通知窗口精确标题');
  requireText(config.windows.receptionTitle, 500, '接待窗口精确标题');
  requireThat(config.windows.notificationTitle.endsWith(QIANNIU.notificationSuffix) &&
    config.windows.receptionTitle.endsWith(QIANNIU.receptionSuffix),
    'INVALID_CONFIG', '需要当前千牛账号的完整窗口标题，不接受通配标题');
  fields(config.task, ['allowDraft', 'allowProductQuery'], '任务授权');
  requireThat(typeof config.task.allowDraft === 'boolean' && typeof config.task.allowProductQuery === 'boolean',
    'INVALID_CONFIG', '草稿和商品查询授权必须是显式布尔值');
  fields(config.api, ['endpoint', 'contentPostfix'], 'API 配置');
  requireThat(typeof config.api.endpoint === 'string' && typeof config.api.contentPostfix === 'string' &&
    config.api.contentPostfix.length <= 2000, 'INVALID_CONFIG', 'API 配置无效');
  fields(config.layout, ['qualified', 'evidence', 'exclusiveInteraction', 'notification', 'reception', 'orderCard'], '应用知识');
  requireThat(typeof config.layout.qualified === 'boolean' && typeof config.layout.exclusiveInteraction === 'boolean' &&
    typeof config.layout.evidence === 'string', 'INVALID_CONFIG', '必须明确布局资格与独占交互约束');
  layoutProfile(config.layout.notification, ['recipient', 'status', 'contact']);
  layoutProfile(config.layout.reception, ['recipient', 'orders']);
  const card = config.layout.orderCard;
  fields(card, ['aboveStatusPercent', 'heightPercent', 'title'], '订单卡片');
  requireThat(Number.isFinite(card.aboveStatusPercent) && card.aboveStatusPercent >= 0 &&
    Number.isFinite(card.heightPercent) && card.heightPercent > card.aboveStatusPercent &&
    card.heightPercent <= 100, 'INVALID_CONFIG', '卡片范围须来自实测，以订单面板高度为百分比父级');
  percentRegion(card.title);
  fields(config.draftLocator, ['role', 'name', 'identifier'], '草稿原生 selector');
  requireThat(config.draftLocator.role === 'textField' &&
    ['name', 'identifier'].some(key => typeof config.draftLocator[key] === 'string' && config.draftLocator[key].trim()),
    'INVALID_CONFIG', '需要实测的唯一聊天 textField name 或 identifier；不能猜测控件 ID');
  ['name', 'identifier'].forEach(key => {
    if (Object.prototype.hasOwnProperty.call(config.draftLocator, key)) requireText(config.draftLocator[key], 1024, '原生 selector');
  });
  if (config.mode === 'draft') {
    requireThat(config.task.allowDraft && config.task.allowProductQuery,
      'NOT_AUTHORIZED', '本次任务必须分别允许准备草稿和向指定服务查询商品');
    requireThat(config.layout.qualified && config.layout.exclusiveInteraction && config.layout.evidence.trim(),
      'QUALIFICATION_REQUIRED', '需要真机布局、收件人/订单归属、草稿 selector 资格及无并发操作的确认');
    requireThat(/^(https:\/\/[^\s\/?#@]+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)(\/[^\s#]*)?$/.test(config.api.endpoint),
      'INVALID_CONFIG', '商品服务须为明确 HTTPS 地址或本机 HTTP 地址；禁止用户凭据和 fragment');
  }
  return freeze(config);
}
function newRun() {
  return { stage: 'configuration', evidence: [], pending: null,
    effects: { activationAttempts: 0, contactAttempts: 0, copyAttempts: 0,
      queryAttempts: 0, draftAttempts: 0, sendAttempts: 0, shipmentAttempts: 0 } };
}
function record(ctx, kind, details) {
  ctx.evidence.push(Object.assign({ stage: ctx.stage, kind: kind, observedAt: new Date().toISOString() }, details));
}
function result(ctx, status, code, reason) {
  return {
    status: status, code: code, stage: ctx.stage, reason: reason,
    next: status === 'uncertain' ? 'verify_actual_effect_then_stop' :
      code === 'DRAFT_VERIFIED' ? 'review_draft_manually' :
      code === 'INSPECTION_ONLY' ? 'review_layout_qualification' : 'stop',
    effects: ctx.effects, pendingAction: ctx.pending, evidence: ctx.evidence,
    identity: { basis: 'visible recipient + one visible order + actual title + state',
      conversationId: null, orderId: null },
    limitations: [
      '可见名称与单个订单的归属依据不是稳定业务 ID，不授权发送或发货',
      '资格记录由本地维护者提供；配置布尔值不等于本轮完成真机验证',
      '动作前后检查不能提供跨窗口内容与原生输入的原子事务；禁止并发人工或其他自动化操作',
    ],
  };
}
function failedResult(ctx, error) {
  const nativeState = error && error.actionState;
  const uncertain = !!ctx.pending || nativeState === 'unknown';
  record(ctx, 'failure', {
    actionState: nativeState || (ctx.pending ? 'unknown' : 'not_started'),
    nativeCode: error && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.code || '') ? error.code : null,
  });
  return result(ctx, uncertain ? 'uncertain' : (error && error.recipeStatus || 'failed'),
    error && error.recipeCode || (uncertain ? 'EFFECT_UNCERTAIN' : 'RUNTIME_FAILURE'),
    error && error.recipeCode ? error.message : '当前步骤未获得可靠结果；原始异常正文未写入日志');
}

// not_started belongs only to the attempted action, never to a later read.
// A read failing after a submitted action must not erase that pending effect.
async function submitOnce(ctx, action, counter, invoke) {
  ctx.pending = action;
  ctx.effects[counter]++;
  try { return await invoke(); }
  catch (error) {
    if (error && error.actionState === 'not_started') ctx.pending = null;
    throw error;
  }
}

// ---- Window / application observation ------------------------------------
function requireRuntime() {
  requireThat(typeof window !== 'undefined' && typeof UI !== 'undefined' &&
    typeof Geometry !== 'undefined' && typeof clipboard !== 'undefined' &&
    typeof axios !== 'undefined' && typeof sleep === 'function',
    'RUNTIME_CAPABILITY_MISSING', '请使用当前 OpenDesk Runtime，而不是 Node 或浏览器执行业务脚本');
  requireThat(['get', 'current', 'activate', 'wait'].every(k => typeof window[k] === 'function') &&
    ['readText', 'findTextMatches', 'tapText', 'getValue', 'setValue'].every(k => typeof UI[k] === 'function') &&
    ['rect', 'regionPercent', 'regionOffset', 'intersect'].every(k => typeof Geometry[k] === 'function') &&
    typeof clipboard.paste === 'function' && typeof axios.get === 'function',
    'RUNTIME_CAPABILITY_MISSING', '当前构建缺少已公开的窗口或 UI 能力；不会换用猜测的 API');
}
function sameWindow(left, right) {
  return left && right && left.id === right.id && left.pid === right.pid && left.handle === right.handle;
}
function checkedWindow(win, profile, title, foreground) {
  requireThat(win && typeof win.id === 'string' && win.id && !win.id.endsWith(':unresolved') &&
    Number.isInteger(win.pid) && win.pid > 0 && Number.isFinite(win.handle) && win.handle !== 0 &&
    win.exeName === QIANNIU.exeName && win.title === title,
    'WINDOW_IDENTITY_MISMATCH', '窗口身份、进程或完整标题不符合当前任务');
  Geometry.rect(win);
  requireThat(win.width >= profile.minWidth && win.width <= profile.maxWidth &&
    win.height >= profile.minHeight && win.height <= profile.maxHeight,
    'LAYOUT_OUTSIDE_QUALIFICATION', '当前尺寸超出实测范围；不强制 resize，不沿用旧位置');
  if (foreground) requireThat(win.isForeground === true && win.hasFocus === true,
    'WINDOW_NOT_FOREGROUND', '当前目标不再是前台窗口；停止而不是抢回焦点继续写入');
  return win;
}
async function refresh(pin, profile, title) {
  const current = await window.current(pin);
  requireThat(sameWindow(pin, current), 'STALE_TARGET', '原窗口生命周期已改变');
  return checkedWindow(current, profile, title, true);
}
async function activateNotification(ctx, config) {
  let win;
  try { win = await window.get({ exeName: QIANNIU.exeName, title: config.windows.notificationTitle }); }
  catch (error) {
    if (error.code === 'NOT_FOUND') stop('blocked', 'NO_NOTIFICATION', '未找到唯一的目标通知窗口');
    throw error;
  }
  checkedWindow(win, config.layout.notification, config.windows.notificationTitle, false);
  if (!win.isForeground || !win.hasFocus) {
    const pin = win;
    win = await submitOnce(ctx, 'activation', 'activationAttempts',
      () => window.activate(pin, { timeout: LIMITS.valueMs }));
    requireThat(sameWindow(pin, win), 'STALE_TARGET', '激活后不是原通知窗口');
    checkedWindow(win, config.layout.notification, config.windows.notificationTitle, true);
    ctx.pending = null;
  }
  return win;
}

// ---- Region / Target / Geometry; all Qianniu layout arithmetic lives here -
function contained(parent, child) {
  const overlap = Geometry.intersect(Geometry.rect(parent), Geometry.rect(child));
  return overlap && ['x', 'y', 'width', 'height'].every(k => overlap[k] === child[k]);
}
function region(win, rule) {
  const box = Geometry.regionPercent(win, rule);
  requireThat(contained(win, box), 'INVALID_REGION', '百分比区域必须完整处于当前窗口内');
  return box;
}
function cardFromStatus(config, win, statusBounds) {
  const panel = region(win, config.layout.reception.orders);
  const knowledge = config.layout.orderCard;
  const card = Geometry.regionOffset(panel, {
    left: 0,
    top: statusBounds.y - panel.y - panel.height * knowledge.aboveStatusPercent / 100,
    width: panel.width, height: panel.height * knowledge.heightPercent / 100,
  });
  requireThat(contained(panel, statusBounds) && contained(panel, card),
    'ORDER_CARD_OUT_OF_BOUNDS', '状态参照物或推导卡片越界；禁止固定矩形兜底');
  return card;
}
function candidates(groups, index, scope) {
  requireThat(Array.isArray(groups) && groups[index] && groups[index].queryIndex === index &&
    Array.isArray(groups[index].matches), 'INVALID_OBSERVATION', '文本观察返回结构不完整');
  return groups[index].matches.filter(match => match.bounds && contained(scope, match.bounds));
}
function unique(items, code, reason) {
  requireThat(items.length === 1, code, reason);
  return items[0];
}
async function readActualText(ctx, win, scope, label) {
  const value = requireText(await UI.readText({ within: win, region: scope, timeout: LIMITS.valueMs }),
    LIMITS.textLength, label);
  record(ctx, 'text-observation', { field: label, source: 'UI.readText', region: scope,
    length: value.length, rawText: 'redacted' });
  return value;
}
function interpretStates(ctx, groups, scope) {
  const counts = QIANNIU.states.map((_, index) => candidates(groups, index, scope).length);
  record(ctx, 'state-observation', { source: 'UI.findTextMatches', region: scope, counts: counts });
  requireThat(counts.reduce((a, b) => a + b, 0) === 1,
    'STATE_NOT_UNIQUE', '需要唯一、无冲突的实际状态文字；颜色不能替代状态证明');
  const state = QIANNIU.states[counts.findIndex(count => count === 1)];
  record(ctx, 'state-interpretation', { state: state, authorizesShipment: false });
  requireThat(state === '待发货', 'ORDER_NOT_PENDING_SHIPMENT', '订单尚非待发货；不凭固定等待推定付款完成');
  return unique(candidates(groups, 0, scope), 'STATE_NOT_UNIQUE', '待发货状态必须唯一');
}

// ---- Data steps: actual UI -> clipboard -> product API --------------------
async function observeNotification(ctx, config, pin) {
  const win = await refresh(pin, config.layout.notification, config.windows.notificationTitle);
  const recipient = await readActualText(ctx, win, region(win, config.layout.notification.recipient), 'notification-recipient');
  requireThat(!/[\r\n]/.test(recipient.trim()), 'RECIPIENT_NOT_SINGLE_LINE', '收件人区域不能包含多行正文或多个对象');
  const groups = await UI.findTextMatches(QIANNIU.states.concat(QIANNIU.contact), { within: win, match: 'exact' });
  interpretStates(ctx, groups, region(win, config.layout.notification.status));
  unique(candidates(groups, 4, region(win, config.layout.notification.contact)),
    'CONTACT_NOT_UNIQUE', '联系入口不存在或不唯一；不取首个黄色块');
  const current = await refresh(win, config.layout.notification, config.windows.notificationTitle);
  requireThat(['x', 'y', 'width', 'height'].every(k => current[k] === win[k]),
    'OBSERVATION_CHANGED', '读取通知期间窗口几何改变，旧观察失效');
  return { win: current, recipient: recipient };
}
async function observeOrder(ctx, config, pin, expectedRecipient) {
  const win = await refresh(pin, config.layout.reception, config.windows.receptionTitle);
  const recipient = await readActualText(ctx, win, region(win, config.layout.reception.recipient), 'reception-recipient');
  requireThat(!/[\r\n]/.test(recipient.trim()) && (!expectedRecipient || textKey(recipient) === textKey(expectedRecipient)),
    'RECIPIENT_MISMATCH', '接待窗口当前收件人与通知中的实际收件人不一致');
  const panel = region(win, config.layout.reception.orders);
  const groups = await UI.findTextMatches(QIANNIU.states.concat(QIANNIU.copyTitle), { within: win, region: panel, match: 'exact' });
  // Deliberately limited to one visible order: no stable order ID, no first/last row choice.
  const state = interpretStates(ctx, groups, panel);
  const copy = unique(candidates(groups, 4, panel), 'ORDER_NOT_UNIQUE', '订单面板须有且只有一个复制入口；多订单时停止');
  const card = cardFromStatus(config, win, state.bounds);
  requireThat(contained(card, copy.bounds), 'COPY_OUTSIDE_ORDER', '复制入口不能归属到当前状态参照物的卡片');
  const titleRegion = region(card, config.layout.orderCard.title);
  const title = await readActualText(ctx, win, titleRegion, 'actual-product-title');
  const current = await refresh(win, config.layout.reception, config.windows.receptionTitle);
  requireThat(['x', 'y', 'width', 'height'].every(k => current[k] === win[k]),
    'OBSERVATION_CHANGED', '读订单期间窗口几何改变，旧卡片证据失效');
  record(ctx, 'eligibility', { recipientMatched: !!expectedRecipient, visibleOrderCount: 1,
    state: '待发货', card: card, permits: expectedRecipient ? ['query-product', 'prepare-draft'] : [],
    missing: ['conversationId', 'orderId', 'independent-order-effect-proof'] });
  return { win: current, recipient: recipient, title: title };
}
async function verifyBinding(ctx, config, order) {
  const current = await observeOrder(ctx, config, order.win, order.recipient);
  requireThat(textKey(current.title) === textKey(order.title), 'ORDER_CHANGED', '当前商品标题已改变，旧数据不得进入下一副作用');
  return current;
}
async function openReception(ctx, config, notification) {
  const current = await observeNotification(ctx, config, notification.win);
  requireThat(textKey(current.recipient) === textKey(notification.recipient),
    'NOTIFICATION_CHANGED', '通知对象发生变化，停止联系操作');
  const receipt = await submitOnce(ctx, 'contact', 'contactAttempts',
    () => UI.tapText(QIANNIU.contact, { within: current.win, match: 'exact',
      region: fresh => region(checkedWindow(fresh, config.layout.notification, config.windows.notificationTitle, true), config.layout.notification.contact) }));
  requireThat(receipt && receipt.ok === true && receipt.actionState !== 'unknown',
    'CONTACT_RECEIPT_UNCERTAIN', '联系动作没有可靠回执');
  const chat = await window.wait({ pid: current.win.pid, title: config.windows.receptionTitle },
    { timeout: LIMITS.windowWaitMs, polling: LIMITS.pollingMs });
  checkedWindow(chat, config.layout.reception, config.windows.receptionTitle, true);
  const recipient = await readActualText(ctx, chat, region(chat, config.layout.reception.recipient), 'opened-recipient');
  requireThat(textKey(recipient) === textKey(current.recipient), 'RECIPIENT_MISMATCH', '无法证明联系动作打开了正确收件人');
  ctx.pending = null;
  record(ctx, 'action-verification', { action: 'open-reception', sameProcess: true, visibleRecipientMatched: true });
  return chat;
}
function copyOptions(config, pin) {
  let observedWindow = pin;
  return { within: pin, match: 'exact',
    region: fresh => {
      observedWindow = checkedWindow(fresh, config.layout.reception, config.windows.receptionTitle, true);
      return region(observedWindow, config.layout.reception.orders);
    },
    relativeTo: { text: '待发货', region: anchor => cardFromStatus(config, observedWindow, anchor.bounds) },
  };
}
async function copyProductTitle(ctx, config, order) {
  const current = await verifyBinding(ctx, config, order);
  const before = clipboard.paste();
  requireThat(typeof before === 'string', 'CLIPBOARD_UNREADABLE', '剪贴板未返回实际字符串');
  requireThat(textKey(before) !== textKey(current.title), 'COPY_FRESHNESS_UNPROVEN',
    '剪贴板已是同一标题，文本兼容接口无法证明一次新复制；本轮不清空或改写剪贴板做探针');
  const receipt = await submitOnce(ctx, 'copy-title', 'copyAttempts',
    () => UI.tapText(QIANNIU.copyTitle, copyOptions(config, current.win)));
  requireThat(receipt && receipt.ok === true && receipt.actionState !== 'unknown', 'COPY_RECEIPT_UNCERTAIN', '复制动作回执不确定');
  const deadline = Date.now() + LIMITS.clipboardWaitMs;
  let copied = null;
  for (let attempt = 0; attempt < LIMITS.maxPolls && Date.now() <= deadline; attempt++) {
    const value = clipboard.paste();
    if (value !== before) {
      requireText(value, LIMITS.textLength, '新剪贴板标题');
      requireThat(textKey(value) === textKey(current.title), 'COPIED_TITLE_MISMATCH', '剪贴板变化不是当前订单标题');
      copied = value;
      break;
    }
    await sleep(LIMITS.pollingMs); // Bounded read-only polling; never repeat the copy action.
  }
  requireThat(copied !== null && Date.now() <= deadline, 'COPY_NOT_VERIFIED', '未在预算内证明复制效果；先人工核对，不自动重复制');
  await verifyBinding(ctx, config, current);
  ctx.pending = null;
  record(ctx, 'action-verification', { action: 'copy-title', changed: true, matchesActualTitle: true,
    proof: 'clipboard-change + UI-title + rechecked-visible-context', stableOrderIdProven: false });
  return copied; // The API receives actual clipboard data, never a configured expected value.
}
async function queryProduct(ctx, config, copiedTitle) {
  ctx.effects.queryAttempts++;
  let response;
  try { response = await axios.get(config.api.endpoint, { params: { title: copiedTitle }, timeout: LIMITS.httpMs }); }
  catch (_) { stop('failed', 'PRODUCT_QUERY_FAILED', '商品查询失败；不生成错误文案，不缓存全局 serviceReady'); }
  requireThat(response && response.status === 200 && response.data && response.data.code === 1000,
    'PRODUCT_QUERY_REJECTED', '商品接口未返回成功业务码；错误正文不得进入聊天框');
  const data = response.data.data;
  requireThat(data && typeof data === 'object', 'INVALID_PRODUCT_RESPONSE', '商品结果缺失');
  requireText(data.title, LIMITS.textLength, 'API 商品标题');
  requireText(data.content, LIMITS.messageLength, 'API 商品正文');
  requireThat(textKey(data.title) === textKey(copiedTitle), 'PRODUCT_IDENTITY_MISMATCH', '返回商品标题与实际复制标题不一致；不默认接受模糊搜索结果');
  record(ctx, 'data-verification', { source: 'product-api', httpStatus: response.status,
    businessCode: response.data.code, titleMatchesClipboard: true, rawPayload: 'redacted' });
  return { title: data.title, content: data.content };
}
function composeMessage(copiedTitle, product, postfix) {
  return requireText('商品标题: ' + copiedTitle + '\n\n发货内容: ' + product.title + '\n' + product.content +
    (postfix ? '\n\n' + postfix : ''), LIMITS.messageLength, '完整草稿');
}

// ---- Verifiable draft Action; intentionally no send / ship helpers --------
async function prepareDraft(ctx, config, order, message) {
  let current = await verifyBinding(ctx, config, order);
  const options = { within: current.win, timeout: LIMITS.valueMs };
  const before = await UI.getValue(config.draftLocator, options);
  requireThat(typeof before === 'string', 'DRAFT_UNREADABLE', '必须从原生聊天输入框读取真实字符串');
  requireThat(before === '' || before === message, 'EXISTING_DRAFT', '已有不同草稿，不能覆盖用户内容');
  current = await verifyBinding(ctx, config, current);
  options.within = current.win;
  requireThat(await UI.getValue(config.draftLocator, options) === before,
    'DRAFT_CHANGED', '预检后输入框被其他操作改变');
  if (before !== message) {
    const receipt = await submitOnce(ctx, 'draft', 'draftAttempts',
      () => UI.setValue(config.draftLocator, message, options));
    requireThat(receipt && receipt.verified === true && receipt.actionState === 'acknowledged',
      'DRAFT_RECEIPT_UNCERTAIN', '原生设值未得到可靠提交与同引用回读证明');
    record(ctx, 'action-receipt', { action: 'setValue', actionState: receipt.actionState,
      sameRefVerified: receipt.verified, requestId: receipt.requestId || null });
  }
  current = await verifyBinding(ctx, config, current);
  const actual = await UI.getValue(config.draftLocator, { within: current.win, timeout: LIMITS.valueMs });
  requireThat(actual === message, 'DRAFT_NOT_VERIFIED', '最终原生草稿值与目标完整文本不一致');
  ctx.pending = null;
  record(ctx, 'action-verification', { action: 'prepare-draft', actualValueMatched: true,
    alreadyPrepared: before === message, length: actual.length, sent: false, shipped: false });
}

// ---- Business Workflow: single task, explicit data handoffs ----------------
async function inspectCurrentChat(ctx, config) {
  ctx.stage = 'inspect-current-chat';
  const chat = await window.get({ exeName: QIANNIU.exeName, title: config.windows.receptionTitle });
  const order = await observeOrder(ctx, config, chat, null);
  const draft = await UI.getValue(config.draftLocator, { within: order.win, timeout: LIMITS.valueMs });
  requireThat(typeof draft === 'string', 'DRAFT_UNREADABLE', '原生草稿不能读取');
  record(ctx, 'inspection', { onlyRead: true, draftEmpty: draft === '',
    notificationBindingVerified: false, qualificationGranted: false });
  return result(ctx, 'success', 'INSPECTION_ONLY', '只读预检结束；未点击、复制、查询、写草稿、发送或发货，仍须人工审阅资格');
}
async function runOnce(rawConfig) {
  const ctx = newRun();
  try {
    const config = validateConfig(rawConfig);
    requireRuntime();
    if (config.mode === 'inspect') return await inspectCurrentChat(ctx, config);
    ctx.stage = 'confirm-pending-notification';
    const notificationWindow = await activateNotification(ctx, config);
    const notification = await observeNotification(ctx, config, notificationWindow);
    ctx.stage = 'open-correct-reception';
    const chat = await openReception(ctx, config, notification);
    ctx.stage = 'identify-current-order';
    const order = await observeOrder(ctx, config, chat, notification.recipient);
    ctx.stage = 'copy-product-title';
    const copiedTitle = await copyProductTitle(ctx, config, order);
    ctx.stage = 'query-product-information';
    const product = await queryProduct(ctx, config, copiedTitle);
    ctx.stage = 'prepare-message-draft';
    const message = composeMessage(copiedTitle, product, config.api.contentPostfix);
    await prepareDraft(ctx, config, order, message);
    return result(ctx, 'success', 'DRAFT_VERIFIED', '可见收件人与单个订单线索已重验，完整草稿已原生回读；未发送、未发货');
  } catch (error) { return failedResult(ctx, error); }
}

// Optional supervisor: only retry an idle, no-action observation. A successful
// draft also stops: without stable IDs, automatic next-order deduplication is unsafe.
async function supervise(config, maxIdleChecks) {
  requireThat(Number.isInteger(maxIdleChecks) && maxIdleChecks > 0 && maxIdleChecks <= 60,
    'INVALID_SUPERVISOR_LIMIT', '监听必须提供 1..60 的空闲检查上限');
  let outcome;
  for (let index = 0; index < maxIdleChecks; index++) {
    outcome = await runOnce(config);
    const idle = outcome.status === 'blocked' && outcome.code === 'NO_NOTIFICATION' &&
      Object.keys(outcome.effects).every(key => outcome.effects[key] === 0);
    if (!idle || index + 1 === maxIdleChecks) return outcome;
    await sleep(Math.min(1000 * (index + 1), 5000));
  }
  return outcome;
}

// ---- Explicit main: exactly one run, bounded config read, redacted result --
async function main() {
  let config;
  try { config = await File.readJSON(CONFIG_PATH, { maxBytes: LIMITS.configBytes }); }
  catch (_) {
    const outcome = result(newRun(), 'blocked', 'CONFIG_READ_FAILED', '无法读取有效配置：' + CONFIG_PATH + '；未执行桌面或网络操作');
    console.log('QIANNIU_RECIPE_RESULT ' + JSON.stringify(outcome));
    return outcome;
  }
  const outcome = await runOnce(config);
  console.log('QIANNIU_RECIPE_RESULT ' + JSON.stringify(outcome));
  return outcome;
}
await main();
