#!/usr/bin/env bash
set -euo pipefail

repo_dir="${1:-.}"
workflows_dir="$repo_dir/../.github/workflows"
env_file="$repo_dir/release-naming.env"

if [[ ! -d "$workflows_dir" ]]; then
  echo "missing workflows dir: $workflows_dir" >&2
  exit 1
fi

if [[ ! -f "$env_file" ]]; then
  echo "missing release naming contract: $env_file" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$env_file"

for key in CLI_NAME BINARY_NAME TAG_PREFIX ARTIFACT_GLOB BUILD_TARGET; do
  if [[ -z "${!key:-}" ]]; then
    echo "release-naming.env missing value: $key" >&2
    exit 1
  fi
done

echo "Auditing release naming in $repo_dir"

if rg -n "your-cli|your-cli-v" "$workflows_dir" >/dev/null; then
  echo "found unreplaced template placeholders in workflows" >&2
  rg -n "your-cli|your-cli-v" "$workflows_dir" >&2
  exit 1
fi

tag_glob="${TAG_PREFIX}*"
if ! rg -n --fixed-strings "$tag_glob" "$workflows_dir/release-browse-cli.yml" >/dev/null; then
  echo "release-browse-cli.yml trigger does not match TAG_PREFIX pattern: $tag_glob" >&2
  exit 1
fi

release_command="$workflows_dir/release-command.yml"
release_browse_cli="$workflows_dir/release-browse-cli.yml"
next_version="$repo_dir/scripts/next-version.sh"
download_helper="$repo_dir/scripts/print-release-download.sh"

for f in "$release_command" "$release_browse_cli" "$next_version" "$download_helper"; do
  if [[ ! -f "$f" ]]; then
    echo "missing required file: $f" >&2
    exit 1
  fi
done

if ! rg -n "issue_comment|pull_request_review_comment|workflow_dispatch" "$release_command" >/dev/null; then
  echo "release-command.yml must support comment and manual dispatch triggers" >&2
  exit 1
fi

if ! rg -n "!release.*patch.*minor.*major" "$release_command" >/dev/null; then
  echo "release-command.yml parser must enforce !release <patch|minor|major>" >&2
  exit 1
fi

# Must dispatch both extension and browse-cli release workflows.
if ! rg -n "release-extension\.yml" "$release_command" >/dev/null; then
  echo "release-command.yml must dispatch release-extension.yml" >&2
  exit 1
fi
if ! rg -n "release-browse-cli\.yml" "$release_command" >/dev/null; then
  echo "release-command.yml must dispatch release-browse-cli.yml" >&2
  exit 1
fi

if ! rg -n "CHANGELOG\.md|body_path:\s*dist/CHANGELOG\.md" "$release_browse_cli" >/dev/null; then
  echo "release-browse-cli.yml must generate changelog and publish it as release notes" >&2
  exit 1
fi

if ! rg -n "BINARY_NAME|BUILD_TARGET|ARTIFACT_GLOB" "$release_browse_cli" >/dev/null; then
  echo "release-browse-cli.yml must read naming contract fields" >&2
  exit 1
fi

if ! rg -n "BINARY_NAME" "$download_helper" >/dev/null; then
  echo "print-release-download.sh must use BINARY_NAME from release-naming.env" >&2
  exit 1
fi

echo "release naming audit passed"
