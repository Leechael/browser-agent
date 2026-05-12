package cmd

import (
	"github.com/spf13/cobra"
)

func newTimelineCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "timeline",
		Short: "Timeline operations",
	}
	cmd.AddCommand(newHomeTimelineCmd())
	cmd.AddCommand(newMentionsCmd())
	return cmd
}

func newHomeTimelineCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "home",
		Short: "Get home timeline",
		RunE: func(cmd *cobra.Command, args []string) error {
			c, err := getClient(cmd)
			if err != nil {
				return err
			}
			f, err := getFormatter(cmd)
			if err != nil {
				return err
			}
			resp, err := c.HomeTimeline()
			if err != nil {
				return err
			}
			return f.Print(cmd.OutOrStdout(), resp)
		},
	}
}

func newMentionsCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "mentions",
		Short: "Get mentions",
		RunE: func(cmd *cobra.Command, args []string) error {
			c, err := getClient(cmd)
			if err != nil {
				return err
			}
			f, err := getFormatter(cmd)
			if err != nil {
				return err
			}
			resp, err := c.Mentions()
			if err != nil {
				return err
			}
			return f.Print(cmd.OutOrStdout(), resp)
		},
	}
}
