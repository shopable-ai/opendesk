package automation

import "testing"

func TestComputeVirtualBoundsSingleDisplay(t *testing.T) {
	displays := []DisplayInfo{
		{Index: 1, X: 0, Y: 0, Width: 2560, Height: 1440},
	}
	b := computeVirtualBounds(displays)
	if b.X != 0 || b.Y != 0 || b.Width != 2560 || b.Height != 1440 {
		t.Fatalf("unexpected bounds: %+v", b)
	}
}

func TestComputeVirtualBoundsMultipleDisplays(t *testing.T) {
	displays := []DisplayInfo{
		{Index: 1, X: 0, Y: 0, Width: 2560, Height: 1440},
		{Index: 2, X: -1512, Y: -120, Width: 1512, Height: 982},
	}
	b := computeVirtualBounds(displays)
	if b.X != -1512 || b.Y != -120 || b.Width != 4072 || b.Height != 1560 {
		t.Fatalf("unexpected bounds: %+v", b)
	}
}

func TestComputeVirtualBoundsEmpty(t *testing.T) {
	b := computeVirtualBounds(nil)
	if b.X != 0 || b.Y != 0 || b.Width != 0 || b.Height != 0 {
		t.Fatalf("unexpected bounds: %+v", b)
	}
}
