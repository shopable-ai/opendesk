package appshell

import "context"

// OpenURLHost is an optional native capability for OS-level URL activations.
// It transports the original URL string to the first-party App Mode owner.
// The native layer does not interpret install commands, file paths, Runtime
// arguments, credentials, or Marketplace metadata from the URL.
type OpenURLHost interface {
	SetOpenURLHandler(func(rawURL string))
}

// MarketplaceInstallPrompt contains only canonical Marketplace release and
// already-verified package display data. A local Flow trust decision is
// returned separately and is never inferred from Marketplace verification.
type MarketplaceInstallPrompt struct {
	FlowID               string
	ReleaseID            string
	Name                 string
	Version              string
	PublisherID          string
	PublisherKeyID       string
	PublisherFingerprint string
	VerifiedPublisher    bool
	SignatureVerified    bool
	TrustRequired        bool
}

// MarketplaceInstallHost is the local user-consent boundary for a Marketplace
// release. The caller must resolve the canonical Release and verify the
// complete package before showing this prompt; the returned decision defaults
// to Flow-scoped trust and can never silently create Publisher-wide trust.
// This interface must never receive a browser-provided artifact URL,
// credential, command, or executable content.
type MarketplaceInstallHost interface {
	ConfirmMarketplaceInstall(ctx context.Context, prompt MarketplaceInstallPrompt) (FlowTrustDecision, error)
}
