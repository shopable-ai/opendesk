async function main() {
  const toolbar = await ui.createWindow({
    id: "recordingToolbar",
    kind: "floating",
    title: "Clawdesk Recording Toolbar",
    bounds: { x: 260, y: 90, width: 610, height: 150 },
    alwaysOnTop: true,
    draggable: true,
    content: {
      html: `<!doctype html><html><head><meta charset="utf-8"></head><body>
        <div id="drag" data-clawdesk-drag><strong>Recording</strong><span id="state">Stopped</span></div>
        <main id="actions">
          <button id="start">Start</button><button id="pause">Pause</button><button id="stop">Stop</button>
          <button id="capture">Capture</button><button id="close">Close</button>
        </main>
      </body></html>`,
      css: `html,body{margin:0;background:#18181b;color:#fafafa;font:13px -apple-system,sans-serif}#drag{height:48px;padding:0 16px;display:flex;align-items:center;justify-content:space-between;background:#27272a;user-select:none}
        #state{color:#fda4af}main{padding:16px}button{margin-right:8px;padding:8px 12px;border:1px solid #52525b;border-radius:7px;background:#3f3f46;color:white}`
    }
  });

  const setState = text => toolbar.control("state").update({ text });
  toolbar.control("start").on("click", () => setState("Recording"));
  toolbar.control("pause").on("click", () => setState("Paused"));
  toolbar.control("stop").on("click", () => setState("Stopped"));
  toolbar.control("capture").on("click", async () => {
    const directory = File.join(File.cwd(), ".runtime", "examples", "custom-ui");
    File.ensureDir(directory);
    const path = File.join(directory, "toolbar-capture.png");
    await page.screenshot({ target: "screen", path, returnType: "path" });
    console.log("CAPTURED=" + path);
    await setState("Captured");
  });
  toolbar.control("close").on("click", () => toolbar.close());

  await toolbar.show();
  await toolbar.waitUntilClosed();
}

await main();
