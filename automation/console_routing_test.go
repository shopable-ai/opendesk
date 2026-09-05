package automation

import "testing"

func TestInitEventSinkMarksBootstrapConsoleAsFrameworkDebug(t *testing.T) {
	capture := &consoleRoutingCapture{}
	sink := initEventSink{base: capture}

	sink.Emit("script", "info", "console", "log", "bootstrap info", nil)
	sink.Emit("script", "warn", "console", "log", "bootstrap warning", nil)
	sink.Emit("error", "error", "console", "log", "bootstrap failure", nil)

	want := []consoleRoutingEvent{
		{category: "framework", level: "debug", source: "runtime", message: "bootstrap info"},
		{category: "framework", level: "warn", source: "runtime", message: "bootstrap warning"},
		{category: "error", level: "error", source: "runtime", message: "bootstrap failure"},
	}
	if len(capture.events) != len(want) {
		t.Fatalf("captured %d events, want %d", len(capture.events), len(want))
	}
	for index := range want {
		if capture.events[index] != want[index] {
			t.Errorf("event %d = %+v, want %+v", index, capture.events[index], want[index])
		}
	}
}

func TestConsoleSinkPreservesBusinessMethod(t *testing.T) {
	capture := &consoleRoutingCapture{}
	console := NewConsoleWithSink(capture)

	console.Log("business")
	console.Info("information")
	console.Debug("detail")
	console.Table(map[string]any{"ok": true})
	console.Group("phase")
	console.GroupEnd("phase")
	console.Time("phase")
	console.TimeEnd("phase")

	wantMethods := []string{"log", "info", "debug", "table", "group", "groupEnd", "time", "timeEnd"}
	if len(capture.events) != len(wantMethods) {
		t.Fatalf("captured %d events, want %d", len(capture.events), len(wantMethods))
	}
	for index, method := range wantMethods {
		if capture.events[index].method != method {
			t.Errorf("event %d method = %q, want %q", index, capture.events[index].method, method)
		}
	}
}

type consoleRoutingEvent struct {
	category string
	level    string
	source   string
	message  string
	method   string
}

type consoleRoutingCapture struct {
	events []consoleRoutingEvent
}

func (c *consoleRoutingCapture) Emit(category, level, source, _ string, message string, fields map[string]any) {
	method, _ := fields["consoleMethod"].(string)
	c.events = append(c.events, consoleRoutingEvent{
		category: category,
		level:    level,
		source:   source,
		message:  message,
		method:   method,
	})
}
