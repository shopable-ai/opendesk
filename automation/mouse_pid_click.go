package automation

import (
	"fmt"
	"math"
)

// ClickForPID posts a left-button click to the window owned by processID at
// the supplied global screen point. It is intentionally separate from Click,
// whose existing global mouse semantics remain unchanged.
func (m *Mouse) ClickForPID(processID, x, y float64) error {
	pid, err := validatePIDClickArgs(processID, x, y)
	if err != nil {
		return err
	}
	return clickForPIDPlatform(pid, x, y)
}

func validatePIDClickArgs(processID, x, y float64) (int32, error) {
	if math.IsNaN(processID) || math.IsInf(processID, 0) || processID <= 0 ||
		processID != math.Trunc(processID) || processID > math.MaxInt32 {
		return 0, fmt.Errorf("processID must be a positive 32-bit integer")
	}
	if math.IsNaN(x) || math.IsInf(x, 0) || math.IsNaN(y) || math.IsInf(y, 0) {
		return 0, fmt.Errorf("click coordinates must be finite numbers")
	}
	return int32(processID), nil
}
