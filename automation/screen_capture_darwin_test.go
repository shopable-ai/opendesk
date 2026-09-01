//go:build darwin

package automation

import (
	"bytes"
	"errors"
	"testing"
)

func TestBoundedCaptureBufferDropsExcessHelperOutput(t *testing.T) {
	buffer := &boundedCaptureBuffer{limit: 5}
	if n, err := buffer.Write([]byte("1234")); n != 4 || err != nil {
		t.Fatalf("first write=%d err=%v", n, err)
	}
	if n, err := buffer.Write([]byte("56789")); n != 5 || err != nil {
		t.Fatalf("second write=%d err=%v", n, err)
	}
	if string(buffer.data) != "12345" {
		t.Fatalf("bounded data=%q", buffer.data)
	}
}

func TestDarwinCaptureErrorMappingUsesStableCodes(t *testing.T) {
	permission := mapDarwinCaptureError(errors.New("exit status 1"), "start failed", "screen recording not permitted")
	if screenCaptureErrorCode(permission) != ScreenCapturePermissionDenied {
		t.Fatalf("permission error=%v", permission)
	}
	output := mapDarwinCaptureError(errors.New("exit status 1"), "start failed", "could not write output")
	if screenCaptureErrorCode(output) != ScreenCaptureOutputFailed {
		t.Fatalf("output error=%v", output)
	}
	backend := mapDarwinCaptureError(errors.New("process exited"), "start failed", "")
	if screenCaptureErrorCode(backend) != ScreenCaptureBackendFailed {
		t.Fatalf("backend error=%v", backend)
	}
}

func TestMacOSRegionSelectorHelperRoutingIsExactAndRejectsInvalidInput(t *testing.T) {
	if !MacOSRegionSelectorHelperRequested([]string{"before", macOSRegionSelectorHelperFlag, "after"}) {
		t.Fatal("selector helper flag was not detected")
	}
	if MacOSRegionSelectorHelperRequested([]string{"-mac-region-selector-helper-extra"}) {
		t.Fatal("selector helper accepted a prefix match")
	}
	var output, diagnostics bytes.Buffer
	if status := RunMacOSRegionSelectorHelper(bytes.NewBufferString("not-json"), &output, &diagnostics); status != 1 {
		t.Fatalf("invalid helper input status=%d", status)
	}
	if output.Len() != 0 || diagnostics.String() != "region selector helper received invalid options\n" {
		t.Fatalf("output=%q diagnostics=%q", output.String(), diagnostics.String())
	}
}
