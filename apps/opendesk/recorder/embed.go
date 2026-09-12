package recorder

import "embed"

// Assets exposes the canonical Recorder product resources to release bundling.
// The JavaScript and icons beside this file remain the single source of truth;
// internal/recorderbundle only materializes these bytes for built-in execution.
//
//go:embed controller.js controller-core.js recording-history.js icons/countdown-1.png icons/countdown-2.png icons/countdown-3.png icons/opendesk-logo.png
var Assets embed.FS
