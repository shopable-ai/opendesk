package feature

import "os"

var (
	// UseDIContainer remains a route-compatibility switch. Both values use the
	// same pkg/http and pkg/execution implementation; no legacy Runtime exists.
	UseDIContainer = os.Getenv("USE_DI_CONTAINER") != "0" // Enabled by default
)
