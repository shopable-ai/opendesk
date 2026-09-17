package flowcli

import (
	"flag"
	"io"
	"os"

	"opendesk/pkg/flow"
	"opendesk/pkg/scriptpackage"
)

type verificationState struct {
	Signature      string `json:"signature"`
	PublisherTrust string `json:"publisherTrust"`
	Authorization  string `json:"authorization"`
}

func runInspect(args []string, stdout io.Writer) int {
	command := "flow inspect"
	if len(args) != 1 {
		return writeError(stdout, command, "invalid_argument", "usage: opendesk flow inspect <file.odflow>")
	}
	pkg, err := flow.ReadFile(args[0])
	if err != nil {
		return writeFailure(stdout, command, err)
	}
	return writeSuccess(stdout, command, map[string]any{
		"manifest":      pkg.Manifest,
		"packageDigest": pkg.PackageDigest,
		"verification":  verificationState{Signature: "not_checked", PublisherTrust: "not_evaluated", Authorization: "not_evaluated"},
	})
}

func runVerify(args []string, stdout io.Writer) int {
	command := "flow verify"
	if len(args) == 0 {
		return writeError(stdout, command, "invalid_argument", "usage: opendesk flow verify <file.odflow> --public-key <publisher.pub>")
	}
	packagePath := args[0]
	fs := flag.NewFlagSet(command, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	var publicKeyPath string
	fs.StringVar(&publicKeyPath, "public-key", "", "publisher Ed25519 public key")
	if err := fs.Parse(args[1:]); err != nil || fs.NArg() != 0 || publicKeyPath == "" {
		return writeError(stdout, command, "invalid_argument", "--public-key is required")
	}
	pkg, err := flow.ReadFile(packagePath)
	if err != nil {
		return writeFailure(stdout, command, err)
	}
	publicBytes, err := os.ReadFile(publicKeyPath)
	if err != nil {
		return writeError(stdout, command, "invalid_argument", "cannot read publisher public key")
	}
	publicKey, err := scriptpackage.ParseEd25519PublicKey(publicBytes)
	if err != nil {
		return writeError(stdout, command, "invalid_argument", "publisher public key is invalid")
	}
	if err := flow.Verify(pkg, publicKey); err != nil {
		return writeFailure(stdout, command, err)
	}
	return writeSuccess(stdout, command, map[string]any{
		"packageDigest": pkg.PackageDigest,
		"manifest":      pkg.Manifest,
		"verification":  verificationState{Signature: "verified_candidate_key", PublisherTrust: "not_evaluated", Authorization: "not_evaluated"},
	})
}
