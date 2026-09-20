package flowinstall

import "testing"

func TestMarketplaceProvenanceRejectsSameReleaseRevisionRollback(t *testing.T) {
	record := Record{
		SchemaVersion: 1, InstallID: "flow-00000000000000000000000000000000", FlowID: "flow.demo", Name: "Demo",
		Version: "1.0.0", PublisherID: "publisher", PublisherKeyID: "key", PublisherFingerprint: "fingerprint",
		Entry: "main.js", ArchiveDigest: "archive", ManifestDigest: "manifest", State: StateReady, Origin: "marketplace",
		MarketplaceID: "market", ReleaseID: "release-1", UpdateChannel: "stable", MarketplaceMetadataRevision: 3,
		MarketplaceArtifactLocation: "flows/flow.demo/release-1/a.odflow",
	}
	if _, _, err := applyMarketplaceProvenance(record, &MarketplaceProvenance{
		MarketplaceID: "market", ReleaseID: "release-1", UpdateChannel: "stable", MetadataRevision: 2,
		ArtifactLocation: "flows/flow.demo/release-1/a.odflow",
	}); err == nil {
		t.Fatal("same Release metadata revision rollback was accepted")
	}
	if _, _, err := applyMarketplaceProvenance(record, &MarketplaceProvenance{
		MarketplaceID: "market", ReleaseID: "release-1", UpdateChannel: "stable", MetadataRevision: 3,
		ArtifactLocation: "flows/flow.demo/release-1/b.odflow",
	}); err == nil {
		t.Fatal("same metadata revision changed artifact location")
	}
	updated, changed, err := applyMarketplaceProvenance(record, &MarketplaceProvenance{
		MarketplaceID: "market", ReleaseID: "release-1", UpdateChannel: "stable", MetadataRevision: 4,
		ArtifactLocation: "flows/flow.demo/release-1/b.odflow",
	})
	if err != nil || !changed || updated.MarketplaceMetadataRevision != 4 || updated.MarketplaceArtifactLocation != "flows/flow.demo/release-1/b.odflow" {
		t.Fatalf("newer revision result = %+v changed=%v err=%v", updated, changed, err)
	}
	newRelease, changed, err := applyMarketplaceProvenance(updated, &MarketplaceProvenance{
		MarketplaceID: "market", ReleaseID: "release-2", UpdateChannel: "stable", MetadataRevision: 1,
		ArtifactLocation: "flows/flow.demo/release-2/a.odflow",
	})
	if err != nil || !changed || newRelease.ReleaseID != "release-2" || newRelease.MarketplaceMetadataRevision != 1 {
		t.Fatalf("new Release revision reset result = %+v changed=%v err=%v", newRelease, changed, err)
	}
}
