package flowmarketplace

import (
	"context"
	"errors"
	"fmt"

	"opendesk/pkg/flowinstall"
	"opendesk/pkg/flowpackage"
)

type InstallConfirmer interface {
	ConfirmMarketplaceInstall(context.Context, Release, flowinstall.VerifiedInstallCandidate) (flowinstall.VerifiedInstallApproval, error)
}

// InstallConfirmerFunc adapts a host-owned local confirmation callback without
// making the Marketplace package depend on a particular desktop UI toolkit.
type InstallConfirmerFunc func(context.Context, Release, flowinstall.VerifiedInstallCandidate) (flowinstall.VerifiedInstallApproval, error)

func (fn InstallConfirmerFunc) ConfirmMarketplaceInstall(ctx context.Context, release Release, candidate flowinstall.VerifiedInstallCandidate) (flowinstall.VerifiedInstallApproval, error) {
	if fn == nil {
		return flowinstall.VerifiedInstallApproval{}, errors.New("marketplace installation confirmation is unavailable")
	}
	return fn(ctx, release, candidate)
}

type EntitlementResolver interface {
	AuthorizeMarketplaceInstall(context.Context, Release) error
}

// EntitlementResolverFunc adapts the account/subscription owner. It receives
// only a verified canonical Release, never Deep Link credentials or browser
// state.
type EntitlementResolverFunc func(context.Context, Release) error

func (fn EntitlementResolverFunc) AuthorizeMarketplaceInstall(ctx context.Context, release Release) error {
	if fn == nil {
		return errors.New("marketplace entitlement resolver is unavailable")
	}
	return fn(ctx, release)
}

type Installer struct {
	Client      *Client
	FlowService *flowinstall.Service
	Confirmer   InstallConfirmer
	Entitlement EntitlementResolver
	TempRoot    string
}

// DeepLinkHandler is the desktop protocol-handler boundary. It always parses
// the raw OS activation before invoking any installer, so an unsupported URL
// cannot be accidentally forwarded to a future implementation. Its Installer
// is intentionally an interface to keep OS hosts independent from HTTP,
// account, and native UI implementations.
type DeepLinkHandler struct {
	Installer interface {
		InstallURL(context.Context, string, flowinstall.InstallOptions) (flowinstall.InstallResult, error)
	}
	InstallOptions func(context.Context) flowinstall.InstallOptions
}

func (handler DeepLinkHandler) Handle(ctx context.Context, rawURL string) (flowinstall.InstallResult, error) {
	if _, err := ParseInstallURL(rawURL); err != nil {
		return flowinstall.InstallResult{}, err
	}
	if handler.Installer == nil {
		return flowinstall.InstallResult{}, errors.New("Marketplace installation is not configured in this OpenDesk build")
	}
	options := flowinstall.InstallOptions{}
	if handler.InstallOptions != nil {
		options = handler.InstallOptions(ctx)
	}
	return handler.Installer.InstallURL(ctx, rawURL, options)
}

// InstallURL is the Web/In-App Marketplace orchestration layer. It resolves a
// controlled identifier-only install intent, checks Marketplace account
// entitlement, downloads the canonical artifact, verifies its release
// identity and package signature, then asks for one local confirmation before
// delegating the commit to FlowInstallService. It deliberately never calls the
// Runtime execution path.
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
	if err := installer.rejectKnownMetadataRollback(release); err != nil {
		return flowinstall.InstallResult{}, err
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
	// Marketplace attestation proves Release identity only. It must never be
	// translated into flowinstall.AuthorityProof or Local Publisher Trust. The
	// release/package match executes inside FlowInstall immediately after its
	// one canonical package read, avoiding a verification-to-install TOCTOU.
	// The native consent callback follows that verification and precedes every
	// Flow, trust, and Catalog mutation.
	options.AuthorityProof = nil
	options.VerifyPackage = func(_ context.Context, flowPackage *flowpackage.Package) error {
		return matchReleasePackage(release, flowPackage)
	}
	options.Confirmer = func(ctx context.Context, candidate flowinstall.VerifiedInstallCandidate) (flowinstall.VerifiedInstallApproval, error) {
		return installer.Confirmer.ConfirmMarketplaceInstall(ctx, release, candidate)
	}
	options.Marketplace = &flowinstall.MarketplaceProvenance{
		MarketplaceID: release.MarketplaceID,
		ReleaseID:         release.ReleaseID,
		UpdateChannel:     release.UpdateChannel,
		MetadataRevision: release.MetadataRevision,
	}
	return installer.FlowService.Install(ctx, artifactPath, options)
}

func (installer *Installer) rejectKnownMetadataRollback(release Release) error {
	installID := flowinstall.InstallID(release.PublisherSigningKeyFingerprint, release.FlowID)
	current, err := installer.FlowService.Catalog.Load(installID)
	if err != nil {
		if flowinstall.CodeOf(err) == flowinstall.CodeNotFound {
			return nil
		}
		return fmt.Errorf("read current Marketplace install provenance: %w", err)
	}
	if current.Origin == "marketplace" &&
		current.MarketplaceID == release.MarketplaceID &&
		current.ReleaseID == release.ReleaseID {
		if current.ArchiveDigest != release.ArtifactDigest {
			return fmt.Errorf("marketplace release identity cannot be rebound to a different artifact digest")
		}
		if release.MetadataRevision < current.MarketplaceMetadataRevision {
			return fmt.Errorf("marketplace release metadata revision rollback is not allowed")
		}
	}
	return nil
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
