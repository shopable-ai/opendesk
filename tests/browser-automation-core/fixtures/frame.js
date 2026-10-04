let frameClicks = 0;
document.querySelector('button').addEventListener('click', () => {
  document.querySelector('[data-testid=frame-status]').textContent = 'Frame Clicked';
  document.querySelector('[data-testid=frame-count]').textContent = String(++frameClicks);
});
