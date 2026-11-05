#!/bin/sh
set -eu
bridge_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
# Applies only to this ChatGPT launch, not the CLI or launchd environment.
exec /usr/bin/open -a /Applications/ChatGPT.app \
  --env "CODEX_CLI_PATH=$bridge_dir/codex-desktop"
