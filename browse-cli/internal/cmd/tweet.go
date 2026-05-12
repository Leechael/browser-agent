package cmd

import (
	"fmt"
	"regexp"

	"github.com/leechael/browser-agent/browse-cli/internal/client"
	"github.com/spf13/cobra"
)

var tweetURLRe = regexp.MustCompile(`https?://(?:x\.com|twitter\.com)/([^/]+)/status/(\d+)`)

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

func parseTweetArgs(args []string) (screenName, tweetID string, err error) {
	if len(args) == 1 {
		m := tweetURLRe.FindStringSubmatch(args[0])
		if len(m) == 3 {
			return m[1], m[2], nil
		}
		return "", "", fmt.Errorf("invalid tweet URL: %s", args[0])
	}
	if len(args) == 2 {
		return args[0], args[1], nil
	}
	return "", "", fmt.Errorf("expected 1 (URL) or 2 (screen_name tweet_id) arguments, got %d", len(args))
}

func newTweetGetCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "get <screen_name> <tweet_id> | <url>",
		Short: "Get a specific tweet",
		Args:  cobra.RangeArgs(1, 2),
		RunE: func(cmd *cobra.Command, args []string) error {
			c, err := getClient(cmd)
			if err != nil {
				return err
			}
			f, err := getFormatter(cmd)
			if err != nil {
				return err
			}
			screenName, tweetID, err := parseTweetArgs(args)
			if err != nil {
				return err
			}
			resp, err := c.GetTweet(screenName, tweetID)
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
		Use:   "thread <screen_name> <tweet_id> | <url>",
		Short: "Get a tweet thread with replies",
		Args:  cobra.RangeArgs(1, 2),
		RunE: func(cmd *cobra.Command, args []string) error {
			c, err := getClient(cmd)
			if err != nil {
				return err
			}
			f, err := getFormatter(cmd)
			if err != nil {
				return err
			}
			screenName, tweetID, err := parseTweetArgs(args)
			if err != nil {
				return err
			}
			resp, err := c.GetThread(client.ThreadParams{
				ScreenName: screenName,
				TweetID:    tweetID,
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
