package main

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"opendesk/pkg/measurement"
)

type shortcutLeaseStub struct{ closed bool }

func (s *shortcutLeaseStub) Close() error { s.closed = true; return nil }

func TestMeasurementGlobalShortcutUsesTheSharedServiceOpenCallback(t *testing.T) {
	original := registerAppMeasurementShortcut
	defer func() { registerAppMeasurementShortcut = original }()
	originalOpen := openMeasurementFromGlobalShortcut
	defer func() { openMeasurementFromGlobalShortcut = originalOpen }()
	var callback func()
	registerAppMeasurementShortcut = func(got func()) (appMeasurementShortcut, error) {
		callback = got
		return &shortcutLeaseStub{}, nil
	}
	var mu sync.Mutex
	calls := 0
	openMeasurementFromGlobalShortcut = func(service *measurement.Service, ctx context.Context) error {
		if service == nil || ctx == nil {
			t.Fatal("global shortcut did not receive the shared service/context")
		}
		mu.Lock()
		calls++
		mu.Unlock()
		return nil
	}
	lease, err := registerMeasurementGlobalShortcut(&measurement.Service{}, context.Background())
	if err != nil || lease == nil || callback == nil {
		t.Fatalf("shortcut registration lease=%T err=%v callback=%v", lease, err, callback != nil)
	}
	callback()
	deadline := time.Now().Add(time.Second)
	for {
		mu.Lock()
		count := calls
		mu.Unlock()
		if count == 1 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("shortcut did not dispatch the shared service open callback")
		}
		time.Sleep(time.Millisecond)
	}
}

func TestMeasurementGlobalShortcutPreservesRegistrationFailure(t *testing.T) {
	original := registerAppMeasurementShortcut
	defer func() { registerAppMeasurementShortcut = original }()
	want := errors.New("input monitoring permission is missing")
	registerAppMeasurementShortcut = func(func()) (appMeasurementShortcut, error) { return nil, want }
	if _, err := registerMeasurementGlobalShortcut(&measurement.Service{}, context.Background()); !errors.Is(err, want) {
		t.Fatalf("registration error = %v, want %v", err, want)
	}
}
