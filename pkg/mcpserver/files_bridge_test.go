package mcpserver

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"reflect"
	"sort"
	"strings"
	"sync"
	"testing"
)

const (
	filesBridgeTestWorkspace = "workspace-11111111-2222-4333-8444-555555555555"
	filesBridgeTestRequestID = "66666666-7777-4888-8999-aaaaaaaaaaaa"
	filesBridgeTestFrameMax  = 60 * 1024
	filesBridgeTestTextMax   = 32 * 1024
)

// These tests exercise the real MCP dispatcher with a fake only at the Native
// IPC boundary. They make no claim that a real file was read, written or verified.
type filesBridgeTestCall struct {
	method string
	args   json.RawMessage
}

type filesBridgeTestBackend struct {
	mu       sync.Mutex
	calls    []filesBridgeTestCall
	response json.RawMessage
	err      error
	call     func(context.Context, string, json.RawMessage) (json.RawMessage, error)
}

var _ FilesBridgeBackend = (*filesBridgeTestBackend)(nil)

func (b *filesBridgeTestBackend) Call(ctx context.Context, method string, args json.RawMessage) (json.RawMessage, error) {
	b.mu.Lock()
	b.calls = append(b.calls, filesBridgeTestCall{method: method, args: append(json.RawMessage(nil), args...)})
	b.mu.Unlock()
	if b.call != nil {
		return b.call(ctx, method, args)
	}
	if b.err != nil || b.response != nil {
		return b.response, b.err
	}
	return filesBridgeTestReply(map[string]any{}, method == "files.write"), nil
}

func (b *filesBridgeTestBackend) recorded() []filesBridgeTestCall {
	b.mu.Lock()
	defer b.mu.Unlock()
	return append([]filesBridgeTestCall(nil), b.calls...)
}

func filesBridgeTestReply(data map[string]any, written bool) json.RawMessage {
	fileWritten := "NOT_APPLICABLE"
	if written {
		fileWritten = "CONFIRMED"
	}
	raw, err := json.Marshal(map[string]any{
		"ok":   true,
		"data": data,
		"stages": map[string]any{
			"requestAccepted":  "ACCEPTED",
			"fileWritten":      fileWritten,
			"readBackVerified": written,
			"toolResult":       "PREPARED",
		},
	})
	if err != nil {
		panic(err)
	}
	return raw
}

func filesBridgeTestServer(t *testing.T, backend FilesBridgeBackend) *Server {
	t.Helper()
	s, err := NewFilesBridgeServer(backend)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := s.Close(); err != nil {
			t.Error(err)
		}
	})
	return s
}

func filesBridgeTestArguments(name string) map[string]any {
	switch name {
	case "tm_files_status":
		return map[string]any{}
	case "tm_files_list":
		return map[string]any{"workspaceId": filesBridgeTestWorkspace, "path": ""}
	case "tm_files_read":
		return map[string]any{"workspaceId": filesBridgeTestWorkspace, "path": "notes/example.txt"}
	case "tm_files_write":
		return map[string]any{
			"workspaceId":    filesBridgeTestWorkspace,
			"path":           "notes/example.txt",
			"requestId":      filesBridgeTestRequestID,
			"content":        "replacement text\n",
			"expectedSha256": strings.Repeat("a", 64),
		}
	default:
		return map[string]any{}
	}
}

func filesBridgeTestJSON(t *testing.T, value any) json.RawMessage {
	t.Helper()
	raw, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func filesBridgeTestRequest(t *testing.T, name string, args any) Request {
	t.Helper()
	return Request{JSONRPC: "2.0", ID: json.RawMessage(`1`), Method: "tools/call", Params: filesBridgeTestJSON(t, map[string]any{"name": name, "arguments": args})}
}

func filesBridgeTestFailed(r Response) bool {
	if r.Error != nil {
		return true
	}
	var result struct {
		IsError bool `json:"isError"`
	}
	return json.Unmarshal(r.Result, &result) == nil && result.IsError
}

func filesBridgeTestPayload(t *testing.T, r Response) (map[string]any, bool) {
	t.Helper()
	if r.Error != nil {
		t.Fatalf("expected MCP tool result, got protocol error: %+v", r.Error)
	}
	var result struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		IsError bool `json:"isError"`
	}
	if err := json.Unmarshal(r.Result, &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Content) != 1 || result.Content[0].Type != "text" {
		t.Fatalf("expected one JSON text result: %s", r.Result)
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(result.Content[0].Text), &payload); err != nil {
		t.Fatalf("tool text is not JSON: %v", err)
	}
	return payload, result.IsError
}

func filesBridgeTestReject(t *testing.T, s *Server, backend *filesBridgeTestBackend, req Request) {
	t.Helper()
	before := len(backend.recorded())
	if r := s.Handle(req); !filesBridgeTestFailed(r) {
		t.Fatalf("invalid request accepted: %+v %s", r.Error, r.Result)
	}
	if after := len(backend.recorded()); after != before {
		t.Fatalf("rejected input reached Native boundary: before=%d after=%d", before, after)
	}
}

func filesBridgeTestStream(t *testing.T, s *Server, input string) ([]Response, []byte) {
	t.Helper()
	var output bytes.Buffer
	if err := s.ServeStream(strings.NewReader(input), &output); err != nil {
		t.Fatal(err)
	}
	raw := append([]byte(nil), output.Bytes()...)
	decoder := json.NewDecoder(&output)
	var responses []Response
	for {
		var response Response
		if err := decoder.Decode(&response); err == io.EOF {
			break
		} else if err != nil {
			t.Fatal(err)
		}
		responses = append(responses, response)
	}
	return responses, raw
}

func TestFilesBridgeConstructorAndExactSurface(t *testing.T) {
	if s, err := NewFilesBridgeServer(nil); err == nil || s != nil {
		t.Fatal("nil Native backend accepted")
	}
	var typedNil *filesBridgeTestBackend
	if s, err := NewFilesBridgeServer(typedNil); err == nil || s != nil {
		t.Fatal("typed-nil Native backend accepted")
	}
	backend := &filesBridgeTestBackend{}
	s := filesBridgeTestServer(t, backend)
	if s.runtime != nil || s.webFileTest != nil {
		t.Fatal("file-only constructor initialized a different capability owner")
	}
	want := []string{"tm_files_list", "tm_files_read", "tm_files_status", "tm_files_write"}
	for _, readOnly := range []bool{false, true} {
		// General desktop allowlists and annotation hints are not this surface's
		// authorization boundary, even if an internal caller sets that flag.
		s.readOnly = readOnly
		r := s.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(`1`), Method: "tools/list"})
		if r.Error != nil {
			t.Fatal(r.Error)
		}
		var result struct {
			Tools []Tool `json:"tools"`
		}
		if err := json.Unmarshal(r.Result, &result); err != nil {
			t.Fatal(err)
		}
		var names []string
		for _, tool := range result.Tools {
			names = append(names, tool.Name)
			if tool.InputSchema["type"] != "object" || tool.InputSchema["additionalProperties"] != false {
				t.Fatalf("open argument schema for %s: %+v", tool.Name, tool.InputSchema)
			}
			properties, ok := tool.InputSchema["properties"].(map[string]any)
			if !ok {
				t.Fatalf("missing properties for %s", tool.Name)
			}
			for _, forbidden := range []string{"principal", "sessionId", "leaseEpoch", "credential", "shell", "root"} {
				if _, ok := properties[forbidden]; ok {
					t.Fatalf("model authority field %s exposed in %s", forbidden, tool.Name)
				}
			}
		}
		sort.Strings(names)
		if !reflect.DeepEqual(names, want) {
			t.Fatalf("readOnly=%v surface=%v, want %v", readOnly, names, want)
		}
	}
	if len(backend.recorded()) != 0 {
		t.Fatal("discovery called Native")
	}
	for _, general := range []*Server{NewServer(nil), NewServerWithOptions(nil, ServerOptions{ReadOnly: true})} {
		for _, name := range want {
			if _, exists := general.tools[name]; exists {
				t.Fatalf("file bridge tool %s leaked into general mode", name)
			}
		}
	}
}

func TestFilesBridgeRejectsGeneralCapabilitiesAtEveryDispatchSeam(t *testing.T) {
	backend := &filesBridgeTestBackend{}
	s := filesBridgeTestServer(t, backend)
	denied := map[string]bool{
		"tm_files_create": true, "tm_files_delete": true, "tm_files_move": true,
		"files.write": true, "workspaces.add": true, "tm_shell": true,
	}
	for name := range NewServer(nil).tools {
		denied[name] = true
	}
	for name := range denied {
		filesBridgeTestReject(t, s, backend, filesBridgeTestRequest(t, name, map[string]any{}))
		if _, err := s.callTool(name, map[string]any{}); err == nil {
			t.Fatalf("direct dispatch allowed %s", name)
		}
		if _, err := s.callToolCore(name, map[string]any{}); err == nil {
			t.Fatalf("core dispatch allowed %s", name)
		}
	}
	// Discovery-map changes must not grant desktop or shell capability.
	s.tools["tm_status"] = Tool{Name: "tm_status", InputSchema: map[string]any{"type": "object"}}
	filesBridgeTestReject(t, s, backend, filesBridgeTestRequest(t, "tm_status", map[string]any{}))
	if len(backend.recorded()) != 0 {
		t.Fatal("a forbidden capability reached Native")
	}
}

func TestFilesBridgeInitializeAndMetadataAreProtocolOnly(t *testing.T) {
	backend := &filesBridgeTestBackend{}
	s := filesBridgeTestServer(t, backend)
	initialize := Request{JSONRPC: "2.0", ID: json.RawMessage(`"init"`), Method: "initialize", Params: json.RawMessage(`{"protocolVersion":"2025-11-25","capabilities":{"roots":{"listChanged":true}},"clientInfo":{"name":"ChatGPT","version":"1.0"},"_meta":{"client/extension":"metadata"}}`)}
	if r := s.Handle(initialize); r.Error != nil {
		t.Fatalf("normal MCP initialize rejected: %+v", r.Error)
	}
	if len(backend.recorded()) != 0 {
		t.Fatal("initialize delegated model metadata to Native")
	}
	for _, name := range []string{"tm_files_status", "tm_files_list", "tm_files_read", "tm_files_write"} {
		args := filesBridgeTestArguments(name)
		params := map[string]any{
			"name": name, "arguments": args,
			"_meta": map[string]any{"progressToken": 7, "principal": "untrusted", "sessionId": "untrusted", "leaseEpoch": 999, "credential": "untrusted"},
		}
		req := Request{JSONRPC: "2.0", ID: json.RawMessage(`1`), Method: "tools/call", Params: filesBridgeTestJSON(t, params)}
		if r := s.Handle(req); filesBridgeTestFailed(r) {
			t.Fatalf("valid %s rejected: %+v %s", name, r.Error, r.Result)
		}
		calls := backend.recorded()
		call := calls[len(calls)-1]
		if call.method != strings.Replace(name, "tm_files_", "files.", 1) {
			t.Fatalf("wrong Native method for %s: %s", name, call.method)
		}
		var forwarded map[string]any
		if err := json.Unmarshal(call.args, &forwarded); err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(forwarded, args) {
			t.Fatalf("metadata or authority injected into Native arguments: got %+v want %+v", forwarded, args)
		}
	}
	// MCP permits omitted arguments for a tool with no required fields.
	if r := s.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(`9`), Method: "tools/call", Params: json.RawMessage(`{"name":"tm_files_status","_meta":{}}`)}); filesBridgeTestFailed(r) {
		t.Fatalf("omitted status arguments rejected: %+v %s", r.Error, r.Result)
	}
	if len(backend.recorded()) != 5 {
		t.Fatalf("unexpected dispatch count: %d", len(backend.recorded()))
	}
}

func TestFilesBridgeUnknownArgumentsAndTypesNeverReachNative(t *testing.T) {
	backend := &filesBridgeTestBackend{}
	s := filesBridgeTestServer(t, backend)
	for _, name := range []string{"tm_files_status", "tm_files_list", "tm_files_read", "tm_files_write"} {
		for _, key := range []string{"principal", "principalId", "sessionId", "lease", "leaseEpoch", "credential", "token", "extensionId", "root", "absolutePath", "recordingSessionId", "shell", "create", "overwrite", "_meta"} {
			args := filesBridgeTestArguments(name)
			args[key] = "untrusted"
			filesBridgeTestReject(t, s, backend, filesBridgeTestRequest(t, name, args))
		}
		for key := range filesBridgeTestArguments(name) {
			for _, invalid := range []any{nil, true, 42, []any{}, map[string]any{}} {
				args := filesBridgeTestArguments(name)
				args[key] = invalid
				filesBridgeTestReject(t, s, backend, filesBridgeTestRequest(t, name, args))
			}
			args := filesBridgeTestArguments(name)
			delete(args, key)
			filesBridgeTestReject(t, s, backend, filesBridgeTestRequest(t, name, args))
		}
	}
	for _, invalid := range []any{nil, true, 42, []any{}, map[string]any{}} {
		filesBridgeTestReject(t, s, backend, filesBridgeTestRequest(t, "tm_files_status", map[string]any{"requestId": invalid}))
	}
}

func TestFilesBridgeIdentifiersPathsAndWritePreconditions(t *testing.T) {
	backend := &filesBridgeTestBackend{}
	s := filesBridgeTestServer(t, backend)
	for _, invalid := range []string{"", "not-a-uuid", filesBridgeTestRequestID + " ", "../" + filesBridgeTestRequestID} {
		for _, name := range []string{"tm_files_status", "tm_files_write"} {
			args := filesBridgeTestArguments(name)
			args["requestId"] = invalid
			filesBridgeTestReject(t, s, backend, filesBridgeTestRequest(t, name, args))
		}
	}
	for _, name := range []string{"tm_files_list", "tm_files_read", "tm_files_write"} {
		for _, invalid := range []string{"", "workspace-not-a-uuid", "/private/workspace", filesBridgeTestWorkspace + "/"} {
			args := filesBridgeTestArguments(name)
			args["workspaceId"] = invalid
			filesBridgeTestReject(t, s, backend, filesBridgeTestRequest(t, name, args))
		}
		for _, invalid := range []string{"/private/file.txt", "../file.txt", "notes/../file.txt", "./file.txt", "notes//file.txt", `C:\private\file.txt`, `notes\file.txt`, "file\x00.txt"} {
			args := filesBridgeTestArguments(name)
			args["path"] = invalid
			filesBridgeTestReject(t, s, backend, filesBridgeTestRequest(t, name, args))
		}
	}
	for _, name := range []string{"tm_files_read", "tm_files_write"} {
		args := filesBridgeTestArguments(name)
		args["path"] = ""
		filesBridgeTestReject(t, s, backend, filesBridgeTestRequest(t, name, args))
	}
	for _, invalid := range []string{"", strings.Repeat("a", 63), strings.Repeat("a", 65), strings.Repeat("A", 64), strings.Repeat("g", 64)} {
		args := filesBridgeTestArguments("tm_files_write")
		args["expectedSha256"] = invalid
		filesBridgeTestReject(t, s, backend, filesBridgeTestRequest(t, "tm_files_write", args))
	}
	if _, err := s.callTool("tm_files_write", map[string]any{"workspaceId": filesBridgeTestWorkspace, "path": "notes/example.txt", "content": "replacement"}); err == nil {
		t.Fatal("direct dispatch bypassed requestId/hash preconditions")
	}
	if len(backend.recorded()) != 0 {
		t.Fatal("invalid precondition reached Native")
	}
}

func TestFilesBridgeRejectsAmbiguousCallWrappers(t *testing.T) {
	backend := &filesBridgeTestBackend{}
	s := filesBridgeTestServer(t, backend)
	for _, raw := range []string{
		`null`, `[]`, `true`, `"tools/call"`,
		`{"name":null,"arguments":{}}`, `{"name":1,"arguments":{}}`,
		`{"name":"tm_files_status","arguments":null}`, `{"name":"tm_files_status","arguments":[]}`,
		`{"name":"tm_files_status","_meta":null}`, `{"name":"tm_files_status","_meta":[]}`,
		`{"name":"tm_files_status","name":"tm_files_status"}`,
		`{"name":"tm_files_status","na\u006de":"tm_files_status"}`,
		`{"name":"tm_files_status","arguments":{},"arguments":{}}`,
		`{"name":"tm_files_status","_meta":{},"_meta":{}}`,
		`{"name":"tm_files_status","arguments":{},"sessionId":"forged"}`,
		`{"Name":"tm_files_status","arguments":{}}`,
		`{"name":"tm_files_status","arguments":{"requestId":"` + filesBridgeTestRequestID + `","requestId":"` + filesBridgeTestRequestID + `"}}`,
		`{"name":"tm_files_read","arguments":{"workspaceId":"` + filesBridgeTestWorkspace + `","path":"first.txt","pa\u0074h":"second.txt"}}`,
	} {
		filesBridgeTestReject(t, s, backend, Request{JSONRPC: "2.0", ID: json.RawMessage(`1`), Method: "tools/call", Params: json.RawMessage(raw)})
	}
}

func TestFilesBridgeNotificationsAndInvalidIDsNeverDispatch(t *testing.T) {
	backend := &filesBridgeTestBackend{}
	s := filesBridgeTestServer(t, backend)
	req := filesBridgeTestRequest(t, "tm_files_write", filesBridgeTestArguments("tm_files_write"))
	req.ID = nil
	if r := s.Handle(req); len(r.Result) != 0 || r.Error != nil || len(r.ID) != 0 {
		t.Fatalf("notification generated a response: %+v", r)
	}
	if r := s.handleToolsCall(req); !filesBridgeTestFailed(r) {
		t.Fatal("direct handler accepted a write without an RPC id")
	}
	for _, id := range []string{`null`, `true`, `1.5`, `[]`, `{}`} {
		req.ID = json.RawMessage(id)
		filesBridgeTestReject(t, s, backend, req)
	}
	req.ID = nil
	input := string(filesBridgeTestJSON(t, req)) + "\n" + `{"jsonrpc":"2.0","method":"notifications/initialized"}` + "\n" + `{"jsonrpc":"2.0","method":"ping","id":2}` + "\n"
	responses, _ := filesBridgeTestStream(t, s, input)
	if len(responses) != 1 || responses[0].Error != nil || string(responses[0].ID) != "2" {
		t.Fatalf("notifications affected stream response sequence: %+v", responses)
	}
	if len(backend.recorded()) != 0 {
		t.Fatal("notification or invalid id reached Native")
	}
}

func TestFilesBridgeStreamRejectsUnknownAndDuplicateEnvelopeFields(t *testing.T) {
	params := string(filesBridgeTestJSON(t, map[string]any{"name": "tm_files_write", "arguments": filesBridgeTestArguments("tm_files_write")}))
	for _, fields := range []string{
		`"method":"ping","method":"tools/call","params":` + params + `,"id":1`,
		`"metho\u0064":"ping","method":"tools/call","params":` + params + `,"id":1`,
		`"method":"tools/call","params":{},"params":` + params + `,"id":1`,
		`"method":"tools/call","params":` + params + `,"id":null,"id":1`,
		`"method":"tools/call","params":` + params + `,"id":1,"id":1`,
		`"method":"tools/call","params":` + params + `,"id":1,"jsonrpc":"2.0"`,
		`"method":"tools/call","params":` + params + `,"id":1,"principal":"forged"`,
		`"method":"tools/call","params":` + params + `,"id":1,"sessionId":"forged"`,
		`"method":"tools/call","params":` + params + `,"id":1,"ID":1`,
		`"Method":"tools/call","params":` + params + `,"id":1`,
		`"method":"tools/call","PARAMS":` + params + `,"id":1`,
		`"method":"tools/call","param\u017f":` + params + `,"id":1`,
		`"method":"ping","method":"tools/call","params":` + params,
	} {
		backend := &filesBridgeTestBackend{}
		s := filesBridgeTestServer(t, backend)
		input := `{"jsonrpc":"2.0",` + fields + "}\n" + `{"jsonrpc":"2.0","method":"ping","id":2}` + "\n"
		responses, _ := filesBridgeTestStream(t, s, input)
		if len(responses) != 2 || responses[0].Error == nil || responses[0].Error.Code != ErrCodeInvalidRequest || string(responses[0].ID) != "null" {
			t.Fatalf("ambiguous envelope was not rejected: %+v", responses)
		}
		if responses[1].Error != nil || string(responses[1].ID) != "2" {
			t.Fatal("rejected envelope corrupted following request")
		}
		if len(backend.recorded()) != 0 {
			t.Fatal("rejected envelope dispatched a mutation")
		}
	}
}

func TestFilesBridgeTextByteAndCompleteRequestLimits(t *testing.T) {
	backend := &filesBridgeTestBackend{}
	s := filesBridgeTestServer(t, backend)
	for _, content := range []string{"", strings.Repeat("x", filesBridgeTestTextMax), strings.Repeat("界", filesBridgeTestTextMax/3)} {
		args := filesBridgeTestArguments("tm_files_write")
		args["content"] = content
		if r := s.Handle(filesBridgeTestRequest(t, "tm_files_write", args)); filesBridgeTestFailed(r) {
			t.Fatalf("valid UTF-8 content of %d bytes rejected: %+v %s", len(content), r.Error, r.Result)
		}
	}
	for _, content := range []string{strings.Repeat("x", filesBridgeTestTextMax+1), strings.Repeat("界", filesBridgeTestTextMax/3+1), "before\x00after"} {
		args := filesBridgeTestArguments("tm_files_write")
		args["content"] = content
		filesBridgeTestReject(t, s, backend, filesBridgeTestRequest(t, "tm_files_write", args))
	}
	invalidUTF8 := []byte(`{"name":"tm_files_write","arguments":{"workspaceId":"` + filesBridgeTestWorkspace + `","path":"notes/example.txt","requestId":"` + filesBridgeTestRequestID + `","expectedSha256":"` + strings.Repeat("a", 64) + `","content":"`)
	invalidUTF8 = append(invalidUTF8, 0xff)
	invalidUTF8 = append(invalidUTF8, []byte(`"}}`)...)
	filesBridgeTestReject(t, s, backend, Request{JSONRPC: "2.0", ID: json.RawMessage(`5`), Method: "tools/call", Params: invalidUTF8})
	// Every field, including ignored MCP metadata and the RPC id, counts toward
	// the complete frame limit. UTF-8 content size alone is insufficient.
	for _, oversized := range []Request{
		{JSONRPC: "2.0", ID: json.RawMessage(`7`), Method: "tools/call", Params: filesBridgeTestJSON(t, map[string]any{"name": "tm_files_write", "arguments": filesBridgeTestArguments("tm_files_write"), "_meta": map[string]any{"padding": strings.Repeat("x", filesBridgeTestFrameMax)}})},
		{JSONRPC: "2.0", ID: filesBridgeTestJSON(t, strings.Repeat("i", filesBridgeTestFrameMax)), Method: "tools/call", Params: filesBridgeTestRequest(t, "tm_files_write", filesBridgeTestArguments("tm_files_write")).Params},
	} {
		filesBridgeTestReject(t, s, backend, oversized)
		before := len(backend.recorded())
		responses, raw := filesBridgeTestStream(t, s, string(filesBridgeTestJSON(t, oversized))+"\n")
		if len(responses) != 1 || !filesBridgeTestFailed(responses[0]) || len(raw) > filesBridgeTestFrameMax+1 {
			t.Fatalf("oversized frame produced an invalid rejection: responses=%d bytes=%d", len(responses), len(raw))
		}
		if len(backend.recorded()) != before {
			t.Fatal("oversized frame reached Native")
		}
	}
	args := filesBridgeTestArguments("tm_files_write")
	args["content"] = strings.Repeat("\x01", filesBridgeTestTextMax/2)
	filesBridgeTestReject(t, s, backend, filesBridgeTestRequest(t, "tm_files_write", args))
}

func TestFilesBridgeReadPreservesBytesAndNativeStages(t *testing.T) {
	content := "first line\r\n\t\"quoted\" \\ second line\n中文 😀\n"
	digest := sha256.Sum256([]byte(content))
	sha := hex.EncodeToString(digest[:])
	backend := &filesBridgeTestBackend{response: filesBridgeTestReply(map[string]any{
		"workspaceId": filesBridgeTestWorkspace, "path": "notes/example.txt", "content": content, "sha256": sha, "bytes": len(content),
	}, false)}
	s := filesBridgeTestServer(t, backend)
	var previous json.RawMessage
	for _, id := range []string{`1`, `"different-rpc-id"`} {
		req := filesBridgeTestRequest(t, "tm_files_read", filesBridgeTestArguments("tm_files_read"))
		req.ID = json.RawMessage(id)
		r := s.Handle(req)
		payload, isError := filesBridgeTestPayload(t, r)
		if isError || payload["ok"] != true || string(r.ID) != id {
			t.Fatalf("read failed: %s", r.Result)
		}
		data, ok := payload["data"].(map[string]any)
		if !ok || data["content"] != content || data["sha256"] != sha || data["bytes"] != float64(len(content)) {
			t.Fatalf("read changed Native bytes or digest: %+v", data)
		}
		stages, ok := payload["stages"].(map[string]any)
		if !ok || stages["requestAccepted"] != "ACCEPTED" || stages["fileWritten"] != "NOT_APPLICABLE" || stages["readBackVerified"] != false || stages["toolResult"] != "PREPARED" {
			t.Fatalf("adapter invented verification or delivery: %+v", stages)
		}
		if previous != nil && !bytes.Equal(previous, r.Result) {
			t.Fatal("identical Native reads produced inconsistent MCP content")
		}
		previous = append(json.RawMessage(nil), r.Result...)
	}
	if len(backend.recorded()) != 2 {
		t.Fatal("read was retried or synthesized without Native")
	}
}

func TestFilesBridgeWireWhitespaceAndProtocolErrorsRespectFrameLimit(t *testing.T) {
	for _, leading := range []bool{true, false} {
		backend := &filesBridgeTestBackend{}
		s := filesBridgeTestServer(t, backend)
		req := filesBridgeTestRequest(t, "tm_files_write", filesBridgeTestArguments("tm_files_write"))
		raw := string(filesBridgeTestJSON(t, req))
		padding := strings.Repeat(" ", filesBridgeTestFrameMax+1-len(raw))
		input := raw + padding + "\n"
		if leading {
			input = padding + raw + "\n"
		}
		responses, output := filesBridgeTestStream(t, s, input)
		if len(responses) != 1 || !filesBridgeTestFailed(responses[0]) || len(output) > filesBridgeTestFrameMax+1 {
			t.Fatal("oversized wire frame was accepted after whitespace trimming")
		}
		if len(backend.recorded()) != 0 {
			t.Fatal("wire padding bypassed the pre-dispatch frame budget")
		}
	}
	backend := &filesBridgeTestBackend{}
	s := filesBridgeTestServer(t, backend)
	req := Request{JSONRPC: "2.0", ID: json.RawMessage(`1`), Method: ""}
	baseSize := len(filesBridgeTestJSON(t, req))
	req.Method = strings.Repeat("m", filesBridgeTestFrameMax-baseSize)
	raw := filesBridgeTestJSON(t, req)
	if len(raw) != filesBridgeTestFrameMax {
		t.Fatal("test did not construct a request at the complete frame limit")
	}
	r := s.Handle(req)
	if r.Error == nil || len(filesBridgeTestJSON(t, r)) > filesBridgeTestFrameMax {
		t.Fatal("unknown method expanded into an oversized protocol response")
	}
	responses, output := filesBridgeTestStream(t, s, string(raw)+"\n")
	if len(responses) != 1 || responses[0].Error == nil || len(output) > filesBridgeTestFrameMax+1 || len(backend.recorded()) != 0 {
		t.Fatal("protocol error escaped the complete outgoing-frame budget")
	}
}

func TestFilesBridgeHistoricalReceiptDoesNotClaimCurrentReadback(t *testing.T) {
	var historical map[string]any
	if err := json.Unmarshal(filesBridgeTestReply(map[string]any{"saved": true}, true), &historical); err != nil {
		t.Fatal(err)
	}
	backend := &filesBridgeTestBackend{response: filesBridgeTestReply(map[string]any{
		"requestId": filesBridgeTestRequestID, "receiptStatus": "KNOWN", "receipt": historical,
	}, false)}
	s := filesBridgeTestServer(t, backend)
	r := s.Handle(filesBridgeTestRequest(t, "tm_files_status", map[string]any{"requestId": filesBridgeTestRequestID}))
	payload, isError := filesBridgeTestPayload(t, r)
	stages, ok := payload["stages"].(map[string]any)
	if isError || !ok || stages["fileWritten"] != "NOT_APPLICABLE" || stages["readBackVerified"] != false {
		t.Fatalf("historical receipt became current disk evidence: %+v", payload)
	}
	data, ok := payload["data"].(map[string]any)
	if !ok || data["receiptStatus"] != "KNOWN" || !reflect.DeepEqual(data["receipt"], historical) {
		t.Fatalf("owner receipt was changed: %+v", data)
	}
	calls := backend.recorded()
	if len(calls) != 1 || calls[0].method != "files.status" {
		t.Fatal("receipt lookup executed a new read or write")
	}
}

func TestFilesBridgeStableRequestIDIsIndependentOfRPCID(t *testing.T) {
	backend := &filesBridgeTestBackend{}
	s := filesBridgeTestServer(t, backend)
	for _, id := range []string{`11`, `"new-jsonrpc-id"`} {
		req := filesBridgeTestRequest(t, "tm_files_write", filesBridgeTestArguments("tm_files_write"))
		req.ID = json.RawMessage(id)
		if r := s.Handle(req); filesBridgeTestFailed(r) || string(r.ID) != id {
			t.Fatalf("write result lost RPC identity: %+v %s", r.Error, r.Result)
		}
	}
	calls := backend.recorded()
	if len(calls) != 2 {
		t.Fatalf("explicit writes must each cross the owner boundary once: %d", len(calls))
	}
	for _, call := range calls {
		var args map[string]any
		if err := json.Unmarshal(call.args, &args); err != nil {
			t.Fatal(err)
		}
		if call.method != "files.write" || args["requestId"] != filesBridgeTestRequestID {
			t.Fatal("adapter replaced the owner's stable mutation identity")
		}
	}
	if !bytes.Equal(calls[0].args, calls[1].args) {
		t.Fatal("RPC identity changed the owner request; deduplication belongs to Native")
	}
}

func TestFilesBridgeUnknownWriteQueriesNeverReplayMutation(t *testing.T) {
	backend := &filesBridgeTestBackend{call: func(_ context.Context, method string, args json.RawMessage) (json.RawMessage, error) {
		switch method {
		case "files.write":
			return nil, errors.New("lost response from /private/native/socket with token=secret-token")
		case "files.status":
			return filesBridgeTestReply(map[string]any{"requestId": filesBridgeTestRequestID, "receiptStatus": "UNKNOWN"}, false), nil
		case "files.read":
			return filesBridgeTestReply(map[string]any{"workspaceId": filesBridgeTestWorkspace, "path": "notes/example.txt", "content": "observed text\n"}, false), nil
		default:
			return nil, errors.New("unexpected method")
		}
	}}
	s := filesBridgeTestServer(t, backend)
	r := s.Handle(filesBridgeTestRequest(t, "tm_files_write", filesBridgeTestArguments("tm_files_write")))
	filesBridgeTestUnknownError(t, r)
	if len(backend.recorded()) != 1 {
		t.Fatal("write transport failure caused an automatic replay")
	}
	status := s.Handle(filesBridgeTestRequest(t, "tm_files_status", map[string]any{"requestId": filesBridgeTestRequestID}))
	payload, isError := filesBridgeTestPayload(t, status)
	data, ok := payload["data"].(map[string]any)
	if isError || !ok || data["requestId"] != filesBridgeTestRequestID || data["receiptStatus"] != "UNKNOWN" {
		t.Fatalf("unknown receipt was converted into a conclusion: %+v", payload)
	}
	stages, ok := payload["stages"].(map[string]any)
	if !ok || stages["fileWritten"] != "NOT_APPLICABLE" || stages["readBackVerified"] != false {
		t.Fatalf("receipt query claimed a current write/readback: %+v", stages)
	}
	if r := s.Handle(filesBridgeTestRequest(t, "tm_files_read", filesBridgeTestArguments("tm_files_read"))); filesBridgeTestFailed(r) {
		t.Fatal("explicit recovery read failed")
	}
	calls := backend.recorded()
	var methods []string
	for _, call := range calls {
		methods = append(methods, call.method)
	}
	if !reflect.DeepEqual(methods, []string{"files.write", "files.status", "files.read"}) {
		t.Fatalf("unknown status or recovery read replayed the write: %v", methods)
	}
}

func filesBridgeTestUnknownError(t *testing.T, r Response) {
	t.Helper()
	payload, isError := filesBridgeTestPayload(t, r)
	if !isError || payload["ok"] != false {
		t.Fatalf("failed write reported success: %+v", payload)
	}
	problem, ok := payload["error"].(map[string]any)
	if !ok || problem["code"] != "E_FILES_BRIDGE" || problem["outcome"] != "OUTCOME_UNKNOWN" {
		t.Fatalf("lost write result was not explicitly unknown: %+v", payload)
	}
	for _, secret := range []string{"/private/native", "secret-token", "token="} {
		if strings.Contains(string(r.Result), secret) {
			t.Fatal("Native error details leaked into the MCP result")
		}
	}
	if stages, ok := payload["stages"].(map[string]any); ok {
		if stages["fileWritten"] == "CONFIRMED" || stages["readBackVerified"] == true || stages["toolResult"] == "DELIVERED" {
			t.Fatalf("bridge synthesized positive mutation/delivery evidence: %+v", stages)
		}
	}
}

func TestFilesBridgeMalformedAndOversizedResultsAreUnknownAfterWrite(t *testing.T) {
	for _, tc := range []struct {
		name     string
		response json.RawMessage
	}{
		{"invalid-json", json.RawMessage(`{"ok":`)},
		{"null", json.RawMessage(`null`)},
		{"array", json.RawMessage(`[]`)},
		{"duplicate-ok", json.RawMessage(`{"ok":false,"ok":true,"data":{},"stages":{"requestAccepted":"ACCEPTED","fileWritten":"CONFIRMED","readBackVerified":true,"toolResult":"PREPARED"}}`)},
		{"success-rejected", json.RawMessage(`{"ok":true,"data":{},"stages":{"requestAccepted":"REJECTED","fileWritten":"CONFIRMED","readBackVerified":true,"toolResult":"PREPARED"}}`)},
		{"success-unknown-write", json.RawMessage(`{"ok":true,"data":{},"stages":{"requestAccepted":"ACCEPTED","fileWritten":"UNKNOWN","readBackVerified":true,"toolResult":"PREPARED"}}`)},
		{"success-without-readback", json.RawMessage(`{"ok":true,"data":{},"stages":{"requestAccepted":"ACCEPTED","fileWritten":"CONFIRMED","readBackVerified":false,"toolResult":"PREPARED"}}`)},
		{"raw-response-limit", filesBridgeTestReply(map[string]any{"content": strings.Repeat("x", filesBridgeTestFrameMax)}, true)},
		// Native JSON fits 60 KiB, but wrapping JSON as MCP text requires another
		// round of escaping and exceeds the complete outgoing-frame limit.
		{"wrapped-response-limit", filesBridgeTestReply(map[string]any{"content": strings.Repeat(`"`, 16*1024)}, true)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			backend := &filesBridgeTestBackend{response: tc.response}
			s := filesBridgeTestServer(t, backend)
			req := filesBridgeTestRequest(t, "tm_files_write", filesBridgeTestArguments("tm_files_write"))
			responses, raw := filesBridgeTestStream(t, s, string(filesBridgeTestJSON(t, req))+"\n")
			if len(responses) != 1 {
				t.Fatalf("write produced %d responses", len(responses))
			}
			filesBridgeTestUnknownError(t, responses[0])
			if len(raw) > filesBridgeTestFrameMax+1 {
				t.Fatalf("outgoing MCP frame exceeded limit: %d bytes", len(raw))
			}
			if len(backend.recorded()) != 1 {
				t.Fatal("unusable result caused redispatch")
			}
		})
	}
}

func TestFilesBridgeTypedTransportOutcomeAndErrorSanitization(t *testing.T) {
	for _, tc := range []struct {
		name    string
		err     error
		outcome string
	}{
		{"before-dispatch", &FilesBridgeBackendError{Code: "E_NATIVE_NOT_READY", Outcome: "NOT_DISPATCHED"}, "NOT_DISPATCHED"},
		{"after-dispatch", &FilesBridgeBackendError{Code: "E_EFFECT_UNKNOWN", Outcome: "OUTCOME_UNKNOWN"}, "OUTCOME_UNKNOWN"},
		{"wrapped", fmt.Errorf("/private/native/socket token=secret-token: %w", &FilesBridgeBackendError{Code: "E_NATIVE_NOT_READY", Outcome: "NOT_DISPATCHED"}), "NOT_DISPATCHED"},
		{"unrecognized-outcome", &FilesBridgeBackendError{Code: "/private/native/socket token=secret-token", Outcome: "UNTRUSTED_SUCCESS"}, "OUTCOME_UNKNOWN"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			backend := &filesBridgeTestBackend{err: tc.err}
			s := filesBridgeTestServer(t, backend)
			r := s.Handle(filesBridgeTestRequest(t, "tm_files_write", filesBridgeTestArguments("tm_files_write")))
			payload, isError := filesBridgeTestPayload(t, r)
			problem, ok := payload["error"].(map[string]any)
			if !isError || payload["ok"] != false || !ok || problem["outcome"] != tc.outcome {
				t.Fatalf("concrete dispatch evidence was lost or invented: %+v", payload)
			}
			for _, secret := range []string{"/private/native", "secret-token", "token=", "UNTRUSTED_SUCCESS"} {
				if strings.Contains(string(r.Result), secret) {
					t.Fatal("unsanitized transport error reached MCP")
				}
			}
			if len(backend.recorded()) != 1 {
				t.Fatal("typed transport error triggered a retry")
			}
		})
	}
	for _, name := range []string{"tm_files_status", "tm_files_list", "tm_files_read"} {
		backend := &filesBridgeTestBackend{err: errors.New("/private/native/socket token=secret-token")}
		s := filesBridgeTestServer(t, backend)
		r := s.Handle(filesBridgeTestRequest(t, name, filesBridgeTestArguments(name)))
		payload, isError := filesBridgeTestPayload(t, r)
		if !isError || payload["ok"] != false || strings.Contains(string(r.Result), "/private/native") || strings.Contains(string(r.Result), "secret-token") {
			t.Fatalf("read-only transport error leaked or became success: %s", r.Result)
		}
		if len(backend.recorded()) != 1 {
			t.Fatal("read-only transport failure caused an automatic retry")
		}
	}
}

type filesBridgeTestWriter func([]byte) (int, error)

func (write filesBridgeTestWriter) Write(p []byte) (int, error) { return write(p) }

func TestFilesBridgeDeliveryObserverRecordsActualEmissionOnly(t *testing.T) {
	t.Run("prepared-handle", func(t *testing.T) {
		backend := &filesBridgeTestBackend{}
		s := filesBridgeTestServer(t, backend)
		var events []FilesBridgeDelivery
		s.SetFilesBridgeDeliveryObserver(func(event FilesBridgeDelivery) { events = append(events, event) })
		r := s.Handle(filesBridgeTestRequest(t, "tm_files_write", filesBridgeTestArguments("tm_files_write")))
		payload, isError := filesBridgeTestPayload(t, r)
		stages, ok := payload["stages"].(map[string]any)
		if isError || !ok || stages["toolResult"] != "PREPARED" {
			t.Fatalf("Handle claimed emission without writing a transport: %+v", payload)
		}
		if len(events) != 0 || len(backend.recorded()) != 1 {
			t.Fatal("prepared result was reported as transport delivery")
		}
	})
	for _, failAfter := range []int{-1, 0, 12} {
		name := "emitted"
		if failAfter >= 0 {
			name = fmt.Sprintf("writer-fails-after-%d", failAfter)
		}
		t.Run(name, func(t *testing.T) {
			backend := &filesBridgeTestBackend{}
			s := filesBridgeTestServer(t, backend)
			var events []FilesBridgeDelivery
			s.SetFilesBridgeDeliveryObserver(func(event FilesBridgeDelivery) { events = append(events, event) })
			req := filesBridgeTestRequest(t, "tm_files_write", filesBridgeTestArguments("tm_files_write"))
			req.ID = filesBridgeTestJSON(t, "arbitrary RPC id /private/native token=secret-token")
			input := string(filesBridgeTestJSON(t, req)) + "\n"
			if failAfter >= 0 {
				// A broken response stream must stop before processing another
				// queued request, and it must not retry the completed Native call.
				input += string(filesBridgeTestJSON(t, req)) + "\n"
			}
			var output bytes.Buffer
			writes := 0
			writer := filesBridgeTestWriter(func(p []byte) (int, error) {
				writes++
				if len(events) != 0 {
					t.Fatal("delivery observer ran before writer completed")
				}
				if failAfter >= 0 {
					return failAfter, io.ErrClosedPipe
				}
				return output.Write(p)
			})
			err := s.ServeStream(strings.NewReader(input), writer)
			wantResult := "EMITTED"
			if failAfter >= 0 {
				wantResult = "UNKNOWN"
				if err == nil {
					t.Fatal("failed response writer was reported successful")
				}
			} else if err != nil {
				t.Fatal(err)
			}
			if writes != 1 || len(events) != 1 || len(backend.recorded()) != 1 {
				t.Fatalf("delivery/retry accounting: writes=%d events=%d native=%d", writes, len(events), len(backend.recorded()))
			}
			event := events[0]
			if event.RequestID != filesBridgeTestRequestID || event.Tool != "tm_files_write" || event.ToolResult != wantResult {
				t.Fatalf("wrong delivery evidence or raw RPC identity leakage: %+v", event)
			}
			if failAfter < 0 {
				var response Response
				if err := json.Unmarshal(output.Bytes(), &response); err != nil {
					t.Fatal(err)
				}
				payload, _ := filesBridgeTestPayload(t, response)
				stages := payload["stages"].(map[string]any)
				if stages["toolResult"] != "PREPARED" {
					t.Fatal("serialized tool result falsely claimed its own delivery")
				}
			}
		})
	}
}

func TestFilesBridgeDeliveryObserverNeverUsesModelAuthorityOrRPCID(t *testing.T) {
	backend := &filesBridgeTestBackend{}
	s := filesBridgeTestServer(t, backend)
	var events []FilesBridgeDelivery
	s.SetFilesBridgeDeliveryObserver(func(event FilesBridgeDelivery) { events = append(events, event) })
	req := filesBridgeTestRequest(t, "tm_files_read", filesBridgeTestArguments("tm_files_read"))
	req.ID = filesBridgeTestJSON(t, "raw-model-id /private/native token=secret-token")
	responses, _ := filesBridgeTestStream(t, s, string(filesBridgeTestJSON(t, req))+"\n")
	if len(responses) != 1 || filesBridgeTestFailed(responses[0]) || len(events) != 1 {
		t.Fatal("valid read emission was not observed")
	}
	if events[0].RequestID != "" || events[0].Tool != "tm_files_read" || events[0].ToolResult != "EMITTED" {
		t.Fatalf("model RPC id became an operation identity: %+v", events[0])
	}
	before := len(events)
	notification := filesBridgeTestRequest(t, "tm_files_write", filesBridgeTestArguments("tm_files_write"))
	notification.ID = nil
	filesBridgeTestStream(t, s, string(filesBridgeTestJSON(t, notification))+"\n")
	if len(events) != before || len(backend.recorded()) != 1 {
		t.Fatal("notification generated delivery or mutation evidence")
	}
}
