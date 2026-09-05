SHELL := /bin/zsh

GO ?= go
GOBIN ?= $(HOME)/go/bin
export PATH := $(GOBIN):$(PATH)

.PHONY: help doctor setup deps fmt vet test test-core test-icons test-runtime-api test-runtime-api-live test-host-api test-host-api-live build build-apple-vision-ocr build-macos smoke

help:
	@echo "opendesk development targets:"
	@echo "  make doctor      Check required toolchain and native capabilities"
	@echo "  make setup       Download Go modules and install Go developer tools"
	@echo "  make deps        Download Go modules only"
	@echo "  make fmt         Format Go sources"
	@echo "  make vet         Run go vet"
	@echo "  make test        Run the complete Go test suite"
	@echo "  make test-core   Run core packages (skips known fixture/demo package conflicts)"
	@echo "  make test-icons  Validate deterministic app icons and macOS bundle injection"
	@echo "  make test-runtime-api Run JavaScript Runtime API contract, unit, smoke, and acceptance gates"
	@echo "  make test-runtime-api-live Run Runtime API tests against the Safari Test Lab"
	@echo "  make test-host-api Deprecated alias for test-runtime-api"
	@echo "  make test-host-api-live Deprecated alias for test-runtime-api-live"
	@echo "  make build       Build the opendesk binary"
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
	$(GO) test $$(go list ./... | grep -v -E '/(examples|cmd/opendesk-visual-runner)$$')

test-icons:
	./scripts/test_app_icons.sh

test-runtime-api: build
	./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script

test-runtime-api-live: build
	OPENDESK_RUNTIME_API_MODE=live ./dist/opendesk -script scripts/test_runtime_apis.js -console-mode script

test-host-api: test-runtime-api

test-host-api-live: test-runtime-api-live

build:
	$(GO) build -o dist/opendesk ./cmd/opendesk
	$(GO) build -o dist/opendesk-ui-host ./cmd/opendesk-ui-host

ifeq ($(shell uname -s),Darwin)
build: build-apple-vision-ocr

# Apple Vision is the default macOS OCR provider. Keep its executable beside
# the portable CLI so discovery validates and invokes only the current build.
build-apple-vision-ocr:
	@set -e; \
	BUNDLE="$(CURDIR)/dist/native-extensions/com.example.macos-vision"; \
	BIN="$$BUNDLE/bin/native-ext-macos-vision"; \
	STAGE="$$BIN.stage.$$"; \
	SDK_PATH="$$(xcrun --sdk macosx --show-sdk-path)"; \
	install -d -m 700 "$$BUNDLE/bin" "$$BUNDLE/types"; \
	xcrun swiftc -O -target "$$(uname -m)-apple-macosx12.0" -sdk "$$SDK_PATH" \
		"$(CURDIR)/examples/native-extensions/macos-vision/main.swift" -framework Vision -framework ImageIO \
		-o "$$STAGE"; \
	mv "$$STAGE" "$$BIN"; \
	cp "$(CURDIR)/examples/native-extensions/macos-vision/extension.json" "$$BUNDLE/extension.json"; \
	cp "$(CURDIR)/examples/native-extensions/macos-vision/types/index.d.ts" "$$BUNDLE/types/index.d.ts"; \
	chmod -R go-w "$$BUNDLE"; \
	test -x "$$BIN"; \
	echo "Built Apple Vision OCR helper: $$BIN"
else
build-apple-vision-ocr:
	@echo "Apple Vision OCR helper is available only on macOS"
endif

build-macos:
	SKIP_CODESIGN=1 ./scripts/build_macos_app.sh

smoke: build
	./dist/opendesk -script scripts/e2e_smoke.js -console-mode script
