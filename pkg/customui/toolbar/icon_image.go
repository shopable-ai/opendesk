package toolbar

import (
	"bytes"
	"encoding/base64"
	"image"
	_ "image/jpeg"
	_ "image/png"
)

const (
	IconKindBuiltIn = "builtIn"
	IconKindImage   = "image"

	IconRenderingOriginal = "original"
	IconRenderingTemplate = "template"

	MaxIconImageBytes     = 512 * 1024
	MaxToolbarImageBytes  = 4 * 1024 * 1024
	MaxIconImageDimension = 1024
)

// IconImage is the bounded, validated raster payload sent to the native host.
// Source is retained only by the Runtime for public readback and never crosses
// the process boundary, so the native host cannot read caller-selected paths.
type IconImage struct {
	Source        string `json:"-"`
	MediaType     string `json:"mediaType"`
	DataBase64    string `json:"dataBase64"`
	ByteLength    int    `json:"byteLength"`
	PixelWidth    int    `json:"pixelWidth"`
	PixelHeight   int    `json:"pixelHeight"`
	RenderingMode string `json:"renderingMode"`
}

func ValidIconImage(value *IconImage) bool {
	if value == nil || (value.MediaType != "image/png" && value.MediaType != "image/jpeg") ||
		(value.RenderingMode != IconRenderingOriginal && value.RenderingMode != IconRenderingTemplate) ||
		value.ByteLength < 1 || value.ByteLength > MaxIconImageBytes ||
		value.PixelWidth < 1 || value.PixelWidth > MaxIconImageDimension ||
		value.PixelHeight < 1 || value.PixelHeight > MaxIconImageDimension {
		return false
	}
	decoded, err := base64.StdEncoding.Strict().DecodeString(value.DataBase64)
	if err != nil || len(decoded) != value.ByteLength || base64.StdEncoding.EncodeToString(decoded) != value.DataBase64 {
		return false
	}
	config, format, err := image.DecodeConfig(bytes.NewReader(decoded))
	if err != nil || config.Width != value.PixelWidth || config.Height != value.PixelHeight {
		return false
	}
	return format == "png" && value.MediaType == "image/png" || format == "jpeg" && value.MediaType == "image/jpeg"
}

func IconPresentationForButton(button ButtonSpec) (IconPresentation, bool) {
	if button.IconImage != nil {
		if button.Icon != "" || !ValidIconImage(button.IconImage) {
			return IconPresentation{}, false
		}
		return IconPresentation{
			Kind: IconKindImage, MediaType: button.IconImage.MediaType,
			PixelWidth: button.IconImage.PixelWidth, PixelHeight: button.IconImage.PixelHeight,
			RenderingMode: button.IconImage.RenderingMode,
		}, true
	}
	presentation, ok := IconPresentationFor(button.Icon)
	if ok {
		presentation.Kind = IconKindBuiltIn
	}
	return presentation, ok
}
