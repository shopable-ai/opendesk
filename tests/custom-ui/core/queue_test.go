package customui_test

import (
	"errors"
	"testing"

	"opendesk/pkg/customui"
)

func TestEventQueuePreservesOrderAndCoalescesInput(t *testing.T) {
	queue := customui.NewEventQueue(3)
	events := []customui.Event{
		{WindowID: "panel", TargetID: "name", Type: "input", Sequence: 1, Value: "a"},
		{WindowID: "panel", TargetID: "save", Type: "click", Sequence: 2},
		{WindowID: "panel", TargetID: "name", Type: "input", Sequence: 3, Value: "abc"},
	}
	for _, event := range events {
		if err := queue.Push(event); err != nil {
			t.Fatal(err)
		}
	}
	got := queue.Drain()
	if len(got) != 3 || got[0].Sequence != 1 || got[1].Sequence != 2 || got[2].Sequence != 3 {
		t.Fatalf("drain = %#v, coalescing must not cross the click barrier", got)
	}
}

func TestEventQueueFailsClosedOnOverflowAndClose(t *testing.T) {
	queue := customui.NewEventQueue(1)
	if err := queue.Push(customui.Event{WindowID: "panel", Type: "click"}); err != nil {
		t.Fatal(err)
	}
	var uiErr *customui.Error
	if err := queue.Push(customui.Event{WindowID: "panel", Type: "change"}); !errors.As(err, &uiErr) || uiErr.Code != customui.CodeQueueOverflow {
		t.Fatalf("overflow error = %#v", err)
	}
	queue.Close()
	if err := queue.Push(customui.Event{WindowID: "panel", Type: "close"}); !errors.As(err, &uiErr) || uiErr.Code != customui.CodeCanceled {
		t.Fatalf("closed error = %#v", err)
	}
}

func TestEventQueueOnlyCoalescesPermittedConsecutiveEvents(t *testing.T) {
	queue := customui.NewEventQueue(8)
	for _, event := range []customui.Event{
		{WindowID: "panel", TargetID: "name", Type: "input", Sequence: 1},
		{WindowID: "panel", TargetID: "name", Type: "input", Sequence: 2},
		{WindowID: "panel", TargetID: "name", Type: "change", Sequence: 3},
		{WindowID: "panel", TargetID: "name", Type: "input", Sequence: 4},
		{WindowID: "panel", Type: "close", Sequence: 5},
	} {
		if err := queue.Push(event); err != nil {
			t.Fatal(err)
		}
	}
	got := queue.Drain()
	if len(got) != 4 || got[0].Sequence != 2 || got[1].Type != "change" || got[2].Sequence != 4 || got[3].Type != "close" {
		t.Fatalf("unexpected event order: %#v", got)
	}
}

func TestEventQueueCoalescingPreservesSequenceAcrossMixedHighFrequencyEvents(t *testing.T) {
	queue := customui.NewEventQueue(4)
	for _, event := range []customui.Event{
		{SessionID: "session", WindowID: "panel", TargetID: "name", Type: "input", Sequence: 1},
		{SessionID: "session", WindowID: "panel", Type: "move", Sequence: 2},
		{SessionID: "session", WindowID: "panel", Type: "resize", Sequence: 3},
		{SessionID: "session", WindowID: "panel", TargetID: "name", Type: "input", Sequence: 4},
	} {
		if err := queue.Push(event); err != nil {
			t.Fatal(err)
		}
	}
	got := queue.Drain()
	if len(got) != 3 || got[0].Sequence != 2 || got[1].Sequence != 3 || got[2].Sequence != 4 {
		t.Fatalf("coalescing reordered mixed events: %#v", got)
	}
}
