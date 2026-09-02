package main

import (
	"context"
	"os"
	"syscall"
	"testing"
	"time"
)

func TestExecutionSignalControllerCancelsThenForcesExit(t *testing.T) {
	signals := make(chan os.Signal, 2)
	forced := make(chan int, 1)
	controller := newExecutionSignalController(context.Background(), signals, func() {}, func(code int) {
		forced <- code
	})
	defer controller.Stop()

	signals <- os.Interrupt
	select {
	case <-controller.Context().Done():
	case <-time.After(time.Second):
		t.Fatal("first interrupt did not cancel the execution context")
	}
	select {
	case code := <-forced:
		t.Fatalf("first interrupt forced exit with code %d", code)
	default:
	}

	signals <- os.Interrupt
	select {
	case code := <-forced:
		if code != 130 {
			t.Fatalf("second interrupt exit code = %d, want 130", code)
		}
	case <-time.After(time.Second):
		t.Fatal("second interrupt did not force exit")
	}
}

func TestExecutionSignalControllerArmsForceExitAfterExternalCancellation(t *testing.T) {
	signals := make(chan os.Signal, 1)
	forced := make(chan int, 1)
	controller := newExecutionSignalController(context.Background(), signals, func() {}, func(code int) {
		forced <- code
	})
	defer controller.Stop()

	controller.Cancel()
	select {
	case <-controller.Context().Done():
	case <-time.After(time.Second):
		t.Fatal("external cancellation did not cancel the execution context")
	}

	signals <- syscall.SIGTERM
	select {
	case code := <-forced:
		if code != 143 {
			t.Fatalf("SIGTERM exit code = %d, want 143", code)
		}
	case <-time.After(time.Second):
		t.Fatal("signal after external cancellation did not force exit")
	}
}
