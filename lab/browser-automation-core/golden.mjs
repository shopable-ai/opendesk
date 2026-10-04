// Executor gets answers only through the real DOM. No fixture backend/verifier imports or fetches.
export async function success(client, operation, params = {}, options = {}) {
  const response = await client.request(operation, params, options);
  if (response.error) throw Object.assign(new Error(response.error.code), {code: response.error.code, response});
  return response;
}
export async function locate(client, scope, query) { return (await success(client, 'locate', {scope, query})).result.target; }
export async function observeReady(client, tab, {differentDocument = null} = {}) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await success(client, 'observe', {scope: {tab, frame: 0}});
      if (!differentDocument || response.result.identity.document !== differentDocument) return response.result.identity;
    } catch (error) { if (!['DOCUMENT_NOT_READY', 'STALE_TARGET', 'BROWSER_ERROR'].includes(error.code)) throw error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Object.assign(new Error('DOCUMENT_READY_TIMEOUT'), {code: 'DOCUMENT_READY_TIMEOUT'});
}
export async function executeOrder(client, scope, orderId, {dropAck = false, requestId, cancelAfterDispatch = false, onConfirmDispatched = null} = {}) {
  const byId = value => ({kind: 'testId', value});
  const order = await locate(client, scope, {kind: 'label', value: 'Order ID'});
  await success(client, 'fill', {target: order, value: orderId});
  const query = await locate(client, scope, {kind: 'role', role: 'button', name: 'Query'});
  await success(client, 'click', {target: query});
  const amountTarget = await locate(client, scope, byId('amount'));
  await success(client, 'wait', {target: amountTarget, condition: {kind: 'nonEmpty', field: 'text'}}, {timeoutMs: 5000});
  const read = await success(client, 'read', {target: amountTarget, field: 'text'});
  const amount = read.result.value;
  if (!/^\d+\.\d{2}$/.test(amount)) throw Error('DOM_AMOUNT_INVALID');
  const confirmation = await locate(client, scope, {kind: 'label', value: 'Confirmation Amount'});
  const fill = await success(client, 'fill', {target: confirmation, value: amount, sourceReadRequestId: read.requestId});
  const confirmationRead = await success(client, 'read', {target: confirmation, field: 'value'});
  const confirm = await locate(client, scope, {kind: 'role', role: 'button', name: 'Confirm'});
  const confirmPromise = client.request('click', {target: confirm, dropAckAfterCompleted: dropAck},
    {timeoutMs: dropAck ? 700 : 5000, ...(requestId ? {requestId} : {})});
  let confirmBoundary = null;
  if (cancelAfterDispatch) {
    const deadline = Date.now() + 5000; let dispatched;
    while (Date.now() < deadline) {
      dispatched = (await success(client, 'events')).result.find(event => event.eventType === 'ack-dropped' && event.data?.requestId === requestId);
      if (dispatched) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    if (!dispatched) throw Error('COMPLETED_ACK_DROP_BOUNDARY_NOT_OBSERVED');
    confirmBoundary = dispatched;
    client.cancel(requestId);
  }
  if (onConfirmDispatched) await onConfirmDispatched();
  const clicked = await confirmPromise;
  if (!dropAck && clicked.error) throw Object.assign(new Error(clicked.error.code), {response: clicked});
  const status = await locate(client, scope, byId('status'));
  await success(client, 'wait', {target: status, condition: {kind: 'equals', field: 'text', expected: 'Completed'}}, {timeoutMs: 5000});
  const verified = await success(client, 'verify', {target: status, condition: {kind: 'equals', field: 'text', expected: 'Completed'}});
  return {orderId, domReadAmount: amount, readRequestId: read.requestId, readTarget: amountTarget, fillRequestId: fill.requestId,
    fillSourceReadRequestId: fill.result.trace.action.sourceReadRequestId, readResponse: read, fillResponse: fill, confirmationReadResponse: confirmationRead, verificationResponse: verified, confirmationActual: confirmationRead.result.value, confirmTarget: confirm, confirmResponse: clicked, confirmBoundary,
    domFinalStatus: verified.result.trace.verification.actual, verificationRequestId: verified.requestId};
}
