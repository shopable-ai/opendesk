package appshell

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"image/png"
	"io"
	"os"
)

const (
	maxTrayIconFileBytes       = 16 << 20
	minMacOSTrayIconPixels     = 16
	maxMacOSTrayIconPixels     = 1024
	minWindowsTrayIconPixels   = 16
	maxWindowsTrayIconPixels   = 256
	maxWindowsTrayIconFrameNum = 256
)

var pngSignature = []byte("\x89PNG\r\n\x1a\n")

// validateMacOSTemplateIcon verifies the portable part of the AppKit template
// image contract before App Mode starts. AppKit still owns the final native
// decode, 18-point sizing, and appearance-aware rendering.
func validateMacOSTemplateIcon(iconPath string) error {
	data, err := readTrayIcon(iconPath)
	if err != nil {
		return err
	}
	config, err := png.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("decode PNG: %w", err)
	}
	if config.Width != config.Height {
		return fmt.Errorf("template PNG must be square, got %dx%d", config.Width, config.Height)
	}
	if config.Width < minMacOSTrayIconPixels || config.Width > maxMacOSTrayIconPixels {
		return fmt.Errorf("template PNG dimensions must be between %dx%d and %dx%d, got %dx%d",
			minMacOSTrayIconPixels, minMacOSTrayIconPixels,
			maxMacOSTrayIconPixels, maxMacOSTrayIconPixels,
			config.Width, config.Height)
	}
	decoded, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("decode complete PNG image data: %w", err)
	}
	hasVisible, hasTransparency := false, false
	bounds := decoded.Bounds()
	for y := bounds.Min.Y; y < bounds.Max.Y && !(hasVisible && hasTransparency); y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			_, _, _, alpha := decoded.At(x, y).RGBA()
			hasVisible = hasVisible || alpha != 0
			hasTransparency = hasTransparency || alpha != 0xffff
			if hasVisible && hasTransparency {
				break
			}
		}
	}
	if !hasVisible {
		return errors.New("template PNG is fully transparent and would be invisible")
	}
	if !hasTransparency {
		return errors.New("template PNG has no transparent pixels and would render as a solid menu bar square")
	}
	return nil
}

// validateWindowsTrayIcon validates the ICO container on every host OS. PNG
// frames are fully decoded; classic DIB frames receive bounded structural and
// uncompressed-payload checks, while the Windows loader remains authoritative
// for the final HICON decode.
func validateWindowsTrayIcon(iconPath string) error {
	data, err := readTrayIcon(iconPath)
	if err != nil {
		return err
	}
	if len(data) < 6 {
		return errors.New("ICO header is truncated")
	}
	if binary.LittleEndian.Uint16(data[0:2]) != 0 || binary.LittleEndian.Uint16(data[2:4]) != 1 {
		return errors.New("invalid ICO header: expected reserved=0 and type=1")
	}
	frameCount := int(binary.LittleEndian.Uint16(data[4:6]))
	if frameCount == 0 {
		return errors.New("ICO contains no image frames")
	}
	if frameCount > maxWindowsTrayIconFrameNum {
		return fmt.Errorf("ICO contains too many image frames: %d (maximum %d)", frameCount, maxWindowsTrayIconFrameNum)
	}
	directoryEnd := 6 + frameCount*16
	if directoryEnd > len(data) {
		return errors.New("ICO image directory is truncated")
	}
	type frameRange struct{ start, end int }
	ranges := make([]frameRange, 0, frameCount)
	for index := 0; index < frameCount; index++ {
		entry := data[6+index*16 : 6+(index+1)*16]
		width, height := icoDimension(entry[0]), icoDimension(entry[1])
		if width != height {
			return fmt.Errorf("ICO frame %d must be square, got %dx%d", index, width, height)
		}
		if width < minWindowsTrayIconPixels || width > maxWindowsTrayIconPixels {
			return fmt.Errorf("ICO frame %d dimensions must be between %dx%d and %dx%d, got %dx%d",
				index,
				minWindowsTrayIconPixels, minWindowsTrayIconPixels,
				maxWindowsTrayIconPixels, maxWindowsTrayIconPixels,
				width, height)
		}
		if entry[3] != 0 {
			return fmt.Errorf("ICO frame %d has a non-zero reserved byte", index)
		}
		size := uint64(binary.LittleEndian.Uint32(entry[8:12]))
		offset := uint64(binary.LittleEndian.Uint32(entry[12:16]))
		end := offset + size
		if size == 0 {
			return fmt.Errorf("ICO frame %d has an empty payload", index)
		}
		if offset < uint64(directoryEnd) || end < offset || end > uint64(len(data)) {
			return fmt.Errorf("ICO frame %d payload range is outside the file", index)
		}
		for previous, used := range ranges {
			if int(offset) < used.end && int(end) > used.start {
				return fmt.Errorf("ICO frame %d payload overlaps frame %d", index, previous)
			}
		}
		ranges = append(ranges, frameRange{start: int(offset), end: int(end)})
		payload := data[int(offset):int(end)]
		if bytes.HasPrefix(payload, pngSignature) {
			if err := validateICOPNGFrame(payload, width, height); err != nil {
				return fmt.Errorf("ICO frame %d (%dx%d): %w", index, width, height, err)
			}
			continue
		}
		if err := validateICODIBFrame(payload, width, height); err != nil {
			return fmt.Errorf("ICO frame %d (%dx%d): %w", index, width, height, err)
		}
	}
	return nil
}

func readTrayIcon(iconPath string) ([]byte, error) {
	file, err := os.Open(iconPath)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxTrayIconFileBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) == 0 {
		return nil, errors.New("icon file is empty")
	}
	if len(data) > maxTrayIconFileBytes {
		return nil, fmt.Errorf("icon file is too large: more than %d bytes", maxTrayIconFileBytes)
	}
	return data, nil
}

func icoDimension(value byte) int {
	if value == 0 {
		return 256
	}
	return int(value)
}

func validateICOPNGFrame(payload []byte, width, height int) error {
	config, err := png.DecodeConfig(bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("decode embedded PNG header: %w", err)
	}
	if config.Width != width || config.Height != height {
		return fmt.Errorf("embedded PNG dimensions are %dx%d", config.Width, config.Height)
	}
	if _, err := png.Decode(bytes.NewReader(payload)); err != nil {
		return fmt.Errorf("decode complete embedded PNG image data: %w", err)
	}
	return nil
}

func validateICODIBFrame(payload []byte, width, height int) error {
	if len(payload) < 12 {
		return errors.New("DIB header is truncated")
	}
	headerSize := int(binary.LittleEndian.Uint32(payload[0:4]))
	var dibWidth, dibHeight, bitsPerPixel, paletteBytes, externalMasks int
	var planes uint16
	switch {
	case headerSize == 12:
		dibWidth = int(binary.LittleEndian.Uint16(payload[4:6]))
		dibHeight = int(binary.LittleEndian.Uint16(payload[6:8]))
		planes = binary.LittleEndian.Uint16(payload[8:10])
		bitsPerPixel = int(binary.LittleEndian.Uint16(payload[10:12]))
		if bitsPerPixel > 0 && bitsPerPixel <= 8 {
			paletteBytes = (1 << bitsPerPixel) * 3
		}
	case headerSize >= 40:
		if headerSize > len(payload) {
			return errors.New("DIB header extends past its frame payload")
		}
		dibWidth = absInt32(binary.LittleEndian.Uint32(payload[4:8]))
		dibHeight = absInt32(binary.LittleEndian.Uint32(payload[8:12]))
		planes = binary.LittleEndian.Uint16(payload[12:14])
		bitsPerPixel = int(binary.LittleEndian.Uint16(payload[14:16]))
		if bitsPerPixel > 0 && bitsPerPixel <= 8 {
			colorsUsed := int(binary.LittleEndian.Uint32(payload[32:36]))
			if colorsUsed == 0 {
				colorsUsed = 1 << bitsPerPixel
			}
			paletteBytes = colorsUsed * 4
		}
	default:
		return fmt.Errorf("unsupported or invalid DIB header size %d", headerSize)
	}
	if planes != 1 {
		return fmt.Errorf("invalid DIB plane count %d", planes)
	}
	if dibWidth != width || (dibHeight != height && dibHeight != height*2) {
		return fmt.Errorf("DIB dimensions are %dx%d (ICO DIB height may include its mask)", dibWidth, dibHeight)
	}
	if bitsPerPixel == 0 || bitsPerPixel > 32 {
		return fmt.Errorf("invalid DIB bit depth %d", bitsPerPixel)
	}
	if headerSize >= 40 {
		compression := binary.LittleEndian.Uint32(payload[16:20])
		switch compression {
		case 0:
		case 3:
			if headerSize == 40 {
				externalMasks = 12
			}
		case 6:
			if headerSize == 40 {
				externalMasks = 16
			}
		default:
			return fmt.Errorf("unsupported DIB compression %d", compression)
		}
	}
	rowBytes := ((width*bitsPerPixel + 31) / 32) * 4
	minimum := headerSize + externalMasks + paletteBytes + rowBytes*height
	if minimum > len(payload) {
		return fmt.Errorf("DIB pixel data is truncated: need at least %d bytes, got %d", minimum, len(payload))
	}
	return nil
}

func absInt32(value uint32) int {
	signed := int64(int32(value))
	if signed < 0 {
		signed = -signed
	}
	return int(signed)
}
