if (typeof NativeExtensions === "undefined" || typeof NativeExtensions.list !== "function") {
  throw new Error("local CLI must provide NativeExtensions by default");
}
if (typeof NativeExtension !== "undefined") {
  throw new Error("default NativeExtensions exposed unsafe NativeExtension.call");
}
console.log("PLUGIN_DEFAULT_RESULT " + JSON.stringify({
  globalPresent: true,
  plugins: NativeExtensions.list().map((plugin) => plugin.id),
}));
