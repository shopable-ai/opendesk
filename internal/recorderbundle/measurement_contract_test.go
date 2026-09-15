package recorderbundle

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRecorderMeasurementControlUsesPauseBoundaryAndNeverAutoResumes(t *testing.T) {
	path := filepath.Join("..", "..", "apps", "opendesk", "recorder", "controller-core.js")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	start := strings.Index(text, "function measure(event)")
	end := strings.Index(text, "function generate()")
	if start < 0 || end <= start {
		t.Fatal("Recorder Measurement control function could not be isolated")
	}
	measure := text[start:end]
	for _, required := range []string{
		"excludeControlClick(event)",
		"session.pause()",
		"openMeasurement()",
		"录制已暂停；桌面测量退出后仍保持暂停，不会自动恢复。",
	} {
		if !strings.Contains(measure, required) {
			t.Fatalf("Recorder Measurement control is missing %q", required)
		}
	}
	if strings.Contains(measure, "session.resume()") {
		t.Fatal("Recorder Measurement control must not automatically resume capture after Measurement exits")
	}
}

func TestRecorderMeasurementToolbarUsesRulerAndSharedShortcutHint(t *testing.T) {
	path := filepath.Join("..", "..", "apps", "opendesk", "recorder", "controller.js")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	text := string(data)
	for _, required := range []string{
		"const MEASUREMENT_ICON = 'ruler'",
		"settings.measurementShortcut",
		"measurementLabel",
		"id === 'measurement'",
	} {
		if !strings.Contains(text, required) {
			t.Fatalf("Recorder Measurement toolbar contract is missing %q", required)
		}
	}
}
