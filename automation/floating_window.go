package automation

import (
	"fmt"
	"sync"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"
)

// FloatingWindow represents the floating window manager
type FloatingWindow struct {
	window    fyne.Window
	app       fyne.App
	buttons   map[string]*widget.Button
	isVisible bool
	position  Position
	mutex     sync.Mutex
	callbacks map[string]func()
}

// Position represents window position
type Position struct {
	X, Y float32
}

// getIconResource converts string icon name to fyne.Resource
func (fw *FloatingWindow) getIconResource(iconName string) fyne.Resource {
	// Map of icon names to theme resources
	iconMap := map[string]fyne.Resource{
		"play":     theme.MediaPlayIcon(),
		"pause":    theme.MediaPauseIcon(),
		"stop":     theme.MediaStopIcon(),
		"settings": theme.SettingsIcon(),
		"info":     theme.InfoIcon(),
		"warning":  theme.WarningIcon(),
		"error":    theme.ErrorIcon(),
		"check":    theme.ConfirmIcon(),
		"cancel":   theme.CancelIcon(),
		"home":     theme.HomeIcon(),
		"menu":     theme.MenuIcon(),
		"add":      theme.ContentAddIcon(),
		"remove":   theme.ContentRemoveIcon(),
		"search":   theme.SearchIcon(),
		"download": theme.DownloadIcon(),
		"upload":   theme.UploadIcon(),
		"computer": theme.ComputerIcon(),
		"custom":   theme.QuestionIcon(), // Default for custom buttons
	}

	if icon, exists := iconMap[iconName]; exists {
		return icon
	}
	return theme.QuestionIcon() // Default icon if not found
}

// NewFloatingWindow creates a new floating window instance
func NewFloatingWindow() *FloatingWindow {
	fw := &FloatingWindow{
		buttons:   make(map[string]*widget.Button),
		callbacks: make(map[string]func()),
		position:  Position{X: 100, Y: 100},
	}

	fw.app = app.New()
	fw.window = fw.app.NewWindow("Control Panel")
	fw.setupDefaultButtons()

	return fw
}

func (fw *FloatingWindow) setupDefaultButtons() {
	buttonConfigs := []struct {
		id       string
		label    string
		iconName string
	}{
		{"start", "Start", "play"},
		{"pause", "Pause", "pause"},
		{"stop", "Stop", "stop"},
		{"settings", "Settings", "settings"},
	}

	canvasObjects := make([]fyne.CanvasObject, 0)
	for _, config := range buttonConfigs {
		icon := fw.getIconResource(config.iconName)
		btn := widget.NewButtonWithIcon(config.label, icon, nil)
		fw.buttons[config.id] = btn
		canvasObjects = append(canvasObjects, btn)
	}

	buttonContainer := container.NewHBox(canvasObjects...)
	content := container.NewPadded(buttonContainer)

	fw.window.SetContent(content)
	fw.window.Resize(fyne.NewSize(300, 60))
}

// AddButton adds a new custom button with string-based icon name
func (fw *FloatingWindow) AddButton(id string, label string, iconName string) error {
	if _, exists := fw.buttons[id]; exists {
		return fmt.Errorf("button with ID %s already exists", id)
	}

	icon := fw.getIconResource(iconName)
	btn := widget.NewButtonWithIcon(label, icon, nil)
	fw.buttons[id] = btn

	canvasObjects := make([]fyne.CanvasObject, 0)
	for _, button := range fw.buttons {
		canvasObjects = append(canvasObjects, button)
	}

	buttonContainer := container.NewHBox(canvasObjects...)
	content := container.NewPadded(buttonContainer)
	fw.window.SetContent(content)

	return nil
}

// Show displays the floating window
func (fw *FloatingWindow) Show() {
	fw.mutex.Lock()
	defer fw.mutex.Unlock()

	if !fw.isVisible {
		fw.window.Show()
		fw.isVisible = true
	}
}

// Hide hides the floating window
func (fw *FloatingWindow) Hide() {
	fw.mutex.Lock()
	defer fw.mutex.Unlock()

	if fw.isVisible {
		fw.window.Hide()
		fw.isVisible = false
	}
}

// SetPosition sets the window position
func (fw *FloatingWindow) SetPosition(x, y float32) {
	fw.mutex.Lock()
	defer fw.mutex.Unlock()

	fw.position = Position{X: x, Y: y}
	fw.window.Resize(fw.window.Content().Size())
	fw.window.Content().Move(fyne.NewPos(x, y))
}

// OnButtonClick sets a callback for a specific button
func (fw *FloatingWindow) OnButtonClick(buttonID string, callback func()) error {
	if btn, exists := fw.buttons[buttonID]; exists {
		fw.callbacks[buttonID] = callback
		btn.OnTapped = callback
		return nil
	}
	return fmt.Errorf("button with ID %s not found", buttonID)
}

// RemoveButton removes a button from the window
func (fw *FloatingWindow) RemoveButton(id string) error {
	if _, exists := fw.buttons[id]; !exists {
		return fmt.Errorf("button with ID %s not found", id)
	}

	delete(fw.buttons, id)
	delete(fw.callbacks, id)

	canvasObjects := make([]fyne.CanvasObject, 0)
	for _, button := range fw.buttons {
		canvasObjects = append(canvasObjects, button)
	}

	buttonContainer := container.NewHBox(canvasObjects...)
	content := container.NewPadded(buttonContainer)
	fw.window.SetContent(content)

	return nil
}

// SetAlwaysOnTop sets whether the window should always be on top
func (fw *FloatingWindow) SetAlwaysOnTop(alwaysOnTop bool) {
	if topWindow, ok := fw.window.(interface{ SetOnTop(bool) }); ok {
		topWindow.SetOnTop(alwaysOnTop)
	}
}

// Run starts the floating window application
func (fw *FloatingWindow) Run() {
	fw.app.Run()
}
