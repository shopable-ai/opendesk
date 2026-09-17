(function installOpenDeskSchedulerClient(global) {
  'use strict';

  const system = global.System;
  const axios = global.axios;
  const file = global.File;
  const execution = global.Execution;
  const productPaths = global.OpenDeskProductPaths;
  const endpoint = system && typeof system.getEnv === 'function'
    ? String(system.getEnv('OPENDESK_APP_SCHEDULER_ENDPOINT') || '').trim()
    : '';
  const token = system && typeof system.getEnv === 'function'
    ? String(system.getEnv('OPENDESK_APP_SCHEDULER_TOKEN') || '').trim()
    : '';

  function capabilities() {
    return Object.freeze({
      enabled: !!endpoint && !!token && !!axios,
      available: !!endpoint && !!token && !!axios,
      transport: 'app-loopback',
    });
  }

  function ensureAvailable() {
    const state = capabilities();
    if (!state.available) {
      const error = new Error('OpenDesk App Scheduler is unavailable in this execution');
      error.code = 'APP_SCHEDULER_UNAVAILABLE';
      throw error;
    }
  }

  function publishDiscoveryBridge() {
    if (!endpoint || !token || !file || !productPaths || !productPaths.appDataRoot) return '';
    try {
      const root = file.join(productPaths.appDataRoot, '.runtime', 'scheduler-bridges');
      file.ensureDir(root);
      const rawExecutionID = String(execution && (execution.id || execution.executionId) || 'app');
      const executionID = rawExecutionID.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 96) || 'app';
      const path = file.join(root, `${executionID}.json`);
      const payload = {
        schemaVersion: 1,
        packageId: 'com.opendesk.desktop',
        executionId: rawExecutionID,
        endpoint,
        token,
        publishedAt: new Date().toISOString(),
      };
      // appDataRoot is a private per-user directory. The bridge is intentionally
      // local-only and is never logged or surfaced through Scheduler responses.
      // Stale files are harmless because the external CLI must authenticate and
      // probe every candidate before selecting exactly one live App instance.
      file.write(path, JSON.stringify(payload, null, 2) + '\n');
      return path;
    } catch (error) {
      if (global.console && typeof global.console.warn === 'function') {
        global.console.warn('[SCHEDULER_BRIDGE] publish failed: ' + String(error && error.message || error));
      }
      return '';
    }
  }

  async function request(method, path, data, params) {
    ensureAvailable();
    const response = await axios.request({
      method,
      url: endpoint + path,
      data,
      params,
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'X-OpenDesk-App-Token': token,
      },
    });
    let payload = response && response.data;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (_) {
        payload = null;
      }
    }
    if (!payload || typeof payload !== 'object') {
      const error = new Error('Scheduler returned an invalid response');
      error.code = 'APP_SCHEDULER_INVALID_RESPONSE';
      throw error;
    }
    if (Number(payload.code) !== 0) {
      const error = new Error(String(payload.message || 'Scheduler request failed'));
      error.code = 'APP_SCHEDULER_REQUEST_FAILED';
      throw error;
    }
    return payload.data;
  }

  function encodeID(value) {
    return encodeURIComponent(String(value || '').trim());
  }

  publishDiscoveryBridge();

  const client = Object.freeze({
    getCapabilities: capabilities,
    status: () => request('GET', '/api/scheduler/status'),
    listJobs: () => request('GET', '/api/scheduler/jobs'),
    createJob: input => request('POST', '/api/scheduler/jobs', input || {}),
    pause: id => request('POST', `/api/scheduler/jobs/${encodeID(id)}/pause`),
    resume: id => request('POST', `/api/scheduler/jobs/${encodeID(id)}/resume`),
    runNow: id => request('POST', `/api/scheduler/jobs/${encodeID(id)}/run`),
    delete: id => request('DELETE', `/api/scheduler/jobs/${encodeID(id)}`),
    listRuns: (id, limit) => request('GET', `/api/scheduler/jobs/${encodeID(id)}/runs`, undefined, {
      limit: Math.max(1, Math.min(100, Number(limit) || 20)),
    }),
    // Private first-party product lifecycle bridge. These methods are consumed
    // only by the bundled OpenDesk App owner; they are not Runtime API surface.
    productActivity: () => request('GET', '/api/product/activity'),
    acknowledgeProductActivity: () => request('POST', '/api/product/activity/ack', {}),
  });

  global.OpenDeskSchedulerClient = client;
})(globalThis);
