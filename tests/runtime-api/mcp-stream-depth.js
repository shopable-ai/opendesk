// Pure data cases for the real Runtime. No GUI, network, clipboard or model.
// The MCP host independently checks the known output and both stream termini.
function observe(promise, reason) {
  return Promise.resolve(promise).then(
    value => ({state: 'fulfilled', value}),
    error => ({state: 'rejected', sameReason: error === reason}),
  );
}

async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise(resolve => {
      timer = setTimeout(() => resolve({state: 'pending'}), 250);
    })]);
  } finally { clearTimeout(timer); }
}

const scenario = Execution.input.case;
let result;
if (scenario === 'queued-close') {
  const received = [];
  const trace = [];
  let start;
  const stream = new WritableStream({
    start() { return new Promise(resolve => { start = resolve; }); },
    async write(chunk) {
      trace.push('begin:' + chunk.id);
      await new Promise(resolve => setTimeout(resolve, 5));
      received.push({id: chunk.id, total: chunk.quantity * chunk.price});
      trace.push('end:' + chunk.id);
    },
    close() { trace.push('close'); },
  });
  const writer = stream.getWriter();
  const first = observe(writer.write({id: 'A', quantity: 3, price: 7}));
  const second = observe(writer.write({id: 'B', quantity: 2, price: 11}));
  const closing = observe(writer.close());
  const late = observe(writer.write({id: 'late', quantity: 99, price: 99}));
  const closed = observe(writer.closed);
  start();
  result = {received, trace, operations: await Promise.all([first, second, closing, late, closed])};
} else if (scenario === 'transform-success') {
  const transformed = [];
  let sum = 0;
  const stream = new TransformStream({
    async transform(chunk, controller) {
      await new Promise(resolve => setTimeout(resolve, 5));
      sum += chunk.quantity * chunk.price;
      controller.enqueue({id: chunk.id, total: chunk.quantity * chunk.price});
    },
    async flush(controller) { controller.enqueue({sum}); },
  });
  const reader = stream.readable.getReader();
  const writer = stream.writable.getWriter();
  const reading = (async () => {
    while (true) {
      const row = await reader.read();
      if (row.done) return;
      transformed.push(row.value);
    }
  })();
  const operations = [observe(writer.write({id: 'A', quantity: 3, price: 7})),
    observe(writer.write({id: 'B', quantity: 2, price: 11})), observe(writer.close()),
    observe(writer.closed), observe(reader.closed), observe(reading)];
  result = {transformed, operations: await bounded(Promise.all(operations))};
} else if (scenario === 'abort-listeners') {
  const controller = new AbortController();
  const calls = [];
  const reason = {test: 'first reason'};
  controller.signal.onabort = async () => { calls.push('onabort'); throw new Error('PRIVATE_ASYNC_ONABORT'); };
  controller.signal.addEventListener('abort', async () => {
    calls.push('async'); await Promise.resolve(); throw new Error('PRIVATE_ASYNC_LISTENER');
  });
  controller.signal.addEventListener('abort', () => { calls.push('next'); });
  controller.abort(reason);
  controller.abort({test: 'ignored'});
  controller.signal.addEventListener('abort', () => ({then(resolve, reject) {
    calls.push('late'); reject(new Error('PRIVATE_ASYNC_LATE'));
  }}));
  await new Promise(resolve => setTimeout(resolve, 25));
  result = {calls, aborted: controller.signal.aborted, sameReason: controller.signal.reason === reason, alive: true};
} else {
  const reason = new Error('controlled-stream-failure');
  const transformer = {};
  if (scenario === 'transform-throw') transformer.transform = () => { throw reason; };
  else if (scenario === 'transform-reject') transformer.transform = () => Promise.reject(reason);
  else if (scenario === 'flush-throw') transformer.flush = () => { throw reason; };
  else if (scenario === 'flush-reject') transformer.flush = () => Promise.reject(reason);
  else if (scenario === 'controller-error') transformer.transform = (chunk, controller) => { controller.error(reason); };
  else if (scenario === 'start-error') transformer.start = controller => { controller.error(reason); };
  else if (scenario === 'start-reject') transformer.start = () => Promise.reject(reason);
  else throw new Error('mcp-stream-depth: select a known case');
  const stream = new TransformStream(transformer);
  const reader = stream.readable.getReader();
  const writer = stream.writable.getWriter();
  const pendingRead = observe(reader.read(), reason);
  const readableClosed = observe(reader.closed, reason);
  const writableClosed = observe(writer.closed, reason);
  const operation = observe(scenario.startsWith('flush') ? writer.close() : writer.write('known-input'), reason);
  result = await bounded(Promise.all([operation, pendingRead, readableClosed, writableClosed]));
}
console.log(JSON.stringify({test: 'mcp-stream-depth', case: scenario, result}));
