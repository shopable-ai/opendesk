package execution

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestLocalWebhookUsesIndependentExternalHTTPProcess(t *testing.T) {
	repoRoot, err := filepath.Abs(filepath.Join("..", ".."))
	if err != nil {
		t.Fatal(err)
	}
	scriptPath := filepath.Join(repoRoot, "tests", "webhook", "external-http-integration.js")
	scriptContent, err := os.ReadFile(scriptPath)
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	result, _, runErr := Run(Request{
		Context:       ctx,
		ExecutionID:   NewExecutionID("webhook-external-helper"),
		SourceLabel:   "internal local webhook external HTTP integration",
		ScriptContent: scriptContent,
		Ext:           ".js",
		WorkDir:       repoRoot,
		Environment:   webhookTestEnvironment(),
		EnableCommand: true,
		EnableWebhook: true,
		Selection:     TerminalSelection{Mode: "quiet", Categories: map[string]bool{}},
	})
	if runErr != nil {
		t.Fatalf("external helper integration failed: status=%s error=%v", result.Status, runErr)
	}
	if result.Status != ExecutionStatusSucceeded {
		t.Fatalf("external helper integration status=%s", result.Status)
	}
}

func webhookTestEnvironment() map[string]string {
	environment := make(map[string]string)
	for _, entry := range os.Environ() {
		name, value, found := strings.Cut(entry, "=")
		if found && name != "" {
			environment[name] = value
		}
	}
	return environment
}
