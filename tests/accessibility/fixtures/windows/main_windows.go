//go:build windows

package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"syscall"
	"unsafe"
)

const (
	windowClass = "OpenDeskAccessibilityFixtureWindow"
	windowTitle = "OpenDesk Accessibility Fixture"

	idInvoke         = 101
	idDuplicateFirst = 102
	idDuplicateLast  = 103
	idDisabled       = 104
	idEditable       = 105
	idReadOnly       = 106
	idProtected      = 107
	idCheck          = 108
	idRadioOne       = 109
	idRadioTwo       = 110
	idStatus         = 111

	idMenuInvoke       = 201
	idMenuChecked      = 202
	idMenuRadioOne     = 203
	idMenuRadioTwo     = 204
	idMenuDeep         = 205
	idMenuDuplicateOne = 206
	idMenuDuplicateTwo = 207
	idMenuDelayed      = 208

	wmCreate        = 0x0001
	wmDestroy       = 0x0002
	wmClose         = 0x0010
	wmCommand       = 0x0111
	wmTimer         = 0x0113
	wmInitMenuPopup = 0x0117

	wsOverlappedWindow = 0x00CF0000
	wsVisible          = 0x10000000
	wsChild            = 0x40000000
	wsTabStop          = 0x00010000
	wsGroup            = 0x00020000
	wsBorder           = 0x00800000
	wsDisabled         = 0x08000000

	bsPushButton      = 0x00000000
	bsAutoCheckBox    = 0x00000003
	bsAutoRadioButton = 0x00000009
	esAutoHScroll     = 0x00000080
	esReadOnly        = 0x00000800
	esPassword        = 0x00000020
	ssLeft            = 0x00000000

	mfString    = 0x00000000
	mfPopup     = 0x00000010
	mfSeparator = 0x00000800
	mfChecked   = 0x00000008
	mfUnchecked = 0x00000000
	mfByCommand = 0x00000000

	bmGetCheck = 0x00F0
	bmSetCheck = 0x00F1
	bstChecked = 1

	enChange = 0x0300
	swShow   = 5
	idcArrow = 32512

	colorWindow      = 5
	timerDelayedMenu = 77
)

var (
	user32                  = syscall.NewLazyDLL("user32.dll")
	kernel32                = syscall.NewLazyDLL("kernel32.dll")
	procRegisterClassExW    = user32.NewProc("RegisterClassExW")
	procCreateWindowExW     = user32.NewProc("CreateWindowExW")
	procDefWindowProcW      = user32.NewProc("DefWindowProcW")
	procDestroyWindow       = user32.NewProc("DestroyWindow")
	procShowWindow          = user32.NewProc("ShowWindow")
	procUpdateWindow        = user32.NewProc("UpdateWindow")
	procGetMessageW         = user32.NewProc("GetMessageW")
	procTranslateMessage    = user32.NewProc("TranslateMessage")
	procDispatchMessageW    = user32.NewProc("DispatchMessageW")
	procPostQuitMessage     = user32.NewProc("PostQuitMessage")
	procLoadCursorW         = user32.NewProc("LoadCursorW")
	procCreateMenu          = user32.NewProc("CreateMenu")
	procCreatePopupMenu     = user32.NewProc("CreatePopupMenu")
	procAppendMenuW         = user32.NewProc("AppendMenuW")
	procSetMenu             = user32.NewProc("SetMenu")
	procCheckMenuItem       = user32.NewProc("CheckMenuItem")
	procSendMessageW        = user32.NewProc("SendMessageW")
	procGetWindowTextLength = user32.NewProc("GetWindowTextLengthW")
	procGetWindowText       = user32.NewProc("GetWindowTextW")
	procSetWindowText       = user32.NewProc("SetWindowTextW")
	procSetTimer            = user32.NewProc("SetTimer")
	procKillTimer           = user32.NewProc("KillTimer")
	procSetProcessDPIAware  = user32.NewProc("SetProcessDPIAware")
	procGetModuleHandleW    = kernel32.NewProc("GetModuleHandleW")
)

type point struct {
	x int32
	y int32
}

type msg struct {
	hwnd    uintptr
	message uint32
	wParam  uintptr
	lParam  uintptr
	time    uint32
	pt      point
	private uint32
}

type wndClassEx struct {
	size        uint32
	style       uint32
	wndProc     uintptr
	classExtra  int32
	windowExtra int32
	instance    uintptr
	icon        uintptr
	cursor      uintptr
	background  uintptr
	menuName    *uint16
	className   *uint16
	iconSmall   uintptr
}

type fixtureState struct {
	SchemaVersion       int    `json:"schemaVersion"`
	PID                 int    `json:"pid"`
	LastAction          string `json:"lastAction"`
	InvokeCount         int    `json:"invokeCount"`
	CheckboxActionCount int    `json:"checkboxActionCount"`
	CheckboxChecked     bool   `json:"checkboxChecked"`
	RadioActionCount    int    `json:"radioActionCount"`
	SelectedRadio       string `json:"selectedRadio"`
	EditableValue       string `json:"editableValue"`
	SetValueCount       int    `json:"setValueCount"`
	MenuInvokeCount     int    `json:"menuInvokeCount"`
	MenuCheckCount      int    `json:"menuCheckCount"`
	MenuChecked         bool   `json:"menuChecked"`
	MenuRadioCount      int    `json:"menuRadioCount"`
	SelectedMenuRadio   string `json:"selectedMenuRadio"`
	DelayedMaterialized bool   `json:"delayedItemMaterialized"`
}

type fixture struct {
	hwnd          uintptr
	editable      uintptr
	checkbox      uintptr
	radioOne      uintptr
	radioTwo      uintptr
	status        uintptr
	mainMenu      uintptr
	commandMenu   uintptr
	delayedMenu   uintptr
	statePath     string
	state         fixtureState
	controlsReady bool
}

var app fixture

func utf16(value string) *uint16 {
	ptr, err := syscall.UTF16PtrFromString(value)
	if err != nil {
		panic(err)
	}
	return ptr
}

func lowWord(value uintptr) uint16  { return uint16(value & 0xffff) }
func highWord(value uintptr) uint16 { return uint16((value >> 16) & 0xffff) }

func appendMenu(menu uintptr, flags uint32, value uintptr, label string) {
	result, _, err := procAppendMenuW.Call(menu, uintptr(flags), value, uintptr(unsafe.Pointer(utf16(label))))
	if result == 0 {
		panic(fmt.Sprintf("AppendMenuW %q failed: %v", label, err))
	}
}

func createControl(class, title string, style uint32, x, y, width, height, id int) uintptr {
	handle, _, err := procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(utf16(class))),
		uintptr(unsafe.Pointer(utf16(title))),
		uintptr(style),
		uintptr(x), uintptr(y), uintptr(width), uintptr(height),
		app.hwnd, uintptr(id), 0, 0,
	)
	if handle == 0 {
		panic(fmt.Sprintf("CreateWindowExW %s/%d failed: %v", class, id, err))
	}
	return handle
}

func createControls() {
	createControl("STATIC", "OpenDesk Native Accessibility Fixture", wsChild|wsVisible|ssLeft, 24, 20, 520, 28, 0)
	app.status = createControl("STATIC", "Ready", wsChild|wsVisible|ssLeft, 24, 54, 620, 24, idStatus)
	createControl("BUTTON", "Invoke Once", wsChild|wsVisible|wsTabStop|bsPushButton, 24, 92, 120, 32, idInvoke)
	createControl("BUTTON", "Duplicate", wsChild|wsVisible|wsTabStop|bsPushButton, 154, 92, 110, 32, idDuplicateFirst)
	createControl("BUTTON", "Duplicate", wsChild|wsVisible|wsTabStop|bsPushButton, 274, 92, 110, 32, idDuplicateLast)
	createControl("BUTTON", "Disabled", wsChild|wsVisible|wsTabStop|wsDisabled|bsPushButton, 394, 92, 110, 32, idDisabled)

	createControl("STATIC", "Editable value", wsChild|wsVisible|ssLeft, 24, 146, 120, 24, 0)
	app.editable = createControl("EDIT", "initial value", wsChild|wsVisible|wsTabStop|wsBorder|esAutoHScroll, 154, 142, 360, 28, idEditable)
	createControl("STATIC", "Read-only value", wsChild|wsVisible|ssLeft, 24, 184, 120, 24, 0)
	createControl("EDIT", "read only", wsChild|wsVisible|wsTabStop|wsBorder|esAutoHScroll|esReadOnly, 154, 180, 360, 28, idReadOnly)
	createControl("STATIC", "Protected value", wsChild|wsVisible|ssLeft, 24, 222, 120, 24, 0)
	createControl("EDIT", "fixture secret", wsChild|wsVisible|wsTabStop|wsBorder|esAutoHScroll|esPassword, 154, 218, 360, 28, idProtected)

	app.checkbox = createControl("BUTTON", "Fixture Checked", wsChild|wsVisible|wsTabStop|bsAutoCheckBox, 24, 272, 150, 28, idCheck)
	app.radioOne = createControl("BUTTON", "Choice One", wsChild|wsVisible|wsTabStop|wsGroup|bsAutoRadioButton, 194, 272, 110, 28, idRadioOne)
	app.radioTwo = createControl("BUTTON", "Choice Two", wsChild|wsVisible|wsTabStop|bsAutoRadioButton, 314, 272, 110, 28, idRadioTwo)
	procSendMessageW.Call(app.radioOne, bmSetCheck, bstChecked, 0)
	app.controlsReady = true
}

func createMenus() {
	mainMenu, _, _ := procCreateMenu.Call()
	fixtureMenu, _, _ := procCreatePopupMenu.Call()
	nestedMenu, _, _ := procCreatePopupMenu.Call()
	delayedMenu, _, _ := procCreatePopupMenu.Call()
	if mainMenu == 0 || fixtureMenu == 0 || nestedMenu == 0 || delayedMenu == 0 {
		panic("CreateMenu/CreatePopupMenu failed")
	}
	appendMenu(fixtureMenu, mfString, idMenuInvoke, "Invoke Command")
	appendMenu(fixtureMenu, mfString|mfUnchecked, idMenuChecked, "Checked Command")
	appendMenu(fixtureMenu, mfString|mfChecked, idMenuRadioOne, "Menu Choice One")
	appendMenu(fixtureMenu, mfString, idMenuRadioTwo, "Menu Choice Two")
	appendMenu(fixtureMenu, mfSeparator, 0, "")
	appendMenu(nestedMenu, mfString, idMenuDeep, "Deep Command")
	appendMenu(nestedMenu, mfString, idMenuDuplicateOne, "Duplicate Command")
	appendMenu(nestedMenu, mfString, idMenuDuplicateTwo, "Duplicate Command")
	appendMenu(nestedMenu, mfPopup, delayedMenu, "Delayed Submenu")
	appendMenu(fixtureMenu, mfPopup, nestedMenu, "Nested")
	appendMenu(mainMenu, mfPopup, fixtureMenu, "Fixture Commands")
	app.mainMenu = mainMenu
	app.commandMenu = fixtureMenu
	app.delayedMenu = delayedMenu
	result, _, err := procSetMenu.Call(app.hwnd, mainMenu)
	if result == 0 {
		panic(fmt.Sprintf("SetMenu failed: %v", err))
	}
}

func readWindowText(handle uintptr) string {
	length, _, _ := procGetWindowTextLength.Call(handle)
	buffer := make([]uint16, int(length)+1)
	if len(buffer) == 0 {
		return ""
	}
	procGetWindowText.Call(handle, uintptr(unsafe.Pointer(&buffer[0])), uintptr(len(buffer)))
	return syscall.UTF16ToString(buffer)
}

func isChecked(handle uintptr) bool {
	value, _, _ := procSendMessageW.Call(handle, bmGetCheck, 0, 0)
	return value == bstChecked
}

func setStatus(action string) {
	app.state.LastAction = action
	app.state.CheckboxChecked = isChecked(app.checkbox)
	app.state.EditableValue = readWindowText(app.editable)
	if isChecked(app.radioTwo) {
		app.state.SelectedRadio = "two"
	} else {
		app.state.SelectedRadio = "one"
	}
	label := fmt.Sprintf("%s | invoke=%d checkbox=%d menu=%d", action, app.state.InvokeCount, app.state.CheckboxActionCount, app.state.MenuInvokeCount)
	procSetWindowText.Call(app.status, uintptr(unsafe.Pointer(utf16(label))))
	writeState()
}

func writeState() {
	if app.statePath == "" {
		return
	}
	data, err := json.MarshalIndent(app.state, "", "  ")
	if err != nil {
		return
	}
	if err := os.MkdirAll(filepath.Dir(app.statePath), 0o755); err != nil {
		return
	}
	temporary := app.statePath + ".tmp"
	if err := os.WriteFile(temporary, data, 0o644); err != nil {
		return
	}
	_ = os.Remove(app.statePath)
	_ = os.Rename(temporary, app.statePath)
}

func handleCommand(wParam uintptr) {
	if !app.controlsReady {
		return
	}
	id := int(lowWord(wParam))
	code := highWord(wParam)
	switch id {
	case idInvoke:
		app.state.InvokeCount++
		setStatus("invoke-button")
	case idDuplicateFirst:
		setStatus("duplicate-first")
	case idDuplicateLast:
		setStatus("duplicate-second")
	case idCheck:
		app.state.CheckboxActionCount++
		setStatus("checkbox")
	case idRadioOne:
		app.state.RadioActionCount++
		setStatus("radio-one")
	case idRadioTwo:
		app.state.RadioActionCount++
		setStatus("radio-two")
	case idEditable:
		if code == enChange {
			app.state.SetValueCount++
			setStatus("text-changed")
		}
	case idMenuInvoke, idMenuDeep, idMenuDuplicateOne, idMenuDuplicateTwo, idMenuDelayed:
		app.state.MenuInvokeCount++
		setStatus("menu-invoke")
	case idMenuChecked:
		app.state.MenuCheckCount++
		app.state.MenuChecked = !app.state.MenuChecked
		flag := uintptr(mfByCommand | mfUnchecked)
		if app.state.MenuChecked {
			flag = mfByCommand | mfChecked
		}
		procCheckMenuItem.Call(app.commandMenu, idMenuChecked, flag)
		setStatus("menu-checked")
	case idMenuRadioOne, idMenuRadioTwo:
		app.state.MenuRadioCount++
		selected := idMenuRadioOne
		other := idMenuRadioTwo
		app.state.SelectedMenuRadio = "one"
		if id == idMenuRadioTwo {
			selected, other = other, selected
			app.state.SelectedMenuRadio = "two"
		}
		procCheckMenuItem.Call(app.commandMenu, uintptr(selected), mfByCommand|mfChecked)
		procCheckMenuItem.Call(app.commandMenu, uintptr(other), mfByCommand|mfUnchecked)
		setStatus("menu-radio")
	}
}

func windowProc(hwnd uintptr, message uint32, wParam, lParam uintptr) uintptr {
	switch message {
	case wmCreate:
		app.hwnd = hwnd
		createControls()
		createMenus()
		setStatus("launched")
		return 0
	case wmCommand:
		handleCommand(wParam)
		return 0
	case wmInitMenuPopup:
		if wParam == app.delayedMenu && !app.state.DelayedMaterialized {
			procSetTimer.Call(hwnd, timerDelayedMenu, 200, 0)
		}
		return 0
	case wmTimer:
		if wParam == timerDelayedMenu && !app.state.DelayedMaterialized {
			procKillTimer.Call(hwnd, timerDelayedMenu)
			appendMenu(app.delayedMenu, mfString, idMenuDelayed, "Delayed Command")
			app.state.DelayedMaterialized = true
			setStatus("delayed-menu-materialized")
		}
		return 0
	case wmClose:
		procDestroyWindow.Call(hwnd)
		return 0
	case wmDestroy:
		app.state.LastAction = "terminated"
		writeState()
		procPostQuitMessage.Call(0)
		return 0
	}
	result, _, _ := procDefWindowProcW.Call(hwnd, uintptr(message), wParam, lParam)
	return result
}

func stateArgument() string {
	for index := 1; index+1 < len(os.Args); index++ {
		if os.Args[index] == "--state" {
			return os.Args[index+1]
		}
	}
	return filepath.Join(".runtime", "tests", "accessibility", "windows-fixture-state.json")
}

func main() {
	app.statePath = stateArgument()
	app.state = fixtureState{
		SchemaVersion:     1,
		PID:               os.Getpid(),
		LastAction:        "starting",
		SelectedRadio:     "one",
		SelectedMenuRadio: "one",
	}
	_, _, _ = procSetProcessDPIAware.Call()
	instance, _, _ := procGetModuleHandleW.Call(0)
	cursor, _, _ := procLoadCursorW.Call(0, idcArrow)
	className := utf16(windowClass)
	class := wndClassEx{
		size:       uint32(unsafe.Sizeof(wndClassEx{})),
		wndProc:    syscall.NewCallback(windowProc),
		instance:   instance,
		cursor:     cursor,
		background: colorWindow + 1,
		className:  className,
	}
	atom, _, err := procRegisterClassExW.Call(uintptr(unsafe.Pointer(&class)))
	if atom == 0 {
		panic(fmt.Sprintf("RegisterClassExW failed: %v", err))
	}
	hwnd, _, err := procCreateWindowExW.Call(
		0,
		uintptr(unsafe.Pointer(className)),
		uintptr(unsafe.Pointer(utf16(windowTitle))),
		wsOverlappedWindow|wsVisible,
		120, 120, 700, 420,
		0, 0, instance, 0,
	)
	if hwnd == 0 {
		panic(fmt.Sprintf("CreateWindowExW failed: %v", err))
	}
	app.hwnd = hwnd
	procShowWindow.Call(hwnd, swShow)
	procUpdateWindow.Call(hwnd)
	var message msg
	for {
		result, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&message)), 0, 0, 0)
		if int32(result) <= 0 {
			break
		}
		procTranslateMessage.Call(uintptr(unsafe.Pointer(&message)))
		procDispatchMessageW.Call(uintptr(unsafe.Pointer(&message)))
	}
	if code := int(message.wParam); code != 0 {
		os.Exit(code)
	}
}
