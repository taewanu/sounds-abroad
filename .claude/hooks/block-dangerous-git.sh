#!/bin/bash

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

# One shell word: quoted parts, command substitutions, escapes and bare characters.
WORD="((\"[^\"]*\"|'[^']*'|\\\$\\([^)]*\\)|\\\\.|[^[:space:];&|\"'\\\\])+)"
# Global options that take their value as the next word.
VALUE_OPTION="(-C|-c|--git-dir|--work-tree|--namespace|--config-env|--attr-source|--shallow-file) $WORD"
ANY_OPTION="-[^[:space:];&|]*"

# Backslash-newlines become spaces and whitespace is squeezed, so patterns can use one space.
FLATTENED=$(echo "$COMMAND" | awk '{ if (sub(/\\$/, "")) printf "%s ", $0; else print }' | sed -E 's/[[:space:]]+/ /g')

# Removes git's global options, so the subcommand follows `git`.
WITHOUT_OPTIONS=$(echo "$FLATTENED" | sed -E "s/(^|[^[:alnum:]_-])git( ($VALUE_OPTION|$ANY_OPTION))+/\1git/g")

# The command as written is checked too, so stripping can never unblock anything.
TEXT=$(printf '%s\n%s\n' "$COMMAND" "$WITHOUT_OPTIONS")

# The shell removes quotes before git runs, so each line is checked without them too.
TEXT=$(printf '%s\n%s\n' "$TEXT" "$(echo "$TEXT" | tr -d "'\"")")

ARGS="([^;&|]* )?"
DELETE="(-[[:alpha:]]*d[[:alpha:]]*|--delete)"
FORCE="(-[[:alpha:]]*f[[:alpha:]]*|--force)"
# The whole tree, not a path that merely starts with a dot.
DOT="\.\.?/?( |;|&|\||\)|\$)"

DANGEROUS_PATTERNS=(
  # The server's ruleset is the real guard on main, including a bare push from it; these stop pushes that rewrite, delete, or mass-update remote branches, or name main, before they leave this machine.
  "git push $ARGS(-[[:alpha:]]*[df]|--force|--delete|--mirror|--all|\+|:)"
  "git push $ARGS([^ ]*:)?(refs/heads/)?main( |;|&|\||\)|\$)"
  "git reset --hard"
  "git clean -fd"
  "git clean -f"
  "git branch -D"
  "git checkout \."
  "git restore \."
  "push --force"
  "reset --hard"
  "git reset $ARGS--hard"
  "git clean $ARGS-[[:alpha:]]*f"
  "git clean $ARGS--force"
  "git branch $ARGS-[[:alpha:]]*D"
  "git branch $ARGS-[[:alpha:]]*(d[[:alpha:]]*f|f[[:alpha:]]*d)"
  "git branch $ARGS$DELETE $ARGS$FORCE"
  "git branch $ARGS$FORCE $ARGS$DELETE"
  "git checkout -- $DOT"
  "git restore -- $DOT"
  "git restore $ARGS(--worktree|-[[:alpha:]]*W[[:alpha:]]*) $ARGS$DOT"
)

block() {
  echo "BLOCKED: '$COMMAND' matches dangerous pattern '$1'. The user has prevented you from doing this." >&2
  exit 2
}

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$TEXT" | grep -qE "$pattern"; then
    block "$pattern"
  fi
done

# Restoring the whole tree discards work unless --staged confines it to the index.
RESTORE_ALL="git restore $ARGS$DOT"
if echo "$TEXT" | grep -oE "$RESTORE_ALL" | grep -qvE -- " (--staged|-S) "; then
  block "$RESTORE_ALL"
fi

exit 0
