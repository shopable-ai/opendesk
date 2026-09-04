// Run from the repository root:
// ./opendesk -ui -script examples/custom-ui/custom-image-icons.js -console-mode script -log-dir .runtime/examples/custom-ui/custom-image-icons

if (typeof FloatingWindow !== "function") {
  throw new Error("FloatingWindow is unavailable; run this example with -ui on macOS");
}

const toolbar = new FloatingWindow({
  title: "Custom image icons",
  position: {
    mode: "anchor",
    horizontal: "right",
    vertical: "center",
    margin: 16,
    display: "active",
  },
});

toolbar.addButton(
  "spotlight",
  "聚光灯（保留图片原色）",
  { path: "./recording-console/icons/quick-spotlight.png" },
  () => console.log("CUSTOM_IMAGE_ICON_ACTION=spotlight"),
);

toolbar.addButton(
  "doodle",
  "画笔（跟随原生状态着色）",
  {
    path: "./recording-console/icons/quick-doodle.png",
    renderingMode: "template",
  },
  () => console.log("CUSTOM_IMAGE_ICON_ACTION=doodle"),
);

toolbar.addButton("settings", "设置（内置图标）", "gearshape.fill", async () => {
  await toolbar.updateButton("settings", {
    icon: {
      path: "./recording-console/icons/tools.png",
      renderingMode: "template",
    },
  });
  console.log("CUSTOM_IMAGE_ICON_ACTION=settings-updated");
});

const shown = await toolbar.show();
console.log("CUSTOM_IMAGE_ICON_READY=" + JSON.stringify({
  status: shown.status,
  visible: shown.visible,
  bounds: shown.bounds,
}));
await toolbar.waitUntilClosed();
