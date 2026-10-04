(() => {
  const get = id => document.querySelector(`[data-testid="${id}"]`);
  let actions = 0;
  for (const type of ['input', 'change', 'click']) document.addEventListener(type, () => {get('actions').textContent = String(++actions);}, true);
  get('build').addEventListener('click', () => {
    const root = get('nodes-root'); root.replaceChildren();
    const desired = Number(get('nodes').value);
    const baseline = document.querySelectorAll('body *').length + 1;
    if (!Number.isInteger(desired) || desired < baseline || desired > 4096) return;
    for (let i = baseline; i < desired; i++) {const node = document.createElement('span'); node.textContent = `Node ${i}`; node.dataset.testid = `node-${i}`; root.append(node);}
  });
  get('build-frames').addEventListener('click', () => {
    const root = get('frames-root'); root.replaceChildren();
    const desired = Number(get('frames').value);
    if (!Number.isInteger(desired) || desired < 1 || desired > 32) return;
    for (let i = 1; i < desired; i++) {const frame = document.createElement('iframe'); frame.src = `/frame.html?resource=${i}`; root.append(frame);}
  });
})();
