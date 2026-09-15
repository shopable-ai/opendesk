package automation

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"unicode/utf8"
)

// This is a lowering pass owned by the existing Recorder generator, not an
// alternative actions schema, locator runtime, or source-code interpreter.
const recorderSemanticCandidateFormatVersion = "opendesk.recorder.semantic-candidate/v1"

type recorderSemanticStep struct {
	action   recorderAction
	window   string
	query    map[string]string
	text     string
	selector map[string]string
	basis    string
}

func recorderSemanticBlocked(actionID, reason string) error {
	return recorderError(RecorderGenerationBlocked, "Recorder.generateScript",
		fmt.Sprintf("semantic generation blocked at %s: %s; retain recording/actions evidence for review", actionID, reason), nil)
}

func recorderSemanticWindow(action recorderAction) (string, map[string]string, error) {
	if action.Target == nil || action.Target.Kind != "window" || action.Target.Window == nil {
		return "", nil, recorderSemanticBlocked(action.ID, "a verified application/window target is required")
	}
	win := action.Target.Window
	query := map[string]string{"title": win.Title}
	switch win.Application.IdentityKind {
	case "executable-path":
		query["exePath"] = win.Application.IdentityValue
	case "executable-name":
		query["exeName"] = win.Application.IdentityValue
	default:
		return "", nil, recorderSemanticBlocked(action.ID, "unsupported application identity")
	}
	if strings.TrimSpace(win.Title) == "" || strings.TrimSpace(win.Application.IdentityValue) == "" {
		return "", nil, recorderSemanticBlocked(action.ID, "application identity and exact title must be present")
	}
	// Recorded IDs separate observed windows only. They never enter source as
	// cross-execution identities or replace a fresh exact window.get().
	key, _ := json.Marshal([]any{win.ID, win.Handle, win.Application.IdentityKind, win.Application.IdentityValue, win.Title})
	return string(key), query, nil
}

func recorderSemanticLabelKey(action recorderAction) string {
	if action.Target == nil || action.Target.Element == nil || action.Target.Window == nil {
		return ""
	}
	win, _, err := recorderSemanticWindow(action)
	if err != nil {
		return ""
	}
	key, _ := json.Marshal([]string{win, action.Target.Element.Name})
	return string(key)
}

func recorderSemanticControlKey(element *recorderElementSnapshot) string {
	// A known identifier is stronger than recorded geometry. Without one,
	// distinct recorded element bounds conservatively require disambiguation.
	if element.Identifier != "" {
		key, _ := json.Marshal([]string{element.Role, element.Identifier})
		return string(key)
	}
	key, _ := json.Marshal([]any{element.Role, element.Bounds})
	return string(key)
}

func recorderPlanSemanticSteps(actions recorderActions) ([]recorderSemanticStep, error) {
	if actions.Readiness != "ready" || len(actions.Actions) == 0 {
		return nil, recorderSemanticBlocked("recording", "semantic output requires a complete ready action sequence")
	}
	labels := make(map[string]map[string]bool)
	roles := make(map[string]map[string]map[string]bool)
	for _, action := range actions.Actions {
		if action.Kind != "click" || action.Target == nil || action.Target.Element == nil {
			continue
		}
		element := action.Target.Element
		key := recorderSemanticLabelKey(action)
		if labels[key] == nil {
			labels[key] = make(map[string]bool)
			roles[key] = make(map[string]map[string]bool)
		}
		control := recorderSemanticControlKey(element)
		labels[key][control] = true
		if roles[key][element.Role] == nil {
			roles[key][element.Role] = make(map[string]bool)
		}
		roles[key][element.Role][control] = true
	}
	steps := make([]recorderSemanticStep, 0, len(actions.Actions))
	for _, action := range actions.Actions {
		window, query, err := recorderSemanticWindow(action)
		if err != nil {
			return nil, err
		}
		step := recorderSemanticStep{action: action, window: window, query: query}
		switch action.Kind {
		case "click":
			element := action.Target.Element
			if action.Args.Button != "left" || action.Args.ClickCount != 1 ||
				action.Target.SemanticStatus != "verified" || element == nil ||
				element.Source != "accessibility" || element.Enabled == nil || !*element.Enabled {
				return nil, recorderSemanticBlocked(action.ID, "single activation lacks verified enabled semantic evidence")
			}
			if !accessibilityRoles[element.Role] || utf8.RuneCountInString(element.Name) > accessibilityMaximumSelectorRunes || utf8.RuneCountInString(element.Identifier) > accessibilityMaximumSelectorRunes {
				return nil, recorderSemanticBlocked(action.ID, "recorded identity is outside the public selector contract")
			}
			invokable := false
			for _, native := range element.NativeActions {
				if native == "AXPress" || native == "invoke" {
					invokable = true
				}
			}
			if !invokable {
				return nil, recorderSemanticBlocked(action.ID, "recorded native actions do not prove invoke support")
			}
			labelKey := recorderSemanticLabelKey(action)
			if strings.TrimSpace(element.Name) != "" && element.Role == "button" && len(labels[labelKey]) == 1 {
				// A semantic candidate deliberately expresses activation by label.
				// The label is real AX/UIA evidence, NOT a fabricated OCR reading.
				// This target-level snapshot only says that recording found no known
				// competing control. Unknown runtime collisions fail closed and
				// require fresh Runtime uniqueness checking and qualification.
				step.text = element.Name
				step.basis = "recorded-button-label; runtime-uniqueness-required"
			} else {
				step.selector = map[string]string{"role": element.Role}
				if strings.TrimSpace(element.Name) != "" {
					step.selector["name"] = element.Name
				}
				if strings.TrimSpace(element.Identifier) != "" {
					step.selector["identifier"] = element.Identifier
				}
				if len(step.selector) == 1 || (element.Identifier == "" && len(roles[labelKey][element.Role]) > 1) {
					return nil, recorderSemanticBlocked(action.ID, "recorded target cannot be disambiguated without coordinates")
				}
				step.basis = "recorded-semantic-constraints"
			}
		case "key", "shortcut":
			step.basis = "recorded-physical-key-with-exact-active-window-guard"
		case "text-edit":
			if action.Target.Editable == nil || action.Args.TextEdit == nil {
				return nil, recorderSemanticBlocked(action.ID, "focused text edit evidence is incomplete")
			}
			step.basis = "existing-hash-guarded-focused-text-edit"
		default:
			return nil, recorderSemanticBlocked(action.ID, "no qualified semantic lowering for "+action.Kind+"; explicit basic mode remains a separate physical-replay contract")
		}
		steps = append(steps, step)
	}
	return steps, nil
}

func recorderSemanticGap(previous, current recorderAction, raw []recorderRawEvent, timing recorderGenerationTiming) (uint64, bool) {
	if recorderHasPauseBoundary(raw, recorderNativeStringValue(previous.Timing.SequenceEnd), recorderNativeStringValue(current.Timing.SequenceStart)) {
		return 0, true
	}
	end := recorderActionTimeMilliseconds(previous.Timing.NativeEnd, previous.Timing.NativeUnit)
	start := recorderActionTimeMilliseconds(current.Timing.NativeStart, current.Timing.NativeUnit)
	var gap uint64
	if start > end {
		gap = start - end
	}
	gap = uint64(math.Round(float64(gap) / timing.SpeedMultiplier))
	if gap < timing.MinimumDelayMS {
		gap = timing.MinimumDelayMS
	}
	if gap > timing.MaximumDelayMS {
		gap = timing.MaximumDelayMS
	}
	return gap, false
}

func recorderGenerateSemanticSource(actions recorderActions, raw []recorderRawEvent, timing recorderGenerationTiming, pointerMotion string) ([]byte, []recorderCandidateMapping, []string, error) {
	if pointerMotion != recorderDefaultPointerMotion {
		return nil, nil, nil, recorderSemanticBlocked("options", "pointerMotion smooth belongs to explicit basic replay")
	}
	steps, err := recorderPlanSemanticSteps(actions)
	if err != nil {
		return nil, nil, nil, err
	}
	var out strings.Builder
	line := 1
	write := func(text string) { out.WriteString(text); line += strings.Count(text, "\n") }
	jsonSource := func(value any) string { data, _ := json.Marshal(value); return string(data) }
	write("// Recorder semantic candidate. Independent business qualification: not-run.\n")
	write("// Evidence and action-to-step mappings remain in the pinned actions/candidate files.\n")
	write(fmt.Sprintf("if (System.getPlatformInfo().os !== %s) throw new Error(\"Recorder candidate platform mismatch\");\n", jsonSource(actions.Environment.Platform)))
	hasKeys, hasEdit := false, false
	for _, step := range steps {
		hasKeys = hasKeys || step.action.Kind == "key" || step.action.Kind == "shortcut" || step.action.Kind == "text-edit"
		hasEdit = hasEdit || step.action.Kind == "text-edit"
	}
	if hasKeys {
		write("async function __recorderRequireResolvedActiveWindow(expected) {\n")
		write("  const current = await window.current(expected);\n")
		write("  const active = await window.getActiveWindow();\n")
		write("  if (!current.id || current.id !== expected.id || current.pid !== expected.pid || current.title !== expected.title || current.id !== active.id || current.pid !== active.pid) throw new Error(\"Recorder candidate active window mismatch\");\n")
		write("  return current;\n}\n")
	}
	if hasEdit {
		// Preserve the existing before/after UTF-16 hash, focus, native ref and
		// unknown-action contract. UI.setValue alone does not express that edit.
		write(recorderGeneratedTextEditHelpers)
	}
	windows := make(map[string]string)
	mappings := make([]recorderCandidateMapping, 0, len(steps))
	for index := 0; index < len(steps); {
		step := steps[index]
		if index > 0 {
			gap, _ := recorderSemanticGap(steps[index-1].action, step.action, raw, timing)
			if gap > 0 {
				write(fmt.Sprintf("await sleep(%d);\n", gap))
			}
		}
		window := windows[step.window]
		if window == "" {
			window = fmt.Sprintf("targetWindow%d", len(windows)+1)
			windows[step.window] = window
			write(fmt.Sprintf("const %s = await window.get(%s);\n", window, jsonSource(step.query)))
		}
		if step.action.Kind == "click" {
			end := index + 1
			var interval uint64
			for end < len(steps) && end-index < 256 && steps[end].action.Kind == "click" && steps[end].window == step.window {
				gap, boundary := recorderSemanticGap(steps[end-1].action, steps[end].action, raw, timing)
				if boundary || (end > index+1 && gap != interval) {
					break
				}
				interval = gap
				end++
			}
			allText := true
			targets := make([]any, 0, end-index)
			for _, item := range steps[index:end] {
				if item.selector == nil {
					targets = append(targets, item.text)
				} else {
					allText = false
					targets = append(targets, item.selector)
				}
			}
			api := "UI.tapTargets"
			if allText {
				api = "UI.tapTexts"
			}
			options := "{ within: " + window
			if end-index > 1 && interval != 300 {
				options += fmt.Sprintf(", intervalMs: %d", interval)
			}
			options += " }"
			for offset, item := range steps[index:end] {
				stepIndex := offset
				mappings = append(mappings, recorderCandidateMapping{ActionID: item.action.ID, Line: line, API: api, StepIndex: &stepIndex, Basis: item.basis})
			}
			write(fmt.Sprintf("await %s(%s, %s);\n", api, jsonSource(targets), options))
			index = end
			continue
		}
		write(fmt.Sprintf("const currentWindow%d = await __recorderRequireResolvedActiveWindow(%s);\n", index+1, window))
		api := ""
		source := ""
		switch step.action.Kind {
		case "key", "shortcut":
			api = "keyboard.press"
			argument := jsonSource(step.action.Args.Key)
			if step.action.Kind == "shortcut" {
				api = "keyboard.combination"
				argument = "..." + jsonSource(step.action.Args.Keys)
			}
			count, _ := recorderEffectiveKeyRepeatCount(step.action.Args.RepeatCount)
			if count == 1 {
				source = fmt.Sprintf("await %s(%s);\n", api, argument)
			} else {
				source = fmt.Sprintf("for (let repeat = 0; repeat < %d; repeat += 1) {\n  await __recorderRequireResolvedActiveWindow(%s);\n  await %s(%s);\n}\n", count, window, api, argument)
			}
		case "text-edit":
			api = "Accessibility.perform"
			element := step.action.Target.Editable
			selector := map[string]string{"role": element.Role}
			if element.Identifier != "" {
				selector["identifier"] = element.Identifier
			} else if element.Name != "" {
				selector["name"] = element.Name
			}
			source = fmt.Sprintf("await __recorderApplyTextEdit(currentWindow%d, %s, %s);\n", index+1, jsonSource(selector), jsonSource(step.action.Args.TextEdit))
		}
		mappings = append(mappings, recorderCandidateMapping{ActionID: step.action.ID, Line: line, API: api, Basis: step.basis})
		write(source)
		index++
	}
	constraints := []string{
		"semantic candidate only: not-run; generated source is not business or visual qualification",
		"actions remain immutable recording facts; their strategy fields do not mandate generated APIs",
		"named button activation is lowered to text only when target-level Accessibility evidence has no known competing control; native names are not claimed to be OCR observations",
		"target-level Recorder evidence does not prove whole-window uniqueness; Runtime uniqueness, scope, authorization and state checks remain mandatory; newly discovered collisions require repair, never index-first selection",
		"native semantic activation does not promise physical mouse events, hover paths or pointer placement; explicit basic mode preserves that separate contract",
		"known ambiguity retains minimal role/name/identifier predicates; unresolved ambiguity and unsupported actions block the entire candidate",
		"each recorded application/window is freshly and exactly resolved in this execution; title failure never widens scope",
		"batching preserves ordered actions, effective timing, window boundaries and pause boundaries; mappings retain per-call step indices",
		"Runtime owns OCR/native resolution and reference cleanup; generated source does not include backend fallback policy",
		"input acknowledgement is not business success; reads, parameterization and downstream data dependencies require the approved Human-to-Recipe business plan",
	}
	return []byte(out.String()), mappings, constraints, nil
}
