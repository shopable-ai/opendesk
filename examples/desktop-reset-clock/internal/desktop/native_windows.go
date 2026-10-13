//go:build windows

package desktop

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"net/url"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"unsafe"
)

const (
	wmDestroy        = 0x0002
	wmMove           = 0x0003
	wmClose          = 0x0010
	wmPaint          = 0x000F
	wmCommand        = 0x0111
	wmMouseActivate  = 0x0021
	wmNCHitTest      = 0x0084
	wmLButtonDown    = 0x0201
	wmMouseMove      = 0x0200
	wmMouseLeave     = 0x02A3
	wmRButtonUp      = 0x0205
	wmSetFont        = 0x0030
	wmApp            = 0x8000
	wmTray           = wmApp + 41
	wmUpdate         = wmApp + 42
	wsPopup          = 0x80000000
	wsVisible        = 0x10000000
	wsOverlapped     = 0x00CF0000
	wsChild          = 0x40000000
	exNoActivate     = 0x08000000
	exToolWindow     = 0x00000080
	exTransparent    = 0x00000020
	exLayered        = 0x00080000
	nifMessage       = 1
	nifIcon          = 2
	nifTip           = 4
	nifInfo          = 0x10
	nimAdd           = 0
	nimModify        = 1
	nimDelete        = 2
	swHide           = 0
	swShow           = 5
	swShowNoActivate = 4
	cardWidth        = 386
	cardHeight       = 264
	cardExpandedHeight = 334
	settingsWidth    = 554
	settingsHeight   = 590
)

var (
	user32          = syscall.NewLazyDLL("user32.dll")
	msimg32         = syscall.NewLazyDLL("msimg32.dll")
	gradientFill    = msimg32.NewProc("GradientFill")
	gdi32           = syscall.NewLazyDLL("gdi32.dll")
	shell32         = syscall.NewLazyDLL("shell32.dll")
	kernel32        = syscall.NewLazyDLL("kernel32.dll")
	regClass        = user32.NewProc("RegisterClassExW")
	createWin       = user32.NewProc("CreateWindowExW")
	defProc         = user32.NewProc("DefWindowProcW")
	getMsg          = user32.NewProc("GetMessageW")
	translate       = user32.NewProc("TranslateMessage")
	dispatch        = user32.NewProc("DispatchMessageW")
	postMsg         = user32.NewProc("PostMessageW")
	showWin         = user32.NewProc("ShowWindow")
	destroyWin      = user32.NewProc("DestroyWindow")
	postQuit        = user32.NewProc("PostQuitMessage")
	setWindowPos    = user32.NewProc("SetWindowPos")
	invalidate      = user32.NewProc("InvalidateRect")
	setText         = user32.NewProc("SetWindowTextW")
	getText         = user32.NewProc("GetWindowTextW")
	getWindowRect   = user32.NewProc("GetWindowRect")
	sendMsg         = user32.NewProc("SendMessageW")
	releaseCapture  = user32.NewProc("ReleaseCapture")
	messageBox      = user32.NewProc("MessageBoxW")
	loadIcon        = user32.NewProc("LoadIconW")
	beginPaint      = user32.NewProc("BeginPaint")
	endPaint        = user32.NewProc("EndPaint")
	fillRect        = user32.NewProc("FillRect")
	drawText        = user32.NewProc("DrawTextW")
	setBk           = gdi32.NewProc("SetBkMode")
	setColor        = gdi32.NewProc("SetTextColor")
	createFont      = gdi32.NewProc("CreateFontW")
	selectObject    = gdi32.NewProc("SelectObject")
	deleteObject    = gdi32.NewProc("DeleteObject")
	createBrush     = gdi32.NewProc("CreateSolidBrush")
	moveWindow      = user32.NewProc("MoveWindow")
	enableWindow    = user32.NewProc("EnableWindow")
	shellIcon       = shell32.NewProc("Shell_NotifyIconW")
	popup           = user32.NewProc("CreatePopupMenu")
	appendMenu      = user32.NewProc("AppendMenuW")
	trackPopup      = user32.NewProc("TrackPopupMenu")
	destroyMenu     = user32.NewProc("DestroyMenu")
	getCursor       = user32.NewProc("GetCursorPos")
	setForeground   = user32.NewProc("SetForegroundWindow")
	trackMouseEvent = user32.NewProc("TrackMouseEvent")
	getSystemMetrics = user32.NewProc("GetSystemMetrics")
	registerMessage = user32.NewProc("RegisterWindowMessageW")
	createMutex     = kernel32.NewProc("CreateMutexW")
	closeHandle     = kernel32.NewProc("CloseHandle")
	getLastError    = kernel32.NewProc("GetLastError")
	findWindow      = user32.NewProc("FindWindowW")
	findWindowEx    = user32.NewProc("FindWindowExW")
	enumWindows     = user32.NewProc("EnumWindows")
	setParent       = user32.NewProc("SetParent")
	getLong         = user32.NewProc("GetWindowLongPtrW")
	setLong         = user32.NewProc("SetWindowLongPtrW")
	sendTimeout     = user32.NewProc("SendMessageTimeoutW")
)

type trackMouse struct{ Size, Flags uint32; Hwnd uintptr; HoverTime uint32 }
type point struct{ X, Y int32 }
type rect struct{ Left, Top, Right, Bottom int32 }
type gradientVertex struct{ X, Y int32; Red, Green, Blue, Alpha uint16 }
type gradientMesh struct{ UpperLeft, LowerRight uint32 }
type wndClass struct {
	Size, Style                        uint32
	Proc                               uintptr
	ClassExtra, WindowExtra            int32
	Instance, Icon, Cursor, Background uintptr
	MenuName, ClassName                *uint16
	IconSmall                          uintptr
}
type msg struct {
	Hwnd           uintptr
	Message        uint32
	_              uint32
	WParam, LParam uintptr
	Time           uint32
	Pt             point
	Private        uint32
}
type paint struct {
	DC                uintptr
	Erase             uint32
	Area              rect
	Restored, Updated uint32
	Reserved          [32]byte
}
type notifyData struct {
	Size                uint32
	Window              uintptr
	ID, Flags, Callback uint32
	Icon                uintptr
	Tip                 [128]uint16
	State, StateMask    uint32
	Info                [256]uint16
	Version             uint32
	Title               [64]uint16
	InfoFlags           uint32
	Guid                [16]byte
	BalloonIcon         uintptr
}

type windowsUI struct {
	mu                                                                sync.Mutex
	display                                                           Display
	handler                                                           func(Action)
	card, settings, feedEdit, diagnostics                             uintptr
	details, detailsHistory, detailsNews, detailsResources, detailsMember uintptr
 detailsTabs [3]uintptr
 detailsPages [3][]uintptr
 detailsPeriodButtons [2]uintptr
 detailsPeriodIndex, detailsTabIndex int
 detailsStats, detailsOverviewNews, detailsOverviewStatus uintptr
	detailsHistoryLink, detailsFont, detailsHistoryPicker uintptr
	lastEvidence []SourceEvidence
	detailsNewsPicker, detailsNewsLink uintptr
	lastNewsOptions []SourceEvidence
	detailsResourceLinks [2]uintptr
	detailsMockPay, detailsMockRefund uintptr
	lastHistory, lastNews, lastResources, lastMember string
	lastStats, lastDetailHealth string
	sourceButton, lastRequest, lastChecked, lastChanged, sourceStatus uintptr
	advanceCheck, quietCheck, showCheck, lockCheck, clockCheck        uintptr
	advancedButton, uiFont                                            uintptr
	advancedShown                                                     bool
	tray                                                              notifyData
	taskbar                                                           uint32
	instance                                                          uintptr
	desktopAttached                                                   bool
	hovered, placing                                                 bool
}

var current *windowsUI

func newNative() UI                                     { return &windowsUI{} }
func ptr(s string) *uint16                              { p, _ := syscall.UTF16PtrFromString(s); return p }
func utf(s string) uintptr                              { return uintptr(unsafe.Pointer(ptr(s))) }
func call(p *syscall.LazyProc, args ...uintptr) uintptr { r, _, _ := p.Call(args...); return r }
func (w *windowsUI) emit(name, value string) {
	if w.handler != nil {
		go w.handler(Action{Name: name, Value: value})
	}
}
func (w *windowsUI) Run(ctx context.Context, handler func(Action)) error {
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()
	name := ptr("Local\\OpenDeskResetClock.R1")
	m := call(createMutex, 0, 0, uintptr(unsafe.Pointer(name)))
	if m == 0 {
		return errors.New("CreateMutexW failed")
	}
	defer call(closeHandle, m)
	if call(getLastError) == 183 {
		return errors.New("Reset Clock is already running")
	}
	w.instance = m
	w.handler = handler
	current = w
	defer func() { current = nil }()
	class := ptr("OpenDesk.ResetClock.Native.R1")
	wc := wndClass{Size: uint32(unsafe.Sizeof(wndClass{})), Proc: syscall.NewCallback(windowProc), Instance: call(kernel32.NewProc("GetModuleHandleW"), 0), ClassName: class, Icon: call(loadIcon, 0, 32512)}
	if call(regClass, uintptr(unsafe.Pointer(&wc))) == 0 {
		return errors.New("RegisterClassExW failed")
	}
	w.card = call(createWin, exNoActivate|exToolWindow|exLayered, uintptr(unsafe.Pointer(class)), utf("OpenDesk Reset Clock"), wsPopup, 70, 70, cardWidth, cardHeight, 0, 0, wc.Instance, 0)
	if w.card == 0 {
		return errors.New("CreateWindowExW card failed")
	}
	call(user32.NewProc("SetLayeredWindowAttributes"), w.card, 0, 245, 2)
	w.taskbar = uint32(call(registerMessage, utf("TaskbarCreated")))
	w.attachDesktop()
	w.tray = notifyData{Size: uint32(unsafe.Sizeof(notifyData{})), Window: w.card, ID: 1, Flags: nifMessage | nifIcon | nifTip, Callback: wmTray, Icon: call(loadIcon, 0, 32512)}
	copy(w.tray.Tip[:], syscall.StringToUTF16("OpenDesk Reset Clock"))
	if call(shellIcon, nimAdd, uintptr(unsafe.Pointer(&w.tray))) == 0 {
		call(destroyWin, w.card)
		return errors.New("Shell_NotifyIconW failed")
	}
	defer call(shellIcon, nimDelete, uintptr(unsafe.Pointer(&w.tray)))
	defer func() {
		if w.uiFont != 0 {
			call(deleteObject, w.uiFont)
		}
	}()
	go func() { <-ctx.Done(); call(postMsg, w.card, wmClose, 0, 0) }()
	var mmsg msg
	for {
		v := int32(call(getMsg, uintptr(unsafe.Pointer(&mmsg)), 0, 0, 0))
		if v <= 0 {
			break
		}
		call(translate, uintptr(unsafe.Pointer(&mmsg)))
		call(dispatch, uintptr(unsafe.Pointer(&mmsg)))
	}
	return nil
}
func (w *windowsUI) attachDesktop() {
	// WorkerW is Explorer-owned and undocumented. Failure falls back to a
	// non-topmost bottom-level window; live Explorer restart must be verified.
	prog := call(findWindow, utf("Progman"), 0)
	if prog != 0 {
		var result uintptr
		call(sendTimeout, prog, 0x052C, 0, 0, 0, 1000, uintptr(unsafe.Pointer(&result)))
	}
	var worker uintptr
	callback := syscall.NewCallback(func(h, lp uintptr) uintptr {
		def := call(findWindowEx, h, 0, utf("SHELLDLL_DefView"), 0)
		if def != 0 {
			worker = call(findWindowEx, 0, h, utf("WorkerW"), 0)
			return 0
		}
		return 1
	})
	call(enumWindows, callback, 0)
	if worker != 0 {
		call(setParent, w.card, worker)
		if call(user32.NewProc("GetParent"), w.card) == worker {
			style := call(getLong, w.card, -16&0xffffffff)
			call(setLong, w.card, -16&0xffffffff, (style&^wsPopup)|wsChild)
			w.desktopAttached = true
		}
	}
	if !w.desktopAttached {
		w.desktopAttached = false
		call(setWindowPos, w.card, 1, 0, 0, 0, 0, 0x0013)
	}
}
func (w *windowsUI) Update(d Display) {
	w.mu.Lock()
	w.display = d
	w.mu.Unlock()
	if w.card != 0 {
		call(postMsg, w.card, wmUpdate, 0, 0)
	}
}
func (w *windowsUI) Notify(s string) {
	if w.card == 0 {
		return
	}
	w.mu.Lock()
	icon := w.tray
	w.mu.Unlock()
	icon.Flags = nifInfo
	copy(icon.Info[:], syscall.StringToUTF16(s))
	copy(icon.Title[:], syscall.StringToUTF16("OpenDesk Reset Clock"))
	icon.InfoFlags = 1
	call(shellIcon, nimModify, uintptr(unsafe.Pointer(&icon)))
}
func windowProc(hwnd uintptr, id uint32, wparam, lparam uintptr) uintptr {
	w := current
	if w == nil {
		return call(defProc, hwnd, uintptr(id), wparam, lparam)
	}
	if id == w.taskbar && w.card == hwnd {
		w.attachDesktop()
		call(shellIcon, nimAdd, uintptr(unsafe.Pointer(&w.tray)))
		return 0
	}
	if hwnd == w.details {
		switch id {
		case wmClose:
			call(showWin,hwnd,swHide)
			return 0
		case wmCommand:
			command:=uint16(wparam&0xffff)
			switch {
			case command==2210: w.openHistoryLink()
            case command==2201: w.openNewsLink()
            case command>=2401&&command<=2403: w.setDetailsTab(int(command-2401))
            case command>=2410&&command<=2411: w.setDetailsPeriod(int(command-2410))
			}
			return 0
		}
	}
	if hwnd == w.settings {
		switch id {
		case wmClose:
			call(showWin, hwnd, swHide)
			return 0
		case wmCommand:
			switch uint16(wparam & 0xffff) {
			case 1001:
				b := make([]uint16, 2048)
				call(getText, w.feedEdit, uintptr(unsafe.Pointer(&b[0])), uintptr(len(b)))
				w.emit("url", syscall.UTF16ToString(b))
			case 1002:
				w.emit("refresh", "")
			case 1003:
				w.openSource()
			case 1004:
				w.emit("manual", "")
			case 1010:
				w.emit("advance", "")
			case 1011:
				w.emit("quiet", "")
			case 1012:
				w.emit("show", "")
			case 1013:
				w.emit("lock", "")
			case 1014:
				w.emit("clock", "")
			case 1200:
				w.toggleDiagnostics()
			}
			return 0
		}
	}
	if hwnd == w.card {
		switch id {
		case wmClose:
			if w.settings != 0 {
				call(destroyWin, w.settings)
			}
			if w.details != 0 {call(destroyWin,w.details)}
			if w.detailsFont != 0 {call(deleteObject,w.detailsFont)}
			call(destroyWin, w.card)
			return 0
		case wmDestroy:
			call(postQuit, 0)
			return 0
		case wmMouseActivate:
			return 3 // MA_NOACTIVATE
		case wmNCHitTest:
			w.mu.Lock()
			locked := w.display.Locked
			w.mu.Unlock()
			if locked {
				return ^uintptr(0)
			} // HTTRANSPARENT = -1
        case wmMouseMove:
            w.mu.Lock()
            locked:=w.display.Locked
            first:=!w.hovered && !locked
            if first {w.hovered=true}
            w.mu.Unlock()
            if first {
                t:=trackMouse{Size:uint32(unsafe.Sizeof(trackMouse{})),Flags:2,Hwnd:hwnd}
                call(trackMouseEvent,uintptr(unsafe.Pointer(&t)))
                w.emit("ticker_pause","")
            }
            return 0
        case wmMouseLeave:
            w.mu.Lock()
            active:=w.hovered
            w.hovered=false
            w.mu.Unlock()
            if active {w.emit("ticker_resume","")}
            return 0
		case wmLButtonDown:
			w.mu.Lock()
			locked := w.display.Locked
            count:=len(w.display.TickerItems)
			w.mu.Unlock()
			if !locked {
                x,y:=int(uint16(lparam&0xffff)),int(uint16((lparam>>16)&0xffff))
                height:=cardHeight+count*38
                if y<50&&x>=220 {w.detailsWindow();return 0}
                if y>=height-38&&x<255 {
                    w.mu.Lock();source:=w.display.DataSourceURL;w.mu.Unlock()
                    if source!="" {w.openDetailsURL(source);return 0}
                }
                if y>=180&&y<height-38 {w.detailsWindow();return 0}
                call(releaseCapture)
				call(sendMsg, hwnd, 0x00A1, 2, 0)
			}
			return 0
		case wmMove:
			w.mu.Lock()
			locked := w.display.Locked
			placing:=w.placing
			oldX, oldY := w.display.X, w.display.Y
			w.mu.Unlock()
			if !locked && !placing {
				var r rect
				call(getWindowRect, hwnd, uintptr(unsafe.Pointer(&r)))
				if int(r.Left) != oldX || int(r.Top) != oldY {
					w.emit("position", fmt.Sprintf("%d,%d", r.Left, r.Top))
				}
			}
			return 0
		case wmUpdate:
			w.render()
			return 0
		case wmPaint:
			w.paint()
			return 0
		case wmTray:
			if uint32(lparam) == wmRButtonUp {
				w.menu()
				return 0
			}
			if uint32(lparam) == wmLButtonDown {
				w.settingsWindow()
				return 0
			}
		}
	}
	return call(defProc, hwnd, uintptr(id), wparam, lparam)
}
func (w *windowsUI) render() {
 w.mu.Lock()
 d:=w.display
 w.placing=true
 if d.Locked && w.hovered {w.hovered=false;go w.emit("ticker_resume","")}
 w.mu.Unlock()
 defer func(){w.mu.Lock();w.placing=false;w.mu.Unlock()}()
 if w.card==0{return}
 if d.Show {call(showWin,w.card,swShowNoActivate)}else{call(showWin,w.card,swHide)}
 height:=cardHeight+len(d.TickerItems)*38
 x,y:=d.X,d.Y
 // Clamp inside the virtual desktop, retaining negative coordinates for
 // secondary monitors placed left/above the primary. DPI/mixed-monitor
 // behavior still requires genuine Win32 inspection.
 vx,vy:=int(call(getSystemMetrics,76)),int(call(getSystemMetrics,77))
 vw,vh:=int(call(getSystemMetrics,78)),int(call(getSystemMetrics,79))
 if vw<=0 {vx=0;vw=int(call(getSystemMetrics,0))}
 if vh<=0 {vy=0;vh=int(call(getSystemMetrics,1))}
 if vw>0 {
   if x+cardWidth>vx+vw {x=vx+vw-cardWidth}
   if x<vx {x=vx}
 }
 if vh>0 {
   if y+height>vy+vh {y=vy+vh-height}
   if y<vy {y=vy}
 }
 flags:=uintptr(0x0010)
 if w.desktopAttached{flags|=0x0004}
 target:=uintptr(1) // HWND_BOTTOM, non-topmost fallback.
 if w.desktopAttached{target=0}
 call(setWindowPos,w.card,target,uintptr(x),uintptr(y),cardWidth,uintptr(height),flags)
 if d.Locked {
   call(setLong,w.card,-20&0xffffffff,exNoActivate|exToolWindow|exLayered|exTransparent)
 }else{
   call(setLong,w.card,-20&0xffffffff,exNoActivate|exToolWindow|exLayered)
 }
 call(invalidate,w.card,0,1)
 if w.settings!=0{w.syncSettings(d)}
 if w.details!=0{w.syncDetails(d)}
}

// Win32 card: independent bounded labels, not a DT_SINGLELINE/DT_WORDBREAK
// combined block. COLORREF bytes are BGR, hence the explicit converter.
func rgb(r, g, b uint8) uintptr { return uintptr(r) | uintptr(g)<<8 | uintptr(b)<<16 }
func (w *windowsUI) paintFill(dc uintptr, area rect, color uintptr) {
	brush := call(createBrush, color)
	call(fillRect, dc, uintptr(unsafe.Pointer(&area)), brush)
	call(deleteObject, brush)
}
// GDI uses a native vertical gradient; the solid color is a safe fallback.
func (w *windowsUI) paintGradient(dc uintptr, height int32) {
    verts:=[2]gradientVertex{
        {X:0,Y:0,Red:0x0c00,Green:0x2700,Blue:0x2b00},
        {X:cardWidth,Y:height,Red:0x1800,Green:0x5a00,Blue:0x4b00},
    }
    mesh:=gradientMesh{UpperLeft:0,LowerRight:1}
    if call(gradientFill,dc,uintptr(unsafe.Pointer(&verts[0])),2,
        uintptr(unsafe.Pointer(&mesh)),1,1)==0 {
        w.paintFill(dc,rect{0,0,cardWidth,height},rgb(21,59,57))
    }
}
func (w *windowsUI) paintText(dc uintptr, str string, area rect, size, weight int32, color uintptr, flags uintptr) {
	if str == "" {
		return
	}
	font := call(createFont, uintptr(int32(-size)), 0, 0, 0, uintptr(weight), 0, 0, 0, 1, 0, 0, 0, 0, utf("Segoe UI"))
	if font == 0 {
		return
	}
	previous := call(selectObject, dc, font)
	call(setColor, dc, color)
	call(drawText, dc, utf(str), ^uintptr(0), uintptr(unsafe.Pointer(&area)), flags|0x0800)
	call(selectObject, dc, previous)
	call(deleteObject, font)
}
func (w *windowsUI) paint() {
 var state paint
 dc:=call(beginPaint,w.card,uintptr(unsafe.Pointer(&state)))
 if dc==0{return}
 defer call(endPaint,w.card,uintptr(unsafe.Pointer(&state)))
 w.mu.Lock();d:=w.display;w.mu.Unlock()
 height:=cardHeight+len(d.TickerItems)*38
 w.paintGradient(dc,int32(height))
  call(setBk,dc,1)
  white,subtle,green:=rgb(247,251,249),rgb(190,216,207),rgb(166,225,203)
  w.paintText(dc,"↻  Reset Clock",rect{18,16,181,41},15,700,white,0x20|0x8000)
  w.paintText(dc,"记录与动态 ↗",rect{240,14,369,43},12,600,green,0x20|0x8000)
  w.paintText(dc,d.CardHint,rect{18,55,368,77},12,500,green,0x20|0x8000)
  size:=int32(33)
  if !d.HasUpcoming {size=23}
  w.paintText(dc,d.CardValue,rect{18,79,368,118},size,700,white,0x20|0x8000)
  w.paintText(dc,d.CardMeta,rect{18,125,368,147},12,500,white,0x20|0x8000)
  note:="独立第三方追踪 · 不代表个人额度恢复"
  if d.StatusKind=="withdrawn" {note="先前公告已撤回 · 下一次时间待公布"}
  if d.TickerCached {note="来源待核验 · 以下仅为已保存的历史内容"}
  w.paintText(dc,note,rect{18,152,368,172},11,400,subtle,0x20|0x8000)
  w.paintFill(dc,rect{18,180,368,181},rgb(66,112,99))
  title:="最近动态"
  if d.TickerCached {title="最近动态 · 缓存"}
  w.paintText(dc,title,rect{18,189,368,210},12,650,green,0x20|0x8000)
  if len(d.TickerItems)==0 {
      w.paintText(dc,"暂无可核验动态",rect{18,212,368,235},11,400,subtle,0x20|0x8000)
  }
  for i,item:=range d.TickerItems {
      if i>=3 {break}
      top:=int32(212+i*38)
      w.paintText(dc,item.Title,rect{18,top,368,top+19},12,550,white,0x20|0x8000)
      w.paintText(dc,item.Updated+" · "+item.Source,rect{18,top+19,368,top+35},10,400,subtle,0x20|0x8000)
  }
  if d.DataSourceURL!="" {
      w.paintText(dc,"Data: codex-reset.com ↗",rect{18,int32(height-31),274,int32(height-9)},
          11,550,green,0x20|0x8000)
  }
}

func (w *windowsUI) openSource() {
	w.mu.Lock()
	value := w.display.SourceURL
	w.mu.Unlock()
	if strings.HasPrefix(value, "https://") {
		call(shell32.NewProc("ShellExecuteW"), 0, utf("open"), utf(value), 0, 0, 1)
	}
}
func (w *windowsUI) menu() {
	m := call(popup)
	if m == 0 {
		return
	}
	defer call(destroyMenu, m)
	w.mu.Lock()
	d := w.display
	w.mu.Unlock()
	type menuOption struct {
		name, title string
		checked     bool
		separator   bool
	}
	opts := []menuOption{
		{name: "settings", title: "查看公告与设置"},
		{name: "details", title: "记录与动态"},
		{name: "refresh", title: "立即检查来源"},
        {name: "data_source", title: "打开数据来源"},
		{name: "source", title: "打开原始公告"},
        {name:"resource_0",title:"Codex 官方资料"},
        {name:"resource_1",title:"API 使用指南"},
		{separator: true},
		{name: "show", title: "显示桌面卡片", checked: d.Show},
		{name: "lock", title: "锁定位置（点击穿透）", checked: d.Locked},
		{name: "quiet", title: "免打扰", checked: d.Quiet},
		{name: "advance", title: "提前 10 分钟提醒", checked: d.Advance10},
		{name: "clock", title: "24 小时制", checked: d.Clock24},
		{name: "manual", title: "10 分钟后手动提醒"},
		{separator: true},
	}
	if d.Demo {
		opts = append(opts, menuOption{name: "demo_v1", title: "模拟公告 V1"},
			menuOption{name: "demo_v2", title: "模拟公告 V2"},
			menuOption{name: "demo_v3", title: "模拟公告 V3"},
            menuOption{name:"mock_pay",title:"模拟 Pro（不收费）"},
            menuOption{name:"mock_refund",title:"模拟退款 / 撤权"},menuOption{separator:true})
	}
	opts = append(opts, menuOption{name: "quit", title: "退出"})
	for i, option := range opts {
		if option.separator {
			call(appendMenu, m, 0x0800, 0, 0)
			continue
		}
		flags := uintptr(0)
		if option.checked {
			flags |= 0x0008
		}
		if (option.name == "source" && !d.HasSourceURL) || (option.name=="data_source" && d.DataSourceURL=="") {
			flags |= 0x0001
		}
		call(appendMenu, m, flags, uintptr(i+1), utf(option.title))
	}
	var position point
	call(getCursor, uintptr(unsafe.Pointer(&position)))
	call(setForeground, w.card)
	index := int(call(trackPopup, m, 0x0100|0x0002, uintptr(position.X), uintptr(position.Y), 0, w.card, 0)) - 1
	if index < 0 || index >= len(opts) || opts[index].separator {
		return
	}
	command := opts[index].name
	switch command {
	case "settings":
		w.settingsWindow()
	case "details":
		w.detailsWindow()
	case "source":
		w.openSource()
    case "data_source":
        w.openDetailsURL(d.DataSourceURL)
    case "resource_0":
        w.openResourceLink(0)
    case "resource_1":
        w.openResourceLink(1)
	case "quit":
		w.emit("quit", "")
		call(postMsg, w.card, wmClose, 0, 0)
	default:
		w.emit(command, "")
	}
}
func (w *windowsUI) settingsWindow() {
	if w.settings == 0 {
		class := ptr("OpenDesk.ResetClock.Native.R1")
		w.settings = call(createWin, 0, uintptr(unsafe.Pointer(class)), utf("Reset Clock · 设置"),
			wsOverlapped, 180, 150, settingsWidth, settingsHeight, 0, 0,
			call(kernel32.NewProc("GetModuleHandleW"), 0), 0)
		if w.settings == 0 {
			return
		}
		// One UI font kept for all settings controls, released with the window.
		negativeFontHeight := int32(-16)
		w.uiFont = call(createFont, uintptr(uint32(negativeFontHeight)), 0, 0, 0, 400, 0, 0, 0, 1, 0, 0, 0, 0, utf("Segoe UI"))
		child := func(class, name string, style uintptr, x, y, width, height int, id uintptr) uintptr {
			hwnd := call(createWin, 0, utf(class), utf(name), wsChild|wsVisible|style,
				uintptr(x), uintptr(y), uintptr(width), uintptr(height), w.settings, id, 0, 0)
			if hwnd != 0 && w.uiFont != 0 {
				call(sendMsg, hwnd, wmSetFont, w.uiFont, 1)
			}
			return hwnd
		}
		child("STATIC", "公告来源", 0, 18, 16, 500, 24, 0)
		w.feedEdit = child("EDIT", "", 0x0080|0x00800000, 18, 44, 507, 27, 0)
		child("BUTTON", "保存并刷新", 0, 18, 81, 118, 28, 1001)
		child("BUTTON", "立即刷新", 0, 147, 81, 98, 28, 1002)
		w.sourceButton = child("BUTTON", "打开原始公告", 0, 256, 81, 143, 28, 1003)
		child("STATIC", "提醒设置", 0, 18, 128, 500, 24, 0)
		w.advanceCheck = child("BUTTON", "提前 10 分钟提醒", 0x0003, 18, 159, 237, 25, 1010)
		w.quietCheck = child("BUTTON", "免打扰", 0x0003, 272, 159, 235, 25, 1011)
		child("BUTTON", "10 分钟后手动提醒", 0, 18, 193, 189, 28, 1004)
		child("STATIC", "桌面显示", 0, 18, 240, 500, 24, 0)
		w.showCheck = child("BUTTON", "显示桌面卡片", 0x0003, 18, 271, 235, 25, 1012)
		w.lockCheck = child("BUTTON", "锁定位置（点击穿透）", 0x0003, 272, 271, 249, 25, 1013)
		w.clockCheck = child("BUTTON", "24 小时制", 0x0003, 18, 305, 210, 25, 1014)
		child("STATIC", "来源状态", 0, 18, 349, 500, 24, 0)
		child("STATIC", "本机最近检查", 0, 18, 379, 230, 19, 0)
		child("STATIC", "上游最近检查", 0, 271, 379, 240, 19, 0)
		w.lastRequest = child("STATIC", "未知", 0, 18, 399, 233, 23, 0)
		w.lastChecked = child("STATIC", "未知", 0, 271, 399, 240, 23, 0)
		child("STATIC", "公告内容最近变化", 0, 18, 432, 232, 19, 0)
		child("STATIC", "当前来源状态", 0, 271, 432, 240, 19, 0)
		w.lastChanged = child("STATIC", "未知", 0, 18, 452, 235, 23, 0)
		w.sourceStatus = child("STATIC", "未知", 0, 271, 452, 248, 24, 0)
		w.advancedButton = child("BUTTON", "高级诊断 ▸", 0, 18, 489, 138, 27, 1200)
		w.diagnostics = child("EDIT", "", 0x0800|0x0004|0x00200000|0x00800000,
			18, 532, 506, 110, 0)
		call(showWin, w.diagnostics, swHide)
	}
	w.mu.Lock()
	d := w.display
	w.mu.Unlock()
	w.syncSettings(d)
	call(showWin, w.settings, swShow)
	call(setForeground, w.settings)
}
// Details stay separate from the 386x260 desktop widget and use the SAME native Win32 host.
// Three native detail pages share the original Win32 window. No WebView.
func (w *windowsUI) detailsWindow(){
 if w.details==0 {
  class:=ptr("OpenDesk.ResetClock.Native.R1")
  w.details=call(createWin,0,uintptr(unsafe.Pointer(class)),utf("Reset Clock · 记录与动态"),
    wsOverlapped,200,155,594,660,0,0,call(kernel32.NewProc("GetModuleHandleW"),0),0)
  if w.details==0{return}
  fontHeight:=int32(-16)
  w.detailsFont=call(createFont,uintptr(uint32(fontHeight)),0,0,0,400,0,0,0,1,0,0,0,0,utf("Segoe UI"))
  child:=func(page int,class,name string,style uintptr,x,y,width,height int,id uintptr)uintptr{
    handle:=call(createWin,0,utf(class),utf(name),wsChild|wsVisible|style,
      uintptr(x),uintptr(y),uintptr(width),uintptr(height),w.details,id,0,0)
    if handle!=0&&w.detailsFont!=0{call(sendMsg,handle,wmSetFont,w.detailsFont,1)}
    if page>=0&&page<3 {w.detailsPages[page]=append(w.detailsPages[page],handle)}
    return handle
  }
  child(-1,"STATIC","记录与动态",0,19,14,540,25,0)
  for i,name:=range []string{"概览","历史记录","资讯"} {
    w.detailsTabs[i]=child(-1,"BUTTON",name,0x00010000,19+i*179,48,166,32,uintptr(2401+i))
  }
  child(0,"STATIC","重置事件统计",0,19,105,273,25,0)
  for i,name:=range []string{"最近 30 天","本月"}{
    w.detailsPeriodButtons[i]=child(0,"BUTTON",name,0x00010000,305+i*125,100,119,32,uintptr(2410+i))
  }
  w.detailsStats=child(0,"EDIT","数据不足",0x0800|0x0004|0x00200000|0x00800000,19,148,538,197,0)
  child(0,"STATIC","最近三条有效动态",0,19,369,538,25,0)
  w.detailsOverviewNews=child(0,"EDIT","暂无有效资讯",0x0800|0x0004|0x00200000|0x00800000,19,405,538,126,0)
  w.detailsOverviewStatus=child(0,"STATIC","来源类别由提供方标注，不代表账户额度已恢复",0,19,555,538,35,0)

  child(1,"STATIC","历史时间线 · 含修订、确认及撤回",0,19,106,538,25,0)
  w.detailsHistory=child(1,"EDIT","数据不足",0x0800|0x0004|0x00200000|0x00800000,19,144,538,369,0)
  w.detailsHistoryPicker=child(1,"COMBOBOX","",0x0003|0x00200000|0x00010000,19,536,317,230,0)
  w.detailsHistoryLink=child(1,"BUTTON","查看证据 ↗",0x00010000,353,536,204,29,2210)
  child(1,"STATIC","未覆盖完整时段时不推断零次，修订不重复计数。",0,19,578,538,20,0)

  child(2,"STATIC","全部资讯 · 来源 / 时间 / 修订状态",0,19,106,538,25,0)
  w.detailsNews=child(2,"EDIT","暂无资讯记录",0x0800|0x0004|0x00200000|0x00800000,19,144,538,369,0)
  w.detailsNewsPicker=child(2,"COMBOBOX","",0x0003|0x00200000|0x00010000,19,536,317,230,0)
  w.detailsNewsLink=child(2,"BUTTON","打开 HTTPS 来源 ↗",0x00010000,353,536,204,29,2201)
  child(2,"STATIC","已撤回与来源失效保留供追溯，但不参与有效轮播。",0,19,578,538,20,0)
  w.setDetailsTab(0)
  w.detailsPeriodIndex=0
 }
 w.mu.Lock();d:=w.display;w.mu.Unlock()
 w.syncDetails(d)
 call(showWin,w.details,swShow)
 call(setForeground,w.details)
}
func (w *windowsUI) setDetailsTab(index int){
 if index<0||index>2{return}
 w.detailsTabIndex=index
 for i,page:=range w.detailsPages{
  for _,handle:=range page{
   if handle==0{continue}
   if i==index{call(showWin,handle,swShow)}else{call(showWin,handle,swHide)}
  }
 }
 for i,handle:=range w.detailsTabs{
  name:=[]string{"概览","历史记录","资讯"}[i]
  if i==index{name="● "+name}
  if handle!=0{call(setText,handle,utf(name))}
 }
}
func (w *windowsUI) setDetailsPeriod(index int){
 if index<0||index>1{return}
 w.detailsPeriodIndex=index
 for i,handle:=range w.detailsPeriodButtons {
  title:=[]string{"最近 30 天","本月"}[i]
  if i==index{title="● "+title}
  if handle!=0{call(setText,handle,utf(title))}
 }
 w.mu.Lock();d:=w.display;w.mu.Unlock()
 w.syncDetails(d)
}
func (w *windowsUI) openDetailsURL(raw string){
 parsed,err:=url.Parse(raw)
 if err!=nil || parsed.Scheme!="https" || parsed.Host=="" || parsed.User!=nil ||
    parsed.Fragment!="" || parsed.Opaque!="" {return}
 call(shell32.NewProc("ShellExecuteW"),0,utf("open"),utf(raw),0,0,1)
}
func (w *windowsUI) openHistoryLink(){
 index:=int(call(sendMsg,w.detailsHistoryPicker,0x0147,0,0)) // CB_GETCURSEL
 w.mu.Lock()
 sources:=w.display.HistoryEvidence
 link:=""
 if index>=0 && index<len(sources){link=sources[index].URL}
 w.mu.Unlock()
 w.openDetailsURL(link)
}
func (w *windowsUI) openNewsLink(){
 index:=int(call(sendMsg,w.detailsNewsPicker,0x0147,0,0))
 w.mu.Lock()
 sources:=w.display.AllNews
 link:=""
 if index>=0&&index<len(sources){link=sources[index].URL}
 w.mu.Unlock()
 w.openDetailsURL(link)
}
func (w *windowsUI) openResourceLink(i int){
 if i<0||i>=2{return}
 w.mu.Lock();link:=w.display.ResourceURLs[i];w.mu.Unlock()
 w.openDetailsURL(link)
}
func (w *windowsUI) syncDetails(d Display){
 if w.details==0{return}
 statRows:=d.Stats30
 if w.detailsPeriodIndex==1{statRows=d.StatsMonth}
 var stats strings.Builder
 for _,row:=range statRows{
   stats.WriteString(row.Name+"    "+row.Value+"\r\n")
   stats.WriteString("    "+row.Detail+"\r\n\r\n")
 }
 if stats.Len()==0{stats.WriteString("数据不足")}
 if stats.String()!=w.lastStats {
   call(setText,w.detailsStats,utf(stats.String()))
   w.lastStats=stats.String()
 }
 if d.DetailsOverviewNews!=w.lastResources {
   call(setText,w.detailsOverviewNews,utf(strings.ReplaceAll(d.DetailsOverviewNews,"\n","\r\n")))
   w.lastResources=d.DetailsOverviewNews
 }
 statusText:=d.Health+" · 来源类别未独立核验"
 if statusText!=w.lastDetailHealth {
   call(setText,w.detailsOverviewStatus,utf(statusText))
   w.lastDetailHealth=statusText
 }
 var timeline strings.Builder
 for _,entry:=range d.HistoryRows{
   timeline.WriteString(fmt.Sprintf("%s  %s · 修订 %d\r\n",entry.When,entry.Title,entry.Revision))
   timeline.WriteString(entry.Summary+"\r\n\r\n")
 }
 timelineText:=timeline.String()
 if timelineText==""{timelineText="数据不足 · 暂无可核验历史归档"}
 if timelineText!=w.lastHistory {
   call(setText,w.detailsHistory,utf(timelineText))
   w.lastHistory=timelineText
 }
 if d.DetailsFullNews!=w.lastNews{
   call(setText,w.detailsNews,utf(strings.ReplaceAll(d.DetailsFullNews,"\n","\r\n")))
   w.lastNews=d.DetailsFullNews
 }
 if !reflect.DeepEqual(w.lastEvidence,d.HistoryEvidence) {
  selection:=int(call(sendMsg,w.detailsHistoryPicker,0x0147,0,0))
  call(sendMsg,w.detailsHistoryPicker,0x014B,0,0)
  for _,e:=range d.HistoryEvidence{call(sendMsg,w.detailsHistoryPicker,0x0143,0,utf(e.Label))}
  w.lastEvidence=append([]SourceEvidence(nil),d.HistoryEvidence...)
  if len(d.HistoryEvidence)>0{
    if selection<0||selection>=len(d.HistoryEvidence){selection=0}
    call(sendMsg,w.detailsHistoryPicker,0x014E,uintptr(selection),0)
  }
 }
 if !reflect.DeepEqual(w.lastNewsOptions,d.AllNews){
  selected:=int(call(sendMsg,w.detailsNewsPicker,0x0147,0,0))
  call(sendMsg,w.detailsNewsPicker,0x014B,0,0)
  for _,e:=range d.AllNews{call(sendMsg,w.detailsNewsPicker,0x0143,0,utf(e.Label))}
  w.lastNewsOptions=append([]SourceEvidence(nil),d.AllNews...)
  if len(d.AllNews)>0{
    if selected<0||selected>=len(d.AllNews){selected=0}
    call(sendMsg,w.detailsNewsPicker,0x014E,uintptr(selected),0)
  }
 }
 call(enableWindow,w.detailsHistoryPicker,uintptr(boolInt(len(d.HistoryEvidence)>0)))
 call(enableWindow,w.detailsNewsPicker,uintptr(boolInt(len(d.AllNews)>0)))
 selectedH:=int(call(sendMsg,w.detailsHistoryPicker,0x0147,0,0))
 selectedN:=int(call(sendMsg,w.detailsNewsPicker,0x0147,0,0))
 historyOK:=selectedH>=0&&selectedH<len(d.HistoryEvidence)&&
    strings.HasPrefix(d.HistoryEvidence[selectedH].URL,"https://")
 newsOK:=selectedN>=0&&selectedN<len(d.AllNews)&&
    strings.HasPrefix(d.AllNews[selectedN].URL,"https://")
 call(enableWindow,w.detailsHistoryLink,uintptr(boolInt(historyOK)))
 call(enableWindow,w.detailsNewsLink,uintptr(boolInt(newsOK)))
}
func (w *windowsUI) toggleDiagnostics() {
	w.advancedShown = !w.advancedShown
	if w.advancedShown {
		call(setText, w.advancedButton, utf("高级诊断 ▾"))
		call(moveWindow, w.settings, 180, 150, settingsWidth, settingsHeight+145, 1)
		call(showWin, w.diagnostics, swShow)
	} else {
		call(setText, w.advancedButton, utf("高级诊断 ▸"))
		call(showWin, w.diagnostics, swHide)
		call(moveWindow, w.settings, 180, 150, settingsWidth, settingsHeight, 1)
	}
}
func (w *windowsUI) syncSettings(d Display) {
	if w.settings == 0 {
		return
	}
	// Do not replace an in-progress URL edit when the once-per-second clock redraws.
	if call(user32.NewProc("GetFocus")) != w.feedEdit {
		call(setText, w.feedEdit, utf(d.FeedURL))
	}
	if w.sourceButton != 0 {
		call(enableWindow, w.sourceButton, uintptr(boolInt(d.HasSourceURL)))
	}
	for _, toggle := range []struct {
		button  uintptr
		enabled bool
	}{
		{w.advanceCheck, d.Advance10}, {w.quietCheck, d.Quiet},
		{w.showCheck, d.Show}, {w.lockCheck, d.Locked}, {w.clockCheck, d.Clock24},
	} {
		if toggle.button != 0 {
			call(sendMsg, toggle.button, 0x00F1, uintptr(boolInt(toggle.enabled)), 0)
		}
	}
	call(setText, w.lastRequest, utf(d.LastRequest))
	call(setText, w.lastChecked, utf(d.LastChecked))
	call(setText, w.lastChanged, utf(d.LastChanged))
	call(setText, w.sourceStatus, utf(d.Health))
	call(setText, w.diagnostics, utf(d.Diagnostics))
}
func boolInt(v bool) int {
	if v {
		return 1
	}
	return 0
}
