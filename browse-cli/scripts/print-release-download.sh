#!/usr/bin/env bash
set -euo pipefail

repo_dir="${1:-.}"
env_file="$repo_dir/release-naming.env"

if [[ ! -f "$env_file" ]]; then
  echo "missing release-naming.env" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$env_file"

if [[ -z "${BINARY_NAME:-}" ]]; then
  echo "BINARY_NAME not set in release-naming.env" >&2
  exit 1
fi

owner_repo="${2:-}"
if [[ -z "$owner_repo" ]]; then
  # Try to infer from git remote
  remote_url=$(git -C "$repo_dir" remote get-url origin 2>/dev/null || true)
  if [[ -n "$remote_url" ]]; then
    # Handle both HTTPS and SSH URLs
    owner_repo=$(echo "$remote_url" | sed -E 's/.*github\.com[:\/]([^\/]+\/[^\/]+)\.git$/\1/' | sed -E 's/.*github\.com[:\/]([^\/]+\/[^\/]+)$/\1/')
  fi
fi

if [[ -z "$owner_repo" ]]; then
  echo "usage: $0 [repo-dir] [owner/repo]" >&2
  exit 1
fi

echo "# Download latest release"
echo ""
echo "```bash"
echo "# macOS (Apple Silicon)"
echo "curl -sL \"https://github.com/${owner_repo}/releases/latest/download/${BINARY_NAME}-darwin-arm64.tar.gz\" | tar xz"
echo ""
echo "# macOS (Intel)"
echo "curl -sL \"https://github.com/${owner_repo}/releases/latest/download/${BINARY_NAME}-darwin-amd64.tar.gz\" | tar xz"
echo ""
echo "# Linux (amd64)"
echo "curl -sL \"https://github.com/${owner_repo}/releases/latest/download/${BINARY_NAME}-linux-amd64.tar.gz\" | tar xz"
echo ""
echo "# Linux (arm64)"
echo "curl -sL \"https://github.com/${owner_repo}/releases/latest/download/${BINARY_NAME}-linux-arm64.tar.gz\" | tar xz"
echo "```"
