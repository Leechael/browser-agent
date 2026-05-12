package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/leechael/browser-agent/browse-cli/internal/client"
	"github.com/leechael/browser-agent/browse-cli/internal/config"
	"github.com/spf13/cobra"
)

func newStatusCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "status",
		Short: "Check API connectivity and config",
		RunE: func(cmd *cobra.Command, args []string) error {
			f, err := getFormatter(cmd)
			if err != nil {
				return err
			}

			home, _ := os.UserHomeDir()
			configPath := filepath.Join(home, ".config", "browse-cli", "config.toml")

			cfg, err := config.Load()
			if err != nil {
				f.Hint("config: %s", err)
				f.Hint("")
				f.Hint("create %s:", configPath)
				f.Hint("  url   = \"https://your-domain.com\"")
				f.Hint("  token = \"your-bearer-token\"")
				return fmt.Errorf("config not loaded")
			}

			// Always print config summary.
			f.Hint("config: %s", configPath)
			f.Hint("url:    %s", cfg.URL)
			tokenHint := cfg.Token
			if tokenHint == "" {
				tokenHint = "(not set)"
			} else {
				tokenHint = "set"
			}
			f.Hint("token:  %s", tokenHint)

			// Try API health even with empty token — the server may or may not require auth.
			c := client.New(cfg)
			_, apiErr := c.GetStatus()
			if apiErr != nil {
				var apiError *client.APIError
				if fmt.Sprintf("%T", apiErr) == "*client.APIError" {
					apiError = apiErr.(*client.APIError)
				}
				if apiError != nil && (apiError.StatusCode == 401 || apiError.StatusCode == 403) {
					f.Hint("api:    %d (auth required — check token)", apiError.StatusCode)
				} else {
					f.Hint("api:    unreachable (%v)", apiErr)
				}
				return fmt.Errorf("api check failed")
			}

			f.Hint("api:    ok")
			return nil
		},
	}
	return cmd
}
