package automation

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"runtime"
	"sync"
	"time"

	"github.com/go-vgo/robotgo"
)

type Mouse struct {
	mu             sync.Mutex
	pressedButtons map[string]bool
	context        context.Context
}

const (
	darwinMouseEventSettleDelay = 50 * time.Millisecond
	mouseMoveFrameInterval      = 16 * time.Millisecond
	mouseMoveMaximumDurationMS  = 30000
	mouseMoveMaximumSteps       = 2000
)

type mouseMoveOptions struct {
	steps       int
	duration    time.Duration
	hasDuration bool
	curve       string
}

func NewMouse() *Mouse {
	return NewMouseWithContext(context.Background())
}

func NewMouseWithContext(ctx context.Context) *Mouse {
	if ctx == nil {
		ctx = context.Background()
	}
	return &Mouse{pressedButtons: make(map[string]bool), context: ctx}
}

func (m *Mouse) Click(x, y int, options interface{}) error {
	// fmt.Printf("Clicking at coordinates: x=%d, y=%d\n", x, y)

	// Initialize default options
	opts := MouseOptions{
		Button:     "left",
		ClickCount: 1, // 默认值为1
		Delay:      0,
	}

	// Parse options if provided
	if options != nil {
		if optMap, ok := options.(map[string]interface{}); ok {
			// 解析选项
			button, hasButton := optMap["button"]
			clickCount, hasClickCount := optMap["clickCount"]
			delay, hasDelay := optMap["delay"]

			// 如果未找到，尝试首字母大写的键
			if !hasButton {
				button, hasButton = optMap["Button"]
			}
			if !hasClickCount {
				clickCount, hasClickCount = optMap["ClickCount"]
			}
			if !hasDelay {
				delay, hasDelay = optMap["Delay"]
			}

			if hasButton {
				if buttonStr, ok := button.(string); ok {
					opts.Button = buttonStr
				}
			}
			if hasClickCount {
				switch v := clickCount.(type) {
				case int:
					opts.ClickCount = v
				case int64:
					opts.ClickCount = int(v)
				case float64:
					opts.ClickCount = int(v)
				case json.Number:
					if count, err := v.Int64(); err == nil {
						opts.ClickCount = int(count)
					}
				}
			}
			if hasDelay {
				switch v := delay.(type) {
				case int:
					opts.Delay = v
				case float64:
					opts.Delay = int(v)
				}
			}
		}
	}

	// Log the final options we'll use
	// fmt.Printf("Using options: Button=%s, ClickCount=%d, Delay=%d\n",
	// opts.Button, opts.ClickCount, opts.Delay)

	// Validate button type
	if !isValidButton(opts.Button) {
		return fmt.Errorf("invalid button type: %s", opts.Button)
	}

	// Handle single click case
	// On macOS, keep movement and the paired down/up in robotgo's native
	// MoveClick path. It includes the library's short pointer-settle interval
	// without leaving a long gap in which another application can take focus.
	if runtime.GOOS == "darwin" && opts.Delay == 0 && opts.ClickCount > 0 {
		for i := 0; i < opts.ClickCount; i++ {
			robotgo.MoveClick(x, y, opts.Button)
		}
		return nil
	}

	// Preserve the existing explicit down/wait/up semantics when a custom
	// delay is requested, and preserve the existing behavior on other systems.
	if err := m.Move(x, y, nil); err != nil {
		return fmt.Errorf("failed to move mouse: %v", err)
	}

	for i := 0; i < opts.ClickCount; i++ {
		if err := m.Down(map[string]interface{}{"button": opts.Button}); err != nil {
			return err
		}

		if opts.Delay > 0 {
			time.Sleep(time.Duration(opts.Delay) * time.Millisecond)
		}

		if err := m.Up(map[string]interface{}{"button": opts.Button}); err != nil {
			return err
		}
	}

	return nil
}

// Move sends pointer motion through the platform backend. Legacy steps-only
// calls keep their original one-millisecond sampling behavior. durationMs owns
// the full public call budget, including the bounded Quartz settle interval on
// macOS, so callers can compose it with an external timing budget.
func (m *Mouse) Move(x, y int, options interface{}) error {
	opts, err := parseMouseMoveOptions(options)
	if err != nil {
		return err
	}
	ctx := m.context
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return err
	}

	pressedButton := m.dragButtonForMove()
	moveStep := func(nextX, nextY int) {
		if runtime.GOOS == "darwin" && pressedButton != "" {
			// robotgo.Move emits kCGEventMouseMoved even while a button is
			// down. AppKit and WebKit therefore never observe mouseDragged:.
			// Emit the button-specific drag event promised by mouse.down →
			// mouse.move → mouse.up on macOS.
			robotgo.Drag(nextX, nextY, pressedButton)
			return
		}
		robotgo.MoveMouse(nextX, nextY)
	}

	if opts.hasDuration {
		return m.moveOverDuration(ctx, x, y, opts, moveStep)
	}

	if opts.steps > 1 {
		currentX, currentY := robotgo.GetMousePos()
		for step := 1; step <= opts.steps; step++ {
			nextX, nextY := mouseMovePoint(currentX, currentY, x, y, step, opts.steps, opts.curve, false)
			moveStep(nextX, nextY)
			if err := mouseWait(ctx, time.Millisecond); err != nil {
				return err
			}
		}
	} else {
		moveStep(x, y)
	}
	if runtime.GOOS == "darwin" {
		// CGEventPost is asynchronous. Keep the public await boundary behind one
		// short bounded interval so a following down/up or keyboard call cannot overtake
		// the posted move in AppKit/WebKit's input handling.
		return mouseWait(ctx, darwinMouseEventSettleDelay)
	}

	return nil
}

func parseMouseMoveOptions(options interface{}) (mouseMoveOptions, error) {
	parsed := mouseMoveOptions{steps: 1, curve: "linear"}
	if options == nil {
		return parsed, nil
	}

	var optMap map[string]interface{}
	switch value := options.(type) {
	case map[string]interface{}:
		optMap = value
	case MouseOptions:
		parsed.steps = value.Steps
		if parsed.steps == 0 {
			parsed.steps = 1
		}
		if value.DurationMS != 0 {
			parsed.duration = time.Duration(value.DurationMS) * time.Millisecond
			parsed.hasDuration = true
		}
		if value.Curve != "" {
			parsed.curve = value.Curve
		}
	default:
		return parsed, nil
	}

	if optMap != nil {
		stepsValue, hasSteps := optMap["steps"]
		if hasSteps {
			parsed.steps = jsToInt(stepsValue)
		}
		if duration, ok := optMap["durationMs"]; ok {
			durationMS, ok := mouseMoveInteger(duration)
			if !ok || durationMS < 1 || durationMS > mouseMoveMaximumDurationMS {
				return parsed, fmt.Errorf("mouse.move options.durationMs must be an integer from 1 to %d", mouseMoveMaximumDurationMS)
			}
			parsed.duration = time.Duration(durationMS) * time.Millisecond
			parsed.hasDuration = true
		}
		if curve, ok := optMap["curve"]; ok {
			curveName, ok := curve.(string)
			if !ok {
				return parsed, fmt.Errorf("mouse.move options.curve must be \"linear\" or \"easeInOut\"")
			}
			parsed.curve = curveName
		}
		if parsed.hasDuration && hasSteps {
			steps, ok := mouseMoveInteger(stepsValue)
			if !ok || steps < 2 || steps > mouseMoveMaximumSteps {
				return parsed, fmt.Errorf("mouse.move options.steps must be an integer from 2 to %d when durationMs is set", mouseMoveMaximumSteps)
			}
			parsed.steps = steps
		}
	}

	if parsed.curve != "linear" && parsed.curve != "easeInOut" {
		return parsed, fmt.Errorf("mouse.move options.curve must be \"linear\" or \"easeInOut\"")
	}
	if parsed.hasDuration {
		durationMS := parsed.duration / time.Millisecond
		if parsed.duration%time.Millisecond != 0 || durationMS < 1 || durationMS > mouseMoveMaximumDurationMS {
			return parsed, fmt.Errorf("mouse.move options.durationMs must be an integer from 1 to %d", mouseMoveMaximumDurationMS)
		}
		if parsed.steps > mouseMoveMaximumSteps {
			return parsed, fmt.Errorf("mouse.move options.steps must not exceed %d when durationMs is set", mouseMoveMaximumSteps)
		}
	}
	return parsed, nil
}

func mouseMoveInteger(value interface{}) (int, bool) {
	switch item := value.(type) {
	case int:
		return item, true
	case int8:
		return int(item), true
	case int16:
		return int(item), true
	case int32:
		return int(item), true
	case int64:
		if int64(int(item)) != item {
			return 0, false
		}
		return int(item), true
	case uint:
		if uint(int(item)) != item {
			return 0, false
		}
		return int(item), true
	case uint8:
		return int(item), true
	case uint16:
		return int(item), true
	case uint32:
		if uint32(int(item)) != item {
			return 0, false
		}
		return int(item), true
	case uint64:
		if uint64(int(item)) != item {
			return 0, false
		}
		return int(item), true
	case float32:
		value := float64(item)
		return int(value), !math.IsNaN(value) && !math.IsInf(value, 0) && value == math.Trunc(value)
	case float64:
		return int(item), !math.IsNaN(item) && !math.IsInf(item, 0) && item == math.Trunc(item)
	case json.Number:
		integer, err := item.Int64()
		if err != nil || int64(int(integer)) != integer {
			return 0, false
		}
		return int(integer), true
	default:
		return 0, false
	}
}

func (m *Mouse) moveOverDuration(ctx context.Context, x, y int, opts mouseMoveOptions, moveStep func(int, int)) error {
	startedAt := time.Now()
	activeDuration := opts.duration
	if runtime.GOOS == "darwin" {
		activeDuration -= darwinMouseEventSettleDelay
		if activeDuration < 0 {
			activeDuration = 0
		}
	}

	currentX, currentY := robotgo.GetMousePos()
	if activeDuration == 0 {
		moveStep(x, y)
		return mouseWaitUntil(ctx, startedAt.Add(opts.duration))
	}

	steps := opts.steps
	if steps <= 1 {
		steps = int((activeDuration + mouseMoveFrameInterval - 1) / mouseMoveFrameInterval)
		if steps < 2 {
			steps = 2
		}
		if steps > mouseMoveMaximumSteps {
			steps = mouseMoveMaximumSteps
		}
	}
	for step := 1; step <= steps; step++ {
		deadline := startedAt.Add(time.Duration(step) * activeDuration / time.Duration(steps))
		if err := mouseWaitUntil(ctx, deadline); err != nil {
			return err
		}
		nextX, nextY := mouseMovePoint(currentX, currentY, x, y, step, steps, opts.curve, true)
		moveStep(nextX, nextY)
	}
	if runtime.GOOS == "darwin" {
		return mouseWaitUntil(ctx, startedAt.Add(opts.duration))
	}
	return nil
}

func mouseMovePoint(startX, startY, endX, endY, step, steps int, curve string, rounded bool) (int, int) {
	if step >= steps {
		return endX, endY
	}
	progress := float64(step) / float64(steps)
	if curve == "easeInOut" {
		progress = progress * progress * (3 - 2*progress)
	}
	if !rounded && curve == "linear" {
		return startX + ((endX - startX) * step / steps), startY + ((endY - startY) * step / steps)
	}
	return startX + int(math.Round(float64(endX-startX)*progress)), startY + int(math.Round(float64(endY-startY)*progress))
}

func mouseWait(ctx context.Context, duration time.Duration) error {
	return mouseWaitUntil(ctx, time.Now().Add(duration))
}

func mouseWaitUntil(ctx context.Context, deadline time.Time) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	remaining := time.Until(deadline)
	if remaining <= 0 {
		return nil
	}
	timer := time.NewTimer(remaining)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

// Down implements mouse button down
func (m *Mouse) Down(options interface{}) error {
	opts := MouseOptions{
		Button: "left",
	}

	if options != nil {
		if optMap, ok := options.(map[string]interface{}); ok {
			if button, ok := optMap["button"].(string); ok {
				opts.Button = button
			}
		}
	}

	if !isValidButton(opts.Button) {
		return fmt.Errorf("invalid button type: %s", opts.Button)
	}

	robotgo.Toggle(opts.Button, "down")
	m.setButtonPressed(opts.Button, true)
	if runtime.GOOS == "darwin" {
		// The next mouse.move must not be posted before the target has observed
		// this button transition; otherwise Quartz can collapse the sequence into
		// a click even though drag-typed motion events follow.
		time.Sleep(darwinMouseEventSettleDelay)
	}
	return nil
}

// Up implements mouse button release
func (m *Mouse) Up(options interface{}) error {
	opts := MouseOptions{
		Button: "left",
	}

	if options != nil {
		if optMap, ok := options.(map[string]interface{}); ok {
			if button, ok := optMap["button"].(string); ok {
				opts.Button = button
			}
		}
	}

	if !isValidButton(opts.Button) {
		return fmt.Errorf("invalid button type: %s", opts.Button)
	}

	robotgo.Toggle(opts.Button, "up")
	m.setButtonPressed(opts.Button, false)
	if runtime.GOOS == "darwin" {
		// Preserve the ordering promised by await mouse.up() before the caller can
		// submit a keyboard event or inspect the target application's result.
		time.Sleep(darwinMouseEventSettleDelay)
	}
	return nil
}

func (m *Mouse) setButtonPressed(button string, pressed bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.pressedButtons == nil {
		m.pressedButtons = make(map[string]bool)
	}
	if pressed {
		m.pressedButtons[button] = true
	} else {
		delete(m.pressedButtons, button)
	}
}

func (m *Mouse) pressedButton() string {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, button := range []string{"left", "right", "middle"} {
		if m.pressedButtons[button] {
			return button
		}
	}
	return ""
}

func (m *Mouse) dragButtonForMove() string {
	if runtime.GOOS != "darwin" {
		return ""
	}
	return m.pressedButton()
}

// GetPos returns the current mouse position with additional screen context
func (m *Mouse) GetPos() map[string]interface{} {
	x, y := robotgo.GetMousePos()

	return map[string]interface{}{
		"x": x,
		"y": y,
	}
}

func isValidButton(button string) bool {
	validButtons := map[string]bool{
		"left":   true,
		"right":  true,
		"middle": true,
	}
	return validButtons[button]
}

// MouseWheelOptions defines options for mouse wheel scrolling
type MouseWheelOptions struct {
	DeltaX int // 水平滚动距离
	DeltaY int // 垂直滚动距离
	Steps  int // 滚动的步数，用于实现平滑滚动
	Delay  int // 每步之间的延迟(毫秒)
}

func (m *Mouse) Wheel(options interface{}) error {
	// 默认选项
	opts := MouseWheelOptions{
		DeltaX: 0,
		DeltaY: 0,
		Steps:  1,
		Delay:  0,
	}

	// 解析选项
	if options != nil {
		if optMap, ok := options.(map[string]interface{}); ok {
			if dy, ok := optMap["deltaY"]; ok {
				opts.DeltaY = jsToInt(dy)
			}
			if dx, ok := optMap["deltaX"]; ok {
				opts.DeltaX = jsToInt(dx)
			}
			if steps, ok := optMap["steps"]; ok {
				opts.Steps = jsToInt(steps)
			}
			if delay, ok := optMap["delay"]; ok {
				opts.Delay = jsToInt(delay)
			}
		}
	}

	if opts.Steps <= 0 {
		opts.Steps = 1
	}

	stepDeltaX := opts.DeltaX / opts.Steps
	stepDeltaY := opts.DeltaY / opts.Steps
	remainX := opts.DeltaX % opts.Steps
	remainY := opts.DeltaY % opts.Steps

	for i := 0; i < opts.Steps; i++ {
		dx := stepDeltaX
		dy := stepDeltaY
		if i == opts.Steps-1 {
			dx += remainX
			dy += remainY
		}
		if dx != 0 || dy != 0 {
			// Scroll expects deltas. ScrollRelative first adds the current mouse
			// coordinates and is intended for pointer movement, not wheel input.
			// Quartz directions are the inverse of DOM WheelEvent deltas: invert
			// once here so positive values consistently mean right/down.
			robotgo.Scroll(-dx, -dy)
		}
		if opts.Delay > 0 {
			time.Sleep(time.Duration(opts.Delay) * time.Millisecond)
		}
	}

	return nil
}
