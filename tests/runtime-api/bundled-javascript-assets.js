// Packaging smoke: run from a directory outside the source checkout with the
// signed bundle's executable and an absolute path to this script. No OS prompts.
'use strict';
if (typeof axios !== 'object' || typeof axios.request !== 'function') {
  throw new Error('Bundled polyfills did not provide axios');
}
if (typeof _ !== 'function' || typeof _.groupBy !== 'function') {
  throw new Error('Bundled JavaScript libraries did not provide Lodash');
}
console.log('BUNDLED_JAVASCRIPT_ASSETS_OK');
