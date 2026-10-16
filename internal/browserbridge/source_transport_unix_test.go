//go:build darwin || linux

package browserbridge

import (
	"bufio"
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"
)

func frozenTestHost(t *testing.T) (*Host, *bytes.Buffer) {
	t.Helper()
	root := t.TempDir()
	if err := os.Chmod(root, 0700); err != nil {
		t.Fatal(err)
	}
	cfg := Installation{Name: HostName, ExtensionID: testExtensionID, ClientCredential: strings.Repeat("a", 64),
		InstallRoot: root, SocketPath: filepath.Join(root, "agent.sock"), Provider: "opendesk"}
	var out bytes.Buffer
	host, err := NewHost(cfg, "chrome-extension://"+testExtensionID+"/", strings.NewReader(""), &out)
	if err != nil {
		t.Fatal(err)
	}
	host.ready = true
	host.localDevMulti = true
	host.localDevSource = true
	return host, &out
}

func frozenSocketPair(t *testing.T) (*net.UnixConn, *bufio.Reader, func()) {
	t.Helper()
	root, err := os.MkdirTemp("/tmp", "odsrc-")
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(root, "p.sock")
	listener, err := net.ListenUnix("unix", &net.UnixAddr{Name: path, Net: "unix"})
	if err != nil {
		_ = os.RemoveAll(root)
		t.Fatal(err)
	}
	accepted := make(chan *net.UnixConn, 1)
	go func() {
		conn, _ := listener.AcceptUnix()
		accepted <- conn
	}()
	client, err := net.DialUnix("unix", nil, &net.UnixAddr{Name: path, Net: "unix"})
	if err != nil {
		t.Fatal(err)
	}
	server := <-accepted
	reader := bufio.NewReaderSize(client, MaxBytes+2)
	cleanup := func() {
		_ = client.Close()
		_ = server.Close()
		_ = listener.Close()
		_ = os.RemoveAll(root)
	}
	return server, reader, cleanup
}

func frozenProvider(t *testing.T, host *Host, version int) (*localClient, *bufio.Reader, string, string, string, func()) {
	t.Helper()
	server, reader, cleanup := frozenSocketPair(t)
	rawID := "local-" + strings.Repeat("a", 20)
	sourceID := "src-1"
	scopedID := modernBinding(sourceID, rawID)
	ownerEpoch := "owner-epoch"
	aggregateEpoch := "agg-epoch"
	provider := &localClient{socket: server, providerEpoch: ownerEpoch}
	host.leases["lease-1"] = devLease{workspaceID: "ws-1", sourceID: sourceID, leaseEpoch: "lease-epoch"}
	host.modern[provider] = &modernProvider{
		leaseID: "lease-1", sourceID: sourceID, workspaceID: "ws-1", sourceVersion: version,
		entries: map[string]modernEntry{scopedID: {
			rawID: rawID, name: "large controller", runtimeKind: "controller",
			sourceID: sourceID, workspaceID: "ws-1",
		}},
	}
	host.aggregateEpoch = aggregateEpoch
	return provider, reader, rawID, scopedID, aggregateEpoch, cleanup
}

func readProviderRequest(t *testing.T, reader *bufio.Reader) Fields {
	t.Helper()
	raw, err := ReadLine(reader)
	if err != nil {
		t.Fatal(err)
	}
	fields, err := Decode(raw)
	if err != nil {
		t.Fatal(err)
	}
	return fields
}

func readChromeDevResponse(t *testing.T, out *bytes.Buffer) Fields {
	t.Helper()
	raw, err := ReadFrame(out)
	if err != nil {
		t.Fatal(err)
	}
	fields, err := Decode(raw)
	if err != nil {
		t.Fatal(err)
	}
	if String(fields, "kind") != "dev.response" {
		t.Fatalf("unexpected frame: %+v", fields)
	}
	return fields
}

func deliverProviderResult(t *testing.T, host *Host, provider *localClient, requestID string, result map[string]any) {
	t.Helper()
	raw := MustEncode(map[string]any{"v": 1, "kind": "dev.response", "requestId": requestID,
		"providerEpoch": provider.providerEpoch, "result": result})
	fields, err := Decode(raw)
	if err != nil {
		t.Fatal(err)
	}
	if !host.deliverDevReply(provider, fields, raw) {
		t.Fatal("provider reply closed modern connection")
	}
}

func TestModernFrozenSourceResolveAndReadValidateTransport(t *testing.T) {
	host, out := frozenTestHost(t)
	provider, providerReader, rawID, scopedID, aggregateEpoch, cleanup := frozenProvider(t, host, LocalDevSourceVersion)
	defer cleanup()
	sourceRef := map[string]any{
		"format": "opendesk.local-source.v1", "version": 1, "transferId": "transfer-1",
		"chunkBytes": localSourceChunkBytes, "artifactId": strings.Repeat("1", 64),
		"inputHash": strings.Repeat("2", 64), "sourceHash": strings.Repeat("3", 64),
		"sourceBytes":      482238,
		"transferIdentity": map[string]any{"bindingId": rawID, "providerEpoch": provider.providerEpoch},
	}
	if err := host.handleChrome(MustEncode(map[string]any{"v": 1, "kind": "dev.request",
		"requestId": "resolve-large", "providerEpoch": aggregateEpoch, "method": "project.resolve",
		"params": map[string]any{"bindingId": scopedID}})); err != nil {
		t.Fatal(err)
	}
	forwarded := readProviderRequest(t, providerReader)
	params, _ := Decode(forwarded["params"])
	if String(forwarded, "providerEpoch") != provider.providerEpoch || String(params, "bindingId") != rawID {
		t.Fatalf("resolve was not forwarded to raw owner: %+v params=%+v", forwarded, params)
	}
	deliverProviderResult(t, host, provider, "resolve-large", map[string]any{
		"bindingId": rawID, "projectId": rawID, "runtimeKind": "controller",
		"entryFormat": "async-main", "managedUI": false, "sourceHash": strings.Repeat("3", 64),
		"sourceBytes": 482238, "inputHash": strings.Repeat("2", 64), "artifactId": strings.Repeat("1", 64),
		"sourceRef": sourceRef,
	})
	reply := readChromeDevResponse(t, out)
	if String(reply, "providerEpoch") != aggregateEpoch {
		t.Fatalf("aggregate epoch changed: %+v", reply)
	}
	result, _ := Decode(reply["result"])
	if String(result, "bindingId") != scopedID || Has(result, "sourceUtf8") {
		t.Fatalf("resolved identity/source body mismatch: %+v", result)
	}
	var gotRef map[string]any
	if err := json.Unmarshal(result["sourceRef"], &gotRef); err != nil {
		t.Fatal(err)
	}
	wantRefBytes, _ := json.Marshal(sourceRef)
	var wantRef map[string]any
	if err := json.Unmarshal(wantRefBytes, &wantRef); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(gotRef, wantRef) {
		t.Fatalf("sourceRef was rewritten:\n got=%#v\nwant=%#v", gotRef, wantRef)
	}

	readParams := map[string]any{"bindingId": scopedID, "transferId": "transfer-1",
		"artifactId": strings.Repeat("1", 64), "inputHash": strings.Repeat("2", 64),
		"sourceHash": strings.Repeat("3", 64), "sourceBytes": 482238, "offset": 0}
	if err := host.handleChrome(MustEncode(map[string]any{"v": 1, "kind": "dev.request",
		"requestId": "read-0", "providerEpoch": aggregateEpoch, "method": "project.source.read", "params": readParams})); err != nil {
		t.Fatal(err)
	}
	forwarded = readProviderRequest(t, providerReader)
	params, _ = Decode(forwarded["params"])
	if String(forwarded, "method") != "project.source.read" || String(params, "bindingId") != rawID ||
		Int(params, "offset") != 0 {
		t.Fatalf("read was not raw-bound: %+v params=%+v", forwarded, params)
	}
	chunk := bytes.Repeat([]byte("x"), localSourceChunkBytes)
	deliverProviderResult(t, host, provider, "read-0", map[string]any{
		"bindingId": rawID, "transferId": "transfer-1", "artifactId": strings.Repeat("1", 64),
		"inputHash": strings.Repeat("2", 64), "sourceHash": strings.Repeat("3", 64),
		"sourceBytes": 482238, "offset": 0, "byteLength": len(chunk),
		"dataBase64": base64.StdEncoding.EncodeToString(chunk), "done": false,
	})
	reply = readChromeDevResponse(t, out)
	if String(reply, "providerEpoch") != aggregateEpoch {
		t.Fatalf("read response lost aggregate epoch: %+v", reply)
	}
	result, _ = Decode(reply["result"])
	if String(result, "bindingId") != scopedID || Int(result, "byteLength") != localSourceChunkBytes ||
		len(String(result, "dataBase64")) != localSourceMaxBase64Size {
		t.Fatalf("read response was not scoped/bounded: %+v", result)
	}

	validateParams := map[string]any{"bindingId": scopedID, "transferId": "transfer-1",
		"artifactId": strings.Repeat("1", 64), "inputHash": strings.Repeat("2", 64),
		"sourceHash": strings.Repeat("3", 64), "sourceBytes": 482238}
	if err := host.handleChrome(MustEncode(map[string]any{"v": 1, "kind": "dev.request",
		"requestId": "validate-final", "providerEpoch": aggregateEpoch, "method": "project.source.validate", "params": validateParams})); err != nil {
		t.Fatal(err)
	}
	forwarded = readProviderRequest(t, providerReader)
	params, _ = Decode(forwarded["params"])
	if String(forwarded, "method") != "project.source.validate" || String(params, "bindingId") != rawID {
		t.Fatalf("validate was not raw-bound: %+v params=%+v", forwarded, params)
	}
	deliverProviderResult(t, host, provider, "validate-final", map[string]any{
		"bindingId": rawID, "transferId": "transfer-1", "artifactId": strings.Repeat("1", 64),
		"inputHash": strings.Repeat("2", 64), "sourceHash": strings.Repeat("3", 64),
		"sourceBytes": 482238, "validated": true,
	})
	reply = readChromeDevResponse(t, out)
	result, _ = Decode(reply["result"])
	if String(result, "bindingId") != scopedID || !Bool(result, "validated") {
		t.Fatalf("validate response was not scoped/final: %+v", result)
	}
}

func TestFrozenSourceUnsupportedAndStrictBounds(t *testing.T) {
	host, out := frozenTestHost(t)
	_, _, _, scopedID, aggregateEpoch, cleanup := frozenProvider(t, host, 0)
	defer cleanup()
	err := host.handleChrome(MustEncode(map[string]any{"v": 1, "kind": "dev.request",
		"requestId": "unsupported-read", "providerEpoch": aggregateEpoch, "method": "project.source.read",
		"params": map[string]any{"bindingId": scopedID, "transferId": "transfer-1",
			"artifactId": strings.Repeat("1", 64), "inputHash": strings.Repeat("2", 64),
			"sourceHash": strings.Repeat("3", 64), "sourceBytes": 482238, "offset": 0}}))
	if err != nil {
		t.Fatal(err)
	}
	reply := readChromeDevResponse(t, out)
	errFields, _ := Decode(reply["error"])
	if String(errFields, "code") != "E_NATIVE_UPDATE_REQUIRED" {
		t.Fatalf("old provider accepted source chunks: %+v", errFields)
	}

	valid := map[string]any{"bindingId": scopedID, "transferId": "transfer-1",
		"artifactId": strings.Repeat("1", 64), "inputHash": strings.Repeat("2", 64),
		"sourceHash": strings.Repeat("3", 64), "sourceBytes": localSourceMaxBytes, "offset": 0}
	for name, params := range map[string]map[string]any{
		"too-large":       cloneFrozenParams(valid, "sourceBytes", localSourceMaxBytes+1),
		"bad-offset":      cloneFrozenParams(valid, "offset", 17),
		"arbitrary-path":  cloneFrozenParams(valid, "path", "/tmp/source.js"),
		"missing-hash":    cloneWithoutFrozenParam(valid, "sourceHash"),
		"validate-offset": cloneFrozenParams(valid, "offset", 0),
	} {
		method := "project.source.read"
		if name == "validate-offset" {
			method = "project.source.validate"
		}
		raw := MustEncode(map[string]any{"v": 1, "kind": "dev.request", "requestId": "bad-" + name,
			"providerEpoch": aggregateEpoch, "method": method, "params": params})
		if err := ValidateDevRequestRaw(raw); !errors.Is(err, ErrSchema) {
			t.Fatalf("%s accepted: %v", name, err)
		}
	}
	duplicate := []byte(`{"v":1,"kind":"dev.request","requestId":"dup","providerEpoch":"agg","method":"project.resolve","params":{"bindingId":"` + scopedID + `","bindingId":"` + scopedID + `"}}`)
	if err := ValidateDevRequestRaw(duplicate); !errors.Is(err, ErrSchema) {
		t.Fatalf("duplicate key accepted: %v", err)
	}
}

func TestModernProviderRegisterSourceVersionFieldIsNarrow(t *testing.T) {
	base := map[string]any{"v": 1, "kind": "provider.register", "providerId": "provider-1",
		"catalogVersion": 2, "leaseId": "lease-1", "projects": []map[string]any{}}
	good := MustEncode(cloneFrozenParams(base, "localDevSourceVersion", LocalDevSourceVersion))
	goodFields, _ := Decode(good)
	if !validModernProviderRegisterFields(goodFields) {
		t.Fatal("localDevSourceVersion was rejected")
	}
	bad := MustEncode(cloneFrozenParams(base, "unexpected", true))
	badFields, _ := Decode(bad)
	if validModernProviderRegisterFields(badFields) {
		t.Fatal("provider.register accepted unknown seventh field")
	}
}

func cloneFrozenParams(base map[string]any, key string, value any) map[string]any {
	next := map[string]any{}
	for k, v := range base {
		next[k] = v
	}
	next[key] = value
	return next
}

func cloneWithoutFrozenParam(base map[string]any, key string) map[string]any {
	next := cloneFrozenParams(base, "", nil)
	delete(next, "")
	delete(next, key)
	return next
}

func TestFrozenSourceEpochDisconnectAndRevocationRejectPending(t *testing.T) {
	host, out := frozenTestHost(t)
	provider, providerReader, rawID, scopedID, aggregateEpoch, cleanup := frozenProvider(t, host, LocalDevSourceVersion)
	defer cleanup()
	sourceParams := map[string]any{"bindingId": scopedID, "transferId": "transfer-1",
		"artifactId": strings.Repeat("1", 64), "inputHash": strings.Repeat("2", 64),
		"sourceHash": strings.Repeat("3", 64), "sourceBytes": 482238, "offset": 0}
	if err := host.handleChrome(MustEncode(map[string]any{"v": 1, "kind": "dev.request",
		"requestId": "stale-epoch", "providerEpoch": aggregateEpoch, "method": "project.source.read", "params": sourceParams})); err != nil {
		t.Fatal(err)
	}
	_ = readProviderRequest(t, providerReader)
	host.aggregateEpoch = "agg-rotated"
	deliverProviderResult(t, host, provider, "stale-epoch", map[string]any{
		"bindingId": rawID, "transferId": "transfer-1", "artifactId": strings.Repeat("1", 64),
		"inputHash": strings.Repeat("2", 64), "sourceHash": strings.Repeat("3", 64),
		"sourceBytes": 482238, "offset": 0, "byteLength": localSourceChunkBytes,
		"dataBase64": base64.StdEncoding.EncodeToString(bytes.Repeat([]byte("x"), localSourceChunkBytes)), "done": false,
	})
	reply := readChromeDevResponse(t, out)
	if String(reply, "providerEpoch") != aggregateEpoch {
		t.Fatalf("stale response did not target original aggregate epoch: %+v", reply)
	}
	errFields, _ := Decode(reply["error"])
	if String(errFields, "code") != "E_DEV_DISCONNECTED" {
		t.Fatalf("stale aggregate was not rejected: %+v", errFields)
	}

	host.aggregateEpoch = aggregateEpoch
	if err := host.handleChrome(MustEncode(map[string]any{"v": 1, "kind": "dev.request",
		"requestId": "revoked-lease", "providerEpoch": aggregateEpoch, "method": "project.source.read", "params": sourceParams})); err != nil {
		t.Fatal(err)
	}
	_ = readProviderRequest(t, providerReader)
	delete(host.leases, "lease-1")
	deliverProviderResult(t, host, provider, "revoked-lease", map[string]any{
		"bindingId": rawID, "transferId": "transfer-1", "artifactId": strings.Repeat("1", 64),
		"inputHash": strings.Repeat("2", 64), "sourceHash": strings.Repeat("3", 64),
		"sourceBytes": 482238, "offset": 0, "byteLength": localSourceChunkBytes,
		"dataBase64": base64.StdEncoding.EncodeToString(bytes.Repeat([]byte("x"), localSourceChunkBytes)), "done": false,
	})
	reply = readChromeDevResponse(t, out)
	errFields, _ = Decode(reply["error"])
	if String(errFields, "code") != "E_DEV_DISCONNECTED" {
		t.Fatalf("revoked lease was not rejected: %+v", errFields)
	}

	host.leases["lease-1"] = devLease{workspaceID: "ws-1", sourceID: "src-1", leaseEpoch: "lease-epoch"}
	if err := host.handleChrome(MustEncode(map[string]any{"v": 1, "kind": "dev.request",
		"requestId": "provider-disconnect", "providerEpoch": aggregateEpoch, "method": "project.source.read", "params": sourceParams})); err != nil {
		t.Fatal(err)
	}
	_ = readProviderRequest(t, providerReader)
	host.releaseModernProvider(provider)
	reply = readChromeDevResponse(t, out)
	if String(reply, "providerEpoch") != aggregateEpoch {
		t.Fatalf("disconnect used owner epoch: %+v", reply)
	}
	errFields, _ = Decode(reply["error"])
	if String(errFields, "code") != "E_DEV_DISCONNECTED" {
		t.Fatalf("disconnect did not reject pending read: %+v", errFields)
	}
}

func TestFrozenSourceInlineResolveStillPassesThrough(t *testing.T) {
	host, out := frozenTestHost(t)
	provider, providerReader, rawID, scopedID, aggregateEpoch, cleanup := frozenProvider(t, host, LocalDevSourceVersion)
	defer cleanup()
	if err := host.handleChrome(MustEncode(map[string]any{"v": 1, "kind": "dev.request",
		"requestId": "inline-resolve", "providerEpoch": aggregateEpoch, "method": "project.resolve",
		"params": map[string]any{"bindingId": scopedID}})); err != nil {
		t.Fatal(err)
	}
	_ = readProviderRequest(t, providerReader)
	deliverProviderResult(t, host, provider, "inline-resolve", map[string]any{
		"bindingId": rawID, "projectId": rawID, "runtimeKind": "controller",
		"sourceUtf8": "export default async function main() { return 1; }",
	})
	reply := readChromeDevResponse(t, out)
	result, _ := Decode(reply["result"])
	if String(result, "bindingId") != scopedID || String(result, "sourceUtf8") == "" {
		t.Fatalf("inline source was not preserved: %+v", result)
	}
}

func TestFrozenSourceBadProviderResultIsConservativeError(t *testing.T) {
	host, out := frozenTestHost(t)
	provider, providerReader, rawID, scopedID, aggregateEpoch, cleanup := frozenProvider(t, host, LocalDevSourceVersion)
	defer cleanup()
	sourceParams := map[string]any{"bindingId": scopedID, "transferId": "transfer-1",
		"artifactId": strings.Repeat("1", 64), "inputHash": strings.Repeat("2", 64),
		"sourceHash": strings.Repeat("3", 64), "sourceBytes": 482238, "offset": 0}
	validateParams := cloneWithoutFrozenParam(sourceParams, "offset")
	goodRead := map[string]any{
		"bindingId": rawID, "transferId": "transfer-1", "artifactId": strings.Repeat("1", 64),
		"inputHash": strings.Repeat("2", 64), "sourceHash": strings.Repeat("3", 64),
		"sourceBytes": 482238, "offset": 0, "byteLength": localSourceChunkBytes,
		"dataBase64": base64.StdEncoding.EncodeToString(bytes.Repeat([]byte("x"), localSourceChunkBytes)), "done": false,
	}
	goodValidate := map[string]any{
		"bindingId": rawID, "transferId": "transfer-1", "artifactId": strings.Repeat("1", 64),
		"inputHash": strings.Repeat("2", 64), "sourceHash": strings.Repeat("3", 64),
		"sourceBytes": 482238, "validated": true,
	}
	cases := []struct {
		name   string
		method string
		params map[string]any
		result map[string]any
	}{
		{"noncanonical-base64", "project.source.read", sourceParams, cloneFrozenParams(goodRead, "dataBase64", "not canonical")},
		{"missing-done", "project.source.read", sourceParams, cloneWithoutFrozenParam(goodRead, "done")},
		{"string-done", "project.source.read", sourceParams, cloneFrozenParams(goodRead, "done", "false")},
		{"missing-byteLength", "project.source.read", sourceParams, cloneWithoutFrozenParam(goodRead, "byteLength")},
		{"extra-read-field", "project.source.read", sourceParams, cloneFrozenParams(goodRead, "extra", "nope")},
		{"missing-validated", "project.source.validate", validateParams, cloneWithoutFrozenParam(goodValidate, "validated")},
		{"string-validated", "project.source.validate", validateParams, cloneFrozenParams(goodValidate, "validated", "true")},
		{"extra-validate-field", "project.source.validate", validateParams, cloneFrozenParams(goodValidate, "extra", "nope")},
	}
	for _, tc := range cases {
		requestID := "bad-" + tc.name
		if err := host.handleChrome(MustEncode(map[string]any{"v": 1, "kind": "dev.request",
			"requestId": requestID, "providerEpoch": aggregateEpoch, "method": tc.method, "params": tc.params})); err != nil {
			t.Fatal(err)
		}
		_ = readProviderRequest(t, providerReader)
		deliverProviderResult(t, host, provider, requestID, tc.result)
		reply := readChromeDevResponse(t, out)
		errFields, _ := Decode(reply["error"])
		if String(errFields, "code") != "E_DEV_SOURCE_IDENTITY" {
			t.Fatalf("%s was not conservatively rejected: %+v", tc.name, errFields)
		}
	}
}

func TestFrozenSourceResolveRejectsRevokedOwner(t *testing.T) {
	for _, body := range []string{"sourceUtf8", "sourceRef"} {
		t.Run(body, func(t *testing.T) {
			host, out := frozenTestHost(t)
			provider, reader, rawID, scopedID, epoch, cleanup := frozenProvider(t, host, LocalDevSourceVersion)
			defer cleanup()
			if err := host.handleChrome(MustEncode(map[string]any{"v": 1, "kind": "dev.request", "requestId": "resolve-revoked", "providerEpoch": epoch, "method": "project.resolve", "params": map[string]any{"bindingId": scopedID}})); err != nil {
				t.Fatal(err)
			}
			_ = readProviderRequest(t, reader)
			delete(host.leases, "lease-1") // The epoch has not rotated yet: this is the revocation window.
			deliverProviderResult(t, host, provider, "resolve-revoked", map[string]any{"bindingId": rawID, body: "late source"})
			reply := readChromeDevResponse(t, out)
			failure, _ := Decode(reply["error"])
			if String(failure, "code") != "E_DEV_DISCONNECTED" || String(reply, "providerEpoch") != epoch {
				t.Fatalf("revoked resolve was forwarded: %+v", reply)
			}
		})
	}
}

func TestFrozenSourceFullPayloadAcrossProviderRoutes(t *testing.T) {
	for _, route := range []string{"modern", "legacy", "mixed-legacy"} {
		t.Run(route, func(t *testing.T) {
			host, out := frozenTestHost(t)
			var provider *localClient
			var reader *bufio.Reader
			var rawID, bindingID, epoch string
			if route == "modern" {
				var cleanup func()
				provider, reader, rawID, bindingID, epoch, cleanup = frozenProvider(t, host, LocalDevSourceVersion)
				defer cleanup()
			} else {
				server, peer, cleanup := frozenSocketPair(t)
				defer cleanup()
				provider = &localClient{socket: server, providerEpoch: "legacy-owner"}
				host.provider = provider
				reader, rawID, bindingID, epoch = peer, "legacy-source", "legacy-source", provider.providerEpoch
				if route == "mixed-legacy" {
					_, _, _, _, aggregate, release := frozenProvider(t, host, LocalDevSourceVersion)
					defer release()
					bindingID, epoch = legacyBinding(provider.providerEpoch, rawID), aggregate
				}
			}
			source := bytes.Repeat([]byte("x"), 482238)
			hash := sha256.Sum256(source)
			identity := map[string]any{"bindingId": bindingID, "transferId": "frozen-transfer", "artifactId": strings.Repeat("1", 64), "inputHash": strings.Repeat("2", 64), "sourceHash": hex.EncodeToString(hash[:]), "sourceBytes": len(source)}
			forward := func(id, method string, params map[string]any) {
				t.Helper()
				done := make(chan error, 1)
				go func() {
					done <- host.handleChrome(MustEncode(map[string]any{"v": 1, "kind": "dev.request", "requestId": id, "providerEpoch": epoch, "method": method, "params": params}))
				}()
				for {
					request := readProviderRequest(t, reader)
					if String(request, "method") == "projects.list" {
						deliverProviderResult(t, host, provider, String(request, "requestId"), map[string]any{"projects": []map[string]any{{"bindingId": rawID, "name": "Legacy source", "runtimeKind": "controller"}}})
						continue
					}
					fields, _ := Decode(request["params"])
					if String(request, "method") != method || String(request, "providerEpoch") != provider.providerEpoch || String(fields, "bindingId") != rawID {
						t.Fatalf("wrong provider route: %+v", request)
					}
					break
				}
				if err := <-done; err != nil {
					t.Fatal(err)
				}
			}
			var received []byte
			for offset := 0; offset < len(source); offset += localSourceChunkBytes {
				id := "chunk-" + strconv.Itoa(offset)
				forward(id, "project.source.read", cloneFrozenParams(identity, "offset", offset))
				end := offset + localSourceChunkBytes
				if end > len(source) {
					end = len(source)
				}
				result := cloneFrozenParams(identity, "bindingId", rawID)
				result["offset"], result["byteLength"], result["dataBase64"], result["done"] = offset, end-offset, base64.StdEncoding.EncodeToString(source[offset:end]), end == len(source)
				deliverProviderResult(t, host, provider, id, result)
				reply := readChromeDevResponse(t, out)
				fields, _ := Decode(reply["result"])
				if String(reply, "providerEpoch") != epoch || String(fields, "bindingId") != bindingID {
					t.Fatalf("lost source identity: %+v", reply)
				}
				chunk, err := base64.StdEncoding.DecodeString(String(fields, "dataBase64"))
				if err != nil {
					t.Fatal(err)
				}
				received = append(received, chunk...)
			}
			if !bytes.Equal(received, source) || sha256.Sum256(received) != hash {
				t.Fatal("482 KB source reconstruction changed bytes")
			}
			forward("validate-complete", "project.source.validate", identity)
			result := cloneFrozenParams(identity, "bindingId", rawID)
			result["validated"] = true
			deliverProviderResult(t, host, provider, "validate-complete", result)
			reply := readChromeDevResponse(t, out)
			fields, _ := Decode(reply["result"])
			if !Bool(fields, "validated") || String(fields, "bindingId") != bindingID {
				t.Fatalf("final validation lost: %+v", reply)
			}
			if route == "legacy" {
				forward("late-owner", "project.source.validate", identity)
				host.provider = nil
				deliverProviderResult(t, host, provider, "late-owner", result)
				reply = readChromeDevResponse(t, out)
				failure, _ := Decode(reply["error"])
				if String(failure, "code") != "E_DEV_DISCONNECTED" {
					t.Fatalf("replaced legacy owner was accepted: %+v", reply)
				}
			}
		})
	}
}
