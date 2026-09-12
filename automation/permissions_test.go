package automation

import (
	"sync"
	"testing"
	"time"
)

func TestAggregatePermissionOverall(t *testing.T) {
	tests := []struct {
		name        string
		permissions []RuntimePermission
		want        PermissionOverall
	}{
		{name: "required granted", permissions: []RuntimePermission{{Requirement: PermissionRequired, Status: PermissionGranted}}, want: PermissionReady},
		{name: "required denied", permissions: []RuntimePermission{{Requirement: PermissionRequired, Status: PermissionDenied}}, want: PermissionBlocked},
		{name: "optional denied", permissions: []RuntimePermission{{Requirement: PermissionOptional, Status: PermissionDenied}}, want: PermissionLimited},
		{name: "required unsupported", permissions: []RuntimePermission{{Requirement: PermissionRequired, Status: PermissionUnsupported}}, want: PermissionBlocked},
		{name: "required unknown", permissions: []RuntimePermission{{Requirement: PermissionRequired, Status: PermissionUnknown}}, want: PermissionUnknownOverall},
		{name: "required not determined", permissions: []RuntimePermission{{Requirement: PermissionRequired, Status: PermissionNotDetermined}}, want: PermissionUnknownOverall},
		{name: "required not required", permissions: []RuntimePermission{{Requirement: PermissionRequired, Status: PermissionNotRequired}}, want: PermissionReady},
		{name: "on demand does not downgrade", permissions: []RuntimePermission{{Requirement: PermissionOnDemand, Status: PermissionDenied}}, want: PermissionReady},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := aggregatePermissionOverall(test.permissions); got != test.want {
				t.Fatalf("aggregatePermissionOverall() = %q, want %q", got, test.want)
			}
		})
	}
}

func TestPermissionFeatureRequirements(t *testing.T) {
	desktop := permissionRequirements("desktop-automation")
	if desktop[PermissionAccessibility] != PermissionRequired {
		t.Fatalf("desktop accessibility = %q, want required", desktop[PermissionAccessibility])
	}
	if desktop[PermissionScreenCapture] != PermissionRequired {
		t.Fatalf("desktop screen capture = %q, want required", desktop[PermissionScreenCapture])
	}
	if desktop[PermissionInputMonitoring] != PermissionOptional {
		t.Fatalf("desktop input monitoring = %q, want optional", desktop[PermissionInputMonitoring])
	}
	if desktop[PermissionAutomation] != PermissionOnDemand {
		t.Fatalf("desktop automation = %q, want on-demand", desktop[PermissionAutomation])
	}
	for id, requirement := range permissionRequirements("script-runner") {
		if requirement != PermissionOnDemand {
			t.Fatalf("script-runner %s = %q, want on-demand", id, requirement)
		}
	}
	if permissionRequirements("screenshot")[PermissionScreenCapture] != PermissionRequired {
		t.Fatal("screenshot screen capture should be required")
	}
}

func TestParsePermissionID(t *testing.T) {
	base, target, err := parsePermissionID("automation:Finder")
	if err != nil {
		t.Fatalf("parse automation target: %v", err)
	}
	if base != PermissionAutomation || target != "Finder" {
		t.Fatalf("parse automation target = %q %q", base, target)
	}
	if _, _, err := parsePermissionID("screen-capture:Finder"); err == nil {
		t.Fatal("expected target on non-automation permission to fail")
	}
	if _, _, err := parsePermissionID("missing"); err == nil {
		t.Fatal("expected unknown permission to fail")
	}
}

func TestPermissionProviderAbstractionFeedsDomainModel(t *testing.T) {
	provider := &fakePermissionProvider{statuses: map[PermissionID]PermissionStatus{
		PermissionAccessibility: PermissionGranted, PermissionScreenCapture: PermissionDenied,
		PermissionInputMonitoring: PermissionUnsupported, PermissionAutomation: PermissionUnknown,
	}}
	requirements := permissionRequirements("desktop-automation")
	permissions := make([]RuntimePermission, 0, len(permissionCatalog))
	for _, definition := range permissionCatalog {
		permissions = append(permissions, runtimePermission(definition, requirements[definition.ID], "", provider.Check(definition.ID, "")))
	}
	if got := aggregatePermissionOverall(permissions); got != PermissionBlocked {
		t.Fatalf("mocked provider aggregate = %q, want BLOCKED", got)
	}
}

func TestPermissionChecksArePureUnderLoad(t *testing.T) {
	provider := &fakePermissionProvider{statuses: map[PermissionID]PermissionStatus{PermissionAccessibility: PermissionDenied}}
	for i := 0; i < 1000; i++ {
		if _, err := checkPermissionWithProvider(provider, "accessibility"); err != nil {
			t.Fatal(err)
		}
	}
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := checkPermissionWithProvider(provider, "accessibility"); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	_, requests, settings := provider.counts()
	if requests != 0 || settings != 0 {
		t.Fatalf("pure checks triggered side effects: request=%d settings=%d", requests, settings)
	}
}

func TestAlreadyReadyRequestsNeverReachNativeRequest(t *testing.T) {
	provider := &fakePermissionProvider{statuses: map[PermissionID]PermissionStatus{PermissionAccessibility: PermissionGranted}}
	coordinator := newPermissionRequestCoordinator(time.Second)
	for i := 0; i < 100; i++ {
		if _, err := requestPermissionWithProvider(coordinator, provider, "accessibility", PermissionRequestOptions{}); err != nil {
			t.Fatal(err)
		}
	}
	_, requests, _ := provider.counts()
	if requests != 0 {
		t.Fatalf("native requests = %d, want 0", requests)
	}
}

func TestConcurrentPermissionRequestsUseSingleFlight(t *testing.T) {
	provider := &fakePermissionProvider{
		statuses:     map[PermissionID]PermissionStatus{PermissionAccessibility: PermissionDenied},
		requestDelay: 30 * time.Millisecond,
	}
	coordinator := newPermissionRequestCoordinator(time.Second)
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := requestPermissionWithProvider(coordinator, provider, "accessibility", PermissionRequestOptions{}); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	_, requests, _ := provider.counts()
	if requests != 1 {
		t.Fatalf("native requests = %d, want 1", requests)
	}
}

func TestPermissionRequestCooldownAndForceRetry(t *testing.T) {
	provider := &fakePermissionProvider{
		statuses:     map[PermissionID]PermissionStatus{PermissionScreenCapture: PermissionDenied},
		requestDelay: 20 * time.Millisecond,
	}
	coordinator := newPermissionRequestCoordinator(time.Minute)
	if _, err := requestPermissionWithProvider(coordinator, provider, "screen-capture", PermissionRequestOptions{}); err != nil {
		t.Fatal(err)
	}
	if _, err := requestPermissionWithProvider(coordinator, provider, "screen-capture", PermissionRequestOptions{}); err != nil {
		t.Fatal(err)
	}
	_, requests, _ := provider.counts()
	if requests != 1 {
		t.Fatalf("cooldown native requests = %d, want 1", requests)
	}

	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := requestPermissionWithProvider(coordinator, provider, "screen-capture", PermissionRequestOptions{Force: true}); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	_, requests, _ = provider.counts()
	if requests != 2 {
		t.Fatalf("force retry native requests = %d, want 2 total", requests)
	}
}

type fakePermissionProvider struct {
	mu           sync.Mutex
	statuses     map[PermissionID]PermissionStatus
	checks       int
	requests     int
	settings     int
	requestDelay time.Duration
}

func (f *fakePermissionProvider) Check(id PermissionID, target string) permissionProbe {
	_ = target
	f.mu.Lock()
	defer f.mu.Unlock()
	f.checks++
	return permissionProbe{Status: f.statuses[id], Evidence: map[string]any{"provider": "fake"}}
}
func (f *fakePermissionProvider) Request(id PermissionID, target string) (permissionProbe, error) {
	f.mu.Lock()
	f.requests++
	delay := f.requestDelay
	status := f.statuses[id]
	f.mu.Unlock()
	if delay > 0 {
		time.Sleep(delay)
	}
	return permissionProbe{Status: status, Evidence: map[string]any{"provider": "fake-request"}}, nil
}
func (f *fakePermissionProvider) OpenSettings(id PermissionID) (PermissionSettingsResult, error) {
	f.mu.Lock()
	f.settings++
	f.mu.Unlock()
	return PermissionSettingsResult{Opened: true, ID: string(id)}, nil
}
func (f *fakePermissionProvider) counts() (checks, requests, settings int) {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.checks, f.requests, f.settings
}
