package automation

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image/png"
	"os"
	"os/exec"
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

func (p *Page) Screenshot(options *ScreenshotOptions) (string, error) {
	options = mergeWithDefaultOptions(options)

	var x, y, width, height int

	// Set screenshot area
	if options.FullPage {
		width, height = robotgo.GetScreenSize()
	} else if options.Clip != nil {
		x = options.Clip.X
		y = options.Clip.Y
		width = options.Clip.Width
		height = options.Clip.Height
	} else {
		width, height = robotgo.GetScreenSize()
	}

	// 使用robotgo的正确API进行截图
	bit := robotgo.CaptureScreen(x, y, width, height)
	defer robotgo.FreeBitmap(bit)

	// 如果指定了路径，保存文件
	if options.Path != "" {
		err := robotgo.SaveCapture(options.Path, x, y, width, height)
		if err != nil {
			return "", fmt.Errorf("failed to save image: %v", err)
		}
	}

	// 如果需要返回base64或没有指定路径
	if options.Path == "" || options.Encoding == "base64" {
		// 转换为标准image
		img := robotgo.ToImage(bit)

		// 转换为base64
		var buf bytes.Buffer
		if err := png.Encode(&buf, img); err != nil {
			return "", fmt.Errorf("failed to encode image: %v", err)
		}

		base64Str := base64.StdEncoding.EncodeToString(buf.Bytes())
		return fmt.Sprintf("data:image/png;base64,%s", base64Str), nil
	}

	return "", nil
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
