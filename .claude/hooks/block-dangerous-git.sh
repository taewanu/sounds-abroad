#!/bin/bash

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')
# grep reads line by line, so a backslash-newline would split one command in two.
COMMAND=${COMMAND//$'\\\n'/ }

TOKEN="(\\\\.|\"[^\"]*\"|'[^']*'|[^[:space:]])+"
VALUE_OPTION="(-C|-c|--git-dir|--work-tree|--namespace|--super-prefix|--config-env|--attr-source)[[:space:]]+$TOKEN"
# Excludes -C and -c so that their value is never read as the subcommand.
FLAG_OPTION="(--($TOKEN)?|-[^-Cc[:space:]][^[:space:]]*)"
GIT="git([[:space:]]+($VALUE_OPTION|$FLAG_OPTION))*[[:space:]]+"
# Options of the same command: the match cannot cross a shell separator.
ARGS="[[:space:]]([^;&|]*[[:space:]])?"
END="($|[^[:alnum:]_-])"
# A bare . or .. is the whole tree; .github or .gitignore names a single path.
DOT="\.\.?/?($|[[:space:];&|)\"'])"
# git accepts any unique prefix of a long option.
HARD="--(h|ha|har|hard)"
FORCE="(-[[:alpha:]]*f[[:alpha:]]*|--(f|fo|for|forc|force))"
DELETE="(-[[:alpha:]]*d[[:alpha:]]*|--(d|de|del|dele|delet|delete))"

block_if_matches() {
  if echo "$COMMAND" | grep -qE "$2"; then
    echo "BLOCKED: '$COMMAND' matches dangerous pattern '$1'. The user has prevented you from doing this." >&2
    exit 2
  fi
}

block_if_matches "git push" "${GIT}push"
block_if_matches "git reset --hard" "${GIT}reset$ARGS$HARD$END"
block_if_matches "git clean -f" "${GIT}clean$ARGS$FORCE$END"
block_if_matches "git branch -D" "${GIT}branch$ARGS-[[:alpha:]]*D[[:alpha:]]*$END"
block_if_matches "git branch -df" "${GIT}branch$ARGS-[[:alpha:]]*(d[[:alpha:]]*f|f[[:alpha:]]*d)[[:alpha:]]*$END"
block_if_matches "git branch --delete --force" "${GIT}branch$ARGS$DELETE$ARGS$FORCE$END"
block_if_matches "git branch --force --delete" "${GIT}branch$ARGS$FORCE$ARGS$DELETE$END"
block_if_matches "git checkout ." "${GIT}checkout[[:space:]]+\."
block_if_matches "git checkout -- ." "${GIT}checkout$ARGS$DOT"
block_if_matches "git restore ." "${GIT}restore[[:space:]]+\."
block_if_matches "git restore -- ." "${GIT}restore[[:space:]]+--[[:space:]]+$DOT"
block_if_matches "git restore --worktree ." "${GIT}restore$ARGS(--worktree|--source|-[[:alpha:]]*[Ws])[^;&|]*[[:space:]]$DOT"
block_if_matches "push --force" "push --force"
block_if_matches "reset --hard" "reset --hard"

exit 0
