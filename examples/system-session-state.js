const capabilities = System.getSessionCapabilities();
console.log("session capabilities", capabilities);

if (capabilities.state.supported) {
  console.log("session state", System.getSessionState());
} else {
  console.log("session state is unsupported on this host");
}
