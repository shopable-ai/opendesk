// Run from the repository root:
// ./dist/opendesk -ui -script examples/custom-ui/recording-console.js -console-mode script -log-dir .runtime/examples/custom-ui/recording-console
//
// The browser preview serves the same file-backed HTML/CSS pair used by the
// constrained Native UI host. JavaScript owns all state, callbacks and Runtime
// API calls. Recorder session creation remains MCP-only: this panel never
// starts a desktop recording.

async function main() {
  // Floating windows retain native chrome, so these frame heights include the
  // title bar in addition to the ApowerREC-inspired HTML layouts.
  const trayCompactHeight = 272;
  const trayExpandedHeight = 450;
  // The compact tray is kept visible when the separate workbench opens. Set
  // this to true for products that treat the workbench as a replacement view.
  const hideTrayWhenWorkbenchOpens = false;

  const tray = await ui.createWindow({
    id: "recordingTray",
    kind: "floating",
    // The native titlebar supplies the product title; its height is already
    // included in both bounds below, matching the reference composition.
    title: "OpenDesk 录屏",
    bounds: { x: 180, y: 130, width: 895, height: trayCompactHeight },
    alwaysOnTop: true,
    draggable: true,
    theme: "dark",
    content: {
      html: "./recording-console/tray.html",
      cssFile: "./recording-console/tray.css"
    }
  });

  const settings = await ui.createWindow({
    id: "recordingSettings",
    kind: "floating",
    title: "",
    bounds: { x: 180, y: 290, width: 860, height: 610 },
    alwaysOnTop: true,
    draggable: true,
    theme: "dark",
    content: {
      html: "./recording-console/recorder.html",
      cssFile: "./recording-console/recorder.css"
    }
  });

  const model = {
    mode: "full",
    recordingState: "idle",
    snapshots: 0,
    options: { systemAudio: true, microphone: true, camera: false, mousePointer: true },
    frameRate: "60",
    quality: "high"
  };

  let settingsVisible = false;
  let trayExpanded = false;

  const modes = ["full", "region", "window"];
  const modeLabels = { full: "全屏", region: "区域", window: "窗口" };
  const optionLabels = {
    systemAudio: "系统声音",
    microphone: "麦克风",
    camera: "摄像头",
    mousePointer: "显示鼠标"
  };

  async function setText(id, text) {
    await settings.control(id).update({ text });
  }

  async function renderMode() {
    for (const mode of modes) {
      await settings.control("mode" + mode[0].toUpperCase() + mode.slice(1)).update({
        classes: ["mode-button", ...(model.mode === mode ? ["is-selected"] : [])]
      });
      await tray.control("traySource" + mode[0].toUpperCase() + mode.slice(1)).update({
        classes: ["expanded-source", ...(model.mode === mode ? ["is-selected"] : [])]
      });
    }
    await setText("captureTarget", modeLabels[model.mode] + "录制");
    await tray.control("trayMode").update({ text: modeLabels[model.mode] });
  }

  async function renderOptions() {
    const updates = [];
    for (const option of Object.keys(model.options)) {
      const enabled = model.options[option];
      const controlSuffix = option[0].toUpperCase() + option.slice(1);
      updates.push(
        settings.control(option).update({ checked: enabled }),
        tray.control("trayOption" + controlSuffix).update({
          text: optionLabels[option] + "：" + (enabled ? "开" : "关"),
          classes: ["expanded-option", ...(enabled ? ["is-enabled"] : [])]
        })
      );
    }
    updates.push(
      tray.control("trayAudio").update({ text: model.options.systemAudio ? "声音开" : "声音关" }),
      tray.control("trayCamera").update({ text: model.options.camera ? "摄像头开" : "摄像头关" })
    );
    await Promise.all(updates);
  }

  async function renderState() {
    const active = model.recordingState === "recording";
    const paused = model.recordingState === "paused";
    const labels = {
      idle: "待命",
      recording: "录制中",
      paused: "已暂停"
    };
    await setText("recordingState", labels[model.recordingState]);
    await settings.control("recordingState").update({
      classes: ["recording-state", active ? "is-recording" : paused ? "is-paused" : ""]
    });
    await tray.control("trayState").update({
      text: labels[model.recordingState],
      classes: ["tray-state", active ? "is-recording" : paused ? "is-paused" : ""]
    });
    await Promise.all([
      settings.control("start").update({ disabled: active || paused }),
      tray.control("trayStart").update({ disabled: active || paused }),
      settings.control("pause").update({ disabled: model.recordingState === "idle", text: paused ? "继续" : "暂停" }),
      tray.control("trayPause").update({ disabled: model.recordingState === "idle", text: paused ? "继续" : "暂停" }),
      settings.control("stop").update({ disabled: model.recordingState === "idle" }),
      tray.control("trayStop").update({ disabled: model.recordingState === "idle" })
    ]);
  }

  function intent(action) {
    const value = {
      action,
      mode: model.mode,
      frameRate: model.frameRate,
      quality: model.quality,
      options: model.options
    };
    console.log("RECORDER_UI_INTENT=" + JSON.stringify(value));
    return value;
  }

  // Keep tray interactions easy to inspect from the command line.  These are
  // UI-only records: they never create, pause, or stop a Recorder session.
  function trayAction(action) {
    console.log("RECORDER_TRAY_ACTION=" + JSON.stringify({
      action,
      mode: model.mode,
      recordingState: model.recordingState,
      systemAudio: model.options.systemAudio,
      trayExpanded,
      settingsVisible,
      snapshots: model.snapshots
    }));
  }

  for (const mode of modes) {
    settings.control("mode" + mode[0].toUpperCase() + mode.slice(1)).on("click", async () => {
      model.mode = mode;
      await renderMode();
      await setText("recordingDetail", "已选择" + modeLabels[mode] + "。录制会话仍需通过 MCP 创建。");
      intent("select-mode");
    });
  }

  for (const option of Object.keys(model.options)) {
    settings.control(option).on("change", async event => {
      model.options[option] = !!event.checked;
      await renderOptions();
      await setText("recordingDetail", "已更新录制选项，等待 MCP 会话。");
      intent("update-option");
    });
  }

  settings.control("frameRate").on("change", async event => {
    model.frameRate = String(event.value);
    await tray.control("trayFrameRate").update({ value: model.frameRate });
    await setText("recordingDetail", "帧率设为 " + model.frameRate + " FPS。");
    intent("update-frame-rate");
  });

  settings.control("quality").on("change", async event => {
    model.quality = String(event.value);
    await tray.control("trayQuality").update({ value: model.quality });
    await setText("recordingDetail", "画质设为 " + model.quality + "。");
    intent("update-quality");
  });

  async function requestStart() {
    model.recordingState = "recording";
    await renderState();
    await setText("recordingDetail", "录制参数已就绪。请使用 tm_recorder_start 创建受验证的 MCP 会话。");
    intent("request-start");
  }

  async function togglePause() {
    model.recordingState = model.recordingState === "paused" ? "recording" : "paused";
    await renderState();
    await setText("recordingDetail", model.recordingState === "paused" ? "UI 已暂停；MCP 会话状态以 Recorder manifest 为准。" : "UI 已继续；MCP 会话状态以 Recorder manifest 为准。");
    intent("toggle-pause");
  }

  async function captureSnapshot() {
    try {
      const directory = File.join(File.cwd(), ".runtime", "examples", "custom-ui", "recording-console");
      await File.ensureDir(directory);
      const path = File.join(directory, "snapshot-" + Date.now() + ".png");
      const result = await Screen.screenshot({ target: "screen", path, returnType: "object" });
      model.snapshots += 1;
      await setText("snapshotCount", model.snapshots + " 张截图");
      await setText("recordingDetail", "截图已保存到 .runtime/examples/custom-ui/recording-console。");
      console.log("RECORDER_UI_SNAPSHOT=" + JSON.stringify({ path: result.path, sizeBytes: result.sizeBytes }));
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      console.error("RECORDER_UI_SNAPSHOT_FAILED=" + message);
      await setText("recordingDetail", "截图失败：请检查 Screen Recording 权限。");
    }
  }

  async function requestStop() {
    model.recordingState = "idle";
    await renderState();
    await setText("recordingDetail", "UI 已复位。实际会话应使用 tm_recorder_stop 结束并保留 manifest。");
    intent("request-stop");
  }

  async function setSettingsVisible(visible) {
    if (visible === settingsVisible) return;
    settingsVisible = visible;
    if (visible) await settings.show();
    else await settings.hide();
  }

  // Expand in place by default: keep the tray's current origin so a dragged
  // floating panel grows downward instead of jumping back to its initial x/y.
  async function setTrayExpanded(visible) {
    if (visible === trayExpanded) return;
    if (visible) {
      const state = await tray.getState();
      await tray.setBounds({ ...state.bounds, height: trayExpandedHeight });
      await tray.control("trayExpanded").update({ visible: true });
    } else {
      await tray.control("trayExpanded").update({ visible: false });
      const state = await tray.getState();
      await tray.setBounds({ ...state.bounds, height: trayCompactHeight });
    }
    trayExpanded = visible;
    await tray.control("trayExpand").update({ text: visible ? "收起" : "展开" });
  }

  tray.control("trayMode").on("click", async () => {
    const index = (modes.indexOf(model.mode) + 1) % modes.length;
    model.mode = modes[index];
    await renderMode();
    await setText("recordingDetail", "已从小托盘切换到" + modeLabels[model.mode] + "模式。");
    intent("cycle-mode");
    trayAction("cycle-mode");
  });

  tray.control("trayRegion").on("click", async () => {
    model.mode = "region";
    await renderMode();
    await setText("recordingDetail", "已选择区域录制来源。");
    intent("select-mode");
    trayAction("select-region");
  });

  for (const mode of modes) {
    tray.control("traySource" + mode[0].toUpperCase() + mode.slice(1)).on("click", async () => {
      model.mode = mode;
      await renderMode();
      await setText("recordingDetail", "已在展开面板选择" + modeLabels[mode] + "来源。");
      intent("select-mode");
      trayAction("select-expanded-mode");
    });
  }

  tray.control("trayAudio").on("click", async () => {
    model.options.systemAudio = !model.options.systemAudio;
    model.options.microphone = model.options.systemAudio;
    await renderOptions();
    await setText("recordingDetail", "小托盘已同步系统声音和麦克风设置。");
    intent("toggle-audio");
    trayAction("toggle-audio");
  });

  tray.control("trayCamera").on("click", async () => {
    model.options.camera = !model.options.camera;
    await renderOptions();
    await setText("recordingDetail", "已从主控制区切换摄像头设置。");
    intent("toggle-camera");
    trayAction("toggle-camera");
  });

  for (const option of Object.keys(model.options)) {
    const controlID = "trayOption" + option[0].toUpperCase() + option.slice(1);
    tray.control(controlID).on("click", async () => {
      model.options[option] = !model.options[option];
      await renderOptions();
      await setText("recordingDetail", "已在展开面板更新" + optionLabels[option] + "设置。");
      intent("update-option");
      trayAction("toggle-expanded-option");
    });
  }

  tray.control("trayFrameRate").on("change", async event => {
    model.frameRate = String(event.value);
    await settings.control("frameRate").update({ value: model.frameRate });
    await setText("recordingDetail", "帧率设为 " + model.frameRate + " FPS。");
    intent("update-frame-rate");
    trayAction("update-expanded-frame-rate");
  });

  tray.control("trayQuality").on("change", async event => {
    model.quality = String(event.value);
    await settings.control("quality").update({ value: model.quality });
    await setText("recordingDetail", "画质设为 " + model.quality + "。");
    intent("update-quality");
    trayAction("update-expanded-quality");
  });

  tray.control("trayExpand").on("click", async () => {
    const visible = !trayExpanded;
    await setTrayExpanded(visible);
    trayAction(visible ? "expand-in-place" : "collapse-in-place");
  });
  tray.control("trayWorkspace").on("click", async () => {
    await setSettingsVisible(true);
    if (hideTrayWhenWorkbenchOpens) await tray.hide();
    trayAction("open-workbench");
  });
  settings.control("collapse").on("click", async () => {
    await setSettingsVisible(false);
    if (hideTrayWhenWorkbenchOpens) await tray.show();
  });

  settings.control("start").on("click", requestStart);
  tray.control("trayStart").on("click", async () => {
    await requestStart();
    trayAction("start");
  });
  settings.control("pause").on("click", togglePause);
  tray.control("trayPause").on("click", async () => {
    await togglePause();
    trayAction(model.recordingState === "paused" ? "pause" : "resume");
  });
  settings.control("capture").on("click", captureSnapshot);
  tray.control("trayCapture").on("click", async () => {
    await captureSnapshot();
    trayAction("capture");
  });
  settings.control("stop").on("click", requestStop);
  tray.control("trayStop").on("click", async () => {
    await requestStop();
    trayAction("stop");
  });

  settings.control("library").on("click", async () => {
    await setText("recordingDetail", "录制产物位于 .runtime/recordings/<session-id>/；由 MCP Recorder 管理。");
    intent("open-library");
  });
  async function closeAll() {
    await settings.close();
    await tray.close();
  }
  settings.control("close").on("click", closeAll);
  tray.control("trayClose").on("click", async () => {
    trayAction("close");
    await closeAll();
  });

  await renderMode();
  await renderOptions();
  await renderState();
  await tray.show();
  await tray.waitUntilClosed();
}

await main();
