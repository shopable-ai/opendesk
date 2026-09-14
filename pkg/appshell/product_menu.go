package appshell

import "opendesk/pkg/localization"

const OpenDeskProductPackageID = "com.opendesk.desktop"

const (
	ActionProductStatus        = "opendesk.status"
	ActionProductInspectorOpen = "opendesk.inspector.open"
	ActionProductMeasurement   = "opendesk.measurement"
	ActionProductLogsOpen      = "opendesk.logs.open"
	ActionProductDebugNormal   = "opendesk.debug.normal"
	ActionProductDebugDetailed = "opendesk.debug.detailed"
	ActionProductHome          = "opendesk.home"
	ActionProductHelp          = "opendesk.help"
	ActionProductCustomize     = "opendesk.customize"
	ActionProductExamples      = "opendesk.examples"
	ActionProductAPIDocs       = "opendesk.api-docs"
)

// nativeMenuItem is an App Shell implementation detail. Its recursive shape
// deliberately does not extend the public opendesk.app.json menu contract.
// Only the repository-owned OpenDesk product package receives this composed
// menu; ordinary Script Apps keep the flat manifest menu they declared.
type nativeMenuItem struct {
	Type     string           `json:"type,omitempty"`
	ID       string           `json:"id,omitempty"`
	Label    string           `json:"label,omitempty"`
	Enabled  *bool            `json:"enabled,omitempty"`
	Visible  *bool            `json:"visible,omitempty"`
	Children []nativeMenuItem `json:"children,omitempty"`
}

func IsOpenDeskProduct(manifest Manifest) bool {
	return manifest.ID == OpenDeskProductPackageID
}

// allowsOpenDeskProductManifestAction keeps the reserved action namespace
// unavailable to third-party packages while allowing the resource actions
// intentionally declared by the first-party product manifest.
func allowsOpenDeskProductManifestAction(manifest Manifest, action string) bool {
	return IsOpenDeskProduct(manifest) &&
		(action == ActionProductExamples || action == ActionProductAPIDocs)
}

// ResolveMenuLabel is the single App Shell bridge between manifest presentation
// references and Locale Core. Native backends receive only resolved text and do
// not read catalogs themselves.
func ResolveMenuLabel(item MenuItem) string {
	if item.LabelKey == "" {
		return item.Label
	}
	return localization.TranslateWithFallback(item.LabelKey, item.Label)
}

func translatedProductLabel(key, fallback string) string {
	return localization.TranslateWithFallback(key, fallback)
}

func nativeMenuForManifest(manifest Manifest) []nativeMenuItem {
	if IsOpenDeskProduct(manifest) {
		return openDeskProductMenu(manifest)
	}
	items := []nativeMenuItem{
		{ID: ActionOpen, Label: translatedProductLabel("menu.open", "Open / Show")},
		{Type: "separator"},
	}
	items = append(items, nativeMenuItems(manifest.Tray.Menu)...)
	items = append(items,
		nativeMenuItem{Type: "separator"},
		nativeMenuItem{ID: ActionQuit, Label: translatedProductLabel("menu.quit", "Quit")},
	)
	return items
}

func openDeskProductMenu(manifest Manifest) []nativeMenuItem {
	items := []nativeMenuItem{
		{ID: ActionOpen, Label: translatedProductLabel("menu.open", "打开 OpenDesk")},
		{Type: "separator"},
	}
	items = append(items, nativeMenuItems(manifest.Tray.Menu)...)
	items = append(items,
		nativeMenuItem{Type: "separator"},
		nativeMenuItem{Label: translatedProductLabel("menu.developer", "开发者"), Children: []nativeMenuItem{
			{ID: ActionProductStatus, Label: translatedProductLabel("menu.runtimeStatus", "运行状态")},
			{ID: ActionProductMeasurement, Label: translatedProductLabel("menu.measurement", "桌面测量")},
			{ID: ActionProductInspectorOpen, Label: translatedProductLabel("menu.inspector", "打开 Inspector")},
			{Type: "separator"},
			{ID: ActionProductLogsOpen, Label: translatedProductLabel("menu.logs", "打开日志目录")},
			{Label: translatedProductLabel("menu.debug", "调试信息"), Children: []nativeMenuItem{
				{ID: ActionProductDebugNormal, Label: translatedProductLabel("menu.debugNormal", "✓ 普通")},
				{ID: ActionProductDebugDetailed, Label: translatedProductLabel("menu.debugDetailed", "详细")},
			}},
		}},
		nativeMenuItem{Type: "separator"},
		nativeMenuItem{Label: translatedProductLabel("menu.helpAndSupport", "帮助与服务"), Children: []nativeMenuItem{
			{ID: ActionProductHome, Label: translatedProductLabel("menu.website", "OpenDesk 官网")},
			{ID: ActionProductHelp, Label: translatedProductLabel("menu.help", "帮助")},
			{ID: ActionProductCustomize, Label: translatedProductLabel("menu.customize", "定制")},
		}},
		nativeMenuItem{Type: "separator"},
		nativeMenuItem{ID: ActionQuit, Label: translatedProductLabel("menu.quit", "退出")},
	)
	return items
}

func nativeMenuItems(items []MenuItem) []nativeMenuItem {
	result := make([]nativeMenuItem, 0, len(items))
	for _, item := range items {
		result = append(result, nativeMenuItem{
			Type: item.Type, ID: item.ID, Label: ResolveMenuLabel(item),
			Enabled: item.Enabled, Visible: item.Visible,
		})
	}
	return result
}

func visitNativeMenu(items []nativeMenuItem, visit func(nativeMenuItem)) {
	for _, item := range items {
		visit(item)
		visitNativeMenu(item.Children, visit)
	}
}

func isProductSystemAction(value string) bool {
	switch value {
	case ActionProductStatus,
		ActionProductMeasurement,
		ActionProductInspectorOpen,
		ActionProductLogsOpen,
		ActionProductDebugNormal,
		ActionProductDebugDetailed,
		ActionProductHome,
		ActionProductHelp,
		ActionProductCustomize:
		return true
	default:
		return false
	}
}
