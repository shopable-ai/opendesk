const out = ".runtime/temp/screenshot-bytes-smoke.png";

async function main() {
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
}

main().catch((err) => {
  console.error(err);
  throw err;
});
