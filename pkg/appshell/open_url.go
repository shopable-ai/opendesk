package appshell

import "context"

// OpenURLHost is an optional native capability for OS-level URL activations.
// It transports the original URL string to the first-party App Mode owner.
// The native layer does not interpret install commands, file paths, Runtime
// arguments, credentials, or Marketplace metadata from the URL.
type OpenURLHost interface {
	SetOpenURLHandler(func(rawURL string))
}

// MarketplaceInstallPrompt contains only already-attested Marketplace release
// display data. It is intentionally separate from FlowTrustPrompt: confirming
// an installation does not grant either Flow-local or Publisher-wide trust.
type MarketplaceInstallPrompt struct {
	FlowID            string
	ReleaseID         string
	Name              string
	Version           string
	PublisherID       string
	VerifiedPublisher bool
}

// MarketplaceInstallHost is the local user-consent boundary for a Marketplace
// release. The caller must resolve and verify the canonical Release before
// showing this prompt; this interface must never receive a browser-provided
// artifact URL, credential, command, or executable content.
type MarketplaceInstallHost interface {
	ConfirmMarketplaceInstall(ctx context.Context, prompt MarketplaceInstallPrompt) (bool, error)
}
