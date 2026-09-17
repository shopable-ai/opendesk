package appshell

// OpenURLHost is an optional native capability for OS-level URL activations.
// It transports the original URL string to the first-party App Mode owner.
// The native layer does not interpret install commands, file paths, Runtime
// arguments, credentials, or Marketplace metadata from the URL.
type OpenURLHost interface {
	SetOpenURLHandler(func(rawURL string))
}
