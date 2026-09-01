// Static compatibility entry. New simple toolbars should construct their own
// FloatingWindow instance; complex HTML/CSS belongs in ui.createWindow().

async function main() {
  const capabilities = ui.getCapabilities();
  if (!capabilities.enabled || !capabilities.available || typeof FloatingWindow === "undefined") {
    throw new Error("FloatingWindow requires an enabled and available Custom UI capability");
  }

  // The default static instance starts empty. Declaration order is visual order.
  const actions = [
    { id: "start", label: "Start", icon: "play.fill" },
    { id: "pause", label: "Pause", icon: "pause.fill" },
    { id: "stop", label: "Stop", icon: "stop.fill" },
    { id: "settings", label: "Settings", icon: "gearshape.fill" },
    { id: "send", label: "Send", icon: "paperplane.fill" },
    { id: "timer", label: "Timer", icon: "timer" },
  ];
  for (const action of actions) {
    FloatingWindow.addButton(action.id, action.label, action.icon);
    FloatingWindow.onButtonClick(action.id, event => {
      console.log(action.id, JSON.stringify({ event, system: System.getSystemInfo() }));
    });
  }

  await FloatingWindow.setPosition(100, 100);
  await FloatingWindow.setAlwaysOnTop(true);
  const shown = await FloatingWindow.show();
  console.log("AUTO_SIZED_BOUNDS=" + JSON.stringify(shown.bounds));

  // Deprecated alias: run() returns the same close Promise as waitUntilClosed().
  await FloatingWindow.run();
}

await main();
