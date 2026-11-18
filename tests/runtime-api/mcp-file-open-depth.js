// The host creates an unconnected FIFO inside this task's isolated fixture.
const result = [];
for (const mode of ['r', 'w', 'a']) {
  let rejected = false;
  try { const handle = File.open(Execution.input.fifo, mode); handle.close(); }
  catch (error) { rejected = typeof error.message === 'string'; }
  result.push({mode, rejected});
}
File.write('fifo-result.json', JSON.stringify(result));
if (!result.every(row => row.rejected)) throw new Error('non-regular File.open must fail');
// Ordinary handle modes must still truncate, append, read and close correctly.
const target = 'regular-open.txt';
File.write(target, 'old-data');
let file = File.open(target, 'w'); file.write('new'); file.close();
file = File.open(target, 'a'); file.write('-tail'); file.close();
file = File.open(target, 'r');
const text = file.read(); file.close();
if (text !== 'new-tail') throw new Error('ordinary open mode regression');
for (const [source,destination] of [[Execution.input.fifo,'never-copy'],[target,Execution.input.fifo]]) {
  let rejected = false;
  try { File.copy(source,destination); } catch (error) { rejected = typeof error.message === 'string'; }
  if (!rejected) throw new Error('copy must reject FIFO source and target');
}
if (File.exists('never-copy') || File.read(target) !== 'new-tail') throw new Error('rejected copy changed files');
console.log(JSON.stringify({test:'mcp-file-open-depth',ok:true}));
