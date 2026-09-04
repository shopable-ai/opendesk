package main

import (
	"flag"
	"os"
	"path/filepath"
	"testing"
)

func TestResolveConsoleSettingsDefaultsToNormal(t *testing.T) {
	settings, err := resolveConsoleSettings(nil, t.TempDir(), emptyEnvironment)
	if err != nil {
		t.Fatalf("resolveConsoleSettings returned error: %v", err)
	}
	if settings.Mode != "normal" || settings.Categories != "" || settings.OutputFormat != "text" {
		t.Fatalf("unexpected built-in console defaults: %+v", settings)
	}
}

func TestResolveConsoleSettingsEnvironmentPrecedence(t *testing.T) {
	dir := t.TempDir()
	writeConsoleEnvironment(t, filepath.Join(dir, ".env"), "OPENDESK_CONSOLE_MODE=script\nOPENDESK_CONSOLE_CATEGORIES=script,summary,error\nUNRELATED_KEY=kept-for-the-script\n")
	writeConsoleEnvironment(t, filepath.Join(dir, ".opendesk.env"), "OPENDESK_CONSOLE_MODE=full\n")

	settings, err := resolveConsoleSettings(nil, dir, environmentMap(map[string]string{
		"OPENDESK_CONSOLE_MODE": "summary",
	}))
	if err != nil {
		t.Fatalf("resolveConsoleSettings returned error: %v", err)
	}
	if settings.Mode != "summary" {
		t.Fatalf("mode = %q, want process environment to override files", settings.Mode)
	}
	if settings.Categories != "script,summary,error" {
		t.Fatalf("categories = %q, want .env value", settings.Categories)
	}
	if len(settings.EnvironmentAt) != 2 {
		t.Fatalf("environment files = %v, want both default files", settings.EnvironmentAt)
	}
}

func TestResolveConsoleSettingsCommandLineWinsOverEnvironment(t *testing.T) {
	dir := t.TempDir()
	writeConsoleEnvironment(t, filepath.Join(dir, ".opendesk.env"), "OPENDESK_CONSOLE_MODE=full\n")

	settings, err := resolveConsoleSettings([]string{"-console-mode", "quiet", "-console-categories=error"}, dir, emptyEnvironment)
	if err != nil {
		t.Fatalf("resolveConsoleSettings returned error: %v", err)
	}
	if settings.Mode != "quiet" || settings.Categories != "error" {
		t.Fatalf("unexpected command-line override: %+v", settings)
	}
}

func TestResolveConsoleSettingsAcceptsDoubleDashFlags(t *testing.T) {
	dir := t.TempDir()
	writeConsoleEnvironment(t, filepath.Join(dir, "ci.env"), "OPENDESK_CONSOLE_MODE=quiet\n")

	settings, err := resolveConsoleSettings([]string{"--env-file", "ci.env", "--debug", "--console-mode=script", "--console-categories", "script,error"}, dir, emptyEnvironment)
	if err != nil {
		t.Fatalf("resolveConsoleSettings returned error: %v", err)
	}
	if settings.Mode != "script" || settings.Categories != "script,error" {
		t.Fatalf("unexpected double-dash overrides: %+v", settings)
	}
	if len(settings.EnvironmentAt) != 1 || settings.EnvironmentAt[0] != filepath.Join(dir, "ci.env") {
		t.Fatalf("double-dash environment file was not selected: %+v", settings)
	}
}

func TestConsoleOverridesOnlyUsesVisitedFlags(t *testing.T) {
	flags := flag.NewFlagSet("console", flag.ContinueOnError)
	config := &Config{}
	flags.StringVar(&config.ScriptText, "script-text", "", "")
	flags.StringVar(&config.ConsoleMode, "console-mode", defaultConsoleMode, "")
	if err := flags.Parse([]string{"-script-text", "-console-mode=quiet"}); err != nil {
		t.Fatalf("parse flags: %v", err)
	}

	overrides := consoleOverridesFromVisitedFlags(flags, config)
	if overrides.ModeSet {
		t.Fatalf("script text was mistaken for a console override: %+v", overrides)
	}
}

func TestResolveConsoleSettingsDebugShorthandAndExplicitMode(t *testing.T) {
	dir := t.TempDir()
	settings, err := resolveConsoleSettings([]string{"-debug"}, dir, emptyEnvironment)
	if err != nil {
		t.Fatalf("resolveConsoleSettings returned error: %v", err)
	}
	if settings.Mode != "full" || settings.Categories != "" {
		t.Fatalf("-debug should select full diagnostics, got %+v", settings)
	}

	settings, err = resolveConsoleSettings([]string{"-debug", "-console-mode=script"}, dir, emptyEnvironment)
	if err != nil {
		t.Fatalf("resolveConsoleSettings returned error: %v", err)
	}
	if settings.Mode != "script" {
		t.Fatalf("explicit mode should take priority over -debug, got %q", settings.Mode)
	}
}

func TestResolveConsoleSettingsExplicitEnvironmentFile(t *testing.T) {
	dir := t.TempDir()
	writeConsoleEnvironment(t, filepath.Join(dir, ".env"), "OPENDESK_CONSOLE_MODE=full\n")
	writeConsoleEnvironment(t, filepath.Join(dir, "ci.env"), "OPENDESK_CONSOLE_MODE=quiet\n")

	settings, err := resolveConsoleSettings([]string{"-env-file", "ci.env"}, dir, emptyEnvironment)
	if err != nil {
		t.Fatalf("resolveConsoleSettings returned error: %v", err)
	}
	if settings.Mode != "quiet" || len(settings.EnvironmentAt) != 1 || settings.EnvironmentAt[0] != filepath.Join(dir, "ci.env") {
		t.Fatalf("explicit environment file was not selected: %+v", settings)
	}
}

func TestResolveConsoleSettingsRejectsInvalidKnownValues(t *testing.T) {
	dir := t.TempDir()
	if _, err := resolveConsoleSettings([]string{"-console-mode=verbose"}, dir, emptyEnvironment); err == nil {
		t.Fatal("expected invalid mode error")
	}
	if _, err := resolveConsoleSettings([]string{"-console-categories=script,verbose"}, dir, emptyEnvironment); err == nil {
		t.Fatal("expected invalid category error")
	}
}

func TestNormalConsoleSelectionSuppressesDebugEvents(t *testing.T) {
	normal := buildConsoleSelection("normal", "")
	if !normal.Categories["script"] || !normal.Categories["summary"] || normal.Categories["framework"] || normal.IncludeDebug {
		t.Fatalf("unexpected normal selection: %+v", normal)
	}
	script := buildConsoleSelection("script", "")
	if !script.IncludeDebug || script.Categories["framework"] {
		t.Fatalf("unexpected script selection: %+v", script)
	}
	full := buildConsoleSelection("full", "")
	if !full.IncludeDebug || !full.Categories["framework"] || !full.Categories["meta"] {
		t.Fatalf("unexpected full selection: %+v", full)
	}
}

func writeConsoleEnvironment(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func emptyEnvironment(string) (string, bool) {
	return "", false
}

func environmentMap(values map[string]string) func(string) (string, bool) {
	return func(key string) (string, bool) {
		value, ok := values[key]
		return value, ok
	}
}
