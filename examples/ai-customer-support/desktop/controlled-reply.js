// Pure host-owned controller; no UI, knowledge lookup, or implicit send authority.
(function (root) {
  'use strict';
  const fields = ['pid', 'window', 'customer', 'account', 'knowledge'];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const copy = value => JSON.parse(JSON.stringify(value));
  function scopeOf(value) {
    if (!value || !Number.isSafeInteger(value.pid) || value.pid <= 0 ||
        fields.slice(1).some(k => typeof value[k] !== 'string' || !value[k] || value[k].length > 256))
      throw Error('INVALID_SCOPE');
    return Object.fromEntries(fields.map(k => [k, value[k]]));
  }
  function create({clock, observe, propose, validateFresh, send}) {
    // clock: monotonic now(), setTimeout(fn, ms), clearTimeout(id).
    // All callbacks are trusted host code. Snapshots/evidence must be plain JSON.
    // observe({scope,purpose}) returns {scope,complete:true,contextId,draft,
    // watermark,messages:[{id,sequence,role:'customer'|'agent',text}]}.
    // watermark covers history, including history not in messages; IDs/sequences
    // are immutable native identities, never derived from text or array indices.
    // Host must restrict enable/approval to its trusted fixture account/session
    // and built fixture knowledge rules; real Query human-review output cannot
    // grant auto-send authority. This module provides no knowledge backend.
    // propose(request) returns {text,approvalId,approved:true,coverage:'full',
    // knowledgeScope,expiresAt}. A hash is not approval. validateFresh receives
    // {request,evidence,observation} and must freshly attest all five checks below.
    if (!clock || ['now', 'setTimeout', 'clearTimeout'].some(k => typeof clock[k] !== 'function') ||
        [observe, propose, validateFresh, send].some(fn => typeof fn !== 'function')) throw Error('INVALID_HOST');
    let mode = 'disabled', reason = '', scope = null, generation = 0, floor = 0;
    let latest = null, queue = [], firstAt = 0, timer = null, busy = false;
    let requests = 0, rate = [], locked = false, lastOutcome = null;
    const seen = new Map();
    const now = () => clock.now();
    function clear() {
      if (timer !== null) clock.clearTimeout(timer);
      timer = null; queue = []; firstAt = 0;
    }
    function stop(next, why) { generation++; clear(); mode = next; reason = why; }
    function unknown(why) { locked = true; lastOutcome = 'unknown'; stop('locked', why); }
    function snapshot(raw) {
      const s = copy(raw);
      if (!s || !same(scopeOf(s.scope), scope) || s.complete !== true ||
          typeof s.contextId !== 'string' || !s.contextId || s.contextId.length > 256 ||
          typeof s.draft !== 'string' || !Number.isSafeInteger(s.watermark) || s.watermark < 0 ||
          !Array.isArray(s.messages) || s.messages.length > 256) throw Error('INVALID_OBSERVATION');
      const ids = new Set(), sequences = new Set();
      for (const m of s.messages) {
        if (!m || typeof m.id !== 'string' || !m.id || m.id.length > 256 || ids.has(m.id) ||
            !Number.isSafeInteger(m.sequence) || m.sequence <= 0 || m.sequence > s.watermark ||
            sequences.has(m.sequence) || !['customer', 'agent'].includes(m.role) ||
            typeof m.text !== 'string' || !m.text || m.text.length > 12000) throw Error('INVALID_MESSAGE');
        ids.add(m.id); sequences.add(m.sequence);
      }
      s.scope = scopeOf(s.scope);
      s.messages = s.messages.map(({id, sequence, role, text}) => ({id, sequence, role, text}));
      s.messages.sort((a, b) => a.sequence - b.sequence);
      return s;
    }
    async function baseline(nextScope) {
      if (locked) return false;
      const selected = scopeOf(nextScope);
      stop('enabling', 'baseline'); scope = selected; latest = null; seen.clear();
      const token = generation;
      try {
        const s = snapshot(await observe({scope: copy(scope), purpose: 'baseline'}));
        if (token !== generation) return false;
        floor = s.watermark; latest = s;
        for (const m of s.messages) seen.set(m.id, JSON.stringify(m));
        mode = 'enabled'; reason = ''; return true;
      } catch (_) { if (token === generation) stop('paused', 'baseline-failed'); return false; }
    }
    function ingest(raw) {
      if (mode !== 'enabled') return false;
      try {
        const s = snapshot(raw);
        if (s.watermark < floor) throw Error('STALE_OBSERVATION');
        const additions = [];
        for (const m of s.messages) {
          const prior = seen.get(m.id);
          if (prior && prior !== JSON.stringify(m)) throw Error('IDENTITY_CONFLICT');
          if (!prior && Array.from(seen.values()).some(value => JSON.parse(value).sequence === m.sequence))
            throw Error('SEQUENCE_CONFLICT');
          if (!prior && m.sequence > floor && m.role === 'customer') additions.push(m);
          if (!prior) seen.set(m.id, JSON.stringify(m));
        }
        if (seen.size > 256 || queue.length + additions.length > 8) throw Error('QUEUE_LIMIT');
        floor = s.watermark; latest = s;
        if (additions.length) {
          if (!queue.length) firstAt = now();
          queue.push(...additions);
          schedule();
        }
        return true;
      } catch (_) { stop('paused', 'observation-refused'); return false; }
    }
    function schedule() {
      if (timer !== null) clock.clearTimeout(timer);
      timer = null;
      if (mode !== 'enabled' || !queue.length || busy) return;
      const delay = queue.length === 8 ? 0 : Math.max(0, Math.min(600, firstAt + 2000 - now()));
      timer = clock.setTimeout(() => { timer = null; void run(); }, delay);
    }
    async function run() {
      if (busy || mode !== 'enabled' || !queue.length) return;
      rate = rate.filter(t => now() - t < 60000);
      if (requests >= 20 || rate.length >= 6) { stop('paused', 'request-limit'); return; }
      busy = true; requests++; rate.push(now());
      const token = generation, batch = queue, context = latest;
      queue = []; firstAt = 0;
      const request = {id: 'controlled-' + requests, scope: copy(scope),
        triggers: copy(batch), context: copy(context)};
      const valid = () => token === generation && mode === 'enabled';
      let sending = false;
      // A timed-out callback retains the single-flight slot until it actually
      // settles. No AbortSignal can prove a native input did not occur.
      const deadline = clock.setTimeout(() => {
        if (sending) unknown('send-timeout');
        else if (valid()) stop('paused', 'request-timeout');
      }, 10000);
      try {
        const evidence = copy(await propose(copy(request)));
        if (!valid()) return;
        if (!evidence || evidence.approved !== true || evidence.requiresHumanReview === true ||
            evidence.coverage !== 'full' ||
            typeof evidence.approvalId !== 'string' || !evidence.approvalId ||
            typeof evidence.text !== 'string' || !evidence.text || evidence.text.length > 12000 ||
            evidence.knowledgeScope !== scope.knowledge || !Number.isFinite(evidence.expiresAt) ||
            evidence.expiresAt <= now()) throw Error('UNAPPROVED_REPLY');
        const fresh = snapshot(await observe({scope: copy(scope), purpose: 'before-send'}));
        if (!valid()) return;
        if (fresh.draft !== '' || !same(fresh, context)) throw Error('CONTEXT_CHANGED');
        const checks = await validateFresh({request: copy(request), evidence: copy(evidence), observation: copy(fresh)});
        if (!valid()) return;
        if (!same(latest, context) || !checks || ['trigger', 'context', 'emptyDraft', 'authorized', 'knowledgeApproved'].some(k => checks[k] !== true) ||
            evidence.expiresAt <= now()) throw Error('FRESH_APPROVAL_REFUSED');
        sending = true;
        // Host must recheck its native binding/authorization immediately before
        // input and honor isCurrent(); no async controller can undo native input.
        const receipt = await send({request: copy(request), evidence: copy(evidence),
          observation: copy(fresh), isCurrent: valid});
        if (locked) return;
        if (!receipt || !['sent', 'failed'].includes(receipt.status)) { unknown('send-unknown'); return; }
        if (receipt.status === 'failed') { lastOutcome = 'failed'; if (valid()) stop('paused', 'send-failed'); return; }
        const after = snapshot(await observe({scope: copy(request.scope), purpose: 'confirm-send'}));
        // Confirmation is independent of draft clearing and requires native
        // correlation to this send, not merely a matching historical reply.
        const confirmed = typeof receipt.messageId === 'string' && after.messages.some(m =>
          m.id === receipt.messageId && m.role === 'agent' && m.sequence > fresh.watermark &&
          !fresh.messages.some(old => old.id === m.id) && m.text === evidence.text);
        if (!confirmed) { unknown('send-unconfirmed'); return; }
        if (locked) return;
        lastOutcome = 'confirmed';
      } catch (_) {
        if (sending) unknown('send-unknown');
        else if (valid()) { lastOutcome = 'failed'; stop('paused', 'request-refused'); }
      } finally {
        clock.clearTimeout(deadline); busy = false; schedule();
      }
    }
    return Object.freeze({
      enable: baseline,
      resume: () => mode === 'paused' && scope ? baseline(scope) : Promise.resolve(false),
      pause: () => { if (!locked) stop('paused', 'paused'); },
      revoke: () => { if (!locked) stop('revoked', 'revoked'); },
      takeover: () => { if (!locked) stop('paused', 'takeover'); },
      ingest,
      status: () => ({mode, reason, generation, busy, queued: queue.length, requests, lastOutcome}),
    });
  }
  root.OpenDeskSupportControlledReply = Object.freeze({create});
})(globalThis);
