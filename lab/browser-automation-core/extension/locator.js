/* Pure, deliberately limited semantic matching; never accepts executable code or arbitrary CSS. */
(function browserCoreLocator() {
  const norm = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const fail = code => { throw Object.assign(new Error(code), {code}); };
  function role(el) {
    if (el.getAttribute('role')) return el.getAttribute('role');
    const tag = el.tagName.toLowerCase(), type = el.getAttribute('type') || 'text';
    if (tag === 'button') return 'button';
    if (tag === 'a' && el.getAttribute('href')) return 'link';
    if (tag === 'input' && ['button', 'submit', 'reset'].includes(type)) return 'button';
    if (tag === 'input' && ['checkbox', 'radio'].includes(type)) return type;
    if (tag === 'input' || tag === 'textarea') return 'textbox';
    if (tag === 'select') return 'combobox';
    if (tag === 'output') return 'status';
    return null;
  }
  function label(el) { return norm(Array.from(el.labels || []).slice(0, 4).map(item => item.textContent).join(' ')); }
  function name(el) {
    if (el.getAttribute('aria-label')) return norm(el.getAttribute('aria-label'));
    const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).slice(0, 4);
    if (ids.length) return norm(ids.map(id => el.ownerDocument.getElementById(id)?.textContent || '').join(' '));
    return label(el) || (role(el) === 'button' || role(el) === 'link' ? norm(el.textContent || el.value) : '') || el.getAttribute('title') || '';
  }
  const kinds = ['role', 'label', 'text', 'testId', 'attribute', 'relation'];
  const attributes = ['id', 'name', 'data-testid', 'data-action', 'data-order-role'];
  function validate(query, depth = 0, maxChars = Infinity) {
    if (!query || typeof query !== 'object' || Array.isArray(query) || !kinds.includes(query.kind) || depth > 1) fail('INVALID_QUERY');
    const text = value => typeof value === 'string' && value.length > 0 && value.length <= maxChars;
    if (query.kind === 'role' && (!text(query.role) || !text(query.name))) fail('INVALID_QUERY');
    if (['label', 'text', 'testId'].includes(query.kind) && !text(query.value)) fail('INVALID_QUERY');
    if (query.kind === 'attribute' && (!attributes.includes(query.attribute) || !text(query.value))) fail('INVALID_QUERY');
    if (query.kind === 'relation') { if (query.axis !== 'descendant') fail('INVALID_QUERY'); validate(query.within, depth + 1, maxChars); validate(query.target, depth + 1, maxChars); }
    return query;
  }
  function matches(el, query) {
    validate(query);
    switch (query.kind) {
      case 'role': return role(el) === query.role && name(el) === norm(query.name);
      case 'label': return label(el) === norm(query.value) && ['input', 'textarea', 'select'].includes(el.tagName.toLowerCase());
      case 'text': return norm(el.textContent) === norm(query.value) && !Array.from(el.children || []).some(child => norm(child.textContent) === norm(query.value));
      case 'testId': return el.getAttribute('data-testid') === query.value;
      case 'attribute': return el.getAttribute(query.attribute) === query.value;
      default: fail('INVALID_QUERY');
    }
  }
  function unique(elements) {
    if (!elements.length) fail('TARGET_NOT_FOUND');
    if (elements.length !== 1) throw Object.assign(new Error('AMBIGUOUS_TARGET'), {code: 'AMBIGUOUS_TARGET', candidateCount: elements.length});
    return elements[0];
  }
  const api = {norm, role, label, name, validate, matches, unique, runtimeCode: browserCoreLocator.toString()};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.BrowserCoreLocator = api;
})();
