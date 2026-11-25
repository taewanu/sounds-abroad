import { RuleTester } from 'vite-plus/lint/plugins-dev';
import { describe, expect, test } from 'vitest';

import config from '../vite.config';
import plugin from './lint-plugin';

RuleTester.describe = describe;
RuleTester.it = test;

const tester = new RuleTester();

function ruleNamed(name: string) {
  const rule = plugin.rules[name];
  if (!rule) throw new Error(`${name} is not registered`);
  return rule;
}

describe('no-transition-all', () => {
  tester.run('no-transition-all', ruleNamed('no-transition-all'), {
    valid: [
      "const a = 'transition-colors';",
      "const b = 'transition-[color,background-color]';",
      "const c = 'transition-allowed';",
    ],
    invalid: [
      {
        code: "const a = 'transition-all duration-200';",
        errors: [{ messageId: 'transitionAll' }],
      },
      {
        code: "const b = <div className='p-2 transition-all' />;",
        filename: 'view.tsx',
        errors: [{ messageId: 'transitionAll' }],
      },
      { code: 'const c = `p-2 transition-all ${a}`;', errors: [{ messageId: 'transitionAll' }] },
    ],
  });
});

describe('no-bare-escape', () => {
  tester.run('no-bare-escape', ruleNamed('no-bare-escape'), {
    valid: [
      "const a = (k) => k === 'Enter';",
      "const b = (k) => { switch (k) { case 'Enter': return 1; default: return 0; } };",
      "const c = 'Escape';",
      "const d = (k) => k === 'Escape key';",
    ],
    invalid: [
      { code: "const a = (k) => k === 'Escape';", errors: [{ messageId: 'bareEscape' }] },
      { code: "const b = (k) => 'Escape' === k;", errors: [{ messageId: 'bareEscape' }] },
      { code: "const c = (k) => k == 'Escape';", errors: [{ messageId: 'bareEscape' }] },
      { code: "const d = (k) => k !== 'Escape';", errors: [{ messageId: 'bareEscape' }] },
      {
        code: "const e = (k) => { switch (k) { case 'Escape': return 1; default: return 0; } };",
        errors: [{ messageId: 'bareEscape' }],
      },
    ],
  });
});

test('the config enables both rules on src and exempts the escape layer from no-bare-escape', () => {
  const overrides = config.lint?.overrides ?? [];
  const severityFor = (file: string, rule: string) =>
    overrides
      .filter((o) => o.files.includes(file) && o.rules && rule in o.rules)
      .map((o) => o.rules?.[rule])
      .at(-1);

  expect(severityFor('src/**/*.{ts,tsx}', 'sounds-abroad/no-transition-all')).toBe('error');
  expect(severityFor('src/**/*.{ts,tsx}', 'sounds-abroad/no-bare-escape')).toBe('error');
  expect(severityFor('src/components/use-escape-layer.ts', 'sounds-abroad/no-bare-escape')).toBe(
    'off',
  );
});
