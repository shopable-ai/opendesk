package automation

import (
	"context"
	"math"
	"strings"
	"testing"
	"time"
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

func TestMouseMoveDurationOptionsAndCurve(t *testing.T) {
	parsed, err := parseMouseMoveOptions(map[string]interface{}{
		"durationMs": float64(420),
		"curve":      "easeInOut",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !parsed.hasDuration || parsed.duration != 420*time.Millisecond || parsed.curve != "easeInOut" || parsed.steps != 1 {
		t.Fatalf("parsed duration options = %#v", parsed)
	}

	for _, options := range []map[string]interface{}{
		{"durationMs": 0},
		{"durationMs": 30001},
		{"durationMs": 12.5},
		{"durationMs": 420, "steps": 1},
		{"durationMs": 420, "steps": 2001},
		{"durationMs": 420, "steps": 12.5},
		{"curve": "easeOut"},
	} {
		if _, err := parseMouseMoveOptions(options); err == nil {
			t.Fatalf("parseMouseMoveOptions(%#v) unexpectedly succeeded", options)
		}
	}

	positions := make([]int, 0, 10)
	for step := 1; step <= 10; step++ {
		x, y := mouseMovePoint(0, 20, 100, 20, step, 10, "easeInOut", true)
		if y != 20 {
			t.Fatalf("easeInOut changed the fixed axis at step %d: %d", step, y)
		}
		positions = append(positions, x)
	}
	if positions[len(positions)-1] != 100 {
		t.Fatalf("easeInOut endpoint = %d, want 100", positions[len(positions)-1])
	}
	for index := 1; index < len(positions); index++ {
		if positions[index] < positions[index-1] {
			t.Fatalf("easeInOut positions are not monotonic: %#v", positions)
		}
	}
	if positions[0] >= 10 || positions[8] <= 90 {
		t.Fatalf("easeInOut does not visibly ease at both endpoints: %#v", positions)
	}
}

func TestMouseMoveWaitObservesCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	startedAt := time.Now()
	err := mouseWaitUntil(ctx, startedAt.Add(time.Second))
	if err != context.Canceled {
		t.Fatalf("mouseWaitUntil() error = %v, want context.Canceled", err)
	}
	if elapsed := time.Since(startedAt); elapsed > 100*time.Millisecond {
		t.Fatalf("canceled mouse wait took %s", elapsed)
	}
}

func TestBrowserMouseInheritsRuntimeCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	browser := NewBrowserWithContext(ctx)
	page, err := browser.NewPage()
	if err != nil {
		t.Fatal(err)
	}
	moveErr := page.Mouse.Move(0, 0, map[string]interface{}{"durationMs": 420, "curve": "easeInOut"})
	if moveErr != context.Canceled {
		t.Fatalf("browser page mouse cancellation error = %v, want context.Canceled", moveErr)
	}
}
