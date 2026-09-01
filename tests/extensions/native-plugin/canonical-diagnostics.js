function main() {
  const plugins = NativeExtensions.list();
  const diagnostics = NativeExtensions.diagnostics();
  const goBasic = plugins.find((plugin) => plugin.id === "com.example.go-basic");
  if (!goBasic || goBasic.rootKind !== "current_user") {
    throw new Error("canonical current-user goBasic bundle was not discovered");
  }
  if (NativeExtensions.get("com.example.go-basic") !== NativeExtensions.goBasic) {
    throw new Error("canonical get did not return the goBasic namespace");
  }
  console.log("PLUGIN_CANONICAL_DIAGNOSTICS " + JSON.stringify({ plugins, diagnostics }));
}

main();
