const listed = NativeExtensions.list();
const goBasic = NativeExtensions.get("com.example.go-basic");
const diagnostics = NativeExtensions.diagnostics();
if (goBasic !== NativeExtensions.goBasic) throw new Error("canonical get did not return the namespace binding");
if (!listed.some((plugin) => plugin.id === "com.example.go-basic")) throw new Error("goBasic plugin was not discovered");
if (!listed.some((plugin) => plugin.id === "com.example.macos-vision")) throw new Error("macosVision plugin was not discovered");
console.log("PLUGIN_LIST_RESULT " + JSON.stringify({
  plugins: listed.map((plugin) => ({ id: plugin.id, namespace: plugin.namespace, methods: plugin.methods })),
  diagnostics,
  immutable: Object.isFrozen(NativeExtensions) && Object.isFrozen(NativeExtensions.goBasic),
}));
