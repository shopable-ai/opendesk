async function main() {
  const capabilities = ui.getCapabilities();
  if (!capabilities.enabled || !capabilities.available) {
    throw new Error("Custom UI is unavailable: " + (capabilities.reason || "not enabled"));
  }

  const panel = await ui.createWindow({
    id: "systemPanel",
    kind: "floating",
    // The HTML header is the visible title, so leave the native title blank
    // instead of showing the same name twice.
    title: "",
    position: {
      mode: "anchor",
      // The initial summary may use two lines; reserve enough room for the
      // actions rather than clipping them at the lower edge of the panel.
      size: { width: 520, height: 410 },
      horizontal: "right",
      vertical: "top",
      margin: 24,
      display: "active"
    },
    alwaysOnTop: true,
    draggable: true,
    theme: "dark",
    content: {
      html: `<!doctype html><html><head><meta charset="utf-8"></head><body>
        <header id="dragbar" data-clawdesk-drag>
          <div class="brand">
            <span class="signal"></span>
            <div class="brand-copy">
              <span class="eyebrow">CLAWDESK</span>
              <strong id="title">System pulse</strong>
            </div>
          </div>
          <span id="status" class="status is-ready">Ready</span>
        </header>
        <main id="content">
          <section class="hero">
            <span class="eyebrow">LOCAL RUNTIME</span>
            <p id="summary" class="summary">A clean system snapshot, exactly when you need it.</p>
            <p id="details" class="details">Refresh reads local Runtime data without changing your machine.</p>
          </section>
          <section class="metric-grid">
            <div class="metric-card">
              <span class="metric-label">HOST</span>
              <strong id="hostname" class="metric-value">Waiting for refresh</strong>
            </div>
            <div class="metric-card">
              <span class="metric-label">SYSTEM</span>
              <strong id="platform" class="metric-value">—</strong>
            </div>
            <div class="metric-card">
              <span class="metric-label">MEMORY</span>
              <strong id="memory" class="metric-value">—</strong>
            </div>
          </section>
          <footer class="actions">
            <button id="refresh">Refresh snapshot</button>
            <button id="close" class="close-button">Close</button>
          </footer>
        </main>
      </body></html>`,
      css: `html,body{margin:0;min-height:100%;background:#0b1020;color:#f8fafc;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        body{background:radial-gradient(circle at 91% 0%,#243b67 0%,#111a30 34%,#0b1020 74%)}
        #dragbar{height:74px;padding:0 22px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(148,163,184,.18);background:rgba(10,16,32,.78);user-select:none}
        .brand{display:flex;align-items:center;gap:11px}.signal{width:10px;height:10px;border-radius:50%;background:#5eead4;box-shadow:0 0 0 5px rgba(94,234,212,.12),0 0 18px rgba(94,234,212,.65)}
        .brand-copy{display:grid;gap:3px}.eyebrow,.metric-label{color:#94a3b8;font-size:10px;font-weight:700;letter-spacing:.12em}.brand-copy strong{font-size:18px;letter-spacing:-.02em}
        .status{padding:6px 10px;border:1px solid transparent;border-radius:999px;font-size:12px;font-weight:700}.status.is-ready{border-color:rgba(94,234,212,.22);background:rgba(45,212,191,.12);color:#99f6e4}.status.is-loading{border-color:rgba(147,197,253,.24);background:rgba(59,130,246,.16);color:#bfdbfe}.status.is-error{border-color:rgba(253,164,175,.24);background:rgba(244,63,94,.14);color:#fecdd3}
        #content{padding:22px}.hero{padding-bottom:18px}.summary{max-width:420px;margin:7px 0 6px;color:#f8fafc;font-size:21px;font-weight:650;line-height:1.25;letter-spacing:-.035em}.details{margin:0;color:#a5b4cf;line-height:1.55}
        .metric-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.metric-card{min-width:0;padding:13px 12px;border:1px solid rgba(148,163,184,.16);border-radius:12px;background:rgba(15,23,42,.58)}
        .metric-label{display:block;margin-bottom:7px}.metric-value{display:block;overflow:hidden;color:#e2e8f0;font-size:13px;line-height:1.3;text-overflow:ellipsis;white-space:nowrap}
        .actions{display:flex;align-items:center;justify-content:space-between;margin-top:20px}button{padding:10px 13px;border:1px solid transparent;border-radius:9px;background:#3b82f6;color:#fff;font:inherit;font-weight:700}button:disabled{opacity:.7}.close-button{border-color:rgba(148,163,184,.25);background:rgba(15,23,42,.42);color:#cbd5e1}`
    }
  });

  const refresh = panel.control("refresh");
  const status = panel.control("status");
  let refreshing = false;

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) return "Unavailable";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    return (size >= 10 ? size.toFixed(0) : size.toFixed(1)) + " " + units[unit];
  }

  function clockTime() {
    const now = new Date();
    return String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  }

  async function setStatus(text, state) {
    await status.update({ text, classes: ["status", "is-" + state] });
  }

  async function renderSnapshot(info) {
    const platform = [info.platform || info.os, info.platformVersion].filter(Boolean).join(" ") || "Unavailable";
    const used = formatBytes(info.usedMemory);
    const total = formatBytes(info.totalMemory);
    const memoryUsage = Number(info.memoryUsage);
    const memory = Number.isFinite(memoryUsage) ? used + " · " + Math.round(memoryUsage) + "%" : used + " / " + total;
    const cpu = [info.cpuCores ? info.cpuCores + "-core CPU" : "CPU details unavailable", info.cpuModel].filter(Boolean).join(" · ");

    await Promise.all([
      panel.control("summary").update({ text: "Your system is ready for the next task." }),
      panel.control("details").update({ text: "Updated at " + clockTime() + " · " + cpu }),
      panel.control("hostname").update({ text: info.hostname || "Unnamed host" }),
      panel.control("platform").update({ text: platform }),
      panel.control("memory").update({ text: memory })
    ]);
  }

  refresh.on("click", async () => {
    if (refreshing) return;
    refreshing = true;
    await Promise.all([
      refresh.update({ text: "Refreshing…", busy: true, disabled: true }),
      setStatus("Reading", "loading")
    ]);

    try {
      const info = System.getSystemInfo();
      console.log("SYSTEM_INFO=" + JSON.stringify(info));
      await renderSnapshot(info);
      await setStatus("Updated", "ready");
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      console.error("SYSTEM_INFO_FAILED=" + message);
      await Promise.all([
        panel.control("summary").update({ text: "System information could not be refreshed." }),
        panel.control("details").update({ text: "Check the Runtime log, then try again." }),
        setStatus("Retry", "error")
      ]);
    } finally {
      refreshing = false;
      await refresh.update({ text: "Refresh snapshot", busy: false, disabled: false });
    }
  });
  panel.control("close").on("click", () => panel.close());

  await panel.show();
  await panel.waitUntilClosed();
}

await main();
