package cmd

import (
	"github.com/leechael/browser-agent/browse-cli/internal/client"
	"github.com/spf13/cobra"
)

func newSearchCmd() *cobra.Command {
	var params client.SearchParams

	cmd := &cobra.Command{
		GroupID: "x",
		Use:     "search <query>",
		Short:   "Search tweets",
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
			params.Q = args[0]
			resp, err := c.Search(params)
			if err != nil {
				return err
			}
			// Human/plain output renders the tweet list; --json/--jq get the
			// full envelope (resultType, totalCount, hasMore).
			jsonOut, _ := cmd.Flags().GetBool("json")
			jqExpr, _ := cmd.Flags().GetString("jq")
			if jsonOut || jqExpr != "" {
				return f.Print(cmd.OutOrStdout(), resp)
			}
			return f.Print(cmd.OutOrStdout(), resp.Results)
		},
	}

	flags := cmd.Flags()
	flags.StringVar(&params.SearchType, "type", "", "Search type: top, latest, people, media")
	flags.StringVar(&params.From, "from", "", "Filter by author")
	flags.StringVar(&params.To, "to", "", "Filter by recipient")
	flags.StringVar(&params.Since, "since", "", "Start date (YYYY-MM-DD)")
	flags.StringVar(&params.Until, "until", "", "End date (YYYY-MM-DD)")
	flags.StringVar(&params.Filter, "filter", "", "Filter: media, images, videos, links, replies, native_video")
	flags.IntVar(&params.MinRetweets, "min-retweets", 0, "Minimum retweet count")
	flags.IntVar(&params.MinFaves, "min-faves", 0, "Minimum favorite count")
	flags.IntVar(&params.MinReplies, "min-replies", 0, "Minimum reply count")
	flags.StringVar(&params.Lang, "lang", "", "Language code")
	flags.IntVar(&params.Max, "max", 0, "Maximum results (default 20, auto-paginates by scrolling)")
	return cmd
}
