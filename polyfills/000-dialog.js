// Dialog is a host-owned, asynchronous modal API. These aliases deliberately
// contain no option validation or UI implementation: all behavior is delegated
// to the single native Dialog binding.
(() => {
  globalThis.alert = value => Dialog.alert(value);
  globalThis.confirm = value => Dialog.confirm(value);
  globalThis.prompt = value => Dialog.prompt(value);
})();
