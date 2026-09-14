package appshell

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

func nativeMenuForManifest(manifest Manifest) []nativeMenuItem {
	if IsOpenDeskProduct(manifest) {
		return openDeskProductMenu(manifest)
	}
	items := []nativeMenuItem{
		{ID: ActionOpen, Label: "Open / Show"},
		{Type: "separator"},
	}
	items = append(items, nativeMenuItems(manifest.Tray.Menu)...)
	items = append(items,
		nativeMenuItem{Type: "separator"},
		nativeMenuItem{ID: ActionQuit, Label: "Quit"},
	)
	return items
}

func openDeskProductMenu(manifest Manifest) []nativeMenuItem {
	items := []nativeMenuItem{
		{ID: ActionOpen, Label: "显示主窗口"},
		{Type: "separator"},
	}
	items = append(items, nativeMenuItems(manifest.Tray.Menu)...)
	items = append(items,
		nativeMenuItem{Type: "separator"},
		nativeMenuItem{Label: "开发者", Children: []nativeMenuItem{
			{ID: ActionProductStatus, Label: "运行状态"},
			{ID: ActionProductMeasurement, Label: "桌面测量"},
			{ID: ActionProductInspectorOpen, Label: "打开 Inspector"},
			{Type: "separator"},
			{ID: ActionProductLogsOpen, Label: "打开日志目录"},
			{Label: "调试信息", Children: []nativeMenuItem{
				{ID: ActionProductDebugNormal, Label: "✓ 普通"},
				{ID: ActionProductDebugDetailed, Label: "详细"},
			}},
		}},
		nativeMenuItem{Type: "separator"},
		nativeMenuItem{Label: "帮助与服务", Children: []nativeMenuItem{
			{ID: ActionProductHome, Label: "OpenDesk 官网"},
			{ID: ActionProductHelp, Label: "帮助"},
			{ID: ActionProductCustomize, Label: "定制"},
		}},
		nativeMenuItem{Type: "separator"},
		nativeMenuItem{ID: ActionQuit, Label: "退出"},
	)
	return items
}

func nativeMenuItems(items []MenuItem) []nativeMenuItem {
	result := make([]nativeMenuItem, 0, len(items))
	for _, item := range items {
		result = append(result, nativeMenuItem{
			Type: item.Type, ID: item.ID, Label: item.Label,
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
