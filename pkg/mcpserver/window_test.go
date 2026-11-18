package mcpserver

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/png"
	"opendesk/automation"
	"reflect"
	"runtime"
	"strings"
	"testing"
)

// These fakes exercise only the private MCP adapter, never a native window owner.
type windowTestOwner struct {
	rows                                      []map[string]any
	snapshots                                 []automation.WindowInfo
	currentErrAt                              int
	listErr, currentErr, activateErr, readErr error
	active                                    automation.WindowInfo
	text                                      string
	lists, currents, activates, reads         int
	selectors                                 []map[string]any
	activateTarget                            map[string]any
	timeout                                   int
	titleReads                                int
	readTargets                               []automation.WindowInfo
	readNative                                *automation.WindowInfo
	privateValues                             int
}

func (o *windowTestOwner) List() ([]map[string]any, error) { o.lists++; return o.rows, o.listErr }
func (o *windowTestOwner) Current(target map[string]any) (*automation.WindowInfo, error) {
	o.currents++
	o.selectors = append(o.selectors, target)
	if o.currentErr != nil && (o.currentErrAt == 0 || o.currents == o.currentErrAt) {
		return nil, o.currentErr
	}
	i := o.currents - 1
	if i >= len(o.snapshots) {
		i = len(o.snapshots) - 1
	}
	if i < 0 {
		return nil, errors.New("unexpected Current call")
	}
	win := o.snapshots[i]
	return &win, nil
}
func (o *windowTestOwner) Activate(target map[string]any, timeout int) (*automation.WindowInfo, error) {
	o.activates++
	o.activateTarget = target
	o.timeout = timeout
	win := o.active
	return &win, o.activateErr
}
func (o *windowTestOwner) GetContent(string) (string, error) {
	o.titleReads++
	return "", errors.New("title-based GetContent must never be called")
}

func (o *windowTestOwner) ReadContentExact(target automation.WindowInfo) (string, error) {
	o.reads++
	o.readTargets = append(o.readTargets, target)
	if o.readErr != nil {
		return "", o.readErr
	}
	// Model an owner refusing a changed native identity before reading values.
	if o.readNative != nil && !reflect.DeepEqual(target, *o.readNative) {
		return "", &automation.WindowError{Code: automation.WindowStaleTarget, Message: "exact native content identity changed"}
	}
	o.privateValues++
	return o.text, nil
}

type windowTestVision struct {
	image                 any
	result                map[string]any
	screenshotErr, ocrErr error
	captures, ocrs        int
	captureArgs, ocrArgs  map[string]any
}

func (v *windowTestVision) Screenshot(args map[string]any) (any, error) {
	v.captures++
	v.captureArgs = args
	return v.image, v.screenshotErr
}
func (v *windowTestVision) OCR(args map[string]any) (map[string]any, error) {
	v.ocrs++
	v.ocrArgs = args
	return v.result, v.ocrErr
}

type windowTestRuntime struct {
	fakeRuntime
	owner  *windowTestOwner
	vision *windowTestVision
	calls  int
}

func (r *windowTestRuntime) WindowOperation(args map[string]any) (map[string]any, error) {
	r.calls++
	return scopedWindowOperation(r.vision, r.owner, args)
}

var _ exactWindowOwner = (*windowTestOwner)(nil)
var _ windowVisionOwner = (*windowTestVision)(nil)

func newWindowTestRuntime(t *testing.T) *windowTestRuntime {
	t.Helper()
	win := automation.WindowInfo{ID: "42:7", ProcessID: 42, Handle: 7, Title: "Document", X: -120, Y: 30, Width: 300, Height: 200, IsForeground: true}
	var raw bytes.Buffer
	if err := png.Encode(&raw, image.NewRGBA(image.Rect(0, 0, 40, 20))); err != nil {
		t.Fatal(err)
	}
	return &windowTestRuntime{
		owner:  &windowTestOwner{rows: []map[string]any{windowMap(&win)}, snapshots: []automation.WindowInfo{win}, active: win, text: "untrusted window text"},
		vision: &windowTestVision{image: raw.Bytes(), result: map[string]any{"text": "Hello", "boxes": []any{map[string]any{"x": 4, "y": 2, "width": 8, "height": 4}}}},
	}
}
func windowTestArgs(operation string) map[string]any {
	return map[string]any{"windowId": "42:7", "operation": operation}
}
func windowTestCall(t *testing.T, r *windowTestRuntime, args map[string]any) map[string]any {
	t.Helper()
	resp := policyCall(t, NewServer(r), "tm_window", args)
	if r.owner.titleReads != 0 {
		t.Fatal("window operation called title-based GetContent")
	}
	if resp.Error != nil {
		t.Fatalf("unexpected protocol error: %+v", resp.Error)
	}
	return mustMapResult(t, resp.Result)
}
func windowTestError(t *testing.T, r *windowTestRuntime, args map[string]any, message string) {
	t.Helper()
	result := windowTestCall(t, r, args)
	encoded, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	if result["isError"] != true || !strings.Contains(string(encoded), message) {
		t.Fatalf("expected error %q, got %s", message, encoded)
	}
}

func TestWindowRegistrationPublishesStrictSchema(t *testing.T) {
	server := NewServer(newWindowTestRuntime(t))
	response := server.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(`1`), Method: "tools/list"})
	if response.Error != nil {
		t.Fatal(response.Error)
	}
	tool := mustToolByName(t, mustMapResult(t, response.Result)["tools"].([]any), "tm_window")
	schema := mustMapField(t, tool, "inputSchema")
	if schema["type"] != "object" || schema["additionalProperties"] != false || !reflect.DeepEqual(schema["required"], []any{"windowId", "operation"}) {
		t.Fatalf("schema: %#v", schema)
	}
	props := mustMapField(t, schema, "properties")
	if len(props) != 3 || mustMapField(t, props, "windowId")["type"] != "string" || !reflect.DeepEqual(mustMapField(t, props, "operation")["enum"], []any{"activate", "read", "ocr"}) {
		t.Fatalf("properties: %#v", props)
	}
	region := mustMapField(t, props, "region")
	if region["type"] != "object" || region["additionalProperties"] != false || !reflect.DeepEqual(region["required"], []any{"x", "y", "width", "height"}) {
		t.Fatalf("region: %#v", region)
	}
	coordinates := mustMapField(t, region, "properties")
	if len(coordinates) != 4 {
		t.Fatalf("region properties: %#v", coordinates)
	}
	for _, key := range []string{"x", "y", "width", "height"} {
		if mustMapField(t, coordinates, key)["type"] != "integer" {
			t.Fatalf("%s must be integer", key)
		}
	}
	if server.tools["tm_window"].Annotations.ReadOnlyHint || server.tools["tm_window"].Annotations.IdempotentHint {
		t.Fatal("window operation must not imply read-only or replay safety")
	}
}

func TestWindowSchemaRejectsInvalidArgumentsBeforeDispatch(t *testing.T) {
	cases := map[string]map[string]any{
		"missing id": {"operation": "read"}, "missing operation": {"windowId": "42:7"},
		"numeric id": {"windowId": 42, "operation": "read"}, "unknown operation": windowTestArgs("click"),
		"null operation": {"windowId": "42:7", "operation": nil},
	}
	for _, key := range []string{"script", "provider", "imageBytes", "title", "timeoutMs", "recordingSessionId"} {
		args := windowTestArgs("ocr")
		args[key] = "forbidden"
		cases["unknown "+key] = args
	}
	for name, region := range map[string]any{
		"null": nil, "array": []any{}, "incomplete": map[string]any{"x": 0},
		"fractional": map[string]any{"x": 0.5, "y": 0, "width": 20, "height": 10},
		"string":     map[string]any{"x": "0", "y": 0, "width": 20, "height": 10},
		"extra":      map[string]any{"x": 0, "y": 0, "width": 20, "height": 10, "screen": true},
	} {
		args := windowTestArgs("ocr")
		args["region"] = region
		cases["region "+name] = args
	}
	for name, args := range cases {
		t.Run(name, func(t *testing.T) {
			r := newWindowTestRuntime(t)
			response := policyCall(t, NewServer(r), "tm_window", args)
			if response.Error == nil || response.Error.Code != ErrCodeInvalidParams || r.calls != 0 {
				t.Fatalf("invalid arguments dispatched: %+v, calls=%d", response, r.calls)
			}
		})
	}
}

func TestWindowReadOnlyModeDoesNotDiscoverTool(t *testing.T) {
	server := NewServerWithOptions(newWindowTestRuntime(t), ServerOptions{ReadOnly: true})
	response := server.Handle(Request{JSONRPC: "2.0", ID: json.RawMessage(`1`), Method: "tools/list"})
	if response.Error != nil {
		t.Fatal(response.Error)
	}
	for _, raw := range mustMapResult(t, response.Result)["tools"].([]any) {
		if raw.(map[string]any)["name"] == "tm_window" {
			t.Fatal("read-only discovery exposed tm_window")
		}
	}
}
func TestWindowReadOnlyModeRejectsEveryOperationBeforeDispatch(t *testing.T) {
	for _, operation := range []string{"activate", "read", "ocr"} {
		t.Run(operation, func(t *testing.T) {
			r := newWindowTestRuntime(t)
			response := policyCall(t, NewServerWithOptions(r, ServerOptions{ReadOnly: true}), "tm_window", windowTestArgs(operation))
			if response.Error == nil || response.Error.Message != "tool not found" || r.calls != 0 {
				t.Fatalf("read-only dispatch: %+v calls=%d", response, r.calls)
			}
		})
	}
}
func TestWindowRegistrationFailsClosedWithoutOwnerCapability(t *testing.T) {
	response := policyCall(t, NewServer(&fakeRuntime{}), "tm_window", windowTestArgs("read"))
	if response.Error != nil {
		t.Fatal(response.Error)
	}
	if result := mustMapResult(t, response.Result); result["isError"] != true || !strings.Contains(string(response.Result), "capability is unavailable") {
		t.Fatalf("missing owner accepted: %#v", result)
	}
}

func TestWindowRejectsMissingOrAmbiguousExactIdentityBeforeObservation(t *testing.T) {
	for _, operation := range []string{"activate", "read", "ocr"} {
		for _, kind := range []string{"absent", "ambiguous", "unresolved", "empty", "title", "pid"} {
			t.Run(operation+"/"+kind, func(t *testing.T) {
				r := newWindowTestRuntime(t)
				args := windowTestArgs(operation)
				message := "STALE_TARGET"
				switch kind {
				case "absent":
					r.owner.rows = nil
				case "ambiguous":
					r.owner.rows = append(r.owner.rows, r.owner.rows[0])
					message = "ambiguous window identity"
				case "unresolved":
					args["windowId"] = "42:unresolved"
					message = "resolved windowId"
				case "empty":
					args["windowId"] = ""
					message = "resolved windowId"
				case "title":
					args["windowId"] = "Document"
				case "pid":
					args["windowId"] = "42"
				}
				windowTestError(t, r, args, message)
				if r.owner.currents != 0 || r.owner.activates != 0 || r.owner.reads != 0 || r.vision.captures != 0 || r.vision.ocrs != 0 {
					t.Fatal("rejected identity reached native seam")
				}
			})
		}
	}
}
func TestWindowReadRejectsAmbiguousTitleWithoutReadingOrFallback(t *testing.T) {
	r := newWindowTestRuntime(t)
	r.owner.rows = append(r.owner.rows, map[string]any{"id": "99:8", "title": "Document"})
	windowTestError(t, r, windowTestArgs("read"), "AMBIGUOUS_TARGET")
	if r.owner.reads != 0 || r.owner.activates != 0 || r.vision.captures != 0 || r.vision.ocrs != 0 {
		t.Fatal("ambiguous title caused read or fallback")
	}
}
func TestWindowReadReturnsExactTitleTextAfterRevalidation(t *testing.T) {
	r := newWindowTestRuntime(t)
	payload := mustJSONTextPayload(t, mustCallContent(t, windowTestCall(t, r, windowTestArgs("read"))))
	if payload["ok"] != true || payload["text"] != r.owner.text || payload["source"] != "window.getContent" || payload["capturedAt"] == "" {
		t.Fatalf("read payload: %#v", payload)
	}
	if r.owner.reads != 1 || r.owner.titleReads != 0 || len(r.owner.readTargets) != 1 || r.owner.readTargets[0] != r.owner.snapshots[0] || r.owner.currents != 2 || r.owner.selectors[0]["id"] != "42:7" || r.owner.selectors[1]["id"] != "42:7" || r.owner.activates != 0 || r.vision.captures != 0 {
		t.Fatal("read did not stay scoped and revalidate once")
	}
}
func TestWindowReadFailureDoesNotRetryOrFallback(t *testing.T) {
	r := newWindowTestRuntime(t)
	r.owner.readErr = errors.New("native read unavailable")
	windowTestError(t, r, windowTestArgs("read"), "native read unavailable")
	if r.owner.reads != 1 || r.owner.currents != 1 || r.owner.activates != 0 || r.vision.captures != 0 || r.vision.ocrs != 0 {
		t.Fatal("failed read retried or fell back")
	}
}
func TestWindowReadRejectsTextOverBudget(t *testing.T) {
	r := newWindowTestRuntime(t)
	r.owner.text = strings.Repeat("x", 64*1024+1)
	windowTestError(t, r, windowTestArgs("read"), "response budget")
}
func TestWindowRejectsRegionForNonOCROperations(t *testing.T) {
	for _, operation := range []string{"read", "activate"} {
		t.Run(operation, func(t *testing.T) {
			r := newWindowTestRuntime(t)
			args := windowTestArgs(operation)
			args["region"] = map[string]any{"x": 0, "y": 0, "width": 1, "height": 1}
			windowTestError(t, r, args, "region is only supported for ocr")
			if r.owner.lists != 0 {
				t.Fatal("invalid region reached window owner")
			}
		})
	}
}

func TestWindowObservationDiscardsStaleResults(t *testing.T) {
	changes := map[string]func(*automation.WindowInfo){
		"id": func(w *automation.WindowInfo) { w.ID = "42:8" }, "pid": func(w *automation.WindowInfo) { w.ProcessID++ },
		"handle": func(w *automation.WindowInfo) { w.Handle++ }, "title": func(w *automation.WindowInfo) { w.Title = "Other" },
		"x": func(w *automation.WindowInfo) { w.X++ }, "y": func(w *automation.WindowInfo) { w.Y++ },
		"width": func(w *automation.WindowInfo) { w.Width++ }, "height": func(w *automation.WindowInfo) { w.Height++ },
	}
	for _, stage := range []string{"read", "capture", "ocr"} {
		for name, change := range changes {
			t.Run(stage+"/"+name, func(t *testing.T) {
				r := newWindowTestRuntime(t)
				before := r.owner.snapshots[0]
				after := before
				change(&after)
				r.owner.snapshots = []automation.WindowInfo{before, after}
				operation := "ocr"
				if stage == "read" {
					operation = "read"
				}
				if stage == "ocr" {
					r.owner.snapshots = []automation.WindowInfo{before, before, after}
				}
				windowTestError(t, r, windowTestArgs(operation), "STALE_TARGET")
				wantOCR := 0
				if stage == "ocr" {
					wantOCR = 1
				}
				if r.vision.ocrs != wantOCR || r.owner.activates != 0 || r.owner.reads > 1 || r.vision.captures > 1 {
					t.Fatal("stale observation retried or used OCR after stale capture")
				}
			})
		}
	}
}
func TestWindowOCRDiscardsObservationWhenForegroundIsLost(t *testing.T) {
	for _, stage := range []int{2, 3} {
		t.Run(fmt.Sprintf("check%d", stage), func(t *testing.T) {
			r := newWindowTestRuntime(t)
			before := r.owner.snapshots[0]
			after := before
			after.IsForeground = false
			r.owner.snapshots = []automation.WindowInfo{before, after}
			if stage == 3 {
				r.owner.snapshots = []automation.WindowInfo{before, before, after}
			}
			windowTestError(t, r, windowTestArgs("ocr"), "STALE_TARGET")
			if r.vision.ocrs != stage-2 || r.vision.captures != 1 {
				t.Fatal("foreground loss retried or bypassed")
			}
		})
	}
}
func TestWindowObservationDiscardsResultWhenRevalidationFails(t *testing.T) {
	for _, operation := range []string{"read", "ocr"} {
		t.Run(operation, func(t *testing.T) {
			r := newWindowTestRuntime(t)
			r.owner.currentErrAt = 2
			r.owner.currentErr = errors.New("window vanished")
			windowTestError(t, r, windowTestArgs(operation), "window vanished")
			if r.vision.ocrs != 0 || r.owner.currents != 2 {
				t.Fatal("failed revalidation retried or continued")
			}
		})
	}
}

func TestWindowOCRRequiresForegroundWithoutActivating(t *testing.T) {
	r := newWindowTestRuntime(t)
	r.owner.snapshots[0].IsForeground = false
	windowTestError(t, r, windowTestArgs("ocr"), "must be foreground")
	if r.owner.activates != 0 || r.vision.captures != 0 {
		t.Fatal("OCR implicitly activated or captured background window")
	}
}
func TestWindowOCRRejectsInvalidClipsBeforeCapture(t *testing.T) {
	for name, region := range map[string]map[string]any{
		"negative":             {"x": -1, "y": 0, "width": 20, "height": 10},
		"zero width":           {"x": 0, "y": 0, "width": 0, "height": 10},
		"outside width":        {"x": 290, "y": 0, "width": 20, "height": 10},
		"outside height":       {"x": 0, "y": 195, "width": 20, "height": 10},
		"oversized coordinate": {"x": 100001, "y": 0, "width": 1, "height": 1},
	} {
		t.Run(name, func(t *testing.T) {
			r := newWindowTestRuntime(t)
			args := windowTestArgs("ocr")
			args["region"] = region
			result := windowTestCall(t, r, args)
			if result["isError"] != true || r.vision.captures != 0 || r.vision.ocrs != 0 {
				t.Fatalf("invalid clip accepted: %#v", result)
			}
		})
	}
}
func TestWindowOCRRejectsLogicalPixelBudgetBeforeCapture(t *testing.T) {
	r := newWindowTestRuntime(t)
	r.owner.snapshots[0].Width = 2000
	r.owner.snapshots[0].Height = 1001
	windowTestError(t, r, windowTestArgs("ocr"), "2000000 logical pixels")
	if r.vision.captures != 0 {
		t.Fatal("oversized capture attempted")
	}
}
func TestWindowOCRUsesWindowClipAndMeasuredMapping(t *testing.T) {
	for _, regional := range []bool{false, true} {
		t.Run(fmt.Sprintf("region=%t", regional), func(t *testing.T) {
			r := newWindowTestRuntime(t)
			args := windowTestArgs("ocr")
			expected := map[string]any{"x": -120, "y": 30, "width": 300, "height": 200}
			if regional {
				args["region"] = map[string]any{"x": 10, "y": 15, "width": 20, "height": 10}
				expected = map[string]any{"x": -110, "y": 45, "width": 20, "height": 10}
			}
			result := windowTestCall(t, r, args)
			if result["isError"] == true {
				t.Fatalf("OCR failed: %#v", result)
			}
			payload := mustJSONTextPayload(t, mustCallContent(t, result))
			if !reflect.DeepEqual(r.vision.captureArgs, map[string]any{"clip": expected, "returnType": "bytes"}) {
				t.Fatalf("capture scope: %#v", r.vision.captureArgs)
			}
			capture := mustMapField(t, payload, "capture")
			encoded, _ := json.Marshal(expected)
			var normalized map[string]any
			if err := json.Unmarshal(encoded, &normalized); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(capture["screenBounds"], normalized) || capture["imageWidth"] != float64(40) || capture["imageHeight"] != float64(20) || capture["capturedAt"] == "" {
				t.Fatalf("measured mapping: %#v", capture)
			}
			coordinates, _ := capture["coordinates"].(string)
			if !strings.Contains(coordinates, "imageX*screenBounds.width/imageWidth") || !strings.Contains(coordinates, "likewise y") {
				t.Fatalf("mapping formula missing: %q", coordinates)
			}
			if payload["source"] != "local-ocr" || mustMapField(t, payload, "ocr")["text"] != "Hello" || r.owner.currents != 3 || r.owner.activates != 0 {
				t.Fatalf("OCR response or revalidation: %#v", payload)
			}
		})
	}
}
func TestWindowOCRUsesLocalProviderAndKeepsPNGPrivate(t *testing.T) {
	r := newWindowTestRuntime(t)
	result := windowTestCall(t, r, windowTestArgs("ocr"))
	expected := map[string]any{"imageBytes": r.vision.image, "provider": "local", "lang": "eng", "timeoutMs": 5000}
	if !reflect.DeepEqual(r.vision.ocrArgs, expected) || r.vision.ocrs != 1 || r.vision.captures != 1 {
		t.Fatalf("OCR args: %#v", r.vision.ocrArgs)
	}
	encoded, _ := json.Marshal(result)
	if strings.Contains(string(encoded), base64.StdEncoding.EncodeToString(r.vision.image.([]byte))) || strings.Contains(string(encoded), "imageBytes") {
		t.Fatal("capture image leaked in MCP response")
	}
	content := mustCallContent(t, result)
	if len(content) != 1 || content[0].(map[string]any)["type"] != "text" {
		t.Fatalf("unexpected image content: %#v", content)
	}
}
func TestWindowOCRDoesNotExposeProviderImageData(t *testing.T) {
	for _, key := range []string{"imageBytes", "base64", "image"} {
		t.Run(key, func(t *testing.T) {
			r := newWindowTestRuntime(t)
			marker := "PRIVATE_CAPTURE_IMAGE_SENTINEL"
			r.vision.result[key] = marker
			result := windowTestCall(t, r, windowTestArgs("ocr"))
			encoded, _ := json.Marshal(result)
			if strings.Contains(string(encoded), marker) {
				t.Fatalf("provider image data leaked via %s", key)
			}
		})
	}
}
func TestWindowOCRRejectsInvalidCaptureWithoutOCR(t *testing.T) {
	for name, raw := range map[string]any{"string": "base64", "invalid png": []byte("invalid"), "over budget": make([]byte, 8*1024*1024+1)} {
		t.Run(name, func(t *testing.T) {
			r := newWindowTestRuntime(t)
			r.vision.image = raw
			if result := windowTestCall(t, r, windowTestArgs("ocr")); result["isError"] != true || r.vision.ocrs != 0 || r.vision.captures != 1 {
				t.Fatalf("invalid capture accepted: %#v", result)
			}
		})
	}
}
func TestWindowVisionFailureDoesNotRetryOrFallback(t *testing.T) {
	for _, stage := range []string{"capture", "ocr"} {
		t.Run(stage, func(t *testing.T) {
			r := newWindowTestRuntime(t)
			failure := errors.New(stage + " failed")
			if stage == "capture" {
				r.vision.screenshotErr = failure
			} else {
				r.vision.ocrErr = failure
			}
			windowTestError(t, r, windowTestArgs("ocr"), failure.Error())
			wantOCR := 0
			if stage == "ocr" {
				wantOCR = 1
			}
			if r.vision.captures != 1 || r.vision.ocrs != wantOCR || r.owner.reads != 0 || r.owner.activates != 0 {
				t.Fatal("failed vision retried or fell back")
			}
		})
	}
}
func TestWindowOCRRejectsResponseOverBudget(t *testing.T) {
	r := newWindowTestRuntime(t)
	r.vision.result = map[string]any{"text": strings.Repeat("x", 128*1024)}
	windowTestError(t, r, windowTestArgs("ocr"), "OCR response exceeds budget")
}

func TestWindowActivateCallsExactOwnerOnceWithVerifiedPostcondition(t *testing.T) {
	r := newWindowTestRuntime(t)
	r.owner.snapshots[0].IsForeground = false
	payload := mustJSONTextPayload(t, mustCallContent(t, windowTestCall(t, r, windowTestArgs("activate"))))
	if payload["ok"] != true || payload["verified"] != true || mustMapField(t, payload, "window")["id"] != "42:7" {
		t.Fatalf("activation acknowledgement: %#v", payload)
	}
	if r.owner.activates != 1 || r.owner.timeout != 1500 || !reflect.DeepEqual(r.owner.activateTarget, windowMap(&r.owner.snapshots[0])) || r.owner.reads != 0 || r.vision.captures != 0 {
		t.Fatal("activation was replayed or not scoped to exact snapshot")
	}
}
func TestWindowActivateFailureDoesNotRetry(t *testing.T) {
	r := newWindowTestRuntime(t)
	r.owner.activateErr = errors.New("activation failed")
	windowTestError(t, r, windowTestArgs("activate"), "activation failed")
	if r.owner.activates != 1 || r.owner.reads != 0 || r.vision.captures != 0 {
		t.Fatal("activation retried or fell back")
	}
}
func TestWindowActivateDoesNotReportSuccessWithoutVerifiedPostcondition(t *testing.T) {
	for _, kind := range []string{"wrong identity", "not foreground"} {
		t.Run(kind, func(t *testing.T) {
			r := newWindowTestRuntime(t)
			if kind == "wrong identity" {
				r.owner.active.ID = "99:8"
			} else {
				r.owner.active.IsForeground = false
			}
			result := windowTestCall(t, r, windowTestArgs("activate"))
			if result["isError"] != true {
				payload := mustJSONTextPayload(t, mustCallContent(t, result))
				if payload["ok"] == true {
					t.Fatalf("unverified activation reported success: %#v", payload)
				}
			}
			if r.owner.activates != 1 {
				t.Fatalf("activation calls=%d", r.owner.activates)
			}
		})
	}
}

func TestWindowReadPassesCompleteExactIdentityWithoutTitleLookup(t *testing.T) {
	r := newWindowTestRuntime(t)
	expected := r.owner.snapshots[0]
	expected.ExeName = "Fixture"
	expected.ExePath = "/fixture/executable"
	expected.HasFocus = true
	expected.IsPopup = true
	expected.Index = 3
	r.owner.snapshots[0] = expected
	result := windowTestCall(t, r, windowTestArgs("read"))
	if result["isError"] == true {
		t.Fatalf("exact read failed: %#v", result)
	}
	if len(r.owner.readTargets) != 1 || r.owner.readTargets[0] != expected {
		t.Fatalf("exact reader did not receive all snapshot fields: %#v", r.owner.readTargets)
	}
	if r.owner.titleReads != 0 {
		t.Fatal("read used GetContent title lookup")
	}
}

func TestWindowReadRejectsNativeTitleOrSiblingChangeBeforePrivateValues(t *testing.T) {
	for _, kind := range []string{"title changed", "same PID sibling"} {
		t.Run(kind, func(t *testing.T) {
			r := newWindowTestRuntime(t)
			expected := r.owner.snapshots[0]
			changed := expected
			if kind == "title changed" {
				changed.Title = "Renamed"
			} else {
				changed.Handle++
				changed.ID = "42:8"
				// The sibling deliberately retains the original title and PID.
			}
			r.owner.readNative = &changed
			windowTestError(t, r, windowTestArgs("read"), "STALE_TARGET")
			if len(r.owner.readTargets) != 1 || r.owner.readTargets[0] != expected {
				t.Fatalf("read did not retain the original exact target: %#v", r.owner.readTargets)
			}
			if r.owner.privateValues != 0 || r.owner.titleReads != 0 || r.owner.reads != 1 || r.vision.captures != 0 {
				t.Fatal("changed native target read values, reselected by title, retried or fell back")
			}
		})
	}
}

func TestWindowExactContentRejectsInvalidIdentityBeforeNativeAccess(t *testing.T) {
	valid := automation.WindowInfo{ID: fmt.Sprintf("%s:42:native:7", runtime.GOOS), ProcessID: 42,
		Handle: 7, Title: "Document", Width: 300, Height: 200}
	for name, change := range map[string]func(*automation.WindowInfo){
		"missing ID":      func(w *automation.WindowInfo) { w.ID = "" },
		"unresolved ID":   func(w *automation.WindowInfo) { w.ID = fmt.Sprintf("%s:42:unresolved", runtime.GOOS) },
		"mismatched ID":   func(w *automation.WindowInfo) { w.ID = fmt.Sprintf("%s:42:native:8", runtime.GOOS) },
		"missing PID":     func(w *automation.WindowInfo) { w.ProcessID = 0 },
		"missing handle":  func(w *automation.WindowInfo) { w.Handle = 0 },
		"empty title":     func(w *automation.WindowInfo) { w.Title = " " },
		"zero width":      func(w *automation.WindowInfo) { w.Width = 0 },
		"negative height": func(w *automation.WindowInfo) { w.Height = -1 },
	} {
		t.Run(name, func(t *testing.T) {
			target := valid
			change(&target)
			text, err := automation.ReadWindowContentExact(target)
			var failure *automation.WindowError
			if text != "" || !errors.As(err, &failure) || failure.Code != automation.WindowInvalidArgument ||
				failure.Operation != "window.getContent" || failure.Platform != runtime.GOOS {
				t.Fatalf("invalid identity did not fail before native access with structured error: text=%q err=%v", text, err)
			}
		})
	}
}

func TestWindowExactContentDoesNotAddReflectedWindowManagerMethod(t *testing.T) {
	managerType := reflect.TypeOf((*automation.WindowManager)(nil))
	for _, name := range []string{"ReadContentExact", "ReadWindowContentExact"} {
		if _, ok := managerType.MethodByName(name); ok {
			t.Fatalf("Go-only exact content reader exposed as reflected WindowManager.%s", name)
		}
	}
}
