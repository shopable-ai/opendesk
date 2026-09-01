//go:build darwin

package automation

/*
#cgo LDFLAGS: -framework AppKit -framework ApplicationServices
#include <stdint.h>

typedef struct {
	int32_t status;
	int32_t x;
	int32_t y;
	int32_t width;
	int32_t height;
	uint32_t display_id;
	int32_t display_index;
	double scale_factor;
} opendesk_region_selector_result;

opendesk_region_selector_result opendesk_region_selector_run(
	int dim_outside, int movable, int resizable, int min_width, int min_height);
*/
import "C"

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"strings"
)

const macOSRegionSelectorHelperFlag = "-mac-region-selector-helper"

type regionSelectorHelperResponse struct {
	Status string          `json:"status"`
	Region *SelectedRegion `json:"region,omitempty"`
	Error  *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func MacOSRegionSelectorHelperRequested(args []string) bool {
	for _, arg := range args {
		if arg == macOSRegionSelectorHelperFlag {
			return true
		}
	}
	return false
}

func RunMacOSRegionSelectorHelper(stdin io.Reader, stdout, stderr io.Writer) int {
	var options RegionSelectorOptions
	if err := json.NewDecoder(io.LimitReader(stdin, 4096)).Decode(&options); err != nil {
		fmt.Fprintln(stderr, "region selector helper received invalid options")
		return 1
	}
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	result := C.opendesk_region_selector_run(
		captureCBool(options.DimOutside), captureCBool(options.Movable), captureCBool(options.Resizable),
		C.int(options.MinWidth), C.int(options.MinHeight),
	)
	response := regionSelectorHelperResponse{}
	switch int32(result.status) {
	case 0:
		region := SelectedRegion{
			X: int(result.x), Y: int(result.y), Width: int(result.width), Height: int(result.height),
			DisplayID: fmt.Sprintf("%d", uint32(result.display_id)), DisplayIndex: int(result.display_index),
			ScaleFactor: float64(result.scale_factor),
		}
		region.PixelWidth = int(float64(region.Width)*region.ScaleFactor + 0.5)
		region.PixelHeight = int(float64(region.Height)*region.ScaleFactor + 0.5)
		response.Status, response.Region = "selected", &region
	case 1:
		response.Status = "canceled"
	default:
		response.Status = "failed"
		response.Error = &struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		}{Code: string(ScreenCaptureBackendFailed), Message: "native region selector failed"}
	}
	if err := json.NewEncoder(stdout).Encode(response); err != nil {
		fmt.Fprintln(stderr, "region selector helper could not encode its response")
		return 1
	}
	return 0
}

func runMacOSRegionSelector(ctx context.Context, options RegionSelectorOptions) (SelectedRegion, error) {
	executable, err := os.Executable()
	if err != nil {
		return SelectedRegion{}, captureOperationError("", ScreenCaptureBackendFailed, "current executable path is unavailable", err)
	}
	payload, err := json.Marshal(options)
	if err != nil {
		return SelectedRegion{}, captureOperationError("", ScreenCaptureBackendFailed, "selector options could not be encoded", err)
	}
	cmd := exec.CommandContext(ctx, executable, macOSRegionSelectorHelperFlag)
	cmd.Stdin = bytes.NewReader(payload)
	var stdout bytes.Buffer
	stderr := &boundedCaptureBuffer{limit: 2048}
	cmd.Stdout, cmd.Stderr = &stdout, stderr
	if err := cmd.Run(); err != nil {
		if ctx.Err() != nil {
			return SelectedRegion{}, captureOperationError("", ScreenCaptureCanceled, "region selection was canceled by execution teardown", ctx.Err())
		}
		return SelectedRegion{}, captureOperationError("", ScreenCaptureBackendFailed, "region selector helper failed", err)
	}
	var response regionSelectorHelperResponse
	if err := json.Unmarshal(stdout.Bytes(), &response); err != nil {
		return SelectedRegion{}, captureOperationError("", ScreenCaptureBackendFailed, "region selector helper returned invalid metadata", err)
	}
	switch response.Status {
	case "selected":
		if response.Region == nil || response.Region.Width < options.MinWidth || response.Region.Height < options.MinHeight {
			return SelectedRegion{}, captureOperationError("", ScreenCaptureBackendFailed, "region selector returned invalid bounds", nil)
		}
		if display, ok := captureDisplayByIndex(response.Region.DisplayIndex); !ok || display.ID != response.Region.DisplayID {
			return SelectedRegion{}, captureOperationError("", ScreenCaptureTargetMissing, "selected display is no longer available", nil)
		}
		return *response.Region, nil
	case "canceled":
		return SelectedRegion{}, captureOperationError("", ScreenCaptureCanceled, "region selection was canceled", nil)
	default:
		message := "region selector helper failed"
		code := ScreenCaptureBackendFailed
		if response.Error != nil {
			message = strings.TrimSpace(response.Error.Message)
			if response.Error.Code == string(ScreenCapturePermissionDenied) {
				code = ScreenCapturePermissionDenied
			}
		}
		return SelectedRegion{}, captureOperationError("", code, message, nil)
	}
}

func captureCBool(value bool) C.int {
	if value {
		return 1
	}
	return 0
}
