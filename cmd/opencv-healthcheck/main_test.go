//go:build opencv

package main

import "testing"

func TestTemplateMatchingHealthCheck(t *testing.T) {
	if _, err := checkTemplateMatching(); err != nil {
		t.Fatal(err)
	}
}
