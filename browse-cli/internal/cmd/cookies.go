package cmd

import (
	"strings"

	"github.com/spf13/cobra"
)

func newCookiesCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "cookies",
		Short: "Cookie management",
	}
	cmd.AddCommand(newCookiesGetCmd())
	cmd.AddCommand(newCookiesSetCmd())
	return cmd
}

func newCookiesGetCmd() *cobra.Command {
	var urls string

	cmd := &cobra.Command{
		Use:   "get <domain>",
		Short: "Get cookies for a domain",
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
			var urlList []string
			if urls != "" {
				urlList = strings.Split(urls, ",")
			}
			resp, err := c.GetCookies(args[0], urlList)
			if err != nil {
				return err
			}
			return f.Print(cmd.OutOrStdout(), resp)
		},
	}

	cmd.Flags().StringVar(&urls, "urls", "", "Comma-separated list of specific URLs")
	return cmd
}

func newCookiesSetCmd() *cobra.Command {
	var raw string

	cmd := &cobra.Command{
		Use:   "set <domain>",
		Short: "Set cookies for a domain",
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
			if raw != "" {
				err = c.SetCookiesRaw(args[0], raw)
			} else {
				err = c.SetCookies(args[0], nil)
			}
			if err != nil {
				return err
			}
			return f.PrintMessage(cmd.OutOrStdout(), "cookies set")
		},
	}

	cmd.Flags().StringVar(&raw, "raw", "", "Raw cookie string (cookie1=value1; cookie2=value2)")
	return cmd
}
