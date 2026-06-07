package feature

import "os"

var (
	// UseRuntimePool enables the runtime pool for concurrent script execution
	UseRuntimePool = os.Getenv("USE_RUNTIME_POOL") != "0" // Enabled by default

	// UseDIContainer enables the dependency injection container
	UseDIContainer = os.Getenv("USE_DI_CONTAINER") != "0" // Enabled by default
)
