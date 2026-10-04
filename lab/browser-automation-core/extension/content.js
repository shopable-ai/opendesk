/* Fixed Content Script operations for permitted local documents. No eval, user functions or userscript execution. */
(function browserCoreContent() {
  if (globalThis.__browserCoreContentVersion) return;
  globalThis.__browserCoreContentVersion = '0.3.1';
  const locator = globalThis.BrowserCoreLocator;
  const elements = new Map(), ids = new WeakMap(), waits = new Map(), barriers = new Map(), executionCancelled = new Set();
  const sha256 = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(x => x.toString(16).padStart(2, '0')).join('');
  const loadedResources = Promise.all([sha256(browserCoreContent.toString()), sha256(locator.runtimeCode)]).then(([contentCodeSha256, locatorCodeSha256]) => ({contentCodeSha256, locatorCodeSha256}));
  let documentId = null, lastUrl = location.href, localRevision = 0;
  const fail = (code, extra = {}) => { throw Object.assign(new Error(code), {code, ...extra}); };
  const directlySensitive = el => (el.getAttribute('type') || '').toLowerCase() === 'password' || el.hasAttribute('data-sensitive') || /password|cc-number|cc-csc/i.test(el.getAttribute('autocomplete') || '');
  // Aggregate text/name/value is private if any descendant is marked private. Bound this traversal too.
  const sensitive = (el, limits) => directlySensitive(el) || (el.childElementCount > 0 && scan(el, limits).some(directlySensitive));
  const bounded = (value, limits) => String(value ?? '').slice(0, limits.maxTextChars);
  function revision(message) {
    if (location.href !== lastUrl) { lastUrl = location.href; localRevision++; }
    return `${message.pageRevision}:${localRevision}:${location.href}`;
  }
  function visible(el) { return el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'; }
  function scan(root, limits) {
    const result = [], walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let current = root;
    while (current) {
      if (result.length >= limits.maxScanNodes) fail('DOM_SCAN_LIMIT');
      result.push(current); current = walker.nextNode();
    }
    return result;
  }
  function locate(query, limits) {
    locator.validate(query, 0, limits.maxQueryChars);
    if (query.kind === 'relation') {
      const parent = locate(query.within, limits);
      return locator.unique(scan(parent, limits).filter(el => el !== parent && visible(el) && locator.matches(el, query.target)));
    }
    return locator.unique(scan(document.body, limits).filter(el => visible(el) && locator.matches(el, query)));
  }
  function describe(el, limits) {
    const redacted = sensitive(el, limits);
    return {tag: el.tagName.toLowerCase(), role: locator.role(el), name: redacted ? '[REDACTED]' : bounded(locator.name(el), limits),
      text: redacted ? '[REDACTED]' : bounded(el.textContent, limits), value: 'value' in el ? (redacted ? '[REDACTED]' : bounded(el.value, limits)) : null,
      redacted, disabled: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
      id: bounded(el.id, limits), testId: bounded(el.getAttribute('data-testid'), limits)};
  }
  function fingerprint(el) { return [el.tagName, locator.role(el), locator.name(el), el.getAttribute('type'), el.id].join('|'); }
  function reference(el, message) {
    let id = ids.get(el);
    if (id && elements.get(id)?.fingerprint !== fingerprint(el)) id = null;
    if (!id) {
      for (const [key, item] of elements) if (!item.node.deref()?.isConnected) elements.delete(key);
      if (elements.size >= message.limits.maxTargets) fail('TARGET_STORE_LIMIT');
      id = crypto.randomUUID(); ids.set(el, id); elements.set(id, {node: new WeakRef(el), fingerprint: fingerprint(el)});
    }
    return {...message.identity, elementIdentity: id, semanticRevision: revision(message)};
  }
  function resolve(target, message) {
    if (!target || ['brokerSession', 'browserSession', 'connectionEpoch', 'tab', 'frame', 'document'].some(key => target[key] !== message.identity[key]) ||
        target.semanticRevision !== revision(message)) fail('STALE_TARGET');
    const item = elements.get(target.elementIdentity), el = item?.node.deref();
    if (!el?.isConnected || item.fingerprint !== fingerprint(el)) fail('STALE_TARGET');
    return el;
  }
  function actual(el, field) {
    if (!['text', 'value'].includes(field)) fail('INVALID_READ_FIELD');
    return field === 'value' ? String(el.value ?? '') : locator.norm(el.textContent);
  }
  function conditionState(el, condition, limits) {
    if (!condition || !['equals', 'nonEmpty'].includes(condition.kind) || !['text', 'value'].includes(condition.field)) fail('INVALID_CONDITION');
    const value = actual(el, condition.field), pass = condition.kind === 'nonEmpty' ? value.length > 0 : value === String(condition.expected);
    const redacted = sensitive(el, limits);
    return {pass, field: condition.field, expected: redacted ? '[REDACTED]' : condition.kind === 'nonEmpty' ? 'nonEmpty' : bounded(condition.expected, limits),
      actual: redacted ? '[REDACTED]' : bounded(value, limits), redacted};
  }
  function waitFor(el, condition, message, timeoutMs) {
    if (waits.size >= message.limits.maxPending) fail('WAIT_LIMIT');
    if (!Number.isInteger(timeoutMs) || timeoutMs < message.limits.minTimeoutMs || timeoutMs > message.limits.maxTimeoutMs) fail('INVALID_TIMEOUT');
    return new Promise((resolveWait, reject) => {
      let timer, observer, completed = false;
      const finish = (error, result) => {
        if (completed) return; completed = true; clearTimeout(timer); observer?.disconnect();
        document.removeEventListener('input', check, true); document.removeEventListener('change', check, true);
        waits.delete(message.requestId); error ? reject(error) : resolveWait(result);
      };
      const check = () => {
        try { resolve(message.params.target, message); const state = conditionState(el, condition, message.limits); if (state.pass) finish(null, state); }
        catch (error) { finish(error); }
      };
      waits.set(message.requestId, () => finish(Object.assign(new Error('CANCELLED'), {code: 'CANCELLED'})));
      observer = new MutationObserver(check); observer.observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true});
      document.addEventListener('input', check, true); document.addEventListener('change', check, true);
      timer = setTimeout(() => finish(Object.assign(new Error('WAIT_TIMEOUT'), {code: 'WAIT_TIMEOUT'})), timeoutMs); check();
    });
  }
  async function execute(message) {
    const limits = message.limits;
    if (!limits || !document.body) fail('DOCUMENT_NOT_READY');
    if (documentId && documentId !== message.identity.document) fail('STALE_TARGET');
    documentId ||= message.identity.document;
    if (message.operation === 'provenance') return {identity: message.identity};
    let actionStarted = false, trace = {resolvedTarget: message.params.target ?? null, beforeObservation: null, action: null, afterObservation: null, verification: null};
    try {
      if (message.operation === 'observe') {
        const nodes = scan(document.body, limits).filter(el => visible(el) && (locator.role(el) || el.getAttribute('data-testid')));
        const observation = nodes.slice(0, limits.maxObserveElements).map(el => describe(el, limits));
        trace.afterObservation = {identity: message.identity, semanticRevision: revision(message), elementCount: observation.length, scanNodes: scan(document.body, limits).length, eligibleNodes: nodes.length, truncated: nodes.length > observation.length};
        return {identity: message.identity, semanticRevision: revision(message), observation, trace};
      }
      if (message.operation === 'locate') {
        const el = locate(message.params.query, limits), target = reference(el, message);
        trace.resolvedTarget = target; trace.afterObservation = describe(el, limits);
        return {identity: message.identity, target, candidateCount: 1, trace};
      }
      if ((message.params.dropAckAfterCompleted || message.params.testExecutionBarrier) && !message.testMode) fail('TEST_MODE_REQUIRED');
      if (message.params.testExecutionBarrier) {
        if (barriers.size >= limits.maxPending) fail('BARRIER_LIMIT');
        await new Promise((release, reject) => {
          const timer = setTimeout(() => { barriers.delete(message.requestId); reject(Object.assign(new Error('BARRIER_TIMEOUT'), {code: 'BARRIER_TIMEOUT'})); }, message.timeoutMs);
          barriers.set(message.requestId, () => { clearTimeout(timer); barriers.delete(message.requestId); release(); });
          chrome.runtime.sendMessage({kind: 'browser-core-boundary', requestId: message.requestId});
        });
      }
      if (executionCancelled.delete(message.requestId)) fail('CANCELLED');
      // Resolve the original WeakRef at the actual execution boundary. Never re-run a locator.
      const el = resolve(message.params.target, message); trace.beforeObservation = describe(el, limits);
      if (message.operation === 'read') {
        if (!['text', 'value'].includes(message.params.field || 'text')) fail('INVALID_READ_FIELD');
        const redacted = sensitive(el, limits), value = redacted ? null : actual(el, message.params.field || 'text');
        trace.afterObservation = describe(el, limits); return {identity: message.identity, value, redacted, trace};
      }
      if (message.operation === 'fill') {
        if (!visible(el) || el.disabled || el.readOnly || !['INPUT', 'TEXTAREA'].includes(el.tagName) || typeof message.params.value !== 'string' || message.params.value.length > limits.maxFillChars) fail('NOT_INTERACTABLE');
        const value = String(message.params.value ?? '');
        actionStarted = true;
        const prototype = el.tagName === 'INPUT' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(el, value);
        el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true}));
        trace.action = {type: 'fill', value: sensitive(el, limits) ? '[REDACTED]' : bounded(value, limits), redacted: sensitive(el, limits), sourceReadRequestId: message.params.sourceReadRequestId ?? null};
      } else if (message.operation === 'click') {
        if (!visible(el) || el.disabled || el.getAttribute('aria-disabled') === 'true' || locator.role(el) !== 'button') fail('NOT_INTERACTABLE');
        actionStarted = true; el.click(); trace.action = {type: 'click', elementIdentity: message.params.target.elementIdentity};
        if (message.params.dropAckAfterCompleted) {
          if (!message.testMode) fail('TEST_MODE_REQUIRED');
          const status = locate({kind: 'testId', value: 'status'}, limits);
          const target = reference(status, message), waitMessage = {...message, params: {target}};
          trace.verification = await waitFor(status, {kind: 'equals', field: 'text', expected: 'Completed'}, waitMessage, limits.maxTimeoutMs);
        }
      } else if (message.operation === 'wait') {
        trace.verification = await waitFor(el, message.params.condition, message, message.timeoutMs);
      } else if (message.operation === 'verify') {
        trace.verification = conditionState(el, message.params.condition, limits);
        if (!trace.verification.pass) fail('VERIFICATION_FAILED');
      } else fail('UNSUPPORTED_OPERATION');
      trace.afterObservation = describe(el, limits);
      return {identity: message.identity, trace, value: message.operation === 'fill' && !sensitive(el, limits) ? String(el.value) : null, redacted: sensitive(el, limits)};
    } catch (error) {
      return {identity: message.identity, error: {code: error.code || 'DOM_ERROR', outcome: actionStarted ? 'OUTCOME_UNKNOWN' : 'FAILED_CONFIRMED', candidateCount: error.candidateCount ?? null}, trace};
    }
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message?.kind !== 'browser-core-dom') return;
    if (message.operation === 'releaseExecution') { barriers.get(message.requestId)?.(); respond({released: true}); return; }
    if (message.operation === 'cancel') { if (barriers.has(message.requestId)) executionCancelled.add(message.requestId); barriers.get(message.requestId)?.(); waits.get(message.requestId)?.(); respond({cancelled: true}); return; }
    execute(message).then(async result => respond({...result, loadedResources: await loadedResources, resourceCounts: {targets: elements.size, waits: waits.size, barriers: barriers.size}}), async error => respond({error: {code: error.code || 'DOM_ERROR', outcome: 'FAILED_CONFIRMED'}, loadedResources: await loadedResources}));
    return true;
  });
})();
