async function main() {
  const panel = await ui.createWindow({
    id: "profileForm",
    kind: "normal",
    title: "Clawdesk Form",
    bounds: { x: 220, y: 180, width: 540, height: 300 },
    content: {
      html: `<!doctype html><html><head><meta charset="utf-8"></head><body>
        <header id="heading"><strong>Controller-backed form</strong></header>
        <main id="form">
          <label id="nameLabel" for="name">Name</label>
          <input id="name" type="text" value="Ada">
          <label id="modeLabel" for="mode">Mode</label>
          <select id="mode"><option value="safe">Safe</option><option value="fast">Fast</option></select>
          <label id="notifyLabel" for="notify">Notify</label>
          <input id="notify" type="checkbox" role="switch">
          <p id="result">Waiting for submission</p>
          <button id="submit">Submit</button>
          <button id="close">Close</button>
        </main>
      </body></html>`,
      css: `html,body{margin:0;background:#f8fafc;color:#0f172a;font:14px -apple-system,sans-serif}header{padding:18px 22px;background:#e2e8f0}
        main{padding:22px;display:grid;grid-template-columns:90px 1fr;gap:12px;align-items:center}input,select,button{font:inherit;padding:8px 10px}
        #result,#submit,#close{grid-column:2}button{border:0;border-radius:7px;background:#2563eb;color:white}#close{background:#475569}`
    }
  });

  panel.control("submit").on("click", async event => {
    const name = await panel.control("name").getState();
    const mode = await panel.control("mode").getState();
    const notify = await panel.control("notify").getState();
    const form = { name: name.value, mode: mode.value, notify: notify.checked, sequence: event.sequence };
    console.log("FORM_SUBMIT=" + JSON.stringify(form));
    await panel.control("result").update({ text: "Submitted: " + JSON.stringify(form) });
  });
  panel.control("close").on("click", () => panel.close());

  await panel.show();
  await panel.waitUntilClosed();
}

await main();
