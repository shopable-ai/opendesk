'use strict';

// This is a deliberately small static guard for the privacy boundary of the
// test helper. It supplements code review and the helper's no-desktop self
// test; the real Chess run remains the one live confirmation.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'capture_window.m'), 'utf8');
const realAppSource = fs.readFileSync(
  path.join(__dirname, '../../../runtime-api/accessibility-real-app-about-macos.js'),
  'utf8',
);

assert.match(source, /CGWindowListCopyWindowInfo\(kCGWindowListOptionIncludingWindow, request->window_id\)/);
assert.match(source, /CGPreflightScreenCaptureAccess\(\)/);
assert.match(source, /accessibility-native-fixture-capture-v1/);
assert.match(source, /accessibility-real-app-chess-about-v1/);
assert.match(source, /com\.apple\.Chess/);
assert.match(source, /checked_profile_application\(&request, &profile\)/);
assert.match(source, /proc_pidpath\(\(int\)request->pid, process_path, sizeof\(process_path\)\)/);
assert.match(source, /strcmp\(process_path, profile->executable_path\) != 0/);
assert.match(source, /permitted_output_path\(&request, &profile\)/);
assert.match(source, /observed_pid == \(int64_t\)request->pid/);
assert.match(source, /observed_window_id == \(int64_t\)request->window_id/);
assert.match(source, /observed_layer == 0 && on_screen/);
assert.match(source, /sharing_state != kCGWindowSharingNone/);
assert.match(source, /copy_double\(row, kCGWindowAlpha, &alpha\)/);
assert.match(source, /isfinite\(alpha\) && alpha > 0/);
assert.match(source, /bounds_match\(&bounds, request\)/);
assert.match(source, /CGWindowListCreateImage\(\s*CGRectNull,\s*kCGWindowListOptionIncludingWindow,/s);
assert.match(source, /readable_image\(image, &image_info\)/);
assert.match(source, /return observed_alpha != 0 && non_black && color_variation/);
assert.match(source, /opaque_white_image\(image\)/);
assert.match(source, /CGContextSetRGBFillColor\(context, 1\.0, 1\.0, 1\.0, 1\.0\)/);
assert.match(source, /window_receipt pre_capture/);
assert.match(source, /window_receipt post_capture/);
assert.match(source, /write_png_atomically\(opaque_image, request\.output\)/);
assert.match(source, /link\(temporary, path\)/);
assert.doesNotMatch(source, /CGRequestScreenCaptureAccess|screencapture|robotgo|CGRectInfinite|kCGWindowListOptionAll|kCGWindowListOptionOnScreenAboveWindow|kCGWindowListOptionOnScreenBelowWindow|CGWindowListCreateImageFromArray|kCGWindowImageShouldBeOpaque|\brename\(|\-R/);

assert.match(realAppSource, /bundleId: 'com\.apple\.Chess'/);
assert.match(realAppSource, /OPENDESK_ACCESSIBILITY_REAL_APP_CONFIRM/);
assert.match(realAppSource, /const raw = await window\.getActiveWindow\(\);/);
assert.match(realAppSource, /return raw;/);
assert.match(realAppSource, /within: mainWindow/);
assert.match(realAppSource, /within: aboutWindow/);
assert.doesNotMatch(realAppSource, /within:\s*sanitizeWindow\(/);
assert.match(realAppSource, /actionAttempts = 1/);
assert.equal((realAppSource.match(/UI\.tapMenuItem\(/g) || []).length, 1);
assert.doesNotMatch(realAppSource, /window\.list|page\.screenshot|screencapture|robotgo/);

console.log('exact-window-capture static contract passed');
