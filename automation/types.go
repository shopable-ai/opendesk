package automation

// MouseOptions combines all mouse-related options
type MouseOptions struct {
	Button     string
	ClickCount int
	Delay      int
	Steps      int
}

// ScreenshotOptions defines options for taking screenshots
type ScreenshotOptions struct {
	Type           string       `json:"type"`
	Quality        int          `json:"quality"`
	FullPage       bool         `json:"fullPage"`
	OmitBackground bool         `json:"omitBackground"`
	Encoding       string       `json:"encoding"`
	ReturnType     string       `json:"returnType"`
	Path           string       `json:"path"`
	Target         string       `json:"target"`
	DisplayIndex   int          `json:"displayIndex"`
	Clip           *ClipOptions `json:"clip"`
}

type ClipOptions struct {
	X      int `json:"x"`
	Y      int `json:"y"`
	Width  int `json:"width"`
	Height int `json:"height"`
}

// WaitForOptions defines options for waiting
type WaitForOptions struct {
	Timeout int
}

// Default values
const (
	DefaultType     = "png"
	DefaultQuality  = 100
	DefaultEncoding = "binary"
	DefaultTarget   = "activeWindow"
)

// DefaultScreenshotOptions provides default values
var DefaultScreenshotOptions = ScreenshotOptions{
	Type:           DefaultType,
	Quality:        DefaultQuality,
	FullPage:       false,
	OmitBackground: false,
	Encoding:       DefaultEncoding,
	ReturnType:     "",
	Target:         DefaultTarget,
	DisplayIndex:   0,
}

// Helper functions for creating pointers to values
func stringPtr(s string) *string { return &s }
func intPtr(i int) *int          { return &i }
func boolPtr(b bool) *bool       { return &b }
