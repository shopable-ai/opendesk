async function refreshStatus() {
  try {
    const result = await chrome.runtime.sendMessage({kind: 'installationStatus'});
    document.getElementById('summary').textContent = result.phase;
    document.getElementById('details').textContent = JSON.stringify(result, null, 2);
  } catch {
    document.getElementById('summary').textContent = 'WORKER_UNAVAILABLE：请检查本插件的 service worker 错误。';
  }
}
document.getElementById('refresh').addEventListener('click', refreshStatus);
refreshStatus();
