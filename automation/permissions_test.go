package automation

import "testing"

func TestAggregatePermissionOverall(t *testing.T) {
	tests := []struct {
		name        string
		permissions []RuntimePermission
		want        PermissionOverall
	}{
		{
			name: "required granted",
			permissions: []RuntimePermission{{Requirement: PermissionRequired, Status: PermissionGranted}},
			want: PermissionReady,
		},
		{
			name: "required denied",
			permissions: []RuntimePermission{{Requirement: PermissionRequired, Status: PermissionDenied}},
			want: PermissionBlocked,
		},
		{
			name: "optional denied",
			permissions: []RuntimePermission{{Requirement: PermissionOptional, Status: PermissionDenied}},
			want: PermissionLimited,
		},
		{
			name: "required unsupported",
			permissions: []RuntimePermission{{Requirement: PermissionRequired, Status: PermissionUnsupported}},
			want: PermissionBlocked,
		},
		{
			name: "required unknown",
			permissions: []RuntimePermission{{Requirement: PermissionRequired, Status: PermissionUnknown}},
			want: PermissionUnknownOverall,
		},
		{
			name: "required not determined",
			permissions: []RuntimePermission{{Requirement: PermissionRequired, Status: PermissionNotDetermined}},
			want: PermissionUnknownOverall,
		},
		{
			name: "required not required",
			permissions: []RuntimePermission{{Requirement: PermissionRequired, Status: PermissionNotRequired}},
			want: PermissionReady,
		},
		{
			name: "on demand does not downgrade",
			permissions: []RuntimePermission{{Requirement: PermissionOnDemand, Status: PermissionDenied}},
			want: PermissionReady,
		},
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

	scriptRunner := permissionRequirements("script-runner")
	for id, requirement := range scriptRunner {
		if requirement != PermissionOnDemand {
			t.Fatalf("script-runner %s = %q, want on-demand", id, requirement)
		}
	}

	screenshot := permissionRequirements("screenshot")
	if screenshot[PermissionScreenCapture] != PermissionRequired {
		t.Fatalf("screenshot screen capture = %q, want required", screenshot[PermissionScreenCapture])
	}
	if screenshot[PermissionAccessibility] != PermissionOnDemand {
		t.Fatalf("screenshot accessibility = %q, want on-demand", screenshot[PermissionAccessibility])
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
	provider := fakePermissionProvider{statuses: map[PermissionID]PermissionStatus{
		PermissionAccessibility:   PermissionGranted,
		PermissionScreenCapture:   PermissionDenied,
		PermissionInputMonitoring: PermissionUnsupported,
		PermissionAutomation:      PermissionUnknown,
	}}
	requirements := permissionRequirements("desktop-automation")
	permissions := make([]RuntimePermission, 0, len(permissionCatalog))
	for _, definition := range permissionCatalog {
		probe := provider.Check(definition.ID, "")
		permissions = append(permissions, runtimePermission(definition, requirements[definition.ID], "", probe))
	}
	if got := aggregatePermissionOverall(permissions); got != PermissionBlocked {
		t.Fatalf("mocked provider aggregate = %q, want BLOCKED", got)
	}
	if permissions[0].Status != PermissionGranted || permissions[1].Status != PermissionDenied {
		t.Fatalf("mocked provider status not preserved: %#v", permissions)
	}
}

type fakePermissionProvider struct {
	statuses map[PermissionID]PermissionStatus
}

func (f fakePermissionProvider) Check(id PermissionID, target string) permissionProbe {
	_ = target
	return permissionProbe{Status: f.statuses[id], Evidence: map[string]any{"provider": "fake"}}
}
func (f fakePermissionProvider) Request(id PermissionID, target string) (permissionProbe, error) {
	return f.Check(id, target), nil
}
func (f fakePermissionProvider) OpenSettings(id PermissionID) error {
	_ = id
	return nil
}
