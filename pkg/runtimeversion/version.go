package runtimeversion

// Current is the OpenDesk Runtime version used for App Package compatibility
// checks. Release builds should override it with:
//
//   -ldflags "-X opendesk/pkg/runtimeversion.Current=<semver>"
var Current = "0.1.0"
