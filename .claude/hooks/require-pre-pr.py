#!/usr/bin/env python3
"""Blocks `gh pr create` until the PR body records a /pre-pr review of the commit it opens on."""

import json
import os
import re
import shlex
import subprocess
import sys

HEREDOC = re.compile(r"(?<!<)<<-?\s*(['\"]?)(\w+)\1")
SEPARATORS = ";&|()\n"
WRAPPERS = {"env", "command", "exec", "time", "sudo", "nohup"}


def block(reason):
    print(f"BLOCKED: {reason}", file=sys.stderr)
    sys.exit(2)


def split_heredocs(command):
    """Returns the command without heredoc bodies, and those bodies."""
    kept, bodies = [], []
    lines = iter(command.split("\n"))
    for line in lines:
        kept.append(line)
        opening = HEREDOC.search(line)
        if opening:
            body = []
            for inner in lines:
                if inner.strip() == opening.group(2):
                    break
                body.append(inner)
            bodies.append("\n".join(body))
    return "\n".join(kept), bodies


def split_commands(text):
    """Returns one token list per simple command, so quoted text is never read as a command."""
    lexer = shlex.shlex(text.replace("\\\n", " "), posix=True, punctuation_chars=SEPARATORS)
    lexer.whitespace = " \t\r"
    lexer.whitespace_split = True
    commands, current = [], []
    for token in lexer:
        if all(char in SEPARATORS for char in token):
            commands.append(current)
            current = []
        else:
            current.append(token)
    commands.append(current)
    return [command for command in commands if command]


def pr_create_args(tokens):
    """Returns the arguments of a `gh pr create` or `gh pr new`, or None for any other command."""
    position = 0
    while position < len(tokens) and (
        tokens[position] in WRAPPERS or re.match(r"\w+=", tokens[position])
    ):
        position += 1
    if position == len(tokens) or os.path.basename(tokens[position]) != "gh":
        return None

    words = []
    rest = iter(tokens[position + 1 :])
    for token in rest:
        if token in ("-R", "--repo"):
            next(rest, None)
        elif token.startswith("-"):
            continue
        else:
            words.append(token)
        if len(words) == 2:
            break
    return list(rest) if words in (["pr", "create"], ["pr", "new"]) else None


def flag_value(args, short, long):
    """Returns a flag's value in any form gh accepts: `-x v`, `-xv`, `-x=v`, `--long v`, `--long=v`."""
    for index, arg in enumerate(args):
        if arg in (short, long):
            return args[index + 1] if index + 1 < len(args) else ""
        if arg.startswith(long + "="):
            return arg[len(long) + 1 :]
        if arg.startswith(short) and not arg.startswith("--"):
            return arg[len(short) :].removeprefix("=")
    return None


def git(directory, *args):
    result = subprocess.run(["git", "-C", directory, *args], capture_output=True, text=True)
    return result.stdout.strip() if result.returncode == 0 else ""


def pr_body(args, directory, heredocs):
    body = flag_value(args, "-b", "--body")
    if body is not None:
        # A body of "$(cat <<'EOF' ... EOF)" holds its text in the heredoc.
        return "\n".join(heredocs) if HEREDOC.search(body) else body
    body_file = flag_value(args, "-F", "--body-file")
    if body_file == "-":
        return "\n".join(heredocs)
    if body_file:
        try:
            with open(os.path.join(directory, os.path.expanduser(body_file))) as file:
                return file.read()
        except OSError:
            return ""
    return ""


def check(args, directory, heredocs):
    head = flag_value(args, "-H", "--head")
    ref = head.split(":")[-1] if head else "HEAD"
    branch = ref if head else git(directory, "symbolic-ref", "--short", "HEAD")
    pushed = git(directory, "rev-parse", "--verify", "--quiet", f"refs/remotes/origin/{branch}^{{commit}}")
    sha = git(directory, "rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}") or pushed
    if not sha:
        block(f"could not resolve '{ref}' in '{directory}' to check for a /pre-pr review.")

    # Compared with origin's branch, not @{upstream}: a worktree branch often tracks origin/main.
    if pushed != sha:
        block(f"'{ref}' at {sha[:7]} is not on origin. Push it first, so the review covers the commit the PR opens on.")

    heading = f"## Pre-PR review ({sha[:7]})"
    if not re.search(rf"^{re.escape(heading)}\s*$", pr_body(args, directory, heredocs), re.MULTILINE):
        block(f"the PR body has no '{heading}' section. Run /pre-pr on {ref} and put its findings in the body.")


def main():
    hook_input = json.load(sys.stdin)
    command = (hook_input.get("tool_input") or {}).get("command") or ""
    if "gh" not in command:
        return

    text, heredocs = split_heredocs(command)
    try:
        commands = split_commands(text)
    except ValueError:
        if re.search(r"\bgh\b.*\bpr\s+(create|new)\b", text):
            block("could not parse this command, so its `gh pr create` can't be checked. Close its quotes.")
        return

    directory = hook_input.get("cwd") or os.getcwd()
    for tokens in commands:
        if tokens[0] == "cd" and len(tokens) > 1:
            directory = os.path.join(directory, os.path.expanduser(tokens[1]))
        args = pr_create_args(tokens)
        if args is not None and "--help" not in args and "-h" not in args:
            check(args, directory, heredocs)


main()
