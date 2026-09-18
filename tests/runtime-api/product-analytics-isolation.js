'use strict';

const privateGlobals = [
  'OpenDeskProductAnalytics',
  'OpenDeskProductAnalyticsIntegration',
  'OpenDeskAnalyticsSettings',
  'OpenDeskSettings',
];
for (const name of privateGlobals) {
  if (typeof globalThis[name] !== 'undefined') {
    throw new Error(`third-party Runtime unexpectedly exposes ${name}`);
  }
}

const privateEnvironment = [
  'OPENDESK_APP_ANALYTICS_TOKEN',
  'OPENDESK_APP_ANALYTICS_ENABLED',
  'OPENDESK_APP_ANALYTICS_CAPTURE_ENABLED',
  'OPENDESK_APP_ANALYTICS_RUN_SOURCE',
  'OPENDESK_ANALYTICS_DEBUG',
];
const environment = Execution && Execution.env && typeof Execution.env === 'object' ? Execution.env : {};
for (const name of privateEnvironment) {
  if (Object.prototype.hasOwnProperty.call(environment, name)) {
    throw new Error(`third-party Runtime unexpectedly exposes ${name}`);
  }
}

console.log('PRODUCT_ANALYTICS_THIRD_PARTY_ISOLATION_OK');
