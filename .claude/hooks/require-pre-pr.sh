#!/bin/bash

# Blocks `gh pr create` until the PR body carries a /pre-pr review of the exact
# commit being proposed; any new commit changes the SHA, so it needs a fresh review.

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

# A heredoc body (`--body-file -`) is part of the command text itself.
BODY=$COMMAND
if [[ $COMMAND =~ --body-file[[:space:]=]+([^[:space:]]+) ]] && [ "${BASH_REMATCH[1]}" != "-" ]; then
  FILE=${BASH_REMATCH[1]}
  [[ $FILE == /* ]] || FILE="$DIR/$FILE"
  BODY=$(cat "$FILE" 2>/dev/null)
fi

HEADING="## Pre-PR review (${SHA:0:7})"
if ! grep -qF "$HEADING" <<<"$BODY"; then
  echo "BLOCKED: the PR body has no '$HEADING' section. Run /pre-pr on $REF and put its findings in the body under that heading, then retry." >&2
  exit 2
fi

exit 0
