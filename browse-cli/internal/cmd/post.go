package cmd

import (
	"github.com/spf13/cobra"
)

func newPostCmd() *cobra.Command {
	return &cobra.Command{
		GroupID: "x",
		Use:     "post <text>",
		Short:   "Post a new tweet",
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
			resp, err := c.PostTweet(args[0])
			if err != nil {
				return err
			}
			return f.Print(cmd.OutOrStdout(), resp)
		},
	}
}
