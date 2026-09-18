package productanalytics

import (
	"testing"
	"time"
)

func TestDiagnosticsAreConsentGatedSanitizedAndClearedOnWithdrawal(t *testing.T) {
	service, err := New(Options{
		DataRoot: t.TempDir(),
		Config: Config{
			Provider: ProviderDebug, Environment: "test",
			MaxEventBytes: 2048, MaxQueueSize: 16, BatchSize: 4,
		},
		Runtime: RuntimeInfo{AppVersion: "2.0.1", Platform: "macos", Arch: "arm64"},
		Now: func() time.Time { return time.Date(2026, 9, 18, 1, 0, 0, 0, time.UTC) },
	})
	if err != nil {
		t.Fatal(err)
	}
	service.Start()

	if service.ScreenViewed("flow_runner") {
		t.Fatal("pre-consent event unexpectedly accepted")
	}
	before := service.Diagnostics()
	if !before.Initialized || len(before.RecentEvents) != 0 || before.LastSendResult != "" {
		t.Fatalf("pre-consent diagnostics leaked activity: %+v", before)
	}

	if _, err := service.SetConsent(true); err != nil {
		t.Fatal(err)
	}
	if !service.ScreenViewed("flow_runner") {
		t.Fatal("consented screen event was rejected")
	}
	diagnostics := service.Diagnostics()
	if diagnostics.Consent != ConsentGranted || diagnostics.Provider != ProviderDebug {
		t.Fatalf("unexpected diagnostics state: %+v", diagnostics)
	}
	if !diagnostics.QueueDepthKnown || diagnostics.QueueMode != "local-debug-ring" || diagnostics.QueueDepth == 0 {
		t.Fatalf("unexpected debug queue state: %+v", diagnostics)
	}
	if len(diagnostics.RecentEvents) == 0 {
		t.Fatalf("missing recent diagnostics events: %+v", diagnostics)
	}
	last := diagnostics.RecentEvents[len(diagnostics.RecentEvents)-1]
	if last.Event != "screen_viewed" || last.Result != "stored_local_debug" || last.ErrorCode != "" {
		t.Fatalf("unexpected sanitized recent event: %+v", last)
	}
	if diagnostics.LastSendResult != "stored_local_debug" {
		t.Fatalf("unexpected last send result: %+v", diagnostics)
	}

	if _, err := service.SetConsent(false); err != nil {
		t.Fatal(err)
	}
	after := service.Diagnostics()
	if after.Consent != ConsentDenied || len(after.RecentEvents) != 0 || after.LastSendResult != "" {
		t.Fatalf("withdrawal did not clear diagnostics: %+v", after)
	}
}

func TestPostHogDiagnosticsDoNotInventQueueDepth(t *testing.T) {
	service, err := New(Options{
		DataRoot: t.TempDir(),
		Config: Config{
			Provider: ProviderPostHog,
			Endpoint: "https://us.i.posthog.com",
			ProjectToken: "phc_diagnostics_test",
			Environment: "test",
			MaxQueueSize: 37,
			MaxEnqueuedRequests: 3,
		},
		Runtime: RuntimeInfo{AppVersion: "2.0.1", Platform: "macos", Arch: "arm64"},
	})
	if err != nil {
		t.Fatal(err)
	}
	diagnostics := service.Diagnostics()
	if diagnostics.QueueMode != "sdk-managed" || diagnostics.QueueCapacity != 37 {
		t.Fatalf("unexpected PostHog queue diagnostics: %+v", diagnostics)
	}
	if diagnostics.QueueDepthKnown || diagnostics.QueueDepth != 0 {
		t.Fatalf("PostHog SDK queue depth must remain explicitly unknown: %+v", diagnostics)
	}
}
