package main

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"opendesk/pkg/appdata"
	pkgScheduler "opendesk/pkg/scheduler"
)

const schedulerCLIBridgeSchemaVersion = 1

type schedulerCLIBridge struct {
	SchemaVersion int    `json:"schemaVersion"`
	PackageID     string `json:"packageId"`
	ExecutionID   string `json:"executionId"`
	Endpoint      string `json:"endpoint"`
	Token         string `json:"token"`
	PublishedAt   string `json:"publishedAt"`
}

type schedulerCLIStatus struct {
	Available     bool   `json:"available"`
	RunnerState   string `json:"runnerState"`
	ScriptRoot    string `json:"scriptRoot"`
	ArtifactRoot  string `json:"artifactRoot"`
	LocalEndpoint string `json:"localEndpoint"`
}

type schedulerCLIConnection struct {
	bridge schedulerCLIBridge
	status schedulerCLIStatus
	client *http.Client
}

type schedulerCLIEnvelope struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

type schedulerCLIResult struct {
	OK     bool `json:"ok"`
	Result any  `json:"result,omitempty"`
	Error  *struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func init() {
	if len(os.Args) < 2 || os.Args[1] != "scheduler" {
		return
	}
	code := runSchedulerCLI(context.Background(), os.Args[2:], os.Stdout, os.Stderr)
	os.Exit(code)
}

func runSchedulerCLI(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 {
		writeSchedulerCLIError(stderr, "SCHEDULER_USAGE", "usage: opendesk scheduler <create|list|runs|delete|test> ...")
		return 2
	}
	var result any
	var err error
	switch args[0] {
	case "create":
		result, err = schedulerCLICreate(ctx, args[1:])
	case "list":
		result, err = schedulerCLIList(ctx, args[1:])
	case "runs":
		result, err = schedulerCLIRuns(ctx, args[1:])
	case "delete":
		result, err = schedulerCLIDelete(ctx, args[1:])
	case "test":
		result, err = runSchedulerTestCLI(ctx, args[1:])
	default:
		err = schedulerCLIError("SCHEDULER_USAGE", fmt.Sprintf("unknown scheduler command %q", args[0]))
	}
	if err != nil {
		code := "SCHEDULER_COMMAND_FAILED"
		var typed *schedulerCommandError
		if errors.As(err, &typed) && typed.Code != "" {
			code = typed.Code
		}
		writeSchedulerCLIError(stderr, code, err.Error())
		return 1
	}
	if err := json.NewEncoder(stdout).Encode(schedulerCLIResult{OK: true, Result: result}); err != nil {
		writeSchedulerCLIError(stderr, "SCHEDULER_OUTPUT_FAILED", err.Error())
		return 1
	}
	return 0
}

type schedulerCommandError struct {
	Code    string
	Message string
}

func (e *schedulerCommandError) Error() string { return e.Message }

func schedulerCLIError(code, message string) error {
	return &schedulerCommandError{Code: code, Message: message}
}

func writeSchedulerCLIError(writer io.Writer, code, message string) {
	payload := schedulerCLIResult{OK: false}
	payload.Error = &struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}{Code: code, Message: message}
	_ = json.NewEncoder(writer).Encode(payload)
}

func schedulerCLICreate(ctx context.Context, args []string) (any, error) {
	flags := flag.NewFlagSet("scheduler create", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	name := flags.String("name", "", "plan name")
	scheduleType := flags.String("schedule-type", "at", "at|every|cron")
	expression := flags.String("expression", "", "schedule expression")
	at := flags.String("at", "", "RFC3339 one-time schedule")
	timezone := flags.String("timezone", "Local", "IANA timezone or Local")
	misfire := flags.String("misfire", "run_once", "run_once|skip")
	script := flags.String("script", "", "script path relative to Scheduler script root")
	inline := flags.String("inline", "", "inline JavaScript")
	inlineFile := flags.String("inline-file", "", "file containing inline JavaScript")
	if err := flags.Parse(args); err != nil {
		return nil, schedulerCLIError("SCHEDULER_USAGE", err.Error())
	}
	if flags.NArg() != 0 {
		return nil, schedulerCLIError("SCHEDULER_USAGE", "scheduler create does not accept positional arguments")
	}
	if strings.TrimSpace(*at) != "" {
		*scheduleType = string(pkgScheduler.ScheduleAt)
		*expression = strings.TrimSpace(*at)
	}
	if strings.TrimSpace(*name) == "" || strings.TrimSpace(*expression) == "" {
		return nil, schedulerCLIError("SCHEDULER_USAGE", "--name and --expression (or --at) are required")
	}
	selectedSources := 0
	if strings.TrimSpace(*script) != "" {
		selectedSources++
	}
	if strings.TrimSpace(*inline) != "" {
		selectedSources++
	}
	if strings.TrimSpace(*inlineFile) != "" {
		selectedSources++
	}
	if selectedSources != 1 {
		return nil, schedulerCLIError("SCHEDULER_USAGE", "choose exactly one of --script, --inline, or --inline-file")
	}
	input := pkgScheduler.CreateJobInput{
		Name:               strings.TrimSpace(*name),
		ScheduleType:       pkgScheduler.ScheduleType(strings.TrimSpace(*scheduleType)),
		ScheduleExpression: strings.TrimSpace(*expression),
		Timezone:           strings.TrimSpace(*timezone),
		MisfirePolicy:      pkgScheduler.MisfirePolicy(strings.TrimSpace(*misfire)),
		TaskType:           "script",
	}
	if strings.TrimSpace(*script) != "" {
		input.SourceType = pkgScheduler.SourceFile
		input.ScriptPath = strings.TrimSpace(*script)
	} else {
		input.SourceType = pkgScheduler.SourceInline
		if strings.TrimSpace(*inlineFile) != "" {
			data, err := os.ReadFile(*inlineFile)
			if err != nil {
				return nil, schedulerCLIError("SCHEDULER_INLINE_READ_FAILED", fmt.Sprintf("read --inline-file: %v", err))
			}
			input.InlineScript = string(data)
		} else {
			input.InlineScript = *inline
		}
	}
	connection, err := discoverCurrentAppScheduler(ctx)
	if err != nil {
		return nil, err
	}
	var job pkgScheduler.Job
	if err := connection.request(ctx, http.MethodPost, "/api/scheduler/jobs", input, &job); err != nil {
		return nil, err
	}
	return job, nil
}

func schedulerCLIList(ctx context.Context, args []string) (any, error) {
	if len(args) != 0 {
		return nil, schedulerCLIError("SCHEDULER_USAGE", "scheduler list does not accept arguments")
	}
	connection, err := discoverCurrentAppScheduler(ctx)
	if err != nil {
		return nil, err
	}
	var jobs []pkgScheduler.Job
	if err := connection.request(ctx, http.MethodGet, "/api/scheduler/jobs", nil, &jobs); err != nil {
		return nil, err
	}
	return map[string]any{"jobs": jobs, "runnerState": connection.status.RunnerState}, nil
}

func schedulerCLIRuns(ctx context.Context, args []string) (any, error) {
	flags := flag.NewFlagSet("scheduler runs", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	jobID := flags.String("job", "", "job id")
	limit := flags.Int("limit", 20, "history limit")
	if err := flags.Parse(args); err != nil {
		return nil, schedulerCLIError("SCHEDULER_USAGE", err.Error())
	}
	if flags.NArg() != 0 || strings.TrimSpace(*jobID) == "" {
		return nil, schedulerCLIError("SCHEDULER_USAGE", "scheduler runs requires --job <jobId>")
	}
	if *limit < 1 {
		*limit = 1
	}
	if *limit > 100 {
		*limit = 100
	}
	connection, err := discoverCurrentAppScheduler(ctx)
	if err != nil {
		return nil, err
	}
	var runs []pkgScheduler.JobRun
	path := "/api/scheduler/jobs/" + url.PathEscape(strings.TrimSpace(*jobID)) + "/runs?limit=" + strconv.Itoa(*limit)
	if err := connection.request(ctx, http.MethodGet, path, nil, &runs); err != nil {
		return nil, err
	}
	return map[string]any{"jobId": strings.TrimSpace(*jobID), "runs": runs}, nil
}

func schedulerCLIDelete(ctx context.Context, args []string) (any, error) {
	flags := flag.NewFlagSet("scheduler delete", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	jobID := flags.String("job", "", "job id")
	if err := flags.Parse(args); err != nil {
		return nil, schedulerCLIError("SCHEDULER_USAGE", err.Error())
	}
	if flags.NArg() != 0 || strings.TrimSpace(*jobID) == "" {
		return nil, schedulerCLIError("SCHEDULER_USAGE", "scheduler delete requires --job <jobId>")
	}
	connection, err := discoverCurrentAppScheduler(ctx)
	if err != nil {
		return nil, err
	}
	var result map[string]any
	path := "/api/scheduler/jobs/" + url.PathEscape(strings.TrimSpace(*jobID))
	if err := connection.request(ctx, http.MethodDelete, path, nil, &result); err != nil {
		return nil, err
	}
	return map[string]any{"jobId": strings.TrimSpace(*jobID), "deleted": true}, nil
}

func discoverCurrentAppScheduler(ctx context.Context) (*schedulerCLIConnection, error) {
	root, err := appdata.Resolve(appdata.DesktopPackageID, nil)
	if err != nil {
		return nil, schedulerCLIError("APP_SCHEDULER_DISCOVERY_FAILED", fmt.Sprintf("resolve OpenDesk product data root: %v", err))
	}
	bridgeRoot := filepath.Join(root, ".runtime", "scheduler-bridges")
	entries, err := os.ReadDir(bridgeRoot)
	if errors.Is(err, os.ErrNotExist) {
		return nil, schedulerCLIError("APP_SCHEDULER_NOT_RUNNING", "no current OpenDesk desktop Scheduler instance is running")
	}
	if err != nil {
		return nil, schedulerCLIError("APP_SCHEDULER_DISCOVERY_FAILED", fmt.Sprintf("read Scheduler discovery directory: %v", err))
	}

	type liveCandidate struct {
		bridge schedulerCLIBridge
		status schedulerCLIStatus
		client *http.Client
	}
	live := make([]liveCandidate, 0, 2)
	seen := map[string]bool{}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".json") {
			continue
		}
		path := filepath.Join(bridgeRoot, entry.Name())
		info, statErr := os.Lstat(path)
		if statErr != nil || info.Mode()&os.ModeSymlink != 0 || !info.Mode().IsRegular() || info.Size() > 16<<10 {
			continue
		}
		data, readErr := os.ReadFile(path)
		if readErr != nil {
			continue
		}
		var bridge schedulerCLIBridge
		if json.Unmarshal(data, &bridge) != nil || bridge.SchemaVersion != schedulerCLIBridgeSchemaVersion || bridge.PackageID != appdata.DesktopPackageID {
			continue
		}
		endpoint, valid := validateSchedulerBridgeEndpoint(bridge.Endpoint)
		if !valid || !validSchedulerBridgeToken(bridge.Token) {
			continue
		}
		bridge.Endpoint = endpoint
		key := endpoint + "\x00" + bridge.Token
		if seen[key] {
			continue
		}
		client := &http.Client{Timeout: 850 * time.Millisecond}
		status, probeErr := probeSchedulerBridge(ctx, client, bridge)
		if probeErr != nil || !status.Available {
			continue
		}
		seen[key] = true
		live = append(live, liveCandidate{bridge: bridge, status: status, client: client})
	}
	if len(live) == 0 {
		return nil, schedulerCLIError("APP_SCHEDULER_NOT_RUNNING", "no current OpenDesk desktop Scheduler instance is reachable")
	}
	if len(live) > 1 {
		ids := make([]string, 0, len(live))
		for _, candidate := range live {
			id := strings.TrimSpace(candidate.bridge.ExecutionID)
			if id == "" {
				id = candidate.bridge.Endpoint
			}
			ids = append(ids, id)
		}
		return nil, schedulerCLIError("APP_SCHEDULER_AMBIGUOUS", fmt.Sprintf("multiple live OpenDesk desktop Scheduler instances were found (%s); close extra instances and retry", strings.Join(ids, ", ")))
	}
	return &schedulerCLIConnection{bridge: live[0].bridge, status: live[0].status, client: live[0].client}, nil
}

func validateSchedulerBridgeEndpoint(raw string) (string, bool) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Scheme != "http" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", false
	}
	if parsed.Path != "" && parsed.Path != "/" {
		return "", false
	}
	host := parsed.Hostname()
	port := parsed.Port()
	if host == "" || port == "" {
		return "", false
	}
	ip := net.ParseIP(host)
	if ip == nil || !ip.IsLoopback() {
		return "", false
	}
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 1 || portNumber > 65535 {
		return "", false
	}
	return strings.TrimRight(parsed.Scheme+"://"+parsed.Host, "/"), true
}

func validSchedulerBridgeToken(token string) bool {
	decoded, err := hex.DecodeString(strings.TrimSpace(token))
	return err == nil && len(decoded) == 32
}

func probeSchedulerBridge(ctx context.Context, client *http.Client, bridge schedulerCLIBridge) (schedulerCLIStatus, error) {
	var status schedulerCLIStatus
	connection := &schedulerCLIConnection{bridge: bridge, client: client}
	if err := connection.request(ctx, http.MethodGet, "/api/scheduler/status", nil, &status); err != nil {
		return schedulerCLIStatus{}, err
	}
	return status, nil
}

func (c *schedulerCLIConnection) request(ctx context.Context, method, path string, input, output any) error {
	if c == nil || c.client == nil {
		return schedulerCLIError("APP_SCHEDULER_UNAVAILABLE", "OpenDesk App Scheduler connection is unavailable")
	}
	var body io.Reader
	if input != nil {
		encoded, err := json.Marshal(input)
		if err != nil {
			return schedulerCLIError("SCHEDULER_REQUEST_FAILED", err.Error())
		}
		body = bytes.NewReader(encoded)
	}
	request, err := http.NewRequestWithContext(ctx, method, c.bridge.Endpoint+path, body)
	if err != nil {
		return schedulerCLIError("SCHEDULER_REQUEST_FAILED", err.Error())
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("X-OpenDesk-App-Token", c.bridge.Token)
	if input != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := c.client.Do(request)
	if err != nil {
		return schedulerCLIError("APP_SCHEDULER_UNREACHABLE", fmt.Sprintf("current OpenDesk Scheduler request failed: %v", err))
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	if err != nil {
		return schedulerCLIError("SCHEDULER_RESPONSE_FAILED", err.Error())
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		message := strings.TrimSpace(string(data))
		if message == "" {
			message = response.Status
		}
		return schedulerCLIError("SCHEDULER_REQUEST_REJECTED", message)
	}
	var envelope schedulerCLIEnvelope
	if err := json.Unmarshal(data, &envelope); err != nil {
		return schedulerCLIError("SCHEDULER_INVALID_RESPONSE", "Scheduler returned invalid JSON")
	}
	if envelope.Code != 0 {
		message := strings.TrimSpace(envelope.Message)
		if message == "" {
			message = "Scheduler request failed"
		}
		return schedulerCLIError("SCHEDULER_REQUEST_REJECTED", message)
	}
	if output != nil && len(envelope.Data) != 0 && string(envelope.Data) != "null" {
		if err := json.Unmarshal(envelope.Data, output); err != nil {
			return schedulerCLIError("SCHEDULER_INVALID_RESPONSE", fmt.Sprintf("decode Scheduler response: %v", err))
		}
	}
	return nil
}
