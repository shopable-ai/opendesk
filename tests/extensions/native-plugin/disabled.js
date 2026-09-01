if (typeof NativeExtensions !== "undefined" || typeof NativeExtension !== "undefined") {
  throw new Error("Native Extension globals must be absent without an explicit local gate");
}
console.log("PLUGIN_DISABLED_RESULT " + JSON.stringify({ globalsAbsent: true }));
