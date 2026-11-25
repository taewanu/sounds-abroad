import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, expect, test } from 'vitest';

const ROOT = path.resolve(__dirname, '..');

type Diagnostic = { code: string; labels: { span: { line: number } }[] };

const fixtureDirs: string[] = [];

function runLinter(args: string[]): string {
  const run = spawnSync('pnpm', ['exec', 'vp', 'lint', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (run.error || (run.status !== 0 && run.status !== 1)) {
    throw new Error(`vp lint ${args.join(' ')} exited ${run.status}: ${run.stderr}`, {
      cause: run.error,
    });
  }
  return run.stdout.slice(run.stdout.indexOf('{'));
}

function lint(file: string): Diagnostic[] {
  const output = runLinter(['--format', 'json', file]);
  const report = JSON.parse(output) as { diagnostics?: Diagnostic[] };
  if (!Array.isArray(report.diagnostics)) {
    throw new Error(`vp lint printed no diagnostics array: ${output.slice(0, 200)}`);
  }
  return report.diagnostics;
}

function lintSource(rule: string, lines: string[]): number[] {
  const dir = mkdtempSync(path.join(ROOT, 'src', 'lint-fixture-'));
  fixtureDirs.push(dir);
  const file = path.join(dir, 'fixture.tsx');
  writeFileSync(file, `${lines.join('\n')}\n`);
  return lint(file)
    .filter((d) => d.code === `sounds-abroad(${rule})`)
    .map((d) => d.labels[0].span.line);
}

afterEach(() => {
  for (const dir of fixtureDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
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

  const config = JSON.parse(runLinter(['--print-config', exempt])) as {
    overrides: { files: string[]; rules: Record<string, string> }[];
  };
  const verdicts = config.overrides
    .filter((o) => o.files.includes(exempt) && 'sounds-abroad/no-bare-escape' in o.rules)
    .map((o) => o.rules['sounds-abroad/no-bare-escape']);

  expect(verdicts).toEqual(['allow']);
});
