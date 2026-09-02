// Run from the repository root:
// ./dist/opendesk -ui -script examples/custom-ui/recording-console.js -console-mode script -log-dir .runtime/examples/custom-ui/recording-console
//
// The browser preview serves the same file-backed HTML/CSS pair used by the
// constrained Custom UI host. JavaScript owns all state, callbacks and Runtime
// API calls. Recorder session creation remains MCP-only: this panel never
// starts a desktop recording.

async function main() {
  // Floating windows retain native chrome, so these frame heights include the
  // title bar in addition to the ApowerREC-inspired HTML layouts.
  const trayCompactWidth = 895;
  const trayCompactHeight = 272;
  const trayExpandedHeight = 426;
  // The WeChat crop is slightly enlarged rather than a fixed 2x capture.
  // Normalize it to standard compact controls (about 22pt icons and 24pt time
  // text), then add the native 28pt titlebar to the 66pt content height.
  const trayRunningWidth = 606;
  const trayRunningHeight = 94;
  // The compact tray is kept visible when the separate workbench opens. Set
  // this to true for products that treat the workbench as a replacement view.
  const hideTrayWhenWorkbenchOpens = false;

  const tray = await ui.createWindow({
    id: "recordingTray",
    kind: "floating",
    // The native titlebar supplies the product title; its height is already
    // included in all layout bounds, matching the reference composition.
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

  // A user can close the independent workbench using native window chrome.
  // Keep its handle replaceable so the compact tray never targets a terminal
  // window, and so the workbench can be opened again on demand.
  let settings = null;
  // Window ids are unique for one Runtime execution, even after close(). Keep
  // the first established id for diagnostics and mint a new internal id only
  // when the user has closed that native workbench.
  let settingsGeneration = 0;

  const model = {
    mode: "full",
    recordingState: "idle",
    quickTool: "",
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
  // The expanded lower panel follows the utility deck in the reference. These
  // are UI intents only: each command is handed off to the product workbench
  // or a future MCP-backed flow rather than invoking Recorder here.
  const quickToolLabels = {
    traySourceFull: "截图",
    traySourceRegion: "聚光灯",
    traySourceWindow: "涂鸦",
    trayOptionSystemAudio: "排除窗口",
    trayOptionMicrophone: "添加水印",
    trayOptionCamera: "提词器",
    trayOptionMousePointer: "按键显示",
    trayQuickSchedule: "定时录制"
  };

  function isClosedWindowError(error) {
    const code = error && error.code ? String(error.code) : "";
    const message = error && error.message ? String(error.message) : String(error || "");
    return code === "NOT_FOUND" || code === "INVALID_STATE" || /window.*(?:not found|does not exist|closed)/i.test(message);
  }

  async function setWorkspaceActive(active) {
    try {
      await tray.control("trayWorkspace").update({
        classes: ["tray-footer-button", ...(active ? ["is-active"] : [])]
      });
    } catch (error) {
      // Tray shutdown can race the workbench close event. There is no live
      // control left to update in that terminal state.
      if (!isClosedWindowError(error)) throw error;
    }
  }

  async function withSettings(update) {
    const panel = settings;
    if (!panel) return false;
    try {
      await update(panel);
      return true;
    } catch (error) {
      if (!isClosedWindowError(error)) throw error;
      if (settings === panel) {
        settings = null;
        settingsVisible = false;
        await setWorkspaceActive(false);
      }
      return false;
    }
  }

  async function setText(id, text) {
    await withSettings(panel => panel.control(id).update({ text }));
  }

  async function renderMode() {
    await withSettings(panel => Promise.all(modes.map(mode =>
      panel.control("mode" + mode[0].toUpperCase() + mode.slice(1)).update({
        classes: ["mode-button", ...(model.mode === mode ? ["is-selected"] : [])]
      })
    )));
    await setText("captureTarget", modeLabels[model.mode] + "录制");
    await Promise.all([
      tray.control("trayMode").update({ text: modeLabels[model.mode] }),
      tray.control("trayRunningTarget").update({
        classes: ["tray-running-button", ...(model.mode === "region" ? ["is-active"] : [])]
      }),
      tray.control("trayRunningWindow").update({
        classes: ["tray-running-button", ...(model.mode === "window" ? ["is-active"] : [])]
      })
    ]);
  }

  async function renderOptions() {
    const updates = [
      withSettings(panel => Promise.all(Object.keys(model.options).map(option =>
        panel.control(option).update({ checked: model.options[option] })
      ))),
      tray.control("trayAudio").update({ text: model.options.systemAudio ? "声音开" : "声音关" }),
      tray.control("trayCamera").update({ text: model.options.camera ? "摄像头开" : "摄像头关" }),
      tray.control("trayRunningCamera").update({
        classes: ["tray-running-button", ...(model.options.camera ? ["is-active"] : [])]
      })
    ];
    await Promise.all(updates);
  }

  async function renderQuickTool() {
    await Promise.all([
      ...Object.keys(quickToolLabels).map(id => tray.control(id).update({
        classes: ["expanded-quick-tool", ...(model.quickTool === id ? ["is-active"] : [])]
      })),
      tray.control("trayRunningDraw").update({
        classes: ["tray-running-button", ...(model.quickTool === "traySourceWindow" ? ["is-active"] : [])]
      })
    ]);
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
    await withSettings(panel => panel.control("recordingState").update({
      classes: ["recording-state", active ? "is-recording" : paused ? "is-paused" : ""]
    }));
    await tray.control("trayState").update({
      text: labels[model.recordingState],
      classes: ["tray-state", active ? "is-recording" : paused ? "is-paused" : ""]
    });
    const running = active || paused;
    await tray.control("trayShell").update({
      classes: ["tray-shell", running ? "is-running" : "is-idle", ...(paused ? ["is-paused"] : [])]
    });
    await Promise.all([
      withSettings(panel => panel.control("start").update({ disabled: active || paused })),
      tray.control("trayStart").update({ disabled: active || paused }),
      withSettings(panel => panel.control("pause").update({ disabled: model.recordingState === "idle", text: paused ? "继续" : "暂停" })),
      tray.control("trayPause").update({ disabled: model.recordingState === "idle", text: paused ? "继续" : "暂停" }),
      withSettings(panel => panel.control("stop").update({ disabled: model.recordingState === "idle" })),
      tray.control("trayStop").update({ disabled: model.recordingState === "idle" })
    ]);
    const trayState = await tray.getState();
    const nextBounds = running
      ? { ...trayState.bounds, width: trayRunningWidth, height: trayRunningHeight }
      : { ...trayState.bounds, width: trayCompactWidth, height: trayExpanded ? trayExpandedHeight : trayCompactHeight };
    if (trayState.bounds.width !== nextBounds.width || trayState.bounds.height !== nextBounds.height) {
      await tray.setBounds(nextBounds);
    }
  }

  function intent(action) {
    const value = {
      action,
      mode: model.mode,
      frameRate: model.frameRate,
      quality: model.quality,
      quickTool: model.quickTool,
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
      quickTool: model.quickTool,
      snapshots: model.snapshots
    }));
  }

  async function requestStart() {
    if (trayExpanded) await setTrayExpanded(false);
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

  function bindSettingsControls(panel) {
    for (const mode of modes) {
      panel.control("mode" + mode[0].toUpperCase() + mode.slice(1)).on("click", async () => {
        model.mode = mode;
        await renderMode();
        await setText("recordingDetail", "已选择" + modeLabels[mode] + "。录制会话仍需通过 MCP 创建。");
        intent("select-mode");
      });
    }
    for (const option of Object.keys(model.options)) {
      panel.control(option).on("change", async event => {
        model.options[option] = !!event.checked;
        await renderOptions();
        await setText("recordingDetail", "已更新录制选项，等待 MCP 会话。");
        intent("update-option");
      });
    }
    panel.control("frameRate").on("change", async event => {
      model.frameRate = String(event.value);
      await tray.control("trayFrameRate").update({ value: model.frameRate });
      await setText("recordingDetail", "帧率设为 " + model.frameRate + " FPS。");
      intent("update-frame-rate");
    });
    panel.control("quality").on("change", async event => {
      model.quality = String(event.value);
      await tray.control("trayQuality").update({ value: model.quality });
      await setText("recordingDetail", "画质设为 " + model.quality + "。");
      intent("update-quality");
    });
    panel.control("collapse").on("click", hideSettingsAndRestoreTray);
    panel.control("start").on("click", requestStart);
    panel.control("pause").on("click", togglePause);
    panel.control("capture").on("click", captureSnapshot);
    panel.control("stop").on("click", requestStop);
    panel.control("library").on("click", async () => {
      await setText("recordingDetail", "录制产物位于 .runtime/recordings/<session-id>/；由 MCP Recorder 管理。");
      intent("open-library");
    });
    // Close only this secondary workbench. The tray remains a live controller.
    panel.control("close").on("click", hideSettingsAndRestoreTray);
  }

  async function createSettingsWindow() {
    settingsGeneration += 1;
    const windowId = settingsGeneration === 1
      ? "recordingSettings"
      : "recordingSettings-" + settingsGeneration;
    const panel = await ui.createWindow({
      id: windowId,
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
    panel.on("close", async () => {
      if (settings !== panel) return;
      settings = null;
      settingsVisible = false;
      await setWorkspaceActive(false);
    });
    bindSettingsControls(panel);
    settings = panel;
    return panel;
  }

  async function setSettingsVisible(visible) {
    if (visible) {
      const created = !settings;
      if (created) await createSettingsWindow();
      const shown = await withSettings(panel => panel.show());
      if (!shown) return setSettingsVisible(true);
      settingsVisible = true;
      await setWorkspaceActive(true);
      if (created) {
        await renderMode();
        await renderOptions();
        await renderState();
      }
      return;
    }
    if (settings && settingsVisible) await withSettings(panel => panel.hide());
    settingsVisible = false;
    await setWorkspaceActive(false);
  }

  async function hideSettingsAndRestoreTray() {
    await setSettingsVisible(false);
    if (hideTrayWhenWorkbenchOpens) await tray.show();
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

  async function activateQuickTool(id) {
    model.quickTool = id;
    await renderQuickTool();
    if (id === "traySourceFull") {
      await captureSnapshot();
    } else {
      await setText("recordingDetail", quickToolLabels[id] + "已就绪；请在独立工作台中完成设置，录制会话仍只由 MCP 创建。");
    }
    intent("open-quick-tool");
    trayAction("open-quick-tool");
  }

  for (const id of Object.keys(quickToolLabels)) {
    tray.control(id).on("click", async () => activateQuickTool(id));
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

  tray.control("trayRunningTarget").on("click", async () => {
    model.mode = "region";
    await renderMode();
    intent("select-mode");
    trayAction("select-running-region");
  });

  tray.control("trayRunningCamera").on("click", async () => {
    model.options.camera = !model.options.camera;
    await renderOptions();
    intent("toggle-camera");
    trayAction("toggle-running-camera");
  });

  tray.control("trayRunningDraw").on("click", async () => {
    await activateQuickTool("traySourceWindow");
  });

  tray.control("trayRunningWindow").on("click", async () => {
    model.mode = "window";
    await renderMode();
    intent("select-mode");
    trayAction("select-running-window");
  });

  tray.control("trayFrameRate").on("change", async event => {
    model.frameRate = String(event.value);
    await withSettings(panel => panel.control("frameRate").update({ value: model.frameRate }));
    await setText("recordingDetail", "帧率设为 " + model.frameRate + " FPS。");
    intent("update-frame-rate");
    trayAction("update-expanded-frame-rate");
  });

  tray.control("trayQuality").on("change", async event => {
    model.quality = String(event.value);
    await withSettings(panel => panel.control("quality").update({ value: model.quality }));
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

  tray.control("trayStart").on("click", async () => {
    await requestStart();
    trayAction("start");
  });
  tray.control("trayPause").on("click", async () => {
    await togglePause();
    trayAction(model.recordingState === "paused" ? "pause" : "resume");
  });
  tray.control("trayCapture").on("click", async () => {
    await captureSnapshot();
    trayAction("capture");
  });
  tray.control("trayStop").on("click", async () => {
    await requestStop();
    trayAction("stop");
  });

  async function closeAll() {
    await withSettings(panel => panel.close());
    await tray.close();
  }
  tray.control("trayClose").on("click", async () => {
    trayAction("close");
    await closeAll();
  });

  await createSettingsWindow();
  await renderMode();
  await renderOptions();
  await renderQuickTool();
  await renderState();
  await tray.show();
  await tray.waitUntilClosed();
}

await main();
