package scheduler

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	pkgExecution "opendesk/pkg/execution"
)

type Options struct {
	ScriptRoot   string
	PollInterval time.Duration
	QueueSize    int
	Now          func() time.Time
	Logf         func(string, ...any)
}

type Service struct {
	store        *Store
	executor     Executor
	scriptRoot   string
	pollInterval time.Duration
	now          func() time.Time
	logf         func(string, ...any)
	queue        chan dispatchRequest
	wake         chan struct{}

	mu      sync.Mutex
	started bool
	ctx     context.Context
	cancel  context.CancelFunc
	wg      sync.WaitGroup
}

type dispatchRequest struct {
	job       Job
	run       JobRun
	scheduled bool
}

func NewService(store *Store, executor Executor, options Options) (*Service, error) {
	if store == nil {
		return nil, fmt.Errorf("scheduler store is required")
	}
	if executor == nil {
		return nil, fmt.Errorf("scheduler executor is required")
	}
	root, err := canonicalRoot(options.ScriptRoot)
	if err != nil {
		return nil, err
	}
	if options.PollInterval <= 0 {
		options.PollInterval = 500 * time.Millisecond
	}
	if options.QueueSize <= 0 {
		options.QueueSize = 128
	}
	if options.Now == nil {
		options.Now = time.Now
	}
	if options.Logf == nil {
		options.Logf = log.Printf
	}
	return &Service{
		store:        store,
		executor:     executor,
		scriptRoot:   root,
		pollInterval: options.PollInterval,
		now:          options.Now,
		logf:         options.Logf,
		queue:        make(chan dispatchRequest, options.QueueSize),
		wake:         make(chan struct{}, 1),
	}, nil
}

func (s *Service) Start(parent context.Context) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.started {
		return nil
	}
	if parent == nil {
		parent = context.Background()
	}
	if err := s.recover(parent, s.now().UTC()); err != nil {
		return err
	}
	s.ctx, s.cancel = context.WithCancel(parent)
	s.started = true
	s.wg.Add(2)
	go s.runEngine()
	go s.runWorker()
	s.signal()
	return nil
}

func (s *Service) Close(ctx context.Context) error {
	s.mu.Lock()
	if !s.started {
		s.mu.Unlock()
		return nil
	}
	cancel := s.cancel
	s.started = false
	s.mu.Unlock()
	cancel()

	done := make(chan struct{})
	go func() {
		s.wg.Wait()
		close(done)
	}()
	if ctx == nil {
		ctx = context.Background()
	}
	select {
	case <-done:
		recoverCtx, recoverCancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer recoverCancel()
		return s.store.RecoverInterruptedRuns(recoverCtx, s.now().UTC())
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (s *Service) CreateJob(ctx context.Context, input CreateJobInput) (Job, error) {
	input.Name = strings.TrimSpace(input.Name)
	if input.Name == "" {
		return Job{}, fmt.Errorf("job name is required")
	}
	if len(input.Name) > 200 {
		return Job{}, fmt.Errorf("job name is too long")
	}
	if input.TaskType == "" {
		input.TaskType = "script"
	}
	if input.TaskType != "script" {
		return Job{}, fmt.Errorf("scheduler MVP only supports taskType script")
	}
	if input.MisfirePolicy == "" {
		input.MisfirePolicy = MisfireRunOnce
	}
	if input.MisfirePolicy != MisfireRunOnce && input.MisfirePolicy != MisfireSkip {
		return Job{}, fmt.Errorf("misfirePolicy must be run_once or skip")
	}
	if strings.TrimSpace(input.Timezone) == "" {
		input.Timezone = "Local"
	}
	input.ScheduleExpression = strings.TrimSpace(input.ScheduleExpression)
	if err := ValidateSchedule(input.ScheduleType, input.ScheduleExpression, input.Timezone); err != nil {
		return Job{}, err
	}
	if input.SourceType == "" {
		input.SourceType = SourceFile
	}
	hasFile := strings.TrimSpace(input.ScriptPath) != ""
	hasInline := strings.TrimSpace(input.InlineScript) != ""
	if hasFile && hasInline {
		return Job{}, fmt.Errorf("scriptPath and inlineScript are mutually exclusive")
	}
	if !hasFile && !hasInline {
		return Job{}, fmt.Errorf("exactly one script source is required")
	}
	var normalizedPath string
	switch input.SourceType {
	case SourceFile:
		if !hasFile || hasInline {
			return Job{}, fmt.Errorf("file source requires scriptPath and forbids inlineScript")
		}
		var err error
		normalizedPath, err = NormalizeScriptPath(s.scriptRoot, input.ScriptPath)
		if err != nil {
			return Job{}, err
		}
	case SourceInline:
		if !hasInline || hasFile {
			return Job{}, fmt.Errorf("inline source requires inlineScript and forbids scriptPath")
		}
		if len([]byte(input.InlineScript)) > MaxInlineScriptBytes {
			return Job{}, fmt.Errorf("inlineScript exceeds the %d-byte limit", MaxInlineScriptBytes)
		}
	default:
		return Job{}, fmt.Errorf("sourceType must be file or inline")
	}
	now := s.now().UTC()
	next, err := initialNextRun(input.ScheduleType, input.ScheduleExpression, input.Timezone, now)
	if err != nil {
		return Job{}, err
	}
	if input.ScheduleType == ScheduleAt && input.MisfirePolicy == MisfireSkip && !next.After(now) {
		return Job{}, fmt.Errorf("one-time schedule has already passed")
	}
	job := Job{
		ID:                 newID("job"),
		Name:               input.Name,
		Enabled:            true,
		ScheduleType:       input.ScheduleType,
		ScheduleExpression: input.ScheduleExpression,
		Timezone:           input.Timezone,
		MisfirePolicy:      input.MisfirePolicy,
		TaskType:           input.TaskType,
		SourceType:         input.SourceType,
		ScriptPath:         normalizedPath,
		HasInlineScript:    input.SourceType == SourceInline,
		InlineScript:       input.InlineScript,
		CreatedAt:          now,
		UpdatedAt:          now,
		NextRunAt:          &next,
	}
	if err := s.store.CreateJob(ctx, job); err != nil {
		return Job{}, err
	}
	s.signal()
	return job, nil
}

func (s *Service) ListJobs(ctx context.Context) ([]Job, error) {
	return s.store.ListJobs(ctx)
}

func (s *Service) GetJob(ctx context.Context, id string) (Job, error) {
	return s.store.GetJob(ctx, id)
}

func (s *Service) Pause(ctx context.Context, id string) (Job, error) {
	if err := s.store.PauseJob(ctx, id, s.now().UTC()); err != nil {
		return Job{}, err
	}
	s.signal()
	return s.store.GetJob(ctx, id)
}

func (s *Service) Resume(ctx context.Context, id string) (Job, error) {
	job, err := s.store.GetJob(ctx, id)
	if err != nil {
		return Job{}, err
	}
	now := s.now().UTC()
	next, err := resumeNextRun(job, now)
	if err != nil {
		return Job{}, err
	}
	if err := s.store.SetEnabled(ctx, id, true, &next, now); err != nil {
		return Job{}, err
	}
	s.signal()
	return s.store.GetJob(ctx, id)
}

func (s *Service) Delete(ctx context.Context, id string) error {
	if err := s.store.DeleteJob(ctx, id, s.now().UTC()); err != nil {
		return err
	}
	s.signal()
	return nil
}

func (s *Service) RunNow(ctx context.Context, id string) (JobRun, error) {
	job, err := s.store.GetJob(ctx, id)
	if err != nil {
		return JobRun{}, err
	}
	run, err := s.store.CreateManualRun(ctx, id, s.now().UTC())
	if err != nil {
		return JobRun{}, err
	}
	request := dispatchRequest{job: job, run: run, scheduled: false}
	if err := s.enqueue(ctx, request); err != nil {
		finishCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = s.store.FinishRun(finishCtx, run, RunCanceled, "", err.Error(), s.now().UTC(), false, nil, false)
		return JobRun{}, err
	}
	return run, nil
}

func (s *Service) ListRuns(ctx context.Context, jobID string, limit int) ([]JobRun, error) {
	if _, err := s.store.GetJob(ctx, jobID); err != nil {
		return nil, err
	}
	return s.store.ListRuns(ctx, jobID, limit)
}

func (s *Service) runEngine() {
	defer s.wg.Done()
	ticker := time.NewTicker(s.pollInterval)
	defer ticker.Stop()
	for {
		if err := s.processDue(s.ctx); err != nil && !errors.Is(err, context.Canceled) {
			s.logf("scheduler: process due jobs: %v", err)
		}
		select {
		case <-s.ctx.Done():
			return
		case <-ticker.C:
		case <-s.wake:
		}
	}
}

func (s *Service) processDue(ctx context.Context) error {
	jobs, err := s.store.ListDueJobs(ctx, s.now().UTC(), 100)
	if err != nil {
		return err
	}
	for _, job := range jobs {
		run, claimed, err := s.store.ClaimScheduledRun(ctx, job, s.now().UTC())
		if err != nil {
			return err
		}
		if !claimed {
			continue
		}
		if err := s.enqueue(ctx, dispatchRequest{job: job, run: run, scheduled: true}); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) runWorker() {
	defer s.wg.Done()
	for {
		select {
		case <-s.ctx.Done():
			return
		case request := <-s.queue:
			s.execute(request)
		}
	}
}

func (s *Service) execute(request dispatchRequest) {
	started, err := s.store.MarkRunStarted(s.ctx, request.run.ID, s.now().UTC())
	if err != nil {
		s.logf("scheduler: mark run %s started: %v", request.run.ID, err)
		return
	}
	if !started {
		return
	}
	result, execErr := s.executor.Execute(s.ctx, request.job)
	finishedAt := s.now().UTC()
	status := runStatus(result, execErr, s.ctx)
	errText := ""
	if execErr != nil {
		errText = execErr.Error()
	}
	var nextRun *time.Time
	disable := request.scheduled && request.job.ScheduleType == ScheduleAt
	if request.scheduled && !disable {
		next, nextErr := NextRun(request.job.ScheduleType, request.job.ScheduleExpression, request.job.Timezone, finishedAt)
		if nextErr != nil {
			status = RunFailed
			if errText != "" {
				errText += "; "
			}
			errText += "calculate next run: " + nextErr.Error()
			disable = true
		} else {
			nextRun = &next
		}
	}
	finishCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := s.store.FinishRun(finishCtx, request.run, status, result.ExecutionID, errText, finishedAt, request.scheduled, nextRun, disable); err != nil {
		s.logf("scheduler: finish run %s: %v", request.run.ID, err)
	}
	s.signal()
}

func (s *Service) enqueue(ctx context.Context, request dispatchRequest) error {
	s.mu.Lock()
	started := s.started
	serviceCtx := s.ctx
	s.mu.Unlock()
	if !started || serviceCtx == nil {
		return fmt.Errorf("scheduler is not running")
	}
	select {
	case s.queue <- request:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	case <-serviceCtx.Done():
		return serviceCtx.Err()
	}
}

func (s *Service) signal() {
	select {
	case s.wake <- struct{}{}:
	default:
	}
}

func (s *Service) recover(ctx context.Context, now time.Time) error {
	if err := s.store.RecoverInterruptedRuns(ctx, now); err != nil {
		return err
	}
	jobs, err := s.store.ListEnabledJobs(ctx)
	if err != nil {
		return err
	}
	for _, job := range jobs {
		if job.NextRunAt != nil && job.NextRunAt.After(now) {
			continue
		}
		enabled := true
		var next time.Time
		if job.MisfirePolicy == MisfireSkip {
			next, enabled, err = nextAfterMisfire(job, now)
		} else {
			next, err = runOnceAfterMisfire(job, now)
		}
		if err != nil {
			return fmt.Errorf("recover job %s: %w", job.ID, err)
		}
		var nextPtr *time.Time
		if enabled && !next.IsZero() {
			nextPtr = &next
		}
		if err := s.store.UpdateNextRun(ctx, job.ID, enabled, nextPtr, now); err != nil {
			return err
		}
	}
	return nil
}

func initialNextRun(scheduleType ScheduleType, expression, timezone string, now time.Time) (time.Time, error) {
	if scheduleType == ScheduleAt {
		return atTime(expression, timezone)
	}
	return NextRun(scheduleType, expression, timezone, now)
}

func resumeNextRun(job Job, now time.Time) (time.Time, error) {
	if job.ScheduleType != ScheduleAt {
		return NextRun(job.ScheduleType, job.ScheduleExpression, job.Timezone, now)
	}
	at, err := atTime(job.ScheduleExpression, job.Timezone)
	if err != nil {
		return time.Time{}, err
	}
	if !at.After(now) && job.MisfirePolicy == MisfireSkip {
		return time.Time{}, fmt.Errorf("one-time schedule has already passed")
	}
	return at, nil
}

func runOnceAfterMisfire(job Job, now time.Time) (time.Time, error) {
	if job.NextRunAt != nil {
		return job.NextRunAt.UTC(), nil
	}
	if job.ScheduleType == ScheduleAt {
		at, err := atTime(job.ScheduleExpression, job.Timezone)
		if err != nil {
			return time.Time{}, err
		}
		if at.After(now) {
			return at, nil
		}
	}
	return now, nil
}

func nextAfterMisfire(job Job, now time.Time) (time.Time, bool, error) {
	if job.ScheduleType == ScheduleAt {
		at, err := atTime(job.ScheduleExpression, job.Timezone)
		if err != nil {
			return time.Time{}, false, err
		}
		if at.After(now) {
			return at, true, nil
		}
		return time.Time{}, false, nil
	}
	next, err := NextRun(job.ScheduleType, job.ScheduleExpression, job.Timezone, now)
	return next, err == nil, err
}

func runStatus(result pkgExecution.ExecutionResult, execErr error, ctx context.Context) RunStatus {
	if errors.Is(execErr, context.Canceled) || (ctx != nil && errors.Is(ctx.Err(), context.Canceled)) {
		return RunCanceled
	}
	switch result.Status {
	case pkgExecution.ExecutionStatusSucceeded:
		return RunSucceeded
	case pkgExecution.ExecutionStatusCanceled:
		return RunCanceled
	case pkgExecution.ExecutionStatusFailed, pkgExecution.ExecutionStatusTimedOut:
		return RunFailed
	}
	if execErr != nil {
		return RunFailed
	}
	return RunSucceeded
}
