package runtime

import "errors"

var (
	// ErrPoolClosed is returned when attempting to use a closed pool
	ErrPoolClosed = errors.New("runtime pool is closed")
)
