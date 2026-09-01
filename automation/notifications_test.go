package automation

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/eventloop"
)

type memoryNotificationInteractionBackend struct {
	mu      sync.Mutex
	records []NotificationRecord
}

func (b *memoryNotificationInteractionBackend) Capabilities() NotificationInteractionCapabilities {
	capability := NotificationOperationCapability{Supported: true, Verified: false}
	return NotificationInteractionCapabilities{
		SchemaVersion: 1, Platform: "test", Backend: "memory-notifications", Scope: "own-app",
		List: capability, WaitFor: capability, Dismiss: capability,
		Activate: NotificationOperationCapability{Supported: false},
		Events:   NotificationOperationCapability{Supported: false},
	}
}

func (b *memoryNotificationInteractionBackend) List(ctx context.Context) ([]NotificationRecord, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	return append([]NotificationRecord(nil), b.records...), nil
}

func (b *memoryNotificationInteractionBackend) Dismiss(ctx context.Context, id string) (bool, error) {
	if err := ctx.Err(); err != nil {
		return false, err
	}
	b.mu.Lock()
	defer b.mu.Unlock()
	for index, record := range b.records {
		if record.ID == id {
			b.records = append(b.records[:index], b.records[index+1:]...)
			return true, nil
		}
	}
	return false, nil
}

func (b *memoryNotificationInteractionBackend) add(record NotificationRecord) {
	b.mu.Lock()
	b.records = append(b.records, record)
	b.mu.Unlock()
}

func TestNotificationsJSBindingRedactionWaitDismissAndTimeout(t *testing.T) {
	backend := &memoryNotificationInteractionBackend{records: []NotificationRecord{
		{ID: "old", AppID: "com.opendesk.cli", DeliveredAt: "2026-09-02T01:00:00.000Z", Title: "existing", Message: "private existing body"},
	}}
	loop := eventloop.NewEventLoop(eventloop.EnableConsole(false))
	loop.Start()
	defer loop.Terminate()
	ready := make(chan *NotificationsRuntime, 1)
	if !loop.RunOnLoop(func(runtimeValue *goja.Runtime) {
		manager := registerNotifications(runtimeValue, InitJSOptions{
			EventLoop:                             loop,
			NotificationInteractionBackendFactory: func() NotificationInteractionBackend { return backend },
		})
		_, err := runtimeValue.RunString(`
			globalThis.notificationsDone = false;
			globalThis.notificationsFailure = "";
			globalThis.notificationsResult = {};
			(async () => {
				const redacted = await Notifications.list();
				if (redacted.length !== 1 || redacted[0].id !== "old" || redacted[0].contentRedacted !== true || redacted[0].title !== undefined || redacted[0].message !== undefined) throw new Error("default list leaked content");
				const revealed = await Notifications.list({ includeContent: true });
				if (revealed[0].title !== "existing" || revealed[0].message !== "private existing body" || revealed[0].contentRedacted !== false) throw new Error("explicit content projection invalid");
				const pending = Notifications.waitFor({ title: "new title", message: "new body", includeContent: true, timeout: 1000, pollInterval: 50 });
				const found = await pending;
				if (found.id !== "new" || found.title !== "new title" || found.message !== "new body") throw new Error("wait result invalid");
				const dismissed = await Notifications.dismiss({ id: found.id });
				if (!dismissed.dismissed || dismissed.id !== "new") throw new Error("dismiss result invalid");
				let missing = "";
				try { await Notifications.dismiss("new"); } catch (error) { missing = error.code; }
				if (missing !== "NOT_FOUND") throw new Error("missing dismiss code=" + missing);
				let timeout = "";
				try { await Notifications.waitFor({ title: "never", timeout: 75, pollInterval: 50 }); } catch (error) { timeout = error.code; }
				if (timeout !== "TIMEOUT") throw new Error("timeout code=" + timeout);
				const capabilities = Notifications.getCapabilities();
				if (capabilities.scope !== "own-app" || !capabilities.list.supported || capabilities.activate.supported) throw new Error("capabilities invalid");
				notificationsResult = { redacted: redacted.length, dismissed: dismissed.dismissed, timeout };
			})().then(() => { notificationsDone = true; }, error => { notificationsFailure = String(error && (error.stack || error)); notificationsDone = true; });
		`)
		if err != nil {
			t.Errorf("notifications script: %v", err)
		}
		ready <- manager
	}) {
		t.Fatal("event loop stopped before setup")
	}
	manager := <-ready
	time.Sleep(25 * time.Millisecond)
	backend.add(NotificationRecord{ID: "new", AppID: "com.opendesk.cli", DeliveredAt: "2026-09-02T02:00:00.000Z", Title: "new title", Message: "new body"})
	waitForNotificationsBool(t, loop, "notificationsDone", true)
	if failure := notificationsStringValue(t, loop, "notificationsFailure"); failure != "" {
		t.Fatal(failure)
	}
	if workers, pending := manager.ResourceCounts(); workers != 0 || pending != 0 {
		t.Fatalf("resources=%d/%d", workers, pending)
	}
	closeNotificationsRuntime(t, loop, manager)
}

func TestNotificationsWaitCancellationCleansResources(t *testing.T) {
	backend := &memoryNotificationInteractionBackend{}
	loop := eventloop.NewEventLoop(eventloop.EnableConsole(false))
	loop.Start()
	defer loop.Terminate()
	ready := make(chan *NotificationsRuntime, 1)
	loop.RunOnLoop(func(runtimeValue *goja.Runtime) {
		manager := registerNotifications(runtimeValue, InitJSOptions{
			EventLoop:                             loop,
			NotificationInteractionBackendFactory: func() NotificationInteractionBackend { return backend },
		})
		_, err := runtimeValue.RunString(`Notifications.waitFor({ timeout: 5000 }).catch(() => {});`)
		if err != nil {
			t.Errorf("notification cancellation script: %v", err)
		}
		ready <- manager
	})
	manager := <-ready
	closeNotificationsRuntime(t, loop, manager)
	if workers, pending := manager.ResourceCounts(); workers != 0 || pending != 0 {
		t.Fatalf("resources after close=%d/%d", workers, pending)
	}
}

func TestNotificationOptionValidationAndUnsupportedCapabilities(t *testing.T) {
	runtimeValue := goja.New()
	if _, err := parseNotificationWaitOptions(runtimeValue.ToValue(map[string]interface{}{"pollInterval": 10})); notificationErrorCode(err) != NotificationInvalidArgument {
		t.Fatalf("poll interval error=%v", err)
	}
	if _, err := parseNotificationTarget(runtimeValue.ToValue(map[string]interface{}{"id": "x", "extra": true})); notificationErrorCode(err) != NotificationInvalidArgument {
		t.Fatalf("target shape error=%v", err)
	}
	capabilities := unsupportedNotificationCapabilities("test")
	if capabilities.List.Supported || capabilities.Activate.Supported || capabilities.Scope != "none" {
		t.Fatalf("unsupported capabilities=%+v", capabilities)
	}
}

func notificationErrorCode(err error) NotificationInteractionErrorCode {
	var typed *NotificationInteractionError
	if errors.As(err, &typed) {
		return typed.Code
	}
	return ""
}

func closeNotificationsRuntime(t *testing.T, loop *eventloop.EventLoop, manager *NotificationsRuntime) {
	t.Helper()
	done := make(chan struct{}, 1)
	if !loop.RunOnLoop(func(*goja.Runtime) { manager.Close(); done <- struct{}{} }) {
		t.Fatal("event loop stopped before Notifications close")
	}
	<-done
	manager.Wait()
}

func waitForNotificationsBool(t *testing.T, loop *eventloop.EventLoop, name string, want bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		result := make(chan bool, 1)
		if !loop.RunOnLoop(func(runtimeValue *goja.Runtime) { result <- runtimeValue.Get(name).ToBoolean() }) {
			t.Fatal("event loop stopped before Notifications value read")
		}
		if <-result == want {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("%s did not reach %v", name, want)
}

func notificationsStringValue(t *testing.T, loop *eventloop.EventLoop, name string) string {
	t.Helper()
	result := make(chan string, 1)
	if !loop.RunOnLoop(func(runtimeValue *goja.Runtime) { result <- runtimeValue.Get(name).String() }) {
		t.Fatal("event loop stopped before Notifications string read")
	}
	return <-result
}
