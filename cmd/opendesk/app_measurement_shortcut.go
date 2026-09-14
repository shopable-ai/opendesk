package main

import (
	"context"
	"log"

	"opendesk/automation"
	"opendesk/pkg/measurement"
)

const measurementGlobalShortcutAccelerator = "CommandOrControl+Alt+Shift+M"

type appMeasurementShortcut interface {
	Close() error
}

var registerAppMeasurementShortcut = func(callback func()) (appMeasurementShortcut, error) {
	return automation.RegisterGlobalShortcut(measurementGlobalShortcutAccelerator, callback)
}

var openMeasurementFromGlobalShortcut = func(service *measurement.Service, ctx context.Context) error {
	return service.Open(ctx, "global-shortcut")
}

// registerMeasurementGlobalShortcut is intentionally App-lifecycle-owned. It
// invokes the same process-wide Measurement Service as the menu and Recorder;
// it is neither a second Runtime nor a generic keyboard automation layer.
func registerMeasurementGlobalShortcut(service *measurement.Service, ctx context.Context) (appMeasurementShortcut, error) {
	if service == nil {
		return nil, nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	return registerAppMeasurementShortcut(func() {
		go func() {
			if err := openMeasurementFromGlobalShortcut(service, ctx); err != nil {
				log.Printf("Desktop Measurement global shortcut open failed: %v", err)
			}
		}()
	})
}
