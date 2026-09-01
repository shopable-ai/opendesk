async function main() {
  const capabilities = ui.getCapabilities();
  if (!capabilities.enabled || !capabilities.available) {
    throw new Error("Custom UI is unavailable: " + (capabilities.reason || "not enabled"));
  }

  const panel = await ui.createWindow({
    id: "systemPanel",
    kind: "floating",
    title: "Clawdesk System Panel",
    bounds: { x: 160, y: 160, width: 520, height: 240 },
    alwaysOnTop: true,
    draggable: true,
    content: {
      html: `<!doctype html><html><head><meta charset="utf-8"></head><body>
        <header id="dragbar" data-clawdesk-drag>
          <strong id="title">System panel</strong>
          <span id="status">Ready</span>
        </header>
        <main id="content">
          <p id="summary">Use the controller to read a Runtime business API.</p>
          <button id="refresh">Refresh system info</button>
          <button id="close">Close</button>
        </main>
      </body></html>`,
      css: `html,body{margin:0;background:#111827;color:#f8fafc;font:14px -apple-system,sans-serif}
        header{height:58px;padding:0 18px;display:flex;align-items:center;justify-content:space-between;background:#1e293b;user-select:none}
        #status{color:#86efac}main{padding:22px 18px}button{margin-right:10px;padding:9px 13px;border:0;border-radius:8px;background:#2563eb;color:white}`
    }
  });

  panel.control("refresh").on("click", async () => {
    const info = System.getSystemInfo();
    console.log("SYSTEM_INFO=" + JSON.stringify(info));
    await panel.control("summary").update({ text: JSON.stringify(info) });
    await panel.control("status").update({ text: "Updated" });
  });
  panel.control("close").on("click", () => panel.close());

  await panel.show();
  await panel.waitUntilClosed();
}

await main();
