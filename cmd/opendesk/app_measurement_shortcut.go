package main

import (
	"context"
	"fmt"
	"log"
	"runtime"

	"opendesk/automation"
	"opendesk/internal/measurementshortcut"
	"opendesk/pkg/appshell"
	"opendesk/pkg/measurement"
)

const measurementGlobalShortcutAccelerator = measurementshortcut.GlobalShortcutAccelerator

type appMeasurementShortcut interface {
	Close() error
}

var registerAppMeasurementShortcut = func(callback func()) (appMeasurementShortcut, error) {
	return automation.RegisterGlobalShortcut(measurementGlobalShortcutAccelerator, callback)
}

var openMeasurementFromGlobalShortcut = func(service *measurement.Service, ctx context.Context) error {
	return service.Open(ctx, "global-shortcut")
}

// The warning is intentionally delivered outside App Mode startup. On macOS,
// notification authorization can involve the system service, so it must never
// turn an optional shortcut into a startup dependency.
var deliverMeasurementShortcutWarning = automation.Notify

var dispatchMeasurementShortcutWarning = func(callback func()) {
	go callback()
}

// registerMeasurementGlobalShortcut is the compatibility entry used by unit
// tests and non-product callers. The product path below adds the native activity
// barrier without changing this helper's established contract.
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

// registerMeasurementGlobalShortcutWithActivity is used by the official App
// owner. It closes passive product surfaces before capture and keeps Measurement
// marked active until its native session actually closes.
func registerMeasurementGlobalShortcutWithActivity(service *measurement.Service, ctx context.Context, shell *appshell.Shell, activity *appProductActivityCoordinator) (appMeasurementShortcut, error) {
	if service == nil {
		return nil, nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	return registerAppMeasurementShortcut(func() {
		go func() {
			waitBeforeProductDesktopActivity(ctx, shell, activity, "measurement", "global-shortcut")
			finish := activity.begin("measurement")
			defer finish()
			if err := service.OpenAndWait(ctx, "global-shortcut"); err != nil {
				log.Printf("Desktop Measurement global shortcut open failed: %v", err)
			}
		}()
	})
}

// warnMeasurementGlobalShortcutUnavailable keeps the visible product entrances
// usable when another OpenDesk runtime, macOS, or another application owns the
// optional global shortcut. ui.notify() belongs to a JavaScript execution and
// is not available during App Mode bootstrap, so use the equivalent non-modal
// system notification from the product lifecycle instead.
func warnMeasurementGlobalShortcutUnavailable(err error) {
	if err == nil {
		return
	}
	log.Printf("Desktop Measurement shortcut %s is unavailable: %v", measurementGlobalShortcutAccelerator, err)
	dispatchMeasurementShortcutWarning(func() {
		notifyErr := deliverMeasurementShortcutWarning(&automation.NotifyOptions{
			Title: "OpenDesk",
			Message: fmt.Sprintf(
				"Desktop Measurement shortcut %s is unavailable. You can still open Desktop Measurement from the OpenDesk menu.",
				measurementGlobalShortcutDisplayName(),
			),
			Sound: false,
		})
		if notifyErr != nil {
			log.Printf("Desktop Measurement shortcut warning notification failed: %v", notifyErr)
		}
	})
}

func measurementGlobalShortcutDisplayName() string {
	return measurementshortcut.GlobalShortcutLabel(runtime.GOOS)
}
