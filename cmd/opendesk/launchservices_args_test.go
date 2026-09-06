package main

import (
	"reflect"
	"testing"
)

func TestStripLeadingMacOSLaunchServicesPSN(t *testing.T) {
	tests := []struct {
		name string
		args []string
		want []string
	}{
		{name: "finder launch", args: []string{"-psn_0_12345"}, want: []string{}},
		{name: "finder launch with script", args: []string{"-psn_0_12345", "-script", "fixture.js"}, want: []string{"-script", "fixture.js"}},
		{name: "ai command remains intact", args: []string{"-psn_0_12345", "ai", "run"}, want: []string{"ai", "run"}},
		{name: "malformed token remains intact", args: []string{"-psn_not-a-launchservices-token"}, want: []string{"-psn_not-a-launchservices-token"}},
		{name: "later text value remains intact", args: []string{"-script-text", "-psn_0_12345"}, want: []string{"-script-text", "-psn_0_12345"}},
		{name: "double dash value remains intact", args: []string{"--", "-psn_0_12345"}, want: []string{"--", "-psn_0_12345"}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := stripLeadingMacOSLaunchServicesPSN(test.args); !reflect.DeepEqual(got, test.want) {
				t.Fatalf("stripLeadingMacOSLaunchServicesPSN(%q) = %q, want %q", test.args, got, test.want)
			}
		})
	}
}
