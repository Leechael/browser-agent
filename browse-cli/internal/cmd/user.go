package cmd

import (
	"github.com/leechael/browser-agent/browse-cli/internal/client"
	"github.com/spf13/cobra"
)

func newUserCmd() *cobra.Command {
	var params client.UserTimelineParams

	cmd := &cobra.Command{
		Use:   "user <screen_name>",
		Short: "Get a user's timeline",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			c, err := getClient(cmd)
			if err != nil {
				return err
			}
			f, err := getFormatter(cmd)
			if err != nil {
				return err
			}
			params.ScreenName = args[0]
			resp, err := c.UserTimeline(params)
			if err != nil {
				return err
			}
			return f.Print(cmd.OutOrStdout(), resp)
		},
	}

	cmd.Flags().StringVar(&params.Tab, "tab", "", "Tab filter: tweets, replies, media")
	return cmd
}
