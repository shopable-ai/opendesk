package automation

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image/png"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"

	"github.com/go-vgo/robotgo"
)

type Page struct {
	Mouse       *Mouse // 公开字段
	Keyboard    *Keyboard
	Touchscreen *Touchscreen
	Pid         int32
	Executable  string
}

func NewPage() *Page {
	return &Page{
		Mouse:       NewMouse(), // 初始化时创建
		Keyboard:    NewKeyboard(),
		Touchscreen: NewTouchscreen(),
		Pid:         int32(os.Getpid()),
	}
}

// // Mouse returns the Mouse instance
// func (p *Page) GetMouse() *Mouse {
// 	return p.Mouse
// }

// // Keyboard returns the Keyboard instance
// func (p *Page) Keyboard() *Keyboard {
// 	return p.Keyboard
// }

// // Touchscreen returns the Touchscreen instance
// func (p *Page) Touchscreen() *Touchscreen {
// 	return p.Touchscreen
// }

// checkDirPermissions verifies that we have write permissions to the directory
func checkDirPermissions(dir string) error {
	// Try to create a temporary file in the directory
	tempFile := filepath.Join(dir, ".permission_check")
	f, err := os.Create(tempFile)
	if err != nil {
		return fmt.Errorf("no write permission: %v", err)
	}

	// Clean up
	f.Close()
	os.Remove(tempFile)

	return nil
}

func (p *Page) Screenshot(options interface{}) (string, error) {
	// log.Printf("Starting screenshot with raw options: %+v", options)

	// Initialize default options
	opts := ScreenshotOptions{
		Type:     "png",
		Quality:  100,
		Encoding: "binary",
	}

	// Parse options if provided
	if options != nil {
		if optMap, ok := options.(map[string]interface{}); ok {
			// log.Printf("Parsing options map: %+v", optMap)

			// Try to parse path
			if path, hasPath := optMap["path"]; hasPath {
				if pathStr, ok := path.(string); ok {
					opts.Path = pathStr
					// log.Printf("Found path: %s", opts.Path)
				}
			}

			// Try to parse clip
			if clipData, hasClip := optMap["clip"]; hasClip {
				// log.Printf("Found clip data of type %T: %+v", clipData, clipData)

				if clipMap, ok := clipData.(map[string]interface{}); ok {
					clip := &ClipOptions{}

					// Debug each coordinate value and its type
					// for k, v := range clipMap {
					// 	log.Printf("Clip coordinate %s is of type %T with value %v", k, v, v)
					// }

					// Parse clip coordinates with type conversion
					if x, ok := clipMap["x"]; ok {
						switch v := x.(type) {
						case float64:
							clip.X = int(v)
							// log.Printf("Parsed X from float64: %v -> %d", v, clip.X)
						case int:
							clip.X = v
							// log.Printf("Parsed X from int: %d", v)
						case int64:
							clip.X = int(v)
							// log.Printf("Parsed X from int64: %d -> %d", v, clip.X)
						case json.Number:
							if xVal, err := v.Int64(); err == nil {
								clip.X = int(xVal)
								// log.Printf("Parsed X from json.Number: %v -> %d", v, clip.X)
							}
						default:
							log.Printf("Unexpected type for X: %T", x)
						}
					}

					if y, ok := clipMap["y"]; ok {
						switch v := y.(type) {
						case float64:
							clip.Y = int(v)
							// log.Printf("Parsed Y from float64: %v -> %d", v, clip.Y)
						case int:
							clip.Y = v
							// log.Printf("Parsed Y from int: %d", v)
						case int64:
							clip.Y = int(v)
							// log.Printf("Parsed Y from int64: %d -> %d", v, clip.Y)
						case json.Number:
							if yVal, err := v.Int64(); err == nil {
								clip.Y = int(yVal)
								// log.Printf("Parsed Y from json.Number: %v -> %d", v, clip.Y)
							}
						default:
							log.Printf("Unexpected type for Y: %T", y)
						}
					}

					if width, ok := clipMap["width"]; ok {
						switch v := width.(type) {
						case float64:
							clip.Width = int(v)
							// log.Printf("Parsed Width from float64: %v -> %d", v, clip.Width)
						case int:
							clip.Width = v
							// log.Printf("Parsed Width from int: %d", v)
						case int64:
							clip.Width = int(v)
							// log.Printf("Parsed Width from int64: %d -> %d", v, clip.Width)
						case json.Number:
							if wVal, err := v.Int64(); err == nil {
								clip.Width = int(wVal)
								// log.Printf("Parsed Width from json.Number: %v -> %d", v, clip.Width)
							}
						default:
							log.Printf("Unexpected type for Width: %T", width)
						}
					}

					if height, ok := clipMap["height"]; ok {
						switch v := height.(type) {
						case float64:
							clip.Height = int(v)
							// log.Printf("Parsed Height from float64: %v -> %d", v, clip.Height)
						case int:
							clip.Height = v
							// log.Printf("Parsed Height from int: %d", v)
						case int64:
							clip.Height = int(v)
							// log.Printf("Parsed Height from int64: %d -> %d", v, clip.Height)
						case json.Number:
							if hVal, err := v.Int64(); err == nil {
								clip.Height = int(hVal)
								// log.Printf("Parsed Height from json.Number: %v -> %d", v, clip.Height)
							}
						default:
							log.Printf("Unexpected type for Height: %T", height)
						}
					}

					// Log final parsed values
					// log.Printf("Final clip values - X:%d, Y:%d, Width:%d, Height:%d",
					// 	clip.X, clip.Y, clip.Width, clip.Height)

					// Only set the clip if we got valid values
					if clip.Width > 0 && clip.Height > 0 {
						opts.Clip = clip
					} else {
						log.Printf("Warning: Invalid clip dimensions detected")
					}
				} else {
					log.Printf("Warning: clip data is not a map: %T", clipData)
				}
			}
		}
	}

	// log.Printf("Final parsed options: %+v", opts)

	var x, y, width, height int

	// Set screenshot area and log dimensions
	if opts.FullPage {
		width, height = robotgo.GetScreenSize()
		// log.Printf("Taking full page screenshot: width=%d, height=%d", width, height)
	} else if opts.Clip != nil {
		x = opts.Clip.X
		y = opts.Clip.Y
		width = opts.Clip.Width
		height = opts.Clip.Height
		// log.Printf("Taking clipped screenshot: x=%d, y=%d, width=%d, height=%d", x, y, width, height)
	} else {
		width, height = robotgo.GetScreenSize()
		// log.Printf("Taking default screenshot: width=%d, height=%d", width, height)
	}

	// Validate dimensions before capture
	if width <= 0 || height <= 0 {
		return "", fmt.Errorf("invalid dimensions: width=%d, height=%d", width, height)
	}

	// Capture screen
	// log.Printf("Attempting to capture screen with dimensions: x=%d, y=%d, width=%d, height=%d", x, y, width, height)
	bit := robotgo.CaptureScreen(x, y, width, height)
	if bit == nil {
		return "", fmt.Errorf("failed to capture screen")
	}
	defer robotgo.FreeBitmap(bit)

	var base64Str string
	img := robotgo.ToImage(bit)

	// Handle file saving if path is specified
	if opts.Path != "" {
		absPath, err := filepath.Abs(opts.Path)
		if err != nil {
			return "", fmt.Errorf("failed to get absolute path: %v", err)
		}

		dir := filepath.Dir(absPath)
		if err := os.MkdirAll(dir, 0755); err != nil {
			return "", fmt.Errorf("failed to create directory: %v", err)
		}

		log.Printf("Saving screenshot to: %s", absPath)
		outputFile, err := os.Create(absPath)
		if err != nil {
			return "", fmt.Errorf("failed to create output file: %v", err)
		}
		defer outputFile.Close()

		if err := png.Encode(outputFile, img); err != nil {
			return "", fmt.Errorf("failed to encode and save image: %v", err)
		}
		// log.Printf("Screenshot saved successfully to: %s", absPath)
	}

	// Always convert to base64
	// log.Printf("Converting screenshot to base64")
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return "", fmt.Errorf("failed to encode image to base64: %v", err)
	}
	base64Str = base64.StdEncoding.EncodeToString(buf.Bytes())
	// log.Printf("Base64 conversion successful")
	return fmt.Sprintf("data:image/png;base64,%s", base64Str), nil
}

func (p *Page) Goto(url string) error {
	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}

	return cmd.Run()
}

func (p *Page) Title() string {
	title := robotgo.GetTitle()
	return title
}

// Page 结构体中添加 WaitFor 方法
func (p *Page) WaitFor(milliseconds int64) error {
	// 打印信息
	fmt.Printf("Waiting for %d milliseconds...\n", milliseconds)

	if milliseconds < 0 {
		return fmt.Errorf("WaitFor: milliseconds cannot be negative")
	}

	// 可以设置一个最大等待时间，防止过长等待
	const maxWait = 30000 // 最大等待 30 秒
	if milliseconds > maxWait {
		return fmt.Errorf("WaitFor: wait time cannot exceed %d milliseconds", maxWait)
	}

	time.Sleep(time.Duration(milliseconds) * time.Millisecond)
	return nil
}

func (p *Page) Url() string {
	// Since we store the executable path in Page struct
	return p.Executable
}

// mergeWithDefaultOptions merges provided options with default values
func mergeWithDefaultOptions(options *ScreenshotOptions) *ScreenshotOptions {
	if options == nil {
		return &ScreenshotOptions{
			Type:           DefaultScreenshotOptions.Type,
			Quality:        DefaultScreenshotOptions.Quality,
			FullPage:       DefaultScreenshotOptions.FullPage,
			OmitBackground: DefaultScreenshotOptions.OmitBackground,
			Encoding:       DefaultScreenshotOptions.Encoding,
		}
	}

	merged := &ScreenshotOptions{
		Type:           options.Type,
		Quality:        options.Quality,
		FullPage:       options.FullPage,
		OmitBackground: options.OmitBackground,
		Encoding:       options.Encoding,
		Path:           options.Path,
		Clip:           options.Clip,
	}

	// Apply defaults only if fields are empty
	if merged.Type == "" {
		merged.Type = DefaultScreenshotOptions.Type
	}
	if merged.Quality == 0 {
		merged.Quality = DefaultScreenshotOptions.Quality
	}
	// Boolean defaults are handled implicitly since false is the zero value

	if merged.Encoding == "" {
		merged.Encoding = DefaultScreenshotOptions.Encoding
	}

	return merged
}
