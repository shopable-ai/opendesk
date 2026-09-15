package main

import (
	"os"
	"testing"
)

func TestMeasurementDisplaySelectionPreservesNegativeDesktopGeometry(t *testing.T) {
	displays := []measurementDisplayRow{
		{index: 1, id: "primary", isPrimary: true, x: 0, y: 0, width: 1440, height: 900, pixelWidth: 2880, pixelHeight: 1800},
		{index: 2, id: "left", x: -1920, y: -120, width: 1920, height: 1080, pixelWidth: 1920, pixelHeight: 1080},
	}
	selected, ok := selectMeasurementDisplay(displays, measurementWindowRow{x: -1800, y: 20, width: 800, height: 600})
	if !ok || selected.id != "left" || selected.x != -1920 || selected.y != -120 {
		t.Fatalf("selected display = %+v, ok=%v", selected, ok)
	}
}

func TestMeasurementExcludesItsOwnAndHostWindowsFromReferenceCandidates(t *testing.T) {
	if !measurementExcludedWindow(measurementWindowRow{pid: int64(os.Getpid()), title: "Calculator"}) {
		t.Fatal("current OpenDesk process was accepted as a measurement reference")
	}
	if !measurementExcludedWindow(measurementWindowRow{title: "OpenDesk — Recorder", raw: map[string]interface{}{"exeName": "opendesk-ui-host"}}) {
		t.Fatal("OpenDesk Recorder host was accepted as a measurement reference")
	}
	if measurementExcludedWindow(measurementWindowRow{pid: int64(os.Getpid()) + 1, title: "Calculator", raw: map[string]interface{}{"exeName": "Calculator"}}) {
		t.Fatal("external Calculator was incorrectly excluded")
	}
}

func TestMeasurementDisplaySelectionUsesLargestWindowIntersection(t *testing.T) {
	displays := []measurementDisplayRow{
		{index: 1, id: "primary", isPrimary: true, x: 0, y: 0, width: 1000, height: 800, pixelWidth: 1000, pixelHeight: 800},
		{index: 2, id: "right", x: 1000, y: 0, width: 1000, height: 800, pixelWidth: 1500, pixelHeight: 1200},
	}
	selected, ok := selectMeasurementDisplay(displays, measurementWindowRow{x: 900, y: 100, width: 600, height: 500})
	if !ok || selected.id != "right" {
		t.Fatalf("selected display = %+v, ok=%v", selected, ok)
	}
}
