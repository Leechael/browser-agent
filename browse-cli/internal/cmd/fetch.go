package cmd

import (
	"github.com/leechael/browser-agent/browse-cli/internal/client"
	"github.com/spf13/cobra"
)

func newFetchCmd() *cobra.Command {
	var params client.FetchParams

	cmd := &cobra.Command{
		GroupID: "web",
		Use:     "fetch <url>",
		Short:   "Fetch web page content as markdown",
		Args:    cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			c, err := getClient(cmd)
			if err != nil {
				return err
			}
			f, err := getFormatter(cmd)
			if err != nil {
				return err
			}

			params.URL = args[0]
			resp, err := c.Fetch(params)
			if err != nil {
				return err
			}
			return f.Print(cmd.OutOrStdout(), resp)
		},
	}

	cmd.Flags().BoolVar(&params.InPage, "in-page", false, "Run defuddle in browser context for Shadow DOM support")
	return cmd
}
