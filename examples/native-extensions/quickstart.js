function main() {
  const hello = NativeExtensions.goBasic.hello({ name: "OpenDesk" });
  const sum = NativeExtensions.goBasic.add({ a: 20, b: 22 });
  console.log(JSON.stringify({ hello, sum }));
}

main();
