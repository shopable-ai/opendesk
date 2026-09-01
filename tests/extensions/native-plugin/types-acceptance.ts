/// <reference path="../../../types/NativeExtension.d.ts" />
/// <reference path="../../../examples/native-extensions/go-basic/types/index.d.ts" />
/// <reference path="../../../examples/native-extensions/macos-vision/types/index.d.ts" />

const helloResult: { message: string } = NativeExtensions.goBasic.hello({ name: "OpenDesk" });
const addResult: { value: number } = NativeExtensions
  .get("com.example.go-basic")
  .add({ a: 20, b: 22 });
const ocrText: string = NativeExtensions.macosVision.ocr({ imagePath: "/absolute/input.png" }).text;

// @ts-expect-error business params are mandatory
NativeExtensions.goBasic.hello();
// @ts-expect-error manifest-installed namespaces are the only typed properties
NativeExtensions.notInstalled.hello({ name: "OpenDesk" });
// @ts-expect-error plugin-id lookup preserves the plugin declaration
NativeExtensions.get("com.example.go-basic").missing({});
// @ts-expect-error callers cannot override manifest-bound routing
NativeExtensions.goBasic.hello({ name: "OpenDesk" }, { executable: "/tmp/evil" });
// @ts-expect-error callers cannot pass a wire method
NativeExtensions.goBasic.hello({ name: "OpenDesk" }, { method: "other" });

void helloResult;
void addResult;
void ocrText;
