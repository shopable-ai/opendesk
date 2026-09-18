package appshell

import "testing"

func TestProductAnalyticsDiagnosticsMenuIsDeveloperOnlyAndHiddenByDefault(t *testing.T) {
	items := openDeskProductMenu(Manifest{ID: OpenDeskProductPackageID})
	var developer *nativeMenuItem
	for i := range items {
		if items[i].ID == menuProductDeveloper {
			developer = &items[i]
			break
		}
	}
	if developer == nil {
		t.Fatal("Developer submenu not found")
	}
	for _, item := range developer.Children {
		if item.ID != ActionProductAnalyticsDiagnostics {
			continue
		}
		if item.Visible == nil || *item.Visible {
			t.Fatalf("analytics diagnostics must be present but hidden by default: %+v", item)
		}
		return
	}
	t.Fatal("analytics diagnostics item not found in Developer submenu")
}
