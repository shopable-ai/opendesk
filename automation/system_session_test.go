package automation

import (
	"context"
	"errors"
	"runtime"
	"testing"

	"github.com/dop251/goja"
)

type memorySystemSessionBackend struct {
	lockCalls        int
	logoutCalls      int
	screenSaverCalls int
	logoutForce      bool
}

func (b *memorySystemSessionBackend) Capabilities() SystemSessionCapabilities {
	read := SystemSessionOperationCapability{Supported: true, Verified: false}
	action := SystemSessionOperationCapability{Supported: true, Verified: false, Destructive: true, RequiresConfirmation: true}
	return SystemSessionCapabilities{
		SchemaVersion: 1, Platform: "test", Backend: "memory-session",
		State: read, Lock: action, Logout: action, StartScreenSaver: action,
		Wake: SystemSessionOperationCapability{Supported: false}, SwitchUser: SystemSessionOperationCapability{Supported: false},
	}
}

func (b *memorySystemSessionBackend) State(context.Context) (SystemSessionState, error) {
	state := newSystemSessionState("test", "memory-session", "active")
	state.UserID = 501
	state.SessionID = "fixture-session"
	state.Active = true
	state.OnConsole = true
	state.LoginDone = true
	return state, nil
}

func (b *memorySystemSessionBackend) Lock(context.Context) error {
	b.lockCalls++
	return nil
}

func (b *memorySystemSessionBackend) Logout(_ context.Context, force bool) error {
	b.logoutCalls++
	b.logoutForce = force
	return nil
}

func (b *memorySystemSessionBackend) StartScreenSaver(context.Context) error {
	b.screenSaverCalls++
	return nil
}

func TestSystemSessionJSBindingCapabilityConfirmationAndActions(t *testing.T) {
	backend := &memorySystemSessionBackend{}
	runtimeValue := goja.New()
	system := NewSystemWithSessionBackend(runtimeValue, nil, backend)
	methods := AutoMapObject(runtimeValue, system)
	registerSystemSession(runtimeValue, system, methods)
	if err := runtimeValue.Set("System", methods); err != nil {
		t.Fatal(err)
	}
	_, err := runtimeValue.RunString(`
		const capabilities = System.getSessionCapabilities();
		if (capabilities.schemaVersion !== 1 || capabilities.backend !== "memory-session" || !capabilities.lock.requiresConfirmation || capabilities.wake.supported) throw new Error("capabilities invalid");
		const state = System.getSessionState();
		if (state.sessionId !== "fixture-session" || state.active !== true || state.locked !== null) throw new Error("state invalid");
		let confirmation = "";
		try { System.lock(); } catch (error) { confirmation = error.code; }
		if (confirmation !== "CONFIRMATION_REQUIRED") throw new Error("confirmation code=" + confirmation);
		let invalid = "";
		try { System.lock({ confirm: true, force: true }); } catch (error) { invalid = error.code; }
		if (invalid !== "INVALID_ARGUMENT") throw new Error("invalid code=" + invalid);
		const locked = System.lock({ confirm: true });
		const saver = System.startScreenSaver({ confirm: true });
		const logout = System.logout({ confirm: true, force: true });
		if (!locked.initiated || locked.verified || !saver.initiated || !logout.initiated) throw new Error("action receipt invalid");
	`)
	if err != nil {
		t.Fatal(err)
	}
	if backend.lockCalls != 1 || backend.screenSaverCalls != 1 || backend.logoutCalls != 1 || !backend.logoutForce {
		t.Fatalf("calls lock=%d saver=%d logout=%d force=%v", backend.lockCalls, backend.screenSaverCalls, backend.logoutCalls, backend.logoutForce)
	}
}

func TestSystemSessionUnsupportedStillRequiresConfirmation(t *testing.T) {
	backend := &unsupportedSystemSessionBackendForTest{}
	runtimeValue := goja.New()
	system := NewSystemWithSessionBackend(runtimeValue, nil, backend)
	methods := AutoMapObject(runtimeValue, system)
	registerSystemSession(runtimeValue, system, methods)
	_ = runtimeValue.Set("System", methods)
	_, err := runtimeValue.RunString(`
		let confirmation = "";
		try { System.logout(); } catch (error) { confirmation = error.code; }
		if (confirmation !== "CONFIRMATION_REQUIRED") throw new Error("confirmation code=" + confirmation);
		let unsupported = "";
		try { System.logout({ confirm: true }); } catch (error) { unsupported = error.code; }
		if (unsupported !== "NOT_SUPPORTED") throw new Error("unsupported code=" + unsupported);
	`)
	if err != nil {
		t.Fatal(err)
	}
}

type unsupportedSystemSessionBackendForTest struct{}

func (b *unsupportedSystemSessionBackendForTest) Capabilities() SystemSessionCapabilities {
	return unsupportedSystemSessionCapabilities("test-unsupported", "fixture unsupported")
}
func (b *unsupportedSystemSessionBackendForTest) State(context.Context) (SystemSessionState, error) {
	return SystemSessionState{}, systemSessionOperationError("", SystemSessionNotSupported, "fixture unsupported", nil)
}
func (b *unsupportedSystemSessionBackendForTest) Lock(context.Context) error {
	return systemSessionOperationError("", SystemSessionNotSupported, "fixture unsupported", nil)
}
func (b *unsupportedSystemSessionBackendForTest) Logout(context.Context, bool) error {
	return systemSessionOperationError("", SystemSessionNotSupported, "fixture unsupported", nil)
}
func (b *unsupportedSystemSessionBackendForTest) StartScreenSaver(context.Context) error {
	return systemSessionOperationError("", SystemSessionNotSupported, "fixture unsupported", nil)
}

func TestSystemSessionOptionValidation(t *testing.T) {
	runtimeValue := goja.New()
	if _, err := parseSystemSessionActionOptions(runtimeValue.ToValue(map[string]interface{}{"confirm": "yes"}), "test", false); systemSessionErrorCode(err) != SystemSessionInvalidArgument {
		t.Fatalf("confirm error=%v", err)
	}
	if _, err := parseSystemSessionActionOptions(runtimeValue.ToValue(map[string]interface{}{"force": true}), "test", false); systemSessionErrorCode(err) != SystemSessionInvalidArgument {
		t.Fatalf("force error=%v", err)
	}
}

func TestDarwinSystemSessionStateSmoke(t *testing.T) {
	if runtime.GOOS != "darwin" {
		t.Skip("macOS session state smoke")
	}
	backend := newDefaultSystemSessionBackend()
	capabilities := backend.Capabilities()
	if !capabilities.State.Supported || capabilities.Lock.Supported || capabilities.Logout.Supported {
		t.Fatalf("macOS capabilities=%+v", capabilities)
	}
	state, err := backend.State(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if state.Platform != "darwin" || state.Backend != "coregraphics-session" || state.State == "" || state.ObservedAt == "" || state.Locked != nil {
		t.Fatalf("macOS state=%+v", state)
	}
}

func systemSessionErrorCode(err error) SystemSessionErrorCode {
	var typed *SystemSessionError
	if errors.As(err, &typed) {
		return typed.Code
	}
	return ""
}
