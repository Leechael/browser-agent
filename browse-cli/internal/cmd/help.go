package cmd

import (
	"fmt"
	"strings"

	"github.com/leechael/browser-agent/browse-cli/docs/help"
	"github.com/spf13/cobra"
)

func newHelpCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "help [topic]",
		Short: "Help about any command or topic",
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(args) == 0 {
				return cmd.Root().Help()
			}
			topic := args[0]

			// Try topic file first.
			if content, ok := loadTopic(topic); ok {
				fmt.Fprintln(cmd.OutOrStdout(), content)
				return nil
			}

			// Try subcommand help.
			if sub, _, err := cmd.Root().Find(args); err == nil {
				return sub.Help()
			}

			// Unknown topic.
			fmt.Fprintf(cmd.ErrOrStderr(), "Unknown help topic: %q\n\n", topic)
			fmt.Fprintln(cmd.ErrOrStderr(), "Available topics:")
			for _, t := range listTopics() {
				fmt.Fprintf(cmd.ErrOrStderr(), "  %s\n", t)
			}
			return fmt.Errorf("unknown topic")
		},
	}
}

func loadTopic(name string) (string, bool) {
	if strings.ContainsAny(name, `/\`) {
		return "", false
	}
	path := "topics/" + name + ".md"
	b, err := help.TopicsFS.ReadFile(path)
	if err != nil {
		return "", false
	}
	return string(b), true
}

func listTopics() []string {
	var names []string
	entries, err := help.TopicsFS.ReadDir("topics")
	if err != nil {
		return names
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := e.Name()
		if strings.HasSuffix(name, ".md") {
			names = append(names, strings.TrimSuffix(name, ".md"))
		}
	}
	return names
}

func topicDescriptions() map[string]string {
	result := make(map[string]string)
	entries, err := help.TopicsFS.ReadDir("topics")
	if err != nil {
		return result
	}
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		name := strings.TrimSuffix(e.Name(), ".md")
		content, err := help.TopicsFS.ReadFile("topics/" + e.Name())
		if err != nil {
			continue
		}
		result[name] = firstLine(content)
	}
	return result
}

func firstLine(b []byte) string {
	lines := strings.Split(string(b), "\n")
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" && !strings.HasPrefix(trimmed, "#") {
			return trimmed
		}
	}
	return ""
}

func appendHelpTopics(cmd *cobra.Command) {
	descriptions := topicDescriptions()
	if len(descriptions) == 0 {
		return
	}

	var sb strings.Builder
	sb.WriteString("\nHELP TOPICS\n")
	for _, name := range listTopics() {
		desc := descriptions[name]
		if desc == "" {
			desc = "Help topic"
		}
		sb.WriteString(fmt.Sprintf("  %-15s %s\n", name, desc))
	}
	sb.WriteString("\nUse \"browse help <topic>\" for more information about a topic.\n")

	cmd.SetUsageTemplate(cmd.UsageTemplate() + sb.String())
}
