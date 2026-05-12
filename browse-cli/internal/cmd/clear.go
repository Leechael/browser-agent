package cmd

import (
	"github.com/leechael/browser-agent/browse-cli/internal/client"
	"github.com/spf13/cobra"
)

func newClearCmd() *cobra.Command {
	var (
		domain         string
		cookies        bool
		localStorage   bool
		sessionStorage bool
		indexedDB      bool
		cache          bool
		all            bool
	)

	cmd := &cobra.Command{
		Use:   "clear [domain]",
		Short: "Clear browser data (cookies, cache, storage)",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			c, err := getClient(cmd)
			if err != nil {
				return err
			}
			f, err := getFormatter(cmd)
			if err != nil {
				return err
			}

			if len(args) > 0 {
				domain = args[0]
			}

			params := client.ClearParams{Domain: domain}
			if cmd.Flags().Changed("cookies") {
				params.Cookies = &cookies
			}
			if cmd.Flags().Changed("local-storage") {
				params.LocalStorage = &localStorage
			}
			if cmd.Flags().Changed("session-storage") {
				params.SessionStorage = &sessionStorage
			}
			if cmd.Flags().Changed("indexed-db") {
				params.IndexedDB = &indexedDB
			}
			if cmd.Flags().Changed("cache") {
				params.Cache = &cache
			}
			if cmd.Flags().Changed("all") {
				params.All = &all
			}

			if err := c.Clear(params); err != nil {
				return err
			}
			return f.PrintMessage(cmd.OutOrStdout(), "browser data cleared")
		},
	}

	flags := cmd.Flags()
	flags.StringVar(&domain, "domain", "", "Target domain (can also be positional arg)")
	flags.BoolVar(&cookies, "cookies", false, "Clear cookies")
	flags.BoolVar(&localStorage, "local-storage", false, "Clear localStorage")
	flags.BoolVar(&sessionStorage, "session-storage", false, "Clear sessionStorage")
	flags.BoolVar(&indexedDB, "indexed-db", false, "Clear indexedDB")
	flags.BoolVar(&cache, "cache", false, "Clear cache")
	flags.BoolVar(&all, "all", false, "Clear all data")
	return cmd
}
