const hello = NativeExtensions.userBasic.hello({ name: "Current User" });
console.log("PLUGIN_USER_ROOT_RESULT " + JSON.stringify({ hello, listed: NativeExtensions.list() }));
