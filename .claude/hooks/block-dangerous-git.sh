#!/bin/bash

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

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
  # These stop pushes that rewrite, delete, or mass-update remote branches, or name main; a push's checkout is checked further down.
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

# Where a push lands depends on the checkout it runs in, so it must run in the one the hook can read, and that one can't be main.
if echo "$WITHOUT_OPTIONS" | grep -qE "git push"; then
  if [[ "$WITHOUT_OPTIONS" != "$FLATTENED" ]]; then
    block "git <global option> push"
  fi
  if echo "$FLATTENED" | grep -qE "(^|[;&|( ])cd "; then
    block "cd before git push"
  fi
  if [[ "$(git -C "${CWD:-.}" symbolic-ref --quiet --short HEAD 2>/dev/null)" == "main" ]]; then
    block "git push from main"
  fi
fi

exit 0
