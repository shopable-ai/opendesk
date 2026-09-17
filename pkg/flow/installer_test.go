package flow

import (
	"bytes"
	"crypto/ed25519"
	"os"
	"path/filepath"
	"testing"
	"time"
)

type flowInstallerFixture struct {
	publisherPrivate ed25519.PrivateKey
	publisherPublic  ed25519.PublicKey
	issuerPublic     ed25519.PublicKey
}

func newFlowInstallerFixture() flowInstallerFixture {
	publisherSeed := bytes.Repeat([]byte{0x31}, ed25519.SeedSize)
	issuerSeed := bytes.Repeat([]byte{0x52}, ed25519.SeedSize)
	publisherPrivate := ed25519.NewKeyFromSeed(publisherSeed)
	issuerPrivate := ed25519.NewKeyFromSeed(issuerSeed)
	return flowInstallerFixture{
		publisherPrivate: publisherPrivate,
		publisherPublic:  publisherPrivate.Public().(ed25519.PublicKey),
		issuerPublic:     issuerPrivate.Public().(ed25519.PublicKey),
	}
}

func (fixture flowInstallerFixture) writePackage(t *testing.T, flowID, name, version, source string, commercial bool) string {
	t.Helper()
	manifest := Manifest{
		SchemaVersion:         SchemaVersion,
		FlowID:                flowID,
		Name:                  name,
		Version:               version,
		PublisherID:           "com.opendesk.tests.publisher",
		PublisherKeyID:        "publisher-key-v1",
		Entry:                 EntrypointMainJS,
		MinimumRuntimeVersion: "0.0.0",
		Platforms:             []string{"darwin", "windows"},
	}
	inputs := []InputFile{
		{Path: EntrypointMainJS, Data: []byte(source)},
		{Path: PublisherPublicKeyEntryName, Data: append([]byte(nil), fixture.publisherPublic...)},
	}
	if commercial {
		manifest.Commercial = &CommercialManifest{
			ProductID:          "com.opendesk.tests.product",
			LicenseIssuerKeyID: "issuer-key-v1",
			Purposes:           []string{"run"},
		}
		inputs = append(inputs, InputFile{Path: LicenseIssuerPublicKeyEntryName, Data: append([]byte(nil), fixture.issuerPublic...)})
	}
	result, err := Build(manifest, inputs, fixture.publisherPrivate)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "fixture.odflow")
	if err := os.WriteFile(path, result.Data, 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func requireFlowCode(t *testing.T, err error, want ErrorCode) {
	t.Helper()
	if err == nil || CodeOf(err) != want {
		t.Fatalf("error = %v code=%q, want code=%q", err, CodeOf(err), want)
	}
}

func TestInstallerRequiresIndependentTrustAndPersistsCatalog(t *testing.T) {
	fixture := newFlowInstallerFixture()
	root := t.TempDir()
	installer, err := NewInstaller(root)
	if err != nil {
		t.Fatal(err)
	}
	packagePath := fixture.writePackage(t, "com.opendesk.tests.flow-a", "Same Display Name", "1.0.0", "console.log('v1');\n", false)

	_, err = installer.InstallFile(packagePath, InstallOptions{})
	requireFlowCode(t, err, CodePublisherTrustRequired)
	if entries, listErr := installer.List(); listErr != nil || len(entries) != 0 {
		t.Fatalf("untrusted package changed catalog: entries=%v err=%v", entries, listErr)
	}

	result, err := installer.InstallFile(packagePath, InstallOptions{Approval: TrustApprovalFlow})
	if err != nil {
		t.Fatal(err)
	}
	if result.Entry.State != InstallStateReady || result.Entry.TrustScope != TrustScopeFlow || result.Idempotent {
		t.Fatalf("unexpected install result: %+v", result)
	}
	if result.SignatureStatus != "verified_candidate_key" || result.TrustStatus != "trusted" {
		t.Fatalf("signature/trust states were conflated: %+v", result)
	}

	reopened, err := NewInstaller(root)
	if err != nil {
		t.Fatal(err)
	}
	entries, err := reopened.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 1 || entries[0].InstallID != result.Entry.InstallID || entries[0].FlowID != "com.opendesk.tests.flow-a" {
		t.Fatalf("catalog did not persist across reopen: %+v", entries)
	}
	idempotent, err := reopened.InstallFile(packagePath, InstallOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if !idempotent.Idempotent || idempotent.Entry.InstallID != result.Entry.InstallID {
		t.Fatalf("same package was not idempotent: %+v", idempotent)
	}

	conflicting := fixture.writePackage(t, "com.opendesk.tests.flow-a", "Same Display Name", "1.0.0", "console.log('different bytes');\n", false)
	_, err = reopened.InstallFile(conflicting, InstallOptions{})
	requireFlowCode(t, err, CodeInstallConflict)
	entries, err = reopened.List()
	if err != nil || len(entries) != 1 || entries[0].PackageDigest != result.Entry.PackageDigest {
		t.Fatalf("conflicting same-version package damaged existing install: entries=%+v err=%v", entries, err)
	}
}

func TestInstallerTrustScopeAndPublisherIdentityAreNotDisplayIdentity(t *testing.T) {
	fixture := newFlowInstallerFixture()
	installer, err := NewInstaller(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	flowA := fixture.writePackage(t, "com.opendesk.tests.flow-a", "Duplicate Name", "1.0.0", "console.log('a');\n", false)
	flowB := fixture.writePackage(t, "com.opendesk.tests.flow-b", "Duplicate Name", "1.0.0", "console.log('b');\n", false)

	if _, err := installer.InstallFile(flowA, InstallOptions{Approval: TrustApprovalFlow}); err != nil {
		t.Fatal(err)
	}
	_, err = installer.InstallFile(flowB, InstallOptions{})
	requireFlowCode(t, err, CodePublisherTrustRequired)
	if _, err := installer.InstallFile(flowB, InstallOptions{Approval: TrustApprovalPublisher}); err != nil {
		t.Fatal(err)
	}
	flowC := fixture.writePackage(t, "com.opendesk.tests.flow-c", "Duplicate Name", "1.0.0", "console.log('c');\n", false)
	if _, err := installer.InstallFile(flowC, InstallOptions{}); err != nil {
		t.Fatalf("publisher-scoped approval did not apply to another flow signed by the same publisher key: %v", err)
	}
	entries, err := installer.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 3 {
		t.Fatalf("display name was incorrectly used as identity: %+v", entries)
	}

	rejected := fixture.writePackage(t, "com.opendesk.tests.flow-rejected", "Rejected", "1.0.0", "console.log('reject');\n", false)
	if _, err := installer.DecidePublisher(rejected, TrustScopeFlow, TrustStatusRejected, nil); err != nil {
		t.Fatal(err)
	}
	_, err = installer.InstallFile(rejected, InstallOptions{Approval: TrustApprovalFlow})
	requireFlowCode(t, err, CodePublisherRejected)
}

func TestCommercialInstallIsNeedsActivationAndUpdateCannotReplaceReadyVersion(t *testing.T) {
	fixture := newFlowInstallerFixture()
	installer, err := NewInstaller(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	commercial := fixture.writePackage(t, "com.opendesk.tests.commercial", "Commercial", "1.0.0", "console.log('commercial');\n", true)
	commercialResult, err := installer.InstallFile(commercial, InstallOptions{Approval: TrustApprovalPublisher})
	if err != nil {
		t.Fatal(err)
	}
	if commercialResult.Entry.State != InstallStateNeedsActivation || commercialResult.Entry.ProductID == "" {
		t.Fatalf("commercial flow was marked runnable/ready: %+v", commercialResult.Entry)
	}

	readyV1 := fixture.writePackage(t, "com.opendesk.tests.updatable", "Updatable", "1.0.0", "console.log('ready-v1');\n", false)
	readyResult, err := installer.InstallFile(readyV1, InstallOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if readyResult.Entry.State != InstallStateReady {
		t.Fatalf("ordinary flow should be ready after publisher trust: %+v", readyResult.Entry)
	}
	commercialV2 := fixture.writePackage(t, "com.opendesk.tests.updatable", "Updatable", "2.0.0", "console.log('paid-v2');\n", true)
	pending, err := installer.InstallFile(commercialV2, InstallOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if !pending.PendingUpdate || pending.Entry.Version != "1.0.0" || pending.Entry.Pending == nil || pending.Entry.Pending.Version != "2.0.0" || pending.Entry.Pending.State != InstallStateNeedsActivation {
		t.Fatalf("paid update replaced active ready version before activation: %+v", pending.Entry)
	}
	activeSource, err := os.ReadFile(filepath.Join(installer.Store.contentRoot(readyResult.Entry.InstallID), EntrypointMainJS))
	if err != nil {
		t.Fatal(err)
	}
	if string(activeSource) != "console.log('ready-v1');\n" {
		t.Fatalf("pending update changed active content: %q", activeSource)
	}

	conflictingPending := fixture.writePackage(t, "com.opendesk.tests.updatable", "Updatable", "2.0.0", "console.log('different-paid-v2');\n", true)
	_, err = installer.InstallFile(conflictingPending, InstallOptions{})
	requireFlowCode(t, err, CodeInstallConflict)
}

func TestRecoveryRollsBackPreCatalogCrashAndCompletesPostCatalogCrash(t *testing.T) {
	fixture := newFlowInstallerFixture()
	for _, scenario := range []struct {
		name               string
		activateCatalog     bool
		wantVersion         string
		wantSource          string
	}{
		{name: "rollback before catalog activation", activateCatalog: false, wantVersion: "1.0.0", wantSource: "console.log('old');\n"},
		{name: "commit after catalog activation", activateCatalog: true, wantVersion: "2.0.0", wantSource: "console.log('new');\n"},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			installer, err := NewInstaller(t.TempDir())
			if err != nil {
				t.Fatal(err)
			}
			oldPackage := fixture.writePackage(t, "com.opendesk.tests.recovery", "Recovery", "1.0.0", "console.log('old');\n", false)
			oldResult, err := installer.InstallFile(oldPackage, InstallOptions{Approval: TrustApprovalPublisher})
			if err != nil {
				t.Fatal(err)
			}
			newPackagePath := fixture.writePackage(t, "com.opendesk.tests.recovery", "Recovery", "2.0.0", "console.log('new');\n", false)
			newPackage, err := ReadFile(newPackagePath)
			if err != nil {
				t.Fatal(err)
			}
			existing, err := installer.Store.FindInstall(oldResult.Entry.InstallID)
			if err != nil {
				t.Fatal(err)
			}
			candidate := *existing
			candidate.Version = newPackage.Manifest.Version
			candidate.Name = newPackage.Manifest.Name
			candidate.PackageDigest = newPackage.PackageDigest
			candidate.UpdatedAt = time.Now().UTC()
			candidate.Pending = nil

			tx, err := installer.Store.newTransaction(transactionInstall, existing.InstallID, newPackage.PackageDigest, nil, false, time.Now().UTC())
			if err != nil {
				t.Fatal(err)
			}
			if _, err := tx.stagePackage(newPackage, "content.next"); err != nil {
				t.Fatal(err)
			}
			if err := tx.stageCatalog(candidate); err != nil {
				t.Fatal(err)
			}
			if err := tx.mark("prepared"); err != nil {
				t.Fatal(err)
			}
			live := installer.Store.contentRoot(existing.InstallID)
			if moved, err := moveExisting(live, filepath.Join(tx.root, "content.prev")); err != nil || !moved {
				t.Fatalf("preserve old content: moved=%v err=%v", moved, err)
			}
			if err := tx.mark("old-content-moved"); err != nil {
				t.Fatal(err)
			}
			if err := renameAbsent(filepath.Join(tx.root, "content.next"), live); err != nil {
				t.Fatal(err)
			}
			if err := tx.mark("content-active"); err != nil {
				t.Fatal(err)
			}
			if scenario.activateCatalog {
				if err := tx.activateCatalog(); err != nil {
					t.Fatal(err)
				}
			}

			if err := installer.Recover(); err != nil {
				t.Fatal(err)
			}
			recovered, err := installer.Store.FindInstall(existing.InstallID)
			if err != nil {
				t.Fatal(err)
			}
			if recovered.Version != scenario.wantVersion {
				t.Fatalf("recovered version=%s, want %s", recovered.Version, scenario.wantVersion)
			}
			source, err := os.ReadFile(filepath.Join(live, EntrypointMainJS))
			if err != nil {
				t.Fatal(err)
			}
			if string(source) != scenario.wantSource {
				t.Fatalf("recovered source=%q, want %q", source, scenario.wantSource)
			}
			transactions, err := os.ReadDir(installer.Store.transactionsRoot())
			if err != nil || len(transactions) != 0 {
				t.Fatalf("recovery left transaction debris: entries=%v err=%v", transactions, err)
			}
		})
	}
}

func TestUninstallPreservesOtherFlowsSharedTrustAndUserDataByDefault(t *testing.T) {
	fixture := newFlowInstallerFixture()
	installer, err := NewInstaller(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	flowA := fixture.writePackage(t, "com.opendesk.tests.uninstall-a", "A", "1.0.0", "console.log('a');\n", false)
	flowB := fixture.writePackage(t, "com.opendesk.tests.uninstall-b", "B", "1.0.0", "console.log('b');\n", false)
	installedA, err := installer.InstallFile(flowA, InstallOptions{Approval: TrustApprovalPublisher})
	if err != nil {
		t.Fatal(err)
	}
	installedB, err := installer.InstallFile(flowB, InstallOptions{})
	if err != nil {
		t.Fatal(err)
	}
	dataFile := filepath.Join(installer.Store.flowDataRoot(installedA.Entry.InstallID), "user-state.txt")
	if err := os.WriteFile(dataFile, []byte("preserve me"), 0o600); err != nil {
		t.Fatal(err)
	}
	trustBefore, err := installer.Store.loadTrustRecords()
	if err != nil || len(trustBefore) == 0 {
		t.Fatalf("expected publisher trust record: records=%+v err=%v", trustBefore, err)
	}

	if err := installer.Uninstall(installedA.Entry.InstallID, UninstallOptions{}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(dataFile); err != nil {
		t.Fatalf("default uninstall removed Flow user data: %v", err)
	}
	entries, err := installer.List()
	if err != nil || len(entries) != 1 || entries[0].InstallID != installedB.Entry.InstallID {
		t.Fatalf("uninstall damaged another flow: entries=%+v err=%v", entries, err)
	}
	trustAfter, err := installer.Store.loadTrustRecords()
	if err != nil || len(trustAfter) != len(trustBefore) {
		t.Fatalf("uninstall removed shared publisher trust: before=%d after=%d err=%v", len(trustBefore), len(trustAfter), err)
	}

	if err := installer.Uninstall(installedB.Entry.InstallID, UninstallOptions{PurgeData: true}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(installer.Store.flowDataRoot(installedB.Entry.InstallID)); !os.IsNotExist(err) {
		t.Fatalf("purge-data uninstall left its own data directory: %v", err)
	}
}
