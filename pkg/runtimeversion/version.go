package runtimeversion

// Current is the OpenDesk Runtime version used for App Package compatibility
// checks. Repository builders read the default release value from VERSION and
// inject it (or an explicit release override) with:
//
//	-ldflags "-X opendesk/pkg/runtimeversion.Current=<semver>"
var Current = "0.1.0"
