const out = ".runtime/temp/vision-bytes-roundtrip.png";

await File.ensureDir("temp");

const raw = await page.screenshot({
  target: "activeWindow",
  returnType: "bytes",
});

const bytes = new Uint8Array(raw);
await File.writeBytes(out, bytes);

console.log(JSON.stringify({
  out,
  byteLength: raw.byteLength,
  firstBytes: Array.from(bytes.slice(0, 8)),
}, null, 2));

const ocr = await Vision.runOCR({
  provider: "paddle",
  image: raw,
  lang: "ch",
});

console.log(JSON.stringify({
  provider: ocr.provider,
  lang: ocr.lang,
  lineCount: ocr.lineCount,
}, null, 2));
