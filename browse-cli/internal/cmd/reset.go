package cmd

import (
	"github.com/spf13/cobra"
)

func newResetCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "reset",
		Short: "Reset browser to about:blank",
		RunE: func(cmd *cobra.Command, args []string) error {
			c, err := getClient(cmd)
			if err != nil {
				return err
			}
			f, err := getFormatter(cmd)
			if err != nil {
				return err
			}
			if err := c.Reset(); err != nil {
				return err
			}
			return f.PrintMessage(cmd.OutOrStdout(), "browser reset")
		},
	}
}
