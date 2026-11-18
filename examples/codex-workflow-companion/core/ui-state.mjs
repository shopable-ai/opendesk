// UI projection only. The durable audit history and MCP state remain unchanged.
// TrustedWindow messages allow 64 KiB UTF-8 JSON and at most 4096 values.
export function uiState(state) {
  const view = { ...state, history: state.history.slice(-12).map(({ at, type, taskId }) => ({ at, type, taskId })) };
  if (Buffer.byteLength(JSON.stringify({ type: 'state', state: view }), 'utf8') > 60_000) throw Error('UI_STATE_TOO_LARGE');
  return view;
}
