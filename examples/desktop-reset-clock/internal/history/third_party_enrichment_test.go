package history

import (
	"testing"
	"time"
)

func TestThirdPartyArchiveCanEnrichUnknownSourceTimeButNotRewriteKnownTime(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Second)
	posted := now.Add(-time.Hour)
	id := "codex-reset:post:source"
	at := now.Add(-90 * time.Minute)
	initial := Record{ID: id, Revision: 1, Kind: "third_party_reset", State: "active", SourceType: "third_party", Audience: "public", ProviderReportedAt: &at, SourceURL: "https://x.com/a/status/123"}
	enriched := initial
	enriched.Revision = 2
	enriched.SourcePublishedAt = &posted
	archive := Archive{ChannelID: "test", ArchiveVersion: 2, CoverageStart: now.Add(-24 * time.Hour), CoverageEnd: now, Complete: false, Records: []Record{initial, enriched}}
	if err := ValidateArchive(archive); err != nil {
		t.Fatalf("allowed late evidence rejected: %v", err)
	}
	changed := enriched
	another := now.Add(-2 * time.Hour)
	changed.Revision = 3
	changed.SourcePublishedAt = &another
	archive.Records = append(archive.Records, changed)
	if err := ValidateArchive(archive); err == nil {
		t.Fatal("rewritten original source time was accepted")
	}
	archive.Records[2].SourcePublishedAt = nil
	if err := ValidateArchive(archive); err == nil {
		t.Fatal("previously known original source time was discarded")
	}
}