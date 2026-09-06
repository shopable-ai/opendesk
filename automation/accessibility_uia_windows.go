//go:build windows

package automation

import (
	"fmt"
	"math"
	"runtime"
	"syscall"
	"unicode/utf16"
	"unsafe"

	"golang.org/x/sys/windows"
)

// These declarations intentionally model the UI Automation COM interfaces
// directly. In particular, pattern interfaces are requested with
// IUIAutomationElement::GetCurrentPatternAs and their actual IID; an IUnknown
// pointer is never reinterpreted as IDispatch.

const (
	uiaSOK                    uint32 = 0
	uiaSFalse                 uint32 = 1
	uiaEAccessDenied          uint32 = 0x80070005
	uiaEInvalidArg            uint32 = 0x80070057
	uiaRPCChangedMode         uint32 = 0x80010106
	uiaElementNotEnabled      uint32 = 0x80040200
	uiaElementNotAvailable    uint32 = 0x80040201
	uiaNoClickablePoint       uint32 = 0x80040202
	uiaProxyAssemblyNotLoaded uint32 = 0x80040203
	uiaNotSupported           uint32 = 0x80040204
	uiaInvalidOperation       uint32 = 0x80131509
	uiaProviderTimeout        uint32 = 0x80131505

	uiaCLSCTXInprocServer = 0x1

	uiaRuntimeIDProperty                 = 30000
	uiaBoundingRectangleProperty         = 30001
	uiaProcessIDProperty                 = 30002
	uiaControlTypeProperty               = 30003
	uiaNameProperty                      = 30005
	uiaHasKeyboardFocusProperty          = 30008
	uiaIsEnabledProperty                 = 30010
	uiaAutomationIDProperty              = 30011
	uiaIsPasswordProperty                = 30019
	uiaNativeWindowHandleProperty        = 30020
	uiaIsExpandCollapseAvailableProperty = 30028
	uiaIsInvokeAvailableProperty         = 30031
	uiaIsSelectionItemAvailableProperty  = 30036
	uiaIsToggleAvailableProperty         = 30041
	uiaIsValueAvailableProperty          = 30043

	uiaInvokePatternID         = 10000
	uiaValuePatternID          = 10002
	uiaExpandCollapsePatternID = 10005
	uiaSelectionItemPatternID  = 10010
	uiaTogglePatternID         = 10015

	uiaExpandCollapseCollapsed         = 0
	uiaExpandCollapseExpanded          = 1
	uiaExpandCollapsePartiallyExpanded = 2
	uiaExpandCollapseLeafNode          = 3

	uiaToggleOff           = 0
	uiaToggleOn            = 1
	uiaToggleIndeterminate = 2

	uiaVTEmpty = 0
	uiaVTI4    = 3
	uiaVTR8    = 5
	uiaVTBSTR  = 8
	uiaVTBool  = 11
	uiaVTArray = 0x2000
)

var (
	uiaOle32                  = windows.NewLazySystemDLL("ole32.dll")
	uiaOleAut32               = windows.NewLazySystemDLL("oleaut32.dll")
	uiaUser32                 = windows.NewLazySystemDLL("user32.dll")
	uiaProcCoInitializeEx     = uiaOle32.NewProc("CoInitializeEx")
	uiaProcCoUninitialize     = uiaOle32.NewProc("CoUninitialize")
	uiaProcCoCreateInstance   = uiaOle32.NewProc("CoCreateInstance")
	uiaProcVariantClear       = uiaOleAut32.NewProc("VariantClear")
	uiaProcSysAllocStringLen  = uiaOleAut32.NewProc("SysAllocStringLen")
	uiaProcSysFreeString      = uiaOleAut32.NewProc("SysFreeString")
	uiaProcSysStringLen       = uiaOleAut32.NewProc("SysStringLen")
	uiaProcSafeArrayGetDim    = uiaOleAut32.NewProc("SafeArrayGetDim")
	uiaProcSafeArrayGetLBound = uiaOleAut32.NewProc("SafeArrayGetLBound")
	uiaProcSafeArrayGetUBound = uiaOleAut32.NewProc("SafeArrayGetUBound")
	uiaProcSafeArrayGetElem   = uiaOleAut32.NewProc("SafeArrayGetElement")
	uiaProcSafeArrayDestroy   = uiaOleAut32.NewProc("SafeArrayDestroy")
	uiaProcIsWindow           = uiaUser32.NewProc("IsWindow")
	uiaProcGetWindowPID       = uiaUser32.NewProc("GetWindowThreadProcessId")
	uiaProcGetForeground      = uiaUser32.NewProc("GetForegroundWindow")
	uiaProcGetAncestor        = uiaUser32.NewProc("GetAncestor")
	uiaProcGetWindow          = uiaUser32.NewProc("GetWindow")
)

var (
	uiaCLSIDCUIAutomation8 = windows.GUID{Data1: 0xe22ad333, Data2: 0xb25f, Data3: 0x460c, Data4: [8]byte{0x83, 0xd0, 0x05, 0x81, 0x10, 0x73, 0x95, 0xc9}}
	uiaIIDIUIAutomation2   = windows.GUID{Data1: 0x34723aff, Data2: 0x0c9d, Data3: 0x49d0, Data4: [8]byte{0x98, 0x96, 0x7a, 0xb5, 0x2d, 0xf8, 0xcd, 0x8a}}

	uiaIIDInvokePattern         = windows.GUID{Data1: 0xfb377fbe, Data2: 0x8ea6, Data3: 0x46d5, Data4: [8]byte{0x9c, 0x73, 0x64, 0x99, 0x64, 0x2d, 0x30, 0x59}}
	uiaIIDValuePattern          = windows.GUID{Data1: 0xa94cd8b1, Data2: 0x0844, Data3: 0x4cd6, Data4: [8]byte{0x9d, 0x2d, 0x64, 0x05, 0x37, 0xab, 0x39, 0xe9}}
	uiaIIDExpandCollapsePattern = windows.GUID{Data1: 0x619be086, Data2: 0x1f4e, Data3: 0x4ee4, Data4: [8]byte{0xba, 0xfa, 0x21, 0x01, 0x28, 0x73, 0x87, 0x30}}
	uiaIIDSelectionItemPattern  = windows.GUID{Data1: 0xa8efa66a, Data2: 0x0fda, Data3: 0x421a, Data4: [8]byte{0x91, 0x94, 0x38, 0x02, 0x1f, 0x35, 0x78, 0xea}}
	uiaIIDTogglePattern         = windows.GUID{Data1: 0x94cf8058, Data2: 0x9b8d, Data3: 0x4ab9, Data4: [8]byte{0x8b, 0xfd, 0x4c, 0xd0, 0xa3, 0x3c, 0x8c, 0x70}}
)

type uiaHRESULT struct {
	value uint32
	where string
}

func (e *uiaHRESULT) Error() string {
	return fmt.Sprintf("%s failed (HRESULT 0x%08x)", e.where, e.value)
}

func uiaFailed(value uintptr) bool {
	return int32(uint32(value)) < 0
}

func uiaResult(where string, value uintptr) error {
	if !uiaFailed(value) {
		return nil
	}
	return &uiaHRESULT{value: uint32(value), where: where}
}

func uiaCoInitializeMTA() error {
	result, _, _ := uiaProcCoInitializeEx.Call(0, 0)
	if uint32(result) == uiaSOK || uint32(result) == uiaSFalse {
		return nil
	}
	return &uiaHRESULT{value: uint32(result), where: "CoInitializeEx(COINIT_MULTITHREADED)"}
}

func uiaCoUninitialize() {
	uiaProcCoUninitialize.Call()
}

type uiaAutomation struct {
	vtbl *uiaAutomationVtbl
}

type uiaAutomationVtbl struct {
	queryInterface              uintptr
	addRef                      uintptr
	release                     uintptr
	compareElements             uintptr
	compareRuntimeIDs           uintptr
	getRootElement              uintptr
	elementFromHandle           uintptr
	elementFromPoint            uintptr
	getFocusedElement           uintptr
	getRootElementBuildCache    uintptr
	elementFromHandleBuildCache uintptr
	elementFromPointBuildCache  uintptr
	getFocusedElementBuildCache uintptr
	createTreeWalker            uintptr
	getControlViewWalker        uintptr
	getContentViewWalker        uintptr
	getRawViewWalker            uintptr
	reserved17To57              [41]uintptr
	getAutoSetFocus             uintptr
	putAutoSetFocus             uintptr
	getConnectionTimeout        uintptr
	putConnectionTimeout        uintptr
	getTransactionTimeout       uintptr
	putTransactionTimeout       uintptr
}

func uiaCreateClient() (*uiaAutomation, error) {
	var client *uiaAutomation
	result, _, _ := uiaProcCoCreateInstance.Call(
		uintptr(unsafe.Pointer(&uiaCLSIDCUIAutomation8)),
		0,
		uiaCLSCTXInprocServer,
		uintptr(unsafe.Pointer(&uiaIIDIUIAutomation2)),
		uintptr(unsafe.Pointer(&client)),
	)
	if err := uiaResult("CoCreateInstance(CUIAutomation8/IUIAutomation2)", result); err != nil {
		if client != nil {
			client.release()
		}
		return nil, err
	}
	if client == nil || client.vtbl == nil {
		return nil, fmt.Errorf("CoCreateInstance(CUIAutomation8) returned a nil interface")
	}
	return client, nil
}

func (value *uiaAutomation) configureClient(autoSetFocus bool, timeoutMS uint32) error {
	autoFocus := uintptr(0)
	if autoSetFocus {
		autoFocus = 1
	}
	hr, _, _ := syscall.SyscallN(
		value.vtbl.putAutoSetFocus,
		uintptr(unsafe.Pointer(value)),
		autoFocus,
	)
	if err := uiaResult("IUIAutomation2.put_AutoSetFocus", hr); err != nil {
		return err
	}
	hr, _, _ = syscall.SyscallN(
		value.vtbl.putConnectionTimeout,
		uintptr(unsafe.Pointer(value)),
		uintptr(timeoutMS),
	)
	if err := uiaResult("IUIAutomation2.put_ConnectionTimeout", hr); err != nil {
		return err
	}
	hr, _, _ = syscall.SyscallN(
		value.vtbl.putTransactionTimeout,
		uintptr(unsafe.Pointer(value)),
		uintptr(timeoutMS),
	)
	return uiaResult("IUIAutomation2.put_TransactionTimeout", hr)
}

func (value *uiaAutomation) release() {
	if value != nil && value.vtbl != nil {
		syscall.SyscallN(value.vtbl.release, uintptr(unsafe.Pointer(value)))
	}
}

func (value *uiaAutomation) rootElement() (*uiaElement, error) {
	var result *uiaElement
	hr, _, _ := syscall.SyscallN(
		value.vtbl.getRootElement,
		uintptr(unsafe.Pointer(value)),
		uintptr(unsafe.Pointer(&result)),
	)
	if err := uiaResult("IUIAutomation.GetRootElement", hr); err != nil {
		if result != nil {
			result.release()
		}
		return nil, err
	}
	if result == nil {
		return nil, fmt.Errorf("IUIAutomation.GetRootElement returned nil")
	}
	return result, nil
}

func (value *uiaAutomation) elementFromHandle(handle uintptr) (*uiaElement, error) {
	var result *uiaElement
	hr, _, _ := syscall.SyscallN(
		value.vtbl.elementFromHandle,
		uintptr(unsafe.Pointer(value)),
		handle,
		uintptr(unsafe.Pointer(&result)),
	)
	if err := uiaResult("IUIAutomation.ElementFromHandle", hr); err != nil {
		if result != nil {
			result.release()
		}
		return nil, err
	}
	if result == nil {
		return nil, fmt.Errorf("IUIAutomation.ElementFromHandle returned nil")
	}
	return result, nil
}

func (value *uiaAutomation) rawViewWalker() (*uiaTreeWalker, error) {
	var result *uiaTreeWalker
	hr, _, _ := syscall.SyscallN(
		value.vtbl.getRawViewWalker,
		uintptr(unsafe.Pointer(value)),
		uintptr(unsafe.Pointer(&result)),
	)
	if err := uiaResult("IUIAutomation.get_RawViewWalker", hr); err != nil {
		if result != nil {
			result.release()
		}
		return nil, err
	}
	if result == nil {
		return nil, fmt.Errorf("IUIAutomation.get_RawViewWalker returned nil")
	}
	return result, nil
}

type uiaTreeWalker struct {
	vtbl *uiaTreeWalkerVtbl
}

type uiaTreeWalkerVtbl struct {
	queryInterface                      uintptr
	addRef                              uintptr
	release                             uintptr
	getParentElement                    uintptr
	getFirstChildElement                uintptr
	getLastChildElement                 uintptr
	getNextSiblingElement               uintptr
	getPreviousSiblingElement           uintptr
	normalizeElement                    uintptr
	getParentElementBuildCache          uintptr
	getFirstChildElementBuildCache      uintptr
	getLastChildElementBuildCache       uintptr
	getNextSiblingElementBuildCache     uintptr
	getPreviousSiblingElementBuildCache uintptr
	normalizeElementBuildCache          uintptr
	getCondition                        uintptr
}

func (value *uiaTreeWalker) release() {
	if value != nil && value.vtbl != nil {
		syscall.SyscallN(value.vtbl.release, uintptr(unsafe.Pointer(value)))
	}
}

func (value *uiaTreeWalker) firstChild(element *uiaElement) (*uiaElement, error) {
	var result *uiaElement
	hr, _, _ := syscall.SyscallN(
		value.vtbl.getFirstChildElement,
		uintptr(unsafe.Pointer(value)),
		uintptr(unsafe.Pointer(element)),
		uintptr(unsafe.Pointer(&result)),
	)
	if err := uiaResult("IUIAutomationTreeWalker.GetFirstChildElement", hr); err != nil {
		if result != nil {
			result.release()
		}
		return nil, err
	}
	return result, nil
}

func (value *uiaTreeWalker) parent(element *uiaElement) (*uiaElement, error) {
	var result *uiaElement
	hr, _, _ := syscall.SyscallN(
		value.vtbl.getParentElement,
		uintptr(unsafe.Pointer(value)),
		uintptr(unsafe.Pointer(element)),
		uintptr(unsafe.Pointer(&result)),
	)
	if err := uiaResult("IUIAutomationTreeWalker.GetParentElement", hr); err != nil {
		if result != nil {
			result.release()
		}
		return nil, err
	}
	return result, nil
}

func (value *uiaTreeWalker) nextSibling(element *uiaElement) (*uiaElement, error) {
	var result *uiaElement
	hr, _, _ := syscall.SyscallN(
		value.vtbl.getNextSiblingElement,
		uintptr(unsafe.Pointer(value)),
		uintptr(unsafe.Pointer(element)),
		uintptr(unsafe.Pointer(&result)),
	)
	if err := uiaResult("IUIAutomationTreeWalker.GetNextSiblingElement", hr); err != nil {
		if result != nil {
			result.release()
		}
		return nil, err
	}
	return result, nil
}

type uiaElement struct {
	vtbl *uiaElementVtbl
}

type uiaElementVtbl struct {
	queryInterface            uintptr
	addRef                    uintptr
	release                   uintptr
	setFocus                  uintptr
	getRuntimeID              uintptr
	findFirst                 uintptr
	findAll                   uintptr
	findFirstBuildCache       uintptr
	findAllBuildCache         uintptr
	buildUpdatedCache         uintptr
	getCurrentPropertyValue   uintptr
	getCurrentPropertyValueEx uintptr
	getCachedPropertyValue    uintptr
	getCachedPropertyValueEx  uintptr
	getCurrentPatternAs       uintptr
}

func (value *uiaElement) addRef() {
	if value != nil && value.vtbl != nil {
		syscall.SyscallN(value.vtbl.addRef, uintptr(unsafe.Pointer(value)))
	}
}

func (value *uiaElement) release() {
	if value != nil && value.vtbl != nil {
		syscall.SyscallN(value.vtbl.release, uintptr(unsafe.Pointer(value)))
	}
}

func (value *uiaElement) runtimeID() ([]int32, error) {
	var array uintptr
	hr, _, _ := syscall.SyscallN(
		value.vtbl.getRuntimeID,
		uintptr(unsafe.Pointer(value)),
		uintptr(unsafe.Pointer(&array)),
	)
	if err := uiaResult("IUIAutomationElement.GetRuntimeId", hr); err != nil {
		if array != 0 {
			uiaDestroySafeArray(array)
		}
		return nil, err
	}
	if array == 0 {
		return nil, fmt.Errorf("IUIAutomationElement.GetRuntimeId returned nil")
	}
	defer uiaDestroySafeArray(array)
	return uiaSafeArrayInt32(array)
}

type uiaVariant struct {
	VT        uint16
	reserved1 uint16
	reserved2 uint16
	reserved3 uint16
	data0     uint64
	data1     uint64
}

func (value *uiaVariant) clear() {
	if value == nil {
		return
	}
	uiaProcVariantClear.Call(uintptr(unsafe.Pointer(value)))
}

func (value *uiaElement) property(propertyID int32) (uiaVariant, error) {
	var result uiaVariant
	hr, _, _ := syscall.SyscallN(
		value.vtbl.getCurrentPropertyValue,
		uintptr(unsafe.Pointer(value)),
		uintptr(propertyID),
		uintptr(unsafe.Pointer(&result)),
	)
	if err := uiaResult("IUIAutomationElement.GetCurrentPropertyValue", hr); err != nil {
		result.clear()
		return uiaVariant{}, err
	}
	return result, nil
}

func (value *uiaElement) pattern(patternID int32, iid *windows.GUID, result unsafe.Pointer) error {
	hr, _, _ := syscall.SyscallN(
		value.vtbl.getCurrentPatternAs,
		uintptr(unsafe.Pointer(value)),
		uintptr(patternID),
		uintptr(unsafe.Pointer(iid)),
		uintptr(result),
	)
	return uiaResult("IUIAutomationElement.GetCurrentPatternAs", hr)
}

func (value uiaVariant) int32() (int32, bool) {
	if value.VT != uiaVTI4 {
		return 0, false
	}
	return int32(uint32(value.data0)), true
}

func (value uiaVariant) bool() (bool, bool) {
	if value.VT != uiaVTBool {
		return false, false
	}
	return int16(uint16(value.data0)) != 0, true
}

func (value uiaVariant) string() (string, bool) {
	if value.VT != uiaVTBSTR {
		return "", false
	}
	return uiaBSTRToString(uintptr(value.data0)), true
}

func (value uiaVariant) float64Array() ([]float64, bool) {
	if value.VT != uiaVTArray|uiaVTR8 || value.data0 == 0 {
		return nil, false
	}
	values, err := uiaSafeArrayFloat64(uintptr(value.data0))
	return values, err == nil
}

type uiaInvokePattern struct {
	vtbl *uiaInvokePatternVtbl
}

type uiaInvokePatternVtbl struct {
	queryInterface uintptr
	addRef         uintptr
	release        uintptr
	invoke         uintptr
}

func (value *uiaInvokePattern) release() {
	if value != nil && value.vtbl != nil {
		syscall.SyscallN(value.vtbl.release, uintptr(unsafe.Pointer(value)))
	}
}

func (value *uiaInvokePattern) invokeOnce() error {
	hr, _, _ := syscall.SyscallN(value.vtbl.invoke, uintptr(unsafe.Pointer(value)))
	return uiaResult("IUIAutomationInvokePattern.Invoke", hr)
}

type uiaValuePattern struct {
	vtbl *uiaValuePatternVtbl
}

type uiaValuePatternVtbl struct {
	queryInterface       uintptr
	addRef               uintptr
	release              uintptr
	setValue             uintptr
	getCurrentValue      uintptr
	getCurrentIsReadOnly uintptr
	getCachedValue       uintptr
	getCachedIsReadOnly  uintptr
}

func (value *uiaValuePattern) release() {
	if value != nil && value.vtbl != nil {
		syscall.SyscallN(value.vtbl.release, uintptr(unsafe.Pointer(value)))
	}
}

func (value *uiaValuePattern) isReadOnly() (bool, error) {
	var result int32
	hr, _, _ := syscall.SyscallN(
		value.vtbl.getCurrentIsReadOnly,
		uintptr(unsafe.Pointer(value)),
		uintptr(unsafe.Pointer(&result)),
	)
	return result != 0, uiaResult("IUIAutomationValuePattern.get_CurrentIsReadOnly", hr)
}

func (value *uiaValuePattern) currentValue() (string, error) {
	var result uintptr
	hr, _, _ := syscall.SyscallN(
		value.vtbl.getCurrentValue,
		uintptr(unsafe.Pointer(value)),
		uintptr(unsafe.Pointer(&result)),
	)
	if err := uiaResult("IUIAutomationValuePattern.get_CurrentValue", hr); err != nil {
		if result != 0 {
			uiaFreeBSTR(result)
		}
		return "", err
	}
	defer uiaFreeBSTR(result)
	return uiaBSTRToString(result), nil
}

func (value *uiaValuePattern) setString(input string) (bool, error) {
	bstr, err := uiaAllocBSTR(input)
	if err != nil {
		return false, err
	}
	defer uiaFreeBSTR(bstr)
	hr, _, _ := syscall.SyscallN(
		value.vtbl.setValue,
		uintptr(unsafe.Pointer(value)),
		bstr,
	)
	return true, uiaResult("IUIAutomationValuePattern.SetValue", hr)
}

type uiaExpandCollapsePattern struct {
	vtbl *uiaExpandCollapsePatternVtbl
}

type uiaExpandCollapsePatternVtbl struct {
	queryInterface        uintptr
	addRef                uintptr
	release               uintptr
	expand                uintptr
	collapse              uintptr
	getCurrentExpandState uintptr
	getCachedExpandState  uintptr
}

func (value *uiaExpandCollapsePattern) release() {
	if value != nil && value.vtbl != nil {
		syscall.SyscallN(value.vtbl.release, uintptr(unsafe.Pointer(value)))
	}
}

func (value *uiaExpandCollapsePattern) state() (int32, error) {
	var result int32
	hr, _, _ := syscall.SyscallN(
		value.vtbl.getCurrentExpandState,
		uintptr(unsafe.Pointer(value)),
		uintptr(unsafe.Pointer(&result)),
	)
	return result, uiaResult("IUIAutomationExpandCollapsePattern.get_CurrentExpandCollapseState", hr)
}

func (value *uiaExpandCollapsePattern) expandOnce() error {
	hr, _, _ := syscall.SyscallN(value.vtbl.expand, uintptr(unsafe.Pointer(value)))
	return uiaResult("IUIAutomationExpandCollapsePattern.Expand", hr)
}

func (value *uiaExpandCollapsePattern) collapseOnce() error {
	hr, _, _ := syscall.SyscallN(value.vtbl.collapse, uintptr(unsafe.Pointer(value)))
	return uiaResult("IUIAutomationExpandCollapsePattern.Collapse", hr)
}

type uiaSelectionItemPattern struct {
	vtbl *uiaSelectionItemPatternVtbl
}

type uiaSelectionItemPatternVtbl struct {
	queryInterface               uintptr
	addRef                       uintptr
	release                      uintptr
	selectItem                   uintptr
	addToSelection               uintptr
	removeFromSelection          uintptr
	getCurrentIsSelected         uintptr
	getCurrentSelectionContainer uintptr
	getCachedIsSelected          uintptr
	getCachedSelectionContainer  uintptr
}

func (value *uiaSelectionItemPattern) release() {
	if value != nil && value.vtbl != nil {
		syscall.SyscallN(value.vtbl.release, uintptr(unsafe.Pointer(value)))
	}
}

func (value *uiaSelectionItemPattern) isSelected() (bool, error) {
	var result int32
	hr, _, _ := syscall.SyscallN(
		value.vtbl.getCurrentIsSelected,
		uintptr(unsafe.Pointer(value)),
		uintptr(unsafe.Pointer(&result)),
	)
	return result != 0, uiaResult("IUIAutomationSelectionItemPattern.get_CurrentIsSelected", hr)
}

func (value *uiaSelectionItemPattern) selectOnce() error {
	hr, _, _ := syscall.SyscallN(value.vtbl.selectItem, uintptr(unsafe.Pointer(value)))
	return uiaResult("IUIAutomationSelectionItemPattern.Select", hr)
}

type uiaTogglePattern struct {
	vtbl *uiaTogglePatternVtbl
}

type uiaTogglePatternVtbl struct {
	queryInterface        uintptr
	addRef                uintptr
	release               uintptr
	toggle                uintptr
	getCurrentToggleState uintptr
	getCachedToggleState  uintptr
}

func (value *uiaTogglePattern) release() {
	if value != nil && value.vtbl != nil {
		syscall.SyscallN(value.vtbl.release, uintptr(unsafe.Pointer(value)))
	}
}

func (value *uiaTogglePattern) state() (int32, error) {
	var result int32
	hr, _, _ := syscall.SyscallN(
		value.vtbl.getCurrentToggleState,
		uintptr(unsafe.Pointer(value)),
		uintptr(unsafe.Pointer(&result)),
	)
	return result, uiaResult("IUIAutomationTogglePattern.get_CurrentToggleState", hr)
}

func (value *uiaTogglePattern) toggleOnce() error {
	hr, _, _ := syscall.SyscallN(value.vtbl.toggle, uintptr(unsafe.Pointer(value)))
	return uiaResult("IUIAutomationTogglePattern.Toggle", hr)
}

func uiaInvokeFor(element *uiaElement) (*uiaInvokePattern, error) {
	var result *uiaInvokePattern
	err := element.pattern(uiaInvokePatternID, &uiaIIDInvokePattern, unsafe.Pointer(&result))
	if err != nil {
		if result != nil {
			result.release()
		}
		return nil, err
	}
	if result == nil {
		return nil, &uiaHRESULT{value: uiaNotSupported, where: "IUIAutomationInvokePattern"}
	}
	return result, nil
}

func uiaValueFor(element *uiaElement) (*uiaValuePattern, error) {
	var result *uiaValuePattern
	err := element.pattern(uiaValuePatternID, &uiaIIDValuePattern, unsafe.Pointer(&result))
	if err != nil {
		if result != nil {
			result.release()
		}
		return nil, err
	}
	if result == nil {
		return nil, &uiaHRESULT{value: uiaNotSupported, where: "IUIAutomationValuePattern"}
	}
	return result, nil
}

func uiaExpandCollapseFor(element *uiaElement) (*uiaExpandCollapsePattern, error) {
	var result *uiaExpandCollapsePattern
	err := element.pattern(uiaExpandCollapsePatternID, &uiaIIDExpandCollapsePattern, unsafe.Pointer(&result))
	if err != nil {
		if result != nil {
			result.release()
		}
		return nil, err
	}
	if result == nil {
		return nil, &uiaHRESULT{value: uiaNotSupported, where: "IUIAutomationExpandCollapsePattern"}
	}
	return result, nil
}

func uiaSelectionItemFor(element *uiaElement) (*uiaSelectionItemPattern, error) {
	var result *uiaSelectionItemPattern
	err := element.pattern(uiaSelectionItemPatternID, &uiaIIDSelectionItemPattern, unsafe.Pointer(&result))
	if err != nil {
		if result != nil {
			result.release()
		}
		return nil, err
	}
	if result == nil {
		return nil, &uiaHRESULT{value: uiaNotSupported, where: "IUIAutomationSelectionItemPattern"}
	}
	return result, nil
}

func uiaToggleFor(element *uiaElement) (*uiaTogglePattern, error) {
	var result *uiaTogglePattern
	err := element.pattern(uiaTogglePatternID, &uiaIIDTogglePattern, unsafe.Pointer(&result))
	if err != nil {
		if result != nil {
			result.release()
		}
		return nil, err
	}
	if result == nil {
		return nil, &uiaHRESULT{value: uiaNotSupported, where: "IUIAutomationTogglePattern"}
	}
	return result, nil
}

func uiaAllocBSTR(value string) (uintptr, error) {
	units := utf16.Encode([]rune(value))
	var source uintptr
	if len(units) != 0 {
		source = uintptr(unsafe.Pointer(&units[0]))
	}
	result, _, _ := uiaProcSysAllocStringLen.Call(source, uintptr(len(units)))
	runtime.KeepAlive(units)
	if result == 0 {
		return 0, fmt.Errorf("SysAllocStringLen failed")
	}
	return result, nil
}

func uiaFreeBSTR(value uintptr) {
	if value != 0 {
		uiaProcSysFreeString.Call(value)
	}
}

func uiaBSTRToString(value uintptr) string {
	if value == 0 {
		return ""
	}
	length, _, _ := uiaProcSysStringLen.Call(value)
	if length == 0 {
		return ""
	}
	units := unsafe.Slice((*uint16)(unsafe.Pointer(value)), int(length))
	return string(utf16.Decode(units))
}

func uiaDestroySafeArray(value uintptr) {
	if value != 0 {
		uiaProcSafeArrayDestroy.Call(value)
	}
}

func uiaSafeArrayBounds(value uintptr) (int32, int32, error) {
	if value == 0 {
		return 0, 0, fmt.Errorf("SAFEARRAY is nil")
	}
	dimensions, _, _ := uiaProcSafeArrayGetDim.Call(value)
	if dimensions != 1 {
		return 0, 0, fmt.Errorf("SAFEARRAY has %d dimensions, expected 1", dimensions)
	}
	var lower, upper int32
	hr, _, _ := uiaProcSafeArrayGetLBound.Call(value, 1, uintptr(unsafe.Pointer(&lower)))
	if err := uiaResult("SafeArrayGetLBound", hr); err != nil {
		return 0, 0, err
	}
	hr, _, _ = uiaProcSafeArrayGetUBound.Call(value, 1, uintptr(unsafe.Pointer(&upper)))
	if err := uiaResult("SafeArrayGetUBound", hr); err != nil {
		return 0, 0, err
	}
	if upper < lower {
		return lower, upper, nil
	}
	if int64(upper)-int64(lower) > 65535 {
		return 0, 0, fmt.Errorf("SAFEARRAY is unreasonably large")
	}
	return lower, upper, nil
}

func uiaSafeArrayInt32(value uintptr) ([]int32, error) {
	lower, upper, err := uiaSafeArrayBounds(value)
	if err != nil {
		return nil, err
	}
	if upper < lower {
		return []int32{}, nil
	}
	result := make([]int32, 0, int64(upper)-int64(lower)+1)
	for index := lower; index <= upper; index++ {
		var item int32
		at := index
		hr, _, _ := uiaProcSafeArrayGetElem.Call(value, uintptr(unsafe.Pointer(&at)), uintptr(unsafe.Pointer(&item)))
		if err := uiaResult("SafeArrayGetElement", hr); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, nil
}

func uiaSafeArrayFloat64(value uintptr) ([]float64, error) {
	lower, upper, err := uiaSafeArrayBounds(value)
	if err != nil {
		return nil, err
	}
	if upper < lower {
		return []float64{}, nil
	}
	result := make([]float64, 0, int64(upper)-int64(lower)+1)
	for index := lower; index <= upper; index++ {
		var bits uint64
		at := index
		hr, _, _ := uiaProcSafeArrayGetElem.Call(value, uintptr(unsafe.Pointer(&at)), uintptr(unsafe.Pointer(&bits)))
		if err := uiaResult("SafeArrayGetElement", hr); err != nil {
			return nil, err
		}
		result = append(result, math.Float64frombits(bits))
	}
	return result, nil
}

func uiaProcessStartTime(pid uint32) (uint64, error) {
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
	if err != nil {
		return 0, err
	}
	defer windows.CloseHandle(handle)
	var creation, exit, kernel, user windows.Filetime
	if err := windows.GetProcessTimes(handle, &creation, &exit, &kernel, &user); err != nil {
		return 0, err
	}
	return uint64(creation.HighDateTime)<<32 | uint64(creation.LowDateTime), nil
}

func uiaWindowPID(handle uintptr) (uint32, bool) {
	valid, _, _ := uiaProcIsWindow.Call(handle)
	if valid == 0 {
		return 0, false
	}
	var pid uint32
	uiaProcGetWindowPID.Call(handle, uintptr(unsafe.Pointer(&pid)))
	return pid, pid != 0
}

func uiaForegroundWindow() uintptr {
	handle, _, _ := uiaProcGetForeground.Call()
	return handle
}

func uiaForegroundPID() uint32 {
	handle := uiaForegroundWindow()
	if handle == 0 {
		return 0
	}
	pid, _ := uiaWindowPID(handle)
	return pid
}

func uiaWindowOwnedBy(candidate, root uintptr) bool {
	if candidate == 0 || root == 0 {
		return false
	}
	if candidate == root {
		return true
	}
	const (
		gaRootOwner = 3
		gwOwner     = 4
	)
	candidateRoot, _, _ := uiaProcGetAncestor.Call(candidate, gaRootOwner)
	rootRoot, _, _ := uiaProcGetAncestor.Call(root, gaRootOwner)
	if candidateRoot == 0 || rootRoot == 0 || candidateRoot != rootRoot {
		return false
	}
	current := candidate
	for depth := 0; depth < 32 && current != 0; depth++ {
		if current == root {
			return true
		}
		owner, _, _ := uiaProcGetWindow.Call(current, gwOwner)
		if owner == current {
			return false
		}
		current = owner
	}
	return false
}
