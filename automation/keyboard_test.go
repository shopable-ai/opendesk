package automation

import "testing"

func TestNormalizeKeyNameMapsPublicMetaToRobotgoModifierFlag(t *testing.T) {
	if got := normalizeKeyName("Meta"); got != "cmd" {
		t.Fatalf("normalizeKeyName(Meta)=%q, want robotgo modifier flag cmd", got)
	}
}
