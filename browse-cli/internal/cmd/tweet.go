package cmd

import (
	"github.com/leechael/browser-agent/browse-cli/internal/client"
	"github.com/spf13/cobra"
)

func newTweetCmd() *cobra.Command {
	cmd := &cobra.Command{
		GroupID: "x",
		Use:     "tweet",
		Short:   "Twitter/X tweet operations",
	}
	cmd.AddCommand(newTweetGetCmd())
	cmd.AddCommand(newTweetThreadCmd())
	return cmd
}

func newTweetGetCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "get <screen_name> <tweet_id>",
		Short: "Get a specific tweet",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			c, err := getClient(cmd)
			if err != nil {
				return err
			}
			f, err := getFormatter(cmd)
			if err != nil {
				return err
			}
			resp, err := c.GetTweet(args[0], args[1])
			if err != nil {
				return err
			}
			return f.Print(cmd.OutOrStdout(), resp)
		},
	}
}

func newTweetThreadCmd() *cobra.Command {
	var max int

	cmd := &cobra.Command{
		Use:   "thread <screen_name> <tweet_id>",
		Short: "Get a tweet thread with replies",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			c, err := getClient(cmd)
			if err != nil {
				return err
			}
			f, err := getFormatter(cmd)
			if err != nil {
				return err
			}
			resp, err := c.GetThread(client.ThreadParams{
				ScreenName: args[0],
				TweetID:    args[1],
				Max:        max,
			})
			if err != nil {
				return err
			}
			return f.Print(cmd.OutOrStdout(), resp)
		},
	}

	cmd.Flags().IntVar(&max, "max", 0, "Maximum replies to fetch")
	return cmd
}
