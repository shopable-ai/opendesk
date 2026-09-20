package officialconfig

import (
	"strings"
	"testing"
)

const testDistributionRoot = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f"

func TestFlowDistributionAllowsExplicitlyUnconfiguredProduct(t *testing.T) {
	config := Config{SchemaVersion: SchemaVersion, Actions: validFlowDistributionTestActions()}
	if err := Validate(config); err != nil {
		t.Fatalf("Validate() unconfigured distribution error = %v", err)
	}
}

func TestFlowDistributionValidatesStaticPrefixesAndRoots(t *testing.T) {
	config := Config{
		SchemaVersion: SchemaVersion,
		Actions:       validFlowDistributionTestActions(),
		FlowDistribution: &FlowDistribution{
			Resolver:        "static",
			MetadataBaseURL: "https://downloads.example.test/opendesk/",
			ArtifactBaseURL: "https://cdn.example.test/flows/",
			ReleaseRoots:    map[string]string{"release-root-1": testDistributionRoot},
		},
	}
	if err := Validate(config); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
}

func TestFlowDistributionRejectsUnsafeOrIncompleteConfig(t *testing.T) {
	tests := []FlowDistribution{
		{Resolver: "guess", MetadataBaseURL: "https://downloads.example.test/", ReleaseRoots: map[string]string{"root": testDistributionRoot}},
		{Resolver: "static", MetadataBaseURL: "http://127.0.0.1:8080/", ReleaseRoots: map[string]string{"root": testDistributionRoot}},
		{Resolver: "static", MetadataBaseURL: "https://downloads.example.test/no-slash", ReleaseRoots: map[string]string{"root": testDistributionRoot}},
		{Resolver: "static", MetadataBaseURL: "https://downloads.example.test/", ReleaseRoots: nil},
		{Resolver: "static", MetadataBaseURL: "https://downloads.example.test/", ReleaseRoots: map[string]string{"root": "00"}},
	}
	for index := range tests {
		config := Config{SchemaVersion: SchemaVersion, Actions: validFlowDistributionTestActions(), FlowDistribution: &tests[index]}
		if err := Validate(config); err == nil {
			t.Fatalf("case %d unexpectedly accepted: %+v", index, tests[index])
		}
	}
}

func TestFlowDistributionSourceRejectsUnknownNestedField(t *testing.T) {
	data := `{"schemaVersion":1,"actions":{"home":{"visible":true,"url":"https://example.test/"},"help":{"visible":true,"url":""},"customize":{"visible":true,"url":""},"marketplace":{"visible":false,"url":""},"upgrade":{"visible":false,"url":""}},"flowDistribution":{"resolver":"static","metadataBaseUrl":"https://example.test/","artifactBaseUrl":"","releaseRoots":{"root":"` + testDistributionRoot + `"},"fallback":true}}`
	_, err := ParseSource([]byte(data))
	if err == nil || !strings.Contains(err.Error(), "unknown field") {
		t.Fatalf("unknown nested field error = %v", err)
	}
}

func validFlowDistributionTestActions() map[string]Action {
	actions := map[string]Action{}
	for _, name := range allActionNames() {
		actions[name] = Action{Visible: true, URL: "https://example.test/"}
	}
	return actions
}
