// Screenshot bytes example. Captured pixels may contain sensitive desktop content.
const artifactDir = File.join(Execution.workdir, '.runtime', 'examples', 'desktop', 'screenshot-bytes');
File.ensureDir(artifactDir);
const out = File.join(artifactDir, 'active-window.png');

const raw = await page.screenshot({target: 'activeWindow', returnType: 'bytes'});
const bytes = new Uint8Array(raw);
File.writeBytes(out, bytes);

console.log(JSON.stringify({
  out,
  byteLength: raw.byteLength,
  firstBytes: Array.from(bytes.slice(0, 8)),
}, null, 2));
