//go:build darwin

package automation

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

const macOSNotificationHelperRequestLimit = 1 << 20

func RunMacOSNotificationHelper(stdin io.Reader, stdout, stderr io.Writer) int {
	request, err := decodeMacOSNotificationHelperRequest(stdin)
	response := macOSNotificationHelperResponse{}
	if err == nil {
		switch request.Operation {
		case "send":
			if request.Title == "" {
				request.Title = "OpenDesk Notification"
			}
			err = notifyDarwinNative(request.Title, request.Message, request.Sound)
		case "list":
			response.Notifications, err = notificationInteractionDarwinListNative()
		case "dismiss":
			response.Dismissed, err = notificationInteractionDarwinDismissNative(request.ID)
		default:
			err = fmt.Errorf("unsupported notification helper operation %q", request.Operation)
		}
		if errors.Is(err, errDarwinNativeNotificationUnavailable) {
			err = fmt.Errorf("notification helper must run from a real OpenDesk.app bundle")
		}
	}

	response.OK = err == nil
	if err != nil {
		response.Error = err.Error()
		if stderr != nil {
			_, _ = fmt.Fprintf(stderr, "OpenDesk notification helper failed: %v\n", err)
		}
	}
	if encodeErr := json.NewEncoder(stdout).Encode(response); encodeErr != nil {
		if stderr != nil {
			_, _ = fmt.Fprintf(stderr, "OpenDesk notification helper response failed: %v\n", encodeErr)
		}
		return 1
	}
	if err != nil {
		return 1
	}
	return 0
}

func decodeMacOSNotificationHelperRequest(reader io.Reader) (macOSNotificationHelperRequest, error) {
	var request macOSNotificationHelperRequest
	raw, err := io.ReadAll(io.LimitReader(reader, macOSNotificationHelperRequestLimit+1))
	if err != nil {
		return request, fmt.Errorf("read notification helper request: %w", err)
	}
	if len(raw) > macOSNotificationHelperRequestLimit {
		return request, fmt.Errorf("notification helper request exceeds %d bytes", macOSNotificationHelperRequestLimit)
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		return request, fmt.Errorf("decode notification helper request: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		return request, fmt.Errorf("notification helper request must contain one JSON object")
	}
	if request.Operation == "" {
		request.Operation = "send"
	}
	switch request.Operation {
	case "send":
		if err := validateNotificationText("title", request.Title); err != nil {
			return request, err
		}
		if err := validateNotificationText("message", request.Message); err != nil {
			return request, err
		}
	case "list":
		if request.Title != "" || request.Message != "" || request.Sound || request.ID != "" {
			return request, fmt.Errorf("notification list helper request contains send/dismiss fields")
		}
	case "dismiss":
		if strings.TrimSpace(request.ID) == "" || strings.ContainsRune(request.ID, '\x00') {
			return request, fmt.Errorf("notification dismiss helper id must be a non-empty string without NUL")
		}
		if request.Title != "" || request.Message != "" || request.Sound {
			return request, fmt.Errorf("notification dismiss helper request contains send fields")
		}
	default:
		return request, fmt.Errorf("unsupported notification helper operation %q", request.Operation)
	}
	return request, nil
}

func notifyDarwinViaAppHelper(title, message string, sound bool) error {
	helper, err := locateOpenDeskAppNotificationHelper()
	if err != nil {
		return err
	}
	return notifyDarwinViaAppHelperAtPath(helper, title, message, sound)
}

func locateOpenDeskAppNotificationHelper() (string, error) {
	executable, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("locate current executable: %w", err)
	}
	executable, err = filepath.Abs(executable)
	if err != nil {
		return "", fmt.Errorf("resolve current executable: %w", err)
	}

	candidates := []string{
		filepath.Join(filepath.Dir(executable), "OpenDesk.app", "Contents", "MacOS", "opendesk"),
	}
	marker := string(filepath.Separator) + "OpenDesk.app" + string(filepath.Separator) + "Contents" + string(filepath.Separator) + "MacOS" + string(filepath.Separator)
	if strings.Contains(executable, marker) {
		candidates = append([]string{executable}, candidates...)
	}

	for _, candidate := range candidates {
		info, statErr := os.Stat(candidate)
		if statErr != nil || !info.Mode().IsRegular() || info.Mode().Perm()&0o111 == 0 {
			continue
		}
		return candidate, nil
	}
	return "", fmt.Errorf("native notification helper is missing; keep the plain opendesk binary beside OpenDesk.app from scripts/build_macos_app.sh")
}

func notifyDarwinViaAppHelperAtPath(helper, title, message string, sound bool) error {
	response, err := runMacOSNotificationHelperAtPath(context.Background(), helper, macOSNotificationHelperRequest{
		Operation: "send", Title: title, Message: message, Sound: sound,
	})
	if err != nil {
		return err
	}
	if !response.OK {
		return fmt.Errorf("notification helper returned an unsuccessful response")
	}
	return nil
}

func listDarwinNotificationsViaAppHelper(ctx context.Context) ([]NotificationRecord, error) {
	helper, err := locateOpenDeskAppNotificationHelper()
	if err != nil {
		return nil, err
	}
	response, err := runMacOSNotificationHelperAtPath(ctx, helper, macOSNotificationHelperRequest{Operation: "list"})
	if err != nil {
		return nil, fmt.Errorf("OpenDesk.app notification helper: %w", err)
	}
	if response.Notifications == nil {
		response.Notifications = []NotificationRecord{}
	}
	return response.Notifications, nil
}

func dismissDarwinNotificationViaAppHelper(ctx context.Context, id string) (bool, error) {
	helper, err := locateOpenDeskAppNotificationHelper()
	if err != nil {
		return false, err
	}
	response, err := runMacOSNotificationHelperAtPath(ctx, helper, macOSNotificationHelperRequest{Operation: "dismiss", ID: id})
	if err != nil {
		return false, fmt.Errorf("OpenDesk.app notification helper: %w", err)
	}
	return response.Dismissed, nil
}

func runMacOSNotificationHelperAtPath(parent context.Context, helper string, payload macOSNotificationHelperRequest) (macOSNotificationHelperResponse, error) {
	var response macOSNotificationHelperResponse
	request, err := json.Marshal(payload)
	if err != nil {
		return response, fmt.Errorf("encode notification helper request: %w", err)
	}

	if parent == nil {
		parent = context.Background()
	}
	ctx, cancel := context.WithTimeout(parent, 45*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, helper, internalMacOSNotificationHelperArgument)
	cmd.Stdin = bytes.NewReader(request)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	runErr := cmd.Run()
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return response, fmt.Errorf("notification helper timed out: %w", context.DeadlineExceeded)
	}
	if errors.Is(ctx.Err(), context.Canceled) {
		return response, ctx.Err()
	}

	decodeErr := json.Unmarshal(stdout.Bytes(), &response)
	stderrText := strings.TrimSpace(stderr.String())
	if runErr != nil {
		details := strings.TrimSpace(response.Error)
		if stderrText != "" && (details == "" || !strings.Contains(stderrText, details)) {
			if details != "" {
				details += "; "
			}
			details += stderrText
		}
		if details == "" {
			details = runErr.Error()
		}
		return response, fmt.Errorf("notification helper process failed: %s", details)
	}
	if decodeErr != nil {
		return response, fmt.Errorf("decode notification helper response: %w", decodeErr)
	}
	if stderrText != "" {
		return response, fmt.Errorf("notification helper wrote stderr: %s", stderrText)
	}
	if !response.OK || response.Error != "" {
		if response.Error == "" {
			response.Error = "helper returned an unsuccessful response"
		}
		return response, fmt.Errorf("%s", response.Error)
	}
	return response, nil
}
