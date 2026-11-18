//go:build darwin || linux

package browserbridge

import (
	"bufio"
	"bytes"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const managedTestProtocol = "opendesk.managed-services.v1"

func managedWelcome(t *testing.T, h *Host, w *io.PipeWriter) {
	t.Helper()
	if err := WriteFrame(w, MustEncode(map[string]any{"v": 1, "kind": "welcome", "extensionId": testExtensionID, "extensionVersion": "test", "managedServicesVersion": 1})); err != nil {
		t.Fatal(err)
	}
}
func managedRegister(t *testing.T, socket string, r io.Reader) (*net.UnixConn, *bufio.Reader, string) {
	t.Helper()
	c, reader := local(t, socket)
	if err := WriteLine(c, MustEncode(map[string]any{"v": 1, "kind": "services.register", "protocol": managedTestProtocol, "descriptor": map[string]any{
		"serviceId": "test-service", "serviceInstanceId": "instance_1", "productName": "Test service", "origin": "http://service-test.localhost:43121", "capabilities": []string{"test:metadata"}}})); err != nil {
		t.Fatal(err)
	}
	raw, err := ReadLine(reader)
	if err != nil {
		t.Fatal(err)
	}
	f, _ := Decode(raw)
	if String(f, "kind") != "services.registered" {
		t.Fatalf("registration %s", raw)
	}
	state, err := ReadFrame(r)
	if err != nil {
		t.Fatal(err)
	}
	sf, _ := Decode(state)
	if String(sf, "kind") != "services.state" {
		t.Fatalf("state %s", state)
	}
	return c, reader, String(f, "providerEpoch")
}
func managedBrowserRequest(id, epoch, action string) []byte {
	return MustEncode(map[string]any{"v": 1, "kind": "services.request", "protocol": managedTestProtocol, "requestId": id, "serviceId": "test-service", "providerEpoch": epoch,
		"owner": map[string]any{"extensionId": testExtensionID, "toolId": "test-tool", "packageHash": strings.Repeat("a", 64), "installEpoch": "installation_1"}, "action": action, "payload": map[string]any{"operationId": "op_1"}})
}
func TestManagedHostNegotiatesRoutesAndRetires(t *testing.T) {
	h, w, r, socket := testHost(t)
	managedWelcome(t, h, w)
	c, reader, epoch := managedRegister(t, socket, r)
	id := "11111111-1111-4111-8111-111111111111"
	if err := WriteFrame(w, managedBrowserRequest(id, epoch, "bind")); err != nil {
		t.Fatal(err)
	}
	raw, err := ReadLine(reader)
	if err != nil {
		t.Fatal(err)
	}
	f, _ := Decode(raw)
	if String(f, "kind") != "services.invoke" || String(f, "requestId") != "req_1" || String(f, "serviceInstanceId") != "instance_1" {
		t.Fatalf("invoke %s", raw)
	}
	if err = WriteLine(c, MustEncode(map[string]any{"v": 1, "kind": "services.result", "protocol": managedTestProtocol, "requestId": "req_1", "serviceId": "test-service", "providerEpoch": epoch, "result": map[string]any{"bound": true}})); err != nil {
		t.Fatal(err)
	}
	raw, err = ReadFrame(r)
	if err != nil {
		t.Fatal(err)
	}
	f, _ = Decode(raw)
	if String(f, "kind") != "services.response" || String(f, "requestId") != id || !Object(f, "result") {
		t.Fatalf("response %s", raw)
	}
	id = "22222222-2222-4222-8222-222222222222"
	if err = WriteFrame(w, managedBrowserRequest(id, epoch, "accept")); err != nil {
		t.Fatal(err)
	}
	raw, err = ReadLine(reader)
	if err != nil {
		t.Fatal(err)
	}
	f, _ = Decode(raw)
	if String(f, "requestId") != "req_2" {
		t.Fatalf("sequence %s", raw)
	}
	c.Close()
	raw, err = ReadFrame(r)
	if err != nil {
		t.Fatal(err)
	}
	f, _ = Decode(raw)
	e, _ := Decode(f["error"])
	if String(f, "requestId") != id || String(e, "outcome") != "OUTCOME_UNKNOWN" {
		t.Fatalf("disconnect %s", raw)
	}
	raw, err = ReadFrame(r)
	if err != nil {
		t.Fatal(err)
	}
	f, _ = Decode(raw)
	if String(f, "kind") != "services.state" || string(f["services"]) != "[]" {
		t.Fatalf("retirement %s", raw)
	}
}

func TestManagedHostBoundsInflightAndNeverReusesSequence(t *testing.T) {
	h, w, r, socket := testHost(t)
	managedWelcome(t, h, w)
	c, reader, epoch := managedRegister(t, socket, r)
	for n := 1; n <= 4; n++ {
		id := fmt.Sprintf("%08d-1111-4111-8111-111111111111", n)
		if err := WriteFrame(w, managedBrowserRequest(id, epoch, "bind")); err != nil {
			t.Fatal(err)
		}
		raw, err := ReadLine(reader)
		if err != nil {
			t.Fatal(err)
		}
		f, _ := Decode(raw)
		if String(f, "requestId") != fmt.Sprintf("req_%d", n) {
			t.Fatalf("sequence %s", raw)
		}
	}
	if err := WriteFrame(w, managedBrowserRequest("55555555-1111-4111-8111-111111111111", epoch, "bind")); err != nil {
		t.Fatal(err)
	}
	raw, err := ReadFrame(r)
	if err != nil {
		t.Fatal(err)
	}
	f, _ := Decode(raw)
	e, _ := Decode(f["error"])
	if String(e, "code") != "E_SERVICE_LIMIT" || String(e, "outcome") != "NOT_DISPATCHED" {
		t.Fatalf("limit %s", raw)
	}
	h.mu.Lock()
	entry := h.managedPending[managedKey(epoch, "req_1")]
	h.mu.Unlock()
	entry.timer.Stop()
	go h.expireManaged(entry)
	raw, err = ReadFrame(r)
	if err != nil {
		t.Fatal(err)
	}
	f, _ = Decode(raw)
	e, _ = Decode(f["error"])
	if String(e, "outcome") != "OUTCOME_UNKNOWN" {
		t.Fatalf("timeout %s", raw)
	}
	// A late result for the timed-out ID must not settle any newer request.
	if err = WriteLine(c, MustEncode(map[string]any{"v": 1, "kind": "services.result", "protocol": managedTestProtocol, "requestId": "req_1", "serviceId": "test-service", "providerEpoch": epoch, "result": map[string]any{"late": true}})); err != nil {
		t.Fatal(err)
	}
	if err = WriteFrame(w, managedBrowserRequest("66666666-1111-4111-8111-111111111111", epoch, "operation")); err != nil {
		t.Fatal(err)
	}
	raw, err = ReadLine(reader)
	if err != nil {
		t.Fatal(err)
	}
	f, _ = Decode(raw)
	if String(f, "requestId") != "req_6" {
		t.Fatalf("admission ID was reused %s", raw)
	}
}
func TestManagedHostRejectsForeignOwnerAndEpoch(t *testing.T) {
	h, w, r, socket := testHost(t)
	managedWelcome(t, h, w)
	_, reader, epoch := managedRegister(t, socket, r)
	for _, raw := range [][]byte{
		bytes.ReplaceAll(managedBrowserRequest("11111111-1111-4111-8111-111111111111", epoch, "accounts"), []byte(testExtensionID), []byte(strings.Repeat("b", 32))),
		managedBrowserRequest("22222222-2222-4222-8222-222222222222", "retired_epoch", "accounts"),
	} {
		if err := WriteFrame(w, raw); err != nil {
			t.Fatal(err)
		}
		answer, err := ReadFrame(r)
		if err != nil {
			t.Fatal(err)
		}
		f, _ := Decode(answer)
		e, _ := Decode(f["error"])
		if String(e, "outcome") != "NOT_DISPATCHED" {
			t.Fatalf("identity %s", answer)
		}
	}
	if err := WriteFrame(w, managedBrowserRequest("33333333-3333-4333-8333-333333333333", epoch, "accounts")); err != nil {
		t.Fatal(err)
	}
	raw, err := ReadLine(reader)
	if err != nil {
		t.Fatal(err)
	}
	f, _ := Decode(raw)
	if String(f, "requestId") != "req_1" {
		t.Fatalf("unauthorized request was dispatched %s", raw)
	}
}
func TestManagedHostRequiresVersionAndOriginalSocketAuthentication(t *testing.T) {
	h, w, _, socket := testHost(t)
	welcome(t, h, w, false)
	c, reader := local(t, socket)
	registration := MustEncode(map[string]any{"v": 1, "kind": "services.register", "protocol": managedTestProtocol, "descriptor": map[string]any{
		"serviceId": "test-service", "serviceInstanceId": "instance_1", "productName": "Test service", "origin": "http://service-test.localhost:43121", "capabilities": []string{}}})
	if err := WriteLine(c, registration); err != nil {
		t.Fatal(err)
	}
	if _, err := ReadLine(reader); err == nil {
		t.Fatal("unnegotiated registration accepted")
	}
	bad, err := net.DialUnix("unix", nil, &net.UnixAddr{Name: socket, Net: "unix"})
	if err != nil {
		t.Fatal(err)
	}
	defer bad.Close()
	_ = bad.SetDeadline(time.Now().Add(time.Second))
	if err = WriteLine(bad, MustEncode(map[string]any{"v": 1, "kind": "auth", "credential": strings.Repeat("f", 64)})); err != nil {
		t.Fatal(err)
	}
	if _, err = ReadLine(bufio.NewReaderSize(bad, MaxBytes+2)); err == nil {
		t.Fatal("unpaired socket accepted")
	}
	h.mu.Lock()
	count := len(h.managedProviders)
	h.mu.Unlock()
	if count != 0 {
		t.Fatal("untrusted provider retained")
	}
}
func TestManagedHostRegistrationConflictAndEpochRetirement(t *testing.T) {
	h, w, r, socket := testHost(t)
	managedWelcome(t, h, w)
	c, _, epoch := managedRegister(t, socket, r)
	second, reader := local(t, socket)
	if err := WriteLine(second, MustEncode(map[string]any{"v": 1, "kind": "services.register", "protocol": managedTestProtocol, "descriptor": map[string]any{
		"serviceId": "test-service", "serviceInstanceId": "instance_2", "productName": "Collision", "origin": "http://other.localhost:43122", "capabilities": []string{}}})); err != nil {
		t.Fatal(err)
	}
	if _, err := ReadLine(reader); err == nil {
		t.Fatal("conflicting provider accepted")
	}
	c.Close()
	if _, err := ReadFrame(r); err != nil {
		t.Fatal(err)
	}
	next, nextReader, nextEpoch := managedRegister(t, socket, r)
	defer next.Close()
	if epoch == nextEpoch {
		t.Fatal("provider epoch reused")
	}
	if err := WriteFrame(w, managedBrowserRequest("11111111-1111-4111-8111-111111111111", epoch, "bind")); err != nil {
		t.Fatal(err)
	}
	raw, err := ReadFrame(r)
	if err != nil {
		t.Fatal(err)
	}
	f, _ := Decode(raw)
	e, _ := Decode(f["error"])
	if String(e, "outcome") != "NOT_DISPATCHED" {
		t.Fatalf("old epoch %s", raw)
	}
	if err = WriteFrame(w, managedBrowserRequest("22222222-2222-4222-8222-222222222222", nextEpoch, "bind")); err != nil {
		t.Fatal(err)
	}
	raw, err = ReadLine(nextReader)
	if err != nil {
		t.Fatal(err)
	}
	f, _ = Decode(raw)
	if String(f, "requestId") != "req_1" {
		t.Fatalf("new epoch sequence %s", raw)
	}
}

// Explicit cross-process fixture for the Browser owner's Node integration test.
// It uses a disposable install root and fixed synthetic credentials only; normal
// package tests skip it. This is not an installed Native Host or Chrome proof.
func TestManagedHostProcessFixture(t *testing.T) {
	root := os.Getenv("OPENDESK_MANAGED_HOST_FIXTURE_ROOT")
	if root == "" {
		t.Skip("explicit isolated Node integration fixture")
	}
	cfg := Installation{Name: HostName, ExtensionID: testExtensionID, ClientCredential: strings.Repeat("a", 64),
		InstallRoot: root, SocketPath: filepath.Join(root, "agent.sock"), Provider: "opendesk"}
	h, err := NewHost(cfg, "chrome-extension://"+testExtensionID+"/", os.Stdin, os.Stdout)
	if err != nil {
		t.Fatal(err)
	}
	if err = h.Run(); err != nil && !errors.Is(err, io.EOF) {
		t.Fatal(err)
	}
}

func TestManagedHostChromeCloseRetiresProviderAndPending(t *testing.T) {
	h, w, r, socket := testHost(t)
	managedWelcome(t, h, w)
	_, reader, epoch := managedRegister(t, socket, r)
	if err := WriteFrame(w, managedBrowserRequest("11111111-1111-4111-8111-111111111111", epoch, "bind")); err != nil {
		t.Fatal(err)
	}
	if _, err := ReadLine(reader); err != nil {
		t.Fatal(err)
	}
	h.Close()
	if _, err := ReadLine(reader); err == nil {
		t.Fatal("provider socket survived Chrome exit")
	}
	h.mu.Lock()
	providers, pending := len(h.managedProviders), len(h.managedPending)
	h.mu.Unlock()
	if providers != 0 || pending != 0 {
		t.Fatalf("host retained %d providers and %d pending", providers, pending)
	}
}
