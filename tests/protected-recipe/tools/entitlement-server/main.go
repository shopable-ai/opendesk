package main

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/tls"
	"errors"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"opendesk/pkg/entitlement"
	"opendesk/pkg/entitlementservice"
	"opendesk/pkg/licensing"
	"opendesk/pkg/scriptpackage"
)

type fixedMaterials struct {
	material entitlementservice.IssuanceMaterial
}

func (provider fixedMaterials) Resolve(_ context.Context, binding entitlement.PackageBinding) (entitlementservice.IssuanceMaterial, error) {
	if binding != provider.material.Package {
		return entitlementservice.IssuanceMaterial{}, licensing.NewError(licensing.CodeLicenseDenied, "package is not configured", nil)
	}
	material := provider.material
	material.ContentKey = append([]byte(nil), material.ContentKey...)
	material.LicenseSigningKey = append(ed25519.PrivateKey(nil), material.LicenseSigningKey...)
	return material, nil
}

func main() {
	var (
		listen         = flag.String("listen", "127.0.0.1:0", "TLS listen address")
		certificate    = flag.String("tls-cert", "", "TLS certificate PEM")
		certificateKey = flag.String("tls-key", "", "TLS private key PEM")
		packagePath    = flag.String("package", "", "protected recipe package")
		contentKeyPath = flag.String("content-key", "", "package content key")
		signingKeyPath = flag.String("signing-key", "", "online entitlement Ed25519 private key")
		tokenPath      = flag.String("token-file", "", "Bearer credential file")
		readyPath      = flag.String("ready-file", "", "write HTTPS endpoint when listening")
		subjectID      = flag.String("subject-id", "subject-live", "authenticated subject")
		entitlementID  = flag.String("entitlement-id", "entitlement-live", "entitlement identifier")
		issuerKeyID    = flag.String("issuer-key-id", "issuer-live", "online issuer public key identifier")
		deviceLimit    = flag.Int("device-limit", 1, "maximum active devices")
		offlineGrace   = flag.Duration("offline-grace", 24*time.Hour, "signed offline grace")
		refreshAfter   = flag.Duration("refresh-after", 12*time.Hour, "refresh hint")
		expiresIn      = flag.Duration("expires-in", 24*time.Hour, "entitlement lifetime")
	)
	flag.Parse()
	for name, value := range map[string]string{
		"--tls-cert": *certificate, "--tls-key": *certificateKey, "--package": *packagePath,
		"--content-key": *contentKeyPath, "--signing-key": *signingKeyPath,
		"--token-file": *tokenPath, "--ready-file": *readyPath,
	} {
		if strings.TrimSpace(value) == "" {
			fatalf("%s is required", name)
		}
	}
	protectedPackage, err := scriptpackage.ReadFile(*packagePath)
	if err != nil {
		fatalf("read package: %v", err)
	}
	binding := entitlement.PackageBinding{
		PublisherID: protectedPackage.Manifest.PublisherID, PublisherKeyID: protectedPackage.Manifest.PublisherKeyID,
		ProductID: protectedPackage.Manifest.ProductID, PackageID: protectedPackage.Manifest.PackageID,
		ContentKeyID: protectedPackage.Manifest.Encryption.KeyID,
	}
	contentKeyFile, err := os.ReadFile(*contentKeyPath)
	if err != nil {
		fatalf("read content key: %v", err)
	}
	defer zero(contentKeyFile)
	contentKey, err := scriptpackage.ParseContentKey(contentKeyFile)
	if err != nil {
		fatalf("parse content key: %v", err)
	}
	defer zero(contentKey)
	signingKeyFile, err := os.ReadFile(*signingKeyPath)
	if err != nil {
		fatalf("read signing key: %v", err)
	}
	defer zero(signingKeyFile)
	signingKey, err := scriptpackage.ParseEd25519PrivateKey(signingKeyFile)
	if err != nil {
		fatalf("parse signing key: %v", err)
	}
	defer zero(signingKey)
	tokenFile, err := os.ReadFile(*tokenPath)
	if err != nil {
		fatalf("read token: %v", err)
	}
	defer zero(tokenFile)
	token := bytes.TrimSpace(tokenFile)
	authenticator, err := entitlementservice.NewMemoryAuthenticator(entitlementservice.Credential{SubjectID: *subjectID, Token: token})
	if err != nil {
		fatalf("configure authenticator: %v", err)
	}
	registry, err := entitlementservice.NewMemoryRegistry(entitlementservice.EntitlementRecord{
		EntitlementID: *entitlementID,
		SubjectID:     *subjectID,
		Package:       binding,
		DeviceLimit:   *deviceLimit,
		ExpiresAt:     time.Now().UTC().Add(*expiresIn),
	})
	if err != nil {
		fatalf("configure registry: %v", err)
	}
	handler := entitlementservice.Handler{
		Authenticator: authenticator,
		Registry:      registry,
		Issuer: entitlementservice.SignedCacheIssuer{
			Materials: fixedMaterials{material: entitlementservice.IssuanceMaterial{
				Package: binding, IssuerKeyID: *issuerKeyID,
				ContentKey: contentKey, LicenseSigningKey: signingKey,
			}},
			OfflineGrace: *offlineGrace,
			RefreshAfter: *refreshAfter,
		},
	}
	listener, err := net.Listen("tcp", *listen)
	if err != nil {
		fatalf("listen: %v", err)
	}
	endpoint := "https://" + listener.Addr().String()
	if err := os.WriteFile(*readyPath, []byte(endpoint+"\n"), 0o600); err != nil {
		_ = listener.Close()
		fatalf("write ready file: %v", err)
	}
	server := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		TLSConfig:         &tls.Config{MinVersion: tls.VersionTLS12},
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdownContext, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdownContext)
	}()
	if err := server.ServeTLS(listener, *certificate, *certificateKey); err != nil && !errors.Is(err, http.ErrServerClosed) {
		fatalf("serve TLS: %v", err)
	}
}

func zero(value []byte) {
	for index := range value {
		value[index] = 0
	}
}

func fatalf(format string, arguments ...any) {
	_, _ = fmt.Fprintf(os.Stderr, format+"\n", arguments...)
	os.Exit(1)
}
