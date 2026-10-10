//go:build darwin || linux

package browserbridge

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"opendesk/internal/browserai"
)

func aiHostWithoutSocket(t *testing.T) (*Host, *io.PipeReader) {
	t.Helper()
	read, write := io.Pipe()
	root := t.TempDir()
	cfg := Installation{Name: HostName, ExtensionID: testExtensionID, ClientCredential: strings.Repeat("a", 64), InstallRoot: root, SocketPath: filepath.Join(root, "agent.sock"), Provider: "opendesk"}
	h, err := NewHost(cfg, "chrome-extension://"+testExtensionID+"/", strings.NewReader(""), write)
	if err != nil {
		t.Fatal(err)
	}
	h.ai.Close()
	h.ai = browserai.NewManager(browserai.Options{Factory: func(context.Context, string) (browserai.Agent, browserai.Capabilities, error) {
		return nil, browserai.Capabilities{SourceKey: "local_codex", State: "CODEX_MISSING", AuthState: "none", SupportedTools: []string{}, OnlineInference: true}, errors.New("untrusted-error-contents")
	}})
	t.Cleanup(func() { h.Close(); read.Close(); write.Close() })
	return h, read
}

func aiNativeRequest(method string) []byte {
	return MustEncode(map[string]any{"v": 1, "kind": "ai.request", "protocol": browserai.Protocol, "requestId": "ai-test-1", "ownerId": "owner-1", "registrationId": "host-1", "generation": 1, "method": method, "params": map[string]any{}})
}
func readAIFrame(t *testing.T, r io.Reader) Fields {
	t.Helper()
	result := make(chan []byte, 1)
	go func() { raw, _ := ReadFrame(r); result <- raw }()
	select {
	case raw := <-result:
		if len(raw) == 0 {
			t.Fatal("empty response")
		}
		fields, err := Decode(raw)
		if err != nil {
			t.Fatal(err)
		}
		return fields
	case <-time.After(2 * time.Second):
		t.Fatal("workflow AI response timed out")
	}
	return nil
}

func TestWorkflowAIRequiresNativeWelcomeAndKeepsLegacyMethods(t *testing.T) {
	h, read := aiHostWithoutSocket(t)
	if err := h.handleChrome(aiNativeRequest("ai.capabilities.read")); err == nil {
		t.Fatal("AI accepted before extension handshake")
	}
	if err := h.handleChrome(MustEncode(map[string]any{"v": 1, "kind": "welcome", "extensionId": testExtensionID, "extensionVersion": "16.0.0"})); err != nil {
		t.Fatal(err)
	}
	if err := h.handleChrome(aiNativeRequest("ai.capabilities.read")); err != nil {
		t.Fatal(err)
	}
	f := readAIFrame(t, read)
	if String(f, "kind") != "ai.response" || String(f, "protocol") != browserai.Protocol || String(f, "ownerId") != "owner-1" || String(f, "registrationId") != "host-1" || Int(f, "generation") != 1 {
		t.Fatal("AI response lost ownership correlation")
	}
	if strings.Contains(string(f["result"]), "untrusted-error-contents") {
		t.Fatal("provider error leaked to Native")
	}
	if len(supportedMethods) != 10 {
		t.Fatal("legacy RPC contract widened")
	}
	legacy, _ := Decode(MustEncode(map[string]any{"v": 1, "kind": "request", "requestId": "local-ai", "method": "ai.session.open", "params": map[string]any{}}))
	if ValidateRequest(legacy) == nil {
		t.Fatal("local native client can open an AI session")
	}
}

func TestWorkflowAICloseHasCapacityWhenPlanningSlotsAreFull(t *testing.T) {
	h, read := aiHostWithoutSocket(t)
	h.ready = true
	h.aiPending = 4
	if err := h.handleChrome(aiNativeRequest("ai.session.close")); err != nil {
		t.Fatal(err)
	}
	f := readAIFrame(t, read)
	if Has(f, "error") {
		t.Fatal("cleanup was blocked behind ordinary AI requests")
	}
	var result struct {
		State string `json:"state"`
	}
	_ = json.Unmarshal(f["result"], &result)
	if result.State != "CLOSED" {
		t.Fatal("owner was not closed")
	}
}

func TestWorkflowAIInvalidProtocolCannotEnterOtherNativeNamespaces(t *testing.T) {
	h, _ := aiHostWithoutSocket(t)
	h.ready = true
	for _, payload := range [][]byte{
		[]byte(strings.Replace(string(aiNativeRequest("ai.capabilities.read")), browserai.Protocol, "unversioned", 1)),
		[]byte(strings.Replace(string(aiNativeRequest("ai.capabilities.read")), "ai.capabilities.read", "command/exec", 1)),
	} {
		if h.handleChrome(payload) == nil {
			t.Fatal("invalid workflow protocol accepted")
		}
	}
}
