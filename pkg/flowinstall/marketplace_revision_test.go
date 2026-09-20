package flowinstall

import "testing"

func TestMarketplaceProvenanceRejectsSameReleaseRevisionRollback(t *testing.T) {
	record := Record{
		SchemaVersion: 1, InstallID: "flow-00000000000000000000000000000000", FlowID: "flow.demo", Name: "Demo",
		Version: "1.0.0", PublisherID: "publisher", PublisherKeyID: "key", PublisherFingerprint: "fingerprint",
		Entry: "main.js", ArchiveDigest: "archive", ManifestDigest: "manifest", State: StateReady, Origin: "marketplace",
		MarketplaceID: "market", ReleaseID: "release-1", UpdateChannel: "stable", MarketplaceMetadataRevision: 3,
	}
	if _, _, err := applyMarketplaceProvenance(record, &MarketplaceProvenance{
		MarketplaceID: "market", ReleaseID: "release-1", UpdateChannel: "stable", MetadataRevision: 2,
	}); err == nil {
		t.Fatal("same Release metadata revision rollback was accepted")
	}
	updated, changed, err := applyMarketplaceProvenance(record, &MarketplaceProvenance{
		MarketplaceID: "market", ReleaseID: "release-1", UpdateChannel: "stable", MetadataRevision: 4,
	})
	if err != nil || !changed || updated.MarketplaceMetadataRevision != 4 {
		t.Fatalf("newer revision result = %+v changed=%v err=%v", updated, changed, err)
	}
	newRelease, changed, err := applyMarketplaceProvenance(updated, &MarketplaceProvenance{
		MarketplaceID: "market", ReleaseID: "release-2", UpdateChannel: "stable", MetadataRevision: 1,
	})
	if err != nil || !changed || newRelease.ReleaseID != "release-2" || newRelease.MarketplaceMetadataRevision != 1 {
		t.Fatalf("new Release revision reset result = %+v changed=%v err=%v", newRelease, changed, err)
	}
}
