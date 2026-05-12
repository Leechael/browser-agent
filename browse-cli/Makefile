BINARY_NAME := browse
BIN_DIR := bin
BIN_PATH := $(BIN_DIR)/$(BINARY_NAME)
OUT_DIR := dist
CMD := ./cmd/browse
GOFLAGS ?= -buildvcs=false

VERSION_VAR := $(shell grep VERSION_VAR_PATH release-naming.env 2>/dev/null | cut -d= -f2)
ifeq ($(VERSION_VAR),)
	VERSION_VAR := github.com/leechael/browser-agent/browse-cli/internal/cmd.Version
endif
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")

export GOFLAGS

.PHONY: tidy fmt test bdd-test ci build run install clean cross-build help

help:
	@echo "Targets:"
	@echo "  make tidy         - go mod tidy"
	@echo "  make fmt          - gofmt ./cmd ./internal ./tests"
	@echo "  make test         - run unit tests"
	@echo "  make bdd-test     - run BDD tests"
	@echo "  make ci           - fmt check + vet + tests + build"
	@echo "  make build        - build local binary to ./$(BIN_PATH)"
	@echo "  make run          - run CLI (pass ARGS='...')"
	@echo "  make install      - install binary to GOPATH/bin"
	@echo "  make clean        - remove build artifacts"
	@echo "  make cross-build  - build darwin/linux amd64/arm64 binaries"

tidy:
	go mod tidy

fmt:
	gofmt -w ./cmd ./internal ./tests

test:
	go test ./... -count=1

bdd-test:
	go test -tags=bdd ./tests/bdd/... -count=1

ci:
	@unformatted=$$(gofmt -l ./cmd ./internal ./tests); \
	if [ -n "$$unformatted" ]; then echo "Unformatted files:"; echo "$$unformatted"; exit 1; fi
	go vet ./...
	go test ./... -count=1
	go test -tags=bdd ./tests/bdd/... -count=1
	go build -v -ldflags="-s -w -X $(VERSION_VAR)=$(VERSION)" -o $(BIN_PATH) $(CMD)

build:
	mkdir -p $(BIN_DIR)
	go build -o $(BIN_PATH) -ldflags="-s -w -X $(VERSION_VAR)=$(VERSION)" $(CMD)

run:
	go run -ldflags="-s -w -X $(VERSION_VAR)=$(VERSION)" $(CMD) $(ARGS)

install:
	go install -ldflags="-s -w -X $(VERSION_VAR)=$(VERSION)" $(CMD)

clean:
	rm -rf $(OUT_DIR) $(BIN_DIR)

cross-build: clean
	mkdir -p $(OUT_DIR)
	GOOS=darwin GOARCH=amd64 go build -o $(OUT_DIR)/$(BINARY_NAME)-darwin-amd64 -ldflags="-s -w -X $(VERSION_VAR)=$(VERSION)" $(CMD)
	GOOS=darwin GOARCH=arm64 go build -o $(OUT_DIR)/$(BINARY_NAME)-darwin-arm64 -ldflags="-s -w -X $(VERSION_VAR)=$(VERSION)" $(CMD)
	GOOS=linux GOARCH=amd64 go build -o $(OUT_DIR)/$(BINARY_NAME)-linux-amd64 -ldflags="-s -w -X $(VERSION_VAR)=$(VERSION)" $(CMD)
	GOOS=linux GOARCH=arm64 go build -o $(OUT_DIR)/$(BINARY_NAME)-linux-arm64 -ldflags="-s -w -X $(VERSION_VAR)=$(VERSION)" $(CMD)
