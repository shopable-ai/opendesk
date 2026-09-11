//go:build windows

package automation

import (
	"syscall"
	"testing"
)

func TestWindowsWindowManagerStateReadbackPredicates(t *testing.T) {
	base := windowsWindowObservation{Exists: true, Visible: true}
	cases := []struct {
		name     string
		expected windowsExpectedState
		state    windowsWindowObservation
		want     bool
	}{
		{name: "visible", expected: windowsStateVisible, state: base, want: true},
		{name: "minimized requires iconic", expected: windowsStateMinimized, state: windowsWindowObservation{Exists: true, Iconic: true}, want: true},
		{name: "maximized requires zoomed and visible", expected: windowsStateMaximized, state: windowsWindowObservation{Exists: true, Visible: true, Zoomed: true}, want: true},
		{name: "maximized hidden is not success", expected: windowsStateMaximized, state: windowsWindowObservation{Exists: true, Zoomed: true}, want: false},
		{name: "restore requires normal visible state", expected: windowsStateRestored, state: base, want: true},
		{name: "restore rejects iconic", expected: windowsStateRestored, state: windowsWindowObservation{Exists: true, Visible: true, Iconic: true}, want: false},
		{name: "restore rejects zoomed", expected: windowsStateRestored, state: windowsWindowObservation{Exists: true, Visible: true, Zoomed: true}, want: false},
		{name: "topmost", expected: windowsStateTopmost, state: windowsWindowObservation{Exists: true, Topmost: true}, want: true},
		{name: "not topmost", expected: windowsStateNotTopmost, state: windowsWindowObservation{Exists: true}, want: true},
		{name: "stale handle never satisfies", expected: windowsStateVisible, state: windowsWindowObservation{Visible: true}, want: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := windowsStateSatisfied(tc.expected, tc.state); got != tc.want {
				t.Fatalf("windowsStateSatisfied(%v, %+v) = %v, want %v", tc.expected, tc.state, got, tc.want)
			}
		})
	}
}

func TestWindowsWindowManagerNativeErrorClassification(t *testing.T) {
	cases := []struct {
		name string
		err  error
		code WindowErrorCode
	}{
		{name: "access denied", err: syscall.Errno(5), code: WindowPermissionDenied},
		{name: "invalid handle", err: syscall.Errno(6), code: WindowStaleTarget},
		{name: "invalid window handle", err: syscall.Errno(1400), code: WindowStaleTarget},
		{name: "timeout", err: syscall.Errno(1460), code: WindowTimeout},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := windowsErrorFromCall("fixture", tc.err)
			windowErr, ok := err.(*WindowError)
			if !ok {
				t.Fatalf("expected *WindowError, got %T", err)
			}
			if windowErr.Code != tc.code {
				t.Fatalf("code = %s, want %s", windowErr.Code, tc.code)
			}
		})
	}
}

func TestWindowsWindowManagerPIDInputRejectsLossyValues(t *testing.T) {
	valid := []interface{}{uint32(7), uint64(8), uint(9), int(10), int32(11), int64(12), float64(13)}
	for _, value := range valid {
		if pid, ok := pidFromInterface(value); !ok || pid == 0 {
			t.Fatalf("expected valid PID conversion for %#v", value)
		}
	}
	invalid := []interface{}{nil, uint32(0), int(-1), int64(0), float64(1.5), float64(-2)}
	for _, value := range invalid {
		if pid, ok := pidFromInterface(value); ok || pid != 0 {
			t.Fatalf("expected invalid PID conversion for %#v, got pid=%d ok=%v", value, pid, ok)
		}
	}
}
