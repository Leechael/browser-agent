package config

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/BurntSushi/toml"
)

// Config holds the CLI configuration loaded from ~/.config/browse-cli/config.toml.
type Config struct {
	URL   string `toml:"url"`
	Token string `toml:"token"`
}

// Load reads the config file from the standard location.
func Load() (*Config, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("cannot determine home directory: %w", err)
	}
	path := filepath.Join(home, ".config", "browse-cli", "config.toml")
	return LoadFrom(path)
}

// LoadFrom reads config from a specific file path.
func LoadFrom(path string) (*Config, error) {
	var cfg Config
	if _, err := toml.DecodeFile(path, &cfg); err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("config file not found at %s: run `browse status` for setup hints", path)
		}
		return nil, fmt.Errorf("failed to parse config: %w", err)
	}
	if cfg.URL == "" {
		return nil, fmt.Errorf("config missing required field: url")
	}
	return &cfg, nil
}

// BaseURL returns the full API base URL.
func (c *Config) BaseURL() string {
	return c.URL
}
