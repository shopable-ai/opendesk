package toolbar

import (
	"fmt"
	"math"
	"strings"
	"unicode/utf8"
)

const (
	ControlHeight         = ContentItemHeight
	MinControlWidth       = 80
	MinCompactSwitchWidth = 48
	MaxControlWidth       = 360
	DefaultToggleWidth    = 140
	DefaultInputWidth     = 180
	DefaultSelectWidth    = 160
	DefaultSliderWidth    = 180
	DefaultSegmentWidth   = 200
	DefaultProgressWidth  = 160
	MaxControlLabelRunes  = 60
	MaxControlTextRunes   = 256
	MaxPlaceholderRunes   = 120
	MaxOptions            = 12
	MaxOptionRunes        = 40
	MaxBadgeRunes         = 4
)

// OptionSpec is a bounded choice exposed by Select or SegmentedControl.
type OptionSpec struct {
	Value string `json:"value"`
	Label string `json:"label"`
}

// ControlSpec is a discriminated native toolbar control. Kind determines the
// fields that are meaningful; Normalize and the native host reject every
// invalid combination independently. Width and all option/range geometry are
// immutable after the first show.
type ControlSpec struct {
	ID            string       `json:"id"`
	Kind          string       `json:"kind"`
	Label         string       `json:"label"`
	Width         float64      `json:"width"`
	Disabled      bool         `json:"disabled"`
	Checked       bool         `json:"checked"`
	Text          string       `json:"text"`
	Placeholder   string       `json:"placeholder"`
	MaxLength     int          `json:"maxLength"`
	Selected      string       `json:"selected"`
	Options       []OptionSpec `json:"options"`
	Min           float64      `json:"min"`
	Max           float64      `json:"max"`
	Step          float64      `json:"step"`
	Value         float64      `json:"value"`
	Indeterminate bool         `json:"indeterminate"`
	Revision      uint64       `json:"revision"`
}

// ControlResult is native readback from the real AppKit peer.
type ControlResult struct {
	ControlSpec
	RenderedValue        any    `json:"renderedValue"`
	AccessibilityName    string `json:"accessibilityName"`
	AccessibilityRole    string `json:"accessibilityRole"`
	AccessibilitySubrole string `json:"accessibilitySubrole"`
	AccessibilityValue   any    `json:"accessibilityValue"`
	Focused              bool   `json:"focused"`
	LocalBounds          Bounds `json:"localBounds"`
	ScreenBounds         Bounds `json:"screenBounds"`
}

func IsControlItemType(value string) bool {
	switch value {
	case ItemSwitch, ItemCheckbox, ItemInput, ItemSelect, ItemSlider, ItemSegmented, ItemProgress:
		return true
	default:
		return false
	}
}

func IsInteractiveControlType(value string) bool {
	return value != ItemProgress && IsControlItemType(value)
}

func IsChoiceControlType(value string) bool { return value == ItemSelect || value == ItemSegmented }

func IsToggleControlType(value string) bool { return value == ItemSwitch || value == ItemCheckbox }

// SameControlDeclaration verifies the fields that determine native identity,
// geometry, and bounded resources. Runtime updates may change only the
// kind-specific mutable value/presentation fields.
func SameControlDeclaration(current, next ControlSpec) bool {
	if current.ID != next.ID || current.Kind != next.Kind || current.Label != next.Label || current.Width != next.Width {
		return false
	}
	switch current.Kind {
	case ItemInput:
		return current.MaxLength == next.MaxLength
	case ItemSelect, ItemSegmented:
		if len(current.Options) != len(next.Options) {
			return false
		}
		for index := range current.Options {
			if current.Options[index] != next.Options[index] {
				return false
			}
		}
		return true
	case ItemSlider:
		return current.Min == next.Min && current.Max == next.Max && current.Step == next.Step
	case ItemProgress:
		return current.Min == next.Min && current.Max == next.Max
	default:
		return true
	}
}

func ValidateBadge(value string) error {
	if value == "" {
		return nil
	}
	if strings.TrimSpace(value) != value || strings.ContainsAny(value, "\r\n\t") || utf8.RuneCountInString(value) > MaxBadgeRunes {
		return fmt.Errorf("button badge must contain 1 to %d compact Unicode characters", MaxBadgeRunes)
	}
	return nil
}

func ValidateControlSpec(control ControlSpec) error {
	if !IsControlItemType(control.Kind) {
		return fmt.Errorf("toolbar control kind is invalid")
	}
	if strings.TrimSpace(control.Label) == "" || utf8.RuneCountInString(control.Label) > MaxControlLabelRunes {
		return fmt.Errorf("control label must contain 1 to %d Unicode characters", MaxControlLabelRunes)
	}
	minimumWidth := MinControlWidth
	if control.Kind == ItemSwitch {
		minimumWidth = MinCompactSwitchWidth
	}
	if !finiteControlNumber(control.Width) || control.Width < float64(minimumWidth) || control.Width > MaxControlWidth {
		return fmt.Errorf("control width must be between %d and %d", minimumWidth, MaxControlWidth)
	}
	if control.Revision == 0 {
		return fmt.Errorf("control revision must be positive")
	}
	switch control.Kind {
	case ItemSwitch, ItemCheckbox:
		if control.Text != "" || control.Placeholder != "" || control.MaxLength != 0 || control.Selected != "" || len(control.Options) != 0 || control.Min != 0 || control.Max != 0 || control.Step != 0 || control.Value != 0 || control.Indeterminate {
			return fmt.Errorf("toggle control contains fields for another control kind")
		}
	case ItemInput:
		if utf8.RuneCountInString(control.Text) > MaxControlTextRunes || utf8.RuneCountInString(control.Placeholder) > MaxPlaceholderRunes || control.MaxLength < 1 || control.MaxLength > MaxControlTextRunes || utf8.RuneCountInString(control.Text) > control.MaxLength {
			return fmt.Errorf("input value, placeholder, or maxLength is invalid")
		}
		if control.Checked || control.Selected != "" || len(control.Options) != 0 || control.Min != 0 || control.Max != 0 || control.Step != 0 || control.Value != 0 || control.Indeterminate {
			return fmt.Errorf("input contains fields for another control kind")
		}
	case ItemSelect, ItemSegmented:
		if err := validateOptions(control.Options, control.Selected); err != nil {
			return err
		}
		if control.Checked || control.Text != "" || control.Placeholder != "" || control.MaxLength != 0 || control.Min != 0 || control.Max != 0 || control.Step != 0 || control.Value != 0 || control.Indeterminate {
			return fmt.Errorf("choice control contains fields for another control kind")
		}
	case ItemSlider:
		if !finiteControlNumber(control.Min) || !finiteControlNumber(control.Max) || !finiteControlNumber(control.Step) || !finiteControlNumber(control.Value) || control.Min >= control.Max || control.Step <= 0 || control.Step > control.Max-control.Min || control.Value < control.Min || control.Value > control.Max {
			return fmt.Errorf("slider range, step, or value is invalid")
		}
		if control.Checked || control.Text != "" || control.Placeholder != "" || control.MaxLength != 0 || control.Selected != "" || len(control.Options) != 0 || control.Indeterminate {
			return fmt.Errorf("slider contains fields for another control kind")
		}
	case ItemProgress:
		if !finiteControlNumber(control.Min) || !finiteControlNumber(control.Max) || !finiteControlNumber(control.Value) || control.Min >= control.Max || control.Value < control.Min || control.Value > control.Max {
			return fmt.Errorf("progress range or value is invalid")
		}
		if control.Disabled || control.Checked || control.Text != "" || control.Placeholder != "" || control.MaxLength != 0 || control.Selected != "" || len(control.Options) != 0 || control.Step != 0 {
			return fmt.Errorf("progress contains fields for another control kind")
		}
	}
	return nil
}

func validateOptions(options []OptionSpec, selected string) error {
	if len(options) < 2 || len(options) > MaxOptions {
		return fmt.Errorf("choice control requires between 2 and %d options", MaxOptions)
	}
	seen := make(map[string]struct{}, len(options))
	selectedFound := false
	for _, option := range options {
		if strings.TrimSpace(option.Value) == "" || utf8.RuneCountInString(option.Value) > MaxOptionRunes || strings.TrimSpace(option.Label) == "" || utf8.RuneCountInString(option.Label) > MaxOptionRunes {
			return fmt.Errorf("choice option value and label must contain 1 to %d Unicode characters", MaxOptionRunes)
		}
		if _, exists := seen[option.Value]; exists {
			return fmt.Errorf("choice option values must be unique")
		}
		seen[option.Value] = struct{}{}
		selectedFound = selectedFound || option.Value == selected
	}
	if !selectedFound {
		return fmt.Errorf("choice value must match one declared option")
	}
	return nil
}

func finiteControlNumber(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }
