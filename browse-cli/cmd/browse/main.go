package main

import (
	"fmt"
	"os"

	"github.com/leechael/browser-agent/browse-cli/internal/cmd"
)

func main() {
	rootCmd := cmd.NewRootCmd()
	err := rootCmd.Execute()
	if err != nil {
		fmt.Fprintf(os.Stderr, "browse: %s\n", err)
	}
	os.Exit(cmd.ExitCode(err))
}
