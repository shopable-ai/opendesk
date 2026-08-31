package customui

import "sync"

// EventQueue is bounded and deterministic. High-frequency input events may be
// coalesced by target; click/change/close events are never silently discarded.
type EventQueue struct {
	mu       sync.Mutex
	capacity int
	items    []Event
	closed   bool
}

func NewEventQueue(capacity int) *EventQueue {
	if capacity <= 0 {
		capacity = 256
	}
	return &EventQueue{capacity: capacity, items: make([]Event, 0, capacity)}
}

func (q *EventQueue) Push(event Event) error {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.closed {
		return &Error{Code: CodeCanceled, Operation: "queueEvent", WindowID: event.WindowID, Message: "custom UI event queue is closed"}
	}
	if isCoalescibleEvent(event.Type) {
		for index := len(q.items) - 1; index >= 0; index-- {
			current := q.items[index]
			if !isCoalescibleEvent(current.Type) {
				break
			}
			if current.Type == event.Type && current.SessionID == event.SessionID && current.WindowID == event.WindowID && current.TargetID == event.TargetID {
				q.items[index] = event
				return nil
			}
		}
	}
	if len(q.items) >= q.capacity {
		return &Error{Code: CodeQueueOverflow, Operation: "queueEvent", WindowID: event.WindowID, TargetID: event.TargetID, Message: "custom UI event queue capacity exceeded"}
	}
	q.items = append(q.items, event)
	return nil
}

func isCoalescibleEvent(eventType string) bool {
	return eventType == "input" || eventType == "move" || eventType == "resize"
}

func (q *EventQueue) Drain() []Event {
	q.mu.Lock()
	defer q.mu.Unlock()
	if len(q.items) == 0 {
		return nil
	}
	items := append([]Event(nil), q.items...)
	q.items = q.items[:0]
	return items
}

func (q *EventQueue) Len() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.items)
}

func (q *EventQueue) Close() {
	q.mu.Lock()
	q.closed = true
	q.items = nil
	q.mu.Unlock()
}
