package automation

import (
	"math"
	"strings"
	"testing"
)

func TestValidatePIDClickArgs(t *testing.T) {
	tests := []struct {
		name      string
		processID float64
		x         float64
		y         float64
		wantPID   int32
		wantError string
	}{
		{name: "valid", processID: 123, x: -40.5, y: 200.25, wantPID: 123},
		{name: "zero pid", processID: 0, x: 10, y: 20, wantError: "positive 32-bit integer"},
		{name: "negative pid", processID: -1, x: 10, y: 20, wantError: "positive 32-bit integer"},
		{name: "nan pid", processID: math.NaN(), x: 10, y: 20, wantError: "positive 32-bit integer"},
		{name: "infinite pid", processID: math.Inf(1), x: 10, y: 20, wantError: "positive 32-bit integer"},
		{name: "fractional pid", processID: 12.5, x: 10, y: 20, wantError: "positive 32-bit integer"},
		{name: "oversized pid", processID: float64(math.MaxInt32) + 1, x: 10, y: 20, wantError: "positive 32-bit integer"},
		{name: "nan x", processID: 123, x: math.NaN(), y: 20, wantError: "finite numbers"},
		{name: "infinite y", processID: 123, x: 10, y: math.Inf(1), wantError: "finite numbers"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pid, err := validatePIDClickArgs(tt.processID, tt.x, tt.y)
			if tt.wantError != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantError) {
					t.Fatalf("validatePIDClickArgs() error = %v, want substring %q", err, tt.wantError)
				}
				return
			}
			if err != nil {
				t.Fatalf("validatePIDClickArgs() error = %v", err)
			}
			if pid != tt.wantPID {
				t.Fatalf("validatePIDClickArgs() pid = %d, want %d", pid, tt.wantPID)
			}
		})
	}
}
