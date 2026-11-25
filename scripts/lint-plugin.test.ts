import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, expect, test } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const FIXTURE_DIR = path.join(ROOT, 'src', 'lint-plugin-fixture');

type Diagnostic = { code: string; labels: { span: { line: number } }[] };

const lint = (file: string): Diagnostic[] => {
  const run = spawnSync('pnpm', ['exec', 'vp', 'lint', '--format', 'json', file], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const start = run.stdout.indexOf('{');
  return (JSON.parse(run.stdout.slice(start)) as { diagnostics: Diagnostic[] }).diagnostics;
};

// Lines (1-based) on which `rule` fired.
const linesFor = (diagnostics: Diagnostic[], rule: string) =>
  diagnostics.filter((d) => d.code === `sounds-abroad(${rule})`).map((d) => d.labels[0].span.line);

// Writes one fixture per source and returns the lines the rule flagged.
const lintSource = (rule: string, lines: string[]) => {
  mkdirSync(FIXTURE_DIR, { recursive: true });
  const file = path.join(FIXTURE_DIR, 'fixture.tsx');
  writeFileSync(file, `${lines.join('\n')}\n`);
  return linesFor(lint(file), rule);
};

afterEach(() => {
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

test('no-transition-all reports the class in a string, a JSX attribute, and a template literal', () => {
  const flagged = [
    "export const a = 'transition-all duration-200';",
    "export const b = <div className='p-2 transition-all' />;",
    'export const c = `p-2 transition-all ${a}`;',
  ];

  const lines = lintSource('no-transition-all', flagged);

  expect(lines).toEqual(flagged.map((_, i) => i + 1));
});

test('no-transition-all leaves other transition classes alone', () => {
  const allowed = [
    "export const a = 'transition-colors';",
    "export const b = 'transition-[color,background-color]';",
    "export const c = 'transition-allowed';",
  ];

  const lines = lintSource('no-transition-all', allowed);

  expect(lines).toEqual([]);
});

test('no-bare-escape reports the literal in strict and loose comparisons, either operand order, and a case', () => {
  const flagged = [
    "export const a = (k: string) => k === 'Escape';",
    "export const b = (k: string) => 'Escape' === k;",
    "export const c = (k: string) => k == 'Escape';",
    "export const d = (k: string) => k !== 'Escape';",
    "export const e = (k: string) => { switch (k) { case 'Escape': return 1; default: return 0; } };",
  ];

  const lines = lintSource('no-bare-escape', flagged);

  expect(lines).toEqual(flagged.map((_, i) => i + 1));
});

test('no-bare-escape leaves other keys and non-comparison uses alone', () => {
  const allowed = [
    "export const a = (k: string) => k === 'Enter';",
    "export const b = (k: string) => { switch (k) { case 'Enter': return 1; default: return 0; } };",
    "export const c = 'Escape';",
    "export const d = (k: string) => k === 'Escape key';",
  ];

  const lines = lintSource('no-bare-escape', allowed);

  expect(lines).toEqual([]);
});

test('no-bare-escape is switched off for the one file that implements the escape layer', () => {
  const exempt = 'src/components/use-escape-layer.ts';

  const run = spawnSync('pnpm', ['exec', 'vp', 'lint', '--print-config', exempt], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  const config = JSON.parse(run.stdout.slice(run.stdout.indexOf('{'))) as {
    overrides: { files: string[]; rules: Record<string, string> }[];
  };
  const verdicts = config.overrides
    .filter((o) => o.files.includes(exempt) && 'sounds-abroad/no-bare-escape' in o.rules)
    .map((o) => o.rules['sounds-abroad/no-bare-escape']);

  expect(verdicts).toEqual(['allow']);
});
