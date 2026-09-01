const hello = NativeExtensions.goBasic.hello({ name: "Signed App" });
const listed = NativeExtensions.list();
console.log("PLUGIN_APP_CALL_RESULT " + JSON.stringify({ hello, listed }));
