package config_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/leechael/browser-agent/browse-cli/internal/config"
)

func TestLoadFromMissing(t *testing.T) {
	_, err := config.LoadFrom("/nonexistent/path/config.toml")
	if err == nil {
		t.Fatal("expected error for missing file")
	}
}

func TestLoadFromMissingURL(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.toml")
	os.WriteFile(path, []byte("token = \"x\"\n"), 0644)

	_, err := config.LoadFrom(path)
	if err == nil {
		t.Fatal("expected error for missing url field")
	}
}

func TestLoadFromValid(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "config.toml")
	os.WriteFile(path, []byte("url = \"http://localhost:3800\"\ntoken = \"abc\"\n"), 0644)

	cfg, err := config.LoadFrom(path)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if cfg.URL != "http://localhost:3800" {
		t.Errorf("unexpected url: %s", cfg.URL)
	}
	if cfg.Token != "abc" {
		t.Errorf("unexpected token: %s", cfg.Token)
	}
	if cfg.BaseURL() != "http://localhost:3800" {
		t.Errorf("unexpected base URL: %s", cfg.BaseURL())
	}
}
