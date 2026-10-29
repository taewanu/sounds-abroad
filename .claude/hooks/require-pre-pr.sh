#!/bin/bash

# Blocks `gh pr create` until the PR body carries a /pre-pr review of the exact
# commit the PR will open on; any new commit changes the SHA, so it needs a fresh review.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')
FLAT=${COMMAND//$'\\\n'/ }

# `gh` as a command (at the start or after a shell separator), allowing global
# flags such as `-R owner/repo` before `pr create`.
GH_PR_CREATE='(^|[;&|(])[[:space:]]*gh([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+pr[[:space:]]+create([[:space:]]|$)'
echo "$FLAT" | grep -qE "$GH_PR_CREATE" || exit 0

unquote() { local s=${1//\"/}; echo "${s//\'/}"; }

DIR=$(echo "$INPUT" | jq -r '.cwd')
CD_RE='^[[:space:]]*cd[[:space:]]+("[^"]+"|'"'"'[^'"'"']+'"'"'|[^[:space:]&;]+)'
if [[ $FLAT =~ $CD_RE ]]; then
  DIR=$(unquote "${BASH_REMATCH[1]}")
fi
REF=HEAD
HEAD_RE='(--head|-H)[[:space:]=]+([^[:space:]]+)'
if [[ $FLAT =~ $HEAD_RE ]]; then
  REF=$(unquote "${BASH_REMATCH[2]}")
  REF=${REF##*:}
fi

SHA=$(git -C "$DIR" rev-parse --verify --quiet "$REF^{commit}")
if [ -z "$SHA" ]; then
  echo "BLOCKED: could not resolve '$REF' in '$DIR' to check for a /pre-pr review." >&2
  exit 2
fi

# The PR opens on the pushed commit, so the review has to be of that one.
PUSHED=$(git -C "$DIR" rev-parse --verify --quiet "$REF@{upstream}")
if [ "$PUSHED" != "$SHA" ]; then
  echo "BLOCKED: '$REF' at ${SHA:0:7} is not what its upstream holds (${PUSHED:0:7}). Push it first, so the reviewed commit is the one the PR opens on." >&2
  exit 2
fi

# A heredoc body (`--body-file -`) is part of the command text itself.
BODY=$COMMAND
BODY_FILE_RE='(--body-file|-F)[[:space:]=]+([^[:space:]]+)'
if [[ $FLAT =~ $BODY_FILE_RE ]] && [ "${BASH_REMATCH[2]}" != "-" ]; then
  FILE=$(unquote "${BASH_REMATCH[2]}")
  [[ $FILE == /* ]] || FILE="$DIR/$FILE"
  BODY=$(cat "$FILE" 2>/dev/null)
fi

HEADING="## Pre-PR review (${SHA:0:7})"
if ! grep -qF "$HEADING" <<<"$BODY"; then
  echo "BLOCKED: the PR body has no '$HEADING' section. Run /pre-pr on $REF and put its findings in the body under that heading, then retry." >&2
  exit 2
fi

exit 0
