package automation

import "testing"

// mustTestSeparators converts the public AnalyzeLayout separator shape back
// into the internal form so tests exercise the same contract consumers see.
func mustTestSeparators(t *testing.T, raw interface{}) (vertical, horizontal []layoutSeparator) {
	t.Helper()
	groups, ok := raw.(map[string]interface{})
	if !ok {
		t.Fatalf("separators have unexpected type %T", raw)
	}
	for _, separator := range visionParseSeparators(groups) {
		switch separator.Orientation {
		case "vertical":
			vertical = append(vertical, separator)
		case "horizontal":
			horizontal = append(horizontal, separator)
		default:
			t.Fatalf("separator has unexpected orientation %q: %#v", separator.Orientation, separator)
		}
	}
	return vertical, horizontal
}

func assertSeparatorNear(t *testing.T, separators []layoutSeparator, want, tolerance int) {
	t.Helper()
	for _, separator := range separators {
		if absoluteInt(separator.Position-want) <= tolerance {
			return
		}
	}
	t.Fatalf("no separator within %dpx of %d; got %v", tolerance, want, separatorPositionsForTest(separators))
}

func mustTestRegions(t *testing.T, raw interface{}) []layoutRegion {
	t.Helper()
	regions, err := visionParseRegions(raw)
	if err != nil {
		t.Fatalf("regions have unexpected shape: %v", err)
	}
	if regions == nil {
		t.Fatal("regions are missing")
	}
	return regions
}

func separatorPositionsForTest(separators []layoutSeparator) []int {
	positions := make([]int, len(separators))
	for index, separator := range separators {
		positions[index] = separator.Position
	}
	return positions
}

func absoluteInt(value int) int {
	if value < 0 {
		return -value
	}
	return value
}
