package browserbridge

// SocketRecoveryOptions is a local administrator operation. The legacy flag
// records the caller's independently verified quiescence, not an inference
// from a refused connection or from acquiring a newly introduced lock.
type SocketRecoveryOptions struct {
	ExtensionID    string
	ExpectedDevice uint64
	ExpectedInode  uint64
	DryRun         bool
	LegacyQuiesced bool
}
