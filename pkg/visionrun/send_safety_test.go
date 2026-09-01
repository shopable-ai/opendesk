package visionrun

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRunSendSafetyRemainsBlockedWithoutDraftEvidence(t *testing.T) {
	repoRoot := t.TempDir()
	preflightPath := filepath.Join(repoRoot, ".runtime", "preflight", "current", "latest.json")
	mustWriteJSON(t, preflightPath, map[string]any{
		"schemaVersion": "0.1.0",
		"status":        "warn",
	})

	sourceImage := filepath.Join(repoRoot, "fixtures", "layout.png")
	mustWriteSyntheticLayoutPNG(t, sourceImage)

	bundle, err := InitBundle(InitOptions{
		RepoRoot:      repoRoot,
		RunID:         "send-safety",
		PreflightPath: preflightPath,
	})
	if err != nil {
		t.Fatalf("InitBundle failed: %v", err)
	}

	if _, err := RunDetect(bundle, DetectOptions{SourceImagePath: sourceImage}); err != nil {
		t.Fatalf("RunDetect failed: %v", err)
	}
	if _, err := RunInfer(bundle, InferOptions{}); err != nil {
		t.Fatalf("RunInfer failed: %v", err)
	}

	mustWriteJSON(t, bundle.RuntimePreflight, map[string]any{
		"schemaVersion": schemaVersion,
		"status":        "pass",
		"canProbe":      true,
		"canSend":       true,
	})

	result, err := RunSendSafety(bundle, SendSafetyOptions{})
	if err != nil {
		t.Fatalf("RunSendSafety failed: %v", err)
	}
	if result.Allowed {
		t.Fatalf("expected send safety to stay blocked in round 2, got %+v", result)
	}

	report := mustReadJSON(t, filepath.Join(bundle.VerifyDir, "send_safety_report.json"))
	if report["allowed"] != false {
		t.Fatalf("expected allowed=false, got %+v", report)
	}
	if report["draftVerified"] != false {
		t.Fatalf("expected draftVerified=false, got %+v", report)
	}
	decision := mustReadJSON(t, bundle.Decision)
	verify := mapValue(decision["verify"])
	if verify["canSend"] != false {
		t.Fatalf("expected decision verify.canSend=false, got %+v", decision)
	}

	replayResult, err := RunReplayState(bundle, ReplayStateOptions{})
	if err != nil {
		t.Fatalf("RunReplayState failed: %v", err)
	}
	if replayResult.ResumeFrom == "" {
		t.Fatalf("expected non-empty resumeFrom, got %+v", replayResult)
	}
	if _, err := os.Stat(filepath.Join(bundle.CheckpointsDir, "current_state.json")); err != nil {
		t.Fatalf("checkpoint missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(bundle.ReplayDir, "replay_result.json")); err != nil {
		t.Fatalf("replay result missing: %v", err)
	}

	evidenceResult, err := RunEvidence(bundle, EvidenceOptions{})
	if err != nil {
		t.Fatalf("RunEvidence failed: %v", err)
	}
	if evidenceResult.AnchorCount == 0 || evidenceResult.OCRProbeImageCount == 0 {
		t.Fatalf("expected evidence outputs, got %+v", evidenceResult)
	}
	if _, err := os.Stat(filepath.Join(bundle.EvidenceActionsDir, "probe_actions.json")); err != nil {
		t.Fatalf("probe action index missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(bundle.EvidenceOCRDir, "ocr_probe_plan.json")); err != nil {
		t.Fatalf("ocr probe plan missing: %v", err)
	}

	restoreRuntimeDeps := stubRuntimeDeps(
		&fakeRuntimePage{report: map[string]interface{}{"ok": true}},
		&fakeRuntimeWindowManager{},
		&fakeRuntimeVision{
			caps: readyLocalVisionCaps(),
			ocr:  map[string]interface{}{"provider": "local", "text": "sample", "lineCount": 1},
		},
	)
	defer restoreRuntimeDeps()

	ocrProbeResult, err := RunOCRProbes(bundle, OCRProbeOptions{})
	if err != nil {
		t.Fatalf("RunOCRProbes failed: %v", err)
	}
	if ocrProbeResult.Executed == 0 || ocrProbeResult.Succeeded == 0 {
		t.Fatalf("expected OCR probe execution, got %+v", ocrProbeResult)
	}
	if _, err := os.Stat(filepath.Join(bundle.EvidenceOCRDir, "ocr_probe_results.json")); err != nil {
		t.Fatalf("ocr probe results missing: %v", err)
	}

	chatCandidatesResult, err := RunChatCandidates(bundle, ChatCandidatesOptions{})
	if err != nil {
		t.Fatalf("RunChatCandidates failed: %v", err)
	}
	if chatCandidatesResult.CandidateCount == 0 {
		t.Fatalf("expected chat candidates, got %+v", chatCandidatesResult)
	}
	if _, err := os.Stat(filepath.Join(bundle.InferDir, "chat_candidates.json")); err != nil {
		t.Fatalf("chat candidates missing: %v", err)
	}

	postSendPlan, err := RunPostSendPlan(bundle, PostSendPlanOptions{})
	if err != nil {
		t.Fatalf("RunPostSendPlan failed: %v", err)
	}
	if postSendPlan.ReportPath == "" {
		t.Fatalf("expected post send plan path, got %+v", postSendPlan)
	}

	preSendBaseline, err := RunPreSendBaseline(bundle, PreSendBaselineOptions{})
	if err != nil {
		t.Fatalf("RunPreSendBaseline failed: %v", err)
	}
	if preSendBaseline.ReportPath == "" {
		t.Fatalf("expected pre-send baseline path, got %+v", preSendBaseline)
	}

	postSendVerifier, err := RunPostSendVerifier(bundle, PostSendVerifierOptions{})
	if err != nil {
		t.Fatalf("RunPostSendVerifier failed: %v", err)
	}
	if postSendVerifier.Status == "" {
		t.Fatalf("expected post-send verifier status, got %+v", postSendVerifier)
	}

	actionabilityRefresh, err := RunActionabilityRefresh(bundle, ActionabilityRefreshOptions{})
	if err != nil {
		t.Fatalf("RunActionabilityRefresh failed: %v", err)
	}
	if !actionabilityRefresh.CanProceed {
		t.Fatalf("expected refreshed actionability canProceed=true, got %+v", actionabilityRefresh)
	}

	probePlan, err := RunProbePlan(bundle, ProbePlanOptions{})
	if err != nil {
		t.Fatalf("RunProbePlan failed: %v", err)
	}
	if probePlan.StepCount == 0 {
		t.Fatalf("expected probe steps, got %+v", probePlan)
	}

	result, err = RunSendSafety(bundle, SendSafetyOptions{})
	if err != nil {
		t.Fatalf("RunSendSafety rerun failed: %v", err)
	}
	if result.Allowed {
		t.Fatalf("expected send safety rerun to stay blocked, got %+v", result)
	}
	report = mustReadJSON(t, filepath.Join(bundle.VerifyDir, "send_safety_report.json"))
	if intValue(report["chatCandidateCount"]) == 0 {
		t.Fatalf("expected chatCandidateCount>0, got %+v", report)
	}
	if stringValue(report["headerProbeText"]) == "" {
		t.Fatalf("expected headerProbeText, got %+v", report)
	}
	if report["preSendBaselineReady"] != true {
		t.Fatalf("expected preSendBaselineReady=true, got %+v", report)
	}

	actionabilityReport := mustReadJSON(t, filepath.Join(bundle.VerifyDir, "actionability_report.json"))
	if actionabilityReport["canProceed"] != true {
		t.Fatalf("expected refreshed actionability canProceed=true, got %+v", actionabilityReport)
	}
}

func TestCandidateMatchScore(t *testing.T) {
	if score := candidateMatchScore("openclawgroup", "openclaw"); score < 0.9 {
		t.Fatalf("expected high score, got %f", score)
	}
	if score := candidateMatchScore("photography", "openclaw"); score > 0.5 {
		t.Fatalf("expected low score, got %f", score)
	}
}

func TestCandidateMatchScorePrefersConfiguredTarget(t *testing.T) {
	scoreExact := candidateMatchScore("openclaw讨论组", "openclaw")
	scoreMiss := candidateMatchScore("摄影技巧入门", "openclaw")
	if scoreExact <= scoreMiss {
		t.Fatalf("expected exact-ish match to score higher: exact=%v miss=%v", scoreExact, scoreMiss)
	}
	if scoreExact < 0.55 {
		t.Fatalf("expected usable match score, got %v", scoreExact)
	}
}
