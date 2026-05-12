package cmd

import (
	"github.com/leechael/browser-agent/browse-cli/internal/client"
	"github.com/spf13/cobra"
)

func newPageCmd() *cobra.Command {
	var params client.PageParams

	cmd := &cobra.Command{
		GroupID: "web",
		Use:     "page <url>",
		Short:   "Fetch web page with CSS selector extraction",
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
			resp, err := c.Page(params)
			if err != nil {
				return err
			}
			return f.Print(cmd.OutOrStdout(), resp)
		},
	}

	cmd.Flags().StringVar(&params.Selector, "selector", "", "CSS selector to extract")
	return cmd
}
