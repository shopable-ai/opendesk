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
	if err == nil {
		if request.Title == "" {
			request.Title = "OpenDesk Notification"
		}
		err = notifyDarwinNative(request.Title, request.Message, request.Sound)
		if errors.Is(err, errDarwinNativeNotificationUnavailable) {
			err = fmt.Errorf("notification helper must run from a real OpenDesk.app bundle")
		}
	}

	response := macOSNotificationHelperResponse{OK: err == nil}
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
	if err := validateNotificationText("title", request.Title); err != nil {
		return request, err
	}
	if err := validateNotificationText("message", request.Message); err != nil {
		return request, err
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
	request, err := json.Marshal(macOSNotificationHelperRequest{Title: title, Message: message, Sound: sound})
	if err != nil {
		return fmt.Errorf("encode notification helper request: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, helper, internalMacOSNotificationHelperArgument)
	cmd.Stdin = bytes.NewReader(request)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	runErr := cmd.Run()
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return fmt.Errorf("notification helper timed out")
	}

	var response macOSNotificationHelperResponse
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
		return fmt.Errorf("notification helper process failed: %s", details)
	}
	if decodeErr != nil {
		return fmt.Errorf("decode notification helper response: %w", decodeErr)
	}
	if stderrText != "" {
		return fmt.Errorf("notification helper wrote stderr: %s", stderrText)
	}
	if !response.OK || response.Error != "" {
		if response.Error == "" {
			response.Error = "helper returned an unsuccessful response"
		}
		return fmt.Errorf("%s", response.Error)
	}
	return nil
}
