package measurement

import (
	"math"
	"strings"
	"testing"
)

func TestTwoPointResultUsesSameReferenceAndLogicalSpace(t *testing.T) {
	snapshot, reference := testContext(t)
	result, err := BuildTwoPointResult(snapshot, reference, Point{X: -1200, Y: 40}, Point{X: -1197, Y: 44})
	if err != nil {
		t.Fatal(err)
	}
	if result.Kind != "twoPoint" || result.TwoPoint == nil {
		t.Fatalf("result = %+v", result)
	}
	if result.TwoPoint.DeltaX != 3 || result.TwoPoint.DeltaY != 4 || math.Abs(result.TwoPoint.Distance-5) > 1e-9 {
		t.Fatalf("two point = %+v", result.TwoPoint)
	}
	if result.TwoPoint.FirstRelative.X != 0 || result.TwoPoint.SecondRelative.X != 3 {
		t.Fatalf("relative = %+v", result.TwoPoint)
	}
}

func TestOutputsProvideThreeTiersWithCoordinateContract(t *testing.T) {
	snapshot, reference := testContext(t)
	result, err := BuildRegionResult(snapshot, reference, Rect{X: -1190, Y: 50, Width: 100, Height: 80})
	if err != nil {
		t.Fatal(err)
	}
	outputs, err := result.Outputs()
	if err != nil {
		t.Fatal(err)
	}
	if outputs.Concise == "" || outputs.Human == "" || outputs.JSON == "" {
		t.Fatalf("outputs = %+v", outputs)
	}
	for _, token := range []string{"ref=windowOuterBounds", "logical"} {
		if !strings.Contains(outputs.Concise, token) {
			t.Fatalf("concise missing %q: %s", token, outputs.Concise)
		}
	}
	for _, token := range []string{"坐标空间", "Capture Pixel", "正=参照内余量"} {
		if !strings.Contains(outputs.Human, token) {
			t.Fatalf("human missing %q: %s", token, outputs.Human)
		}
	}
	for _, token := range []string{`"version": 2`, `"screen": "screen-logical"`, `"relative": "reference-relative-logical"`} {
		if !strings.Contains(outputs.JSON, token) {
			t.Fatalf("json missing %q: %s", token, outputs.JSON)
		}
	}
}
