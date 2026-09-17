package officialconfig

import "testing"

func validAnalytics() *Analytics {
	return &Analytics{
		Provider:      "posthog",
		Endpoint:      "https://us.i.posthog.com",
		ProjectToken:  "",
		Environment:   "production",
		MaxEventBytes: 2048,
		Queue: AnalyticsQueue{
			MaxEvents: 1000, BatchSize: 20, MaxRequests: 4,
		},
		Network: AnalyticsNetwork{
			RequestTimeoutMs: 3000, FlushIntervalMs: 5000, MaxRetries: 1, ShutdownTimeoutMs: 750,
		},
		Session: AnalyticsSession{IdleTimeoutMinutes: 30},
	}
}

func TestValidateAcceptsPublisherOwnedAnalyticsConfig(t *testing.T) {
	config := testConfig()
	config.Analytics = validAnalytics()
	if err := Validate(config); err != nil {
		t.Fatalf("Validate analytics: %v", err)
	}
	encoded, err := Encode(config)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := Decode(encoded)
	if err != nil {
		t.Fatal(err)
	}
	if decoded.Analytics == nil || decoded.Analytics.Provider != "posthog" || decoded.Analytics.Network.ShutdownTimeoutMs != 750 {
		t.Fatalf("decoded analytics=%+v", decoded.Analytics)
	}
}

func TestValidateRejectsAnalyticsManagementCredentialAndUnsafeEndpoint(t *testing.T) {
	config := testConfig()
	config.Analytics = validAnalytics()
	config.Analytics.ProjectToken = "phx_management_secret"
	if err := Validate(config); err == nil {
		t.Fatal("management-style token unexpectedly accepted")
	}

	config = testConfig()
	config.Analytics = validAnalytics()
	config.Analytics.Endpoint = "http://localhost:8000"
	if err := Validate(config); err == nil {
		t.Fatal("non-HTTPS analytics endpoint unexpectedly accepted")
	}
}

func TestValidateRejectsUnboundedAnalyticsResources(t *testing.T) {
	config := testConfig()
	config.Analytics = validAnalytics()
	config.Analytics.Queue.MaxEvents = 1001
	if err := Validate(config); err == nil {
		t.Fatal("oversized analytics queue unexpectedly accepted")
	}
	config = testConfig()
	config.Analytics = validAnalytics()
	config.Analytics.Network.ShutdownTimeoutMs = 5000
	if err := Validate(config); err == nil {
		t.Fatal("unbounded analytics shutdown unexpectedly accepted")
	}
}
