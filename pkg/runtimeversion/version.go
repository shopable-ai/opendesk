package runtimeversion

// Current is the OpenDesk Runtime version used for App Package compatibility
// checks. Repository builders read the canonical release value from VERSION and
// inject it (or an explicit release override) with:
//
//	-ldflags "-X opendesk/pkg/runtimeversion.Current=<semver>"
//
// Keep this source fallback aligned with VERSION so tests and un-stamped local
// builds report the same product version.
var Current = "2.0.1"
