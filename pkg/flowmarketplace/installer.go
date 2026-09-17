package flowmarketplace

import (
	"context"
	"fmt"

	"opendesk/pkg/flowinstall"
	"opendesk/pkg/flowpackage"
)

type InstallConfirmer interface {
	ConfirmMarketplaceInstall(context.Context, Release) (bool, error)
}

type EntitlementResolver interface {
	AuthorizeMarketplaceInstall(context.Context, Release) error
}

type Installer struct {
	Client      *Client
	FlowService *flowinstall.Service
	Confirmer   InstallConfirmer
	Entitlement EntitlementResolver
	TempRoot    string
}

// InstallURL is the Web/In-App Marketplace orchestration layer. It resolves a
// controlled identifier-only install intent, requires a local confirmation,
// checks Marketplace account entitlement, verifies the downloaded Release
// identity, and then delegates the actual installation to FlowInstallService.
// It deliberately never calls the Runtime execution path.
func (installer *Installer) InstallURL(ctx context.Context, rawURL string, options flowinstall.InstallOptions) (flowinstall.InstallResult, error) {
	if installer == nil || installer.Client == nil || installer.FlowService == nil {
		return flowinstall.InstallResult{}, fmt.Errorf("marketplace installer is unavailable")
	}
	if installer.Confirmer == nil {
		return flowinstall.InstallResult{}, fmt.Errorf("marketplace installation requires local user confirmation")
	}
	ref, err := ParseInstallURL(rawURL)
	if err != nil {
		return flowinstall.InstallResult{}, err
	}
	resolved, err := installer.Client.ResolveInstallIntent(ctx, ref)
	if err != nil {
		return flowinstall.InstallResult{}, err
	}
	release := resolved.Release
	confirmed, err := installer.Confirmer.ConfirmMarketplaceInstall(ctx, release)
	if err != nil {
		return flowinstall.InstallResult{}, err
	}
	if !confirmed {
		return flowinstall.InstallResult{}, fmt.Errorf("marketplace installation was canceled")
	}
	if release.EntitlementPolicy != EntitlementFree {
		if installer.Entitlement == nil {
			return flowinstall.InstallResult{}, fmt.Errorf("marketplace entitlement is required for this release")
		}
		if err := installer.Entitlement.AuthorizeMarketplaceInstall(ctx, release); err != nil {
			return flowinstall.InstallResult{}, fmt.Errorf("marketplace entitlement denied: %w", err)
		}
	}
	artifactPath, cleanup, err := installer.Client.DownloadArtifact(ctx, release, installer.TempRoot)
	if err != nil {
		return flowinstall.InstallResult{}, err
	}
	defer cleanup()
	flowPackage, err := flowpackage.ReadFile(artifactPath)
	if err != nil {
		return flowinstall.InstallResult{}, err
	}
	if err := matchReleasePackage(release, flowPackage); err != nil {
		return flowinstall.InstallResult{}, err
	}

	// Marketplace attestation proves Release identity only. It must never be
	// translated into flowinstall.AuthorityProof or Local Publisher Trust.
	// Unknown publishers still go through the same explicit trust approver as
	// side-loaded .odflow files. Provenance is committed by the same install
	// transaction as package content and the Local Flow Catalog record.
	options.AuthorityProof = nil
	options.Marketplace = &flowinstall.MarketplaceProvenance{
		MarketplaceID: release.MarketplaceID,
		ReleaseID:     release.ReleaseID,
		UpdateChannel: release.UpdateChannel,
	}
	return installer.FlowService.Install(ctx, artifactPath, options)
}

func matchReleasePackage(release Release, flowPackage *flowpackage.Package) error {
	if flowPackage == nil {
		return fmt.Errorf("marketplace artifact verification returned no Flow package")
	}
	manifest := flowPackage.Manifest
	if flowPackage.ArchiveDigest != release.ArtifactDigest ||
		manifest.FlowID != release.FlowID || manifest.Name != release.FlowName || manifest.Version != release.Version ||
		manifest.PublisherID != release.PublisherID || manifest.PublisherKeyID != release.PublisherSigningKeyID ||
		manifest.PublisherFingerprint != release.PublisherSigningKeyFingerprint ||
		manifest.MinimumRuntimeVersion != release.MinimumOpenDeskVersion {
		return fmt.Errorf("marketplace release metadata does not match the verified .odflow package")
	}
	return nil
}
