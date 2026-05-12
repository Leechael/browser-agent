package cmd

import (
	"errors"
	"fmt"

	"github.com/leechael/browser-agent/browse-cli/internal/client"
	"github.com/leechael/browser-agent/browse-cli/internal/config"
	"github.com/leechael/browser-agent/browse-cli/internal/output"
	"github.com/spf13/cobra"
)

// Version is set at build time via -ldflags.
var Version = "dev"

// Exit code constants.
const (
	ExitOK       = 0
	ExitError    = 1
	ExitAuth     = 2
	ExitNotFound = 3
)

// NewRootCmd creates the root command.
func NewRootCmd() *cobra.Command {
	var (
		jsonOut bool
		plain   bool
		jqExpr  string
	)

	cmd := &cobra.Command{
		Use:           "browse",
		Short:         "CLI for browser-agent web content API",
		Long:          `browse – fetch web pages, read tweets, and manage browser sessions.`,
		Version:       Version,
		SilenceUsage:  true,
		SilenceErrors: true,
		PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
			if jqExpr != "" && !jsonOut {
				return fmt.Errorf("--jq requires --json")
			}
			return nil
		},
	}

	pf := cmd.PersistentFlags()
	pf.BoolVar(&jsonOut, "json", false, "Output raw JSON")
	pf.BoolVar(&plain, "plain", false, "Output compact plain text")
	pf.StringVar(&jqExpr, "jq", "", "Filter JSON output with a jq expression (requires --json)")

	// Register command groups.
	cmd.CompletionOptions.DisableDefaultCmd = true

	cmd.AddGroup(
		&cobra.Group{ID: "web", Title: "Web Content:"},
		&cobra.Group{ID: "x", Title: "Twitter / X:"},
		&cobra.Group{ID: "system", Title: "System:"},
	)

	cmd.AddCommand(newStatusCmd())
	cmd.AddCommand(newFetchCmd())
	cmd.AddCommand(newPageCmd())
	cmd.AddCommand(newTweetCmd())
	cmd.AddCommand(newUserCmd())
	cmd.AddCommand(newSearchCmd())
	cmd.AddCommand(newTimelineCmd())
	cmd.AddCommand(newPostCmd())
	cmd.AddCommand(newResetCmd())

	// Manual completion command so we can assign it to the system group.
	completionCmd := &cobra.Command{
		Use:                   "completion [bash|zsh|fish|powershell]",
		Short:                 "Generate the autocompletion script for the specified shell",
		GroupID:               "system",
		DisableFlagsInUseLine: true,
		ValidArgs:             []string{"bash", "zsh", "fish", "powershell"},
		Args:                  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			switch args[0] {
			case "bash":
				return cmd.Root().GenBashCompletion(cmd.OutOrStdout())
			case "zsh":
				return cmd.Root().GenZshCompletion(cmd.OutOrStdout())
			case "fish":
				return cmd.Root().GenFishCompletion(cmd.OutOrStdout(), true)
			case "powershell":
				return cmd.Root().GenPowerShellCompletionWithDesc(cmd.OutOrStdout())
			default:
				return fmt.Errorf("unsupported shell: %s", args[0])
			}
		},
	}
	cmd.AddCommand(completionCmd)

	// Override default help command with topic-aware version.
	cmd.SetHelpCommand(newHelpCmd())
	appendHelpTopics(cmd)

	return cmd
}

func getClient(cmd *cobra.Command) (*client.Client, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, err
	}
	if cfg.Token == "" {
		return nil, errors.New("missing token in config: set token in ~/.config/browse-cli/config.toml")
	}
	return client.New(cfg), nil
}

func getFormatter(cmd *cobra.Command) (*output.Formatter, error) {
	jsonOut, _ := cmd.Flags().GetBool("json")
	plain, _ := cmd.Flags().GetBool("plain")
	jqExpr, _ := cmd.Flags().GetString("jq")
	return output.New(jsonOut, plain, jqExpr)
}

// ExitCode maps an error to a stable integer exit code.
func ExitCode(err error) int {
	if err == nil {
		return ExitOK
	}
	var apiErr *client.APIError
	if errors.As(err, &apiErr) {
		switch {
		case apiErr.StatusCode == 401 || apiErr.StatusCode == 403:
			return ExitAuth
		case apiErr.StatusCode == 404:
			return ExitNotFound
		}
	}
	return ExitError
}
