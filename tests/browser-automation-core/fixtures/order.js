(() => {
  const get = id => document.querySelector(`[data-testid="${id}"]`);
  const setStatus = text => { get('status').textContent = text; };
  let queriedOrder = null, confirmClicks = 0, actions = 0, frameGeneration = 0;
  for (const type of ['click', 'input', 'change']) document.addEventListener(type, () => { get('action-count').textContent = String(++actions); }, true);
  get('private-note').addEventListener('input', () => { get('private-mirror').textContent = get('private-note').value; });
  get('order-id').addEventListener('input', () => { get('app-order-value').textContent = get('order-id').value; });
  get('confirmation').addEventListener('input', () => { get('app-confirmation-value').textContent = get('confirmation').value; });
  get('hide-checks').addEventListener('click', () => { document.querySelector('details').open = false; });
  get('slow-safe-action').addEventListener('click', () => {
    const counter = get('slow-safe-count');
    counter.textContent = String(Number(counter.textContent) + 1);
    // Local counter only. Core's synchronous click ACK waits; a 100ms MCP deadline expires after dispatch.
    const deadline = performance.now() + 400;
    while (performance.now() < deadline) { /* Bounded, deliberate main-thread delay for live safety coverage. */ }
  });
  get('frame-replace').addEventListener('click', () => { const frame = document.querySelector('iframe'); const fresh = frame.cloneNode(); fresh.src = `/frame.html?generation=${++frameGeneration}`; frame.replaceWith(fresh); });
  const matrix = count => {
    get('matrix-panel').replaceChildren();
    for (let i = 0; i < count; i++) {
      const panel = document.createElement('div'); panel.setAttribute('data-action', 'matrix-scope');
      const label = document.createElement('label'); label.textContent = 'Matrix label';
      const input = document.createElement('input'); input.id = `matrix-${i}`; label.htmlFor = input.id;
      const button = document.createElement('button'); button.textContent = 'Matrix text'; button.setAttribute('aria-label', 'Matrix name'); button.setAttribute('data-testid', 'matrix-target'); button.setAttribute('data-action', 'matrix-attribute');
      panel.append(label, input, button); get('matrix-panel').append(panel);
    }
  };
  for (const [id, n] of [['matrix-zero', 0], ['matrix-one', 1], ['matrix-two', 2]]) get(id).addEventListener('click', () => matrix(n));
  get('query').addEventListener('click', async () => {
    setStatus('Querying'); get('amount').textContent = ''; queriedOrder = get('order-id').value;
    const response = await fetch('/query', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({orderId: queriedOrder})});
    const result = await response.json(); get('amount').textContent = result.amount; setStatus('Awaiting Confirmation');
  });
  document.querySelector('[data-testid="confirm-slot"]').addEventListener('click', async event => {
    if (event.target.getAttribute('data-testid') !== 'confirm') return;
    get('click-count').textContent = String(++confirmClicks);
    setStatus('Submitting');
    const response = await fetch('/confirm', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({orderId: queriedOrder, confirmation: get('confirmation').value})});
    const result = await response.json(); setStatus(result.completed ? 'Completed' : 'Rejected');
    if (result.completed) {
      const row = document.createElement('tr');
      for (const value of [queriedOrder, get('amount').textContent, 'Completed', String(result.submissionCount)]) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
      get('completed-orders').append(row);
    }
  });
  get('replace').addEventListener('click', () => { get('confirm').replaceWith(get('confirm').cloneNode(true)); });
  get('spa').addEventListener('click', () => { history.pushState({}, '', `${location.pathname}?view=next`); get('note').textContent = 'Next view'; });
  get('reveal').addEventListener('click', () => { get('delayed').textContent = ''; setTimeout(() => { get('delayed').textContent = 'Visible after delay'; }, 100); });
})();
