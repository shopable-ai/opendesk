const config = globalThis.PLUGIN_PROOF_CONFIG;
if (!config || typeof config.ocrImage !== "string") throw new Error("PLUGIN_PROOF_CONFIG.ocrImage is required");

const hello = NativeExtensions.goBasic.hello({ name: "OpenDesk" });
const add = NativeExtensions.goBasic.add({ a: 20, b: 22 });
const ocr = NativeExtensions.macosVision.ocr({
  imagePath: config.ocrImage,
  recognitionLevel: "accurate",
  languages: ["zh-Hans", "en-US"],
});

console.log("PLUGIN_PROOF_RESULT " + JSON.stringify({
  hello,
  add,
  ocr: { text: ocr.text, width: ocr.image.width, height: ocr.image.height, itemCount: ocr.items.length },
}));
