(function installOpenDeskProductAnalytics(global) {
  'use strict';

  const system = global.System;
  const axios = global.axios;
  const endpoint = system && typeof system.getEnv === 'function'
    ? String(system.getEnv('OPENDESK_APP_LOCAL_ENDPOINT') || '').trim()
    : '';
  const token = system && typeof system.getEnv === 'function'
    ? String(system.getEnv('OPENDESK_APP_ANALYTICS_TOKEN') || '').trim()
    : '';

  function getCapabilities() {
    return Object.freeze({
      available: !!endpoint && !!token && !!axios,
      transport: 'app-loopback',
    });
  }

  function ensureAvailable() {
    if (!getCapabilities().available) {
      const error = new Error('OpenDesk Product Analytics is unavailable in this execution');
      error.code = 'PRODUCT_ANALYTICS_UNAVAILABLE';
      throw error;
    }
  }

  async function request(method, path, data) {
    ensureAvailable();
    const response = await axios.request({
      method,
      url: endpoint + path,
      data,
      timeout: 1500,
      headers: {
        'Content-Type': 'application/json',
        'X-OpenDesk-Analytics-Token': token,
      },
    });
    let payload = response && response.data;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch (_) { payload = null; }
    }
    if (!payload || typeof payload !== 'object' || Number(payload.code) !== 0) {
      const error = new Error(payload && payload.message ? String(payload.message) : 'Product Analytics request failed');
      error.code = 'PRODUCT_ANALYTICS_REQUEST_FAILED';
      throw error;
    }
    return payload.data || {};
  }

  async function bestEffort(path, data) {
    try { return await request('POST', path, data); }
    catch (_) { return Object.freeze({accepted: false}); }
  }

  const client = Object.freeze({
    getCapabilities,
    status: () => request('GET', '/api/product/analytics/status'),
    screenViewed: surface => bestEffort('/api/product/analytics/screen', {surface: String(surface || '')}),
    uiAction: (surface, actionId, inputMethod) => bestEffort('/api/product/analytics/action', {
      surface: String(surface || ''),
      actionId: String(actionId || ''),
      inputMethod: String(inputMethod || ''),
    }),
  });

  global.OpenDeskProductAnalytics = client;
})(globalThis);
