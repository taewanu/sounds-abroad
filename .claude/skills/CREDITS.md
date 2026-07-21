# Credits

Some skills in this directory are vendored from:

https://github.com/mattpocock/skills

Vendored skills (used under the MIT License reproduced below):

- diagnosing-bugs
- domain-modeling
- git-guardrails-claude-code
- grill-with-docs
- grilling
- handoff
- implement
- improve-codebase-architecture
- prototype
- setup-pre-commit
- tdd
- to-spec
- to-tickets
- triage

Three deliberate departures from upstream, so a sync diff isn't mistaken for drift:

- `to-spec` publishes without a triage label. Upstream applies `ready-for-agent`
  directly; this repo classifies via `/triage` first.
- `domain-modeling/ADR-FORMAT.md` carries this repo's ADR template. Upstream's is
  a title plus one paragraph, which no ADR in `docs/adr/` looks like.
- Each skill's `agents/openai.yaml` is dropped. It is Codex picker metadata,
  inert under Claude Code.

Everything else is byte-identical to upstream, kept that way by the
`.claude/skills` entry in `.prettierignore`.

---

MIT License

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
