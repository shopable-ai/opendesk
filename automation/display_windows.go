//go:build windows

package automation

import (
	"fmt"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
)

const (
	windowsMonitorInfoPrimary  = 0x00000001
	windowsEnumCurrentSettings = 0xFFFFFFFF
)

var (
	windowsDisplayUser32            = windows.NewLazySystemDLL("user32.dll")
	windowsProcEnumDisplayMonitors  = windowsDisplayUser32.NewProc("EnumDisplayMonitors")
	windowsProcGetMonitorInfoW      = windowsDisplayUser32.NewProc("GetMonitorInfoW")
	windowsProcEnumDisplaySettingsW = windowsDisplayUser32.NewProc("EnumDisplaySettingsW")
)

type windowsDisplayRect struct {
	Left   int32
	Top    int32
	Right  int32
	Bottom int32
}

type windowsMonitorInfoEx struct {
	Size       uint32
	Monitor    windowsDisplayRect
	Work       windowsDisplayRect
	Flags      uint32
	DeviceName [32]uint16
}

// The fields used here follow DEVMODEW through dmPelsHeight. Keeping the full
// native prefix matters because EnumDisplaySettingsW validates dmSize.
type windowsDisplayMode struct {
	DeviceName         [32]uint16
	SpecVersion        uint16
	DriverVersion      uint16
	Size               uint16
	DriverExtra        uint16
	Fields             uint32
	PositionX          int32
	PositionY          int32
	DisplayOrientation uint32
	DisplayFixedOutput uint32
	Color              int16
	Duplex             int16
	YResolution        int16
	TTOption           int16
	Collate            int16
	FormName           [32]uint16
	LogPixels          uint16
	BitsPerPel         uint32
	PelsWidth          uint32
	PelsHeight         uint32
	DisplayFlags       uint32
	DisplayFrequency   uint32
	ICMMethod          uint32
	ICMIntent          uint32
	MediaType          uint32
	DitherType         uint32
	Reserved1          uint32
	Reserved2          uint32
	PanningWidth       uint32
	PanningHeight      uint32
}

type windowsDisplayEnumeration struct {
	displays []DisplayInfo
}

func listDisplaysPlatform() ([]DisplayInfo, error) {
	state := &windowsDisplayEnumeration{}
	callback := windows.NewCallback(func(monitor, _ uintptr, rectPtr uintptr, data uintptr) uintptr {
		context := (*windowsDisplayEnumeration)(unsafe.Pointer(data))
		logical := (*windowsDisplayRect)(unsafe.Pointer(rectPtr))
		info := windowsMonitorInfoEx{Size: uint32(unsafe.Sizeof(windowsMonitorInfoEx{}))}
		if ok, _, _ := windowsProcGetMonitorInfoW.Call(monitor, uintptr(unsafe.Pointer(&info))); ok == 0 {
			return 1
		}
		device := windows.UTF16ToString(info.DeviceName[:])
		mode := windowsDisplayMode{Size: uint16(unsafe.Sizeof(windowsDisplayMode{}))}
		name, err := windows.UTF16PtrFromString(device)
		if err != nil {
			return 1
		}
		if ok, _, _ := windowsProcEnumDisplaySettingsW.Call(uintptr(unsafe.Pointer(name)), windowsEnumCurrentSettings, uintptr(unsafe.Pointer(&mode))); ok == 0 {
			return 1
		}
		logicalWidth, logicalHeight := int(logical.Right-logical.Left), int(logical.Bottom-logical.Top)
		pixelWidth, pixelHeight := int(mode.PelsWidth), int(mode.PelsHeight)
		if logicalWidth <= 0 || logicalHeight <= 0 || pixelWidth <= 0 || pixelHeight <= 0 {
			return 1
		}
		index := len(context.displays) + 1
		context.displays = append(context.displays, DisplayInfo{
			Index: index, ID: device, HardwareID: "windows:" + strings.TrimPrefix(device, `\\.\`),
			IsPrimary: info.Flags&windowsMonitorInfoPrimary != 0,
			X:         int(logical.Left), Y: int(logical.Top), Width: logicalWidth, Height: logicalHeight,
			PixelWidth: pixelWidth, PixelHeight: pixelHeight,
			Scale: float64(pixelWidth) / float64(logicalWidth),
		})
		return 1
	})
	result, _, callErr := windowsProcEnumDisplayMonitors.Call(0, 0, callback, uintptr(unsafe.Pointer(state)))
	if result == 0 {
		return nil, fmt.Errorf("EnumDisplayMonitors failed: %v", callErr)
	}
	if len(state.displays) == 0 {
		return nil, fmt.Errorf("EnumDisplayMonitors returned no usable displays")
	}
	return state.displays, nil
}

// Display mode mutation is not part of Measurement. Keep the existing Screen
// capability honest until a Windows mode owner is implemented and verified.
type unsupportedDisplayControlBackend struct{}

func newDefaultDisplayControlBackend() displayControlBackend {
	return unsupportedDisplayControlBackend{}
}
func (unsupportedDisplayControlBackend) Name() string        { return "unsupported" }
func (unsupportedDisplayControlBackend) SupportsModes() bool { return false }
func (unsupportedDisplayControlBackend) CurrentMode(uint32) (DisplayModeInfo, error) {
	return DisplayModeInfo{}, fmt.Errorf("display mode reading is not implemented on Windows")
}
func (unsupportedDisplayControlBackend) ListModes(uint32) ([]DisplayModeInfo, error) {
	return nil, fmt.Errorf("display mode enumeration is not implemented on Windows")
}
func (unsupportedDisplayControlBackend) SetMode(uint32, DisplayModeInfo) error {
	return fmt.Errorf("display mode mutation is not implemented on Windows")
}
