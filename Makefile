SHELL := /bin/zsh

GO ?= go
GOBIN ?= $(HOME)/go/bin
export PATH := $(GOBIN):$(PATH)

.PHONY: help doctor setup deps fmt vet test test-core test-runtime-api test-runtime-api-live test-host-api test-host-api-live audit-layout build build-macos smoke

help:
	@echo "clawdesk development targets:"
	@echo "  make doctor      Check required toolchain and native capabilities"
	@echo "  make setup       Download Go modules and install Go developer tools"
	@echo "  make deps        Download Go modules only"
	@echo "  make fmt         Format Go sources"
	@echo "  make vet         Run go vet"
	@echo "  make test        Run the complete Go test suite"
	@echo "  make test-core   Run core packages (skips known fixture/demo package conflicts)"
	@echo "  make test-runtime-api Run non-live Runtime API contract, unit, smoke, failure-exit, and negative gates"
	@echo "  make test-runtime-api-live Run Runtime API tests against the Safari Test Lab"
	@echo "  make test-host-api Deprecated alias for test-runtime-api"
	@echo "  make test-host-api-live Deprecated alias for test-runtime-api-live"
	@echo "  make audit-layout Verify repository lifecycle and root-directory rules"
	@echo "  make build       Build the clawdesk binary"
	@echo "  make build-macos Build the macOS app bundle"
	@echo "  make smoke       Run the non-UI smoke path"

doctor:
	@set -e; \
	command -v $(GO) >/dev/null && $(GO) version; \
	$(GO) env GOPATH GOROOT GOOS GOARCH CGO_ENABLED; \
	command -v git >/dev/null && git --version; \
	command -v clang >/dev/null && clang --version | head -1; \
	command -v pkg-config >/dev/null && pkg-config --version || true; \
	command -v gopls >/dev/null && gopls version || true; \
	command -v dlv >/dev/null && dlv version | head -1 || true; \
	command -v tesseract >/dev/null && tesseract --version | head -1 || true; \
	command -v ffmpeg >/dev/null && ffmpeg -version | head -1 || true

deps:
	$(GO) mod download

setup: deps
	GOBIN=$(GOBIN) $(GO) install golang.org/x/tools/gopls@latest
	GOBIN=$(GOBIN) $(GO) install github.com/go-delve/delve/cmd/dlv@latest
	@echo "Go modules and developer tools are ready."

fmt:
	gofmt -w $$(find . -name '*.go' -not -path './.git/*' -not -path './vendor/*')

vet:
	$(GO) vet ./...

test:
	$(GO) test ./...

# Executable examples and the visual runner have independent environment/native
# requirements; this target validates the application and reusable packages.
test-core:
	$(GO) test $$(go list ./... | grep -v -E '/(examples|cmd/clawdesk-visual-runner)$$')

test-runtime-api:
	./scripts/test_runtime_apis.sh smoke

test-runtime-api-live:
	./scripts/test_runtime_apis.sh live

test-host-api: test-runtime-api

test-host-api-live: test-runtime-api-live

audit-layout:
	./scripts/audit_repo_layout.sh

build:
	$(GO) build -o dist/clawdesk .

build-macos:
	SKIP_CODESIGN=1 ./scripts/build_macos_app.sh

smoke:
	RUN_MAC_UI=0 ./scripts/e2e_smoke.sh
