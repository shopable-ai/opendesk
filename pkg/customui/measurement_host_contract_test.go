package customui

import (
	"os"
	"strings"
	"testing"
)

func TestMeasurementHostKeyboardContractParity(t *testing.T) {
	windows, err := os.ReadFile("winhost/bridge.js")
	if err != nil {
		t.Fatal(err)
	}
	mac, err := os.ReadFile("machost/measurement_keys_darwin.m")
	if err != nil {
		t.Fatal(err)
	}
	for name, source := range map[string]string{"windows": string(windows), "macos": string(mac)} {
		for _, token := range []string{"measurement.key", "Tab", "Alt", "phase"} {
			if !strings.Contains(source, token) {
				t.Fatalf("%s measurement key bridge missing %q", name, token)
			}
		}
		for _, token := range []string{"1", "2", "3", "4", "i"} {
			if !strings.Contains(source, token) {
				t.Fatalf("%s measurement key bridge missing command %q", name, token)
			}
		}
	}
	if strings.Contains(string(windows), "key.toLowerCase()==='r'") || strings.Contains(string(mac), "isEqualToString:@\"r\"") {
		t.Fatal("R is no longer a Measurement-session shortcut; local reference editing is an Inspector action")
	}
	if strings.Contains(string(windows), "metaKey||event.ctrlKey") {
		t.Fatal("system copy chords must not be captured as Measurement-session shortcuts")
	}
	if !strings.Contains(string(windows), "keyup") || !strings.Contains(string(mac), "FlagsChanged") {
		t.Fatal("measurement Alt/Option release must be observable on both platforms")
	}
}
