package browserbridge

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

// These are internal wire fixtures matching the Browser serviceDescriptor /
// serviceCall and Node provider contracts, not Runtime JavaScript API tests.
const managedTestDescriptor = `{"serviceId":"cookie-service","serviceInstanceId":"instance_1","productName":"Local service","origin":"http://cookie.localhost:3210","capabilities":["accounts:read","policy"]}`
const managedTestOwner = `{"extensionId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","toolId":"cookie-editor","packageHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","installEpoch":"install:opaque/1"}`
const managedTestRegistration = `{"v":1,"kind":"services.register","protocol":"opendesk.managed-services.v1","descriptor":` + managedTestDescriptor + `}`
const managedTestRequest = `{"v":1,"kind":"services.request","protocol":"opendesk.managed-services.v1","requestId":"550e8400-e29b-41d4-a716-446655440000","serviceId":"cookie-service","providerEpoch":"epoch_1","owner":` + managedTestOwner + `,"action":"bind","payload":{"custom":{"nullable":null,"list":[1,true]}}}`
const managedTestResult = `{"v":1,"kind":"services.result","protocol":"opendesk.managed-services.v1","requestId":"req_1","serviceId":"cookie-service","providerEpoch":"epoch_1","result":{"custom":null}}`

func TestManagedWireCompatibleObjects(t *testing.T) {
	d, err := decodeManagedRegistration([]byte(managedTestRegistration))
	if err != nil || d.ServiceID != "cookie-service" || d.ServiceInstanceID != "instance_1" || len(d.Capabilities) != 2 {
		t.Fatalf("descriptor: %+v, %v", d, err)
	}
	r, err := decodeManagedRequest([]byte(managedTestRequest))
	if err != nil || r.Owner.InstallEpoch != "install:opaque/1" || r.Action != "bind" || string(r.Payload) != `{"custom":{"nullable":null,"list":[1,true]}}` {
		t.Fatalf("request: %+v, %v", r, err)
	}
	result, err := decodeManagedResult([]byte(managedTestResult))
	if err != nil || result.RequestID != "req_1" || string(result.Result) != `{"custom":null}` || result.Error != nil {
		t.Fatalf("result: %+v, %v", result, err)
	}
	for _, action := range []string{"connect", "accounts", "bind", "unbind", "policy", "accept", "operation", "open", "disconnect"} {
		_, err := decodeManagedRequest([]byte(strings.Replace(managedTestRequest, `"action":"bind"`, `"action":"`+action+`"`, 1)))
		if err != nil {
			t.Errorf("action %s: %v", action, err)
		}
		want := action == "accounts" || action == "policy" || action == "operation"
		if managedRead(action) != want {
			t.Errorf("read classification %s", action)
		}
	}
	if managedRead("unknown") || managedRead("Accounts") {
		t.Fatal("unknown action classified read")
	}
	for _, outcome := range []string{"NOT_DISPATCHED", "FAILED_CONFIRMED", "OUTCOME_UNKNOWN"} {
		raw := strings.Replace(managedTestResult, `"result":{"custom":null}`, `"error":{"code":"E_SERVICE_FAILED","message":"","outcome":"`+outcome+`"}`, 1)
		result, err := decodeManagedResult([]byte(raw))
		if err != nil || result.Error == nil || result.Error.Outcome != outcome || result.Result != nil {
			t.Fatalf("error: %+v, %v", result, err)
		}
		encoded, err := json.Marshal(result)
		if err != nil || bytes.Contains(encoded, []byte(`"result"`)) {
			t.Fatalf("error encoding: %s %v", encoded, err)
		}
	}
}

func TestManagedRegistrationRejectsUnsafeDescriptors(t *testing.T) {
	for _, origin := range []string{"http://localhost:3210", "http://a.b.localhost:3210", "http://cookie.localhost", "http://cookie.localhost:", "http://cookie.localhost:0", "http://cookie.localhost:80", "http://cookie.localhost:65536", "http://cookie.localhost:03210", "http://cookie.localhost:3210/", "http://cookie.localhost:3210/path", "http://cookie.localhost:3210?x=1", "http://cookie.localhost:3210#x", "http://u:p@cookie.localhost:3210", "http://%63ookie.localhost:3210", "http://Cookie.localhost:3210", "http://cookie.localhost.:3210", "https://cookie.localhost:3210", "http://-a.localhost:3210", "http://a-.localhost:3210", "http://" + strings.Repeat("a", 64) + ".localhost:3210"} {
		t.Run(origin, func(t *testing.T) {
			managedRejectRegistration(t, strings.Replace(managedTestRegistration, "http://cookie.localhost:3210", origin, 1))
		})
	}
	for _, replacement := range []struct{ from, to string }{
		{`"serviceId":"cookie-service"`, `"serviceId":"../cookie"`},
		{`"serviceInstanceId":"instance_1"`, `"serviceInstanceId":""`},
		{`"productName":"Local service"`, `"productName":" \ufeff "`},
		{`"productName":"Local service"`, `"productName":"bad\u007f"`},
		{`"productName":"Local service"`, `"productName":"` + strings.Repeat("😀", 41) + `"`},
		{`["accounts:read","policy"]`, `["policy","policy"]`},
		{`["accounts:read","policy"]`, `["UPPER"]`},
		{`["accounts:read","policy"]`, `[null]`},
		{`["accounts:read","policy"]`, `["` + strings.Repeat("a", 65) + `"]`},
		{`["accounts:read","policy"]`, `[` + strings.TrimSuffix(strings.Repeat(`"x",`, 17), ",") + `]`},
	} {
		managedRejectRegistration(t, strings.Replace(managedTestRegistration, replacement.from, replacement.to, 1))
	}
	for _, origin := range []string{"http://a.localhost:1", "http://a-b.localhost:65535", "http://" + strings.Repeat("a", 63) + ".localhost:3210"} {
		if _, err := decodeManagedRegistration([]byte(strings.Replace(managedTestRegistration, "http://cookie.localhost:3210", origin, 1))); err != nil {
			t.Errorf("valid origin %s: %v", origin, err)
		}
	}
}

// Check distinct capabilities at the limit, independently of duplicate rejection.
func TestManagedSchemaBounds(t *testing.T) {
	for _, count := range []int{0, 16, 17} {
		caps := make([]string, count)
		for i := range caps {
			caps[i] = "cap:" + string(rune('a'+i))
		}
		encoded, err := json.Marshal(caps)
		if err != nil {
			t.Fatal(err)
		}
		raw := strings.Replace(managedTestRegistration, `["accounts:read","policy"]`, string(encoded), 1)
		_, err = decodeManagedRegistration([]byte(raw))
		if (err == nil) != (count <= 16) {
			t.Errorf("capability count %d: %v", count, err)
		}
	}
	for _, name := range []string{strings.Repeat("😀", 40), "\u0085"} {
		raw := strings.Replace(managedTestRegistration, "Local service", name, 1)
		if _, err := decodeManagedRegistration([]byte(raw)); err != nil {
			t.Errorf("JS productName boundary: %v", err)
		}
	}
	for _, pair := range []struct{ field, value string }{
		{"serviceId", strings.Repeat("a", 97)},
		{"serviceInstanceId", strings.Repeat("a", 97)},
	} {
		var envelope map[string]json.RawMessage
		var descriptor map[string]json.RawMessage
		_ = json.Unmarshal([]byte(managedTestRegistration), &envelope)
		_ = json.Unmarshal(envelope["descriptor"], &descriptor)
		descriptor[pair.field], _ = json.Marshal(pair.value)
		envelope["descriptor"], _ = json.Marshal(descriptor)
		raw, _ := json.Marshal(envelope)
		managedRejectRegistration(t, string(raw))
	}
	for _, size := range []int{240, 241} {
		body := `"error":{"code":"` + strings.Repeat("A", 64) + `","message":"` + strings.Repeat("x", size) + `","outcome":"NOT_DISPATCHED"}`
		raw := strings.Replace(managedTestResult, `"result":{"custom":null}`, body, 1)
		_, err := decodeManagedResult([]byte(raw))
		if (err == nil) != (size == 240) {
			t.Errorf("error message length %d: %v", size, err)
		}
	}
	for _, body := range []string{
		`"error":{"code":"` + strings.Repeat("A", 65) + `","message":"","outcome":"NOT_DISPATCHED"}`,
		`"error":{"code":"E_BAD","message":""}`,
		`"error":{"code":"E_BAD","message":"","outcome":null}`,
	} {
		raw := strings.Replace(managedTestResult, `"result":{"custom":null}`, body, 1)
		if _, err := decodeManagedResult([]byte(raw)); !errors.Is(err, ErrSchema) {
			t.Errorf("accepted invalid error: %s", raw)
		}
	}
}

func managedRejectRegistration(t *testing.T, raw string) {
	t.Helper()
	if _, err := decodeManagedRegistration([]byte(raw)); !errors.Is(err, ErrSchema) {
		t.Errorf("accepted registration %s (%v)", raw, err)
	}
}

func TestManagedWireStrictSchema(t *testing.T) {
	decoders := []struct {
		name, raw string
		decode    func([]byte) error
	}{
		{"register", managedTestRegistration, func(b []byte) error { _, e := decodeManagedRegistration(b); return e }},
		{"request", managedTestRequest, func(b []byte) error { _, e := decodeManagedRequest(b); return e }},
		{"result", managedTestResult, func(b []byte) error { _, e := decodeManagedResult(b); return e }},
	}
	for _, d := range decoders {
		t.Run(d.name, func(t *testing.T) {
			var fields map[string]json.RawMessage
			if err := json.Unmarshal([]byte(d.raw), &fields); err != nil {
				t.Fatal(err)
			}
			for key := range fields {
				for _, mode := range []string{"missing", "null", "alias"} {
					var changed map[string]json.RawMessage
					_ = json.Unmarshal([]byte(d.raw), &changed)
					switch mode {
					case "missing":
						delete(changed, key)
					case "null":
						changed[key] = json.RawMessage(`null`)
					case "alias":
						changed[strings.ToUpper(key)] = changed[key]
						delete(changed, key)
					}
					raw, _ := json.Marshal(changed)
					if err := d.decode(raw); !errors.Is(err, ErrSchema) {
						t.Errorf("accepted %s %s: %s", mode, key, raw)
					}
				}
			}
			for _, raw := range []string{"null", "[]", d.raw + ` {}`, strings.Replace(d.raw, `"v":1`, `"v":2`, 1), strings.Replace(d.raw, `"v":1`, `"v":"1"`, 1), strings.Replace(d.raw, `"v":1`, `"v":1,"v":1`, 1), strings.Replace(d.raw, `"v":1`, `"v":1,"\u0076":1`, 1), strings.Replace(d.raw, `"v":1`, `"v":1,"extra":true`, 1), strings.Replace(d.raw, "opendesk.managed-services.v1", "opendesk.managed-services.v2", 1), strings.Replace(d.raw, `"kind":"services.`, `"kind":"other.`, 1)} {
				if err := d.decode([]byte(raw)); !errors.Is(err, ErrSchema) {
					t.Errorf("accepted malformed: %s", raw)
				}
			}
			invalidUTF8 := append([]byte(d.raw[:len(d.raw)-1]), 0xff, '}')
			if err := d.decode(invalidUTF8); !errors.Is(err, ErrSchema) {
				t.Error("accepted invalid UTF-8")
			}
			for _, size := range []int{MaxBytes, MaxBytes + 1} {
				padded := d.raw + strings.Repeat(" ", size-len(d.raw))
				err := d.decode([]byte(padded))
				if (err == nil) != (size == MaxBytes) {
					t.Errorf("wire size %d: %v", size, err)
				}
			}
		})
	}
	// Nested schema keys must reject duplicate/null/unknown/case aliases too.
	for _, pair := range []struct{ raw, from, to string }{
		{managedTestRegistration, `"serviceId":"cookie-service"`, `"serviceId":"cookie-service","serviceId":"other"`},
		{managedTestRegistration, `"capabilities":["accounts:read","policy"]`, `"capabilities":null`},
		{managedTestRegistration, `"origin":`, `"Origin":`},
		{managedTestRegistration, `"origin":`, `"providerEpoch":"injected","origin":`},
		{managedTestRequest, `"installEpoch":"install:opaque/1"`, `"installEpoch":"x","installEpoch":"y"`},
		{managedTestRequest, `"installEpoch":"install:opaque/1"`, `"installEpoch":null`},
		{managedTestRequest, `"installEpoch":`, `"InstallEpoch":`},
		{managedTestRequest, `"installEpoch":`, `"extra":1,"installEpoch":`},
	} {
		raw := strings.Replace(pair.raw, pair.from, pair.to, 1)
		if pair.raw == managedTestRegistration {
			managedRejectRegistration(t, raw)
		} else if _, err := decodeManagedRequest([]byte(raw)); !errors.Is(err, ErrSchema) {
			t.Errorf("accepted nested schema: %s", raw)
		}
	}
}

func TestManagedRequestIdentityAndOpaquePayload(t *testing.T) {
	for _, pair := range []struct{ from, to string }{
		{`550e8400-e29b-41d4-a716-446655440000`, `req_1`},
		{`550e8400-e29b-41d4-a716-446655440000`, `550e8400e29b41d4a716446655440000`},
		{`550e8400-e29b-41d4-a716-446655440000`, `550e8400-e29b-11d4-a716-446655440000`},
		{`550e8400-e29b-41d4-a716-446655440000`, `550e8400-e29b-41d4-7716-446655440000`},
		{`"providerEpoch":"epoch_1"`, `"providerEpoch":"epoch:1"`},
		{`"installEpoch":"install:opaque/1"`, `"installEpoch":1`},
		{`"installEpoch":"install:opaque/1"`, `"installEpoch":""`},
		{`"installEpoch":"install:opaque/1"`, `"installEpoch":"x\n"`},
		{`"installEpoch":"install:opaque/1"`, `"installEpoch":"` + strings.Repeat("😀", 81) + `"`},
		{`"extensionId":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"`, `"extensionId":"bbbb"`},
		{`"toolId":"cookie-editor"`, `"toolId":"../bad"`},
		{`"packageHash":"` + strings.Repeat("a", 64) + `"`, `"packageHash":"` + strings.Repeat("A", 64) + `"`},
		{`"action":"bind"`, `"action":"fetch"`},
		{`"payload":{"custom":{"nullable":null,"list":[1,true]}}`, `"payload":[]`},
	} {
		raw := strings.Replace(managedTestRequest, pair.from, pair.to, 1)
		if _, err := decodeManagedRequest([]byte(raw)); !errors.Is(err, ErrSchema) {
			t.Errorf("accepted request: %s", raw)
		}
	}
	for _, epoch := range []string{" ", strings.Repeat("😀", 80), strings.Repeat("x", 160)} {
		raw := strings.Replace(managedTestRequest, "install:opaque/1", epoch, 1)
		if _, err := decodeManagedRequest([]byte(raw)); err != nil {
			t.Errorf("opaque install epoch: %v", err)
		}
	}
}

func TestManagedResultIdentityAndError(t *testing.T) {
	for _, id := range []string{"req_0", "req_01", "req_-1", "req_1.0", "req_1e2", "req_9007199254740992", "req_99999999999999999", "550e8400-e29b-41d4-a716-446655440000"} {
		raw := strings.Replace(managedTestResult, `"req_1"`, `"`+id+`"`, 1)
		if _, err := decodeManagedResult([]byte(raw)); !errors.Is(err, ErrSchema) {
			t.Errorf("accepted provider ID %s", id)
		}
	}
	if _, err := decodeManagedResult([]byte(strings.Replace(managedTestResult, `"req_1"`, `"req_9007199254740991"`, 1))); err != nil {
		t.Fatal(err)
	}
	for _, body := range []string{`"result":[]`, `"result":true`, `"result":{},"error":{"code":"E_BAD","message":"bad","outcome":"NOT_DISPATCHED"}`, `"error":{}`, `"error":{"code":"bad","message":"bad","outcome":"NOT_DISPATCHED"}`, `"error":{"code":"E_BAD","message":"bad","outcome":"PASS"}`, `"error":{"code":"E_BAD","message":null,"outcome":"NOT_DISPATCHED"}`, `"error":{"code":"E_BAD","message":"bad","message":"other","outcome":"NOT_DISPATCHED"}`, `"error":{"code":"E_BAD","message":"bad","outcome":"NOT_DISPATCHED","extra":true}`, `"error":{"Code":"E_BAD","message":"bad","outcome":"NOT_DISPATCHED"}`, `"error":{"code":"E_BAD","message":"` + strings.Repeat("😀", 121) + `","outcome":"NOT_DISPATCHED"}`} {
		raw := strings.Replace(managedTestResult, `"result":{"custom":null}`, body, 1)
		if _, err := decodeManagedResult([]byte(raw)); !errors.Is(err, ErrSchema) {
			t.Errorf("accepted result: %s", raw)
		}
	}
}
