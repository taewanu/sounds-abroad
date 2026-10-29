#!/bin/bash

# Blocks `gh pr create` until /pre-pr has reviewed the exact commit being
# proposed; any new commit changes the SHA, so it needs a fresh review.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

echo "$COMMAND" | grep -qE "gh[[:space:]]+pr[[:space:]]+create" || exit 0

DIR=$(echo "$INPUT" | jq -r '.cwd')
if [[ $COMMAND =~ ^[[:space:]]*cd[[:space:]]+([^[:space:]\&\;]+) ]]; then
  DIR=${BASH_REMATCH[1]}
fi
REF=HEAD
if [[ $COMMAND =~ --head[[:space:]=]+([^[:space:]]+) ]]; then
  REF=${BASH_REMATCH[1]}
fi

SHA=$(git -C "$DIR" rev-parse --verify --quiet "$REF^{commit}")
if [ -z "$SHA" ]; then
  echo "BLOCKED: could not resolve '$REF' in '$DIR' to check for a /pre-pr review." >&2
  exit 2
fi

MARKER="$(git -C "$DIR" rev-parse --path-format=absolute --git-common-dir)/pre-pr/$SHA"
if [ ! -f "$MARKER" ]; then
  echo "BLOCKED: no /pre-pr review recorded for $SHA ($REF). Run /pre-pr on this branch, address its findings, then retry." >&2
  exit 2
fi

exit 0
