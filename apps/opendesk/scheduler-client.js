(function installOpenDeskSchedulerClient(global) {
  'use strict';

  const system = global.System;
  const axios = global.axios;
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
  });

  global.OpenDeskSchedulerClient = client;
})(globalThis);
