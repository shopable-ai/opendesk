package visionrun

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type RunOptions struct {
	Mode                     RunMode
	SourceImagePath          string
	RealScreenshotPath       string
	RealReportPath           string
	UseRuntimePreflight      bool
	AllowOfflineSourceImage  bool
	MaxRealValidationRetries int
	DetectOptions            DetectOptions
	CompareOptions           CompareOptions
}

type RunResult struct {
	RunID      string
	ReportPath string
	Summary    string
	Gates      GateStatus
}

type actionStageArtifactsResult struct {
	EvidencePath         string
	OCRProbeResultsPath  string
	ChatCandidatesPath   string
	CaptureContractPath  string
	CaptureTemplatePath  string
	ProbePlanPath        string
	PostSendPlanPath     string
	PreSendBaselinePath  string
	PostSendVerifierPath string
	AnchorCount          int
	OCRProbeCount        int
	ChatCandidateCount   int
	TemplateMatched      int
	TemplateTotal        int
}

func resolveRealInputs(opts *RunOptions) bool {
	if strings.TrimSpace(opts.RealReportPath) != "" {
		return false
	}
	candidates := []string{
		filepath.Clean(filepath.Join(".runtime", "temp", "mac", "wechat_region_map_latest.json")),
	}
	for _, candidate := range candidates {
		if fileExists(candidate) {
			opts.RealReportPath = candidate
			return true
		}
	}
	return false
}

func defaultGoldenSourceImage() string {
	candidates, _ := filepath.Glob(filepath.Join("tests", "wechat", "fixtures", "golden-samples", "*", "capture", "source.png"))
	sort.Strings(candidates)
	for _, candidate := range candidates {
		if fileExists(candidate) {
			return filepath.Clean(candidate)
		}
	}
	return ""
}

func Run(bundle *Bundle, opts RunOptions) (*RunResult, error) {
	if bundle == nil {
		return nil, fmt.Errorf("bundle is required")
	}
	mode := opts.Mode
	if mode == "" {
		mode = RunModeParse
	}
	if strings.TrimSpace(opts.SourceImagePath) == "" {
		if fallback := defaultGoldenSourceImage(); fallback != "" {
			opts.SourceImagePath = fallback
		}
	}
	usedAutoRealReport := resolveRealInputs(&opts)
	if (mode == RunModeValidate || mode == RunModeSend) && strings.TrimSpace(opts.RealScreenshotPath) == "" && strings.TrimSpace(opts.RealReportPath) == "" {
		return nil, fmt.Errorf("real validation input is required for %s mode: provide --real-screenshot or --real-report, or generate .runtime/temp/mac/wechat_region_map_latest.json first", mode)
	}
	if opts.MaxRealValidationRetries <= 0 {
		opts.MaxRealValidationRetries = 1
	}
	if err := mutateRunReport(bundle.RunReport, func(report map[string]any) {
		report["mode"] = string(mode)
	}); err != nil {
		return nil, err
	}
	_ = addRunInput(bundle.RunReport, map[string]any{
		"sourceImagePath":          opts.SourceImagePath,
		"realScreenshotPath":       opts.RealScreenshotPath,
		"realReportPath":           opts.RealReportPath,
		"maxRealValidationRetries": opts.MaxRealValidationRetries,
		"usedDefaultGoldenSource":  strings.TrimSpace(opts.SourceImagePath) != "" && strings.TrimSpace(opts.DetectOptions.SourceImagePath) == "",
		"usedAutoRealReport":       usedAutoRealReport,
	})

	if opts.UseRuntimePreflight {
		started := time.Now().Format(time.RFC3339)
		result, err := RunRuntimePreflight(bundle, RuntimePreflightOptions{AllowOfflineSourceImage: opts.AllowOfflineSourceImage})
		stage := StageResult{
			Name:       string(StageRuntimePreflight),
			Status:     StageStatusPassed,
			StartedAt:  started,
			FinishedAt: time.Now().Format(time.RFC3339),
			Summary:    "runtime preflight completed",
			Artifacts:  []string{result.ReportPath},
			Metrics: map[string]any{
				"status":   result.Status,
				"canProbe": result.CanProbe,
				"canSend":  result.CanSend,
			},
		}
		if err != nil {
			stage.Status = StageStatusFailed
			stage.Summary = err.Error()
			_ = appendRunStage(bundle.RunReport, stage)
			return nil, err
		}
		if err := appendRunStage(bundle.RunReport, stage); err != nil {
			return nil, err
		}
	}

	detectOpts := opts.DetectOptions
	if detectOpts.SourceImagePath == "" {
		detectOpts.SourceImagePath = opts.SourceImagePath
		opts.DetectOptions.SourceImagePath = opts.SourceImagePath
	}
	if detectOpts.SourceImagePath == "" {
		return nil, fmt.Errorf("source image path is required")
	}

	startedDetect := time.Now().Format(time.RFC3339)
	detectResult, err := RunDetect(bundle, detectOpts)
	if err != nil {
		_ = appendRunStage(bundle.RunReport, StageResult{
			Name:       string(StageGoldenParseImprove),
			Status:     StageStatusFailed,
			StartedAt:  startedDetect,
			FinishedAt: time.Now().Format(time.RFC3339),
			Summary:    err.Error(),
		})
		return nil, err
	}
	if err := appendRunStage(bundle.RunReport, StageResult{
		Name:       string(StageGoldenParseImprove),
		Status:     StageStatusPassed,
		StartedAt:  startedDetect,
		FinishedAt: time.Now().Format(time.RFC3339),
		Summary:    "golden/sample detect contract generated",
		Artifacts:  []string{detectResult.SourceImage, detectResult.RegionsPath, detectResult.AnnotatedImage},
		Metrics: map[string]any{
			"regionCount": detectResult.RegionCount,
		},
	}); err != nil {
		return nil, err
	}

	startedInfer := time.Now().Format(time.RFC3339)
	inferResult, err := RunInfer(bundle, InferOptions{})
	if err != nil {
		_ = appendRunStage(bundle.RunReport, StageResult{
			Name:       string(StageJudgeGolden),
			Status:     StageStatusFailed,
			StartedAt:  startedInfer,
			FinishedAt: time.Now().Format(time.RFC3339),
			Summary:    err.Error(),
		})
		return nil, err
	}
	goldenPassed := inferResult.CanProceed
	goldenBlockers := []Blocker{}
	if !goldenPassed {
		goldenBlockers = append(goldenBlockers, Blocker{
			Code:            "golden.structure_incomplete",
			Stage:           string(StageJudgeGolden),
			Severity:        "hard",
			Message:         "golden/sample structure inference did not produce all required zones",
			SuggestedRepair: "repair detect/infer rules before real-app validation",
			EvidenceRefs:    []string{inferResult.ZonesPath, inferResult.ActionabilityReportPath},
		})
	}
	if err := appendRunStage(bundle.RunReport, StageResult{
		Name:       string(StageJudgeGolden),
		Status:     stageStatusFromBool(goldenPassed),
		StartedAt:  startedInfer,
		FinishedAt: time.Now().Format(time.RFC3339),
		Summary:    goldenSummary(goldenPassed),
		Artifacts: []string{
			inferResult.LayoutModelPath,
			inferResult.AppClassificationPath,
			inferResult.ZonesPath,
			inferResult.ActionTargetsPath,
			inferResult.OCRMapPath,
			inferResult.ActionabilityReportPath,
		},
		Blockers: goldenBlockers,
		Metrics: map[string]any{
			"zoneCount":   inferResult.ZoneCount,
			"targetCount": inferResult.TargetCount,
			"canProceed":  inferResult.CanProceed,
			"canSend":     inferResult.CanSend,
		},
	}); err != nil {
		return nil, err
	}
	if err := updateRunGates(bundle.RunReport, func(gates map[string]any) {
		gates["goldenPassed"] = goldenPassed
	}); err != nil {
		return nil, err
	}
	if len(goldenBlockers) > 0 {
		if err := addRunBlockers(bundle.RunReport, goldenBlockers...); err != nil {
			return nil, err
		}
	}

	referenceAuditResult, err := RunReferenceStructureAudit(bundle, detectOpts.SourceImagePath)
	if err != nil {
		return nil, err
	}
	if referenceAuditResult != nil {
		referenceStageStatus := StageStatusPassed
		if referenceAuditResult.Status == "fail" {
			referenceStageStatus = StageStatusFailed
			goldenPassed = false
			blocker := Blocker{
				Code:            "golden.reference_structure_drift",
				Stage:           "GoldenReferenceAudit",
				Severity:        "hard",
				Message:         fmt.Sprintf("golden/reference audit failed: weighted=%.4f", referenceAuditResult.WeightedScore),
				SuggestedRepair: "repair detect/infer until current parse aligns with environment sample reference artifacts",
				EvidenceRefs:    []string{referenceAuditResult.ReportPath},
			}
			goldenBlockers = append(goldenBlockers, blocker)
			if err := addRunBlockers(bundle.RunReport, blocker); err != nil {
				return nil, err
			}
		}
		if err := appendRunStage(bundle.RunReport, StageResult{
			Name:       "GoldenReferenceAudit",
			Status:     referenceStageStatus,
			StartedAt:  time.Now().Format(time.RFC3339),
			FinishedAt: time.Now().Format(time.RFC3339),
			Summary:    fmt.Sprintf("reference structure audit %s", referenceAuditResult.Status),
			Artifacts:  []string{referenceAuditResult.ReportPath},
			Metrics: map[string]any{
				"averageScore":  referenceAuditResult.AverageScore,
				"weightedScore": referenceAuditResult.WeightedScore,
				"comparedZones": referenceAuditResult.ComparedZones,
			},
			Blockers: goldenBlockers,
		}); err != nil {
			return nil, err
		}
		if err := updateRunGates(bundle.RunReport, func(gates map[string]any) {
			gates["goldenPassed"] = goldenPassed
		}); err != nil {
			return nil, err
		}
	}
	if mode == RunModeParse || !goldenPassed {
		summary := gateSummary(bundle.RunReport)
		if err := updateRunSummary(bundle.RunReport, statusLabel(goldenPassed), summary); err != nil {
			return nil, err
		}
		gates, _ := readRunGates(bundle.RunReport)
		return &RunResult{RunID: bundle.RunID, ReportPath: artifactPath(bundle.RunID, "run_report.json"), Summary: summary, Gates: gates}, nil
	}

	realPassed, realValidationResult, err := runRealValidationFlow(bundle, &opts, mode)
	if err != nil {
		return nil, err
	}
	if mode == RunModeValidate || !realPassed {
		summary := gateSummary(bundle.RunReport)
		if err := updateRunSummary(bundle.RunReport, statusLabel(realPassed), summary); err != nil {
			return nil, err
		}
		gates, _ := readRunGates(bundle.RunReport)
		return &RunResult{RunID: bundle.RunID, ReportPath: artifactPath(bundle.RunID, "run_report.json"), Summary: summary, Gates: gates}, nil
	}

	if err := hydrateActionBundleFromRealValidation(bundle, realValidationResult); err != nil {
		return nil, err
	}

	startedArtifacts := time.Now().Format(time.RFC3339)
	actionArtifacts, err := runActionStageArtifacts(bundle)
	if err != nil {
		_ = appendRunStage(bundle.RunReport, StageResult{
			Name:       "BuildExecutionArtifacts",
			Status:     StageStatusFailed,
			StartedAt:  startedArtifacts,
			FinishedAt: time.Now().Format(time.RFC3339),
			Summary:    err.Error(),
		})
		return nil, err
	}
	if err := appendRunStage(bundle.RunReport, StageResult{
		Name:       "BuildExecutionArtifacts",
		Status:     StageStatusPassed,
		StartedAt:  startedArtifacts,
		FinishedAt: time.Now().Format(time.RFC3339),
		Summary:    "generated probe/evidence/capture artifacts for action stage",
		Artifacts: []string{
			actionArtifacts.EvidencePath,
			actionArtifacts.OCRProbeResultsPath,
			actionArtifacts.ChatCandidatesPath,
			actionArtifacts.CaptureContractPath,
			actionArtifacts.CaptureTemplatePath,
			actionArtifacts.ProbePlanPath,
			actionArtifacts.PostSendPlanPath,
			actionArtifacts.PreSendBaselinePath,
			actionArtifacts.PostSendVerifierPath,
		},
		Metrics: map[string]any{
			"anchorCount":        actionArtifacts.AnchorCount,
			"ocrProbeCount":      actionArtifacts.OCRProbeCount,
			"chatCandidateCount": actionArtifacts.ChatCandidateCount,
			"templateMatched":    actionArtifacts.TemplateMatched,
			"templateTotal":      actionArtifacts.TemplateTotal,
		},
	}); err != nil {
		return nil, err
	}

	startedAction := time.Now().Format(time.RFC3339)
	actionabilityResult, err := RunActionabilityRefresh(bundle, ActionabilityRefreshOptions{})
	if err != nil {
		return nil, err
	}
	if err := appendRunStage(bundle.RunReport, StageResult{
		Name:       string(StageActionabilityRefresh),
		Status:     stageStatusFromBool(actionabilityResult.CanProceed),
		StartedAt:  startedAction,
		FinishedAt: time.Now().Format(time.RFC3339),
		Summary:    "refreshed coarse actionability after validation",
		Artifacts:  []string{actionabilityResult.ReportPath},
		Metrics: map[string]any{
			"canProceed": actionabilityResult.CanProceed,
			"canSend":    actionabilityResult.CanSend,
		},
	}); err != nil {
		return nil, err
	}
	captureContractResult, err := RunCaptureContract(bundle)
	if err != nil {
		return nil, err
	}
	if err := appendRunStage(bundle.RunReport, StageResult{
		Name:       "CaptureContract",
		Status:     StageStatusPassed,
		StartedAt:  time.Now().Format(time.RFC3339),
		FinishedAt: time.Now().Format(time.RFC3339),
		Summary:    "generated precise capture contract for high-value regions",
		Artifacts:  []string{captureContractResult.ReportPath},
		Metrics: map[string]any{
			"zoneCount": captureContractResult.Zones,
		},
	}); err != nil {
		return nil, err
	}
	if err := appendRunStage(bundle.RunReport, StageResult{
		Name:       string(StageEnableActionStage),
		Status:     stageStatusFromBool(actionabilityResult.CanProceed),
		StartedAt:  startedAction,
		FinishedAt: time.Now().Format(time.RFC3339),
		Summary:    enableActionSummary(actionabilityResult.CanProceed),
		Artifacts:  []string{actionabilityResult.ReportPath},
	}); err != nil {
		return nil, err
	}
	if err := updateRunGates(bundle.RunReport, func(gates map[string]any) {
		gates["actionStageAllowed"] = actionabilityResult.CanProceed
	}); err != nil {
		return nil, err
	}

	startedSend := time.Now().Format(time.RFC3339)
	sendSafetyResult, err := RunSendSafety(bundle, SendSafetyOptions{})
	if err != nil {
		return nil, err
	}
	if err := appendRunStage(bundle.RunReport, StageResult{
		Name:       string(StageSendSafety),
		Status:     stageStatusFromBool(sendSafetyResult.Allowed),
		StartedAt:  startedSend,
		FinishedAt: time.Now().Format(time.RFC3339),
		Summary:    sendSafetySummary(sendSafetyResult.Allowed),
		Artifacts:  []string{sendSafetyResult.ReportPath},
	}); err != nil {
		return nil, err
	}
	if err := updateRunGates(bundle.RunReport, func(gates map[string]any) {
		gates["sendAllowed"] = sendSafetyResult.Allowed
	}); err != nil {
		return nil, err
	}
	if mode == RunModeSend && sendSafetyResult.Allowed {
		_ = appendRunStage(bundle.RunReport, StageResult{
			Name:       string(StageExecuteSend),
			Status:     StageStatusBlocked,
			StartedAt:  time.Now().Format(time.RFC3339),
			FinishedAt: time.Now().Format(time.RFC3339),
			Summary:    "send executor integration point is ready; provide real worker invocation/report to complete end-to-end send closure",
			Artifacts:  []string{},
		})
	}

	summary := gateSummary(bundle.RunReport)
	if err := updateRunSummary(bundle.RunReport, statusLabel(sendSafetyResult.Allowed), summary); err != nil {
		return nil, err
	}
	gates, _ := readRunGates(bundle.RunReport)
	return &RunResult{RunID: bundle.RunID, ReportPath: artifactPath(bundle.RunID, "run_report.json"), Summary: summary, Gates: gates}, nil
}

func runActionStageArtifacts(bundle *Bundle) (*actionStageArtifactsResult, error) {
	evidenceResult, err := RunEvidence(bundle, EvidenceOptions{})
	if err != nil {
		return nil, err
	}
	ocrProbeResult, err := RunOCRProbes(bundle, OCRProbeOptions{})
	if err != nil {
		return nil, err
	}
	chatCandidatesResult, err := RunChatCandidates(bundle, ChatCandidatesOptions{})
	if err != nil {
		return nil, err
	}
	captureContractResult, err := RunCaptureContract(bundle)
	if err != nil {
		return nil, err
	}
	captureTemplateResult, err := RunCaptureTemplateAudit(bundle)
	if err != nil {
		return nil, err
	}
	probePlanResult, err := RunProbePlan(bundle, ProbePlanOptions{})
	if err != nil {
		return nil, err
	}
	postSendPlanResult, err := RunPostSendPlan(bundle, PostSendPlanOptions{})
	if err != nil {
		return nil, err
	}
	preSendBaselineResult, err := RunPreSendBaseline(bundle, PreSendBaselineOptions{})
	if err != nil {
		return nil, err
	}
	postSendVerifierResult, err := RunPostSendVerifier(bundle, PostSendVerifierOptions{})
	if err != nil {
		return nil, err
	}
	return &actionStageArtifactsResult{
		EvidencePath:         evidenceResult.ActionIndexPath,
		OCRProbeResultsPath:  ocrProbeResult.ReportPath,
		ChatCandidatesPath:   chatCandidatesResult.ReportPath,
		CaptureContractPath:  captureContractResult.ReportPath,
		CaptureTemplatePath:  captureTemplateResult.ReportPath,
		ProbePlanPath:        probePlanResult.ReportPath,
		PostSendPlanPath:     postSendPlanResult.ReportPath,
		PreSendBaselinePath:  preSendBaselineResult.ReportPath,
		PostSendVerifierPath: postSendVerifierResult.ReportPath,
		AnchorCount:          evidenceResult.AnchorCount,
		OCRProbeCount:        ocrProbeResult.Executed,
		ChatCandidateCount:   chatCandidatesResult.CandidateCount,
		TemplateMatched:      captureTemplateResult.Matched,
		TemplateTotal:        captureTemplateResult.Total,
	}, nil
}

func runRealValidationFlow(bundle *Bundle, opts *RunOptions, mode RunMode) (bool, *RealAppValidationResult, error) {
	startedRealCapture := time.Now().Format(time.RFC3339)
	var workerBridgeResult *WorkerBridgeResult
	if strings.TrimSpace(opts.RealReportPath) != "" {
		bridge, err := RunWorkerBridge(bundle, WorkerBridgeOptions{
			Command:    []string{"/usr/bin/true"},
			ReportPath: opts.RealReportPath,
			StageLabel: string(StageCaptureRealAppScreenshot),
		})
		if err == nil {
			workerBridgeResult = bridge
			if strings.TrimSpace(opts.RealScreenshotPath) == "" {
				opts.RealScreenshotPath = bridge.ScreenshotPath
			}
			_ = setRunArtifact(bundle.RunReport, "workerBridgeReport", bridge.ReportPath)
		}
	}
	if strings.TrimSpace(opts.RealScreenshotPath) == "" {
		return false, nil, nil
	}

	realValidationResult, realValidationErr := RunRealAppValidation(bundle, RealAppValidationOptions{
		ScreenshotPath:   opts.RealScreenshotPath,
		SourceReportPath: opts.RealReportPath,
		WorkerBridge:     workerBridgeResult,
		Label:            "real-app-screenshot-validation",
	})
	if realValidationErr != nil {
		return false, nil, realValidationErr
	}
	if err := appendRunStage(bundle.RunReport, StageResult{
		Name:       string(StageCaptureRealAppScreenshot),
		Status:     StageStatusPassed,
		StartedAt:  startedRealCapture,
		FinishedAt: time.Now().Format(time.RFC3339),
		Summary:    "captured or accepted real-app screenshot for validation",
		Artifacts: []string{
			realValidationResult.ScreenshotPath,
			realValidationResult.DetectRegionsPath,
			realValidationResult.LayoutModelPath,
			realValidationResult.ZonesPath,
		},
	}); err != nil {
		return false, nil, err
	}
	if err := appendRunStage(bundle.RunReport, StageResult{
		Name:       string(StageValidateRealAppAgainstGolden),
		Status:     stageStatusFromBool(realValidationResult.ValidationPassed),
		StartedAt:  startedRealCapture,
		FinishedAt: time.Now().Format(time.RFC3339),
		Summary:    realValidationDecisionSummary(realValidationResult.ValidationPassed, realValidationResult.FailureType, realValidationResult.Should),
		Artifacts: []string{
			realValidationResult.ValidationReportPath,
			realValidationResult.LayoutModelPath,
			realValidationResult.ZonesPath,
		},
		Blockers: realValidationResult.Blockers,
	}); err != nil {
		return false, nil, err
	}
	if err := appendRunStage(bundle.RunReport, StageResult{
		Name:       string(StageJudgeRealValidation),
		Status:     stageStatusFromBool(realValidationResult.ValidationPassed),
		StartedAt:  startedRealCapture,
		FinishedAt: time.Now().Format(time.RFC3339),
		Summary:    realValidationJudgeSummary(realValidationResult.ValidationPassed),
		Artifacts:  []string{realValidationResult.ValidationReportPath},
		Blockers:   realValidationResult.Blockers,
	}); err != nil {
		return false, nil, err
	}
	realPassed := realValidationResult.ValidationPassed
	if err := updateRunGates(bundle.RunReport, func(gates map[string]any) {
		gates["realScreenshotValidationPassed"] = realPassed
		gates["actionStageAllowed"] = realPassed
	}); err != nil {
		return false, nil, err
	}
	if len(realValidationResult.Blockers) > 0 {
		if err := addRunBlockers(bundle.RunReport, realValidationResult.Blockers...); err != nil {
			return false, nil, err
		}
	}
	if !realPassed {
		diagnoseResult, err := RunDiagnose(bundle, realValidationResult)
		if err == nil {
			_ = appendRunStage(bundle.RunReport, StageResult{
				Name:       string(StageDiagnose),
				Status:     StageStatusPassed,
				StartedAt:  time.Now().Format(time.RFC3339),
				FinishedAt: time.Now().Format(time.RFC3339),
				Summary:    diagnoseResult.Why,
				Artifacts:  []string{diagnoseResult.ReportPath},
				Blockers:   diagnoseResult.Blockers,
			})
			repairResult, repairErr := RunRepair(bundle, diagnoseResult, 1)
			if repairErr == nil {
				_ = addRepairAttempt(bundle.RunReport, repairResult.Attempt)
				_ = appendRunStage(bundle.RunReport, StageResult{
					Name:       string(StageRepair),
					Status:     StageStatusPassed,
					StartedAt:  time.Now().Format(time.RFC3339),
					FinishedAt: time.Now().Format(time.RFC3339),
					Summary:    repairResult.Attempt.Strategy,
					Artifacts:  []string{repairResult.ReportPath},
				})
			}
		}
		_ = appendRunStage(bundle.RunReport, StageResult{
			Name:       string(StageReRun),
			Status:     StageStatusBlocked,
			StartedAt:  time.Now().Format(time.RFC3339),
			FinishedAt: time.Now().Format(time.RFC3339),
			Summary:    "bounded rerun required after diagnose/repair; current attempt recorded",
			Artifacts:  []string{realValidationResult.ValidationReportPath},
		})
	}
	return realPassed, realValidationResult, nil
}

func hydrateActionBundleFromRealValidation(bundle *Bundle, validation *RealAppValidationResult) error {
	if bundle == nil || validation == nil || strings.TrimSpace(validation.RealBaseDir) == "" {
		return nil
	}
	type filePair struct {
		src string
		dst string
	}
	pairs := []filePair{
		{src: filepath.Join(validation.RealBaseDir, "capture", "source.png"), dst: filepath.Join(bundle.CaptureDir, "source.png")},
		{src: filepath.Join(validation.RealBaseDir, "detect", "regions.json"), dst: filepath.Join(bundle.DetectDir, "regions.json")},
		{src: filepath.Join(validation.RealBaseDir, "detect", "layout_model.json"), dst: filepath.Join(bundle.DetectDir, "layout_model.json")},
		{src: filepath.Join(validation.RealBaseDir, "infer", "app_classification.json"), dst: filepath.Join(bundle.InferDir, "app_classification.json")},
		{src: filepath.Join(validation.RealBaseDir, "infer", "zones.json"), dst: filepath.Join(bundle.InferDir, "zones.json")},
		{src: filepath.Join(validation.RealBaseDir, "infer", "action_targets.json"), dst: filepath.Join(bundle.InferDir, "action_targets.json")},
		{src: filepath.Join(validation.RealBaseDir, "infer", "ocr_map.json"), dst: filepath.Join(bundle.InferDir, "ocr_map.json")},
		{src: filepath.Join(validation.RealBaseDir, "verify", "actionability_report.json"), dst: filepath.Join(bundle.VerifyDir, "actionability_report.json")},
	}
	for _, pair := range pairs {
		if !fileExists(pair.src) {
			continue
		}
		if err := copyArtifactFile(pair.src, pair.dst); err != nil {
			return err
		}
	}
	return nil
}

func copyArtifactFile(srcPath, dstPath string) error {
	data, err := os.ReadFile(srcPath)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(dstPath), 0755); err != nil {
		return err
	}
	return os.WriteFile(dstPath, data, 0644)
}

func stageStatusFromBool(ok bool) StageStatus {
	if ok {
		return StageStatusPassed
	}
	return StageStatusBlocked
}

func goldenSummary(ok bool) string {
	if ok {
		return "golden/sample stage passed; real screenshot validation may begin"
	}
	return "golden/sample stage blocked; real screenshot validation is not allowed"
}

func realValidationSummary(ok bool, err error) string {
	if err != nil {
		return fmt.Sprintf("real screenshot validation could not run: %v", err)
	}
	if ok {
		return "real screenshot validation passed against golden-derived structure"
	}
	return "real screenshot validation failed against golden-derived structure"
}

func realValidationJudgeSummary(ok bool) string {
	if ok {
		return "real screenshot validation passed; action stage may be evaluated"
	}
	return "real screenshot validation blocked; diagnose/repair/rerun required before action stage"
}

func enableActionSummary(ok bool) string {
	if ok {
		return "action stage enabled for coarse actions"
	}
	return "action stage remains disabled"
}

func statusLabel(ok bool) string {
	if ok {
		return "pass"
	}
	return "blocked"
}
