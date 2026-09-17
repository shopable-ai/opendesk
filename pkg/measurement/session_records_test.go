package measurement

import (
	"reflect"
	"testing"
	"time"
)

func sessionRecordEvidenceFixture(t *testing.T, sessionID, snapshotID string, generation uint64, kind string) MeasurementEvidence {
	t.Helper()
	frame, result, pngBytes := evidenceFixture(t)
	if generation > 1 {
		frame.Snapshot.SampledAt = frame.Snapshot.SampledAt.Add(time.Duration(generation-1) * time.Second)
		switch kind {
		case "region":
			var err error
			result, err = BuildRegionResult(frame.Snapshot, frame.Reference, Rect{X: 30, Y: 30, Width: 20, Height: 10})
			if err != nil {
				t.Fatal(err)
			}
		case "twoPoint":
			var err error
			result, err = BuildTwoPointResult(frame.Snapshot, frame.Reference, Point{X: 30, Y: 30}, Point{X: 50, Y: 45})
			if err != nil {
				t.Fatal(err)
			}
		case "spacing":
			var err error
			result, err = BuildSpacingResult(frame.Snapshot, frame.Reference, Rect{X: 30, Y: 30, Width: 10, Height: 10}, Rect{X: 55, Y: 30, Width: 10, Height: 10})
			if err != nil {
				t.Fatal(err)
			}
		}
	} else if kind != "point" {
		switch kind {
		case "region":
			var err error
			result, err = BuildRegionResult(frame.Snapshot, frame.Reference, Rect{X: 30, Y: 30, Width: 20, Height: 10})
			if err != nil {
				t.Fatal(err)
			}
		case "twoPoint":
			var err error
			result, err = BuildTwoPointResult(frame.Snapshot, frame.Reference, Point{X: 30, Y: 30}, Point{X: 50, Y: 45})
			if err != nil {
				t.Fatal(err)
			}
		case "spacing":
			var err error
			result, err = BuildSpacingResult(frame.Snapshot, frame.Reference, Rect{X: 30, Y: 30, Width: 10, Height: 10}, Rect{X: 55, Y: 30, Width: 10, Height: 10})
			if err != nil {
				t.Fatal(err)
			}
		default:
			t.Fatalf("unsupported fixture kind %q", kind)
		}
	}
	target := Rect{X: 30, Y: 30, Width: 20, Height: 10}
	ev, err := BuildEvidenceWithProduct(
		"task-session-records", "developer-menu", frame, result, pngBytes,
		EvidenceConfidence{Target: 1, Geometry: 1, Pixel: 1, Overall: 1},
		SnapshotToken{SessionID: sessionID, Generation: generation, SnapshotID: snapshotID},
		PhaseMeasuring, &target, nil, nil, nil,
	)
	if err != nil {
		t.Fatal(err)
	}
	return ev
}

func TestMeasurementSessionJournalMultipleRecordsShareOneSnapshot(t *testing.T) {
	journal, err := NewMeasurementSessionJournal("measurement-session-1")
	if err != nil {
		t.Fatal(err)
	}
	ev := sessionRecordEvidenceFixture(t, "measurement-session-1", "snapshot-1", 1, "point")
	first, err := journal.AppendConfirmed("record-1", "first point", "records/record-1/evidence.json", time.Date(2026, 9, 17, 10, 0, 0, 0, time.UTC), ev)
	if err != nil {
		t.Fatal(err)
	}
	second, err := journal.AppendConfirmed("record-2", "second point", "records/record-2/evidence.json", time.Date(2026, 9, 17, 10, 0, 1, 0, time.UTC), ev)
	if err != nil {
		t.Fatal(err)
	}
	if first.SnapshotID != second.SnapshotID || first.Token != second.Token {
		t.Fatalf("same-snapshot records diverged first=%+v second=%+v", first.Token, second.Token)
	}
	envelope, err := journal.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	if len(envelope.Snapshots) != 1 || len(envelope.Measurements) != 2 {
		t.Fatalf("snapshots=%d records=%d", len(envelope.Snapshots), len(envelope.Measurements))
	}
	if err := ValidateMeasurementSessionEnvelope(envelope); err != nil {
		t.Fatal(err)
	}

	// Append clones canonical evidence; callers cannot rewrite recorded history
	// by mutating the evidence object they passed in.
	ev.Reference.Bounds.X = 999
	after, err := journal.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	if after.Measurements[0].Reference.Bounds.X == 999 || after.Snapshots[0].Reference.Bounds.X == 999 {
		t.Fatal("journal retained caller-owned mutable reference state")
	}
}

func TestMeasurementSessionJournalPreservesHistoricalSnapshotAcrossGeneration(t *testing.T) {
	journal, err := NewMeasurementSessionJournal("measurement-session-2")
	if err != nil {
		t.Fatal(err)
	}
	first := sessionRecordEvidenceFixture(t, "measurement-session-2", "snapshot-1", 1, "region")
	second := sessionRecordEvidenceFixture(t, "measurement-session-2", "snapshot-2", 2, "twoPoint")
	if _, err := journal.AppendConfirmed("record-1", "region", "records/record-1/evidence.json", time.Now(), first); err != nil {
		t.Fatal(err)
	}
	if _, err := journal.AppendConfirmed("record-2", "distance", "records/record-2/evidence.json", time.Now().Add(time.Second), second); err != nil {
		t.Fatal(err)
	}
	envelope, err := journal.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	if len(envelope.Snapshots) != 2 || envelope.Measurements[0].Token.Generation != 1 || envelope.Measurements[1].Token.Generation != 2 {
		t.Fatalf("historical tokens were not preserved: %+v", envelope.Measurements)
	}
	if envelope.Measurements[0].Type != "region" || envelope.Measurements[1].Type != "point-to-point" {
		t.Fatalf("record types=%q,%q", envelope.Measurements[0].Type, envelope.Measurements[1].Type)
	}
}

func TestMeasurementSessionJournalRejectsCrossSessionDuplicateAndSnapshotDrift(t *testing.T) {
	journal, err := NewMeasurementSessionJournal("measurement-session-3")
	if err != nil {
		t.Fatal(err)
	}
	ev := sessionRecordEvidenceFixture(t, "measurement-session-3", "snapshot-1", 1, "point")
	if _, err := journal.AppendConfirmed("record-1", "point", "records/record-1/evidence.json", time.Now(), ev); err != nil {
		t.Fatal(err)
	}
	before, _ := journal.Snapshot()
	if _, err := journal.AppendConfirmed("record-1", "duplicate", "records/duplicate/evidence.json", time.Now(), ev); err == nil {
		t.Fatal("duplicate record id accepted")
	}
	other := sessionRecordEvidenceFixture(t, "measurement-other", "snapshot-2", 1, "point")
	if _, err := journal.AppendConfirmed("record-2", "other", "records/record-2/evidence.json", time.Now(), other); err == nil {
		t.Fatal("cross-session record accepted")
	}
	drift := ev
	drift.Product.Runtime.Snapshot.Generation = 2
	if _, err := journal.AppendConfirmed("record-3", "drift", "records/record-3/evidence.json", time.Now(), drift); err == nil {
		t.Fatal("invalid snapshot/evidence drift accepted")
	}
	after, _ := journal.Snapshot()
	if !reflect.DeepEqual(before, after) {
		t.Fatal("failed append mutated prior session records")
	}
}

func TestMeasurementSessionJournalSavedAcknowledgementIsAtomic(t *testing.T) {
	journal, err := NewMeasurementSessionJournal("measurement-session-4")
	if err != nil {
		t.Fatal(err)
	}
	ev := sessionRecordEvidenceFixture(t, "measurement-session-4", "snapshot-1", 1, "point")
	for _, id := range []string{"record-1", "record-2"} {
		if _, err := journal.AppendConfirmed(id, id, "records/"+id+"/evidence.json", time.Now(), ev); err != nil {
			t.Fatal(err)
		}
	}
	if err := journal.MarkSaved("record-1", "missing"); err == nil {
		t.Fatal("missing record did not reject durable-save acknowledgement")
	}
	envelope, _ := journal.Snapshot()
	for _, record := range envelope.Measurements {
		if record.Status != MeasurementRecordConfirmed {
			t.Fatalf("partial saved state leaked after failed acknowledgement: %+v", envelope.Measurements)
		}
	}
	if err := journal.MarkSaved("record-1", "record-2"); err != nil {
		t.Fatal(err)
	}
	envelope, _ = journal.Snapshot()
	for _, record := range envelope.Measurements {
		if record.Status != MeasurementRecordSaved {
			t.Fatalf("saved acknowledgement not applied: %+v", envelope.Measurements)
		}
	}
}

func TestMeasurementSessionJournalBuildsAuthoringInputsPerRecordAndSnapshot(t *testing.T) {
	journal, err := NewMeasurementSessionJournal("measurement-session-5")
	if err != nil {
		t.Fatal(err)
	}
	first := sessionRecordEvidenceFixture(t, "measurement-session-5", "snapshot-1", 1, "region")
	second := sessionRecordEvidenceFixture(t, "measurement-session-5", "snapshot-2", 2, "spacing")
	if _, err := journal.AppendConfirmed("record-1", "region", "sessions/measurement-session-5/records/record-1/evidence.json", time.Now(), first); err != nil {
		t.Fatal(err)
	}
	if _, err := journal.AppendConfirmed("record-2", "spacing", "sessions/measurement-session-5/records/record-2/evidence.json", time.Now(), second); err != nil {
		t.Fatal(err)
	}
	inputs, err := journal.BuildAuthoringInputs(ConsumerAgentToRecipe, true, time.Date(2026, 9, 17, 12, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	if len(inputs) != 2 || inputs[0].Snapshot == nil || inputs[1].Snapshot == nil {
		t.Fatalf("authoring inputs=%+v", inputs)
	}
	if inputs[0].Snapshot.SnapshotID != "snapshot-1" || inputs[1].Snapshot.SnapshotID != "snapshot-2" {
		t.Fatalf("authoring snapshot lineage was merged: %+v", inputs)
	}
	if inputs[0].EvidenceRef == inputs[1].EvidenceRef {
		t.Fatal("authoring records lost per-record evidence references")
	}
}
