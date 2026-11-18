//go:build darwin || linux

package browserbridge

import (
	"bufio"
	"bytes"
	"fmt"
	"io"
	"net"
	"os"
	"testing"
	"time"
)

// The original single-socket failure must never retire its existing owner.
func TestLegacySocketConflictLeavesFirstConnectionUsable(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	h, w, r, socket := testHost(t)
	welcome(t, h, w, false)
	second, err := NewHost(h.cfg, h.origin, bytes.NewReader(nil), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	if err = second.Run(); err == nil || err.Error() != "E_SOCKET_IN_USE" {
		t.Fatalf("second Native connection: %v", err)
	}
	c, reader := local(t, socket)
	req := MustEncode(map[string]any{"v": 1, "kind": "request", "requestId": "still-first", "method": "bridge.status", "params": map[string]any{}})
	if err = WriteLine(c, req); err != nil {
		t.Fatal(err)
	}
	if got, err := ReadFrame(r); err != nil || !bytes.Equal(got, req) {
		t.Fatalf("first request: %s %v", got, err)
	}
	reply := MustEncode(map[string]any{"v": 1, "kind": "response", "requestId": "still-first", "result": map[string]any{"owner": "first"}})
	if err = WriteFrame(w, reply); err != nil {
		t.Fatal(err)
	}
	if got, err := ReadLine(reader); err != nil || !bytes.Equal(got, reply) {
		t.Fatalf("first reply: %s %v", got, err)
	}
}

func connectionInstallation(t *testing.T) Installation {
	t.Helper()
	home := isolatedInstanceHome(t)
	unsetNativeInstance(t)
	exe, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	if _, err = Setup(testExtensionID, "cft", cftProfile(t, home, "profile"), exe); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	return cfg
}

func openConnection(t *testing.T, cfg Installation, extensionIDs ...string) (*Host, *io.PipeWriter, *io.PipeReader) {
	return openPreparedConnection(t, cfg, nil, extensionIDs...)
}

func openPreparedConnection(t *testing.T, cfg Installation, prepare func(*Host), extensionIDs ...string) (*Host, *io.PipeWriter, *io.PipeReader) {
	t.Helper()
	in, w := io.Pipe()
	r, out := io.Pipe()
	extensionID := cfg.ExtensionID
	if len(extensionIDs) > 0 {
		extensionID = extensionIDs[0]
	}
	h, err := NewConnectionHost(cfg, "chrome-extension://"+extensionID+"/", in, out)
	if err != nil {
		t.Fatal(err)
	}
	if prepare != nil {
		prepare(h)
	}
	done := make(chan error, 1)
	go func() { err := h.Run(); out.CloseWithError(err); done <- err }()
	t.Cleanup(func() {
		h.Close()
		w.Close()
		r.Close()
		out.Close()
		select {
		case <-done:
		case <-time.After(time.Second):
			t.Error("connection did not exit")
		}
	})
	type frame struct {
		raw []byte
		err error
	}
	hello := make(chan frame, 1)
	go func() { raw, err := ReadFrame(r); hello <- frame{raw, err} }()
	select {
	case f := <-hello:
		if f.err != nil {
			t.Fatalf("hello: %v", f.err)
		}
		m, _ := Decode(f.raw)
		if String(m, "kind") != "hello" {
			t.Fatalf("hello: %s", f.raw)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("hello timeout")
	}
	if err = WriteFrame(w, MustEncode(map[string]any{"v": 1, "kind": "welcome", "extensionId": extensionID, "extensionVersion": "1"})); err != nil {
		t.Fatal(err)
	}
	end := time.Now().Add(time.Second)
	for time.Now().Before(end) {
		h.mu.Lock()
		ready := h.ready
		h.mu.Unlock()
		if ready {
			return h, w, r
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("welcome timeout")
	return nil, nil, nil
}

// Two Chrome-launched Hosts from ONE installation must have disjoint state.
// A shared requestId is legitimate across different Native Ports.
func TestNativeConnectionsIsolateSameRequestIDAndDisconnect(t *testing.T) {
	cfg := connectionInstallation(t)
	a, aw, ar := openConnection(t, cfg)
	b, bw, br := openConnection(t, cfg)
	if a.cfg.SocketPath == b.cfg.SocketPath || a.cfg.ClientCredential == b.cfg.ClientCredential || a.cfg.InstallRoot == b.cfg.InstallRoot {
		t.Fatal("connections share private state")
	}
	if _, err := LoadConnection(""); err == nil || err.Error() != "E_CONNECTION_REQUIRED" {
		t.Fatalf("ambiguous selection: %v", err)
	}
	request := MustEncode(map[string]any{"v": 1, "kind": "request", "requestId": "same-id", "method": "bridge.status", "params": map[string]any{}})
	type route struct {
		h     *Host
		w     *io.PipeWriter
		r     *io.PipeReader
		owner string
		c     net.Conn
	}
	items := []route{{a, aw, ar, "A", nil}, {b, bw, br, "B", nil}}
	for i := range items {
		c, err := dialConnection(items[i].h.cfg)
		if err != nil {
			t.Fatal(err)
		}
		defer c.Close()
		items[i].c = c
		if err = WriteLine(c, request); err != nil {
			t.Fatal(err)
		}
		if got, err := ReadFrame(items[i].r); err != nil || !bytes.Equal(got, request) {
			t.Fatalf("request: %s %v", got, err)
		}
	}
	// Both identical IDs are in flight; reverse reply order deliberately.
	for i := len(items) - 1; i >= 0; i-- {
		item := items[i]
		reply := MustEncode(map[string]any{"v": 1, "kind": "response", "requestId": "same-id", "result": map[string]any{"owner": item.owner}})
		if err := WriteFrame(item.w, reply); err != nil {
			t.Fatal(err)
		}
		if got, err := ReadLine(bufio.NewReader(item.c)); err != nil || !bytes.Equal(got, reply) {
			t.Fatalf("reply: %s %v", got, err)
		}
	}

	a.Close()
	if _, err := LoadConnection(a.cfg.ConnectionID); err == nil {
		t.Fatal("retired connection selected")
	}
	selected, err := LoadConnection("")
	if err != nil || selected.ConnectionID != b.cfg.ConnectionID {
		t.Fatalf("remaining connection: %s %v", selected.ConnectionID, err)
	}
}

// Exercise the real production timeout. A still-unknown request stays fenced
// until its own late reply, rather than letting that reply settle a new call.
func TestNativeConnectionLateUnknownReplyCannotSettleNewRequest(t *testing.T) {
	cfg := connectionInstallation(t)
	h, w, r := openConnection(t, cfg)
	c, err := dialConnection(h.cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer c.Close()
	request := MustEncode(map[string]any{"v": 1, "kind": "request", "requestId": "late-unknown", "method": "bridge.status", "params": map[string]any{}})
	if err = WriteLine(c, request); err != nil {
		t.Fatal(err)
	}
	if _, err = ReadFrame(r); err != nil {
		t.Fatal(err)
	}
	_ = c.SetDeadline(time.Now().Add(nativeTimeout + 5*time.Second))
	raw, err := ReadLine(bufio.NewReader(c))
	if err != nil {
		t.Fatal(err)
	}
	f, _ := Decode(raw)
	problem, _ := Decode(f["error"])
	if String(problem, "outcome") != "OUTCOME_UNKNOWN" {
		t.Fatalf("timeout: %s", raw)
	}
	retry, err := dialConnection(h.cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer retry.Close()
	if err = WriteLine(retry, request); err != nil {
		t.Fatal(err)
	}
	raw, err = ReadLine(bufio.NewReader(retry))
	if err != nil {
		t.Fatal(err)
	}
	f, _ = Decode(raw)
	problem, _ = Decode(f["error"])
	if String(problem, "code") != "E_REQUEST_CONFLICT" {
		t.Fatalf("unknown ID redispatched: %s", raw)
	}
	h.mu.Lock()
	_, active := h.pending["late-unknown"]
	fenced := h.pendingFences["late-unknown"]
	h.mu.Unlock()
	if active || !fenced {
		t.Fatalf("timeout did not release active capacity into fence: active=%v fenced=%v", active, fenced)
	}
	// The old response only retires its original fence; the rejected
	// socket has already received a NOT_DISPATCHED conflict and cannot consume it.
	late := MustEncode(map[string]any{"v": 1, "kind": "response", "requestId": "late-unknown", "result": map[string]any{"original": true}})
	if err = WriteFrame(w, late); err != nil {
		t.Fatal(err)
	}
	end := time.Now().Add(time.Second)
	for time.Now().Before(end) {
		h.mu.Lock()
		_, pending := h.pending["late-unknown"]
		fenced := h.pendingFences["late-unknown"]
		h.mu.Unlock()
		if !pending && !fenced {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatal("original late response did not retire its fence")
}

func TestNativeConnectionTimeoutFencesPreserveRecoveryCapacity(t *testing.T) {
	cfg := connectionInstallation(t)
	h, w, r := openConnection(t, cfg)
	// Exact post-timeout state; the production timer transition is covered by
	// TestNativeConnectionLateUnknownReplyCannotSettleNewRequest.
	h.mu.Lock()
	for i := 0; i < 12; i++ {
		h.pendingFences[fmt.Sprintf("timed-out-%02d", i)] = true
	}
	h.mu.Unlock()
	old, err := dialConnection(h.cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer old.Close()
	if err = WriteLine(old, MustEncode(map[string]any{"v": 1, "kind": "request", "requestId": "timed-out-00", "method": "bridge.status", "params": map[string]any{}})); err != nil {
		t.Fatal(err)
	}
	raw, err := ReadLine(bufio.NewReader(old))
	if err != nil {
		t.Fatal(err)
	}
	frame, _ := Decode(raw)
	problem, _ := Decode(frame["error"])
	if String(problem, "code") != "E_REQUEST_CONFLICT" || String(problem, "outcome") != "NOT_DISPATCHED" {
		t.Fatalf("old ID not fenced: %s", raw)
	}
	type recoveryCall struct {
		id    string
		conn  net.Conn
		entry *pendingCall
	}
	var calls []recoveryCall
	for _, method := range []string{"request.get", "run.stop"} {
		c, err := dialConnection(h.cfg)
		if err != nil {
			t.Fatal(err)
		}
		defer c.Close()
		id := "recovery-" + method
		req := MustEncode(map[string]any{"v": 1, "kind": "request", "requestId": id, "method": method, "params": map[string]any{}})
		if err = WriteLine(c, req); err != nil {
			t.Fatal(err)
		}
		// Bound a regression that rejects the call without writing to Native.
		read := make(chan error, 1)
		go func() {
			got, err := ReadFrame(r)
			if err == nil && !bytes.Equal(got, req) {
				err = ErrSchema
			}
			read <- err
		}()
		select {
		case err = <-read:
			if err != nil {
				t.Fatal(err)
			}
		case <-time.After(time.Second):
			t.Fatalf("%s had no active capacity after 12 timeouts", method)
		}
		h.mu.Lock()
		entry := h.pending[id]
		h.mu.Unlock()
		if entry == nil {
			t.Fatalf("%s not active", method)
		}
		calls = append(calls, recoveryCall{id, c, entry})
	}
	late := MustEncode(map[string]any{"v": 1, "kind": "response", "requestId": "timed-out-00", "result": map[string]any{"old": true}})
	// Direct dispatch gives a deterministic completion barrier for the late reply.
	if err = h.handleChrome(late); err != nil {
		t.Fatal(err)
	}
	h.mu.Lock()
	if h.pendingFences["timed-out-00"] || len(h.pendingFences) != 11 || len(h.pending) != 2 {
		t.Errorf("late reply affected unrelated state: fences=%v active=%d", h.pendingFences, len(h.pending))
	}
	for _, call := range calls {
		if h.pending[call.id] != call.entry {
			t.Errorf("late reply replaced %s", call.id)
		}
	}
	h.mu.Unlock()
	for _, call := range calls {
		select {
		case got := <-call.entry.answer:
			t.Fatalf("late reply settled %s: %s", call.id, got)
		default:
		}
		reply := MustEncode(map[string]any{"v": 1, "kind": "response", "requestId": call.id, "result": map[string]any{"owner": call.id}})
		if err = WriteFrame(w, reply); err != nil {
			t.Fatal(err)
		}
		got, err := ReadLine(bufio.NewReader(call.conn))
		if err != nil || !bytes.Equal(got, reply) {
			t.Fatalf("%s own response: %s %v", call.id, got, err)
		}
	}
}
