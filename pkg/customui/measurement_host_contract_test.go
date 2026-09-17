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
	if !strings.Contains(string(mac), `body:@{@"fields": CDMeasurementKeyFields(event, key, phase)}`) {
		t.Fatal("macOS Measurement key events must wrap the key payload in protocol fields")
	}
	if !strings.Contains(string(windows), "emit('pointermove',event)") {
		t.Fatal("Windows Measurement hover must emit pointermove so HUD/candidates follow the pointer")
	}
	if !strings.Contains(string(windows), "placeMicro") || !strings.Contains(string(windows), "event.clientX-r.width-gap") {
		t.Fatal("Windows Measurement bridge must position and edge-flip the Micro HUD")
	}
	if strings.Contains(string(windows), "key.startsWith('Arrow')") || strings.Contains(string(mac), "ArrowLeft") {
		t.Fatal("Arrow nudge is not part of the frozen Measurement session contract")
	}
}

func TestNativeFileDropContractStaysOutOfPublicUIBridge(t *testing.T) {
	mac, err := os.ReadFile("machost/native_darwin.m")
	if err != nil {
		t.Fatal(err)
	}
	source := string(mac)
	for _, token := range []string{"NSDraggingDestination", "NSPasteboardTypeFileURL", "fileDrop", "externalFileDrop", "CDFileURLsFromDraggingInfo"} {
		if !strings.Contains(source, token) {
			t.Fatalf("macOS native file-drop bridge missing %q", token)
		}
	}
	if strings.Contains(source, "window.__opendesk.fileDrop") || strings.Contains(source, "send({type:'fileDrop'") {
		t.Fatal("external file paths must not be exposed through the public WebKit bridge")
	}
}
